import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getCodexPaths } from './codex-cli'

type McpHealthStatus = 'ok' | 'warning' | 'error'

type McpEnvRequirement = {
  name: string
  status: McpHealthStatus
  source: 'config' | 'process' | 'missing'
  reference?: string
}

type McpServerHealth = {
  name: string
  enabled: boolean
  command: string
  args: Array<string>
  env: Array<McpEnvRequirement>
  status: McpHealthStatus
  summary: string
  commandPath?: string
}

type McpSetupSnippet = {
  id: string
  label: string
  description: string
  snippet: string
}

type McpHealthPayload = {
  ok: boolean
  workspaceId: string
  workdir: string
  configPath?: string
  checkedConfigPaths: Array<string>
  checkedAt: number
  servers: Array<McpServerHealth>
  setupSnippets: Array<McpSetupSnippet>
}

type ParsedMcpServer = {
  name: string
  command: string
  args: Array<string>
  env: Record<string, string>
  enabled: boolean
}

const secretArgPattern =
  /(api[_-]?key|token|secret|password|passwd|credential|auth|bearer)/i

function codexConfigCandidates(workdir: string) {
  const candidates = new Set<string>()
  const configuredHome = process.env.CODEX_HOME?.trim()
  if (configuredHome) candidates.add(path.join(configuredHome, 'config.toml'))
  candidates.add(path.join(os.homedir(), '.codex', 'config.toml'))
  candidates.add(path.join(workdir, '.codex', 'config.toml'))
  return [...candidates].map((candidate) => path.resolve(candidate))
}

function stripComment(line: string) {
  let quote: string | null = null
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      }
      continue
    }
    if (!quote && char === '#') return line.slice(0, index).trim()
  }
  return line.trim()
}

function unquote(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return trimmed
}

function splitTopLevel(value: string) {
  const items: Array<string> = []
  let quote: string | null = null
  let escaped = false
  let depth = 0
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      }
      continue
    }
    if (quote) continue
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      items.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  const tail = value.slice(start).trim()
  if (tail) items.push(tail)
  return items
}

function parseArray(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return []
  return splitTopLevel(trimmed.slice(1, -1)).map(unquote).filter(Boolean)
}

function splitAssignment(line: string): [string, string | undefined] {
  let quote: string | null = null
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      }
      continue
    }
    if (!quote && char === '=') {
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    }
  }
  return [line.trim(), undefined]
}

function parseInlineTable(value: string) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return {}
  const result: Record<string, string> = {}
  for (const item of splitTopLevel(trimmed.slice(1, -1))) {
    const [key, rawValue] = splitAssignment(item)
    if (!key || typeof rawValue === 'undefined') continue
    result[unquote(key)] = unquote(rawValue)
  }
  return result
}

function splitSectionParts(value: string) {
  const parts: Array<string> = []
  let quote: string | null = null
  let escaped = false
  let start = 0
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (quote && char === '\\') {
      escaped = true
      continue
    }
    if (char === '"' || char === "'") {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      }
      continue
    }
    if (!quote && char === '.') {
      parts.push(unquote(value.slice(start, index)))
      start = index + 1
    }
  }
  parts.push(unquote(value.slice(start)))
  return parts.filter(Boolean)
}

function parseSectionName(rawSection: string) {
  const trimmed = rawSection.trim()
  if (!trimmed.startsWith('mcp_servers.')) return null
  const parts = splitSectionParts(trimmed.slice('mcp_servers.'.length))
  if (parts.length === 0) return null
  return {
    serverName: parts[0],
    nested: parts.slice(1).join('.'),
  }
}

function ensureParsedServer(
  servers: Map<string, ParsedMcpServer>,
  name: string,
) {
  const existing = servers.get(name)
  if (existing) return existing
  const server: ParsedMcpServer = {
    name,
    command: '',
    args: [],
    env: {},
    enabled: true,
  }
  servers.set(name, server)
  return server
}

export function parseCodexMcpServers(configText: string) {
  const servers = new Map<string, ParsedMcpServer>()
  let currentSection: ReturnType<typeof parseSectionName> = null

  for (const rawLine of configText.split(/\r?\n/)) {
    const line = stripComment(rawLine)
    if (!line) continue
    const sectionMatch = /^\[(?<section>[^\]]+)]$/.exec(line)
    if (sectionMatch?.groups?.section) {
      currentSection = parseSectionName(sectionMatch.groups.section)
      continue
    }
    if (!currentSection) continue
    const [key, rawValue] = splitAssignment(line)
    if (!key || typeof rawValue === 'undefined') continue

    const server = ensureParsedServer(servers, currentSection.serverName)
    if (currentSection.nested === 'env') {
      server.env[unquote(key)] = unquote(rawValue)
      continue
    }

    if (key === 'command') server.command = unquote(rawValue)
    if (key === 'args') server.args = parseArray(rawValue)
    if (key === 'env') {
      server.env = { ...server.env, ...parseInlineTable(rawValue) }
    }
    if (key === 'disabled') {
      server.enabled = rawValue.trim().toLowerCase() !== 'true'
    }
    if (key === 'enabled') {
      server.enabled = rawValue.trim().toLowerCase() !== 'false'
    }
  }

  return [...servers.values()].sort((first, second) =>
    first.name.localeCompare(second.name),
  )
}

