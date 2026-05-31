import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  deleteCodexSession,
  listCodexSessions,
  patchCodexSession,
  resolveCodexSession,
} from '../../server/codex-cli'

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url)
          return json(
            await listCodexSessions({
              query: url.searchParams.get('q') ?? undefined,
              filter: url.searchParams.get('filter') ?? undefined,
              tag: url.searchParams.get('tag') ?? undefined,
              includeArchived:
                url.searchParams.get('includeArchived') === '1' ||
                url.searchParams.get('includeArchived') === 'true',
            }),
          )
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined
          const friendlyId = randomUUID()
          const payload = await patchCodexSession({ key: friendlyId, label })

          return json({
            ok: true,
            sessionKey: payload.key,
            friendlyId,
            entry: payload.entry,
          })
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
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const rawFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined
          const tags = Array.isArray(body.tags)
            ? body.tags.filter((tag): tag is string => typeof tag === 'string')
            : undefined
          const archived =
            typeof body.archived === 'boolean' ? body.archived : undefined
          let sessionKey = rawSessionKey

          if (!sessionKey && rawFriendlyId) {
            const resolved = await resolveCodexSession(rawFriendlyId)
            if (typeof resolved.key === 'string') sessionKey = resolved.key
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          const payload = await patchCodexSession({
            key: sessionKey,
            label,
            tags,
            archived,
          })
          return json({
            ok: true,
            sessionKey: payload.key,
            entry: payload.entry,
          })
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
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const rawSessionKey = url.searchParams.get('sessionKey') ?? ''
          const rawFriendlyId = url.searchParams.get('friendlyId') ?? ''
          let sessionKey = rawSessionKey.trim()

          if (!sessionKey && rawFriendlyId.trim()) {
            const resolved = await resolveCodexSession(rawFriendlyId.trim())
            if (typeof resolved.key === 'string') sessionKey = resolved.key
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          await deleteCodexSession(sessionKey)
          return json({ ok: true, sessionKey })
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
