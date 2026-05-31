# codex-claw

Alpha CLI for CodexClaw, a local web client for Codex CLI.

The CLI bootstraps a CodexClaw project, writes local Codex CLI defaults when requested, and checks that the machine has the runtime tools needed to start the app.

## Requirements

- Node.js 20 or newer
- pnpm
- Git
- Codex CLI installed and logged in

## Local Development Usage

From this repository:

```bash
pnpm -C packages/codex-claw exec codex-claw --help
pnpm -C packages/codex-claw exec codex-claw doctor
```

## Intended Alpha Install

After the first npm alpha publish:

```bash
npx codex-claw@alpha
```

## Prompts

The bootstrap flow asks for:

- project name
- Codex CLI command
- Codex CLI sandbox mode
- optional Codex CLI working directory
- local dev port

Then it creates the project folder, installs dependencies, and starts CodexClaw unless `--no-start` is provided.

## Commands

```bash
codex-claw                 create and start a project
codex-claw init [dir]      initialize a project in a directory
codex-claw dev             start the app dev server
codex-claw build           build the app
codex-claw preview         preview the production build
codex-claw test            run tests
codex-claw lint            run lint
codex-claw doctor          validate Node.js, pnpm, and Codex CLI
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `CODEX_CLI_COMMAND` | `codex` | Command used by the app server to launch Codex CLI |
| `CODEX_CLI_SANDBOX` | `read-only` | Sandbox mode passed to Codex CLI |
| `CODEX_CLI_WORKDIR` | app process cwd | Workspace directory for Codex CLI runs |
| `CODEX_CLAW_STATE_DIR` | `.codex-claw` | Local session-history directory |

