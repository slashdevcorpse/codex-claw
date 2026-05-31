import { createFileRoute } from '@tanstack/react-router'
import { CodeBlock } from '../components/prompt-kit/code-block'

export const Route = createFileRoute('/connect')({
  component: ConnectRoute,
})

function ConnectRoute() {
  return (
    <div className="min-h-screen bg-primary-50 text-primary-900">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-medium tracking-[-0.02em] text-center mb-10">
            Connect to CodexClaw
          </h1>
          <p className="text-primary-700">
            This alpha runs Codex CLI from the dashboard server. Confirm the
            server process can find your local `codex` command before chatting.
          </p>
        </div>
        <div className="space-y-4 text-primary-700">
          <p>
            At the root of the app package, create a new file named{' '}
            <code className="inline-code">.env.local</code> if you need to
            override the defaults.
          </p>
          <div className="space-y-3">
            <p>Paste this into it:</p>
            <CodeBlock
              content={`CODEX_CLI_COMMAND=codex\nCODEX_CLI_SANDBOX=read-only`}
              ariaLabel="Copy Codex CLI environment example"
              language="bash"
            />
            <p className="text-primary-600 text-sm">Optional workspace root:</p>
            <CodeBlock
              content="CODEX_CLI_WORKDIR=C:/path/to/project"
              ariaLabel="Copy Codex CLI workdir example"
              language="bash"
            />
          </div>
          <p>
            Environment variables are loaded at startup. Restart your dev
            server:
          </p>
          <CodeBlock
            content="pnpm dev"
            ariaLabel="Copy pnpm dev"
            language="bash"
          />
          <p>Refresh the page after the restart and you should be connected.</p>
        </div>

        <div className="space-y-3 rounded-lg border border-primary-200 bg-primary-100 px-4 py-3 text-primary-700 text-sm">
          <p className="text-primary-900 font-medium">
            Codex CLI settings
          </p>
          <div className="space-y-3">
            <p>
              <code className="inline-code">CODEX_CLI_COMMAND</code>
              <br />
              Command used by the server to invoke Codex CLI. The default is
              <code className="inline-code">codex</code>.
            </p>
            <p>
              <code className="inline-code">CODEX_CLI_SANDBOX</code>{' '}
              (recommended)
              <br />
              Sandbox mode passed to Codex CLI. The alpha default is
              <code className="inline-code">read-only</code>.
            </p>
            <p>
              <code className="inline-code">CODEX_CLI_WORKDIR</code>{' '}
              (optional)
              <br />
              Working directory used for Codex CLI runs. Defaults to the app
              process directory.
            </p>
          </div>
          <p>
            Codex CLI docs:{' '}
            <a
              className="text-primary-700 hover:text-primary-900 underline"
              href="https://developers.openai.com/codex/cli"
              target="_blank"
              rel="noreferrer"
            >
              https://developers.openai.com/codex/cli
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
