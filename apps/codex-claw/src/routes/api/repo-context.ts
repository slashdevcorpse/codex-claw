import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getRepoContextPayload } from '../../server/repo-context'
import type { RepoContextSelection } from '../../server/repo-context'

function parseSelections(url: URL): Array<RepoContextSelection> {
  return url.searchParams
    .getAll('selected')
    .map((path) => path.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((path) => ({ path }))
}

export const Route = createFileRoute('/api/repo-context')({
  server: {
    handlers: {
      GET: ({ request }) => {
        try {
          const url = new URL(request.url)
          return json(getRepoContextPayload(parseSelections(url)))
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
