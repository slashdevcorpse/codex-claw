# codex-claw

Alpha CLI for CodexClaw. It initializes a local CodexClaw project from the public repository template and validates the local Codex CLI runtime.

## Usage

```bash
pnpm -C packages/codex-claw exec codex-claw --help
pnpm -C packages/codex-claw exec codex-claw doctor
```

After the first npm alpha publish:

```bash
npx codex-claw@alpha
```

You will be prompted for:

- project name
- Codex CLI command
- Codex CLI sandbox mode
- optional Codex CLI working directory
- local dev port

Then the CLI creates the project folder, installs dependencies, and starts CodexClaw.

Run project commands from a CodexClaw project directory:

```bash
codex-claw dev
codex-claw build
codex-claw preview
codex-claw test
codex-claw lint
```

## Commands

- `codex-claw` - create and start a new project
- `codex-claw init [dir]` - initialize a project in `dir`
- `codex-claw doctor` - validate Node.js, pnpm, and Codex CLI availability

## Environment

- `CODEX_CLI_COMMAND`: defaults to `codex`
- `CODEX_CLI_SANDBOX`: defaults to `read-only`
- `CODEX_CLI_WORKDIR`: optional workspace root for Codex CLI runs
- `CODEX_CLAW_STATE_DIR`: optional local session-history directory
