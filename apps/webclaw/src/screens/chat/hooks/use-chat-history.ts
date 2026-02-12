import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'

import { chatQueryKeys, fetchHistory } from '../chat-queries'
import { getMessageTimestamp, textFromMessage } from '../utils'
import type { QueryClient } from '@tanstack/react-query'
import type { GatewayMessage, HistoryResponse } from '../types'

type UseChatHistoryInput = {
  activeFriendlyId: string
  activeSessionKey: string
  forcedSessionKey?: string
  isNewChat: boolean
  isRedirecting: boolean
  activeExists: boolean
  sessionsReady: boolean
  queryClient: QueryClient
}

export function useChatHistory({
  activeFriendlyId,
  activeSessionKey,
  forcedSessionKey,
  isNewChat,
  isRedirecting,
  activeExists,
  sessionsReady,
  queryClient,
}: UseChatHistoryInput) {
  const sessionKeyForHistory =
    forcedSessionKey || activeSessionKey || activeFriendlyId
  const historyKey = chatQueryKeys.history(
    activeFriendlyId,
    sessionKeyForHistory,
  )
  const historyQuery = useQuery({
    queryKey: historyKey,
    queryFn: async function fetchHistoryForSession() {
      const cached = queryClient.getQueryData<HistoryResponse>(historyKey)
      const cachedMessages = Array.isArray(cached?.messages)
        ? cached.messages
        : []
      const optimisticMessages = cachedMessages.filter((message) => {
        if (message.status === 'sending') return true
        if (message.__optimisticId) return true
        return Boolean(message.clientId)
      })
      const streamingMessages = cachedMessages.filter((message) => {
        const runId = (message as { __streamRunId?: unknown }).__streamRunId
        return typeof runId === 'string' && runId.trim().length > 0
      })

      const serverData = await fetchHistory({
        sessionKey: sessionKeyForHistory,
        friendlyId: activeFriendlyId,
      })
      if (!optimisticMessages.length && !streamingMessages.length) {
        return serverData
      }

      const mergedWithOptimistic = mergeOptimisticHistoryMessages(
        serverData.messages,
        optimisticMessages,
      )
      const merged = mergeStreamingHistoryMessages(
        mergedWithOptimistic,
        streamingMessages,
      )

      return {
        ...serverData,
        messages: merged,
      }
    },
    enabled:
      !isNewChat &&
      Boolean(activeFriendlyId) &&
      !isRedirecting &&
      (!sessionsReady || activeExists),
    placeholderData: function useCachedHistory(): HistoryResponse | undefined {
      return queryClient.getQueryData(historyKey)
    },
    gcTime: 1000 * 60 * 10,
  })

  const stableHistorySignatureRef = useRef('')
  const stableHistoryMessagesRef = useRef<Array<GatewayMessage>>([])
  const historyMessages = useMemo(() => {
    const messages = Array.isArray(historyQuery.data?.messages)
      ? historyQuery.data.messages
      : []
    const last = messages.at(-1)
    const lastId = typeof last?.id === 'string' ? last.id : ''
    const lastRole = typeof last?.role === 'string' ? last.role : ''
    const lastText = last ? textFromMessage(last) : ''
    const signature = `${messages.length}:${lastRole}:${lastId}:${lastText.slice(-32)}`
    if (signature === stableHistorySignatureRef.current) {
      return stableHistoryMessagesRef.current
    }
    stableHistorySignatureRef.current = signature
    stableHistoryMessagesRef.current = messages
    return messages
  }, [historyQuery.data?.messages])

  const historyError =
    historyQuery.error instanceof Error ? historyQuery.error.message : null
  const resolvedSessionKey = useMemo(() => {
    if (forcedSessionKey) return forcedSessionKey
    const key = historyQuery.data?.sessionKey
    if (typeof key === 'string' && key.trim().length > 0) return key.trim()
    return activeSessionKey
  }, [activeSessionKey, forcedSessionKey, historyQuery.data?.sessionKey])
  const activeCanonicalKey = isNewChat
    ? 'new'
    : resolvedSessionKey || activeFriendlyId

  return {
    historyQuery,
    historyMessages,
    displayMessages: historyMessages,
    historyError,
    resolvedSessionKey,
    activeCanonicalKey,
    sessionKeyForHistory,
  }
}

function mergeStreamingHistoryMessages(
  serverMessages: Array<GatewayMessage>,
  streamingMessages: Array<GatewayMessage>,
): Array<GatewayMessage> {
  if (!streamingMessages.length) return serverMessages

  const merged = [...serverMessages]
  for (const streamingMessage of streamingMessages) {
    const runId = (streamingMessage as { __streamRunId?: unknown }).__streamRunId
    if (typeof runId !== 'string' || runId.trim().length === 0) continue

    const hasMatch = merged.some((serverMessage) => {
      const serverRunId = (serverMessage as { __streamRunId?: unknown })
        .__streamRunId
      if (
        typeof serverRunId === 'string' &&
        serverRunId.trim().length > 0 &&
        serverRunId === runId
      ) {
        return true
      }
      if (serverMessage.role !== streamingMessage.role) return false
      const streamingText = textFromMessage(streamingMessage)
      if (!streamingText) return false
      if (streamingText !== textFromMessage(serverMessage)) return false
      const streamingTime = getMessageTimestamp(streamingMessage)
      const serverTime = getMessageTimestamp(serverMessage)
      return Math.abs(streamingTime - serverTime) <= 15000
    })

    if (!hasMatch) {
      merged.push(streamingMessage)
    }
  }

  return merged
}

function mergeOptimisticHistoryMessages(
  serverMessages: Array<GatewayMessage>,
  optimisticMessages: Array<GatewayMessage>,
): Array<GatewayMessage> {
  if (!optimisticMessages.length) return serverMessages

  const merged = [...serverMessages]
  for (const optimisticMessage of optimisticMessages) {
    const hasMatch = serverMessages.some((serverMessage) => {
      if (
        optimisticMessage.clientId &&
        serverMessage.clientId &&
        optimisticMessage.clientId === serverMessage.clientId
      ) {
        return true
      }
      if (
        optimisticMessage.__optimisticId &&
        serverMessage.__optimisticId &&
        optimisticMessage.__optimisticId === serverMessage.__optimisticId
      ) {
        return true
      }
      if (optimisticMessage.role && serverMessage.role) {
        if (optimisticMessage.role !== serverMessage.role) return false
      }
      const optimisticText = textFromMessage(optimisticMessage)
      if (!optimisticText) return false
      if (optimisticText !== textFromMessage(serverMessage)) return false
      const optimisticTime = getMessageTimestamp(optimisticMessage)
      const serverTime = getMessageTimestamp(serverMessage)
      return Math.abs(optimisticTime - serverTime) <= 10000
    })

    if (!hasMatch) {
      merged.push(optimisticMessage)
    }
  }

  return merged
}
