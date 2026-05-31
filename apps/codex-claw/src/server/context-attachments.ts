import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

export type ContextAttachmentKind = 'url' | 'document'

export type ContextAttachmentPreview = {
  id: string
  kind: ContextAttachmentKind
  title: string
  source: string
  mimeType: string
  sizeBytes: number
  estimatedTokens: number
  text: string
  truncated: boolean
}

export type ContextAttachmentParseResult =
  | {
      ok: true
      attachments: Array<ContextAttachmentPreview>
    }
  | {
      ok: false
      error: string
    }

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const maxAttachmentCount = 6
const maxPreviewChars = 24000
const maxTotalContextChars = 48000
const maxFetchBytes = 256 * 1024
const maxDocumentBytes = 256 * 1024
const maxPdfBytes = 512 * 1024

const allowedDocumentMimes = new Set([
  'application/json',
  'application/pdf',
  'text/markdown',
  'text/plain',
])

const allowedFetchMimes = new Set([
  'application/atom+xml',
  'application/javascript',
  'application/json',
  'application/rss+xml',
  'application/xhtml+xml',
  'application/xml',
  'application/x-ndjson',
])

function cleanTitle(value: string) {
  return Array.from(normalizeWhitespace(value))
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .slice(0, 140)
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4)
}

function truncatePreviewText(text: string) {
  const normalized = normalizeText(text)
  if (normalized.length <= maxPreviewChars) {
    return { text: normalized, truncated: false }
  }
  return {
    text: normalized.slice(0, maxPreviewChars).trimEnd() + '\n[truncated]',
    truncated: true,
  }
}

function basePreview(input: {
  id?: string
  kind: ContextAttachmentKind
  title: string
  source: string
  mimeType: string
  sizeBytes: number
  text: string
}): ContextAttachmentPreview {
  const preview = truncatePreviewText(input.text)
  const title = cleanTitle(input.title) || cleanTitle(input.source) || 'Context'
  return {
    id: cleanTitle(input.id ?? '') || randomUUID(),
    kind: input.kind,
    title,
    source: input.source,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    estimatedTokens: estimateTokens(preview.text),
    text: preview.text,
    truncated: preview.truncated,
  }
}

function mimeBase(value: string) {
  return value.split(';')[0]?.trim().toLowerCase() ?? ''
}

function inferDocumentMimeType(name: string, mimeType: string) {
  const normalized = mimeBase(mimeType)
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized
  }

  const extension = path.extname(name).toLowerCase()
  if (extension === '.json') return 'application/json'
  if (extension === '.md' || extension === '.markdown') return 'text/markdown'
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.txt' || extension === '.log') return 'text/plain'
  return normalized
}

function allowedFetchMime(mimeType: string) {
  const normalized = mimeBase(mimeType)
  if (!normalized) return true
  return normalized.startsWith('text/') || allowedFetchMimes.has(normalized)
}

function allowedDocumentMime(mimeType: string) {
  const normalized = mimeBase(mimeType)
  return normalized.startsWith('text/') || allowedDocumentMimes.has(normalized)
}

function titleFromUrl(url: URL) {
  const pathname = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const decoded = pathname ? decodeURIComponent(pathname) : ''
  return cleanTitle(decoded.replace(/[-_]+/g, ' ')) || url.hostname
}

function titleFromDocument(name: string) {
  const base = path.basename(name).replace(/\.[^.]+$/, '')
  return cleanTitle(base.replace(/[-_]+/g, ' ')) || 'Document context'
}

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi,
    (_match, entity: string) => {
      const normalized = entity.toLowerCase()
      if (normalized === 'amp') return '&'
      if (normalized === 'apos') return "'"
      if (normalized === 'gt') return '>'
      if (normalized === 'lt') return '<'
      if (normalized === 'nbsp') return ' '
      if (normalized === 'quot') return '"'
      if (normalized.startsWith('#x')) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16))
      }
      if (normalized.startsWith('#')) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10))
      }
      return ''
    },
  )
}

function extractHtmlTitle(html: string) {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  if (titleMatch?.[1]) return cleanTitle(decodeHtmlEntities(titleMatch[1]))
  const headingMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  if (headingMatch?.[1]) {
    return cleanTitle(
      decodeHtmlEntities(headingMatch[1].replace(/<[^>]+>/g, ' ')),
    )
  }
  return ''
}

function extractHtmlText(html: string) {
  return normalizeText(
    decodeHtmlEntities(
      html
        .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
        .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
        .replace(
          /<\/(p|div|section|article|header|footer|li|tr|h[1-6])>/gi,
          '\n',
        )
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ),
  )
}

function extractTextByMime(text: string, mimeType: string) {
  const normalizedMime = mimeBase(mimeType)
  if (normalizedMime === 'application/json') {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }
  if (
    normalizedMime === 'text/html' ||
    normalizedMime === 'application/xhtml+xml'
  ) {
    return extractHtmlText(text)
  }
  return normalizeText(text)
}

