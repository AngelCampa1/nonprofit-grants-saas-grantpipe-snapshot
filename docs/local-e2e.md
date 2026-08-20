# Local E2E

GrantPipe local E2E uses the real web app and API against a real database, while external integrations stay in mock mode.

## Prerequisites

1. Start the singleton local database with `pnpm db:local:start`.
2. Copy `apps/api/.dev.vars.example` to `apps/api/.dev.vars`.
3. Set `BETTER_AUTH_SECRET` to any long random local secret.
4. Install the browser once with `pnpm e2e:install`.
5. Apply database migrations before the first run with `pnpm --filter @grantpipe/db migrate`.

The default local database URL is:

- `postgres://postgres:postgres@localhost:55439/grantpipe`

The Docker workflow is intentionally singleton-based:

- one container: `grantpipe-local-postgres`
- one named volume: `grantpipe-local-postgres-data`
- one exposed port: `55439`

Running `pnpm db:local:start` reuses that same local database instead of creating a new one.

## Run

- `pnpm e2e` runs the smoke suite headlessly.
- `pnpm e2e:headed` runs the same suite with a visible browser.

Both commands boot the API and web app automatically, wait for readiness, then execute Playwright.

For manual runs without Playwright-managed servers:

- `pnpm dev:server start api`
- `pnpm dev:server start web`
- `pnpm dev:server status all`

These commands are guardrailed to stop repo-owned duplicates first, so you only keep one local API process and one local web process alive for this checkout.

## Local process hygiene

- Only stop processes that were started for this GrantPipe checkout or worktree.
- If a local run was interrupted, close the `wrangler dev` and `vite` terminals you started for this repo before rerunning `pnpm e2e`.
- Do not blanket-kill listeners on `5173` or `8787`; other projects may be using the same ports.
- On Windows, confirm ownership first with:
  - `Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5173,8787 } | Select-Object LocalAddress,LocalPort,OwningProcess`
  - `Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -in <PID_LIST> } | Select-Object ProcessId,Name,CommandLine`
- Only terminate the matching GrantPipe-owned parent shells or dev servers after verifying the command line points at the current repo path.
- Before a fresh run, confirm the intended stack is serving this repo on `http://localhost:5173` and `http://localhost:8787/api/health`.

## Current smoke flow

- Sign up with a unique email/password account
- Complete onboarding
- Verify the authenticated shell and dashboard load

Each run creates a fresh user, so the suite does not require a seeded account or a DB reset step.
