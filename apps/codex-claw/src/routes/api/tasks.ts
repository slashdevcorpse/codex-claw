import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

import {
  cancelCodexTask,
  listCodexTasks,
  retryCodexTask,
} from '../../server/codex-cli'

export const Route = createFileRoute('/api/tasks')({
  server: {
    handlers: {
      GET: () => {
        try {
          return json(listCodexTasks())
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
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const action = typeof body.action === 'string' ? body.action : ''
          const id = typeof body.id === 'string' ? body.id.trim() : ''
          if (action === 'cancel') return json(cancelCodexTask(id))
          if (action === 'retry') return json(retryCodexTask(id))
          return json(
            { ok: false, error: 'unsupported action' },
            { status: 400 },
          )
        } catch (err) {
          return json(
            {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