function decodeBase64Content(content: string) {
  const trimmed = content.trim()
  const dataUrlMatch = /^data:[^,]+;base64,(?<data>[\s\S]+)$/i.exec(trimmed)
  const base64 = (dataUrlMatch?.groups?.data ?? trimmed).replace(/\s/g, '')
  if (!base64 || base64.length % 4 === 1) {
    throw new Error('Document content could not be decoded.')
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error('Document content could not be decoded.')
  }
  return Buffer.from(base64, 'base64')
}

function decodePdfString(value: string) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_match, escaped: string) => {
      if (escaped === 'n') return '\n'
      if (escaped === 'r') return '\n'
      if (escaped === 't') return ' '
      if (escaped === 'b' || escaped === 'f') return ''
      return escaped
    })
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) =>
      String.fromCharCode(Number.parseInt(octal, 8)),
    )
}

function extractPdfText(buffer: Buffer) {
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('PDF context must be a valid PDF file.')
  }

  const source = buffer.toString('latin1')
  const matches = source.match(/\((?:\\.|[^\\()]){2,}\)/g) ?? []
  const text = matches
    .map((match) => decodePdfString(match.slice(1, -1)))
    .map((value) => normalizeWhitespace(value))
    .filter((value) => /[a-z0-9]/i.test(value))
    .join('\n')

  if (!text) {
    throw new Error(
      'PDF text could not be extracted safely. Try a smaller text-based PDF or convert it to markdown/text.',
    )
  }
  return text
}

function documentText(buffer: Buffer, mimeType: string) {
  const normalizedMime = mimeBase(mimeType)
  if (normalizedMime === 'application/pdf') {
    return extractPdfText(buffer)
  }

  if (buffer.includes(0)) {
    throw new Error(
      'Document appears to be binary. Use markdown, text, JSON, or a small text-based PDF.',
    )
  }

  return extractTextByMime(buffer.toString('utf8'), normalizedMime)
}

