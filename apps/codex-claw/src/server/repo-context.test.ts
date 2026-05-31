import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetCodexServerStateForTests } from './codex-cli'
import {
  buildRepositoryContextPrompt,
  getRepoContextPayload,
} from './repo-context'

describe('repo context payload', function () {
  const originalStateDir = process.env.CODEX_CLAW_STATE_DIR
  const originalWorkdir = process.env.CODEX_CLI_WORKDIR
  let tempDir = ''

  beforeEach(function () {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-claw-context-'))
    mkdirSync(path.join(tempDir, 'src'), { recursive: true })
    mkdirSync(path.join(tempDir, 'node_modules', 'ignored'), {
      recursive: true,
    })
    writeFileSync(path.join(tempDir, 'AGENTS.md'), 'root rules')
    writeFileSync(path.join(tempDir, 'src', 'AGENTS.md'), 'src rules')
    writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'export const ok = true')
    writeFileSync(
      path.join(tempDir, 'node_modules', 'ignored', 'file.ts'),
      'ignored',
    )
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

  it('finds applicable AGENTS.md files for selected paths', function () {
    const payload = getRepoContextPayload([{ path: 'src/app.ts' }])

    expect(payload.entries.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['AGENTS.md', 'src/AGENTS.md', 'src/app.ts']),
    )
    expect(payload.entries.map((entry) => entry.path)).not.toContain(
      'node_modules/ignored/file.ts',
    )
    expect(payload.applicableAgents.map((agent) => agent.path)).toEqual([
      'AGENTS.md',
      'src/AGENTS.md',
    ])
  })

  it('builds a bounded prompt context block', function () {
    const prompt = buildRepositoryContextPrompt([{ path: 'src/app.ts' }])

    expect(prompt).toContain('Repository context selected in CodexClaw')
    expect(prompt).toContain('--- AGENTS.md ---')
    expect(prompt).toContain('--- src/AGENTS.md ---')
    expect(prompt).toContain('--- src/app.ts ---')
    expect(prompt).toContain('export const ok = true')
  })
})
