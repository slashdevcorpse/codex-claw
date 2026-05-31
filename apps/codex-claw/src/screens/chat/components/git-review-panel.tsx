import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  GitBranchIcon,
} from '@hugeicons/core-free-icons'
import { fetchGitReview, stageGitReviewFiles } from '../chat-queries'
import type { GitFileState, GitReviewFile, GitReviewPayload } from '../types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type GitReviewPanelProps = {
  open: boolean
  onClose: () => void
}

const groups: Array<{ id: GitFileState; label: string }> = [
  { id: 'staged', label: 'Staged' },
  { id: 'unstaged', label: 'Unstaged' },
  { id: 'untracked', label: 'Untracked' },
  { id: 'deleted', label: 'Deleted' },
]

function fileStatusLabel(file: GitReviewFile) {
  return file.indexStatus + file.worktreeStatus
}

function copyText(value: string) {
  try {
    void navigator.clipboard.writeText(value)
  } catch {
    // ignore
  }
}

export function GitReviewPanel({ open, onClose }: GitReviewPanelProps) {
  const [payload, setPayload] = useState<GitReviewPayload | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  )
  const [activePath, setActivePath] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadReview() {
    setLoading(true)
    setError(null)
    fetchGitReview()
      .then((nextPayload) => {
        setPayload(nextPayload)
        setActivePath((current) => current || nextPayload.files[0]?.path || '')
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    loadReview()
  }, [open])

  const activeFile = useMemo(() => {
    return payload?.files.find((file) => file.path === activePath) ?? null
  }, [activePath, payload])
  const selectedPatch = useMemo(() => {
    if (!payload) return ''
    if (selectedPaths.size === 0) return payload.patch
    return payload.files
      .filter((file) => selectedPaths.has(file.path))
      .map((file) => file.diff)
      .filter(Boolean)
      .join('\n\n')
  }, [payload, selectedPaths])

  function togglePath(path: string) {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  async function stageSelected() {
    const paths = [...selectedPaths]
    if (paths.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const nextPayload = await stageGitReviewFiles(paths)
      setPayload(nextPayload)
      setSelectedPaths(new Set())
      setActivePath(nextPayload.files[0]?.path || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <section className="border-b border-primary-200 bg-primary-50">
      <div className="flex items-center gap-3 border-b border-primary-200 px-4 py-3">
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={18}
          strokeWidth={1.5}
          className="text-primary-500"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-primary-900">
            Local changes
          </div>
          <div className="truncate text-xs text-primary-500">
            {payload?.branch || 'git'} · {payload?.workdir || ''}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => copyText(selectedPatch)}
          disabled={!selectedPatch}
        >
          <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.5} />
          Patch
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => copyText(payload?.draftCommitMessage ?? '')}
          disabled={!payload?.draftCommitMessage}
        >
          <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.5} />
          Message
        </Button>
        <Button
          size="sm"
          onClick={() => void stageSelected()}
          disabled={selectedPaths.size === 0 || loading}
        >
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            size={16}
            strokeWidth={1.5}
          />
          Stage
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
        </Button>
      </div>

      {error ? (
        <div className="px-4 py-2 text-sm text-red-600">{error}</div>
      ) : null}
      {loading ? (
        <div className="px-4 py-2 text-sm text-primary-500">Refreshing...</div>
      ) : null}

      <div className="grid max-h-[420px] min-h-[220px] grid-cols-[minmax(220px,320px)_1fr] overflow-hidden">
        <div className="overflow-auto border-r border-primary-200 p-2">
          {groups.map((group) => {
            const files = payload?.groups[group.id] ?? []
            if (files.length === 0) return null
            return (
              <div key={group.id} className="mb-3">
                <div className="mb-1 px-2 text-xs font-medium text-primary-500">
                  {group.label} ({files.length})
                </div>
                {files.map((file) => (
                  <button
                    key={file.state + file.path}
                    type="button"
                    onClick={() => setActivePath(file.path)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-primary-100',
                      activePath === file.path && 'bg-primary-100',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPaths.has(file.path)}
                      onChange={() => togglePath(file.path)}
                      onClick={(event) => event.stopPropagation()}
                      className="size-3.5"
                    />
                    <span className="w-7 shrink-0 font-mono text-xs text-primary-500">
                      {fileStatusLabel(file)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                  </button>
                ))}
              </div>
            )
          })}
          {payload && payload.files.length === 0 ? (
            <div className="p-3 text-sm text-primary-500">
              No local changes.
            </div>
          ) : null}
        </div>
        <pre className="overflow-auto bg-surface p-3 text-xs leading-5 text-primary-800">
          {activeFile?.diff || 'Select a file to review its diff.'}
        </pre>
      </div>
    </section>
  )
}
