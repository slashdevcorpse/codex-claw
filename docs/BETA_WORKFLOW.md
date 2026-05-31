# CodexClaw Beta Workflow

CodexClaw is still public alpha software. This workflow defines what has landed from the research-backed beta backlog and what must pass before the project should be called beta.

## Completed Backlog Map

| Issue | PR | Area | Status |
| --- | --- | --- | --- |
| #84 | #97 | Workspace switcher and Codex CLI health dashboard | Merged |
| #85 | #98 | Repository context explorer and AGENTS.md visibility | Merged |
| #86 | #99 | Git diff review and commit preparation panel | Merged |
| #87 | #100 | Sandbox and approval profile controls | Merged |
| #88 | #101 | MCP server and tool health manager | Merged |
| #89 | #102 | Background task queue with cancel, retry, and status history | Merged |
| #90 | #103 | Session search, tags, archive, and saved filters | Merged |
| #91 | #104 | Artifacts panel for files, patches, logs, and exports | Merged |
| #92 | #105 | URL and document context attachments | Merged |
| #93 | #106 | Run timeline, token/context telemetry, and JSON event export | Merged |
| #94 | #107 | npm alpha install, update, and doctor readiness | Merged |
| #95 | #108 | Redacted session bundles and issue/PR handoff drafts | Merged |

## Beta Entry Gates

CodexClaw can move from alpha to beta only when all gates below are true:

| Gate | Required evidence |
| --- | --- |
| Local app health | <code>pnpm -C apps/codex-claw lint</code>, <code>pnpm -C apps/codex-claw test</code>, and <code>pnpm -C apps/codex-claw build</code> pass on the release branch |
| Package readiness | <code>pnpm pack:codex-claw</code> and <code>pnpm smoke:codex-claw:pack</code> pass |
| npm alpha availability | <code>pnpm smoke:codex-claw:npm</code> passes after <code>codex-claw@alpha</code> is published |
| Security posture | GitHub dependency alerts are triaged, CodeQL passes, GitGuardian passes, and no critical open public security issue remains |
| User handoff safety | Redacted session bundle, issue draft, and PR draft exports are available without automatic GitHub posting |
| Documentation | README, package README, roadmap, release notes, install commands, update commands, and troubleshooting are current |
| Release package | GitHub release workflow produces a tarball and SHA256 checksums |

## Beta Release Flow

1. Start from a clean <code>main</code> branch.
2. Confirm dependency alerts and open TODO issues are triaged.
3. Run local validation:

~~~bash
pnpm -C apps/codex-claw lint
pnpm -C apps/codex-claw test
pnpm -C apps/codex-claw build
pnpm pack:codex-claw
pnpm smoke:codex-claw:pack
~~~

4. Publish the alpha package only after npm auth is confirmed:

~~~bash
npm whoami
pnpm release:codex-claw
pnpm smoke:codex-claw:npm
~~~

5. Create a GitHub release package and attach the generated tarball plus checksum.
6. Dogfood a fresh <code>npx codex-claw@alpha</code> install on Windows and one Unix-like environment.
7. Use the redacted session bundle export to capture release evidence before public posting.
8. Move to a beta tag only after the alpha package is installable and the release evidence is attached.

## Public Write Policy

CodexClaw can generate GitHub issue and PR description drafts, but it must not post them automatically. A user must review and approve every public write.

## Deferred Past Beta Entry

- Hosted multi-user sessions
- Remote Codex execution
- Production auth and billing
- Browser-based secret entry
- Stable <code>latest</code> npm tag
