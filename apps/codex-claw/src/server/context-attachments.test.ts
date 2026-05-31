import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'

import {
  buildContextAttachmentPrompt,
  parseContextAttachments,
  previewContextAttachment,
  previewDocumentContextAttachment,
} from './context-attachments'

function base64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64')
}

describe('context attachments', function () {
  it('previews an explicit URL fetch without sending it directly', async function () {
    const fetcher = function fetchPreview() {
      return Promise.resolve(
        new Response(
          '<html><head><title>Bug report</title></head><body><h1>Issue</h1><p>Expected behavior</p><script >ignored()</script ></body></html>',
          {
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          },
        ),
      )
    }

    const preview = await previewContextAttachment(
      { kind: 'url', url: 'https://example.com/bug-report' },
      fetcher,
    )

    expect(preview.kind).toBe('url')
    expect(preview.title).toBe('Bug report')
    expect(preview.source).toBe('https://example.com/bug-report')
    expect(preview.text).toContain('Expected behavior')
    expect(preview.text).not.toContain('ignored()')
  })

  it('rejects unsupported URL protocols', async function () {
    await expect(
      previewContextAttachment({ kind: 'url', url: 'file:///etc/passwd' }),
    ).rejects.toThrow(/http and https/)
  })

  it('previews markdown and JSON documents from base64 content', function () {
    const markdownPreview = previewDocumentContextAttachment({
      kind: 'document',
      name: 'handoff.md',
      mimeType: 'text/markdown',
      content: base64('# Handoff\n\nUse this context.'),
    })
    const jsonPreview = previewDocumentContextAttachment({
      kind: 'document',
      name: 'payload.json',
      mimeType: 'application/json',
      content: base64('{"ok":true}'),
    })

    expect(markdownPreview.title).toBe('handoff')
    expect(markdownPreview.text).toContain('Use this context.')
    expect(jsonPreview.text).toContain('"ok": true')
  })

  it('extracts readable text from a small text-based PDF', function () {
    const pdf = [
      '%PDF-1.4',
      '1 0 obj',
      '<< /Type /Page >>',
      'stream',
      'BT',
      '/F1 12 Tf',
      '72 720 Td',
      '(Alpha PDF context) Tj',
      'ET',
      'endstream',
      'endobj',
      '%%EOF',
    ].join('\n')

    const preview = previewDocumentContextAttachment({
      kind: 'document',
      name: 'alpha.pdf',
      mimeType: 'application/pdf',
      content: base64(pdf),
    })

    expect(preview.mimeType).toBe('application/pdf')
    expect(preview.text).toContain('Alpha PDF context')
  })

  it('parses reviewed attachments and builds a bounded prompt block', function () {
    const preview = previewDocumentContextAttachment({
      kind: 'document',
      name: 'notes.txt',
      mimeType: 'text/plain',
      content: base64('Reviewed context only.'),
    })
    const parsed = parseContextAttachments([preview])

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const prompt = buildContextAttachmentPrompt(parsed.attachments)
    expect(prompt).toContain('URL and document context selected in CodexClaw')
    expect(prompt).toContain('notes')
    expect(prompt).toContain('Reviewed context only.')
  })
})