function referencedEnvName(value: string) {
  const trimmed = value.trim()
  const braced = /^\$\{(?<name>[A-Za-z_][A-Za-z0-9_]*)}$/.exec(trimmed)
  if (braced?.groups?.name) return braced.groups.name
  const simple = /^\$(?<name>[A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed)
  if (simple?.groups?.name) return simple.groups.name
  return null
}

function envRequirement(name: string, value: string): McpEnvRequirement {
  const reference = referencedEnvName(value)
  if (reference) {
    const found = Boolean(process.env[reference])
    return {
      name,
      reference,
      source: found ? 'process' : 'missing',
      status: found ? 'ok' : 'warning',
    }
  }
  if (!value.trim()) {
    const found = Boolean(process.env[name])
    return {
      name,
      source: found ? 'process' : 'missing',
      status: found ? 'ok' : 'warning',
    }
  }
  return {
    name,
    source: 'config',
    status: 'ok',
  }
}

function redactedAssignment(value: string) {
  const separator = value.indexOf('=')
  if (separator < 0) return value
  return value.slice(0, separator + 1) + '[redacted]'
}

function redactMcpArg(arg: string, previousArg?: string) {
  if (
    previousArg &&
    previousArg.startsWith('-') &&
    !previousArg.includes('=') &&
    secretArgPattern.test(previousArg)
  ) {
    return '[redacted]'
  }
  if (secretArgPattern.test(arg) && arg.includes('=')) {
    return redactedAssignment(arg)
  }
  return arg
}

export function redactMcpArgs(args: Array<string>) {
  return args.map((arg, index) => redactMcpArg(arg, args[index - 1]))
}

function resolveCommand(command: string, workdir: string) {
  if (!command.trim()) return undefined
  const trimmed = command.trim()
  if (path.isAbsolute(trimmed)) return existsSync(trimmed) ? trimmed : undefined
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    const absolute = path.resolve(workdir, trimmed)
    return existsSync(absolute) ? absolute : undefined
  }
  const resolver =
    process.platform === 'win32'
      ? spawnSync('where.exe', [trimmed], { encoding: 'utf8' })
      : spawnSync('which', [trimmed], { encoding: 'utf8' })
  if (resolver.status !== 0) return undefined
  return resolver.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function serverHealth(
  server: ParsedMcpServer,
  workdir: string,
): McpServerHealth {
  const env = Object.entries(server.env)
    .map(([name, value]) => envRequirement(name, value))
    .sort((first, second) => first.name.localeCompare(second.name))
  const missingEnv = env.filter((item) => item.status !== 'ok')
  const commandPath = resolveCommand(server.command, workdir)
  const commandMissing = server.enabled && !commandPath

  const status: McpHealthStatus = commandMissing
    ? 'error'
    : missingEnv.length > 0
      ? 'warning'
      : 'ok'
  const summary = !server.enabled
    ? 'Disabled in Codex config'
    : commandMissing
      ? 'Command was not found on this machine'
      : missingEnv.length > 0
        ? 'Environment variables need attention'
        : 'Ready for Codex CLI'

  return {
    name: server.name,
    enabled: server.enabled,
    command: server.command,
    args: redactMcpArgs(server.args),
    env,
    status: server.enabled ? status : 'warning',
    summary,
    commandPath,
  }
}

function tomlString(value: string) {
  return JSON.stringify(value)
}

function snippet(
  id: string,
  label: string,
  description: string,
  lines: Array<string>,
) {
  return {
    id,
    label,
    description,
    snippet: lines.join('\n'),
  }
}

function setupSnippets(workdir: string): Array<McpSetupSnippet> {
  return [
    snippet('filesystem', 'Filesystem', 'Expose the active workspace tree.', [
      '[mcp_servers.filesystem]',
      'command = "npx"',
      'args = ["-y", "@modelcontextprotocol/server-filesystem", ' +
        tomlString(workdir) +
        ']',
    ]),
    snippet('git', 'Git', 'Expose repository-aware git helpers.', [
      '[mcp_servers.git]',
      'command = "uvx"',
      'args = ["mcp-server-git", "--repository", ' + tomlString(workdir) + ']',
    ]),
    snippet('memory', 'Memory', 'Add a local memory graph server.', [
      '[mcp_servers.memory]',
      'command = "npx"',
      'args = ["-y", "@modelcontextprotocol/server-memory"]',
    ]),
    snippet('fetch', 'Fetch', 'Add controlled URL fetching support.', [
      '[mcp_servers.fetch]',
      'command = "uvx"',
      'args = ["mcp-server-fetch"]',
    ]),
  ]
}

export function getMcpHealthPayload(): McpHealthPayload {
  const paths = getCodexPaths()
  const workdir = paths.workspace.codexWorkdir
  const checkedConfigPaths = codexConfigCandidates(workdir)
  const configPath = checkedConfigPaths.find((candidate) =>
    existsSync(candidate),
  )
  const configText = configPath ? readFileSync(configPath, 'utf8') : ''
  const servers = configPath
    ? parseCodexMcpServers(configText).map((server) =>
        serverHealth(server, workdir),
      )
    : []

  return {
    ok: !servers.some((server) => server.status === 'error'),
    workspaceId: paths.workspace.id,
    workdir,
    configPath,
    checkedConfigPaths,
    checkedAt: Date.now(),
    servers,
    setupSnippets: setupSnippets(workdir),
  }
}
