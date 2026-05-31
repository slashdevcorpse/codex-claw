import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isSupportedCodexImageMimeType,
  resolveCodexSession,
  sendCodexPrompt,
} from '../../server/codex-cli'
import { buildRepositoryContextPrompt } from '../../server/repo-context'
import type { RepoContextSelection } from '../../server/repo-context'

type ParsedAttachment = {
  mimeType: string
  content: string
  name?: string
}

type AttachmentParseResult =
  | {
      ok: true
      attachments: Array<ParsedAttachment> | undefined
    }
  | {
      ok: false
      error: string
    }

function parseContextSelections(rawSelections: unknown) {
  if (typeof rawSelections === 'undefined') return []
  if (!Array.isArray(rawSelections)) return []

  const selections: Array<RepoContextSelection> = []
  for (const rawSelection of rawSelections.slice(0, 50)) {
    if (!rawSelection || typeof rawSelection !== 'object') continue
    const selection = rawSelection as Record<string, unknown>
    const selectedPath =
      typeof selection.path === 'string' ? selection.path.trim() : ''
    if (!selectedPath) continue
    selections.push({
      path: selectedPath,
      type:
        selection.type === 'directory' || selection.type === 'file'
          ? selection.type
          : undefined,
    })
  }
  return selections
}

function parseAttachments(rawAttachments: unknown): AttachmentParseResult {
  if (typeof rawAttachments === 'undefined') {
    return { ok: true, attachments: undefined }
  }

  if (!Array.isArray(rawAttachments)) {
    return { ok: false, error: 'attachments must be an array' }
  }

  const attachments: Array<ParsedAttachment> = []

  for (const rawAttachment of rawAttachments) {
    if (!rawAttachment || typeof rawAttachment !== 'object') {
      return { ok: false, error: 'attachment must be an object' }
    }

    const attachment = rawAttachment as Record<string, unknown>
    const mimeType =
      typeof attachment.mimeType === 'string' ? attachment.mimeType.trim() : ''
    const rawContent =
      typeof attachment.content === 'string' ? attachment.content : ''
    const content = normalizeBase64Content(rawContent)

    if (!isSupportedCodexImageMimeType(mimeType)) {
      return {
        ok: false,
        error:
          'Unsupported attachment type. Please use PNG, JPG, GIF, or WebP images.',
      }
    }

    if (!isValidBase64Content(content)) {
      return {
        ok: false,
        error: 'Attachment image data could not be decoded.',
      }
    }

    attachments.push({
      mimeType,
      content,
      name: typeof attachment.name === 'string' ? attachment.name : undefined,
    })
  }

  return { ok: true, attachments }
}

function normalizeBase64Content(content: string) {
  const trimmed = content.trim()
  const dataUrlMatch = /^data:[^,]+;base64,(?<data>[\s\S]+)$/i.exec(trimmed)
  return (dataUrlMatch?.groups?.data ?? trimmed).replace(/\s/g, '')
}

function isValidBase64Content(content: string) {
  if (!content) return false
  if (content.length % 4 === 1) return false
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return false
  return Buffer.from(content, 'base64').length > 0
}

export const Route = createFileRoute('/api/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >

          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const friendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const message = String(body.message ?? '')
          const thinking =
            typeof body.thinking === 'string' ? body.thinking : undefined

          const parsedAttachments = parseAttachments(body.attachments)
          if (!parsedAttachments.ok) {
            return json(
              { ok: false, error: parsedAttachments.error },
              { status: 400 },
            )
          }
          const attachments = parsedAttachments.attachments
          const contextSelections = parseContextSelections(
            body.contextSelections,
          )
          const contextBlock =
            contextSelections.length > 0
              ? buildRepositoryContextPrompt(contextSelections)
              : undefined

          if (
            !message.trim() &&
            (!attachments || attachments.length === 0) &&
            !contextBlock
          ) {
            return json(
              { ok: false, error: 'message required' },
              { status: 400 },
            )
          }

          let sessionKey = rawSessionKey.length > 0 ? rawSessionKey : ''

          if (!sessionKey && friendlyId) {
            const resolved = await resolveCodexSession(friendlyId)
            const resolvedKey =
              typeof resolved.key === 'string' ? resolved.key.trim() : ''
            if (resolvedKey.length === 0) {
              return json(
                { ok: false, error: 'session not found' },
                { status: 404 },
              )
            }
            sessionKey = resolvedKey
          }

          if (sessionKey.length === 0) {
            sessionKey = 'main'
          }

          const res = await sendCodexPrompt({
            sessionKey,
            message,
            thinking,
            attachments,
            contextBlock,
            idempotencyKey:
              typeof body.idempotencyKey === 'string'
                ? body.idempotencyKey
                : randomUUID(),
          })

          return json({ ok: true, ...res, sessionKey })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
