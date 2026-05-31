import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type MessageContent =
  | {
      type: 'text'
      text?: string
    }
  | {
      type: 'thinking'
      thinking?: string
    }
  | {
      type: 'toolCall'
      id?: string
      name?: string
      arguments?: Record<string, unknown>
      partialJson?: string
    }
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: string
        data: string
      }
    }

type CodexMessage = {
  id?: string
  role?: string
  content?: Array<MessageContent>
  timestamp?: number
  clientId?: string
  toolCallId?: string
  toolName?: string
  details?: Record<string, unknown>
  isError?: boolean
}

type SessionRecord = {
  key: string
  friendlyId: string
  label?: string
  title?: string
  derivedTitle?: string
  tags?: Array<string>
  archived?: boolean
  updatedAt: number
  messages: Array<CodexMessage>
  lastMessage?: CodexMessage | null
}

type SessionStore = {
  version: 1
  sessions: Array<SessionRecord>
}

type CodexArtifactType =
  | 'file'
  | 'patch'
  | 'terminal-log'
  | 'export'
  | 'package'
  | 'image'

type CodexArtifactRecord = {
  id: string
  sessionKey: string
  runId?: string
  path: string
  redactedPath: string
  type: CodexArtifactType
  createdAt: number
  safeToOpen: boolean
  size?: number
  source: 'command-log' | 'detected-file' | 'export-manifest'
}

type ArtifactStore = {
  version: 1
  artifacts: Array<CodexArtifactRecord>
}

type SessionFilter = 'all' | 'recent' | 'failed' | 'tagged' | 'archived'

type ListCodexSessionsInput = {
  query?: string
  filter?: string
  tag?: string
  includeArchived?: boolean
}

type CodexTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'

type CodexTaskEvent = {
  status: CodexTaskStatus
  at: number
  note?: string
}

type CodexTaskSnapshot = {
  sessionKey: string
  message: string
  thinking?: string
  attachments?: Array<AttachmentInput>
  contextBlock?: string
  runProfile?: string
  confirmedRisk?: boolean
}

type CodexTaskRecord = {
  id: string
  sessionKey: string
  messageId: string
  prompt: string
  message: string
  runProfile?: string
  status: CodexTaskStatus
  createdAt: number
  updatedAt: number
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  exitCode?: number | null
  error?: string
  retryOf?: string
  snapshot: CodexTaskSnapshot
  events: Array<CodexTaskEvent>
}

type TaskStore = {
  version: 1
  tasks: Array<CodexTaskRecord>
}

type AttachmentInput = {
  mimeType: string
  content: string
  name?: string
}

type SendCodexPromptInput = {
  sessionKey: string
  message: string
  thinking?: string
  attachments?: Array<AttachmentInput>
  contextBlock?: string
  runProfile?: string
  confirmedRisk?: boolean
  retryOf?: string
  idempotencyKey?: string
}

type CodexStreamEvent = {
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: number
}

type CodexExecJsonEvent = {
  type?: string
  role?: string
  text?: string
  delta?: string
  message?: unknown
  content?: unknown
  item?: {
    id?: string
    type?: string
    role?: string
    text?: string
    delta?: string
    command?: string
    aggregated_output?: string
    exit_code?: number | null
    status?: string
    content?: unknown
    name?: string
    arguments?: Record<string, unknown>
    [key: string]: unknown
  }
  usage?: Record<string, unknown>
  [key: string]: unknown
}

type CodexPathsPayload = {
  agentId: string
  stateDir: string
  sessionsDir: string
  storePath: string
  workspacesStorePath: string
  workspace: WorkspaceRecord
}

type WorkspaceRecord = {
  id: string
  name: string
  codexCommand: string
  codexSandbox: string
  codexApproval: string
  runProfile: RunProfileId
  codexWorkdir: string
  stateDir: string
  createdAt: number
  updatedAt: number
}

type WorkspaceStore = {
  version: 1
  activeWorkspaceId: string
  workspaces: Array<WorkspaceRecord>
}

type WorkspaceInput = {
  id?: string
  name?: string
  codexCommand?: string
  codexSandbox?: string
  codexApproval?: string
  runProfile?: string
  codexWorkdir?: string
  stateDir?: string
  active?: boolean
}

type RunProfileId =
  | 'read-only-inspect'
  | 'workspace-write'
  | 'elevated-manual-review'

type WorkspaceHealthStatus = 'ok' | 'warning' | 'error'

type WorkspaceHealthCheck = {
  id: string
  label: string
  status: WorkspaceHealthStatus
  summary: string
  detail?: string
  fixCommand?: string
}

type WorkspaceHealthPayload = {
  ok: boolean
  workspaceId: string
  checkedAt: number
  checks: Array<WorkspaceHealthCheck>
}

type PreparedAttachmentFiles = {
  imagePaths: Array<string>
  cleanup: () => void
}

type ProcessedCodexJsonLine =
  | {
      kind: 'assistant-delta'
      text: string
    }
  | {
      kind: 'assistant-final'
      text: string
    }
  | {
      kind: 'message-delta'
      message: CodexMessage
    }

const supportedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
])

const listeners = new Map<string, Set<(event: CodexStreamEvent) => void>>()
const defaultWorkspaceId = 'default'
const supportedSandboxModes = new Set([
  'read-only',
  'workspace-write',
  'danger-full-access',
])
const supportedApprovalPolicies = new Set([
  'untrusted',
  'on-request',
  'on-failure',
  'never',
])
const runProfiles: Record<
  RunProfileId,
  {
    id: RunProfileId
    label: string
    sandbox: string
    approval: string
    requiresConfirmation: boolean
  }
> = {
  'read-only-inspect': {
    id: 'read-only-inspect',
    label: 'Read-only inspect',
    sandbox: 'read-only',
    approval: 'untrusted',
    requiresConfirmation: false,
  },
  'workspace-write': {
    id: 'workspace-write',
    label: 'Workspace write',
    sandbox: 'workspace-write',
    approval: 'on-request',
    requiresConfirmation: true,
  },
  'elevated-manual-review': {
    id: 'elevated-manual-review',
    label: 'Elevated manual review',
    sandbox: 'danger-full-access',
    approval: 'untrusted',
    requiresConfirmation: true,
  },
}
let storeCache: SessionStore | null = null
let workspaceStoreCache: WorkspaceStore | null = null
let taskStoreCache: TaskStore | null = null
let artifactStoreCache: ArtifactStore | null = null
let stateVersion = 0
const runningTasks = new Map<string, ReturnType<typeof spawn>>()

function getBaseStateDir() {
  const configured = process.env.CODEX_CLAW_STATE_DIR?.trim()
  if (configured) return path.resolve(configured)
  return path.join(process.cwd(), '.codex-claw')
}

function getWorkspacesStorePath() {
  return path.join(getBaseStateDir(), 'workspaces.json')
}

function getStateDir() {
  return getActiveWorkspace().stateDir
}

function getStorePath() {
  return path.join(getStateDir(), 'sessions.json')
}

function getTaskStorePath() {
  return path.join(getStateDir(), 'tasks.json')
}

function getArtifactStorePath() {
  return path.join(getStateDir(), 'artifacts.json')
}

function getArtifactsDir() {
  return path.join(getStateDir(), 'artifacts')
}

function getCodexCommand() {
  return getActiveWorkspace().codexCommand
}

function getCodexSandbox() {
  return getActiveWorkspace().codexSandbox
}

function getCodexApproval() {
  return getActiveWorkspace().codexApproval
}

function getCodexWorkdir() {
  return getActiveWorkspace().codexWorkdir
}

function defaultCodexCommand() {
  return process.env.CODEX_CLI_COMMAND?.trim() || 'codex'
}

function defaultCodexSandbox() {
  const configured = process.env.CODEX_CLI_SANDBOX?.trim()
  return normalizeSandbox(configured)
}

function defaultCodexApproval() {
  const configured = process.env.CODEX_CLI_APPROVAL?.trim()
  return normalizeApproval(configured)
}

function defaultCodexWorkdir() {
  const configured = process.env.CODEX_CLI_WORKDIR?.trim()
  if (configured) return path.resolve(configured)
  return process.cwd()
}

