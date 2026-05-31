import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createCodexWorkspace,
  deleteCodexWorkspace,
  getCodexPaths,
  listCodexSessions,
  listCodexWorkspaces,
  mergeAssistantText,
  patchCodexSession,
  patchCodexWorkspace,
  processCodexJsonLine,
  resetCodexServerStateForTests,
  sendCodexPrompt,
} from './codex-cli'

describe('processCodexJsonLine', function () {
  it('parses assistant deltas before the final completed item', function () {
    const first = processCodexJsonLine(
      JSON.stringify({
        type: 'item.updated',
        item: { type: 'agent_message', text: 'Hel' },
      }),
    )
    const second = processCodexJsonLine(
      JSON.stringify({
        type: 'item.updated',
        item: { type: 'agent_message', text: 'Hello' },
      }),
    )
    const final = processCodexJsonLine(
      JSON.stringify({
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Hello there' },
      }),
    )

    expect(first).toEqual({ kind: 'assistant-delta', text: 'Hel' })
    expect(second).toEqual({ kind: 'assistant-delta', text: 'Hello' })
    expect(final).toEqual({ kind: 'assistant-final', text: 'Hello there' })
  })

  it('ignores non-assistant events', function () {
    expect(
      processCodexJsonLine(
        JSON.stringify({
          type: 'item.completed',
          item: { type: 'reasoning', text: 'hidden' },
        }),
      ),
    ).toBeNull()
  })
})

describe('mergeAssistantText', function () {
  it('keeps cumulative snapshots in order', function () {
    const first = mergeAssistantText('', 'Hel', 'assistant-delta')
    const second = mergeAssistantText(first, 'Hello', 'assistant-delta')
    const final = mergeAssistantText(second, 'Hello there', 'assistant-final')

    expect(first).toBe('Hel')
    expect(second).toBe('Hello')
    expect(final).toBe('Hello there')
  })

  it('appends token deltas without duplicating repeated chunks', function () {
    const first = mergeAssistantText('', 'Hel', 'assistant-delta')
    const second = mergeAssistantText(first, 'lo', 'assistant-delta')
    const repeated = mergeAssistantText(second, 'lo', 'assistant-delta')

    expect(first).toBe('Hel')
    expect(second).toBe('Hello')
    expect(repeated).toBe('Hello')
  })
})

