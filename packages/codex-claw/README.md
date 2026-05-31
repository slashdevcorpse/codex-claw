# codex-claw

Alpha CLI for CodexClaw, a local browser workbench for Codex CLI.

The package is designed for an <code>npx codex-claw@alpha</code> first-run workflow. It can bootstrap a CodexClaw project, write Codex CLI defaults, start the app, and run project checks from an existing checkout.

## Status

- Package name: <code>codex-claw</code>
- Current version: <code>0.1.0-alpha.0</code>
- Release channel: <code>alpha</code>
- Runtime dependency: your installed and authenticated Codex CLI

## Requirements

- Node.js 20 or newer
- Git
- Codex CLI installed and logged in
- pnpm for local development workflows

## Alpha Install

After the first public npm publish:

~~~bash
npx codex-claw@alpha
~~~

Useful non-interactive bootstrap:

~~~bash
npx codex-claw@alpha --yes --no-start --project-name codex-claw-demo
cd codex-claw-demo
pnpm install
pnpm dev
~~~

## Local Development Usage

From this repository:

~~~bash
pnpm -C packages/codex-claw exec codex-claw --help
pnpm -C packages/codex-claw exec codex-claw doctor
~~~

## Commands

| Command | Purpose |
| --- | --- |
| <code>codex-claw</code> | Create and start a project |
| <code>codex-claw init [dir]</code> | Initialize a project in a directory |
| <code>codex-claw dev</code> | Start the app dev server |
| <code>codex-claw build</code> | Build the app |
| <code>codex-claw preview</code> | Preview the production build |
| <code>codex-claw test</code> | Run tests |
| <code>codex-claw lint</code> | Run lint |
| <code>codex-claw doctor</code> | Validate Node.js, pnpm, and Codex CLI |

## Prompts

The bootstrap flow asks for:

- project name
- Codex CLI command
- Codex CLI sandbox mode
- optional Codex CLI working directory
- local dev port

Then it creates the project folder, installs dependencies, and starts CodexClaw unless <code>--no-start</code> is provided.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| <code>CODEX_CLI_COMMAND</code> | <code>codex</code> | Command used by the app server to launch Codex CLI |
| <code>CODEX_CLI_SANDBOX</code> | <code>read-only</code> | Sandbox mode passed to Codex CLI |
| <code>CODEX_CLI_WORKDIR</code> | app process cwd | Workspace directory for Codex CLI runs |
| <code>CODEX_CLAW_STATE_DIR</code> | <code>.codex-claw</code> | Local session-history directory |

## Publish Checklist

~~~bash
npm whoami
npm view codex-claw version dist-tags --json
pnpm pack:codex-claw
pnpm release:codex-claw
~~~

The release script publishes with the <code>alpha</code> dist-tag so early builds stay clearly separated from a future stable channel.
