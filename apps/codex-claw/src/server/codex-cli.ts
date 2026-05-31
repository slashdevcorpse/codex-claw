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
  updatedAt: number
  messages: Array<CodexMessage>
  lastMessage?: CodexMessage | null
}

type SessionStore = {
  version: 1
  sessions: Array<SessionRecord>
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
  codexWorkdir?: string
  stateDir?: string
  active?: boolean
}

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
let storeCache: SessionStore | null = null
let workspaceStoreCache: WorkspaceStore | null = null
let stateVersion = 0

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

function getCodexCommand() {
  return getActiveWorkspace().codexCommand
}

function getCodexSandbox() {
  return getActiveWorkspace().codexSandbox
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
  return {
    id: normalizeRequiredString(value.id, fallback.id),
    name: normalizeRequiredString(value.name, fallback.name),
    codexCommand: normalizeRequiredString(
      value.codexCommand,
      fallback.codexCommand,
    ),
    codexSandbox: normalizeSandbox(value.codexSandbox || fallback.codexSandbox),
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

function normalizeSession(session: SessionRecord) {
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
}

function textFromMessage(message: CodexMessage) {
  return Array.isArray(message.content)
    ? message.content
        .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
        .join('')
        .trim()
    : ''
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

function buildCodexArgs(imagePaths: Array<string>) {
  const args = ['-s', getCodexSandbox(), '-C', getCodexWorkdir()]
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
) {
  const store = readStore()
  const session = ensureSession(sessionKey)
  const command =
    process.platform === 'win32'
      ? getCodexCommand()
      : resolveCodexCommand(getCodexCommand())
  const preparedAttachments = prepareAttachmentFiles(runId, attachments)
  const args = buildCodexArgs(preparedAttachments.imagePaths)
  const child = spawn(command, args, {
    cwd: getCodexWorkdir(),
    env: process.env,
    shell: process.platform === 'win32',
  })

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

  child.on('error', (error) => {
    preparedAttachments.cleanup()
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
          return
        }
        if (emittedFinal && code === 0) return
      }
    }

    if (emittedFinal && code === 0) return
    if (code === 0 && assistantText) {
      appendFinalText(assistantText)
      return
    }

    const detail = stderrBuffer.trim()
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
  const store = readStore()
  const session = ensureSession(input.sessionKey || 'main')
  const prompt = buildUserPrompt(input)

  const userMessage: CodexMessage = {
    id: input.idempotencyKey || randomUUID(),
    clientId: input.idempotencyKey,
    role: 'user',
    timestamp: Date.now(),
    content: contentFromUserInput(input),
  }
  appendMessage(session, userMessage)
  writeStore(store)

  const runId = randomUUID()
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

  runCodexExec(session.key, prompt, runId, input.attachments)

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

export function listCodexSessions() {
  const store = readStore()
  return {
    sessions: store.sessions
      .map(normalizeSession)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }
}

export function patchCodexSession(input: { key?: string; label?: string }) {
  const session = ensureSession(input.key || randomUUID(), input.label)
  return {
    ok: true,
    key: session.key,
    entry: normalizeSession(session),
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
  stateVersion = 0
}
