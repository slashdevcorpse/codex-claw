import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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
}

type SendCodexPromptInput = {
  sessionKey: string
  message: string
  thinking?: string
  attachments?: Array<AttachmentInput>
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
  item?: {
    type?: string
    text?: string
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
}

const listeners = new Map<string, Set<(event: CodexStreamEvent) => void>>()
let storeCache: SessionStore | null = null
let stateVersion = 0

function getStateDir() {
  const configured = process.env.CODEX_CLAW_STATE_DIR?.trim()
  if (configured) return path.resolve(configured)
  return path.join(process.cwd(), '.codex-claw')
}

function getStorePath() {
  return path.join(getStateDir(), 'sessions.json')
}

function getCodexCommand() {
  return process.env.CODEX_CLI_COMMAND?.trim() || 'codex'
}

function getCodexSandbox() {
  return process.env.CODEX_CLI_SANDBOX?.trim() || 'read-only'
}

function getCodexWorkdir() {
  const configured = process.env.CODEX_CLI_WORKDIR?.trim()
  if (configured) return path.resolve(configured)
  return process.cwd()
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
      `Attachments were provided, but CodexClaw alpha currently sends text prompts only. Attachment count: ${input.attachments.length}.`,
    )
  }
  return parts.join('\n\n')
}

function buildCodexArgs(prompt: string) {
  const args = ['-s', getCodexSandbox(), '-C', getCodexWorkdir()]
  args.push('exec')
  args.push('--ignore-user-config')
  args.push('--json')
  args.push('--skip-git-repo-check')
  args.push(prompt)
  return args
}

function messageFromAssistantText(text: string): CodexMessage {
  return {
    id: randomUUID(),
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

function processCodexJsonLine(line: string) {
  if (!line.startsWith('{')) return null
  try {
    const event = JSON.parse(line) as CodexExecJsonEvent
    if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
      const text = typeof event.item.text === 'string' ? event.item.text : ''
      return text ? messageFromAssistantText(text) : null
    }
  } catch {
    return null
  }
  return null
}

function runCodexExec(sessionKey: string, prompt: string, runId: string) {
  const store = readStore()
  const session = ensureSession(sessionKey)
  const command = getCodexCommand()
  const args = buildCodexArgs(prompt)
  const child = spawn(command, args, {
    cwd: getCodexWorkdir(),
    env: process.env,
    shell: process.platform === 'win32',
  })

  let stdoutBuffer = ''
  let stderrBuffer = ''
  let emittedFinal = false

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const message = processCodexJsonLine(line.trim())
      if (!message) continue
      appendMessage(session, message)
      writeStore(store)
      emittedFinal = true
      emit(session.key, {
        event: 'chat',
        stateVersion,
        payload: {
          runId,
          sessionKey: session.key,
          state: 'final',
          message,
        },
      })
    }
  })

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    stderrBuffer += chunk
  })

  child.on('error', (error) => {
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
    const trailing = processCodexJsonLine(stdoutBuffer.trim())
    if (trailing) {
      appendMessage(session, trailing)
      writeStore(store)
      emittedFinal = true
      emit(session.key, {
        event: 'chat',
        stateVersion,
        payload: {
          runId,
          sessionKey: session.key,
          state: 'final',
          message: trailing,
        },
      })
      return
    }

    if (emittedFinal && code === 0) return

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

export function getCodexPaths(): CodexPathsPayload {
  const stateDir = getStateDir()
  return {
    agentId: 'codex-cli',
    stateDir,
    sessionsDir: stateDir,
    storePath: getStorePath(),
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

export async function sendCodexPrompt(input: SendCodexPromptInput) {
  const store = readStore()
  const session = ensureSession(input.sessionKey || 'main')
  const prompt = buildUserPrompt(input)

  const userMessage: CodexMessage = {
    id: input.idempotencyKey || randomUUID(),
    clientId: input.idempotencyKey,
    role: 'user',
    timestamp: Date.now(),
    content: [{ type: 'text', text: input.message }],
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

  runCodexExec(session.key, prompt, runId)

  return { runId, sessionKey: session.key }
}

export async function getCodexHistory(input: {
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

export async function listCodexSessions() {
  const store = readStore()
  return {
    sessions: store.sessions
      .map(normalizeSession)
      .sort((a, b) => b.updatedAt - a.updatedAt),
  }
}

export async function patchCodexSession(input: {
  key?: string
  label?: string
}) {
  const session = ensureSession(input.key || randomUUID(), input.label)
  return {
    ok: true,
    key: session.key,
    entry: normalizeSession(session),
  }
}

export async function resolveCodexSession(key: string) {
  const store = readStore()
  const session = findSession(store, key)
  return {
    ok: Boolean(session),
    key: session?.key,
  }
}

export async function deleteCodexSession(key: string) {
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

export async function codexCliCheck() {
  const command = getCodexCommand()
  const result = spawnSync(
    process.platform === 'win32' ? `${command} --version` : command,
    process.platform === 'win32' ? [] : ['--version'],
    {
      cwd: getCodexWorkdir(),
      env: process.env,
      stdio: 'pipe',
      shell: process.platform === 'win32',
      encoding: 'utf8',
    },
  )

  if (result.status === 0) {
    return { ok: true }
  }

  const detail = result.stderr || result.stdout || result.error?.message || ''
  throw new Error(
    detail.trim() ||
      `Codex CLI command failed. Set CODEX_CLI_COMMAND if ${command} is not correct.`,
  )
}

