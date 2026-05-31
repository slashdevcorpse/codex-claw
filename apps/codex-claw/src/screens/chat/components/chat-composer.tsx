import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { fetchWorkspaces, updateWorkspace } from '../chat-queries'
import {
  RepoContextButton,
  RepoContextPanel,
  RepoContextSummary,
} from './repo-context-picker'
import {
  ContextAttachmentButton,
  ContextAttachmentPanel,
  ContextAttachmentSummary,
} from './context-attachment-picker'
import type { Ref } from 'react'
import type {
  ContextAttachment,
  RepoContextSelection,
  RunProfileId,
} from '../types'

import type { AttachmentFile } from '@/components/attachment-button'
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/prompt-kit/prompt-input'
import { Button } from '@/components/ui/button'
import { AttachmentButton } from '@/components/attachment-button'
import { AttachmentPreviewList } from '@/components/attachment-preview'
import { cn } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'

type ChatComposerProps = {
  onSubmit: (value: string, helpers: ChatComposerHelpers) => void
  isLoading: boolean
  disabled: boolean
  wrapperRef?: Ref<HTMLDivElement>
}

type ChatComposerHelpers = {
  reset: () => void
  setValue: (value: string) => void
  attachments?: Array<AttachmentFile>
  contextSelections?: Array<RepoContextSelection>
  contextAttachments?: Array<ContextAttachment>
  runProfile?: RunProfileId
  confirmedRisk?: boolean
}

const runProfiles = [
  {
    id: 'read-only-inspect',
    label: 'Inspect',
    sandbox: 'read-only',
    approval: 'untrusted',
    requiresConfirmation: false,
  },
  {
    id: 'workspace-write',
    label: 'Write',
    sandbox: 'workspace-write',
    approval: 'on-request',
    requiresConfirmation: true,
  },
  {
    id: 'elevated-manual-review',
    label: 'Elevated',
    sandbox: 'danger-full-access',
    approval: 'untrusted',
    requiresConfirmation: true,
  },
] as const

