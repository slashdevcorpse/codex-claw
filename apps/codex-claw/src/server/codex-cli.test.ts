import { describe, expect, it } from 'vitest'

import { mergeAssistantText, processCodexJsonLine } from './codex-cli'

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
