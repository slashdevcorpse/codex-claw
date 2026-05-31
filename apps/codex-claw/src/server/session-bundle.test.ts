import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resetCodexServerStateForTests } from './codex-cli'
import {
  getSessionHandoffExport,
  redactHandoffText,
} from './session-bundle'

describe('session handoff bundles', function () {
  const originalStateDir = process.env.CODEX_CLAW_STATE_DIR
  const originalWorkdir = process.env.CODEX_CLI_WORKDIR
  const originalCommand = process.env.CODEX_CLI_COMMAND
  let tempDir = ''
  let stateDir = ''

  beforeEach(function () {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-claw-handoff-'))
    stateDir = path.join(tempDir, 'state')
    mkdirSync(stateDir, { recursive: true })
    process.env.CODEX_CLAW_STATE_DIR = stateDir
    process.env.CODEX_CLI_WORKDIR = tempDir
    process.env.CODEX_CLI_COMMAND = 'codex-test'
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
    if (originalCommand === undefined) {
      delete process.env.CODEX_CLI_COMMAND
    } else {
      process.env.CODEX_CLI_COMMAND = originalCommand
    }
    resetCodexServerStateForTests()
    rmSync(tempDir, { recursive: true, force: true })
  })

  function writeSessionFixture() {
    writeFileSync(
      path.join(stateDir, 'sessions.json'),
      JSON.stringify({
        version: 1,
        sessions: [
          {
            key: 'handoff-session',
            friendlyId: 'handoff-session',
            title: 'Publish alpha safely',
            derivedTitle: 'Publish alpha safely',
            updatedAt: 300,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text:
                      'Prepare release notes with OPENAI_API_KEY=sk-testsecret123456789 and C:\\Users\\alice\\repo\\secret.txt',
                  },
                ],
                timestamp: 100,
              },
              {
                role: 'toolResult',
                toolName: 'command_execution',
                details: { command: 'pnpm test', exitCode: 0 },
                content: [
                  {
                    type: 'text',
                    text: 'passed with token ghp_123456789012345678901234',
                  },
                ],
                timestamp: 200,
              },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: 'Added the release checklist and verified it from ' + tempDir,
                  },
                ],
                timestamp: 300,
              },
            ],
          },
        ],
      }),
    )
    writeFileSync(
      path.join(stateDir, 'tasks.json'),
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: 'run-1',
            sessionKey: 'handoff-session',
            messageId: 'message-1',
            prompt: 'private prompt',
            message: 'run validation',
            status: 'completed',
            createdAt: 100,
            updatedAt: 200,
            startedAt: 120,
            finishedAt: 200,
            durationMs: 80,
            exitCode: 0,
            snapshot: {
              sessionKey: 'handoff-session',
              message: 'run validation',
            },
            events: [{ status: 'completed', at: 200 }],
            timeline: [
              {
                id: 'event-1',
                kind: 'tool-result',
                at: 180,
                relativeMs: 60,
                label: 'Tool result',
                commandName: 'pnpm test -- GITHUB_TOKEN=ghp_123456789012345678901234',
                exitCode: 0,
                message: 'validated from ' + tempDir,
              },
            ],
          },
        ],
      }),
    )
    resetCodexServerStateForTests()
  }

  it('exports a redacted markdown bundle with validation evidence', function () {
    writeSessionFixture()

    const payload = getSessionHandoffExport({
      sessionKey: 'handoff-session',
      kind: 'bundle',
    })

    expect(payload.filename).toBe('codexclaw-publish-alpha-safely-bundle.md')
    expect(payload.markdown).toContain('# CodexClaw session bundle')
    expect(payload.markdown).toContain('## Prompt')
    expect(payload.markdown).toContain('OPENAI_API_KEY=[REDACTED]')
    expect(payload.markdown).toContain('GITHUB_TOKEN=[REDACTED]')
    expect(payload.markdown).toContain('pnpm test')
    expect(payload.markdown).toContain('exit 0')
    expect(payload.markdown).toContain('$WORKSPACE')
    expect(payload.markdown).not.toContain('sk-testsecret')
    expect(payload.markdown).not.toContain('ghp_123456')
    expect(payload.markdown).not.toContain(tempDir)
    expect(payload.markdown).not.toContain('C:\\Users\\alice')
  })

  it('generates issue and PR drafts without GitHub writes', function () {
    writeSessionFixture()

    const issue = getSessionHandoffExport({
      friendlyId: 'handoff-session',
      kind: 'issue',
    })
    const pr = getSessionHandoffExport({
      friendlyId: 'handoff-session',
      kind: 'pr',
    })

    expect(issue.markdown).toContain('## Expected Outcome')
    expect(issue.markdown).toContain('## Redaction Note')
    expect(pr.markdown).toContain('## Summary')
    expect(pr.markdown).toContain('CodexClaw does not publish it automatically')
  })

  it('redacts generic long secret-looking values', function () {
    const redacted = redactHandoffText(
      'SESSION_TOKEN=' + 'a'.repeat(90) + ' npm_123456789012345678901234',
    )

    expect(redacted).toContain('SESSION_TOKEN=[REDACTED]')
    expect(redacted).toContain('[REDACTED_TOKEN]')
  })
})
