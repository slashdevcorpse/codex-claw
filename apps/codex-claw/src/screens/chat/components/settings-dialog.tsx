import { useEffect, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  ComputerIcon,
  Copy01Icon,
  Delete02Icon,
  Moon01Icon,
  PlusSignIcon,
  Sun01Icon,
} from '@hugeicons/core-free-icons'
import type {
  PathsPayload,
  WorkspaceHealthCheck,
  WorkspaceListResponse,
  WorkspaceSummary,
} from '../types'
import type { ThemeMode, ThinkingLevel } from '@/hooks/use-chat-settings'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogRoot,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { useChatSettings } from '@/hooks/use-chat-settings'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type WorkspaceDraft = Partial<
  Pick<
    WorkspaceSummary,
    | 'id'
    | 'name'
    | 'codexCommand'
    | 'codexSandbox'
    | 'codexApproval'
    | 'runProfile'
    | 'codexWorkdir'
    | 'stateDir'
  >
> & {
  active?: boolean
}

type SettingsSectionProps = {
  title: string
  children: React.ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="border-b border-primary-200 py-4 last:border-0">
      <h3 className="mb-3 text-sm font-medium text-primary-900">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

type SettingsRowProps = {
  label: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1 select-none">
        <div className="text-sm text-primary-800">{label}</div>
        {description && (
          <div className="break-all text-xs text-primary-500">
            {description}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

type WorkspaceFieldProps = {
  label: string
  children: React.ReactNode
}

function WorkspaceField({ label, children }: WorkspaceFieldProps) {
  return (
    <label className="space-y-1 text-xs font-medium text-primary-600">
      <span>{label}</span>
      {children}
    </label>
  )
}

const newWorkspaceId = '__new__'
const sandboxOptions = ['read-only', 'workspace-write', 'danger-full-access']
const approvalOptions = ['untrusted', 'on-request', 'never']
const runProfileOptions = [
  {
    id: 'read-only-inspect',
    label: 'Read-only inspect',
    sandbox: 'read-only',
    approval: 'untrusted',
  },
  {
    id: 'workspace-write',
    label: 'Workspace write',
    sandbox: 'workspace-write',
    approval: 'on-request',
  },
  {
    id: 'elevated-manual-review',
    label: 'Elevated manual review',
    sandbox: 'danger-full-access',
    approval: 'untrusted',
  },
] as const

function emptyWorkspaceDraft(
  workspace?: WorkspaceSummary | null,
): WorkspaceDraft {
  return {
    name: workspace ? `${workspace.name} copy` : 'New workspace',
    codexCommand: workspace?.codexCommand ?? 'codex',
    codexSandbox: workspace?.codexSandbox ?? 'read-only',
    codexApproval: workspace?.codexApproval ?? 'untrusted',
    runProfile: workspace?.runProfile ?? 'read-only-inspect',
    codexWorkdir: workspace?.codexWorkdir ?? '',
    stateDir: workspace?.stateDir ?? '',
  }
}

function healthTone(check: WorkspaceHealthCheck) {
  if (check.status === 'ok') return 'bg-green-500 text-green-700'
  if (check.status === 'warning') return 'bg-amber-500 text-amber-700'
  return 'bg-red-500 text-red-700'
}

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pathsLoading: boolean
  pathsError: string | null
  paths: PathsPayload | null
  workspacesLoading: boolean
  workspacesError: string | null
  workspaceActionPending: boolean
  workspaceActionError: string | null
  workspaceData: WorkspaceListResponse | null
  onClose: () => void
  onCopySessionsDir: () => void
  onCopyStorePath: () => void
  onCopyFixCommand: (command: string) => void
  onCreateWorkspace: (workspace: WorkspaceDraft) => Promise<void>
  onUpdateWorkspace: (
    workspace: WorkspaceDraft & { id: string },
  ) => Promise<void>
  onActivateWorkspace: (id: string) => Promise<void>
  onDeleteWorkspace: (id: string) => Promise<void>
}

export function SettingsDialog({
  open,
  onOpenChange,
  pathsLoading,
  pathsError,
  paths,
  workspacesLoading,
  workspacesError,
  workspaceActionPending,
  workspaceActionError,
  workspaceData,
  onClose,
  onCopySessionsDir,
  onCopyStorePath,
  onCopyFixCommand,
  onCreateWorkspace,
  onUpdateWorkspace,
  onActivateWorkspace,
  onDeleteWorkspace,
}: SettingsDialogProps) {
  const { settings, updateSettings } = useChatSettings()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('')
  const [draft, setDraft] = useState<WorkspaceDraft>(() =>
    emptyWorkspaceDraft(null),
  )
  const activeWorkspace = useMemo(() => {
    return workspaceData?.workspaces.find(
      (workspace) => workspace.id === workspaceData.activeWorkspaceId,
    )
  }, [workspaceData])
  const selectedWorkspace = useMemo(() => {
    return workspaceData?.workspaces.find(
      (workspace) => workspace.id === selectedWorkspaceId,
    )
  }, [selectedWorkspaceId, workspaceData])
  const isNewWorkspace = selectedWorkspaceId === newWorkspaceId
  const canSaveWorkspace =
    Boolean(draft.name?.trim()) &&
    Boolean(draft.codexCommand?.trim()) &&
    Boolean(draft.codexWorkdir?.trim()) &&
    Boolean(draft.stateDir?.trim())
  const themeOptions = [
    { value: 'system', label: 'System', icon: ComputerIcon },
    { value: 'light', label: 'Light', icon: Sun01Icon },
    { value: 'dark', label: 'Dark', icon: Moon01Icon },
  ] as const
  const thinkingOptions = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
  ] as const

  useEffect(() => {
    if (!workspaceData) return
    if (selectedWorkspaceId === newWorkspaceId) return
    const selectedStillExists = workspaceData.workspaces.some(
      (workspace) => workspace.id === selectedWorkspaceId,
    )
    if (!selectedWorkspaceId || !selectedStillExists) {
      setSelectedWorkspaceId(workspaceData.activeWorkspaceId)
    }
  }, [selectedWorkspaceId, workspaceData])

  useEffect(() => {
    if (isNewWorkspace) return
    if (!selectedWorkspace) return
    setDraft({
      id: selectedWorkspace.id,
      name: selectedWorkspace.name,
      codexCommand: selectedWorkspace.codexCommand,
      codexSandbox: selectedWorkspace.codexSandbox,
      codexApproval: selectedWorkspace.codexApproval,
      runProfile: selectedWorkspace.runProfile,
      codexWorkdir: selectedWorkspace.codexWorkdir,
      stateDir: selectedWorkspace.stateDir,
    })
  }, [isNewWorkspace, selectedWorkspace])

  function updateDraft(field: keyof WorkspaceDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function updateRunProfile(value: string) {
    const profile = runProfileOptions.find((option) => option.id === value)
    setDraft((current) => ({
      ...current,
      runProfile: value as WorkspaceDraft['runProfile'],
      codexSandbox: profile?.sandbox ?? current.codexSandbox,
      codexApproval: profile?.approval ?? current.codexApproval,
    }))
  }

  function handleNewWorkspace() {
    setSelectedWorkspaceId(newWorkspaceId)
    setDraft(emptyWorkspaceDraft(activeWorkspace ?? null))
  }

  async function handleSaveWorkspace() {
    if (!canSaveWorkspace) return
    if (isNewWorkspace) {
      await onCreateWorkspace({ ...draft, active: true })
      setSelectedWorkspaceId('')
      return
    }
    if (!selectedWorkspace) return
    await onUpdateWorkspace({
      ...draft,
      id: selectedWorkspace.id,
    })
  }

  function applyTheme(theme: ThemeMode) {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    root.classList.remove('light', 'dark', 'system')
    root.classList.add(theme)
    if (theme === 'system' && media.matches) {
      root.classList.add('dark')
    }
  }

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(760px,94vw)] max-h-[86vh] overflow-auto rounded-lg">
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="mb-1">Settings</DialogTitle>
              <DialogDescription className="hidden">
                Configure CodexClaw
              </DialogDescription>
            </div>
            <DialogClose
              render={
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="text-primary-500 hover:bg-primary-100 hover:text-primary-700"
                  aria-label="Close"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={20}
                    strokeWidth={1.5}
                  />
                </Button>
              }
            />
          </div>

          <SettingsSection title="Workspace">
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={selectedWorkspaceId}
                onChange={(event) => setSelectedWorkspaceId(event.target.value)}
                className="h-9 flex-1 rounded-lg border border-primary-200 bg-surface px-3 text-sm text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-primary-950"
              >
                {workspaceData?.workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                    {workspace.id === workspaceData.activeWorkspaceId
                      ? ' (active)'
                      : ''}
                  </option>
                ))}
                {isNewWorkspace ? (
                  <option value={newWorkspaceId}>New workspace</option>
                ) : null}
              </select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleNewWorkspace}
                >
                  <HugeiconsIcon
                    icon={PlusSignIcon}
                    size={16}
                    strokeWidth={1.5}
                  />
                  New
                </Button>
                {selectedWorkspace &&
                selectedWorkspace.id !== workspaceData?.activeWorkspaceId ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      void onActivateWorkspace(selectedWorkspace.id)
                    }
                    disabled={workspaceActionPending}
                  >
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    Activate
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <WorkspaceField label="Name">
                <Input
                  value={draft.name ?? ''}
                  onChange={(event) => updateDraft('name', event.target.value)}
                />
              </WorkspaceField>
              <WorkspaceField label="Codex command">
                <Input
                  value={draft.codexCommand ?? ''}
                  onChange={(event) =>
                    updateDraft('codexCommand', event.target.value)
                  }
                />
              </WorkspaceField>
              <WorkspaceField label="Workdir">
                <Input
                  value={draft.codexWorkdir ?? ''}
                  onChange={(event) =>
                    updateDraft('codexWorkdir', event.target.value)
                  }
                />
              </WorkspaceField>
              <WorkspaceField label="State directory">
                <Input
                  value={draft.stateDir ?? ''}
                  onChange={(event) =>
                    updateDraft('stateDir', event.target.value)
                  }
                />
              </WorkspaceField>
              <WorkspaceField label="Sandbox">
                <select
                  value={draft.codexSandbox ?? 'read-only'}
                  onChange={(event) =>
                    updateDraft('codexSandbox', event.target.value)
                  }
                  className="h-8.5 w-full rounded-lg border border-primary-200 bg-surface px-3 text-sm text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-primary-950"
                >
                  {sandboxOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </WorkspaceField>
              <WorkspaceField label="Run profile">
                <select
                  value={draft.runProfile ?? 'read-only-inspect'}
                  onChange={(event) => updateRunProfile(event.target.value)}
                  className="h-8.5 w-full rounded-lg border border-primary-200 bg-surface px-3 text-sm text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-primary-950"
                >
                  {runProfileOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </WorkspaceField>
              <WorkspaceField label="Approval">
                <select
                  value={draft.codexApproval ?? 'untrusted'}
                  onChange={(event) =>
                    updateDraft('codexApproval', event.target.value)
                  }
                  className="h-8.5 w-full rounded-lg border border-primary-200 bg-surface px-3 text-sm text-primary-900 outline-none focus-visible:ring-2 focus-visible:ring-primary-950"
                >
                  {approvalOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </WorkspaceField>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-primary-500">
                {workspaceActionError || workspacesError || pathsError || ''}
              </div>
              <div className="flex gap-2">
                {selectedWorkspace && selectedWorkspace.id !== 'default' ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void onDeleteWorkspace(selectedWorkspace.id)}
                    disabled={workspaceActionPending}
                  >
                    <HugeiconsIcon
                      icon={Delete02Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    Delete
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void handleSaveWorkspace()}
                  disabled={!canSaveWorkspace || workspaceActionPending}
                >
                  Save
                </Button>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection title="Health">
            {workspacesLoading ? (
              <div className="text-sm text-primary-500">Checking...</div>
            ) : null}
            {workspaceData?.health.checks.map((check) => (
              <div
                key={check.id}
                className="flex items-start justify-between gap-3 rounded-md border border-primary-200 bg-primary-100/40 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2 rounded-full',
                        healthTone(check).split(' ')[0],
                      )}
                    />
                    <span className="text-sm font-medium text-primary-900">
                      {check.label}
                    </span>
                    <span
                      className={cn(
                        'text-xs capitalize',
                        healthTone(check).split(' ')[1],
                      )}
                    >
                      {check.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-primary-700">
                    {check.summary}
                  </div>
                  {check.detail ? (
                    <div className="mt-1 break-all text-xs text-primary-500">
                      {check.detail}
                    </div>
                  ) : null}
                </div>
                {check.fixCommand ? (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title={check.fixCommand}
                    aria-label={`Copy fix command for ${check.label}`}
                    onClick={() => onCopyFixCommand(check.fixCommand || '')}
                  >
                    <HugeiconsIcon
                      icon={Copy01Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                  </Button>
                ) : null}
              </div>
            ))}
          </SettingsSection>

          <SettingsSection title="Paths">
            {pathsLoading ? (
              <div className="text-sm text-primary-500">Loading paths...</div>
            ) : null}
            <SettingsRow
              label="Active workspace"
              description={paths?.workspace.name ?? activeWorkspace?.name ?? ''}
            >
              <span className="text-xs text-primary-500">
                {paths?.workspace.id ?? workspaceData?.activeWorkspaceId ?? ''}
              </span>
            </SettingsRow>
            <SettingsRow
              label="Sessions"
              description={paths?.sessionsDir ?? ''}
            >
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={onCopySessionsDir}
              >
                <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.5} />
              </Button>
            </SettingsRow>
            <SettingsRow label="Store" description={paths?.storePath ?? ''}>
              <Button size="icon-sm" variant="ghost" onClick={onCopyStorePath}>
                <HugeiconsIcon icon={Copy01Icon} size={16} strokeWidth={1.5} />
              </Button>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Appearance">
            <SettingsRow label="Theme">
              <Tabs
                value={settings.theme}
                onValueChange={(value) => {
                  const theme = value as ThemeMode
                  applyTheme(theme)
                  updateSettings({ theme })
                }}
              >
                <TabsList
                  variant="default"
                  className="gap-2 *:data-[slot=tab-indicator]:duration-0"
                >
                  {themeOptions.map((option) => (
                    <TabsTab key={option.value} value={option.value}>
                      <HugeiconsIcon
                        icon={option.icon}
                        size={20}
                        strokeWidth={1.5}
                      />
                      <span>{option.label}</span>
                    </TabsTab>
                  ))}
                </TabsList>
              </Tabs>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="Chat">
            <SettingsRow label="Show tool messages">
              <Switch
                checked={settings.showToolMessages}
                onCheckedChange={(checked) =>
                  updateSettings({ showToolMessages: checked })
                }
              />
            </SettingsRow>
            <SettingsRow label="Show reasoning blocks">
              <Switch
                checked={settings.showReasoningBlocks}
                onCheckedChange={(checked) =>
                  updateSettings({ showReasoningBlocks: checked })
                }
              />
            </SettingsRow>
            <SettingsRow label="Thinking level">
              <Tabs
                value={settings.thinkingLevel}
                onValueChange={(value) => {
                  updateSettings({ thinkingLevel: value as ThinkingLevel })
                }}
              >
                <TabsList
                  variant="default"
                  className="gap-2 *:data-[slot=tab-indicator]:duration-0"
                >
                  {thinkingOptions.map((option) => (
                    <TabsTab key={option.value} value={option.value}>
                      <span>{option.label}</span>
                    </TabsTab>
                  ))}
                </TabsList>
              </Tabs>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title="About">
            <div className="text-sm text-primary-800">CodexClaw (alpha)</div>
            <div className="flex gap-4 pt-2">
              <a
                href="https://github.com/slashdevcorpse/codex-claw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:text-primary-900 hover:underline"
              >
                Website
              </a>
              <a
                href="https://github.com/slashdevcorpse/codex-claw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:text-primary-900 hover:underline"
              >
                GitHub
              </a>
              <a
                href="https://developers.openai.com/codex/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary-600 hover:text-primary-900 hover:underline"
              >
                Codex CLI docs
              </a>
            </div>
          </SettingsSection>

          <div className="mt-6 flex justify-end">
            <DialogClose onClick={onClose}>Close</DialogClose>
          </div>
        </div>
      </DialogContent>
    </DialogRoot>
  )
}