function defaultWorkspace(now = Date.now()): WorkspaceRecord {
  return {
    id: defaultWorkspaceId,
    name: 'Default workspace',
    codexCommand: defaultCodexCommand(),
    codexSandbox: defaultCodexSandbox(),
    codexApproval: defaultCodexApproval(),
    runProfile: profileFromSandbox(defaultCodexSandbox()),
    codexWorkdir: defaultCodexWorkdir(),
    stateDir: getBaseStateDir(),
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeSandbox(value: string | undefined) {
  const trimmed = value?.trim()
  if (trimmed && supportedSandboxModes.has(trimmed)) return trimmed
  return 'read-only'
}

function normalizeApproval(value: string | undefined) {
  const trimmed = value?.trim()
  if (trimmed && supportedApprovalPolicies.has(trimmed)) return trimmed
  return 'untrusted'
}

function normalizeRunProfile(value: unknown): RunProfileId {
  if (typeof value === 'string' && value in runProfiles) {
    return value as RunProfileId
  }
  return 'read-only-inspect'
}

function profileFromSandbox(sandbox: string): RunProfileId {
  if (sandbox === 'workspace-write') return 'workspace-write'
  if (sandbox === 'danger-full-access') return 'elevated-manual-review'
  return 'read-only-inspect'
}

function getRunProfile(id?: string) {
  const workspace = getActiveWorkspace()
  return runProfiles[normalizeRunProfile(id ?? workspace.runProfile)]
}

function normalizeRequiredString(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function normalizePath(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) return fallback
  return path.resolve(value.trim())
}

function isWorkspaceRecord(value: unknown): value is WorkspaceRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.codexCommand === 'string' &&
    typeof candidate.codexSandbox === 'string' &&
    typeof candidate.codexWorkdir === 'string' &&
    typeof candidate.stateDir === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number'
  )
}

function isWorkspaceStore(value: unknown): value is WorkspaceStore {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.version === 1 &&
    typeof candidate.activeWorkspaceId === 'string' &&
    Array.isArray(candidate.workspaces)
  )
}

function normalizeWorkspaceRecord(
  value: Partial<WorkspaceRecord>,
  fallback: WorkspaceRecord,
): WorkspaceRecord {
  const codexSandbox = normalizeSandbox(
    value.codexSandbox || fallback.codexSandbox,
  )
  const runProfile =
    typeof value.runProfile === 'string'
      ? normalizeRunProfile(value.runProfile)
      : value.codexSandbox
        ? profileFromSandbox(codexSandbox)
        : fallback.runProfile
  const codexApproval = normalizeApproval(
    value.codexApproval ||
      (value.codexSandbox || value.runProfile
        ? runProfiles[runProfile].approval
        : fallback.codexApproval),
  )

  return {
    id: normalizeRequiredString(value.id, fallback.id),
    name: normalizeRequiredString(value.name, fallback.name),
    codexCommand: normalizeRequiredString(
      value.codexCommand,
      fallback.codexCommand,
    ),
    codexSandbox,
    codexApproval,
    runProfile,
    codexWorkdir: normalizePath(value.codexWorkdir, fallback.codexWorkdir),
    stateDir: normalizePath(value.stateDir, fallback.stateDir),
    createdAt:
      typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
        ? value.createdAt
        : fallback.createdAt,
    updatedAt:
      typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : fallback.updatedAt,
  }
}

function normalizeWorkspaceStore(value: unknown): WorkspaceStore {
  const fallback = defaultWorkspace()
  if (!isWorkspaceStore(value)) {
    return {
      version: 1,
      activeWorkspaceId: fallback.id,
      workspaces: [fallback],
    }
  }

  const seen = new Set<string>()
  const workspaces = value.workspaces
    .filter(isWorkspaceRecord)
    .map((workspace) => normalizeWorkspaceRecord(workspace, fallback))
    .filter((workspace) => {
      if (seen.has(workspace.id)) return false
      seen.add(workspace.id)
      return true
    })

  if (!seen.has(fallback.id)) {
    workspaces.unshift(fallback)
  }

  const activeWorkspaceId = workspaces.some(
    (workspace) => workspace.id === value.activeWorkspaceId,
  )
    ? value.activeWorkspaceId
    : fallback.id

  return {
    version: 1,
    activeWorkspaceId,
    workspaces,
  }
}

function readWorkspaceStore(): WorkspaceStore {
  if (workspaceStoreCache) return workspaceStoreCache
  const storePath = getWorkspacesStorePath()
  if (!existsSync(storePath)) {
    workspaceStoreCache = normalizeWorkspaceStore(null)
    return workspaceStoreCache
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as unknown
    workspaceStoreCache = normalizeWorkspaceStore(parsed)
  } catch {
    workspaceStoreCache = normalizeWorkspaceStore(null)
  }

  return workspaceStoreCache
}

function writeWorkspaceStore(store: WorkspaceStore) {
  const nextStore = normalizeWorkspaceStore(store)
  const stateDir = getBaseStateDir()
  mkdirSync(stateDir, { recursive: true })
  const storePath = getWorkspacesStorePath()
  const tempPath = `${storePath}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(nextStore, null, 2)}\n`)
  renameSync(tempPath, storePath)
  workspaceStoreCache = nextStore
  storeCache = null
  stateVersion += 1
}

function getActiveWorkspace() {
  const store = readWorkspaceStore()
  const activeWorkspace = store.workspaces.find(
    (workspace) => workspace.id === store.activeWorkspaceId,
  )
  if (activeWorkspace) return activeWorkspace
  return store.workspaces[0] || defaultWorkspace()
}

function resolveCodexCommand(command: string) {
  if (process.platform !== 'win32') return command
  if (/[/\\]/.test(command) || /\.(cmd|exe|bat)$/i.test(command)) {
    return command
  }

  const result = spawnSync('where.exe', [command], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
  if (result.status !== 0) return command

  const matches = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const executable =
    matches.find((line) => /\.exe$/i.test(line)) ??
    matches.find((line) => /\.(cmd|bat)$/i.test(line))
  if (executable) return executable
  if (matches.length > 0) return matches[0]
  return command
}

function isSessionStore(value: unknown): value is SessionStore {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.version === 1 && Array.isArray(candidate.sessions)
}

function emptyStore(): SessionStore {
  return { version: 1, sessions: [] }
}

function readStore(): SessionStore {
  if (storeCache) return storeCache
  const storePath = getStorePath()
  if (!existsSync(storePath)) {
    storeCache = emptyStore()
    return storeCache
  }

  try {
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as unknown
    storeCache = isSessionStore(parsed) ? parsed : emptyStore()
  } catch {
    storeCache = emptyStore()
  }

  return storeCache
}

function writeStore(store: SessionStore) {
  const stateDir = getStateDir()
  mkdirSync(stateDir, { recursive: true })
  const storePath = getStorePath()
  const tempPath = `${storePath}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`)
  renameSync(tempPath, storePath)
  storeCache = store
  stateVersion += 1
}

function isTaskRecord(value: unknown): value is CodexTaskRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.sessionKey === 'string' &&
    typeof candidate.messageId === 'string' &&
    typeof candidate.prompt === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.updatedAt === 'number' &&
    candidate.snapshot !== null &&
    typeof candidate.snapshot === 'object' &&
    Array.isArray(candidate.events)
  )
}

function isTaskStore(value: unknown): value is TaskStore {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.version === 1 && Array.isArray(candidate.tasks)
}

function normalizeTaskStatus(value: string): CodexTaskStatus {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'canceled'
  ) {
    return value
  }
  return 'failed'
}

function normalizeTaskRecord(value: CodexTaskRecord): CodexTaskRecord {
  const status = normalizeTaskStatus(value.status)
  return {
    ...value,
    status,
    events: value.events
      .filter((event) => typeof event.at === 'number')
      .map((event) => ({
        status: normalizeTaskStatus(event.status),
        at: event.at,
        note: typeof event.note === 'string' ? event.note : undefined,
      })),
  }
}

function normalizeTaskStore(value: unknown): TaskStore {
  if (!isTaskStore(value)) {
    return {
      version: 1,
      tasks: [],
    }
  }
  return {
    version: 1,
    tasks: value.tasks.filter(isTaskRecord).map(normalizeTaskRecord),
  }
}

function readTaskStore() {
  if (taskStoreCache) return taskStoreCache
  const taskStorePath = getTaskStorePath()
  try {
    const parsed = JSON.parse(readFileSync(taskStorePath, 'utf8')) as unknown
    taskStoreCache = normalizeTaskStore(parsed)
  } catch {
    taskStoreCache = { version: 1, tasks: [] }
  }
  return taskStoreCache
}

