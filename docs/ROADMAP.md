# CodexClaw Alpha To Beta Roadmap

CodexClaw is a public alpha. This roadmap tracks the work needed to move from a local proof of concept to a dependable Codex CLI web surface.

## Current Alpha

- Local React chat UI runs from `apps/codex-claw`.
- Server routes call `codex exec --json` through the local adapter.
- Sessions and history persist in `.codex-claw/sessions.json` by default.
- CLI bootstrap can clone the template, write Codex CLI defaults, and run doctor checks.
- Workspace switching, Codex CLI health checks, repository context, AGENTS.md visibility, git review, approval profiles, MCP health, task queue, artifacts, attachments, timeline exports, package doctor checks, and redacted handoff exports have all landed from the beta backlog.

## Beta Workflow

See [BETA_WORKFLOW.md](BETA_WORKFLOW.md) for the public beta entry gates, validation commands, release flow, and completed issue/PR map.

## Next Milestones

1. npm alpha publish
   - Confirm npm auth with <code>npm whoami</code>.
   - Publish <code>0.1.0-alpha.1</code> with the alpha dist-tag.
   - Run <code>pnpm smoke:codex-claw:npm</code> after publish.

2. Beta release evidence
   - Attach release package tarball and SHA256 checksums.
   - Capture a redacted session bundle from the release validation run.
   - Dogfood <code>npx codex-claw@alpha</code> on Windows and one Unix-like environment.

3. Beta tag decision
   - Confirm all beta gates in <code>docs/BETA_WORKFLOW.md</code>.
   - Keep <code>latest</code> unpublished until the alpha package is repeatably installable.
   - Open follow-up issues for post-beta hosted, auth, and remote-execution work.

## Not In Scope Yet

- Multi-user hosted sessions
- Remote Codex execution
- Production auth and billing
- Browser-based secret entry
