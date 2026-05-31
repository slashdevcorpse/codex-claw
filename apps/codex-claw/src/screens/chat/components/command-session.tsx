'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { fetchSessionSearch } from '../chat-queries'
import type { SessionSearchFilter } from '../chat-queries'
import type { SessionMeta } from '../types'
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from '@/components/ui/command'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'
import { cn } from '@/lib/utils'

type CommandSession = SessionMeta

type CommandSessionItem = {
  value: string
  label: string
  friendlyId: string
  tags: Array<string>
  archived: boolean
  hasFailedRun: boolean
  session: CommandSession
}

type CommandSessionGroup = {
  value: string
  items: Array<CommandSessionItem>
}

type CommandSessionProps = {
  sessions: Array<CommandSession>
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (session: CommandSession) => void
}

type FilterOption = {
  value: SessionSearchFilter
  label: string
}

const filterOptions: Array<FilterOption> = [
  { value: 'workspace', label: 'Workspace' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'recent', label: 'Recent' },
  { value: 'failed', label: 'Failed' },
  { value: 'tagged', label: 'Tagged' },
  { value: 'archived', label: 'Archived' },
]

function getSessionLabel(session: CommandSession) {
  return (
    session.label || session.title || session.derivedTitle || session.friendlyId
  )
}

function filterPinnedSessions(
  sessions: Array<CommandSession>,
  pinnedSessionKeys: Array<string>,
) {
  const pinned = new Set(pinnedSessionKeys)
  return sessions.filter((session) => pinned.has(session.key))
}

function CommandSessionDialog({
  sessions,
  open,
  onOpenChange,
  onSelect,
}: CommandSessionProps) {
  const [value, setValue] = useState('')
  const [filterMode, setFilterMode] = useState<SessionSearchFilter>('workspace')
  const [remoteSessions, setRemoteSessions] = useState<Array<CommandSession>>(
    [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { pinnedSessionKeys } = usePinnedSessions()

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void fetchSessionSearch({
        query: value,
        filter: filterMode,
        signal: controller.signal,
      })
        .then((items) => {
          if (controller.signal.aborted) return
          const nextSessions =
            filterMode === 'pinned'
              ? filterPinnedSessions(items, pinnedSessionKeys)
              : items
          setRemoteSessions(nextSessions)
        })
        .catch((err) => {
          if (controller.signal.aborted) return
          setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 120)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [filterMode, open, pinnedSessionKeys, value])

  const visibleSessions = open
    ? remoteSessions.length > 0 || value.trim() || filterMode !== 'workspace'
      ? remoteSessions
      : sessions
    : sessions

  const groupedItems = useMemo<Array<CommandSessionGroup>>(() => {
    return [
      {
        value: 'Sessions',
        items: visibleSessions.map((session) => ({
          value: session.key,
          label: getSessionLabel(session),
          friendlyId: session.friendlyId,
          tags: session.tags,
          archived: session.archived,
          hasFailedRun: session.hasFailedRun,
          session,
        })),
      },
    ]
  }, [visibleSessions])

  const filteredGroups = groupedItems.filter((group) => group.items.length > 0)
  const isEmpty = filteredGroups.length === 0

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup className="mx-auto self-center">
        <Command
          items={groupedItems}
          value={value}
          onValueChange={setValue}
          mode="none"
        >
          <CommandInput placeholder="Search sessions" />
          <CommandPanel className="flex min-h-0 flex-1 flex-col">
            <div className="flex gap-1 border-b border-primary-200 px-2 py-2">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterMode(option.value)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium text-primary-700 outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-primary-950',
                    filterMode === option.value
                      ? 'bg-primary-200 text-primary-950'
                      : 'hover:bg-primary-100',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {error ? (
              <div className="border-b border-primary-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            ) : null}
            {isEmpty ? (
              <div className="h-72 min-h-0 flex items-center justify-center text-sm text-primary-600">
                {loading ? 'Searching sessions...' : 'No sessions found.'}
              </div>
            ) : (
              <CommandList className="h-72 min-h-0">
                {filteredGroups.map((group, index) => (
                  <Fragment key={group.value + '-' + index}>
                    <CommandGroup items={group.items}>
                      <CommandGroupLabel>{group.value}</CommandGroupLabel>
                      <CommandCollection>
                        {(item) => (
                          <CommandItem
                            key={item.value}
                            value={item.label}
                            onClick={() => onSelect(item.session)}
                            className="gap-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-[450] line-clamp-1">
                                {item.label}
                              </span>
                              {item.tags.length > 0 ||
                              item.archived ||
                              item.hasFailedRun ? (
                                <span className="mt-1 flex min-w-0 items-center gap-1 overflow-hidden">
                                  {item.archived ? (
                                    <span className="shrink-0 rounded border border-primary-200 px-1 text-[10px] leading-4 text-primary-600">
                                      archived
                                    </span>
                                  ) : null}
                                  {item.hasFailedRun ? (
                                    <span className="shrink-0 rounded border border-primary-200 px-1 text-[10px] leading-4 text-red-700">
                                      failed
                                    </span>
                                  ) : null}
                                  {item.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="max-w-20 truncate rounded border border-primary-200 px-1 text-[10px] leading-4 text-primary-600"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </span>
                              ) : null}
                            </span>
                          </CommandItem>
                        )}
                      </CommandCollection>
                    </CommandGroup>
                    {index < filteredGroups.length - 1 ? (
                      <CommandSeparator />
                    ) : null}
                  </Fragment>
                ))}
              </CommandList>
            )}
          </CommandPanel>
          <CommandFooter>
            <div className="flex items-center gap-4 text-primary-700">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                  <HugeiconsIcon
                    icon={ArrowUp01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={14}
                    strokeWidth={1.5}
                  />
                </span>
                <span>Navigate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                  Enter
                </span>
                <span>Open</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-primary-700">
              <span className="rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                Esc
              </span>
              <span>Close</span>
            </div>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  )
}

export { CommandSessionDialog }
