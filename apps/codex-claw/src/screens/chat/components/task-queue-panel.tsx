import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  Download01Icon,
  RefreshIcon,
  TimelineIcon,
} from '@hugeicons/core-free-icons'
import {
  cancelCodexTask,
  fetchCodexTasks,
  retryCodexTask,
} from '../chat-queries'
import type {
  CodexRunTimelineEvent,
  CodexRunTokenMetrics,
  CodexTaskRecord,
  CodexTaskStatus,
} from '../types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TaskQueuePanelProps = {
  open: boolean
  onClose: () => void
}

function statusClass(status: CodexTaskStatus) {
  if (status === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'failed') return 'bg-red-100 text-red-700'
  if (status === 'canceled') return 'bg-primary-200 text-primary-700'
  return 'bg-amber-100 text-amber-700'
}

function statusLabel(status: CodexTaskStatus) {
  if (status === 'queued') return 'Queued'
  if (status === 'running') return 'Running'
  if (status === 'completed') return 'Completed'
  if (status === 'failed') return 'Failed'
  return 'Canceled'
}

function formatDuration(task: CodexTaskRecord) {
  const duration =
    typeof task.durationMs === 'number'
      ? task.durationMs
      : task.startedAt
        ? Date.now() - task.startedAt
        : 0
  if (duration <= 0) return '0s'
  const seconds = Math.round(duration / 1000)
  if (seconds < 60) return String(seconds) + 's'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return String(minutes) + 'm ' + String(remainder) + 's'
}

function formatMs(duration: number) {
  if (duration < 1000) return String(Math.max(0, Math.round(duration))) + 'ms'
  const seconds = duration / 1000
  if (seconds < 60) return seconds.toFixed(seconds < 10 ? 1 : 0) + 's'
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return String(minutes) + 'm ' + String(remainder) + 's'
}

function tokenMetricLabel(metrics?: CodexRunTokenMetrics) {
  if (!metrics) return 'Token/context metrics unavailable'
  const parts: Array<string> = []
  if (typeof metrics.totalTokens === 'number') {
    parts.push(metrics.totalTokens.toLocaleString() + ' total')
  }
  if (typeof metrics.inputTokens === 'number') {
    parts.push(metrics.inputTokens.toLocaleString() + ' in')
  }
  if (typeof metrics.outputTokens === 'number') {
    parts.push(metrics.outputTokens.toLocaleString() + ' out')
  }
  if (typeof metrics.contextTokens === 'number') {
    parts.push(metrics.contextTokens.toLocaleString() + ' context')
  }
  return parts.length > 0
    ? parts.join(' · ')
    : 'Token/context metrics unavailable'
}

function eventClass(kind: CodexRunTimelineEvent['kind']) {
  if (kind === 'error') return 'bg-red-100 text-red-700'
  if (kind === 'exit' || kind === 'final-message') {
    return 'bg-emerald-100 text-emerald-700'
  }
  if (kind === 'tool-call' || kind === 'tool-result') {
    return 'bg-blue-100 text-blue-700'
  }
  return 'bg-primary-100 text-primary-700'
}

function eventMeta(event: CodexRunTimelineEvent) {
  const parts: Array<string> = []
  if (event.commandName) parts.push(event.commandName)
  if (typeof event.exitCode === 'number') {
    parts.push('exit ' + String(event.exitCode))
  } else if (event.exitCode === null) {
    parts.push('exit unavailable')
  }
  if (event.status) parts.push(event.status)
  return parts.join(' · ')
}

function exportRunEvents(task: CodexTaskRecord) {
  if (typeof window === 'undefined') return
  const url =
    '/api/run-events?id=' + encodeURIComponent(task.id) + '&download=1'
  window.location.assign(url)
}

function canCancel(task: CodexTaskRecord) {
  return task.status === 'queued' || task.status === 'running'
}

function canRetry(task: CodexTaskRecord) {
  return task.status === 'failed' || task.status === 'canceled'
}

