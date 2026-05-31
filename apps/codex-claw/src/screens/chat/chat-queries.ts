import { getMessageTimestamp, normalizeSessions, readError } from './utils'
import type { QueryClient } from '@tanstack/react-query'
import type {
  GatewayMessage,
  GitReviewPayload,
  HistoryResponse,
  McpHealthPayload,
  RepoContextPayload,
  RepoContextSelection,
  SessionListResponse,
  SessionMeta,
  TaskListResponse,
  WorkspaceListResponse,
  WorkspaceSummary,
} from './types'

type GatewayStatusResponse = {
  ok: boolean
  error?: string
}

export const chatQueryKeys = {
  sessions: ['chat', 'sessions'] as const,
  sessionSearch: function sessionSearch(params: SessionSearchParams) {
    return [
      'chat',
      'session-search',
      params.query ?? '',
      params.filter ?? 'workspace',
      params.tag ?? '',
    ] as const
  },
  workspaces: ['chat', 'workspaces'] as const,
  tasks: ['chat', 'tasks'] as const,
  history: function history(friendlyId: string, sessionKey: string) {
    return ['chat', 'history', friendlyId, sessionKey] as const
  },
} as const

export type SessionSearchFilter =
  | 'workspace'
  | 'pinned'
  | 'recent'
  | 'failed'
  | 'tagged'
  | 'archived'

export type SessionSearchParams = {
  query?: string
  filter?: SessionSearchFilter
  tag?: string
  signal?: AbortSignal
}

export async function fetchSessions(): Promise<Array<SessionMeta>> {
  const res = await fetch('/api/sessions?includeArchived=1')
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as SessionListResponse
  return normalizeSessions(data.sessions)
}

