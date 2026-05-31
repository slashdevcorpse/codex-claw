import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import { getMcpHealthPayload } from '../../server/mcp-health'

export const Route = createFileRoute('/api/mcp-health')({
  server: {
    handlers: {
      GET: () => {
        try {
          return json(getMcpHealthPayload())
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
