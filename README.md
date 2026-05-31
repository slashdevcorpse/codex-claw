# CodexClaw

![CodexClaw app preview](apps/codex-claw/public/cover.jpg)

CodexClaw is a local web client for Codex CLI. It gives you a browser-based chat surface, local session history, and a small project bootstrapper while still running prompts through your own installed `codex` command.

[![Status](https://img.shields.io/badge/status-alpha-7057ff)](#alpha-status)
[![Runtime](https://img.shields.io/badge/runtime-Codex%20CLI-111827)](#how-it-works)
[![License](https://img.shields.io/badge/license-MIT-0f766e)](LICENSE)

## Alpha Status

CodexClaw is public alpha software. The core local loop works today, but the project is intentionally marked in progress while streaming, attachments, packaging, and release checks are hardened.

Use it if you want to try a local Codex CLI web surface and do not mind rough edges. Avoid relying on it as a production interface yet.

## What It Does

- Runs prompts through local `codex exec --json`
- Stores local chat sessions in `.codex-claw/sessions.json`
- Provides a React chat UI with sessions, history, rename, delete, and export controls
- Includes a `codex-claw` CLI for project bootstrap and local environment checks
- Keeps configuration server-side through `.env.local`

## Requirements

- Node.js 20 or newer
- pnpm
- Git
- Codex CLI installed and logged in

Check Codex CLI first:

```bash
codex --version
codex exec "Reply with: ready"
```

## Quick Start

```bash
git clone https://github.com/slashdevcorpse/codex-claw.git
cd codex-claw
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

By default, CodexClaw runs the app at `apps/codex-claw` and starts Vite on port 3000.

## Configuration

CodexClaw works with no extra configuration when `codex` is available on `PATH`. Add `apps/codex-claw/.env.local` only when you need to override defaults.

```bash
CODEX_CLI_COMMAND=codex
CODEX_CLI_SANDBOX=read-only
CODEX_CLI_WORKDIR=C:/path/to/project
CODEX_CLAW_STATE_DIR=C:/path/to/codex-claw-state
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `CODEX_CLI_COMMAND` | `codex` | Command used by the server to launch Codex CLI |
| `CODEX_CLI_SANDBOX` | `read-only` | Sandbox mode passed to Codex CLI |
| `CODEX_CLI_WORKDIR` | app process cwd | Workspace directory for Codex CLI runs |
| `CODEX_CLAW_STATE_DIR` | `.codex-claw` | Local session-history directory |

## CLI Usage

The local CLI package is in `packages/codex-claw`.

```bash
pnpm -C packages/codex-claw exec codex-claw --help
pnpm -C packages/codex-claw exec codex-claw doctor
```

After the first npm alpha publish, the intended install command is:

```bash
npx codex-claw@alpha
```

## Common Commands

```bash
pnpm dev                 # start the app
pnpm build               # build the app
pnpm test                # run app tests
pnpm lint                # run ESLint
pnpm landing:dev         # start the landing page
pnpm landing:build       # build the landing page
```

## How It Works

The browser talks to local server routes in the app. Those routes call a local adapter in `apps/codex-claw/src/server/codex-cli.ts`, which launches Codex CLI with `codex exec --json` and writes session data to disk.

```text
Browser UI
  -> app API routes
  -> local Codex CLI adapter
  -> codex exec --json
  -> .codex-claw/sessions.json
```

This means prompts run on your machine, with your Codex CLI auth and your configured working directory.

## Current Limitations

- Responses appear after Codex CLI returns a completed assistant message; progressive streaming is not complete yet.
- Image attachments are visible in the UI but are not passed through to Codex CLI yet.
- The npm package is prepared as `0.1.0-alpha.0` but has not been published yet.
- Session storage is local JSON, not a multi-user database.
- CI and release automation are still being added.

## Project Layout

```text
apps/codex-claw/       React app and local server routes
apps/landing/          Public landing page
packages/codex-claw/   CLI package
pnpm-workspace.yaml    Workspace definition
```

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