function writeTaskStore(store: TaskStore) {
  const taskStorePath = getTaskStorePath()
  mkdirSync(path.dirname(taskStorePath), { recursive: true })
  const tempPath = taskStorePath + '.' + process.pid + '.' + Date.now() + '.tmp'
  writeFileSync(tempPath, JSON.stringify(store, null, 2))
  renameSync(tempPath, taskStorePath)
  taskStoreCache = store
  stateVersion += 1
}

function isArtifactStore(value: unknown): value is ArtifactStore {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.version === 1 && Array.isArray(candidate.artifacts)
}

function isArtifactRecord(value: unknown): value is CodexArtifactRecord {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.sessionKey === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.redactedPath === 'string' &&
    typeof candidate.type === 'string' &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.safeToOpen === 'boolean' &&
    typeof candidate.source === 'string'
  )
}

function readArtifactStore() {
  if (artifactStoreCache) return artifactStoreCache
  const artifactStorePath = getArtifactStorePath()
  try {
    const parsed = JSON.parse(readFileSync(artifactStorePath, 'utf8')) as unknown
    artifactStoreCache = isArtifactStore(parsed)
      ? {
          version: 1,
          artifacts: parsed.artifacts.filter(isArtifactRecord),
        }
      : { version: 1, artifacts: [] }
  } catch {
    artifactStoreCache = { version: 1, artifacts: [] }
  }
  return artifactStoreCache
}

function writeArtifactStore(store: ArtifactStore) {
  const artifactStorePath = getArtifactStorePath()
  mkdirSync(path.dirname(artifactStorePath), { recursive: true })
  const tempPath =
    artifactStorePath + '.' + process.pid + '.' + Date.now() + '.tmp'
  writeFileSync(tempPath, JSON.stringify(store, null, 2))
  renameSync(tempPath, artifactStorePath)
  artifactStoreCache = store
  stateVersion += 1
}

function taskDuration(task: CodexTaskRecord, now = Date.now()) {
  const startedAt = task.startedAt ?? task.createdAt
  const finishedAt = task.finishedAt ?? now
  return Math.max(0, finishedAt - startedAt)
}

function appendTaskEvent(
  task: CodexTaskRecord,
  status: CodexTaskStatus,
  note?: string,
) {
  const now = Date.now()
  task.status = status
  task.updatedAt = now
  if (status === 'running' && !task.startedAt) task.startedAt = now
  if (status === 'completed' || status === 'failed' || status === 'canceled') {
    task.finishedAt = now
    task.durationMs = taskDuration(task, now)
  }
  if (note) task.error = note
  task.events.push({ status, at: now, note })
}

function writeTask(task: CodexTaskRecord) {
  const store = readTaskStore()
  const index = store.tasks.findIndex((item) => item.id === task.id)
  if (index >= 0) {
    store.tasks[index] = task
  } else {
    store.tasks.push(task)
  }
  writeTaskStore(store)
}

function updateTask(
  taskId: string,
  status: CodexTaskStatus,
  update?: {
    note?: string
    exitCode?: number | null
  },
) {
  const store = readTaskStore()
  const task = store.tasks.find((item) => item.id === taskId)
  if (!task) return null
  appendTaskEvent(task, status, update?.note)
  if (Object.prototype.hasOwnProperty.call(update ?? {}, 'exitCode')) {
    task.exitCode = update?.exitCode
  }
  writeTaskStore(store)
  return task
}

function createTaskRecord(input: {
  id: string
  sessionKey: string
  messageId: string
  prompt: string
  snapshot: CodexTaskSnapshot
  runProfile?: string
  retryOf?: string
}) {
  const now = Date.now()
  const task: CodexTaskRecord = {
    id: input.id,
    sessionKey: input.sessionKey,
    messageId: input.messageId,
    prompt: input.prompt,
    message: input.snapshot.message,
    runProfile: input.runProfile,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    retryOf: input.retryOf,
    snapshot: input.snapshot,
    events: [{ status: 'queued', at: now }],
  }
  writeTask(task)
  return task
}

function deriveFriendlyIdFromKey(key: string) {
  const trimmed = key.trim()
  if (!trimmed) return 'main'
  const parts = trimmed.split(':')
  const tail = parts[parts.length - 1]
  return tail && tail.trim() ? tail.trim() : trimmed
}

function titleFromMessage(message: string) {
  const title = message.replace(/\s+/g, ' ').trim()
  if (!title) return 'New Codex session'
  if (title.length <= 48) return title
  return `${title.slice(0, 45)}...`
}

function normalizeTag(value: unknown) {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/\s+/g, '-')
}

function normalizeTags(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  const tags: Array<string> = []
  const seen = new Set<string>()
  for (const item of value) {
    const tag = normalizeTag(item)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

function normalizeSessionFilter(value: unknown): SessionFilter {
  if (
    value === 'recent' ||
    value === 'failed' ||
    value === 'tagged' ||
    value === 'archived'
  ) {
    return value
  }
  return 'all'
}

function searchValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (!value || typeof value !== 'object') return ''
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function searchTextFromMessage(message: CodexMessage) {
  const parts: Array<string> = []
  if (message.role) parts.push(message.role)
  if (message.toolName) parts.push(message.toolName)
  if (message.details) parts.push(searchValue(message.details))
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'text') parts.push(String(part.text ?? ''))
      if (part.type === 'thinking') parts.push(String(part.thinking ?? ''))
      if (part.type === 'toolCall') {
        parts.push(String(part.name ?? ''))
        parts.push(searchValue(part.arguments))
        parts.push(String(part.partialJson ?? ''))
      }
    }
  }
  return parts.join(' ')
}

