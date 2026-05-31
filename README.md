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
- [Troubleshooting](#troubleshooting)
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

The public npm package target is <code>codex-claw@0.1.0-alpha.1</code>.

After the first npm alpha publish, start without a global install:

~~~powershell
# Windows PowerShell
npx codex-claw@alpha
npm exec codex-claw@alpha -- doctor
~~~

~~~bash
# macOS and Linux
npx codex-claw@alpha
npm exec codex-claw@alpha -- doctor
~~~

For a pinned global CLI during alpha:

~~~bash
npm install -g codex-claw@alpha
codex-claw doctor
codex-claw --help
~~~

Update by re-running <code>npx codex-claw@alpha</code> or reinstalling the alpha tag:

~~~bash
npm install -g codex-claw@alpha
~~~

Until the first alpha package exists on npm, use the source checkout above. The package is intentionally tagged as alpha so early releases do not claim a stable <code>latest</code> workflow.

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

Local source readiness check:

~~~console
$ node packages/codex-claw/bin/codex-claw.js doctor
[ok] Node.js: Node.js 20.19.5
[ok] npm: 10.8.2
[warn] npm auth: npm auth unavailable. Run `npm login` before publishing codex-claw@alpha.
[ok] pnpm: 9.15.4
[ok] git: git version 2.51.0.windows.1
[ok] git worktree: Current directory is a git worktree.
[ok] Codex CLI: codex-cli 0.61.0
[ok] state directory: .codex-claw can be created on first run.
[ok] port: Port 3000 is available.
Environment is usable with 1 warning(s).
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
pnpm smoke:codex-claw    # run npx against the packed local tarball
pnpm smoke:codex-claw:npm # run npx against codex-claw@alpha once published
pnpm release:codex-claw  # publish alpha package with the alpha dist-tag
~~~

## Troubleshooting

| Symptom | What to run |
| --- | --- |
| <code>npm auth unavailable</code> | Run <code>npm login</code>, then <code>npm whoami</code> before publishing |
| <code>codex-claw@alpha was not found on npm</code> | The alpha package has not been published yet; use the source checkout or publish with <code>pnpm release:codex-claw</code> |
| <code>Port 3000 is already in use</code> | Stop the process using the port or run <code>codex-claw doctor --port 3001</code> |
| <code>Codex CLI was not found</code> | Install Codex CLI, run <code>codex login</code>, or pass <code>--codex-command &lt;cmd&gt;</code> |

Package readiness checks:

~~~bash
pnpm smoke:codex-claw:pack
pnpm smoke:codex-claw:npm
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

- completed beta backlog features are merged and mapped in [docs/BETA_WORKFLOW.md](docs/BETA_WORKFLOW.md)
- npm alpha publish works through <code>npx codex-claw@alpha</code>
- package dry run, packed smoke test, npm smoke test, app lint, app tests, and app build all pass
- release package tarball and SHA256 checksums are attached to a GitHub release
- redacted session bundle evidence is captured before public release notes are posted

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
