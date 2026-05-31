import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getSessionHandoffExport,
  isSessionHandoffKind,
} from '../../server/session-bundle'

function downloadName(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export const Route = createFileRoute('/api/session-bundle')({
  server: {
    handlers: {
      GET: ({ request }) => {
        try {
          const url = new URL(request.url)
          const rawKind = url.searchParams.get('kind') ?? 'bundle'
          const kind = isSessionHandoffKind(rawKind) ? rawKind : 'bundle'
          const payload = getSessionHandoffExport({
            kind,
            sessionKey: url.searchParams.get('sessionKey') ?? undefined,
            friendlyId: url.searchParams.get('friendlyId') ?? undefined,
          })

          if (url.searchParams.get('download') === '1') {
            return new Response(payload.markdown, {
              headers: {
                'content-type': 'text/markdown; charset=utf-8',
                'content-disposition':
                  'attachment; filename="' + downloadName(payload.filename) + '"',
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