function searchTextFromSession(session: SessionRecord) {
  return [
    session.key,
    session.friendlyId,
    session.label,
    session.title,
    session.derivedTitle,
    normalizeTags(session.tags).join(' '),
    ...session.messages.map(searchTextFromMessage),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function failedTaskSessionKeys() {
  const failedKeys = new Set<string>()
  for (const task of readTaskStore().tasks) {
    if (task.status !== 'failed') continue
    failedKeys.add(task.sessionKey)
    failedKeys.add(deriveFriendlyIdFromKey(task.sessionKey))
  }
  return failedKeys
}

function sessionHasFailedRun(
  session: SessionRecord,
  failedSessionKeys = new Set<string>(),
) {
  if (failedSessionKeys.has(session.key)) return true
  if (failedSessionKeys.has(session.friendlyId)) return true
  return session.messages.some((message) => message.isError === true)
}

function normalizeSession(
  session: SessionRecord,
  failedSessionKeys = new Set<string>(),
) {
  const lastMessage =
    session.lastMessage ??
    (session.messages.length > 0
      ? session.messages[session.messages.length - 1]
      : null)
  return {
    key: session.key,
    friendlyId: session.friendlyId,
    label: session.label,
    title: session.title,
    derivedTitle: session.derivedTitle,
    tags: normalizeTags(session.tags),
    archived: session.archived === true,
    hasFailedRun: sessionHasFailedRun(session, failedSessionKeys),
    updatedAt: session.updatedAt,
    lastMessage,
  }
}

function createSession(label?: string, key?: string): SessionRecord {
  const now = Date.now()
  const sessionKey = key && key.trim() ? key.trim() : randomUUID()
  const title = label || 'New Codex session'
  return {
    key: sessionKey,
    friendlyId: deriveFriendlyIdFromKey(sessionKey),
    label,
    title,
    derivedTitle: title,
    updatedAt: now,
    messages: [],
    lastMessage: null,
  }
}

function findSession(store: SessionStore, key: string) {
  return store.sessions.find(
    (session) => session.key === key || session.friendlyId === key,
  )
}

function ensureSession(key: string, label?: string) {
  const store = readStore()
  const existing = findSession(store, key)
  if (existing) {
    if (label) {
      existing.label = label
      existing.title = label
      existing.derivedTitle = label
      existing.updatedAt = Date.now()
      writeStore(store)
    }
    return existing
  }

  const session = createSession(label, key)
  store.sessions.unshift(session)
  writeStore(store)
  return session
}

function appendMessage(session: SessionRecord, message: CodexMessage) {
  session.messages.push(message)
  session.lastMessage = message
  session.updatedAt =
    typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
      ? message.timestamp
      : Date.now()

  const firstUserText = session.messages
    .filter((item) => item.role === 'user')
    .map(textFromMessage)
    .find((text) => text.length > 0)
  if (!session.label && firstUserText) {
    session.derivedTitle = titleFromMessage(firstUserText)
    session.title = session.derivedTitle
  }
  recordCommandArtifacts(session, message)
}

function textFromMessage(message: CodexMessage) {
  return Array.isArray(message.content)
    ? message.content
        .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
        .join('')
        .trim()
    : ''
}

function sanitizeArtifactSegment(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'artifact'
  )
}

function isPathInside(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function redactArtifactPath(filePath: string) {
  const resolved = path.resolve(filePath)
  const stateDir = path.resolve(getStateDir())
  const workdir = path.resolve(getCodexWorkdir())
  if (resolved === stateDir || isPathInside(stateDir, resolved)) {
    return resolved.replace(stateDir, '$CODEX_CLAW_STATE')
  }
  if (resolved === workdir || isPathInside(workdir, resolved)) {
    return resolved.replace(workdir, '$WORKSPACE')
  }
  const home = os.homedir()
  if (resolved === home || isPathInside(home, resolved)) {
    return resolved.replace(home, '~')
  }
  return path.basename(resolved)
}

function artifactTypeForPath(filePath: string): CodexArtifactType {
  const normalized = filePath.toLowerCase()
  if (normalized.endsWith('.patch') || normalized.endsWith('.diff')) {
    return 'patch'
  }
  if (normalized.endsWith('.log') || normalized.endsWith('.txt')) {
    return 'terminal-log'
  }
  if (
    normalized.endsWith('.tgz') ||
    normalized.endsWith('.zip') ||
    normalized.endsWith('.tar.gz') ||
    normalized.endsWith('sha256sums')
  ) {
    return 'package'
  }
  if (/\.(png|jpe?g|gif|webp)$/i.test(normalized)) return 'image'
  if (/\.(md|json)$/i.test(normalized)) return 'export'
  return 'file'
}

function artifactSafeToOpen(filePath: string, type: CodexArtifactType) {
  const resolved = path.resolve(filePath)
  const trustedRoot =
    resolved === path.resolve(getStateDir()) ||
    isPathInside(path.resolve(getStateDir()), resolved) ||
    resolved === path.resolve(getCodexWorkdir()) ||
    isPathInside(path.resolve(getCodexWorkdir()), resolved)
  if (!trustedRoot) return false
  return type !== 'package' && type !== 'file'
}

function artifactId(sessionKey: string, artifactPath: string, runId?: string) {
  return [
    sanitizeArtifactSegment(deriveFriendlyIdFromKey(sessionKey)),
    sanitizeArtifactSegment(runId || 'manual'),
    Buffer.from(path.resolve(artifactPath)).toString('base64url').slice(0, 24),
  ].join('-')
}

function upsertArtifact(record: CodexArtifactRecord) {
  const store = readArtifactStore()
  const index = store.artifacts.findIndex((artifact) => artifact.id === record.id)
  if (index >= 0) {
    store.artifacts[index] = record
  } else {
    store.artifacts.unshift(record)
  }
  writeArtifactStore(store)
}

function artifactRecordFromPath(input: {
  sessionKey: string
  filePath: string
  runId?: string
  source: CodexArtifactRecord['source']
  createdAt?: number
}) {
  const resolved = path.resolve(input.filePath)
  const stats = statSync(resolved)
  if (!stats.isFile()) return null
  const type = artifactTypeForPath(resolved)
  return {
    id: artifactId(input.sessionKey, resolved, input.runId),
    sessionKey: input.sessionKey,
    runId: input.runId,
    path: resolved,
    redactedPath: redactArtifactPath(resolved),
    type,
    createdAt: input.createdAt ?? stats.mtimeMs,
    safeToOpen: artifactSafeToOpen(resolved, type),
    size: stats.size,
    source: input.source,
  } satisfies CodexArtifactRecord
}

function writeCommandLogArtifact(input: {
  session: SessionRecord
  runId?: string
  content: string
  createdAt: number
}) {
  if (!input.content.trim()) return
  const sessionDir = path.join(
    getArtifactsDir(),
    sanitizeArtifactSegment(input.session.friendlyId),
  )
  mkdirSync(sessionDir, { recursive: true })
  const fileName =
    sanitizeArtifactSegment(input.runId || String(input.createdAt)) + '.log'
  const artifactPath = path.join(sessionDir, fileName)
  writeFileSync(artifactPath, input.content)
  const record = artifactRecordFromPath({
    sessionKey: input.session.key,
    filePath: artifactPath,
    runId: input.runId,
    source: 'command-log',
    createdAt: input.createdAt,
  })
  if (record) upsertArtifact(record)
}

function extractArtifactPathCandidates(value: string) {
  const candidates = new Set<string>()
  const pattern =
    /(?:"([^"]+\.(?:patch|diff|log|txt|md|json|tgz|zip|tar\.gz|sha256sums|png|jpe?g|gif|webp))"|([A-Za-z]:\\[^\s"'<>|]+\.(?:patch|diff|log|txt|md|json|tgz|zip|tar\.gz|sha256sums|png|jpe?g|gif|webp))|((?:\.{1,2}[\\/]|[\w.-]+[\\/])?[^\s"'<>|]+\.(?:patch|diff|log|txt|md|json|tgz|zip|tar\.gz|sha256sums|png|jpe?g|gif|webp)))/gi
  for (const match of value.matchAll(pattern)) {
    const candidate = match[1] || match[2] || match[3]
    if (candidate) candidates.add(candidate.replace(/[),.;:]+$/g, ''))
  }
  return [...candidates]
}

function resolveArtifactCandidate(candidate: string) {
  if (path.isAbsolute(candidate)) return path.resolve(candidate)
  return path.resolve(getCodexWorkdir(), candidate)
}

function recordDetectedFileArtifacts(input: {
  session: SessionRecord
  runId?: string
  command?: string
  output: string
  createdAt: number
}) {
  const text = [input.command, input.output].filter(Boolean).join('\n')
  for (const candidate of extractArtifactPathCandidates(text)) {
    const resolved = resolveArtifactCandidate(candidate)
    if (!existsSync(resolved)) continue
    try {
      const record = artifactRecordFromPath({
        sessionKey: input.session.key,
        filePath: resolved,
        runId: input.runId,
        source: 'detected-file',
        createdAt: input.createdAt,
      })
      if (record) upsertArtifact(record)
    } catch {
      // Ignore candidates that are not readable local files.
    }
  }
}

function recordCommandArtifacts(session: SessionRecord, message: CodexMessage) {
  if (message.role !== 'toolResult') return
  if (message.toolName !== 'command_execution') return
  const output = textFromMessage(message)
  const runId = message.toolCallId || message.id
  const createdAt =
    typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)
      ? message.timestamp
      : Date.now()
  writeCommandLogArtifact({ session, runId, content: output, createdAt })
  const command =
    typeof message.details?.command === 'string' ? message.details.command : ''
  recordDetectedFileArtifacts({
    session,
    runId,
    command,
    output,
    createdAt,
  })
}

function emit(sessionKey: string, event: CodexStreamEvent) {
  const keys = new Set([sessionKey, deriveFriendlyIdFromKey(sessionKey)])
  for (const key of keys) {
    const subscribers = listeners.get(key)
    if (!subscribers) continue
    for (const listener of subscribers) {
      listener(event)
    }
  }
}

function buildUserPrompt(input: SendCodexPromptInput) {
  const parts = [input.message.trim()].filter(Boolean)
  const profile = getRunProfile(input.runProfile)
  parts.push(
    `Run profile: ${profile.label} (sandbox: ${profile.sandbox}, approval: ${profile.approval})`,
  )
  if (input.thinking) {
    parts.push(`Requested thinking level: ${input.thinking}`)
  }
  if (input.attachments && input.attachments.length > 0) {
    parts.push(
      `Attached image count: ${input.attachments.length}. Review the attached image files when they are relevant to the request.`,
    )
  }
  if (input.contextBlock?.trim()) {
    parts.push(input.contextBlock.trim())
  }
  return parts.join('\n\n')
}

function buildCodexArgs(imagePaths: Array<string>, profile = getRunProfile()) {
  const args = [
    '-s',
    profile.sandbox || getCodexSandbox(),
    '-a',
    profile.approval || getCodexApproval(),
    '-C',
    getCodexWorkdir(),
  ]
  args.push('exec')
  args.push('--ignore-user-config')
  args.push('--json')
  args.push('--skip-git-repo-check')
  for (const imagePath of imagePaths) {
    args.push('--image')
    args.push(imagePath)
  }
  args.push('-')
  return args
}

