import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  File01Icon,
  Folder01Icon,
  FolderSearchIcon,
} from '@hugeicons/core-free-icons'

import { fetchRepoContext } from '../chat-queries'
import type {
  RepoContextEntry,
  RepoContextPayload,
  RepoContextSelection,
} from '../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type RepoContextPanelProps = {
  open: boolean
  selections: Array<RepoContextSelection>
  onSelectionsChange: (selections: Array<RepoContextSelection>) => void
}

type RepoContextSummaryProps = {
  selections: Array<RepoContextSelection>
  onRemove: (path: string) => void
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return String(bytes) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function entryIcon(entry: RepoContextEntry) {
  return entry.type === 'directory' ? Folder01Icon : File01Icon
}

function selectionKey(selection: RepoContextSelection) {
  return selection.path
}

export function RepoContextSummary({
  selections,
  onRemove,
}: RepoContextSummaryProps) {
  if (selections.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4">
      {selections.map((selection) => (
        <span
          key={selectionKey(selection)}
          className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-primary-200 bg-primary-100 px-2 py-1 text-xs text-primary-700"
        >
          <HugeiconsIcon
            icon={selection.type === 'directory' ? Folder01Icon : File01Icon}
            size={13}
            strokeWidth={1.5}
            className="shrink-0"
          />
          <span className="truncate">{selection.path}</span>
          <button
            type="button"
            className="rounded text-primary-500 hover:text-primary-900"
            onClick={() => onRemove(selection.path)}
            aria-label={'Remove context ' + selection.path}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.5} />
          </button>
        </span>
      ))}
    </div>
  )
}

export function RepoContextPanel({
  open,
  selections,
  onSelectionsChange,
}: RepoContextPanelProps) {
  const [query, setQuery] = useState('')
  const [payload, setPayload] = useState<RepoContextPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRepoContext(selections)
      .then((nextPayload) => {
        if (!cancelled) setPayload(nextPayload)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, selections])

  const selectedPaths = useMemo(
    () => new Set(selections.map((selection) => selection.path)),
    [selections],
  )
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const entries = payload?.entries ?? []
    if (!normalizedQuery) return entries.slice(0, 120)
    return entries
      .filter((entry) => entry.path.toLowerCase().includes(normalizedQuery))
      .slice(0, 120)
  }, [payload, query])

  function toggleEntry(entry: RepoContextEntry) {
    if (selectedPaths.has(entry.path)) {
      onSelectionsChange(
        selections.filter((selection) => selection.path !== entry.path),
      )
      return
    }
    onSelectionsChange([
      ...selections,
      {
        path: entry.path,
        type: entry.type,
      },
    ])
  }

  if (!open) return null

  const estimate = payload?.estimate

  return (
    <div className="mx-3 mb-2 rounded-lg border border-primary-200 bg-primary-50 shadow-sm">
      <div className="border-b border-primary-200 p-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={FolderSearchIcon}
            size={16}
            strokeWidth={1.5}
            className="text-primary-500"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files"
            size="sm"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-primary-500">
          <span>{payload?.workdir ?? 'Workspace'}</span>
          {estimate ? (
            <span
              className={cn(
                estimate.oversized ? 'text-amber-700' : 'text-primary-500',
              )}
            >
              {estimate.estimatedTokens.toLocaleString()} tokens ·{' '}
              {estimate.fileCount} files · {formatBytes(estimate.byteCount)}
            </span>
          ) : null}
        </div>
      </div>

      {error ? <div className="p-3 text-sm text-red-600">{error}</div> : null}
      {loading ? (
        <div className="p-3 text-sm text-primary-500">Loading context...</div>
      ) : null}

      {estimate?.oversized ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Selection is large enough to crowd the prompt context.
        </div>
      ) : null}

      {payload?.applicableAgents.length ? (
        <div className="border-b border-primary-200 px-3 py-2 text-xs text-primary-600">
          Applies:{' '}
          {payload.applicableAgents.map((agent) => agent.path).join(', ')}
        </div>
      ) : null}

      <div className="max-h-64 overflow-auto p-1">
        {filteredEntries.map((entry) => {
          const selected = selectedPaths.has(entry.path)
          return (
            <button
              key={entry.path}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-100',
                selected && 'bg-primary-100 text-primary-950',
              )}
              style={{ paddingLeft: 8 + entry.depth * 14 }}
              onClick={() => toggleEntry(entry)}
            >
              <input
                type="checkbox"
                checked={selected}
                readOnly
                className="size-3.5"
                tabIndex={-1}
              />
              <HugeiconsIcon
                icon={entryIcon(entry)}
                size={15}
                strokeWidth={1.5}
                className="shrink-0 text-primary-500"
              />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {entry.size ? (
                <span className="shrink-0 text-xs text-primary-500">
                  {formatBytes(entry.size)}
                </span>
              ) : null}
            </button>
          )
        })}
        {!loading && filteredEntries.length === 0 ? (
          <div className="p-3 text-sm text-primary-500">No files found.</div>
        ) : null}
      </div>
    </div>
  )
}

export function RepoContextButton({
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
      aria-label="Attach repository context"
      type={buttonProps?.type ?? 'button'}
    >
      <HugeiconsIcon icon={FolderSearchIcon} size={20} strokeWidth={1.5} />
    </Button>
  )
}
