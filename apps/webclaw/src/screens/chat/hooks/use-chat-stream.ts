import { useCallback, useEffect, useRef } from 'react'

import { getMessageTimestamp } from '../utils'
import {
  chatQueryKeys,
  updateHistoryMessages,
  updateSessionLastMessage,
} from '../chat-queries'
import type { QueryClient } from '@tanstack/react-query'
import type { GatewayMessage } from '../types'

type UseChatStreamInput = {
  activeFriendlyId: string
  isNewChat: boolean
  isRedirecting: boolean
  resolvedSessionKey: string
  sessionKeyForHistory: string
  queryClient: QueryClient
  refreshHistory: () => void
  onChatEvent?: (payload: {
    runId?: string
    sessionKey?: string
    state?: string
    message?: GatewayMessage
  }) => void
}

export function useChatStream({
  activeFriendlyId,
  isNewChat,
  isRedirecting,
  resolvedSessionKey,
  sessionKeyForHistory,
  queryClient,
  refreshHistory,
  onChatEvent,
}: UseChatStreamInput) {
  const streamSourceRef = useRef<EventSource | null>(null)
  const streamReconnectTimer = useRef<number | null>(null)
  const streamReconnectAttempt = useRef(0)
  const streamRunTextRef = useRef(new Map<string, string>())
  const refreshHistoryRef = useRef(refreshHistory)

  useEffect(() => {
    refreshHistoryRef.current = refreshHistory
  }, [refreshHistory])

  const stopStream = useCallback(() => {
    if (streamReconnectTimer.current) {
      window.clearTimeout(streamReconnectTimer.current)
      streamReconnectTimer.current = null
    }
    if (streamSourceRef.current) {
      streamSourceRef.current.close()
      streamSourceRef.current = null
    }
    streamRunTextRef.current.clear()
  }, [])

  useEffect(() => {
    if (!activeFriendlyId || isNewChat || isRedirecting) return
    let cancelled = false

    function startStream() {
      if (cancelled) return
      if (streamSourceRef.current) {
        streamSourceRef.current.close()
        streamSourceRef.current = null
      }
      const params = new URLSearchParams()
      const streamSessionKey = resolvedSessionKey || sessionKeyForHistory
      if (streamSessionKey) params.set('sessionKey', streamSessionKey)
      if (activeFriendlyId) params.set('friendlyId', activeFriendlyId)
      const source = new EventSource(`/api/stream?${params.toString()}`)
      streamSourceRef.current = source

      function handleStreamEvent(event: MessageEvent) {
        try {
          const parsed = JSON.parse(String(event.data || '{}')) as {
            event?: string
            payload?: unknown
          }
          if (parsed.event === 'chat.history') {
            const payload = parsed.payload as { messages?: Array<unknown> } | null
            if (payload && Array.isArray(payload.messages)) {
              queryClient.setQueryData(
                chatQueryKeys.history(activeFriendlyId, sessionKeyForHistory),
                {
                  sessionKey: sessionKeyForHistory,
                  messages: payload.messages,
                },
              )
              return
            }
            return
          }
          if (!parsed.event) return
          if (parsed.event === 'chat') {
            const payload = parsed.payload as
              | {
                  runId?: string
                  sessionKey?: string
                  state?: string
                  message?: GatewayMessage
                }
              | null
            if (payload) {
              onChatEvent?.(payload)
            }
            if (payload?.message && typeof payload.message === 'object') {
              const payloadSessionKey = payload.sessionKey
              if (
                payloadSessionKey &&
                resolvedSessionKey &&
                payloadSessionKey !== resolvedSessionKey &&
                payloadSessionKey !== sessionKeyForHistory
              ) {
                return
              }
              const streamRunId =
                typeof payload.runId === 'string' ? payload.runId : ''
              const state = typeof payload.state === 'string' ? payload.state : ''
              let nextMessage: GatewayMessage = {
                ...payload.message,
                __streamRunId: streamRunId || undefined,
              }

              if (streamRunId && state === 'delta') {
                const deltaText = rawTextFromMessage(nextMessage)
                const previousText = streamRunTextRef.current.get(streamRunId) ?? ''
                const cumulativeText = mergeDeltaText(previousText, deltaText)
                if (cumulativeText.length > 0) {
                  streamRunTextRef.current.set(streamRunId, cumulativeText)
                  nextMessage = {
                    ...nextMessage,
                    content: [{ type: 'text', text: cumulativeText }],
                  }
                }
              }

              if (streamRunId && state === 'final') {
                const finalText = rawTextFromMessage(nextMessage)
                if (!finalText) {
                  const bufferedText = streamRunTextRef.current.get(streamRunId)
                  if (bufferedText) {
                    nextMessage = {
                      ...nextMessage,
                      content: [{ type: 'text', text: bufferedText }],
                    }
                  }
                }
                streamRunTextRef.current.delete(streamRunId)
              }

              if (
                streamRunId &&
                (state === 'error' || state === 'aborted')
              ) {
                streamRunTextRef.current.delete(streamRunId)
              }

              function upsert(messages: Array<GatewayMessage>) {
                const lastUserIndex = [...messages]
                  .reverse()
                  .findIndex((message) => message.role === 'user')
                const resolvedLastUserIndex =
                  lastUserIndex >= 0 ? messages.length - 1 - lastUserIndex : -1

                if (streamRunId) {
                  const index = messages.findIndex(
                    (message) =>
                      (message as { __streamRunId?: string }).__streamRunId ===
                      streamRunId,
                  )
                  if (index >= 0) {
                    if (index > resolvedLastUserIndex) {
                      const next = [...messages]
                      next[index] = nextMessage
                      return next
                    }
                    return [...messages, nextMessage]
                  }
                }
                if (nextMessage.role === 'assistant') {
                  const nextTime = getMessageTimestamp(nextMessage)
                  const index = [...messages]
                    .reverse()
                    .findIndex((message) => message.role === 'assistant')
                  if (index >= 0) {
                    const target = messages.length - 1 - index
                    if (target > resolvedLastUserIndex) {
                      const targetTime = getMessageTimestamp(messages[target])
                      if (Math.abs(nextTime - targetTime) <= 15000) {
                        const next = [...messages]
                        next[target] = nextMessage
                        return next
                      }
                    }
                    if (resolvedLastUserIndex >= 0 && target <= resolvedLastUserIndex) {
                      const next = [...messages]
                      next.push(nextMessage)
                      return next
                    }
                  }
                }
                return [...messages, nextMessage]
              }

              updateHistoryMessages(
                queryClient,
                activeFriendlyId,
                sessionKeyForHistory,
                upsert,
              )
              if (payloadSessionKey && payloadSessionKey !== sessionKeyForHistory) {
                updateHistoryMessages(
                  queryClient,
                  activeFriendlyId,
                  payloadSessionKey,
                  upsert,
                )
              }
              if (payloadSessionKey) {
                updateSessionLastMessage(
                  queryClient,
                  payloadSessionKey,
                  activeFriendlyId,
                  nextMessage,
                )
              }
            }
            return
          }
          if (!parsed.event.startsWith('chat.')) {
            return
          }
        } catch {
          // ignore parse errors
        }
      }

      function handleStreamOpen() {
        streamReconnectAttempt.current = 0
        refreshHistoryRef.current()
      }

      function handleStreamError() {
        if (cancelled) return
        if (streamReconnectTimer.current) return
        if (streamSourceRef.current) {
          streamSourceRef.current.close()
          streamSourceRef.current = null
        }
        streamReconnectAttempt.current += 1
        const backoff = Math.min(8000, 1000 * streamReconnectAttempt.current)
        streamReconnectTimer.current = window.setTimeout(() => {
          streamReconnectTimer.current = null
          startStream()
        }, backoff)
      }

      source.addEventListener('message', handleStreamEvent)
      source.addEventListener('open', handleStreamOpen)
      source.addEventListener('error', handleStreamError)
    }

    startStream()

    return () => {
      cancelled = true
      stopStream()
    }
  }, [
    activeFriendlyId,
    isNewChat,
    isRedirecting,
    resolvedSessionKey,
    sessionKeyForHistory,
    stopStream,
  ])

  return { stopStream }
}

function rawTextFromMessage(message: GatewayMessage): string {
  const parts = Array.isArray(message.content) ? message.content : []
  return parts
    .map((part) => (part.type === 'text' ? String(part.text ?? '') : ''))
    .join('')
}

function mergeDeltaText(previousText: string, nextText: string): string {
  if (!previousText) return nextText
  if (!nextText) return previousText
  if (nextText.startsWith(previousText)) return nextText
  if (previousText.endsWith(nextText)) return previousText
  return `${previousText}${nextText}`
}
