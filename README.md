<p align="center">
  <img src="apps/codex-claw/public/cover.jpg" alt="CodexClaw app preview" width="860">
</p>

<h1 align="center">CodexClaw</h1>

<p align="center">
  A local browser workbench for Codex CLI.
</p>

<p align="center">
  <a href="#alpha-status"><img alt="Status: alpha" src="https://img.shields.io/badge/status-alpha-7057ff"></a>
  <a href="#how-it-works"><img alt="Runtime: Codex CLI" src="https://img.shields.io/badge/runtime-Codex%20CLI-111827"></a>
  <a href="#npm-alpha"><img alt="Package target: npx" src="https://img.shields.io/badge/package-npx%20alpha-c2410c"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0f766e"></a>
</p>

CodexClaw turns your installed <code>codex</code> command into a local web client with chat sessions, history, exports, and a small bootstrap CLI. Prompts still run through your own Codex CLI auth, on your machine, against the workspace you configure.

## Contents

- [Alpha Status](#alpha-status)
- [Why CodexClaw](#why-codexclaw)
- [Quick Start](#quick-start)
- [NPM Alpha](#npm-alpha)
- [Terminal Demo](#terminal-demo)
- [Configuration](#configuration)
- [Common Commands](#common-commands)
- [How It Works](#how-it-works)
- [Beta Track](#beta-track)
- [Contributing](#contributing)

## Alpha Status

CodexClaw is public alpha software. The core local loop works today, but the project is still hardening streaming, attachments, npm release automation, and beta-quality verification.

Use it for local experimentation with Codex CLI. Do not treat it as a production interface yet.

## Why CodexClaw

| Need | What CodexClaw gives you |
| --- | --- |
| Browser workflow | A local React chat surface for Codex CLI sessions |
| Local control | Prompts run through <code>codex exec --json</code> with your local auth |
| Session memory | Conversation history is stored in <code>.codex-claw/sessions.json</code> |
| Project bootstrap | <code>codex-claw</code> can create a fresh local CodexClaw workspace |
| Safer defaults | The app defaults Codex CLI sandboxing to <code>read-only</code> |

## Quick Start

~~~bash
git clone https://github.com/slashdevcorpse/codex-claw.git
cd codex-claw
pnpm install
pnpm dev
~~~

Open [http://localhost:3000](http://localhost:3000).

Requirements:

- Node.js 20 or newer
- pnpm
- Git
- Codex CLI installed and logged in

Check Codex CLI first:

~~~bash
codex --version
codex exec "Reply with: ready"
~~~

## NPM Alpha

The public npm package target is <code>codex-claw@0.1.0-alpha.0</code>.

After the first npm alpha publish, the install path will be:

~~~bash
npx codex-claw@alpha
~~~

Until then, use the source checkout above. The package is intentionally tagged as alpha so early releases do not claim a stable <code>latest</code> workflow.

## Terminal Demo

Target first-run flow:

~~~console
$ npx codex-claw@alpha --help
codex-claw CLI

Usage:
  codex-claw                 Create and start a new project
  codex-claw init [dir]      Initialize a project in a directory
  codex-claw dev             Run development server
  codex-claw doctor          Validate local setup
~~~

Local readiness check:

~~~console
$ codex-claw doctor
Environment looks good.
~~~

Manual source workflow:

~~~console
$ pnpm dev
VITE v6.x ready
Local: http://localhost:3000/
~~~

## Configuration

CodexClaw works with no extra configuration when <code>codex</code> is available on <code>PATH</code>. Add <code>apps/codex-claw/.env.local</code> only when you need to override defaults.

~~~bash
CODEX_CLI_COMMAND=codex
CODEX_CLI_SANDBOX=read-only
CODEX_CLI_WORKDIR=C:/path/to/project
CODEX_CLAW_STATE_DIR=C:/path/to/codex-claw-state
~~~

| Variable | Default | Purpose |
| --- | --- | --- |
| <code>CODEX_CLI_COMMAND</code> | <code>codex</code> | Command used by the server to launch Codex CLI |
| <code>CODEX_CLI_SANDBOX</code> | <code>read-only</code> | Sandbox mode passed to Codex CLI |
| <code>CODEX_CLI_WORKDIR</code> | app process cwd | Workspace directory for Codex CLI runs |
| <code>CODEX_CLAW_STATE_DIR</code> | <code>.codex-claw</code> | Local session-history directory |

## Common Commands

~~~bash
pnpm dev                 # start the app
pnpm build               # build the app
pnpm test                # run app tests
pnpm lint                # run ESLint
pnpm landing:dev         # start the landing page
pnpm landing:build       # build the landing page
pnpm pack:codex-claw     # inspect npm package contents
pnpm release:codex-claw  # publish alpha package with the alpha dist-tag
~~~

## How It Works

~~~text
Browser UI
  -> app API routes
  -> local Codex CLI adapter
  -> codex exec --json
  -> .codex-claw/sessions.json
~~~

The browser talks to local server routes in <code>apps/codex-claw</code>. Those routes call <code>apps/codex-claw/src/server/codex-cli.ts</code>, which launches Codex CLI and writes session data locally.

## Beta Track

CodexClaw can move from alpha toward beta when these workflows are reliable:

- Progressive Codex CLI streaming
- Image attachment pass-through to Codex CLI
- npm alpha publish through <code>npx codex-claw@alpha</code>
- release checklist for package contents, smoke tests, and docs
- CI coverage for app build, tests, lint, and package dry run

## Project Layout

~~~text
apps/codex-claw/       React app and local server routes
apps/landing/          Public landing page
packages/codex-claw/   CLI package
pnpm-workspace.yaml    Workspace definition
~~~

## Contributing

Small, focused changes are preferred during alpha. Good areas to work on:

- Codex CLI streaming support
- attachment pass-through
- CLI packaging and install polish
- tests around local session behavior
- documentation that makes setup clearer

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## License

MIT. See [LICENSE](LICENSE).
