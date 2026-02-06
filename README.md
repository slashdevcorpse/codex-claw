# WebClaw Monorepo

Fast web client for OpenClaw.

## Apps

- `apps/webclaw`: React + TanStack Router app
- `apps/landing`: Minimal landing page

## Setup

Create `apps/webclaw/.env.local` with `CLAWDBOT_GATEWAY_URL` and either
`CLAWDBOT_GATEWAY_TOKEN` (recommended) or `CLAWDBOT_GATEWAY_PASSWORD`. These map
to your OpenClaw Gateway auth (`gateway.auth.token` or `gateway.auth.password`).
Default URL is `ws://127.0.0.1:18789`. Docs: https://docs.openclaw.ai/gateway

```bash
pnpm install
pnpm dev
```

## Landing

```bash
pnpm landing:dev
```

```bash
pnpm landing:build
```

The landing deploy bundle is in `apps/landing/dist`.
