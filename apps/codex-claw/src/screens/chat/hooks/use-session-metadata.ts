import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { chatQueryKeys, updateSessionMetadata } from '../chat-queries'
import type { SessionMeta } from '../types'

type SessionMetadataInput = {
  sessionKey: string
  tags?: Array<string>
  archived?: boolean
}

type SessionMetadataResult = {
  updateMetadata: (input: SessionMetadataInput) => Promise<void>
  updating: boolean
  error: string | null
}

function applySessionMetadata(
  session: SessionMeta,
  payload: SessionMetadataInput,
) {
  if (session.key !== payload.sessionKey) return session
  return {
    ...session,
    tags: payload.tags ?? session.tags,
    archived: payload.archived ?? session.archived,
  }
}

export function useSessionMetadata(): SessionMetadataResult {
  const queryClient = useQueryClient()
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: updateSessionMetadata,
    onMutate: async function onMutate(payload) {
      setError(null)
      await queryClient.cancelQueries({ queryKey: chatQueryKeys.sessions })
      const previousSessions = queryClient.getQueryData(chatQueryKeys.sessions)

      queryClient.setQueryData(
        chatQueryKeys.sessions,
        function update(sessions: unknown) {
          if (!Array.isArray(sessions)) return sessions
          return (sessions as Array<SessionMeta>).map((session) =>
            applySessionMetadata(session, payload),
          )
        },
      )

      return { previousSessions }
    },
    onError: function onError(err, _payload, context) {
      if (context?.previousSessions) {
        queryClient.setQueryData(
          chatQueryKeys.sessions,
          context.previousSessions,
        )
      }
      setError(err instanceof Error ? err.message : String(err))
    },
    onSuccess: function onSuccess() {
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
    },
    onSettled: function onSettled() {
      setUpdating(false)
    },
  })

  const updateMetadata = useCallback(
    async (input: SessionMetadataInput) => {
      if (!input.sessionKey) return
      setUpdating(true)
      await mutation.mutateAsync(input)
    },
    [mutation],
  )

  return { updateMetadata, updating, error }
}