export async function fetchSessionSearch(
  params: SessionSearchParams,
): Promise<Array<SessionMeta>> {
  const query = new URLSearchParams({ includeArchived: '1' })
  const rawQuery = params.query?.trim() ?? ''
  const filter = params.filter ?? 'workspace'
  if (rawQuery) query.set('q', rawQuery)
  if (filter !== 'workspace' && filter !== 'pinned') {
    query.set('filter', filter)
  }
  if (params.tag?.trim()) query.set('tag', params.tag.trim())
  const res = await fetch('/api/sessions?' + query.toString(), {
    signal: params.signal,
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as SessionListResponse
  return normalizeSessions(data.sessions)
}

export async function updateSessionMetadata(payload: {
  sessionKey: string
  tags?: Array<string>
  archived?: boolean
}): Promise<SessionMeta> {
  const res = await fetch('/api/sessions', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await readError(res))
  const data = (await res.json()) as { entry?: SessionSummary }
  if (!data.entry) {
    throw new Error('Session metadata update returned no session.')
  }
  const [session] = normalizeSessions([data.entry])
  return session
}

export async function fetchHistory(payload: {
  sessionKey: string
  friendlyId: string
}): Promise<HistoryResponse> {
  const query = new URLSearchParams({ limit: '200' })
  if (payload.sessionKey) query.set('sessionKey', payload.sessionKey)
  if (payload.friendlyId) query.set('friendlyId', payload.friendlyId)
  const res = await fetch(`/api/history?${query.toString()}`)
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as HistoryResponse
}

export async function fetchGatewayStatus(): Promise<GatewayStatusResponse> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 2500)

  try {
    const res = await fetch('/api/ping', { signal: controller.signal })
    if (!res.ok) throw new Error(await readError(res))
    return (await res.json()) as GatewayStatusResponse
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Codex CLI check timed out')
    }
    throw err
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function fetchWorkspaces(): Promise<WorkspaceListResponse> {
  const res = await fetch('/api/workspaces')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as WorkspaceListResponse
}

export async function createWorkspace(
  workspace: Partial<WorkspaceSummary> & { active?: boolean },
): Promise<WorkspaceListResponse> {
  const res = await fetch('/api/workspaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workspace),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as WorkspaceListResponse
}

export async function updateWorkspace(
  workspace: Partial<WorkspaceSummary> & { id: string; active?: boolean },
): Promise<WorkspaceListResponse> {
  const res = await fetch('/api/workspaces', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(workspace),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as WorkspaceListResponse
}

export async function activateWorkspace(
  id: string,
): Promise<WorkspaceListResponse> {
  const res = await fetch('/api/workspaces', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action: 'activate' }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as WorkspaceListResponse
}

export async function deleteWorkspace(
  id: string,
): Promise<WorkspaceListResponse> {
  const query = new URLSearchParams({ id })
  const res = await fetch(`/api/workspaces?${query.toString()}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as WorkspaceListResponse
}

export async function fetchRepoContext(
  selections: Array<RepoContextSelection>,
): Promise<RepoContextPayload> {
  const query = new URLSearchParams()
  for (const selection of selections) {
    if (selection.path.trim()) query.append('selected', selection.path.trim())
  }
  const suffix = query.toString() ? '?' + query.toString() : ''
  const res = await fetch('/api/repo-context' + suffix)
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as RepoContextPayload
}

export async function fetchGitReview(): Promise<GitReviewPayload> {
  const res = await fetch('/api/git-review')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as GitReviewPayload
}

export async function fetchMcpHealth(): Promise<McpHealthPayload> {
  const res = await fetch('/api/mcp-health')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as McpHealthPayload
}

export async function fetchCodexTasks(): Promise<TaskListResponse> {
  const res = await fetch('/api/tasks')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as TaskListResponse
}

export async function cancelCodexTask(id: string): Promise<TaskListResponse> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', id }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return fetchCodexTasks()
}

export async function retryCodexTask(id: string): Promise<TaskListResponse> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'retry', id }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return fetchCodexTasks()
}

export async function stageGitReviewFiles(
  paths: Array<string>,
): Promise<GitReviewPayload> {
  const res = await fetch('/api/git-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'stage', paths }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as GitReviewPayload
}

export function updateHistoryMessages(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  updater: (messages: Array<GatewayMessage>) => Array<GatewayMessage>,
) {
  const queryKey = chatQueryKeys.history(friendlyId, sessionKey)
  queryClient.setQueryData(queryKey, function update(data: unknown) {
    const current = data as HistoryResponse | undefined
    const messages = Array.isArray(current?.messages) ? current.messages : []
    const nextMessages = updater(messages)
    return {
      sessionKey: current?.sessionKey ?? sessionKey,
      sessionId: current?.sessionId,
      messages: nextMessages,
    }
  })
}

export function appendHistoryMessage(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  message: GatewayMessage,
) {
  updateHistoryMessages(
    queryClient,
    friendlyId,
    sessionKey,
    function append(messages) {
      return [...messages, message]
    },
  )
}

export function updateHistoryMessageByClientId(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  clientId: string,
  updater: (message: GatewayMessage) => GatewayMessage,
) {
  const optimisticId = `opt-${clientId}`
  updateHistoryMessages(
    queryClient,
    friendlyId,
    sessionKey,
    function update(messages) {
      return messages.map((message) => {
        if (
          message.clientId === clientId ||
          message.__optimisticId === clientId ||
          message.__optimisticId === optimisticId
        ) {
          return updater(message)
        }
        return message
      })
    },
  )
}

export function removeHistoryMessageByClientId(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
  clientId: string,
  optimisticId?: string,
) {
  updateHistoryMessages(
    queryClient,
    friendlyId,
    sessionKey,
    function remove(messages) {
      return messages.filter((message) => {
        if (message.clientId === clientId) return false
        if (message.__optimisticId === clientId) return false
        if (optimisticId && message.__optimisticId === optimisticId)
          return false
        return true
      })
    },
  )
}

export function clearHistoryMessages(
  queryClient: QueryClient,
  friendlyId: string,
  sessionKey: string,
) {
  const queryKey = chatQueryKeys.history(friendlyId, sessionKey)
  queryClient.setQueryData(queryKey, {
    sessionKey,
    messages: [],
  })
}

export function moveHistoryMessages(
  queryClient: QueryClient,
  fromFriendlyId: string,
  fromSessionKey: string,
  toFriendlyId: string,
  toSessionKey: string,
) {
  const fromKey = chatQueryKeys.history(fromFriendlyId, fromSessionKey)
  const toKey = chatQueryKeys.history(toFriendlyId, toSessionKey)
  const fromData = queryClient.getQueryData<HistoryResponse>(fromKey)
  if (!fromData) return
  const messages = Array.isArray(fromData.messages) ? fromData.messages : []
  queryClient.setQueryData(toKey, {
    sessionKey: toSessionKey,
    sessionId: fromData.sessionId,
    messages,
  })
  queryClient.removeQueries({ queryKey: fromKey, exact: true })
}

export function updateSessionLastMessage(
  queryClient: QueryClient,
  sessionKey: string,
  friendlyId: string,
  message: GatewayMessage,
) {
  const messageUpdatedAt = getMessageTimestamp(message)
  queryClient.setQueryData(
    chatQueryKeys.sessions,
    function update(messages: unknown) {
      if (!Array.isArray(messages)) return messages
      const nextSessions = (messages as Array<SessionMeta>).map((session) => {
        if (session.key !== sessionKey && session.friendlyId !== friendlyId) {
          return session
        }
        return {
          ...session,
          lastMessage: message,
          updatedAt:
            typeof session.updatedAt === 'number' &&
            Number.isFinite(session.updatedAt) &&
            session.updatedAt > messageUpdatedAt
              ? session.updatedAt
              : messageUpdatedAt,
        }
      })

      return [...nextSessions].sort((a, b) => {
        const aUpdatedAt =
          typeof a.updatedAt === 'number' && Number.isFinite(a.updatedAt)
            ? a.updatedAt
            : 0
        const bUpdatedAt =
          typeof b.updatedAt === 'number' && Number.isFinite(b.updatedAt)
            ? b.updatedAt
            : 0
        return bUpdatedAt - aUpdatedAt
      })
    },
  )
}

export function removeSessionFromCache(
  queryClient: QueryClient,
  sessionKey: string,
  friendlyId: string,
) {
  queryClient.setQueryData(
    chatQueryKeys.sessions,
    function update(messages: unknown) {
      if (!Array.isArray(messages)) return messages
      return (messages as Array<SessionMeta>).filter((session) => {
        return session.key !== sessionKey && session.friendlyId !== friendlyId
      })
    },
  )

  queryClient.removeQueries({
    queryKey: ['chat', 'history', friendlyId],
    exact: false,
  })
  if (sessionKey && sessionKey !== friendlyId) {
    queryClient.removeQueries({
      queryKey: ['chat', 'history', sessionKey],
      exact: false,
    })
  }
}
