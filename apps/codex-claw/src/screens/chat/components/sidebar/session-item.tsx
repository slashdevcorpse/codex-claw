'use client'

import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArchiveIcon,
  Delete01Icon,
  MoreHorizontalIcon,
  Pen01Icon,
  PinIcon,
  Tag01Icon,
} from '@hugeicons/core-free-icons'
import { memo } from 'react'
import type { SessionMeta } from '../../types'
import { cn } from '@/lib/utils'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'

type SessionItemProps = {
  session: SessionMeta
  active: boolean
  isPinned: boolean
  onSelect?: () => void
  onTogglePin: (session: SessionMeta) => void
  onRename: (session: SessionMeta) => void
  onEditTags: (session: SessionMeta) => void
  onToggleArchive: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
}

function SessionItemComponent({
  session,
  active,
  isPinned,
  onSelect,
  onTogglePin,
  onRename,
  onEditTags,
  onToggleArchive,
  onDelete,
}: SessionItemProps) {
  const label =
    session.label || session.title || session.derivedTitle || session.friendlyId
  const tags = session.tags.slice(0, 2)

  return (
    <Link
      to="/chat/$sessionKey"
      params={{ sessionKey: session.friendlyId }}
      onClick={onSelect}
      className={cn(
        'group inline-flex items-center justify-between',
        'w-full text-left pl-1.5 pr-0.5 min-h-11 py-1 rounded-lg transition-colors duration-0',
        'select-none',
        active
          ? 'bg-primary-200 text-primary-950'
          : 'bg-transparent text-primary-950 [&:hover:not(:has(button:hover))]:bg-primary-200',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-[450] line-clamp-1">{label}</div>
        {tags.length > 0 || session.archived ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden">
            {session.archived ? (
              <span className="shrink-0 rounded border border-primary-200 px-1 text-[10px] leading-4 text-primary-600">
                archived
              </span>
            ) : null}
            {tags.map((tag) => (
              <span
                key={tag}
                className="max-w-16 truncate rounded border border-primary-200 px-1 text-[10px] leading-4 text-primary-600"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="inline-flex items-center">
        <MenuRoot>
          <MenuTrigger
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            className={cn(
              'ml-1 inline-flex size-7 items-center justify-center rounded-md text-primary-700',
              'opacity-0 duration-0 group-hover:opacity-100 hover:bg-primary-200',
              'aria-expanded:opacity-100 aria-expanded:bg-primary-200',
            )}
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              size={20}
              strokeWidth={1.5}
            />
          </MenuTrigger>
          <MenuContent side="bottom" align="end">
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onTogglePin(session)
              }}
              className="gap-2"
            >
              <HugeiconsIcon icon={PinIcon} size={20} strokeWidth={1.5} />{' '}
              {isPinned ? 'Unpin session' : 'Pin session'}
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onEditTags(session)
              }}
              className="gap-2"
            >
              <HugeiconsIcon icon={Tag01Icon} size={20} strokeWidth={1.5} />{' '}
              Tags
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleArchive(session)
              }}
              className="gap-2"
            >
              <HugeiconsIcon icon={ArchiveIcon} size={20} strokeWidth={1.5} />{' '}
              {session.archived ? 'Unarchive' : 'Archive'}
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRename(session)
              }}
              className="gap-2"
            >
              <HugeiconsIcon icon={Pen01Icon} size={20} strokeWidth={1.5} />{' '}
              Rename
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete(session)
              }}
              className="text-red-700 gap-2 hover:bg-red-50/80 data-highlighted:bg-red-50/80"
            >
              <HugeiconsIcon icon={Delete01Icon} size={20} strokeWidth={1.5} />{' '}
              Delete
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
    </Link>
  )
}

function areSessionItemsEqual(prev: SessionItemProps, next: SessionItemProps) {
  if (prev.active !== next.active) return false
  if (prev.isPinned !== next.isPinned) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onTogglePin !== next.onTogglePin) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onEditTags !== next.onEditTags) return false
  if (prev.onToggleArchive !== next.onToggleArchive) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.session === next.session) return true
  return (
    prev.session.key === next.session.key &&
    prev.session.friendlyId === next.session.friendlyId &&
    prev.session.label === next.session.label &&
    prev.session.title === next.session.title &&
    prev.session.derivedTitle === next.session.derivedTitle &&
    prev.session.archived === next.session.archived &&
    prev.session.hasFailedRun === next.session.hasFailedRun &&
    prev.session.tags.join(',') === next.session.tags.join(',') &&
    prev.session.updatedAt === next.session.updatedAt
  )
}

const SessionItem = memo(SessionItemComponent, areSessionItemsEqual)

export { SessionItem }
