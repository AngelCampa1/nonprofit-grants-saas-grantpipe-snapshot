# 2026-05-07 Production E2E Visual Sweep

## Scope

- Environment: `GRANTPIPE_E2E_APP_URL` from ignored local `.env`
- Account: reused `GRANTPIPE_E2E_*` credentials from ignored local `.env`
- Tooling: `playwright-cli` manual production session
- Screenshot evidence: `tmp/prod-sweep-2026-05-07/` in the worktree
- Viewports: desktop `1440x1000`, tablet `834x1112`, mobile `390x844`

## Screenshot Inventory

- Captured 96 route screenshots across authenticated production routes.
- Captured additional modal/state screenshots for donors, funders, funds, grants,
  settings custom fields, and portal reviewer management.
- Key evidence files:
  - `tmp/prod-sweep-2026-05-07/desktop-import.png`
  - `tmp/prod-sweep-2026-05-07/mobile-import.png`
  - `tmp/prod-sweep-2026-05-07/tablet-subrecipients.png`
  - `tmp/prod-sweep-2026-05-07/desktop-settings-portal-access.png`
  - `tmp/prod-sweep-2026-05-07/desktop-state-portal-add-reviewer.png`

## Findings

### P1: Portal access page returns production API failures

- Route: `/app/settings/portal-access`
- Evidence:
  - `desktop-settings-portal-access.png`
  - `desktop-state-portal-add-reviewer.png`
- Actual:
  - `GET /api/external-reviewers/sessions?includeExpired=true` returns `400`.
  - `GET /api/external-reviewers/reviewers?` returns `500`.
  - `GET /api/external-reviewers/audit-events?` returns `500`.
  - The page can remain in loading/error states while the add-reviewer sheet is
    available.
- Expected:
  - Query string booleans should be accepted by the API.
  - Empty reviewer and audit-event lists should return JSON-safe totals and
    render empty states.
- Root cause:
  - External reviewer list validators rejected string query booleans.
  - External reviewer count totals could pass through non-JSON-safe count values.
  - Post-deploy Worker tail showed the production database was also missing the
    `external_review_*` and evidence bundle tables even though the old migration
    was recorded as applied.
- Status: fixed with validator, JSON-safe count, and idempotent repair-migration
  regressions. Post-deploy portal access smoke now has no failing API responses.

### P2: Import page has severe horizontal overflow

- Route: `/app/import`
- Evidence:
  - `desktop-import.png`
  - `mobile-import.png`
- Actual:
  - Desktop document width expanded from `1440px` to `2805px`.
  - Mobile document width overflowed by `335px`.
  - The overflow detector identified `#import-filename` as an absolutely
    positioned `sr-only` input with `w-full`.
- Expected:
  - The hidden filename control should remain accessible to the form logic
    without contributing to visual layout or page scroll width.
- Root cause:
  - The hidden filename input used `sr-only`; production CSS left a full-width
    absolute element off the right edge.
- Status: fixed in this branch by using `hidden` for the nonvisual filename
  control and adding a regression test.

### P3: Tablet subrecipient filters are too wide

- Route: `/app/subrecipients`
- Evidence: `tablet-subrecipients.png`
- Actual:
  - Filter actions extend beyond the filter container at tablet width.
- Expected:
  - Filter controls should wrap or compress inside the content column.
- Status: fixed in this branch by switching the filter grid to a two-column
  tablet layout before the wider desktop grid and by allowing the table to
  scroll horizontally when columns cannot fit.

### P3: Expected plan-gated endpoints log 402s

- Routes:
  - `/app/subrecipients`
  - `/app/accounting/integrations`
- Actual:
  - Plan-gated API calls return `402`, which appears in browser console/network
    logs during the sweep.
- Expected:
  - If these calls are expected for the current E2E account plan, the UI should
    present plan-gated states without noisy user-facing failures.
- Status: documented for follow-up. No route crash observed.

## Verification Evidence

- Red tests confirmed the three fixed regressions before implementation.
- Green targeted tests after implementation:
  - `pnpm --filter @grantpipe/shared test -- src/validators/external-reviewers.test.ts`
  - `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/import.test.tsx`
  - `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/subrecipients/index.test.tsx`
  - `pnpm --filter @grantpipe/api test -- src/domains/external-reviewers/reviewer.service.test.ts src/domains/external-reviewers/audit-event.service.test.ts src/domains/external-reviewers/bundle.service.test.ts src/domains/external-reviewers/list-utils.test.ts`
- Typechecks:
  - `pnpm --filter @grantpipe/shared typecheck`
  - `pnpm --filter @grantpipe/api typecheck`
  - `pnpm --filter @grantpipe/web typecheck`
- Full package tests:
  - `pnpm --filter @grantpipe/shared test`
  - `pnpm --filter @grantpipe/api test`
  - `pnpm --filter @grantpipe/web test`
  - `pnpm --filter @grantpipe/db test`
- Lint/build:
  - `pnpm --filter @grantpipe/shared lint`
  - `pnpm --filter @grantpipe/api lint`
  - `pnpm --filter @grantpipe/web lint`
  - `pnpm turbo build --filter=@grantpipe/web --filter=@grantpipe/api --filter=@grantpipe/shared`
- Production deploys:
  - `pnpm run deploy:api`
  - `pnpm run deploy:web`
  - `pnpm run deploy:api` after the database repair migration
- Post-deploy production smoke:
  - `postdeploy-desktop-import.png`: `scrollWidth` equals viewport width and
    overflow count is `0`.
  - `postdeploy-mobile-import.png`: `scrollWidth` equals viewport width and
    overflow count is `0`.
  - `postdeploy-tablet-subrecipients.png`: `scrollWidth` equals viewport width
    and overflow count is `0`.
  - `postdeploy-desktop-portal-access.png`: no failing external reviewer API
    responses.

## Coverage Notes

- Targeted coverage commands executed the touched tests, but the package
  coverage scripts enforce global thresholds even for selected files, so subset
  coverage exits nonzero because unrelated files are unexecuted.
- The coverage table showed 100% for touched shared/API files in the selected
  runs. Full package tests, typechecks, lint, and build passed.
