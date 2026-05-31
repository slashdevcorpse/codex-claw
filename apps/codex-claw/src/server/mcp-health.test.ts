import { describe, expect, it } from 'vitest'

import { parseCodexMcpServers, redactMcpArgs } from './mcp-health'

describe('parseCodexMcpServers', function () {
  it('reads server command, args, and inline env config', function () {
    const config = [
      '[mcp_servers.filesystem]',
      'command = "npx"',
      'args = ["-y", "@modelcontextprotocol/server-filesystem", "/repo"]',
      'env = { API_TOKEN = "$API_TOKEN" }',
    ].join('\n')
    const servers = parseCodexMcpServers(config)

    expect(servers).toEqual([
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/repo'],
        env: { API_TOKEN: '$API_TOKEN' },
        enabled: true,
      },
    ])
  })

  it('reads nested env sections without treating comments as values', function () {
    const config = [
      '[mcp_servers."local memory"]',
      'command = "node"',
      'args = ["server.js"] # keep comments out',
      '',
      '[mcp_servers."local memory".env]',
      'SECRET_KEY = "literal-secret"',
    ].join('\n')
    const servers = parseCodexMcpServers(config)

    expect(servers[0]).toMatchObject({
      name: 'local memory',
      command: 'node',
      args: ['server.js'],
      env: { SECRET_KEY: 'literal-secret' },
    })
  })

  it('redacts secret-like command arguments', function () {
    expect(
      redactMcpArgs([
        '--token',
        'secret-value',
        '--api-key=another-secret',
        'SAFE_VALUE=yes',
      ]),
    ).toEqual([
      '--token',
      '[redacted]',
      '--api-key=[redacted]',
      'SAFE_VALUE=yes',
    ])
  })
})