describe('codex workspace registry', function () {
  const originalStateDir = process.env.CODEX_CLAW_STATE_DIR
  const originalCommand = process.env.CODEX_CLI_COMMAND
  const originalWorkdir = process.env.CODEX_CLI_WORKDIR
  const originalSandbox = process.env.CODEX_CLI_SANDBOX
  let tempDir = ''

  beforeEach(function () {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codex-claw-test-'))
    process.env.CODEX_CLAW_STATE_DIR = path.join(tempDir, 'state')
    process.env.CODEX_CLI_COMMAND = 'codex-test'
    process.env.CODEX_CLI_WORKDIR = tempDir
    process.env.CODEX_CLI_SANDBOX = 'read-only'
    resetCodexServerStateForTests()
  })

  afterEach(function () {
    if (originalStateDir === undefined) {
      delete process.env.CODEX_CLAW_STATE_DIR
    } else {
      process.env.CODEX_CLAW_STATE_DIR = originalStateDir
    }
    if (originalCommand === undefined) {
      delete process.env.CODEX_CLI_COMMAND
    } else {
      process.env.CODEX_CLI_COMMAND = originalCommand
    }
    if (originalWorkdir === undefined) {
      delete process.env.CODEX_CLI_WORKDIR
    } else {
      process.env.CODEX_CLI_WORKDIR = originalWorkdir
    }
    if (originalSandbox === undefined) {
      delete process.env.CODEX_CLI_SANDBOX
    } else {
      process.env.CODEX_CLI_SANDBOX = originalSandbox
    }
    resetCodexServerStateForTests()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('stores independent active workspace configuration', function () {
    expect(getCodexPaths().workspace).toMatchObject({
      id: 'default',
      codexCommand: 'codex-test',
      codexApproval: 'untrusted',
      runProfile: 'read-only-inspect',
      codexWorkdir: tempDir,
      stateDir: path.join(tempDir, 'state'),
    })

    createCodexWorkspace({
      name: 'Docs repo',
      codexCommand: 'codex-next',
      codexSandbox: 'workspace-write',
      codexWorkdir: path.join(tempDir, 'docs'),
      stateDir: path.join(tempDir, 'docs-state'),
      active: true,
    })

    expect(getCodexPaths()).toMatchObject({
      stateDir: path.join(tempDir, 'docs-state'),
      workspace: {
        id: 'docs-repo',
        name: 'Docs repo',
        codexCommand: 'codex-next',
        codexSandbox: 'workspace-write',
        codexApproval: 'on-request',
        runProfile: 'workspace-write',
        codexWorkdir: path.join(tempDir, 'docs'),
      },
    })
  })

  it('requires confirmation before storing risky run profile messages', function () {
    expect(() =>
      sendCodexPrompt({
        sessionKey: 'risk-test',
        message: 'make a write-capable change',
        runProfile: 'workspace-write',
      }),
    ).toThrow('Run profile requires explicit confirmation.')

    expect(listCodexSessions().sessions).toEqual([])
  })

  it('renames and removes non-default workspaces', function () {
    createCodexWorkspace({
      name: 'Feature repo',
      codexWorkdir: path.join(tempDir, 'feature'),
      stateDir: path.join(tempDir, 'feature-state'),
      active: true,
    })
    patchCodexWorkspace({
      id: 'feature-repo',
      name: 'Feature branch repo',
    })

    expect(listCodexWorkspaces().workspaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'feature-repo',
          name: 'Feature branch repo',
        }),
      ]),
    )

    deleteCodexWorkspace('feature-repo')

    expect(listCodexWorkspaces()).toMatchObject({
      activeWorkspaceId: 'default',
      workspaces: [expect.objectContaining({ id: 'default' })],
    })
  })

  it('searches session titles, message text, tool summaries, and tags', function () {
    const storePath = getCodexPaths().storePath
    mkdirSync(path.dirname(storePath), { recursive: true })
    writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        sessions: [
          {
            key: 'release-session',
            friendlyId: 'release-session',
            title: 'Release checklist',
            derivedTitle: 'Release checklist',
            tags: ['alpha', 'publishing'],
            updatedAt: 300,
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'prepare npm alpha notes' }],
                timestamp: 300,
              },
            ],
          },
          {
            key: 'failure-session',
            friendlyId: 'failure-session',
            title: 'CI triage',
            derivedTitle: 'CI triage',
            updatedAt: 200,
            messages: [
              {
                role: 'toolResult',
                toolName: 'command_execution',
                isError: true,
                details: { command: 'pnpm test', exitCode: 1 },
                content: [{ type: 'text', text: 'vitest failure output' }],
                timestamp: 200,
              },
            ],
          },
          {
            key: 'archived-session',
            friendlyId: 'archived-session',
            title: 'Old workspace notes',
            derivedTitle: 'Old workspace notes',
            archived: true,
            updatedAt: 100,
            messages: [
              {
                role: 'assistant',
                content: [{ type: 'text', text: 'legacy archive note' }],
                timestamp: 100,
              },
            ],
          },
        ],
      }),
    )
    resetCodexServerStateForTests()

    expect(listCodexSessions({ query: 'npm alpha' }).sessions).toEqual([
      expect.objectContaining({ friendlyId: 'release-session' }),
    ])
    expect(
      listCodexSessions({
        query: 'vitest failure',
        filter: 'failed',
        includeArchived: true,
      }).sessions,
    ).toEqual([
      expect.objectContaining({
        friendlyId: 'failure-session',
        hasFailedRun: true,
      }),
    ])
    expect(listCodexSessions({ filter: 'tagged' }).sessions).toEqual([
      expect.objectContaining({
        friendlyId: 'release-session',
        tags: ['alpha', 'publishing'],
      }),
    ])
    expect(listCodexSessions({ filter: 'archived' }).sessions).toEqual([
      expect.objectContaining({
        friendlyId: 'archived-session',
        archived: true,
      }),
    ])
    expect(listCodexSessions().sessions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ friendlyId: 'archived-session' }),
      ]),
    )
  })

  it('stores normalized session tags and archive state', function () {
    patchCodexSession({
      key: 'taggable-session',
      tags: [' Release Notes ', 'release-notes', 'QA'],
      archived: true,
    })

    expect(
      listCodexSessions({ includeArchived: true }).sessions,
    ).toContainEqual(
      expect.objectContaining({
        friendlyId: 'taggable-session',
        tags: ['release-notes', 'qa'],
        archived: true,
      }),
    )
    expect(listCodexSessions().sessions).toEqual([])
  })
})
