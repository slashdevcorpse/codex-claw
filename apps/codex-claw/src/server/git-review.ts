import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { getCodexPaths } from './codex-cli'

export type GitFileState = 'staged' | 'unstaged' | 'untracked' | 'deleted'

export type GitReviewFile = {
  path: string
  state: GitFileState
  indexStatus: string
  worktreeStatus: string
  diff: string
}

export type GitReviewPayload = {
  ok: boolean
  workdir: string
  branch: string
  files: Array<GitReviewFile>
  groups: Record<GitFileState, Array<GitReviewFile>>
  patch: string
  draftCommitMessage: string
}

const maxDiffChars = 120000
const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
])

function workdir() {
  return getCodexPaths().workspace.codexWorkdir
}

function runGit(args: Array<string>, cwd = workdir()) {
  return spawnSync('git', args, {
    cwd,
    env: process.env,
    stdio: 'pipe',
    encoding: 'utf8',
  })
}

function commandOutput(result: ReturnType<typeof spawnSync>) {
  return String(result.stdout || result.stderr || result.error?.message || '')
}

function ensureGitWorkdir(cwd: string) {
  if (!existsSync(cwd)) {
    throw new Error('Workspace directory does not exist: ' + cwd)
  }
  const result = runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  if (result.status !== 0) {
    throw new Error('Workspace is not a git repository.')
  }
}

function parseStatusLine(line: string) {
  const indexStatus = line.slice(0, 1)
  const worktreeStatus = line.slice(1, 2)
  const rawPath = line.slice(3).trim()
  const renamedPath = rawPath.includes(' -> ')
    ? rawPath.slice(rawPath.indexOf(' -> ') + 4)
    : rawPath
  return {
    indexStatus,
    worktreeStatus,
    path: renamedPath,
  }
}

function stateFromStatus(indexStatus: string, worktreeStatus: string) {
  if (indexStatus === '?' && worktreeStatus === '?') return 'untracked'
  if (indexStatus === 'D' || worktreeStatus === 'D') return 'deleted'
  if (indexStatus !== ' ' && indexStatus !== '?') return 'staged'
  return 'unstaged'
}

function isTextPath(filePath: string) {
  return textExtensions.has(path.extname(filePath).toLowerCase())
}

function untrackedDiff(cwd: string, filePath: string) {
  const absolutePath = path.resolve(cwd, filePath)
  const relative = path.relative(cwd, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return ''
  if (!existsSync(absolutePath)) return ''
  const stat = statSync(absolutePath)
  if (!stat.isFile() || stat.size > 128000 || !isTextPath(filePath)) {
    return 'Untracked binary or large file: ' + filePath
  }
  const content = readFileSync(absolutePath, 'utf8')
  const lines = content.split(/\r?\n/).map((line) => '+' + line)
  return [
    'diff --git a/' + filePath + ' b/' + filePath,
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/' + filePath,
    '@@',
    ...lines,
  ].join('\n')
}

function diffForFile(cwd: string, file: Omit<GitReviewFile, 'diff'>) {
  if (file.state === 'untracked') return untrackedDiff(cwd, file.path)
  const args =
    file.state === 'staged'
      ? ['diff', '--cached', '--', file.path]
      : ['diff', '--', file.path]
  const diff = commandOutput(runGit(args, cwd)).trim()
  return diff.slice(0, maxDiffChars)
}

function draftCommitMessage(files: Array<GitReviewFile>) {
  if (files.length === 0) return ''
  const primary = files[0]?.path.split('/')[0] || 'workspace'
  const states = new Set(files.map((file) => file.state))
  const verb = states.has('deleted')
    ? 'Update'
    : states.has('untracked')
      ? 'Add'
      : 'Update'
  return verb + ' ' + primary + '\n\nPrepared from local CodexClaw diff review.'
}

export function getGitReviewPayload(): GitReviewPayload {
  const cwd = workdir()
  ensureGitWorkdir(cwd)
  const branch = commandOutput(runGit(['branch', '--show-current'], cwd)).trim()
  const status = commandOutput(runGit(['status', '--porcelain=v1'], cwd))
  const files = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseStatusLine)
    .map((file) => ({
      ...file,
      state: stateFromStatus(file.indexStatus, file.worktreeStatus),
    }))
    .map((file) => ({
      ...file,
      diff: diffForFile(cwd, file),
    }))

  const groups: GitReviewPayload['groups'] = {
    staged: files.filter((file) => file.state === 'staged'),
    unstaged: files.filter((file) => file.state === 'unstaged'),
    untracked: files.filter((file) => file.state === 'untracked'),
    deleted: files.filter((file) => file.state === 'deleted'),
  }
  const patch = files
    .map((file) => file.diff)
    .filter(Boolean)
    .join('\n\n')
    .slice(0, maxDiffChars)

  return {
    ok: true,
    workdir: cwd,
    branch,
    files,
    groups,
    patch,
    draftCommitMessage: draftCommitMessage(files),
  }
}

export function stageGitReviewFiles(paths: Array<string>) {
  const cwd = workdir()
  ensureGitWorkdir(cwd)
  const selectedPaths = paths.map((item) => item.trim()).filter(Boolean)
  if (selectedPaths.length === 0) return getGitReviewPayload()
  const result = runGit(['add', '--', ...selectedPaths], cwd)
  if (result.status !== 0) {
    throw new Error(commandOutput(result).trim() || 'git add failed')
  }
  return getGitReviewPayload()
}
