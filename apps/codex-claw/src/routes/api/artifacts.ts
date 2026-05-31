import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getCodexArtifactFile,
  listCodexArtifacts,
} from '../../server/codex-cli'

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.json') return 'application/json'
  if (ext === '.md') return 'text/markdown'
  if (ext === '.patch' || ext === '.diff') return 'text/x-diff'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  return 'text/plain'
}

function downloadName(filePath: string) {
  return path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '-')
}

export const Route = createFileRoute('/api/artifacts')({
  server: {
    handlers: {
      GET: ({ request }) => {
        try {
          const url = new URL(request.url)
          const sessionKey = url.searchParams.get('sessionKey') ?? undefined
          const friendlyId = url.searchParams.get('friendlyId') ?? undefined
          const id = url.searchParams.get('id') ?? ''

          if (url.searchParams.get('manifest') === '1') {
            const payload = listCodexArtifacts({ sessionKey, friendlyId })
            return new Response(JSON.stringify(payload.manifest, null, 2), {
              headers: {
                'content-type': 'application/json; charset=utf-8',
                'content-disposition':
                  'attachment; filename="codexclaw-artifacts-manifest.json"',
              },
            })
          }

          if (id && url.searchParams.get('download') === '1') {
            const payload = getCodexArtifactFile({ id, sessionKey, friendlyId })
            return new Response(payload.content, {
              headers: {
                'content-type': contentTypeForPath(payload.artifact.path),
                'content-disposition':
                  'attachment; filename="' +
                  downloadName(payload.artifact.path) +
                  '"',
              },
            })
          }

          return json(listCodexArtifacts({ sessionKey, friendlyId }))
        } catch (err) {
          return json(
            {
              error: err instanceof Error ? err.message : String(err),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
