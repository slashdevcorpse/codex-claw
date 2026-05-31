import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Copy01Icon,
  Download01Icon,
  File01Icon,
  FolderFileStorageIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { fetchArtifacts } from '../chat-queries'
import type { ArtifactListResponse, CodexArtifactRecord } from '../types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ArtifactsPanelProps = {
  open: boolean
  sessionKey: string
  friendlyId: string
  onClose: () => void
}

function formatArtifactType(type: CodexArtifactRecord['type']) {
  if (type === 'terminal-log') return 'Terminal log'
  if (type === 'package') return 'Package'
  if (type === 'patch') return 'Patch'
  if (type === 'export') return 'Export'
  if (type === 'image') return 'Image'
  return 'File'
}

function formatSize(size: number | undefined) {
  if (typeof size !== 'number') return 'unknown'
  if (size < 1024) return String(size) + ' B'
  if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
  return (size / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTime(value: number) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function artifactTypeClass(type: CodexArtifactRecord['type']) {
  if (type === 'patch') return 'bg-amber-100 text-amber-700'
  if (type === 'terminal-log') return 'bg-primary-200 text-primary-700'
  if (type === 'package') return 'bg-emerald-100 text-emerald-700'
  if (type === 'image') return 'bg-sky-100 text-sky-700'
  return 'bg-primary-100 text-primary-700'
}

function copyText(value: string) {
  try {
    void navigator.clipboard.writeText(value)
  } catch {
    // Clipboard permissions vary by browser context.
  }
}

function downloadUrl(
  artifact: CodexArtifactRecord,
  sessionKey: string,
  friendlyId: string,
) {
  const query = new URLSearchParams({
    id: artifact.id,
    download: '1',
  })
  if (sessionKey) query.set('sessionKey', sessionKey)
  if (friendlyId) query.set('friendlyId', friendlyId)
  return '/api/artifacts?' + query.toString()
}

function manifestUrl(sessionKey: string, friendlyId: string) {
  const query = new URLSearchParams({ manifest: '1' })
  if (sessionKey) query.set('sessionKey', sessionKey)
  if (friendlyId) query.set('friendlyId', friendlyId)
  return '/api/artifacts?' + query.toString()
}

export function ArtifactsPanel({
  open,
  sessionKey,
  friendlyId,
  onClose,
}: ArtifactsPanelProps) {
  const [payload, setPayload] = useState<ArtifactListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadArtifacts() {
    if (!sessionKey && !friendlyId) return
    setLoading(true)
    setError(null)
    fetchArtifacts({ sessionKey, friendlyId })
      .then(setPayload)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    loadArtifacts()
  }, [friendlyId, open, sessionKey])

  const counts = useMemo(() => {
    const artifacts = payload?.artifacts ?? []
    return {
      total: artifacts.length,
      safe: artifacts.filter((artifact) => artifact.safeToOpen).length,
      packages: artifacts.filter((artifact) => artifact.type === 'package')
        .length,
    }
  }, [payload])

  if (!open) return null

  return (
    <section className="border-b border-primary-200 bg-primary-50">
      <div className="flex items-center gap-3 border-b border-primary-200 px-4 py-3">
        <HugeiconsIcon
          icon={FolderFileStorageIcon}
          size={20}
          strokeWidth={1.5}
          className="text-primary-500"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-primary-900">
            Artifacts
          </div>
          <div className="truncate text-xs text-primary-500">
            {counts.total} local, {counts.safe} safe to open, {counts.packages}{' '}
            package outputs
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={loadArtifacts}
          disabled={loading}
        >
          <HugeiconsIcon icon={RefreshIcon} size={20} strokeWidth={1.5} />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!payload || payload.artifacts.length === 0}
          render={<a href={manifestUrl(sessionKey, friendlyId)} />}
        >
          <HugeiconsIcon icon={Download01Icon} size={20} strokeWidth={1.5} />
          Manifest
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} />
        </Button>
      </div>

      {error ? (
        <div className="px-4 py-2 text-sm text-red-600">{error}</div>
      ) : null}
      {loading ? (
        <div className="px-4 py-2 text-sm text-primary-500">Refreshing...</div>
      ) : null}

      <div className="max-h-[480px] overflow-auto">
        {payload && payload.artifacts.length === 0 ? (
          <div className="px-4 py-6 text-sm text-primary-500">
            No local artifacts have been recorded for this session yet.
          </div>
        ) : null}
        {(payload?.artifacts ?? []).map((artifact) => (
          <div
            key={artifact.id}
            className="border-t border-primary-200 px-4 py-3 first:border-t-0"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-100 text-primary-600">
                <HugeiconsIcon icon={File01Icon} size={20} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      artifactTypeClass(artifact.type),
                    )}
                  >
                    {formatArtifactType(artifact.type)}
                  </span>
                  <span className="truncate text-sm font-medium text-primary-900">
                    {artifact.redactedPath}
                  </span>
                </div>
                <div className="mt-1 grid gap-1 text-xs text-primary-500 sm:grid-cols-3">
                  <span className="truncate">
                    Run {artifact.runId || 'manual'}
                  </span>
                  <span className="tabular-nums">
                    {formatTime(artifact.createdAt)}
                  </span>
                  <span className="tabular-nums">
                    {formatSize(artifact.size)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-primary-500">
                  {artifact.safeToOpen
                    ? 'Safe local text or image artifact'
                    : 'Path is tracked but direct browser download is disabled'}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="icon-sm"
                  variant="secondary"
                  onClick={() => copyText(artifact.path)}
                  aria-label="Copy artifact path"
                >
                  <HugeiconsIcon icon={Copy01Icon} size={20} strokeWidth={1.5} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="secondary"
                  disabled={!artifact.safeToOpen}
                  render={
                    <a href={downloadUrl(artifact, sessionKey, friendlyId)} />
                  }
                  aria-label="Download artifact"
                >
                  <HugeiconsIcon
                    icon={Download01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