function messageFromAssistantText(
  text: string,
  id = randomUUID(),
): CodexMessage {
  return {
    id,
    role: 'assistant',
    timestamp: Date.now(),
    content: [{ type: 'text', text }],
  }
}

function errorMessage(text: string): CodexMessage {
  return {
    id: randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
    isError: true,
    content: [{ type: 'text', text }],
  }
}

function imageContentFromAttachment(
  attachment: AttachmentInput,
): MessageContent {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: attachment.mimeType,
      data: attachment.content,
    },
  }
}

function contentFromUserInput(
  input: SendCodexPromptInput,
): Array<MessageContent> {
  const content: Array<MessageContent> = []

  for (const attachment of input.attachments ?? []) {
    if (!isSupportedImageAttachment(attachment)) continue
    content.push(imageContentFromAttachment(attachment))
  }

  if (input.message.trim()) {
    content.push({ type: 'text', text: input.message })
  } else if (content.length === 0) {
    content.push({ type: 'text', text: '' })
  }

  return content
}

function isSupportedImageAttachment(attachment: AttachmentInput) {
  return (
    isSupportedCodexImageMimeType(attachment.mimeType) &&
    attachment.content.trim().length > 0
  )
}

export function isSupportedCodexImageMimeType(mimeType: string) {
  return supportedImageMimeTypes.has(mimeType.trim().toLowerCase())
}

function attachmentExtension(mimeType: string) {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    default:
      return '.img'
  }
}

function prepareAttachmentFiles(
  runId: string,
  attachments: Array<AttachmentInput> | undefined,
): PreparedAttachmentFiles {
  const imageAttachments = attachments ?? []
  if (imageAttachments.length === 0) {
    return {
      imagePaths: [],
      cleanup() {},
    }
  }

  const attachmentsDir = mkdtempSync(
    path.join(os.tmpdir(), `codex-claw-${runId}-`),
  )
  const imagePaths: Array<string> = []

  try {
    imageAttachments.forEach((attachment, index) => {
      if (!isSupportedImageAttachment(attachment)) {
        throw new Error(
          'Unsupported attachment type. Please use PNG, JPG, GIF, or WebP images.',
        )
      }

      const imagePath = path.join(
        attachmentsDir,
        `image-${index + 1}${attachmentExtension(attachment.mimeType)}`,
      )
      writeFileSync(imagePath, Buffer.from(attachment.content, 'base64'))
      imagePaths.push(imagePath)
    })
  } catch (error) {
    rmSync(attachmentsDir, { recursive: true, force: true })
    throw error
  }

  return {
    imagePaths,
    cleanup() {
      rmSync(attachmentsDir, { recursive: true, force: true })
    },
  }
}

function extractTextFromContent(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const item = part as Record<string, unknown>
      if (typeof item.text === 'string') return item.text
      if (typeof item.delta === 'string') return item.delta
      if (typeof item.content === 'string') return item.content
      return ''
    })
    .join('')
}

function extractTextCandidate(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  const candidates = [
    item.text,
    item.delta,
    item.output_text,
    item.outputText,
    item.content,
  ]

  for (const candidate of candidates) {
    const text =
      typeof candidate === 'string'
        ? candidate
        : extractTextFromContent(candidate)
    if (text) return text
  }

  const message = item.message
  if (message && typeof message === 'object') {
    const text = extractTextCandidate(message)
    if (text) return text
  }

  return ''
}

function isAssistantJsonEvent(event: CodexExecJsonEvent) {
  const type = event.type ?? ''
  const itemType = event.item?.type ?? ''
  const role = event.item?.role ?? event.role ?? ''
  return (
    role === 'assistant' ||
    itemType === 'agent_message' ||
    itemType === 'assistant_message' ||
    type.includes('agent_message') ||
    type.includes('assistant') ||
    type.includes('output_text')
  )
}

function commandExecutionDetails(
  item: NonNullable<CodexExecJsonEvent['item']>,
) {
  const details: Record<string, unknown> = {}
  if (typeof item.command === 'string' && item.command.trim()) {
    details.command = item.command.trim()
  }
  if (typeof item.status === 'string' && item.status.trim()) {
    details.status = item.status.trim()
  }
  if (typeof item.exit_code === 'number') {
    details.exitCode = item.exit_code
  }
  return details
}

function commandExecutionStartedMessage(
  item: NonNullable<CodexExecJsonEvent['item']>,
): CodexMessage {
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const command = typeof item.command === 'string' ? item.command.trim() : ''
  return {
    id: id || undefined,
    role: 'assistant',
    timestamp: Date.now(),
    content: [
      {
        type: 'toolCall',
        id: id || undefined,
        name: 'command_execution',
        arguments: command ? { command } : undefined,
      },
    ],
  }
}

function commandExecutionCompletedMessage(
  item: NonNullable<CodexExecJsonEvent['item']>,
): CodexMessage {
  const id = typeof item.id === 'string' ? item.id.trim() : ''
  const output = String(item.aggregated_output ?? '').trim()
  const status = typeof item.status === 'string' ? item.status.trim() : ''
  const exitCode = item.exit_code
  const isError =
    (typeof exitCode === 'number' && exitCode !== 0) ||
    (status.length > 0 && status !== 'completed')

  return {
    id: id ? `${id}:result` : undefined,
    role: 'toolResult',
    toolCallId: id || undefined,
    toolName: 'command_execution',
    timestamp: Date.now(),
    details: commandExecutionDetails(item),
    isError,
    content: [
      {
        type: 'text',
        text: output || status || 'Command finished.',
      },
    ],
  }
}

function processCommandExecutionJsonEvent(
  event: CodexExecJsonEvent,
): ProcessedCodexJsonLine | null {
  if (event.item?.type !== 'command_execution') return null
  if (event.type === 'item.started') {
    return {
      kind: 'message-delta',
      message: commandExecutionStartedMessage(event.item),
    }
  }
  if (event.type === 'item.completed') {
    return {
      kind: 'message-delta',
      message: commandExecutionCompletedMessage(event.item),
    }
  }
  return null
}

export function processCodexJsonLine(
  line: string,
): ProcessedCodexJsonLine | null {
  if (!line.startsWith('{')) return null
  try {
    const event = JSON.parse(line) as CodexExecJsonEvent
    const commandEvent = processCommandExecutionJsonEvent(event)
    if (commandEvent) return commandEvent
    if (!isAssistantJsonEvent(event)) return null

    const text =
      extractTextCandidate(event.item) ||
      extractTextCandidate(event) ||
      extractTextFromContent(event.content)

    if (!text) return null

    if (
      event.type === 'item.completed' ||
      event.type === 'response.output_text.done' ||
      event.type === 'assistant.completed'
    ) {
      return { kind: 'assistant-final', text }
    }

    if (
      event.type?.includes('delta') ||
      event.type?.includes('updated') ||
      event.type?.includes('stream')
    ) {
      return { kind: 'assistant-delta', text }
    }

    return null
  } catch {
    return null
  }
}

export function mergeAssistantText(
  currentText: string,
  incomingText: string,
  kind: ProcessedCodexJsonLine['kind'],
) {
  if (!incomingText) return currentText
  if (kind === 'assistant-final') return incomingText
  if (!currentText) return incomingText
  if (incomingText.startsWith(currentText)) return incomingText
  if (currentText.endsWith(incomingText)) return currentText
  return `${currentText}${incomingText}`
}

