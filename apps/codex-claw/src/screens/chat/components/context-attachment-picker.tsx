import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  FileAttachmentIcon,
  FileUploadIcon,
  LinkSquare01Icon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'

import { previewContextAttachment } from '../chat-queries'
import type { ContextAttachment } from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ContextAttachmentSummaryProps = {
  attachments: Array<ContextAttachment>
  onRemove: (id: string) => void
}

type ContextAttachmentPanelProps = {
  open: boolean
  attachments: Array<ContextAttachment>
  onAttachmentsChange: (attachments: Array<ContextAttachment>) => void
}

const maxAttachmentCount = 6
const acceptedDocumentTypes =
  '.md,.markdown,.txt,.json,.pdf,text/markdown,text/plain,application/json,application/pdf'

function formatBytes(bytes: number) {
  if (bytes < 1024) return String(bytes) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function attachmentIcon(attachment: ContextAttachment) {
  return attachment.kind === 'url' ? LinkSquare01Icon : FileAttachmentIcon
}

function attachmentKey(attachment: ContextAttachment) {
  return attachment.id
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Document could not be read.'))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      const data = value.includes(',')
        ? value.slice(value.indexOf(',') + 1)
        : value
      if (!data) {
        reject(new Error('Document could not be read.'))
        return
      }
      resolve(data)
    }
    reader.readAsDataURL(file)
  })
}

function ContextAttachmentPreview({
  attachment,
  action,
}: {
  attachment: ContextAttachment
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-primary-200 bg-surface p-3">
      <div className="flex min-w-0 items-start gap-2">
        <HugeiconsIcon
          icon={attachmentIcon(attachment)}
          size={20}
          strokeWidth={1.5}
          className="mt-0.5 shrink-0 text-primary-500"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-[450] text-primary-950">
            {attachment.title}
          </div>
          <div className="truncate text-xs text-primary-500">
            {attachment.source}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs tabular-nums text-primary-500">
            <span>{formatBytes(attachment.sizeBytes)}</span>
            <span>{attachment.estimatedTokens.toLocaleString()} tokens</span>
            <span>{attachment.mimeType}</span>
            {attachment.truncated ? (
              <span className="text-amber-700">truncated</span>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-primary-600">
        {attachment.text}
      </div>
    </div>
  )
}

export function ContextAttachmentSummary({
  attachments,
  onRemove,
}: ContextAttachmentSummaryProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4">
      {attachments.map((attachment) => (
        <span
          key={attachmentKey(attachment)}
          className="inline-flex max-w-[260px] items-center gap-1 rounded-md border border-primary-200 bg-primary-100 px-2 py-1 text-xs text-primary-700"
        >
          <HugeiconsIcon
            icon={attachmentIcon(attachment)}
            size={13}
            strokeWidth={1.5}
            className="shrink-0"
          />
          <span className="truncate">{attachment.title}</span>
          <span className="shrink-0 tabular-nums text-primary-500">
            {attachment.estimatedTokens.toLocaleString()}
          </span>
          <button
            type="button"
            className="rounded text-primary-500 hover:text-primary-900"
            onClick={() => onRemove(attachment.id)}
            aria-label={'Remove context ' + attachment.title}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.5} />
          </button>
        </span>
      ))}
    </div>
  )
}

export function ContextAttachmentPanel({
  open,
  attachments,
  onAttachmentsChange,
}: ContextAttachmentPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState<ContextAttachment | null>(null)
  const [loading, setLoading] = useState<'url' | 'document' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const atLimit = attachments.length >= maxAttachmentCount

  async function handleUrlPreview() {
    const nextUrl = url.trim()
    if (!nextUrl || loading) return
    setLoading('url')
    setError(null)
    setDraft(null)
    try {
      setDraft(await previewContextAttachment({ kind: 'url', url: nextUrl }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  async function handleDocumentChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || loading) return
    setLoading('document')
    setError(null)
    setDraft(null)
    try {
      const content = await fileToBase64(file)
      setDraft(
        await previewContextAttachment({
          kind: 'document',
          name: file.name,
          mimeType: file.type,
          content,
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(null)
    }
  }

  function addDraft() {
    if (!draft || atLimit) return
    onAttachmentsChange([...attachments, draft])
    setDraft(null)
    if (draft.kind === 'url') setUrl('')
  }

  if (!open) return null

  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary-200 bg-primary-50 shadow-sm">
      <div className="border-b border-primary-200 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <HugeiconsIcon
            icon={LinkSquare01Icon}
            size={20}
            strokeWidth={1.5}
            className="text-primary-500"
          />
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void handleUrlPreview()
              }
            }}
            placeholder="https://example.com/reference"
            size="sm"
            className="min-w-[220px] flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void handleUrlPreview()}
            disabled={loading !== null || !url.trim()}
          >
            {loading === 'url' ? 'Previewing...' : 'Preview'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedDocumentTypes}
            onChange={(event) => void handleDocumentChange(event)}
            className="hidden"
            aria-hidden="true"
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading !== null}
          >
            <HugeiconsIcon icon={FileUploadIcon} size={20} strokeWidth={1.5} />
            {loading === 'document' ? 'Reading...' : 'Document'}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs tabular-nums text-primary-500">
          <span>
            {attachments.length} / {maxAttachmentCount} attached
          </span>
          <span>markdown, text, JSON, PDF</span>
        </div>
      </div>

      {error ? <div className="p-3 text-sm text-red-600">{error}</div> : null}
      {atLimit ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Remove a context attachment before adding another.
        </div>
      ) : null}

      <div className="space-y-2 p-3">
        {draft ? (
          <ContextAttachmentPreview
            attachment={draft}
            action={
              <Button
                type="button"
                size="sm"
                variant="default"
                onClick={addDraft}
                disabled={atLimit}
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  size={20}
                  strokeWidth={1.5}
                />
                Add context
              </Button>
            }
          />
        ) : null}
        {attachments.map((attachment) => (
          <ContextAttachmentPreview
            key={attachmentKey(attachment)}
            attachment={attachment}
            action={
              <button
                type="button"
                className="rounded text-primary-500 hover:text-primary-900"
                onClick={() =>
                  onAttachmentsChange(
                    attachments.filter((item) => item.id !== attachment.id),
                  )
                }
                aria-label={'Remove context ' + attachment.title}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={20}
                  strokeWidth={1.5}
                />
              </button>
            }
          />
        ))}
      </div>
    </div>
  )
}

export function ContextAttachmentButton({
  open,
  onToggle,
  disabled,
  buttonProps,
}: {
  open: boolean
  onToggle: () => void
  disabled?: boolean
  buttonProps?: React.ComponentProps<typeof Button>
}) {
  return (
    <Button
      {...buttonProps}
      variant={buttonProps?.variant ?? 'ghost'}
      size={buttonProps?.size ?? 'icon-sm'}
      onClick={(event) => {
        buttonProps?.onClick?.(event)
        onToggle()
      }}
      disabled={disabled || buttonProps?.disabled}
      className={cn(
        'rounded-full',
        open && 'bg-primary-200',
        buttonProps?.className,
      )}
      aria-label="Attach URL or document context"
      type={buttonProps?.type ?? 'button'}
    >
      <HugeiconsIcon icon={LinkSquare01Icon} size={20} strokeWidth={1.5} />
    </Button>
  )
}
