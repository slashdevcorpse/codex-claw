import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getCodexPaths } from '../../server/codex-cli'

export const Route = createFileRoute('/api/paths')({
  server: {
    handlers: {
      GET: () => {
        return json(getCodexPaths())
      },
    },
  },
})