function runCodexExec(
  sessionKey: string,
  prompt: string,
  runId: string,
  attachments?: Array<AttachmentInput>,
  runProfile?: RunProfileId,
) {
  const store = readStore()
  const session = ensureSession(sessionKey)
  const command =
    process.platform === 'win32'
      ? getCodexCommand()
      : resolveCodexCommand(getCodexCommand())
  const preparedAttachments = prepareAttachmentFiles(runId, attachments)
  const args = buildCodexArgs(
    preparedAttachments.imagePaths,
    getRunProfile(runProfile),
  )
  const child = spawn(command, args, {
    cwd: getCodexWorkdir(),
    env: process.env,
    shell: process.platform === 'win32',
  })
  runningTasks.set(runId, child)
  updateTask(runId, 'running')

  let stdoutBuffer = ''
  let stderrBuffer = ''
  let emittedFinal = false
  let assistantText = ''
  let streamSeq = 0

  function emitStreamMessage(message: CodexMessage, state: 'delta' | 'final') {
    streamSeq += 1
    emit(session.key, {
      event: 'chat',
      seq: streamSeq,
      stateVersion,
      payload: {
        runId,
        sessionKey: session.key,
        state,
        seq: streamSeq,
        message,
      },
    })
  }

  function emitAssistantDelta(text: string) {
    emitStreamMessage(messageFromAssistantText(text, runId), 'delta')
  }

  function emitFinalMessage(message: CodexMessage) {
    emitStreamMessage(message, 'final')
  }

  function appendFinalText(text: string) {
    const message = messageFromAssistantText(text, runId)
    appendMessage(session, message)
    writeStore(store)
    emittedFinal = true
    emitFinalMessage(message)
  }

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const processed = processCodexJsonLine(line.trim())
      if (!processed) continue
      if (processed.kind === 'message-delta') {
        appendMessage(session, processed.message)
        writeStore(store)
        emitStreamMessage(processed.message, 'delta')
        continue
      }
      assistantText = mergeAssistantText(
        assistantText,
        processed.text,
        processed.kind,
      )
      if (processed.kind === 'assistant-delta') {
        emitAssistantDelta(assistantText)
        continue
      }
      if (!emittedFinal) appendFinalText(assistantText)
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer += chunk
  })

  child.stdin.end(prompt)

  function currentTaskStatus() {
    return readTaskStore().tasks.find((task) => task.id === runId)?.status
  }

  child.on('error', (error) => {
    preparedAttachments.cleanup()
    runningTasks.delete(runId)
    updateTask(runId, 'failed', {
      note: error.message,
      exitCode: null,
    })
    const message = errorMessage(error.message)
    appendMessage(session, message)
    writeStore(store)
    emit(session.key, {
      event: 'chat',
      stateVersion,
      payload: {
        runId,
        sessionKey: session.key,
        state: 'error',
        message,
      },
    })
  })

  child.on('close', (code) => {
    preparedAttachments.cleanup()
    runningTasks.delete(runId)
    if (currentTaskStatus() === 'canceled') {
      updateTask(runId, 'canceled', { exitCode: code })
      emit(session.key, {
        event: 'chat',
        stateVersion,
        payload: {
          runId,
          sessionKey: session.key,
          state: 'aborted',
        },
      })
      return
    }
    const trailing = processCodexJsonLine(stdoutBuffer.trim())
    if (trailing) {
      if (trailing.kind === 'message-delta') {
        appendMessage(session, trailing.message)
        writeStore(store)
        emitStreamMessage(trailing.message, 'delta')
      } else {
        assistantText = mergeAssistantText(
          assistantText,
          trailing.text,
          trailing.kind,
        )
        if (
          !emittedFinal &&
          (trailing.kind === 'assistant-final' || code === 0)
        ) {
          appendFinalText(assistantText)
          updateTask(runId, 'completed', { exitCode: code })
          return
        }
        if (emittedFinal && code === 0) {
          updateTask(runId, 'completed', { exitCode: code })
          return
        }
      }
    }

    if (emittedFinal && code === 0) {
      updateTask(runId, 'completed', { exitCode: code })
      return
    }
    if (code === 0 && assistantText) {
      appendFinalText(assistantText)
      updateTask(runId, 'completed', { exitCode: code })
      return
    }

    const detail = stderrBuffer.trim()
    const taskErrorDetail =
      detail ||
      (code === 0
        ? 'Codex CLI finished without returning an assistant message.'
        : 'Codex CLI exited with status ' + (code ?? 'unknown') + '.')
    updateTask(runId, 'failed', {
      note: taskErrorDetail,
      exitCode: code,
    })
    const fallback =
      code === 0
        ? 'Codex CLI finished without returning an assistant message.'
        : `Codex CLI exited with status ${code ?? 'unknown'}.`
    const message = errorMessage(detail ? `${fallback}\n\n${detail}` : fallback)
    appendMessage(session, message)
    writeStore(store)
    emit(session.key, {
      event: 'chat',
      stateVersion,
      payload: {
        runId,
        sessionKey: session.key,
        state: 'error',
        message,
      },
    })
  })
}

function workspaceIdFromName(name: string, workspaces: Array<WorkspaceRecord>) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'workspace'
  const taken = new Set(workspaces.map((workspace) => workspace.id))
  if (!taken.has(base)) return base

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!taken.has(candidate)) return candidate
  }

  return randomUUID()
}

function findWorkspace(store: WorkspaceStore, id: string) {
  const workspaceId = id.trim()
  return store.workspaces.find((workspace) => workspace.id === workspaceId)
}

function quoteCommandArg(value: string) {
  return JSON.stringify(value)
}

function runTool(command: string, args: Array<string>, cwd: string) {
  const resolvedCommand = resolveCodexCommand(command)
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand)) {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', resolvedCommand, ...args], {
      cwd,
      env: process.env,
      stdio: 'pipe',
      encoding: 'utf8',
    })
  }

  return spawnSync(resolvedCommand, args, {
    cwd,
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

function commandOutput(result: ReturnType<typeof spawnSync>) {
  return String(
    result.stdout || result.stderr || result.error?.message || '',
  ).trim()
}

function checkCodexCli(workspace: WorkspaceRecord): WorkspaceHealthCheck {
  const cwd = existsSync(workspace.codexWorkdir)
    ? workspace.codexWorkdir
    : process.cwd()
  const result = runTool(workspace.codexCommand, ['--version'], cwd)
  const output = commandOutput(result)

  if (result.status === 0) {
    return {
      id: 'codex-cli',
      label: 'Codex CLI',
      status: 'ok',
      summary: output || 'Codex CLI is available.',
      detail: workspace.codexCommand,
    }
  }

  return {
    id: 'codex-cli',
    label: 'Codex CLI',
    status: 'error',
    summary: 'Codex CLI command failed.',
    detail: output || `Unable to run ${workspace.codexCommand} --version.`,
    fixCommand:
      workspace.codexCommand === 'codex'
        ? 'npm install -g @openai/codex'
        : 'Set this workspace to a working Codex CLI command.',
  }
}

function checkCodexAuth(): WorkspaceHealthCheck {
  if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) {
    return {
      id: 'auth',
      label: 'Auth',
      status: 'ok',
      summary: 'API key environment variable is available.',
    }
  }

  const authPath = path.join(os.homedir(), '.codex', 'auth.json')
  if (existsSync(authPath)) {
    return {
      id: 'auth',
      label: 'Auth',
      status: 'ok',
      summary: 'Codex auth file is available.',
      detail: authPath,
    }
  }

  return {
    id: 'auth',
    label: 'Auth',
    status: 'warning',
    summary: 'Codex auth was not detected.',
    detail: 'Set OPENAI_API_KEY/CODEX_API_KEY or sign in with the Codex CLI.',
    fixCommand: 'codex login',
  }
}

function checkGitStatus(workspace: WorkspaceRecord): WorkspaceHealthCheck {
  if (!existsSync(workspace.codexWorkdir)) {
    return {
      id: 'git',
      label: 'Git',
      status: 'error',
      summary: 'Workspace directory does not exist.',
      detail: workspace.codexWorkdir,
      fixCommand: `mkdir ${quoteCommandArg(workspace.codexWorkdir)}`,
    }
  }

  const repoCheck = runTool(
    'git',
    ['rev-parse', '--is-inside-work-tree'],
    workspace.codexWorkdir,
  )
  if (repoCheck.status !== 0) {
    return {
      id: 'git',
      label: 'Git',
      status: 'warning',
      summary: 'Workspace is not a git repository.',
      detail: commandOutput(repoCheck),
      fixCommand: `git -C ${quoteCommandArg(workspace.codexWorkdir)} init`,
    }
  }

  const status = runTool('git', ['status', '--short'], workspace.codexWorkdir)
  const output = commandOutput(status)
  return {
    id: 'git',
    label: 'Git',
    status: output ? 'warning' : 'ok',
    summary: output
      ? 'Git repository has local changes.'
      : 'Git repository is clean.',
    detail: output,
  }
}

function checkNodeVersion(): WorkspaceHealthCheck {
  const version = process.version
  const major = Number(version.replace(/^v/, '').split('.')[0] ?? 0)
  const supported = Number.isFinite(major) && major >= 20

  return {
    id: 'node',
    label: 'Node',
    status: supported ? 'ok' : 'error',
    summary: supported ? `${version} is supported.` : `${version} is too old.`,
    detail: 'CodexClaw expects Node.js 20 or newer.',
    fixCommand: supported ? undefined : 'Install Node.js 20 or newer.',
  }
}

function checkPnpm(workspace: WorkspaceRecord): WorkspaceHealthCheck {
  const cwd = existsSync(workspace.codexWorkdir)
    ? workspace.codexWorkdir
    : process.cwd()
  const result = runTool('pnpm', ['--version'], cwd)
  const output = commandOutput(result)

  if (result.status === 0) {
    return {
      id: 'pnpm',
      label: 'pnpm',
      status: 'ok',
      summary: `pnpm ${output} is available.`,
    }
  }

  return {
    id: 'pnpm',
    label: 'pnpm',
    status: 'warning',
    summary: 'pnpm was not found on PATH.',
    detail: output,
    fixCommand: 'corepack enable pnpm',
  }
}

function checkStatePath(workspace: WorkspaceRecord): WorkspaceHealthCheck {
  const tempPath = path.join(
    workspace.stateDir,
    `.health-${process.pid}-${Date.now()}.tmp`,
  )

  try {
    mkdirSync(workspace.stateDir, { recursive: true })
    writeFileSync(tempPath, 'ok')
    rmSync(tempPath, { force: true })
    return {
      id: 'state-path',
      label: 'State path',
      status: 'ok',
      summary: 'State path is writable.',
      detail: workspace.stateDir,
    }
  } catch (err) {
    return {
      id: 'state-path',
      label: 'State path',
      status: 'error',
      summary: 'State path is not writable.',
      detail: err instanceof Error ? err.message : String(err),
      fixCommand: `mkdir ${quoteCommandArg(workspace.stateDir)}`,
    }
  } finally {
    rmSync(tempPath, { force: true })
  }
}

export function getCodexWorkspaceHealth(
  workspaceId?: string,
): WorkspaceHealthPayload {
  const store = readWorkspaceStore()
  const workspace = workspaceId
    ? findWorkspace(store, workspaceId)
    : getActiveWorkspace()

  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }

  const checks = [
    checkCodexCli(workspace),
    checkCodexAuth(),
    checkGitStatus(workspace),
    checkNodeVersion(),
    checkPnpm(workspace),
    checkStatePath(workspace),
  ]

  return {
    ok: checks.every((check) => check.status !== 'error'),
    workspaceId: workspace.id,
    checkedAt: Date.now(),
    checks,
  }
}

