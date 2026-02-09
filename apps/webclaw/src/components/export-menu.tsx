'use client'

import { useCallback, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon } from '@hugeicons/core-free-icons'

import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ExportFormat = 'markdown' | 'json' | 'text'

type ExportMenuProps = {
  onExport: (format: ExportFormat) => void
  disabled?: boolean
}

const formats: Array<{ format: ExportFormat; label: string; ext: string }> = [
  { format: 'markdown', label: 'Markdown', ext: '.md' },
  { format: 'json', label: 'JSON', ext: '.json' },
  { format: 'text', label: 'Plain Text', ext: '.txt' },
]

export function ExportMenu({ onExport, disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const handleOpenChange = useCallback(
    function handleOpenChange(nextOpen: boolean) {
      if (disabled) return
      setOpen(nextOpen)
    },
    [disabled],
  )

  return (
    <MenuRoot open={disabled ? false : open} onOpenChange={handleOpenChange}>
      <MenuTrigger
        type="button"
        className={cn(
          buttonVariants({ size: 'icon-sm', variant: 'ghost' }),
          'text-primary-800 hover:bg-primary-100',
        )}
        aria-label="Download conversation"
        title="Download conversation"
        aria-disabled={disabled ? true : undefined}
      >
        <HugeiconsIcon icon={Download01Icon} size={20} strokeWidth={1.5} />
      </MenuTrigger>
      <MenuContent side="bottom" align="end">
        {formats.map(function renderFormat({ format, label, ext }) {
          return (
            <MenuItem
              key={format}
              onClick={function onClick() {
                onExport(format)
              }}
              className="justify-between"
            >
              <span>{label}</span>
              <span className="text-xs text-primary-600 tabular-nums">
                {ext}
              </span>
            </MenuItem>
          )
        })}
      </MenuContent>
    </MenuRoot>
  )
}
