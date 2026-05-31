export type ToolCallContent = {
  type: 'toolCall'
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  partialJson?: string
}

export type ToolResultContent = {
  type: 'toolResult'
  toolCallId?: string
  toolName?: string
  content?: Array<{ type?: string; text?: string }>
  details?: Record<string, unknown>
  isError?: boolean
}

export type TextContent = {
  type: 'text'
  text?: string
  textSignature?: string
}

export type ThinkingContent = {
  type: 'thinking'
  thinking?: string
  thinkingSignature?: string
}

export type ImageContent = {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
}

export type MessageContent =
  | TextContent
  | ToolCallContent
  | ThinkingContent
  | ImageContent

export type GatewayMessage = {
  role?: string
  content?: Array<MessageContent>
  toolCallId?: string
  toolName?: string
  details?: Record<string, unknown>
  isError?: boolean
  timestamp?: number
  [key: string]: unknown
  __optimisticId?: string
}

export type SessionSummary = {
  key?: string
  label?: string
  title?: string
  derivedTitle?: string
  updatedAt?: number
  lastMessage?: GatewayMessage | null
  friendlyId?: string
  totalTokens?: number
  contextTokens?: number
}

export type SessionListResponse = {
  sessions?: Array<SessionSummary>
}

export type HistoryResponse = {
  sessionKey: string
  sessionId?: string
  messages: Array<GatewayMessage>
}

export type SessionMeta = {
  key: string
  friendlyId: string
  title?: string
  derivedTitle?: string
  label?: string
  updatedAt?: number
  lastMessage?: GatewayMessage | null
  totalTokens?: number
  contextTokens?: number
}

export type PathsPayload = {
  agentId: string
  stateDir: string
  sessionsDir: string
  storePath: string
  workspacesStorePath: string
  workspace: WorkspaceSummary
}

export type WorkspaceSummary = {
  id: string
  name: string
  codexCommand: string
  codexSandbox: string
  codexApproval: string
  runProfile: RunProfileId
  codexWorkdir: string
  stateDir: string
  createdAt: number
  updatedAt: number
}

export type RunProfileId =
  | 'read-only-inspect'
  | 'workspace-write'
  | 'elevated-manual-review'

export type RunProfileSummary = {
  id: RunProfileId
  label: string
  sandbox: string
  approval: string
  requiresConfirmation: boolean
}

export type WorkspaceHealthStatus = 'ok' | 'warning' | 'error'

export type WorkspaceHealthCheck = {
  id: string
  label: string
  status: WorkspaceHealthStatus
  summary: string
  detail?: string
  fixCommand?: string
}

export type WorkspaceHealthPayload = {
  ok: boolean
  workspaceId: string
  checkedAt: number
  checks: Array<WorkspaceHealthCheck>
}

export type WorkspaceListResponse = {
  activeWorkspaceId: string
  workspaces: Array<WorkspaceSummary>
  health: WorkspaceHealthPayload
}

export type RepoContextEntry = {
  path: string
  name: string
  type: 'file' | 'directory'
  depth: number
  size?: number
}

export type RepoAgentFile = {
  path: string
  directory: string
  appliesToSelected: boolean
}

export type RepoContextSelection = {
  path: string
  type?: 'file' | 'directory'
}

export type RepoContextEstimate = {
  selectedPaths: Array<string>
  fileCount: number
  byteCount: number
  estimatedTokens: number
  oversized: boolean
  truncated: boolean
}

export type RepoContextPayload = {
  workdir: string
  entries: Array<RepoContextEntry>
  agents: Array<RepoAgentFile>
  applicableAgents: Array<RepoAgentFile>
  estimate: RepoContextEstimate
}

export type GitFileState = 'staged' | 'unstaged' | 'untracked' | 'deleted'

export type GitReviewFile = {
  path: string
  state: GitFileState
  indexStatus: string
  worktreeStatus: string
  diff: string
}

export type GitReviewPayload = {
  ok: boolean
  workdir: string
  branch: string
  files: Array<GitReviewFile>
  groups: Record<GitFileState, Array<GitReviewFile>>
  patch: string
  draftCommitMessage: string
}

export type McpHealthStatus = 'ok' | 'warning' | 'error'

export type McpEnvRequirement = {
  name: string
  status: McpHealthStatus
  source: 'config' | 'process' | 'missing'
  reference?: string
}

export type McpServerHealth = {
  name: string
  enabled: boolean
  command: string
  args: Array<string>
  env: Array<McpEnvRequirement>
  status: McpHealthStatus
  summary: string
  commandPath?: string
}

export type McpSetupSnippet = {
  id: string
  label: string
  description: string
  snippet: string
}

export type McpHealthPayload = {
  ok: boolean
  workspaceId: string
  workdir: string
  configPath?: string
  checkedConfigPaths: Array<string>
  checkedAt: number
  servers: Array<McpServerHealth>
  setupSnippets: Array<McpSetupSnippet>
}