export function listCodexWorkspaces() {
  const store = readWorkspaceStore()
  return {
    activeWorkspaceId: store.activeWorkspaceId,
    workspaces: store.workspaces,
    health: getCodexWorkspaceHealth(store.activeWorkspaceId),
  }
}

export function createCodexWorkspace(input: WorkspaceInput) {
  const store = readWorkspaceStore()
  const now = Date.now()
  const activeWorkspace = getActiveWorkspace()
  const name = normalizeRequiredString(input.name, 'Workspace')
  const id = workspaceIdFromName(name, store.workspaces)
  const workspace = normalizeWorkspaceRecord(
    {
      id,
      name,
      codexCommand: input.codexCommand,
      codexSandbox: input.codexSandbox,
      codexApproval: input.codexApproval,
      runProfile: input.runProfile,
      codexWorkdir: input.codexWorkdir,
      stateDir: input.stateDir,
      createdAt: now,
      updatedAt: now,
    },
    {
      ...activeWorkspace,
      id,
      name,
      createdAt: now,
      updatedAt: now,
    },
  )

  store.workspaces.push(workspace)
  if (input.active) store.activeWorkspaceId = workspace.id
  writeWorkspaceStore(store)

  return {
    ok: true,
    activeWorkspaceId: store.activeWorkspaceId,
    workspace,
    health: getCodexWorkspaceHealth(store.activeWorkspaceId),
  }
}

export function patchCodexWorkspace(input: WorkspaceInput) {
  const id = input.id?.trim()
  if (!id) throw new Error('workspace id required')

  const store = readWorkspaceStore()
  const index = store.workspaces.findIndex((workspace) => workspace.id === id)
  if (index < 0) throw new Error(`Workspace not found: ${id}`)

  const existing = store.workspaces[index]
  const nextWorkspace = normalizeWorkspaceRecord(
    {
      ...existing,
      name: input.name ?? existing.name,
      codexCommand: input.codexCommand ?? existing.codexCommand,
      codexSandbox: input.codexSandbox ?? existing.codexSandbox,
      codexApproval: input.codexApproval ?? existing.codexApproval,
      runProfile: input.runProfile ?? existing.runProfile,
      codexWorkdir: input.codexWorkdir ?? existing.codexWorkdir,
      stateDir: input.stateDir ?? existing.stateDir,
      updatedAt: Date.now(),
    },
    existing,
  )

  store.workspaces[index] = nextWorkspace
  if (input.active) store.activeWorkspaceId = nextWorkspace.id
  writeWorkspaceStore(store)

  return {
    ok: true,
    activeWorkspaceId: store.activeWorkspaceId,
    workspace: nextWorkspace,
    health: getCodexWorkspaceHealth(store.activeWorkspaceId),
  }
}

export function deleteCodexWorkspace(id: string) {
  const workspaceId = id.trim()
  if (!workspaceId) throw new Error('workspace id required')
  if (workspaceId === defaultWorkspaceId) {
    throw new Error('Default workspace cannot be removed.')
  }

  const store = readWorkspaceStore()
  const index = store.workspaces.findIndex(
    (workspace) => workspace.id === workspaceId,
  )
  if (index < 0) throw new Error(`Workspace not found: ${workspaceId}`)

  store.workspaces.splice(index, 1)
  if (store.activeWorkspaceId === workspaceId) {
    store.activeWorkspaceId = defaultWorkspaceId
  }
  writeWorkspaceStore(store)

  return {
    ok: true,
    activeWorkspaceId: store.activeWorkspaceId,
    health: getCodexWorkspaceHealth(store.activeWorkspaceId),
  }
}

