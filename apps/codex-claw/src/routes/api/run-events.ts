import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCodexRunEventLog } from '../../server/codex-cli'

function downloadName(id: string) {
  return 'codexclaw-run-' + id.replace(/[^a-zA-Z0-9._-]/g, '-') + '.json'
}

export const Route = createFileRoute('/api/run-events')({
  server: {
    handlers: {
      GET: ({ request }) => {
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id') ?? ''
          const payload = getCodexRunEventLog({ id })
          if (url.searchParams.get('download') === '1') {
            return new Response(JSON.stringify(payload, null, 2), {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                'content-disposition':
                  'attachment; filename="' + downloadName(id) + '"',
              },
            })
          }
          return json(payload)
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 404 },
          )
        }
      },
    },
  },
})
