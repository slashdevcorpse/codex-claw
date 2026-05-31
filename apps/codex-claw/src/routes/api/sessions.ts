import { randomUUID } from 'node:crypto'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  deleteCodexSession,
  listCodexSessions,
  patchCodexSession,
  resolveCodexSession,
} from '../../server/codex-cli'

export const Route = createFileRoute('/api/sessions')({
  server: {
    handlers: {
      GET: async () => {
        try {
          return json(await listCodexSessions())
        } catch (err) {
          return json(
            {
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
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined
          const friendlyId = randomUUID()
          const payload = await patchCodexSession({ key: friendlyId, label })

          return json({
            ok: true,
            sessionKey: payload.key,
            friendlyId,
            entry: payload.entry,
          })
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
      PATCH: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as Record<
            string,
            unknown
          >
          const rawSessionKey =
            typeof body.sessionKey === 'string' ? body.sessionKey.trim() : ''
          const rawFriendlyId =
            typeof body.friendlyId === 'string' ? body.friendlyId.trim() : ''
          const label =
            typeof body.label === 'string' ? body.label.trim() : undefined
          let sessionKey = rawSessionKey

          if (!sessionKey && rawFriendlyId) {
            const resolved = await resolveCodexSession(rawFriendlyId)
            if (typeof resolved.key === 'string') sessionKey = resolved.key
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          const payload = await patchCodexSession({ key: sessionKey, label })
          return json({
            ok: true,
            sessionKey: payload.key,
            entry: payload.entry,
          })
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
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const rawSessionKey = url.searchParams.get('sessionKey') ?? ''
          const rawFriendlyId = url.searchParams.get('friendlyId') ?? ''
          let sessionKey = rawSessionKey.trim()

          if (!sessionKey && rawFriendlyId.trim()) {
            const resolved = await resolveCodexSession(rawFriendlyId.trim())
            if (typeof resolved.key === 'string') sessionKey = resolved.key
          }

          if (!sessionKey) {
            return json(
              { ok: false, error: 'sessionKey required' },
              { status: 400 },
            )
          }

          await deleteCodexSession(sessionKey)
          return json({ ok: true, sessionKey })
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
