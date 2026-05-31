import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  activateCodexWorkspace,
  createCodexWorkspace,
  deleteCodexWorkspace,
  listCodexWorkspaces,
  patchCodexWorkspace,
} from '../../server/codex-cli'

function workspaceInput(body: Record<string, unknown>) {
  return {
    id: typeof body.id === 'string' ? body.id.trim() : undefined,
    name: typeof body.name === 'string' ? body.name.trim() : undefined,
    codexCommand:
      typeof body.codexCommand === 'string'
        ? body.codexCommand.trim()
        : undefined,
    codexSandbox:
      typeof body.codexSandbox === 'string'
        ? body.codexSandbox.trim()
        : undefined,
    codexApproval:
      typeof body.codexApproval === 'string'
        ? body.codexApproval.trim()
        : undefined,
    runProfile:
      typeof body.runProfile === 'string' ? body.runProfile.trim() : undefined,
    codexWorkdir:
      typeof body.codexWorkdir === 'string'
        ? body.codexWorkdir.trim()
        : undefined,
    stateDir:
      typeof body.stateDir === 'string' ? body.stateDir.trim() : undefined,
    active: body.active === true,
  }
}

export const Route = createFileRoute('/api/workspaces')({
  server: {
    handlers: {
      GET: () => {
        return json(listCodexWorkspaces())
      },
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          createCodexWorkspace(workspaceInput(body))
          return json(listCodexWorkspaces())
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
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const input = workspaceInput(body)
          if (body.action === 'activate' && input.id) {
            activateCodexWorkspace(input.id)
            return json(listCodexWorkspaces())
          }
          patchCodexWorkspace(input)
          return json(listCodexWorkspaces())
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
      DELETE: ({ request }) => {
        try {
          const url = new URL(request.url)
          const id = url.searchParams.get('id') ?? ''
          deleteCodexWorkspace(id)
          return json(listCodexWorkspaces())
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
