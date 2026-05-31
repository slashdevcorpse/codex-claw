import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  Copy01Icon,
  RefreshIcon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import { fetchMcpHealth } from '../chat-queries'
import type {
  McpHealthPayload,
  McpHealthStatus,
  McpServerHealth,
  McpSetupSnippet,
} from '../types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type McpHealthPanelProps = {
  open: boolean
  onClose: () => void
}

function copyText(value: string) {
  try {
    void navigator.clipboard.writeText(value)
  } catch {
    // ignore
  }
}

function statusClass(status: McpHealthStatus) {
  if (status === 'ok') return 'bg-emerald-100 text-emerald-700'
  if (status === 'warning') return 'bg-amber-100 text-amber-700'
  return 'bg-red-100 text-red-700'
}

function statusLabel(status: McpHealthStatus) {
  if (status === 'ok') return 'Ready'
  if (status === 'warning') return 'Needs attention'
  return 'Unavailable'
}

function serverCommand(server: McpServerHealth) {
  return [server.command, ...server.args].filter(Boolean).join(' ')
}

function envLabel(server: McpServerHealth) {
  if (server.env.length === 0) return 'No environment requirements'
  return server.env
    .map((item) => {
      const suffix = item.reference ? ' from ' + item.reference : ''
      return item.name + suffix + ': ' + statusLabel(item.status)
    })
    .join(', ')
}

function SnippetRow({ snippet }: { snippet: McpSetupSnippet }) {
  return (
    <div className="border-t border-primary-200 px-4 py-3 first:border-t-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-primary-900">
            {snippet.label}
          </div>
          <div className="text-xs text-primary-500">{snippet.description}</div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => copyText(snippet.snippet)}
        >
          <HugeiconsIcon icon={Copy01Icon} size={20} strokeWidth={1.5} />
          Copy
        </Button>
      </div>
      <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-surface p-3 text-xs leading-5 text-primary-800">
        {snippet.snippet}
      </pre>
    </div>
  )
}

export function McpHealthPanel({ open, onClose }: McpHealthPanelProps) {
  const [payload, setPayload] = useState<McpHealthPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadHealth() {
    setLoading(true)
    setError(null)
    fetchMcpHealth()
      .then(setPayload)
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    loadHealth()
  }, [open])

  const summary = useMemo(() => {
    const servers = payload?.servers ?? []
    return {
      ready: servers.filter((server) => server.status === 'ok').length,
      warning: servers.filter((server) => server.status === 'warning').length,
      error: servers.filter((server) => server.status === 'error').length,
    }
  }, [payload])

  if (!open) return null

  return (
    <section className="border-b border-primary-200 bg-primary-50">
      <div className="flex items-center gap-3 border-b border-primary-200 px-4 py-3">
        <HugeiconsIcon
          icon={Settings01Icon}
          size={20}
          strokeWidth={1.5}
          className="text-primary-500"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-primary-900">
            MCP tools
          </div>
          <div className="truncate text-xs text-primary-500">
            {payload?.configPath || 'No Codex MCP config detected'}
          </div>
        </div>
        <div className="hidden items-center gap-1 text-xs text-primary-500 sm:flex">
          <span>{summary.ready} ready</span>
          <span>{summary.warning} warning</span>
          <span>{summary.error} unavailable</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={loadHealth}
          disabled={loading}
        >
          <HugeiconsIcon icon={RefreshIcon} size={20} strokeWidth={1.5} />
          Refresh
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

      <div className="max-h-[520px] overflow-auto">
        <div className="grid gap-0 border-b border-primary-200 lg:grid-cols-[minmax(280px,1fr)_minmax(280px,420px)]">
          <div className="min-h-[220px] border-r border-primary-200">
            {payload && payload.servers.length === 0 ? (
              <div className="px-4 py-6 text-sm text-primary-500">
                No configured MCP servers were found for this workspace.
              </div>
            ) : null}
            {payload?.servers.map((server) => (
              <div
                key={server.name}
                className="border-t border-primary-200 px-4 py-3 first:border-t-0"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-primary-900">
                        {server.name}
                      </span>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          statusClass(server.status),
                        )}
                      >
                        {statusLabel(server.status)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-primary-500">
                      {server.summary}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => copyText(serverCommand(server))}
                    disabled={!server.command}
                  >
                    <HugeiconsIcon
                      icon={Copy01Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                    Command
                  </Button>
                </div>
                <div className="mt-2 space-y-1 text-xs text-primary-600">
                  <div className="font-mono break-all">
                    {serverCommand(server) || 'No command configured'}
                  </div>
                  <div className="break-all">
                    {server.commandPath
                      ? 'Resolved: ' + server.commandPath
                      : 'Command path not resolved'}
                  </div>
                  <div>{envLabel(server)}</div>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="border-b border-primary-200 px-4 py-3">
              <div className="text-sm font-medium text-primary-900">
                Setup snippets
              </div>
              <div className="text-xs text-primary-500">
                Copy into the active Codex config and edit paths as needed.
              </div>
            </div>
            {payload?.setupSnippets.map((snippet) => (
              <SnippetRow key={snippet.id} snippet={snippet} />
            ))}
          </div>
        </div>
        {payload ? (
          <div className="px-4 py-2 text-xs text-primary-500">
            Checked {payload.checkedConfigPaths.length} config path
            {payload.checkedConfigPaths.length === 1 ? '' : 's'} at{' '}
            {new Date(payload.checkedAt).toLocaleTimeString()}.
          </div>
        ) : null}
      </div>
    </section>
  )
}
