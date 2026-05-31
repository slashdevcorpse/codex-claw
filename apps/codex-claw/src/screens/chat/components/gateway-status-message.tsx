import { MessageStatus } from './message-status'

type GatewayStatusMessageProps = {
  state: 'checking' | 'error'
  error?: string | null
  onRetry?: () => void
  className?: string
}

export function GatewayStatusMessage({
  state,
  error,
  onRetry,
  className,
}: GatewayStatusMessageProps) {
  const isChecking = state === 'checking'
  const title = isChecking
    ? 'Checking Codex CLI...'
    : 'Codex CLI is unreachable'
  const description = isChecking
    ? 'This dashboard needs access to the local Codex CLI command configured by your server environment variables.'
    : ''
  return (
    <MessageStatus
      title={title}
      description={
        isChecking ? (
          description
        ) : (
          <>
            We could not run Codex CLI from the dashboard server. Confirm{' '}
            <span className="font-mono">CODEX_CLI_COMMAND</span> resolves and
            that Codex CLI is logged in on this machine.
          </>
        )
      }
      detail={isChecking ? null : error}
      actionLabel={isChecking ? undefined : 'Retry'}
      onAction={isChecking ? undefined : onRetry}
      className={className}
    />
  )
}
