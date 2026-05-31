'use client'

import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type SessionTagsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionTitle: string
  tags: Array<string>
  onSave: (tags: Array<string>) => void
  onCancel: () => void
}

function parseTags(value: string) {
  const seen = new Set<string>()
  const tags: Array<string> = []
  for (const rawTag of value.split(',')) {
    const tag = rawTag.trim().toLowerCase().replace(/\s+/g, '-')
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

export function SessionTagsDialog({
  open,
  onOpenChange,
  sessionTitle,
  tags,
  onSave,
  onCancel,
}: SessionTagsDialogProps) {
  const defaultValue = tags.join(', ')

  function saveInput(input: HTMLInputElement) {
    onSave(parseTags(input.value))
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <div className="p-4">
          <DialogTitle className="mb-1">Session Tags</DialogTitle>
          <DialogDescription className="mb-4 line-clamp-2">
            Add comma-separated tags for {sessionTitle}.
          </DialogDescription>
          <input
            type="text"
            defaultValue={defaultValue}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                saveInput(event.currentTarget)
              }
            }}
            className="w-full rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900 outline-none focus:border-primary-400"
            placeholder="bugfix, release, docs"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose onClick={onCancel}>Cancel</DialogClose>
            <Button
              onClick={(event) => {
                const input = event.currentTarget.parentElement
                  ?.previousElementSibling as HTMLInputElement
                saveInput(input)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
