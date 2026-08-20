# 2026-05-07 Production E2E Deep Sweep

## Scope

- Environment: `GRANTPIPE_E2E_APP_URL` from ignored local `.env`
- Account: reused `GRANTPIPE_E2E_*` disposable production org credentials
- Tooling: `playwright-cli` manual production session
- Evidence: `tmp/prod-e2e-deep-sweep-2026-05-07/`
- Safety: no real customer-like data, no secrets printed intentionally, no live
  external Stripe, QuickBooks, or email-provider connection attempted

## Coverage Notes

- Auth: login with reusable E2E credentials succeeded and redirected to
  `/app/dashboard`.
- Route sweep: dashboard, donors, grants, funders, events, calendar, funds,
  programs, subrecipients, reports, cash, activity, accounting gated routes,
  import, settings, team, billing, and portal access were loaded in production.
- Donor CRUD: created, opened, and soft-deleted an E2E donor named
  `Deep Sweep 20260507`; the list returned to the empty state afterward.
- Accounting and subrecipient gated states: expected `402` responses were
  observed for plan-gated calls, with non-crashing user-facing gated states.
- Documents: `/app/documents` returns the app 404; document testing remains
  entity-section based because there is no global Documents nav route.
- External integrations: verified safe/gated accounting integration state only;
  no live account connection was attempted.

## Evidence Inventory

- `initial-snapshot.yml`
- `route-sweep.json`
- `settings-billing-hash-snapshot.yml`
- `settings-billing-legacy-snapshot.yml`
- `donors-before-crud.yml`
- `donor-add-dialog.yml`
- `donor-after-create.yml`
- `donor-detail-created.yml`
- `donor-delete-dialog.yml`
- `donor-after-delete.yml`

## Findings

### P2: Legacy billing route redirects to billing URL but leaves Organization panel active

- Route: `/app/settings/billing`
- Account/role: E2E admin
- Evidence: `settings-billing-legacy-snapshot.yml`
- Reproduction:
  1. Log in as the reusable E2E admin.
  2. Navigate directly to `/app/settings/billing`.
  3. Wait for the redirect to complete.
- Expected:
  - URL resolves to `/app/settings#billing`.
  - Billing settings panel renders and the Billing sidebar item is active.
- Actual:
  - URL resolves to `/app/settings#billing`.
  - Organization profile remains rendered and active.
- Control check:
  - Direct `/app/settings#billing` renders Billing correctly
    (`settings-billing-hash-snapshot.yml`).
- Root cause:
  - Settings panel state only synchronized from initial `window.location.hash`
    and browser `hashchange`.
  - TanStack Router navigation to a new hash via `navigate()` can update route
    location without dispatching a browser `hashchange` event.
- Fix:
  - `SettingsPage` now reads the router location hash and passes it into the
    active section synchronization hook.
  - Browser `hashchange` support remains for direct hash updates.
- Regression test:
  - `apps/web/src/routes/_authenticated/settings.test.tsx` verifies router hash
    navigation switches from Organization to Billing without a `hashchange`
    event.

### Follow-up: Plan-gated API calls still appear as browser console errors

- Routes:
  - `/app/subrecipients`
  - `/app/accounting/integrations`
- Evidence: `route-sweep.json`
- Actual:
  - `GET /api/subrecipients?page=1&pageSize=50` returned `402`.
  - `GET /api/accounting/integrations` returned `402`.
  - Browser console logs the failed resources.
- Expected:
  - The current UI presents gated states and does not crash.
- Status:
  - Documented only. This appears to be expected for the current E2E plan and
    was also noted in the prior production visual sweep.

## Verification Evidence

- Red regression:
  - `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.test.tsx -t "syncs settings panel changes"`
  - Failed because Billing heading was not rendered after router hash navigation.
- Green regression:
  - Same command passed after the fix.
- Targeted test file:
  - `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.test.tsx`
  - 41 tests passed.
- Targeted coverage:
  - `pnpm --filter @grantpipe/web exec vitest run --coverage --maxWorkers=1 --pool=threads src/routes/_authenticated/settings.test.tsx`
  - `settings.tsx`: 99.64% statements, 96.27% branches, 100% functions.
- Typecheck:
  - `pnpm --filter @grantpipe/web typecheck` passed.
- Lint:
  - `pnpm --filter @grantpipe/web lint` passed with one pre-existing React
    Compiler warning in `components/donors/contact-form.tsx`.
- Build:
  - `pnpm exec turbo build --filter=@grantpipe/web` passed with the existing
    large chunk warning.
- Deployment:
  - `pnpm run deploy:web` built successfully, verified headers, and uploaded
    Sentry source maps for release
    `12fbdd6ba11d3c4a5e0461d191fae3659c5bf710`.
  - Wrangler failed at the Cloudflare API step with `Authentication error
[code: 10000]` and `Invalid access token [code: 9109]`.
  - No `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_API_TOKEN`, or
    `WRANGLER_API_TOKEN` value was present in `.env` or the current process.
  - Production post-deploy repro verification is blocked until Wrangler auth is
    refreshed.
- Timeout notes:
  - `pnpm --filter @grantpipe/web test:coverage` exceeded the 10-minute tool
    timeout before returning output.
  - `pnpm --filter @grantpipe/web test` exceeded the 10-minute tool timeout
    before returning output.
