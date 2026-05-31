import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { previewContextAttachment } from '../../server/context-attachments'

export const Route = createFileRoute('/api/context-preview')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}))
          return json(await previewContextAttachment(body))
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 400 },
          )
        }
      },
    },
  },
})
