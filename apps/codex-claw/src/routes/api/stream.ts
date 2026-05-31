import { createFileRoute } from '@tanstack/react-router'
import { subscribeCodexEvents } from '../../server/codex-cli'

type StreamEventPayload = {
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: number
}

export const Route = createFileRoute('/api/stream')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const sessionKey = url.searchParams.get('sessionKey')?.trim() || ''
        const friendlyId = url.searchParams.get('friendlyId')?.trim() || ''
        const encoder = new TextEncoder()

        let unsubscribe: (() => void) | null = null
        let closed = false

        const stream = new ReadableStream({
          start(controller) {
            function send(data: StreamEventPayload) {
              if (closed) return
              try {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
                )
              } catch {
                closed = true
              }
            }

            const heartbeat = setInterval(() => {
              controller.enqueue(encoder.encode('event: ping\ndata: {}\n\n'))
            }, 15000)

            const key = sessionKey || friendlyId || 'main'
            unsubscribe = subscribeCodexEvents(key, send)

            request.signal.addEventListener(
              'abort',
              () => {
                if (closed) return
                closed = true
                clearInterval(heartbeat)
                unsubscribe?.()
                try {
                  controller.close()
                } catch {
                  return
                }
              },
              { once: true },
            )
          },
          cancel() {
            if (closed) return
            closed = true
            unsubscribe?.()
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
