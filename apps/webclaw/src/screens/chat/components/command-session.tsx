'use client'

import { Fragment, useMemo } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
} from '@/components/ui/command'

type CommandSession = {
  key: string
  friendlyId: string
  label?: string
  title?: string
  derivedTitle?: string
}

type CommandSessionItem = {
  value: string
  label: string
  friendlyId: string
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

function getSessionLabel(session: CommandSession) {
  return (
    session.label || session.title || session.derivedTitle || session.friendlyId
  )
}

function CommandSessionDialog({
  sessions,
  open,
  onOpenChange,
  onSelect,
}: CommandSessionProps) {
  const groupedItems = useMemo<Array<CommandSessionGroup>>(() => {
    return [
      {
        value: 'Sessions',
        items: sessions.map((session) => ({
          value: session.key,
          label: getSessionLabel(session),
          friendlyId: session.friendlyId,
          session,
        })),
      },
    ]
  }, [sessions])

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandDialogPopup>
        <Command items={groupedItems}>
          <CommandInput placeholder="Search sessions" />
          <CommandPanel className="flex min-h-0 flex-1 flex-col">
            <CommandEmpty>No sessions found.</CommandEmpty>
            <CommandList className="max-h-72 min-h-0">
              {(group: CommandSessionGroup, index: number) => (
                <Fragment key={`${group.value}-${index}`}>
                  <CommandGroup items={group.items}>
                    <CommandGroupLabel>{group.value}</CommandGroupLabel>
                    <CommandCollection>
                      {(item: CommandSessionItem) => (
                        <CommandItem
                          key={item.value}
                          value={item.label}
                          onClick={() => onSelect(item.session)}
                          className="gap-2"
                        >
                          <span className="text-sm font-[450] line-clamp-1">
                            {item.label}
                          </span>
                        </CommandItem>
                      )}
                    </CommandCollection>
                  </CommandGroup>
                  {index < groupedItems.length - 1 ? (
                    <CommandSeparator />
                  ) : null}
                </Fragment>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <div className="flex items-center gap-4 text-primary-700">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-surface px-2 py-1 text-[11px] font-medium text-primary-700">
                  <HugeiconsIcon icon={ArrowUp01Icon} size={14} strokeWidth={1.5} />
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.5} />
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