async function readResponseBytesLimited(response: Response) {
  const contentLength = response.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxFetchBytes) {
    throw new Error(
      'URL response is too large. Attach a smaller page or document.',
    )
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > maxFetchBytes) {
      throw new Error(
        'URL response is too large. Attach a smaller page or document.',
      )
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Array<Buffer> = []
  let size = 0
  for (;;) {
    const result = await reader.read()
    if (result.done) break
    const chunk = Buffer.from(result.value)
    size += chunk.length
    if (size > maxFetchBytes) {
      throw new Error(
        'URL response is too large. Attach a smaller page or document.',
      )
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function previewUrlContextAttachment(
  rawInput: Record<string, unknown>,
  fetcher: Fetcher = fetch,
): Promise<ContextAttachmentPreview> {
  const rawUrl = typeof rawInput.url === 'string' ? rawInput.url.trim() : ''
  if (!rawUrl) throw new Error('Enter a URL before fetching context.')

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('URL context must be a valid http or https URL.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL context only supports http and https links.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  let response: Response
  try {
    response = await fetcher(url.toString(), {
      headers: {
        accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.1',
        'user-agent': 'CodexClaw/0.1 context-preview',
      },
      redirect: 'follow',
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('URL preview timed out. Try a faster or smaller page.')
    }
    throw new Error(
      'URL preview failed: ' +
        (err instanceof Error ? err.message : String(err)),
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error('URL preview failed with HTTP ' + response.status + '.')
  }

  const mimeType = mimeBase(response.headers.get('content-type') ?? '')
  if (!allowedFetchMime(mimeType)) {
    throw new Error(
      'URL response type is not supported. Use a text, HTML, JSON, or XML page.',
    )
  }

  const buffer = await readResponseBytesLimited(response)
  if (buffer.includes(0)) {
    throw new Error(
      'URL response appears to be binary. Use a text, HTML, JSON, or XML page.',
    )
  }

  const rawText = buffer.toString('utf8')
  const title =
    mimeType === 'text/html' || mimeType === 'application/xhtml+xml'
      ? extractHtmlTitle(rawText) || titleFromUrl(url)
      : titleFromUrl(url)
  const text = extractTextByMime(rawText, mimeType)
  if (!text) {
    throw new Error('URL preview did not contain readable text.')
  }

  return basePreview({
    id: typeof rawInput.id === 'string' ? rawInput.id : undefined,
    kind: 'url',
    title,
    source: url.toString(),
    mimeType: mimeType || 'text/plain',
    sizeBytes: buffer.length,
    text,
  })
}

export function previewDocumentContextAttachment(
  rawInput: Record<string, unknown>,
): ContextAttachmentPreview {
  const name = typeof rawInput.name === 'string' ? rawInput.name.trim() : ''
  const content =
    typeof rawInput.content === 'string' ? rawInput.content.trim() : ''
  const mimeType = inferDocumentMimeType(
    name,
    typeof rawInput.mimeType === 'string' ? rawInput.mimeType : '',
  )

  if (!name) throw new Error('Choose a document before previewing context.')
  if (!content) throw new Error('Document content could not be decoded.')
  if (!allowedDocumentMime(mimeType)) {
    throw new Error(
      'Document type is not supported. Use markdown, text, JSON, or a small text-based PDF.',
    )
  }

  const buffer = decodeBase64Content(content)
  const sizeLimit =
    mimeType === 'application/pdf' ? maxPdfBytes : maxDocumentBytes
  if (buffer.length > sizeLimit) {
    throw new Error(
      'Document is too large. Use a smaller file for prompt context.',
    )
  }

  const text = documentText(buffer, mimeType)
  if (!text) {
    throw new Error('Document preview did not contain readable text.')
  }

  return basePreview({
    id: typeof rawInput.id === 'string' ? rawInput.id : undefined,
    kind: 'document',
    title: titleFromDocument(name),
    source: name,
    mimeType,
    sizeBytes: buffer.length,
    text,
  })
}

export async function previewContextAttachment(
  rawInput: unknown,
  fetcher: Fetcher = fetch,
): Promise<ContextAttachmentPreview> {
  if (!rawInput || typeof rawInput !== 'object') {
    throw new Error('Context attachment preview requires an object payload.')
  }
  const input = rawInput as Record<string, unknown>
  const kind = typeof input.kind === 'string' ? input.kind : ''
  if (kind === 'url') return previewUrlContextAttachment(input, fetcher)
  if (kind === 'document') return previewDocumentContextAttachment(input)
  throw new Error('Context attachment type must be url or document.')
}

export function parseContextAttachments(
  rawAttachments: unknown,
): ContextAttachmentParseResult {
  if (typeof rawAttachments === 'undefined') {
    return { ok: true, attachments: [] }
  }
  if (!Array.isArray(rawAttachments)) {
    return { ok: false, error: 'contextAttachments must be an array' }
  }
  if (rawAttachments.length > maxAttachmentCount) {
    return {
      ok: false,
      error: 'Too many context attachments. Send six or fewer at once.',
    }
  }

  let totalChars = 0
  const attachments: Array<ContextAttachmentPreview> = []
  for (const rawAttachment of rawAttachments) {
    if (!rawAttachment || typeof rawAttachment !== 'object') {
      return { ok: false, error: 'context attachment must be an object' }
    }
    const attachment = rawAttachment as Record<string, unknown>
    const kind =
      attachment.kind === 'url'
        ? 'url'
        : attachment.kind === 'document'
          ? 'document'
          : null
    const text =
      typeof attachment.text === 'string' ? normalizeText(attachment.text) : ''
    const source =
      typeof attachment.source === 'string' ? attachment.source.trim() : ''
    const title =
      typeof attachment.title === 'string' ? cleanTitle(attachment.title) : ''
    const mimeType =
      typeof attachment.mimeType === 'string'
        ? mimeBase(attachment.mimeType)
        : ''
    const sizeBytes =
      typeof attachment.sizeBytes === 'number' &&
      Number.isFinite(attachment.sizeBytes)
        ? Math.max(0, Math.floor(attachment.sizeBytes))
        : 0

    if (!kind || !title || !source || !mimeType || !text) {
      return {
        ok: false,
        error:
          'Context attachment preview is incomplete. Preview it again before sending.',
      }
    }
    if (text.length > maxPreviewChars + 20) {
      return {
        ok: false,
        error:
          'Context attachment is too large. Preview a smaller source before sending.',
      }
    }

    totalChars += text.length
    if (totalChars > maxTotalContextChars) {
      return {
        ok: false,
        error: 'Context attachments are too large. Remove one before sending.',
      }
    }

    attachments.push({
      id:
        typeof attachment.id === 'string' && attachment.id.trim()
          ? cleanTitle(attachment.id)
          : randomUUID(),
      kind,
      title,
      source,
      mimeType,
      sizeBytes,
      estimatedTokens:
        typeof attachment.estimatedTokens === 'number' &&
        Number.isFinite(attachment.estimatedTokens)
          ? Math.max(0, Math.floor(attachment.estimatedTokens))
          : estimateTokens(text),
      text,
      truncated: attachment.truncated === true,
    })
  }

  return { ok: true, attachments }
}

export function buildContextAttachmentPrompt(
  attachments: Array<ContextAttachmentPreview>,
) {
  if (attachments.length === 0) return ''

  const blocks = attachments.map((attachment, index) => {
    return [
      '--- Context attachment ' +
        String(index + 1) +
        ': ' +
        attachment.title +
        ' ---',
      'Source: ' + attachment.source,
      'Type: ' + attachment.mimeType,
      'Size: ' + String(attachment.sizeBytes) + ' bytes',
      'Estimated context: ' + String(attachment.estimatedTokens) + ' tokens',
      attachment.truncated ? 'Preview was truncated before send.' : '',
      '',
      attachment.text,
    ]
      .filter((line) => line.length > 0)
      .join('\n')
  })

  return [
    'URL and document context selected in CodexClaw:',
    'Attached items: ' +
      attachments
        .map((attachment) => attachment.title + ' <' + attachment.source + '>')
        .join(', '),
    ...blocks,
  ].join('\n\n')
}