export function activateCodexWorkspace(id: string) {
  const workspaceId = id.trim()
  const store = readWorkspaceStore()
  const workspace = findWorkspace(store, workspaceId)
  if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`)

  store.activeWorkspaceId = workspace.id
  writeWorkspaceStore(store)

  return {
    ok: true,
    activeWorkspaceId: store.activeWorkspaceId,
    workspace,
    health: getCodexWorkspaceHealth(store.activeWorkspaceId),
  }
}

export function getCodexPaths(): CodexPathsPayload {
  const stateDir = getStateDir()
  return {
    agentId: 'codex-cli',
    stateDir,
    sessionsDir: stateDir,
    storePath: getStorePath(),
    workspacesStorePath: getWorkspacesStorePath(),
    workspace: getActiveWorkspace(),
  }
}

export function subscribeCodexEvents(
  key: string,
  listener: (event: CodexStreamEvent) => void,
) {
  const normalizedKey = key || 'main'
  const subscribers = listeners.get(normalizedKey) ?? new Set()
  subscribers.add(listener)
  listeners.set(normalizedKey, subscribers)

  return function unsubscribe() {
    subscribers.delete(listener)
    if (subscribers.size === 0) {
      listeners.delete(normalizedKey)
    }
  }
}

export function sendCodexPrompt(input: SendCodexPromptInput) {
  const profile = getRunProfile(input.runProfile)
  if (profile.requiresConfirmation && !input.confirmedRisk) {
    throw new Error('Run profile requires explicit confirmation.')
  }
  const store = readStore()
  const session = ensureSession(input.sessionKey || 'main')
  const prompt = buildUserPrompt(input)
  const runId = randomUUID()
  const messageId = input.idempotencyKey || randomUUID()

  const userMessage: CodexMessage = {
    id: messageId,
    clientId: input.idempotencyKey,
    role: 'user',
    timestamp: Date.now(),
    details: {
      taskId: runId,
      runProfile: profile.id,
      sandbox: profile.sandbox,
      approval: profile.approval,
    },
    content: contentFromUserInput(input),
  }
  appendMessage(session, userMessage)
  writeStore(store)

  createTaskRecord({
    id: runId,
    sessionKey: session.key,
    messageId,
    prompt,
    runProfile: profile.id,
    retryOf: input.retryOf,
    snapshot: {
      sessionKey: session.key,
      message: input.message,
      thinking: input.thinking,
      attachments: input.attachments,
      contextBlock: input.contextBlock,
      runProfile: profile.id,
      confirmedRisk: input.confirmedRisk,
    },
  })

  emit(session.key, {
    event: 'chat',
    stateVersion,
    payload: {
      runId,
      sessionKey: session.key,
      state: 'queued',
      message: userMessage,
    },
  })

  runCodexExec(session.key, prompt, runId, input.attachments, profile.id)

  return { runId, sessionKey: session.key }
}

export function getCodexHistory(input: {
  sessionKey?: string
  friendlyId?: string
  limit?: number
}) {
  const key = input.sessionKey || input.friendlyId || 'main'
  const session = ensureSession(key)
  const limit =
    typeof input.limit === 'number' && Number.isFinite(input.limit)
      ? input.limit
      : 200
  return {
    sessionKey: session.key,
    sessionId: session.key,
    messages: session.messages.slice(-limit),
  }
}

export function listCodexSessions(input: ListCodexSessionsInput = {}) {
  const store = readStore()
  const query = typeof input.query === 'string' ? input.query.trim() : ''
  const normalizedQuery = query.toLowerCase()
  const filter = normalizeSessionFilter(input.filter)
  const tag = normalizeTag(input.tag)
  const failedKeys = failedTaskSessionKeys()
  let sessions = store.sessions.slice()

  if (filter === 'archived') {
    sessions = sessions.filter((session) => session.archived === true)
  } else if (!input.includeArchived) {
    sessions = sessions.filter((session) => session.archived !== true)
  }

  if (filter === 'failed') {
    sessions = sessions.filter((session) =>
      sessionHasFailedRun(session, failedKeys),
    )
  }

  if (filter === 'tagged') {
    sessions = sessions.filter((session) => normalizeTags(session.tags).length)
  }

  if (tag) {
    sessions = sessions.filter((session) =>
      normalizeTags(session.tags).includes(tag),
    )
  }

  if (normalizedQuery) {
    sessions = sessions.filter((session) =>
      searchTextFromSession(session).includes(normalizedQuery),
    )
  }

  return {
    sessions: sessions
      .map((session) => normalizeSession(session, failedKeys))
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }
}

function isTerminalTaskStatus(status: CodexTaskStatus) {
  return status === 'completed' || status === 'failed' || status === 'canceled'
}

function publicTaskRecord(task: CodexTaskRecord) {
  return {
    id: task.id,
    sessionKey: task.sessionKey,
    messageId: task.messageId,
    message: task.message,
    runProfile: task.runProfile,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    durationMs: task.durationMs,
    exitCode: task.exitCode,
    error: task.error,
    retryOf: task.retryOf,
    events: task.events,
  }
}

export function listCodexTasks() {
  const store = readTaskStore()
  let changed = false
  for (const task of store.tasks) {
    if (!isTerminalTaskStatus(task.status) && !runningTasks.has(task.id)) {
      appendTaskEvent(
        task,
        'failed',
        'Task process is not attached to the current CodexClaw server.',
      )
      changed = true
    } else if (!task.durationMs && task.startedAt) {
      task.durationMs = taskDuration(task)
    }
  }
  if (changed) writeTaskStore(store)
  return {
    tasks: store.tasks
      .slice()
      .sort((first, second) => second.createdAt - first.createdAt)
      .map(publicTaskRecord),
  }
}

export function listCodexArtifacts(input: {
  sessionKey?: string
  friendlyId?: string
}) {
  const key = input.sessionKey || input.friendlyId || ''
  const session = key ? findSession(readStore(), key) : null
  const sessionKeys = new Set<string>()
  if (session) {
    sessionKeys.add(session.key)
    sessionKeys.add(session.friendlyId)
  } else if (key) {
    sessionKeys.add(key)
    sessionKeys.add(deriveFriendlyIdFromKey(key))
  }
  const artifacts = readArtifactStore().artifacts
    .filter((artifact) => {
      if (sessionKeys.size === 0) return true
      return sessionKeys.has(artifact.sessionKey)
    })
    .filter((artifact) => existsSync(artifact.path))
    .sort((first, second) => second.createdAt - first.createdAt)

  return {
    artifacts,
    manifest: {
      exportedAt: new Date().toISOString(),
      sessionKey: session?.key ?? key,
      artifactCount: artifacts.length,
      artifacts: artifacts.map((artifact) => ({
        id: artifact.id,
        type: artifact.type,
        path: artifact.redactedPath,
        createdAt: artifact.createdAt,
        runId: artifact.runId,
        safeToOpen: artifact.safeToOpen,
        size: artifact.size,
        source: artifact.source,
      })),
    },
  }
}

export function getCodexArtifactFile(input: {
  id: string
  sessionKey?: string
  friendlyId?: string
}) {
  const payload = listCodexArtifacts({
    sessionKey: input.sessionKey,
    friendlyId: input.friendlyId,
  })
  const artifact = payload.artifacts.find((item) => item.id === input.id)
  if (!artifact) throw new Error('Artifact not found.')
  if (!artifact.safeToOpen) throw new Error('Artifact is not safe to open.')
  return {
    artifact,
    content: readFileSync(artifact.path),
  }
}

export function cancelCodexTask(taskId: string) {
  const id = taskId.trim()
  if (!id) throw new Error('task id required')
  const store = readTaskStore()
  const task = store.tasks.find((item) => item.id === id)
  if (!task) throw new Error('Task not found: ' + id)
  if (isTerminalTaskStatus(task.status)) {
    return { ok: true, task: publicTaskRecord(task) }
  }
  const child = runningTasks.get(id)
  if (!child) {
    appendTaskEvent(
      task,
      'failed',
      'Task process is not attached to the current CodexClaw server.',
    )
    writeTaskStore(store)
    throw new Error('Task is not running.')
  }
  appendTaskEvent(task, 'canceled', 'Canceled by user.')
  writeTaskStore(store)
  child.kill()
  emit(task.sessionKey, {
    event: 'chat',
    stateVersion,
    payload: {
      runId: id,
      sessionKey: task.sessionKey,
      state: 'aborted',
    },
  })
  return { ok: true, task: publicTaskRecord(task) }
}

export function retryCodexTask(taskId: string) {
  const id = taskId.trim()
  if (!id) throw new Error('task id required')
  const store = readTaskStore()
  const task = store.tasks.find((item) => item.id === id)
  if (!task) throw new Error('Task not found: ' + id)
  if (task.status !== 'failed' && task.status !== 'canceled') {
    throw new Error('Only failed or canceled tasks can be retried.')
  }
  const result = sendCodexPrompt({
    ...task.snapshot,
    retryOf: task.id,
    idempotencyKey: randomUUID(),
  })
  return {
    ok: true,
    retryOf: task.id,
    ...result,
  }
}

export function patchCodexSession(input: {
  key?: string
  label?: string
  tags?: Array<string>
  archived?: boolean
}) {
  const session = ensureSession(input.key || randomUUID(), input.label)
  let changed = false

  if (Array.isArray(input.tags)) {
    session.tags = normalizeTags(input.tags)
    changed = true
  }

  if (typeof input.archived === 'boolean') {
    session.archived = input.archived
    changed = true
  }

  if (changed) {
    session.updatedAt = Date.now()
    writeStore(readStore())
  }

  return {
    ok: true,
    key: session.key,
    entry: normalizeSession(session, failedTaskSessionKeys()),
  }
}

export function resolveCodexSession(key: string) {
  const store = readStore()
  const session = findSession(store, key)
  return {
    ok: Boolean(session),
    key: session?.key,
  }
}

export function deleteCodexSession(key: string) {
  const store = readStore()
  const index = store.sessions.findIndex(
    (session) => session.key === key || session.friendlyId === key,
  )
  if (index >= 0) {
    store.sessions.splice(index, 1)
    writeStore(store)
  }
  return { ok: true, sessionKey: key }
}

export function codexCliCheck() {
  const health = getCodexWorkspaceHealth()
  const codexCheck = health.checks.find((check) => check.id === 'codex-cli')

  if (codexCheck?.status !== 'error') {
    return { ok: true, health }
  }

  throw new Error(
    codexCheck.detail ||
      'Codex CLI command failed. Set this workspace to a working Codex CLI command.',
  )
}

export function resetCodexServerStateForTests() {
  storeCache = null
  workspaceStoreCache = null
  taskStoreCache = null
  artifactStoreCache = null
  runningTasks.clear()
  stateVersion = 0
}
