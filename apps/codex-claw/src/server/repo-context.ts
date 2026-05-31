import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { getCodexPaths } from './codex-cli'

export type RepoContextEntry = {
  path: string
  name: string
  type: 'file' | 'directory'
  depth: number
  size?: number
}

export type RepoAgentFile = {
  path: string
  directory: string
  appliesToSelected: boolean
}

export type RepoContextSelection = {
  path: string
  type?: 'file' | 'directory'
}

export type RepoContextEstimate = {
  selectedPaths: Array<string>
  fileCount: number
  byteCount: number
  estimatedTokens: number
  oversized: boolean
  truncated: boolean
}

export type RepoContextPayload = {
  workdir: string
  entries: Array<RepoContextEntry>
  agents: Array<RepoAgentFile>
  applicableAgents: Array<RepoAgentFile>
  estimate: RepoContextEstimate
}

const maxEntries = 600
const maxDepth = 6
const maxContextChars = 32000
const oversizedTokenThreshold = 24000
const defaultIgnoredNames = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
  'out',
])

const textFileExtensions = new Set([
  '.c',
  '.cc',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.mjs',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.svelte',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
])

function activeWorkdir() {
  return getCodexPaths().workspace.codexWorkdir
}

function toRepoPath(value: string) {
  return value.split(path.sep).join('/')
}

function fromRepoPath(workdir: string, repoPath: string) {
  return path.resolve(workdir, repoPath)
}

function isInsideWorkdir(workdir: string, targetPath: string) {
  const relative = path.relative(workdir, targetPath)
  return (
    Boolean(relative) &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  )
}

function normalizeSelectionPath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/g, '')
}

function depthOf(repoPath: string) {
  if (!repoPath) return 0
  return repoPath.split('/').filter(Boolean).length - 1
}

function runGitLsFiles(workdir: string) {
  const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: workdir,
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf8',
  })

  if (result.status !== 0) return null
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function scanWithoutGit(workdir: string) {
  const files: Array<string> = []

  function visit(directory: string, depth: number) {
    if (files.length >= maxEntries || depth > maxDepth) return
    const names = readdirSync(directory, { withFileTypes: true })
    for (const item of names) {
      if (files.length >= maxEntries) break
      if (defaultIgnoredNames.has(item.name)) continue
      const absolutePath = path.join(directory, item.name)
      const repoPath = toRepoPath(path.relative(workdir, absolutePath))
      if (item.isDirectory()) {
        visit(absolutePath, depth + 1)
        continue
      }
      if (item.isFile()) files.push(repoPath)
    }
  }

  visit(workdir, 0)
  return files
}

function selectedFilesFromEntries(
  entries: Array<RepoContextEntry>,
  selections: Array<RepoContextSelection>,
) {
  const files = new Set<string>()
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]))

  for (const selection of selections) {
    const selectedPath = normalizeSelectionPath(selection.path)
    if (!selectedPath) continue
    const entry = entryByPath.get(selectedPath)
    if (!entry) continue
    if (entry.type === 'file') {
      files.add(entry.path)
      continue
    }
    for (const candidate of entries) {
      if (
        candidate.type === 'file' &&
        candidate.path.startsWith(entry.path + '/')
      ) {
        files.add(candidate.path)
      }
    }
  }

  return [...files].sort()
}

function buildEntries(workdir: string, files: Array<string>) {
  const entries = new Map<string, RepoContextEntry>()

  for (const filePath of files.slice(0, maxEntries)) {
    const normalized = normalizeSelectionPath(filePath)
    if (!normalized) continue
    const parts = normalized.split('/')
    let current = ''
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? current + '/' + parts[index] : parts[index]
      if (!entries.has(current)) {
        entries.set(current, {
          path: current,
          name: parts[index],
          type: 'directory',
          depth: depthOf(current),
        })
      }
    }

    const absolutePath = fromRepoPath(workdir, normalized)
    const stat = existsSync(absolutePath) ? statSync(absolutePath) : null
    entries.set(normalized, {
      path: normalized,
      name: parts[parts.length - 1],
      type: 'file',
      depth: depthOf(normalized),
      size: stat?.isFile() ? stat.size : undefined,
    })
  }

  return [...entries.values()].sort((a, b) => {
    if (a.path === b.path) return 0
    const parentCompare = a.path.localeCompare(b.path)
    if (a.type === b.type) return parentCompare
    if (a.path.startsWith(b.path + '/')) return 1
    if (b.path.startsWith(a.path + '/')) return -1
    return parentCompare
  })
}

