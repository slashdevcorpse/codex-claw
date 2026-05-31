import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { codexCliCheck } from '../../server/codex-cli'

export const Route = createFileRoute('/api/ping')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await codexCliCheck()
          return json({ ok: true })
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