function ChatComposerComponent({
  onSubmit,
  isLoading,
  disabled,
  wrapperRef,
}: ChatComposerProps) {
  const [attachments, setAttachments] = useState<Array<AttachmentFile>>([])
  const [contextOpen, setContextOpen] = useState(false)
  const [contextSelections, setContextSelections] = useState<
    Array<RepoContextSelection>
  >([])
  const [contextAttachmentOpen, setContextAttachmentOpen] = useState(false)
  const [contextAttachments, setContextAttachments] = useState<
    Array<ContextAttachment>
  >([])
  const [runProfile, setRunProfile] =
    useState<RunProfileId>('read-only-inspect')
  const [confirmedRisk, setConfirmedRisk] = useState(false)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('')
  const promptRef = useRef<HTMLTextAreaElement | null>(null)
  const valueRef = useRef('')
  const setValueRef = useRef<((value: string) => void) | null>(null)
  const focusPrompt = useCallback(() => {
    if (typeof window === 'undefined') return
    window.requestAnimationFrame(() => {
      promptRef.current?.focus()
    })
  }, [])
  const reset = useCallback(() => {
    if (setValueRef.current) {
      setValueRef.current('')
    }
    setAttachments((prev) => {
      prev.forEach((attachment) => {
        if (attachment.preview) {
          URL.revokeObjectURL(attachment.preview)
        }
      })
      return []
    })
    setContextSelections([])
    setContextOpen(false)
    setContextAttachments([])
    setContextAttachmentOpen(false)
    setConfirmedRisk(false)
    focusPrompt()
  }, [focusPrompt])
  useEffect(() => {
    let cancelled = false
    fetchWorkspaces()
      .then((data) => {
        if (cancelled) return
        const activeWorkspace = data.workspaces.find(
          (workspace) => workspace.id === data.activeWorkspaceId,
        )
        setActiveWorkspaceId(data.activeWorkspaceId)
        if (activeWorkspace?.runProfile) {
          setRunProfile(activeWorkspace.runProfile)
        }
      })
      .catch(() => {
        // ignore
      })
    return () => {
      cancelled = true
    }
  }, [])
  const handleFileSelect = useCallback((file: AttachmentFile) => {
    setAttachments((prev) => [...prev, file])
  }, [])
  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const removed = prev.find((attachment) => attachment.id === id)
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview)
      }
      return prev.filter((attachment) => attachment.id !== id)
    })
  }, [])
  const handleRemoveContext = useCallback((path: string) => {
    setContextSelections((prev) =>
      prev.filter((selection) => selection.path !== path),
    )
  }, [])
  const handleRemoveContextAttachment = useCallback((id: string) => {
    setContextAttachments((prev) =>
      prev.filter((attachment) => attachment.id !== id),
    )
  }, [])
  const activeRunProfile = useMemo(() => {
    return (
      runProfiles.find((profile) => profile.id === runProfile) ?? runProfiles[0]
    )
  }, [runProfile])
  const handleRunProfileChange = useCallback(
    (value: string) => {
      const nextProfile =
        runProfiles.find((profile) => profile.id === value) ?? runProfiles[0]
      setRunProfile(nextProfile.id)
      setConfirmedRisk(false)
      if (activeWorkspaceId) {
        void updateWorkspace({
          id: activeWorkspaceId,
          runProfile: nextProfile.id,
          codexSandbox: nextProfile.sandbox,
          codexApproval: nextProfile.approval,
        })
      }
    },
    [activeWorkspaceId],
  )
  const setComposerValue = useCallback(
    (nextValue: string) => {
      if (setValueRef.current) {
        setValueRef.current(nextValue)
      }
      focusPrompt()
    },
    [focusPrompt],
  )
  const handleSubmit = useCallback(() => {
    if (disabled) return
    const body = valueRef.current.trim()
    // Allow submit if there is text, an image, or selected context.
    const validAttachments = attachments.filter((a) => !a.error && a.base64)
    if (
      body.length === 0 &&
      validAttachments.length === 0 &&
      contextSelections.length === 0 &&
      contextAttachments.length === 0
    )
      return
    if (activeRunProfile.requiresConfirmation && !confirmedRisk) return
    onSubmit(body, {
      reset,
      setValue: setComposerValue,
      attachments: validAttachments,
      contextSelections,
      contextAttachments,
      runProfile,
      confirmedRisk,
    })
    focusPrompt()
  }, [
    disabled,
    focusPrompt,
    onSubmit,
    reset,
    setComposerValue,
    attachments,
    contextSelections,
    contextAttachments,
    runProfile,
    confirmedRisk,
    activeRunProfile.requiresConfirmation,
  ])
  const submitDisabled =
    disabled || (activeRunProfile.requiresConfirmation && !confirmedRisk)

  return (
    <div
      className="mx-auto w-full max-w-full px-5 sm:max-w-[768px] sm:min-w-[400px] relative pb-3"
      ref={wrapperRef}
    >
      <TooltipProvider>
        <PromptInput
          valueRef={valueRef}
          setValueRef={setValueRef}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          disabled={disabled}
        >
          <AttachmentPreviewList
            attachments={attachments}
            onRemove={handleRemoveAttachment}
          />
          <RepoContextSummary
            selections={contextSelections}
            onRemove={handleRemoveContext}
          />
          <ContextAttachmentSummary
            attachments={contextAttachments}
            onRemove={handleRemoveContextAttachment}
          />
          <RepoContextPanel
            open={contextOpen}
            selections={contextSelections}
            onSelectionsChange={setContextSelections}
          />
          <ContextAttachmentPanel
            open={contextAttachmentOpen}
            attachments={contextAttachments}
            onAttachmentsChange={setContextAttachments}
          />
          <PromptInputTextarea
            placeholder="Type a message…"
            inputRef={promptRef}
          />
          <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-xs text-primary-500">
            <select
              value={runProfile}
              onChange={(event) => handleRunProfileChange(event.target.value)}
              className="h-7 rounded-md border border-primary-200 bg-surface px-2 text-xs text-primary-800 outline-none"
            >
              {runProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
            <span>
              sandbox: {activeRunProfile.sandbox} · approval:{' '}
              {activeRunProfile.approval}
            </span>
            {activeRunProfile.requiresConfirmation ? (
              <label className="inline-flex items-center gap-1 text-amber-700">
                <input
                  type="checkbox"
                  checked={confirmedRisk}
                  onChange={(event) => setConfirmedRisk(event.target.checked)}
                  className="size-3.5"
                />
                confirm
              </label>
            ) : null}
          </div>
          <PromptInputActions className="justify-end px-3">
            <div className="flex items-center gap-2 min-h-8 flex-nowrap">
              <PromptInputAction
                tooltip="Attach image"
                render={(triggerProps) => (
                  <AttachmentButton
                    onFileSelect={handleFileSelect}
                    disabled={disabled}
                    buttonProps={{
                      ...triggerProps,
                      className: cn('rounded-full', triggerProps.className),
                    }}
                  />
                )}
              />
              <PromptInputAction
                tooltip="Attach repository context"
                render={(triggerProps) => (
                  <RepoContextButton
                    open={contextOpen}
                    onToggle={() => setContextOpen((current) => !current)}
                    disabled={disabled}
                    buttonProps={{
                      ...triggerProps,
                      className: cn('rounded-full', triggerProps.className),
                    }}
                  />
                )}
              />
              <PromptInputAction
                tooltip="Attach URL or document context"
                render={(triggerProps) => (
                  <ContextAttachmentButton
                    open={contextAttachmentOpen}
                    onToggle={() =>
                      setContextAttachmentOpen((current) => !current)
                    }
                    disabled={disabled}
                    buttonProps={{
                      ...triggerProps,
                      className: cn('rounded-full', triggerProps.className),
                    }}
                  />
                )}
              />
              <PromptInputAction
                tooltip="Send message"
                render={(triggerProps) => (
                  <Button
                    {...triggerProps}
                    onClick={(event) => {
                      triggerProps.onClick?.(event)
                      handleSubmit()
                    }}
                    disabled={submitDisabled || triggerProps.disabled}
                    size="icon-sm"
                    variant="default"
                    className={cn('rounded-full', triggerProps.className)}
                    aria-label="Send message"
                  >
                    <HugeiconsIcon
                      icon={ArrowUp02Icon}
                      size={20}
                      strokeWidth={1.5}
                    />
                  </Button>
                )}
              />
            </div>
          </PromptInputActions>
        </PromptInput>
      </TooltipProvider>
    </div>
  )
}

const MemoizedChatComposer = memo(ChatComposerComponent)

export { MemoizedChatComposer as ChatComposer }
export type { ChatComposerHelpers }