export function TaskQueuePanel({ open, onClose }: TaskQueuePanelProps) {
  const [tasks, setTasks] = useState<Array<CodexTaskRecord>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function loadTasks() {
    setLoading(true)
    setError(null)
    fetchCodexTasks()
      .then((payload) => setTasks(payload.tasks))
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!open) return
    loadTasks()
    const interval = window.setInterval(loadTasks, 3000)
    return () => window.clearInterval(interval)
  }, [open])

  const counts = useMemo(() => {
    return {
      running: tasks.filter((task) => task.status === 'running').length,
      failed: tasks.filter((task) => task.status === 'failed').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
    }
  }, [tasks])

  async function cancelTask(task: CodexTaskRecord) {
    setError(null)
    try {
      const payload = await cancelCodexTask(task.id)
      setTasks(payload.tasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function retryTask(task: CodexTaskRecord) {
    setError(null)
    try {
      const payload = await retryCodexTask(task.id)
      setTasks(payload.tasks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!open) return null

  return (
    <section className="border-b border-primary-200 bg-primary-50">
      <div className="flex items-center gap-3 border-b border-primary-200 px-4 py-3">
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          size={20}
          strokeWidth={1.5}
          className="text-primary-500"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-primary-900">
            Task queue
          </div>
          <div className="truncate text-xs text-primary-500">
            {counts.running} running, {counts.failed} failed, {counts.completed}{' '}
            completed
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={loadTasks}
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

      <div className="max-h-[480px] overflow-auto">
        {tasks.length === 0 ? (
          <div className="px-4 py-6 text-sm text-primary-500">
            No Codex tasks have been recorded yet.
          </div>
        ) : null}
        {tasks.map((task) => (
          <div
            key={task.id}
            className="border-t border-primary-200 px-4 py-3 first:border-t-0"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      statusClass(task.status),
                    )}
                  >
                    {statusLabel(task.status)}
                  </span>
                  <span className="truncate text-sm font-medium text-primary-900">
                    {task.message || task.id}
                  </span>
                </div>
                <div className="mt-1 grid gap-1 text-xs text-primary-500 sm:grid-cols-2">
                  <span className="truncate">
                    Session {task.sessionKey} · message {task.messageId}
                  </span>
                  <span className="tabular-nums">
                    Duration {formatDuration(task)} · exit{' '}
                    {typeof task.exitCode === 'number' ? task.exitCode : 'open'}
                  </span>
                </div>
                <div className="mt-1 grid gap-1 text-xs text-primary-500 sm:grid-cols-2">
                  <span className="tabular-nums">
                    {task.timeline.length.toLocaleString()} timeline events
                  </span>
                  <span className="truncate tabular-nums">
                    {tokenMetricLabel(task.tokenMetrics)}
                  </span>
                </div>
                {task.error ? (
                  <div className="mt-1 line-clamp-2 text-xs text-red-600">
                    {task.error}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void cancelTask(task)}
                  disabled={!canCancel(task)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void retryTask(task)}
                  disabled={!canRetry(task)}
                >
                  Retry
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => exportRunEvents(task)}
                >
                  <HugeiconsIcon
                    icon={Download01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                  JSON
                </Button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-primary-200 bg-surface">
              <div className="flex items-center gap-2 border-b border-primary-200 px-3 py-2 text-xs text-primary-600">
                <HugeiconsIcon
                  icon={TimelineIcon}
                  size={20}
                  strokeWidth={1.5}
                />
                <span className="font-medium text-primary-900">
                  Run timeline
                </span>
                <span className="tabular-nums">
                  final status: {statusLabel(task.status)}
                </span>
              </div>
              <div className="max-h-44 overflow-auto">
                {task.timeline.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-primary-500">
                    No normalized run events recorded for this run.
                  </div>
                ) : null}
                {task.timeline.map((event) => (
                  <div
                    key={event.id}
                    className="border-t border-primary-100 px-3 py-2 first:border-t-0"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="w-16 shrink-0 text-xs tabular-nums text-primary-500">
                        +{formatMs(event.relativeMs)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px]',
                              eventClass(event.kind),
                            )}
                          >
                            {event.label}
                          </span>
                          {eventMeta(event) ? (
                            <span className="min-w-0 truncate text-xs text-primary-500">
                              {eventMeta(event)}
                            </span>
                          ) : null}
                        </div>
                        {event.message ? (
                          <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-primary-600">
                            {event.message}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
