# CodexClaw Alpha Roadmap

CodexClaw is a public alpha. This roadmap tracks the work needed to move from a local proof of concept to a dependable Codex CLI web surface.

## Current Alpha

- Local React chat UI runs from `apps/codex-claw`.
- Server routes call `codex exec --json` through the local adapter.
- Sessions and history persist in `.codex-claw/sessions.json` by default.
- CLI bootstrap can clone the template, write Codex CLI defaults, and run doctor checks.

## Next Milestones

1. Streaming parity
   - Parse more Codex JSONL event types.
   - Show assistant progress before the final completed message.
   - Add regression coverage for event ordering and duplicate events.

2. Attachment support
   - Pass image attachments through Codex CLI `--image`.
   - Reject unsupported attachment types with clear UI feedback.
   - Document attachment limits.

3. npm alpha publish
   - Reserve the `codex-claw` package name.
   - Publish `0.1.0-alpha.0` after a clean install smoke test.
   - Update install docs from local package execution to `npx codex-claw@alpha`.

4. CI and release hygiene
   - Add build, test, and lint checks on pull requests.
   - Track dependency update PRs separately from feature work.
   - Add a release checklist before beta.

## Not In Scope Yet

- Multi-user hosted sessions
- Remote Codex execution
- Production auth and billing
- Browser-based secret entry
