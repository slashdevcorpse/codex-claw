import os from 'node:os'
import path from 'node:path'
import {
  getCodexHistory,
  getCodexPaths,
  getCodexRunEventLog,
  listCodexSessions,
  listCodexTasks,
  resolveCodexSession,
} from './codex-cli'
import { getGitReviewPayload } from './git-review'

export type SessionHandoffKind = 'bundle' | 'issue' | 'pr'

export type SessionHandoffExport = {
  kind: SessionHandoffKind
  title: string
  filename: string
  markdown: string
}

type HistoryMessage = ReturnType<typeof getCodexHistory>['messages'][number]
type TaskRecord = ReturnType<typeof listCodexTasks>['tasks'][number]

type BundleContext = {
  title: string
  sessionKey: string
  friendlyId: string
  exportedAt: string
  prompt: string
  assistantResult: string
  toolSummaries: Array<string>
  changedFiles: Array<string>
  validationCommands: Array<string>
}

const maxPromptChars = 3000
const maxResultChars = 4000
const maxToolChars = 700
const maxCommandChars = 240
const markdownCodeTick = String.fromCharCode(96)

export function isSessionHandoffKind(value: string): value is SessionHandoffKind {
  return value === 'bundle' || value === 'issue' || value === 'pr'
}

export function redactHandoffText(value: string, limit = maxResultChars) {
  const paths = getCodexPaths()
  const replacements = [
    [path.resolve(paths.stateDir), '$CODEX_CLAW_STATE'],
    [path.resolve(paths.workspace.codexWorkdir), '$WORKSPACE'],
    [os.homedir(), '~'],
  ] as const
  let next = value

  for (const [from, to] of replacements) {
    if (!from) continue
    next = next.split(from).join(to)
  }

  next = next.replace(
    /\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|ACCESS_KEY|AUTH)[A-Z0-9_]*)\s*[:=]\s*([^\s"']+)/gi,
    '$1=[REDACTED]',
  )
  next = next.replace(
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|npm_[A-Za-z0-9_]{20,})\b/g,
    '[REDACTED_TOKEN]',
  )
  next = next.replace(
    /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
    '[REDACTED_JWT]',
  )
  next = next.replace(/\b[A-Za-z]:\\Users\\[^\s"']+/g, '~\\[REDACTED_PATH]')
  next = next.replace(/(?:\/Users|\/home)\/[^\s"']+/g, '~/[REDACTED_PATH]')
  next = next.replace(/\b[A-Za-z0-9+/_-]{80,}={0,2}\b/g, '[REDACTED_VALUE]')

  if (next.length <= limit) return next
  return (
    next.slice(0, limit).trimEnd() +
    '\n\n[Truncated ' +
    String(next.length - limit) +
    ' redacted characters]'
  )
}

function textFromMessage(message: HistoryMessage) {
  const parts = Array.isArray(message.content) ? message.content : []
  return parts
    .map(function mapPart(part) {
      if (part.type === 'text') return part.text ?? ''
      if (part.type === 'thinking') return part.thinking ?? ''
      if (part.type === 'toolCall') {
        const name = part.name ? part.name : 'tool'
        return 'Tool call: ' + name
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function titleFromSession(sessionKey: string, friendlyId: string) {
  const session = listCodexSessions({ includeArchived: true }).sessions.find(
    (item) => item.key === sessionKey || item.friendlyId === friendlyId,
  )
  return (
    session?.label ||
    session?.title ||
    session?.derivedTitle ||
    friendlyId ||
    sessionKey ||
    'CodexClaw session'
  )
}

function latestText(
  messages: Array<HistoryMessage>,
  role: string,
  limit: number,
) {
  const match = [...messages]
    .reverse()
    .find((message) => message.role === role && textFromMessage(message))
  return match ? redactHandoffText(textFromMessage(match), limit) : ''
}

function code(value: string) {
  return markdownCodeTick + value + markdownCodeTick
}

function toolSummariesFromHistory(messages: Array<HistoryMessage>) {
  return messages
    .filter(
      (message) =>
        message.role === 'toolResult' ||
        message.role === 'toolCall' ||
        typeof message.toolName === 'string',
    )
    .map(function mapToolMessage(message) {
      const toolName = message.toolName || message.role || 'tool'
      const status = message.isError ? 'error' : 'ok'
      const text = redactHandoffText(textFromMessage(message), maxToolChars)
      return code(toolName) + ' ' + status + (text ? ': ' + text : '')
    })
}

function tasksForSession(sessionKey: string) {
  return listCodexTasks().tasks.filter((task) => task.sessionKey === sessionKey)
}

function runEventsForTask(task: TaskRecord) {
  try {
    return getCodexRunEventLog({ id: task.id }).events
  } catch {
    return task.timeline
  }
}

function toolSummariesFromTasks(tasks: Array<TaskRecord>) {
  const summaries: Array<string> = []
  for (const task of tasks) {
    const events = runEventsForTask(task)
    for (const event of events) {
      if (event.kind !== 'tool-call' && event.kind !== 'tool-result') continue
      const label = event.commandName || event.label || event.kind
      const status =
        typeof event.exitCode === 'number'
          ? 'exit ' + String(event.exitCode)
          : event.status || task.status
      const message = event.message
        ? ': ' + redactHandoffText(event.message, maxToolChars)
        : ''
      summaries.push(
        code(redactHandoffText(label, maxCommandChars)) + ' ' + status + message,
      )
    }
  }
  return summaries
}

function changedFileSummaries() {
  try {
    const payload = getGitReviewPayload()
    if (!payload.ok || payload.files.length === 0) return []
    return payload.files.map(function mapFile(file) {
      return file.state + ': ' + code(redactHandoffText(file.path, maxCommandChars))
    })
  } catch {
    return []
  }
}

function isValidationCommand(command: string) {
  return /\b(test|lint|build|check|typecheck|tsc|vitest|eslint|playwright|audit|pack|smoke)\b/i.test(
    command,
  )
}

function validationCommandsFromTasks(tasks: Array<TaskRecord>) {
  const commands = new Map<string, string>()
  for (const task of tasks) {
    const events = runEventsForTask(task)
    for (const event of events) {
      const command = event.commandName
      if (!command || !isValidationCommand(command)) continue
      const redactedCommand = redactHandoffText(command, maxCommandChars)
      const exit =
        typeof event.exitCode === 'number'
          ? 'exit ' + String(event.exitCode)
          : event.status || task.status
      commands.set(redactedCommand, code(redactedCommand) + ' - ' + exit)
    }
  }
  return [...commands.values()]
}

function uniqueLimited(items: Array<string>, limit: number) {
  return [...new Set(items.filter(Boolean))].slice(0, limit)
}

function markdownList(items: Array<string>, fallback: string) {
  if (items.length === 0) return '- ' + fallback
  return items.map((item) => '- ' + item).join('\n')
}

function buildContext(input: {
  sessionKey?: string
  friendlyId?: string
}): BundleContext {
  const friendlyId = input.friendlyId?.trim() ?? ''
  let sessionKey = input.sessionKey?.trim() ?? ''

  if (!sessionKey && friendlyId) {
    const resolved = resolveCodexSession(friendlyId)
    sessionKey = typeof resolved.key === 'string' ? resolved.key : ''
  }

  if (!sessionKey) throw new Error('sessionKey or friendlyId required')

  const resolved = resolveCodexSession(sessionKey)
  if (!resolved.ok) throw new Error('session not found')

  const history = getCodexHistory({ sessionKey, limit: 200 })
  const messages = history.messages
  const tasks = tasksForSession(sessionKey)
  const title = titleFromSession(sessionKey, friendlyId || sessionKey)

  return {
    title: redactHandoffText(title, 160),
    sessionKey,
    friendlyId: friendlyId || sessionKey,
    exportedAt: new Date().toISOString(),
    prompt: latestText(messages, 'user', maxPromptChars),
    assistantResult: latestText(messages, 'assistant', maxResultChars),
    toolSummaries: uniqueLimited(
      [...toolSummariesFromHistory(messages), ...toolSummariesFromTasks(tasks)],
      12,
    ),
    changedFiles: uniqueLimited(changedFileSummaries(), 20),
    validationCommands: uniqueLimited(validationCommandsFromTasks(tasks), 10),
  }
}

function buildBundleMarkdown(context: BundleContext) {
  return [
    '# CodexClaw session bundle',
    '',
    '- Session: ' + context.title,
    '- Session key: ' + code(redactHandoffText(context.sessionKey, 160)),
    '- Exported: ' + context.exportedAt,
    '- Redaction: environment values, tokens, private paths, and large outputs are redacted by default.',
    '',
    '## Prompt',
    '',
    context.prompt || '_No user prompt recorded._',
    '',
    '## Assistant Result',
    '',
    context.assistantResult || '_No assistant result recorded._',
    '',
    '## Tool Summaries',
    '',
    markdownList(context.toolSummaries, 'No tool calls recorded.'),
    '',
    '## Changed Files',
    '',
    markdownList(context.changedFiles, 'No local changed files detected.'),
    '',
    '## Validation Commands',
    '',
    markdownList(
      context.validationCommands,
      'No validation commands detected in this session.',
    ),
    '',
  ].join('\n')
}

function buildIssueMarkdown(context: BundleContext) {
  return [
    '# ' + context.title,
    '',
    '## Context',
    '',
    context.prompt || '_No prompt recorded._',
    '',
    '## Expected Outcome',
    '',
    context.assistantResult || '_No assistant result recorded._',
    '',
    '## Evidence',
    '',
    markdownList(context.toolSummaries, 'No tool calls recorded.'),
    '',
    '## Validation',
    '',
    markdownList(context.validationCommands, 'No validation commands detected.'),
    '',
    '## Redaction Note',
    '',
    'Review before posting. The draft redacts environment values, tokens, private paths, and large raw output by default.',
    '',
  ].join('\n')
}

function buildPrMarkdown(context: BundleContext) {
  return [
    '## Summary',
    '',
    '- ' + (context.assistantResult || 'Summarize the completed change before posting.'),
    '',
    '## Changed Files',
    '',
    markdownList(context.changedFiles, 'No local changed files detected.'),
    '',
    '## Validation',
    '',
    markdownList(context.validationCommands, 'No validation commands detected.'),
    '',
    '## Risk',
    '',
    '- Review this redacted draft before posting; CodexClaw does not publish it automatically.',
    '',
  ].join('\n')
}

function safeFilename(value: string) {
  return (
    value
      .replace(/[^a-zA-Z0-9 _-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60)
      .toLowerCase() || 'session'
  )
}

export function getSessionHandoffExport(input: {
  sessionKey?: string
  friendlyId?: string
  kind: SessionHandoffKind
}): SessionHandoffExport {
  const context = buildContext(input)
  const markdown =
    input.kind === 'issue'
      ? buildIssueMarkdown(context)
      : input.kind === 'pr'
        ? buildPrMarkdown(context)
        : buildBundleMarkdown(context)

  return {
    kind: input.kind,
    title: context.title,
    filename:
      'codexclaw-' + safeFilename(context.title) + '-' + input.kind + '.md',
    markdown,
  }
}