function isTextFile(repoPath: string) {
  if (repoPath === 'AGENTS.md') return true
  return textFileExtensions.has(path.extname(repoPath).toLowerCase())
}

function agentsFromEntries(
  entries: Array<RepoContextEntry>,
  selectedPaths: Array<string>,
) {
  const normalizedSelections = selectedPaths.map(normalizeSelectionPath)
  return entries
    .filter((entry) => entry.type === 'file' && entry.name === 'AGENTS.md')
    .map((entry) => {
      const directory = entry.path.includes('/')
        ? entry.path.slice(0, entry.path.lastIndexOf('/'))
        : ''
      const appliesToSelected = normalizedSelections.some((selection) => {
        if (!selection) return false
        if (!directory) return true
        return selection === directory || selection.startsWith(directory + '/')
      })
      return {
        path: entry.path,
        directory,
        appliesToSelected,
      }
    })
}

function estimateContext(
  workdir: string,
  entries: Array<RepoContextEntry>,
  selections: Array<RepoContextSelection>,
): RepoContextEstimate {
  const selectedFiles = selectedFilesFromEntries(entries, selections)
  let byteCount = 0
  let truncated = false

  for (const filePath of selectedFiles) {
    const absolutePath = fromRepoPath(workdir, filePath)
    if (!isInsideWorkdir(workdir, absolutePath)) continue
    if (!existsSync(absolutePath)) continue
    const stat = statSync(absolutePath)
    if (!stat.isFile()) continue
    byteCount += stat.size
    if (byteCount > maxContextChars * 4) truncated = true
  }

  const estimatedTokens = Math.ceil(byteCount / 4)
  return {
    selectedPaths: selections
      .map((selection) => normalizeSelectionPath(selection.path))
      .filter(Boolean),
    fileCount: selectedFiles.length,
    byteCount,
    estimatedTokens,
    oversized: estimatedTokens > oversizedTokenThreshold,
    truncated,
  }
}

export function getRepoContextPayload(
  selections: Array<RepoContextSelection> = [],
): RepoContextPayload {
  const workdir = activeWorkdir()
  if (!existsSync(workdir)) {
    throw new Error('Workspace directory does not exist: ' + workdir)
  }

  const files = runGitLsFiles(workdir) ?? scanWithoutGit(workdir)
  const entries = buildEntries(workdir, files)
  const selectedPaths = selections.map((selection) => selection.path)
  const agents = agentsFromEntries(entries, selectedPaths)

  return {
    workdir,
    entries,
    agents,
    applicableAgents: agents.filter((agent) => agent.appliesToSelected),
    estimate: estimateContext(workdir, entries, selections),
  }
}

function readContextFile(absolutePath: string) {
  const buffer = readFileSync(absolutePath)
  if (buffer.includes(0)) return null
  return buffer.toString('utf8')
}

export function buildRepositoryContextPrompt(
  selections: Array<RepoContextSelection>,
) {
  if (selections.length === 0) return ''

  const payload = getRepoContextPayload(selections)
  const selectedFiles = selectedFilesFromEntries(payload.entries, selections)
  const selectedSet = new Set(selectedFiles)
  for (const agent of payload.applicableAgents) {
    selectedSet.add(agent.path)
  }

  let usedChars = 0
  const blocks: Array<string> = []
  for (const repoPath of [...selectedSet].sort()) {
    if (!isTextFile(repoPath)) continue
    const absolutePath = fromRepoPath(payload.workdir, repoPath)
    if (!isInsideWorkdir(payload.workdir, absolutePath)) continue
    if (!existsSync(absolutePath)) continue
    const content = readContextFile(absolutePath)
    if (content === null) continue
    const remaining = maxContextChars - usedChars
    if (remaining <= 0) break
    const body =
      content.length > remaining
        ? content.slice(0, remaining) + '\n[truncated]'
        : content
    usedChars += body.length
    blocks.push('--- ' + repoPath + ' ---\n' + body)
  }

  if (blocks.length === 0) return ''

  return [
    'Repository context selected in CodexClaw:',
    'Selected paths: ' + payload.estimate.selectedPaths.join(', '),
    'Estimated impact: ' +
      payload.estimate.estimatedTokens +
      ' tokens across ' +
      payload.estimate.fileCount +
      ' files.',
    ...blocks,
  ].join('\n\n')
}
