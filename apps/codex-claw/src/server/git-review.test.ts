import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetCodexServerStateForTests } from './codex-cli'
import { getGitReviewPayload, stageGitReviewFiles } from './git-review'

describe('git review payload', function () {
  const originalStateDir = process.env.CODEX_CLAW_STATE_DIR
  const originalWorkdir = process.env.CODEX_CLI_WORKDIR
  let tempDir = ''

  beforeEach(function () {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-claw-git-'))
    spawnSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' })
    spawnSync('git', ['config', 'user.email', 'test@example.com'], {
      cwd: tempDir,
      stdio: 'pipe',
    })
    spawnSync('git', ['config', 'user.name', 'Test User'], {
      cwd: tempDir,
      stdio: 'pipe',
    })
    mkdirSync(path.join(tempDir, 'src'), { recursive: true })
    writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'export const a = 1\n')
    spawnSync('git', ['add', '.'], { cwd: tempDir, stdio: 'pipe' })
    spawnSync('git', ['commit', '-m', 'initial'], {
      cwd: tempDir,
      stdio: 'pipe',
    })
    writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'export const a = 2\n')
    writeFileSync(path.join(tempDir, 'src', 'new.ts'), 'export const b = 1\n')
    process.env.CODEX_CLAW_STATE_DIR = path.join(tempDir, '.state')
    process.env.CODEX_CLI_WORKDIR = tempDir
    resetCodexServerStateForTests()
  })

  afterEach(function () {
    if (originalStateDir === undefined) {
      delete process.env.CODEX_CLAW_STATE_DIR
    } else {
      process.env.CODEX_CLAW_STATE_DIR = originalStateDir
    }
    if (originalWorkdir === undefined) {
      delete process.env.CODEX_CLI_WORKDIR
    } else {
      process.env.CODEX_CLI_WORKDIR = originalWorkdir
    }
    resetCodexServerStateForTests()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('groups changed files and prepares patch text', function () {
    const payload = getGitReviewPayload()

    expect(payload.groups.unstaged.map((file) => file.path)).toContain(
      'src/app.ts',
    )
    expect(payload.groups.untracked.map((file) => file.path)).toContain(
      'src/new.ts',
    )
    expect(payload.patch).toContain('-export const a = 1')
    expect(payload.patch).toContain('+export const b = 1')
    expect(payload.draftCommitMessage).toContain('src')
  })

  it('stages selected files only', function () {
    const payload = stageGitReviewFiles(['src/new.ts'])

    expect(payload.groups.staged.map((file) => file.path)).toContain(
      'src/new.ts',
    )
    expect(payload.groups.unstaged.map((file) => file.path)).toContain(
      'src/app.ts',
    )
  })
})
