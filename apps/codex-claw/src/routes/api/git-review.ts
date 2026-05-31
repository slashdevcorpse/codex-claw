import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getGitReviewPayload,
  stageGitReviewFiles,
} from '../../server/git-review'

export const Route = createFileRoute('/api/git-review')({
  server: {
    handlers: {
      GET: () => {
        try {
          return json(getGitReviewPayload())
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
          const paths = Array.isArray(body.paths)
            ? body.paths.filter(
                (item): item is string => typeof item === 'string',
              )
            : []
          if (action === 'stage') {
            return json(stageGitReviewFiles(paths))
          }
          if (action === 'draft') {
            return json(getGitReviewPayload())
          }
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
            { status: 500 },
          )
        }
      },
    },
  },
})
