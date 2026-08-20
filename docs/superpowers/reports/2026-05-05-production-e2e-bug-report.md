# Production E2E Bug Report - Playwright CLI

Date: 2026-05-05
Target: `https://app.grantpipe.com` with cross-link checks against
`https://grantpipe.com` context from prior same-day audit
Tooling: `playwright-cli` 0.1.8, Chromium
Branch/worktree: `production-e2e-bug-report` in
`.worktrees/production-e2e-bug-report`

## Test Account And Data

- Disposable user: `angel+e2e-20260505-160129@grantpipe.com`
- Disposable org: `GrantPipe Production E2E 2026-05-05 160129`
- Trial plan selected: Growth, annual cadence
- Created data:
  - Contact: `Prod Donor 160129`
  - Funder: `Prod E2E Funder 160129`
  - Funder contact: `Minimal Officer 160129`
  - Grant: `Prod E2E Grant 160129`
  - Grant expense: `Production E2E supplies`, `$50.00`, `2026-05-05`

No real payment, real donor/grantee data, real external invite, or production
cleanup outside normal tested UI paths was performed.

## Summary

Fresh production signup is no longer blocked. A disposable production account
was created, onboarding completed, and broad authenticated route coverage was
possible. The main functional issues found are plan-selection navigation
getting stuck after a successful API write, Audit-Ready reviewer pages exposing
raw 402 failures on a Growth trial, and expected gated/invalid states producing
console errors plus Sentry traffic.

## Coverage Completed

| Area                                                  | Result                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| Existing session check                                | No prior valid session; `/app/dashboard` redirected to login    |
| Signup                                                | Passed; `POST /api/auth/better/sign-up/email` returned 200      |
| Plan selection                                        | Selection saved, but Continue stayed on `/app/select-plan`      |
| Onboarding                                            | Passed when `/app/onboarding` was opened directly               |
| Dashboard shell                                       | Passed on desktop and mobile                                    |
| Donors                                                | Empty state, create contact, stats refresh passed               |
| Funders                                               | Create funder and minimal funder contact passed                 |
| Grants                                                | Create grant, pipeline, detail, expense creation passed         |
| Reports                                               | Default compliance report placeholder issue fixed               |
| Accounting                                            | Disabled/enable states loaded without API failures              |
| Import, notifications, settings, team, help, calendar | Route smoke passed                                              |
| Portal access and evidence bundles                    | Growth trial showed raw 402 handling bugs                       |
| Invalid invite token                                  | User-facing invalid invite state rendered                       |
| Invalid portal token                                  | User-facing invalid link state rendered; console noise noted    |
| Responsive                                            | Desktop `1440x900`, mobile `390x844`, tablet `768x1024` checked |

## Findings

### GP-E2E-001 - Medium - Plan selection saves but does not advance to setup

Area: `/app/select-plan`

Repro steps:

1. Sign up as a new production user.
2. On `/app/select-plan`, select Growth.
3. Click `Continue to setup`.
4. Wait several seconds.

Expected:

- After `PATCH /api/org/billing/selection` succeeds, the user should advance to
  onboarding or see a clear blocking error.

Actual:

- `PATCH /api/org/billing/selection` returned 200.
- The route remained `/app/select-plan` after waiting.
- No visible error, toast, or validation appeared.
- Directly opening `/app/onboarding` allowed setup to continue.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/04-select-plan-growth-selected.yml`
- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/05-select-plan-continue-stuck.yml`
- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/06-select-plan-after-wait.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/select-plan-radio-click-intercept.png`
- Network: `PATCH /api/org/billing/selection => 200`

### GP-E2E-002 - Low - Plan radio inputs are difficult for automation to click

Area: `/app/select-plan`

Repro steps:

1. Open `/app/select-plan`.
2. Attempt to click the `Growth` radio input itself.

Expected:

- The radio target should be directly clickable, or the entire card should
  behave as one accessible label with no pointer interception.

Actual:

- Playwright timed out clicking the radio because the adjacent `Growth` heading
  intercepted pointer events.
- Clicking the visible heading selected the plan.

Evidence:

- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/select-plan-radio-click-intercept.png`
- Tool error: `locator.click: Timeout 5000ms exceeded`; `h2 Growth`
  intercepted pointer events.

### GP-E2E-003 - Medium - Portal access page exposes raw plan-gated 402 failures

Area: `/app/settings/portal-access`

Repro steps:

1. Use a Growth trial org.
2. Open `/app/settings/portal-access`.
3. Observe reviewer sessions, reviewers, and reviewer activity sections.

Expected:

- Growth users should see an upgrade prompt or plan-gated empty state that
  explains Audit-Ready access.
- Expected 402 responses should be handled without raw status-code copy,
  duplicate fetches, console errors, or Sentry error capture.

Actual:

- The page shows raw failure alerts: `Failed to load sessions: 402`,
  `Failed to load reviewers: 402`, and `Failed to load audit events: 402`.
- Six plan-gated API calls returned 402 across duplicate fetches.
- The browser console logged six errors.
- Three Sentry envelopes were sent.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/31-portal-access-402-errors.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/portal-access-402-errors.png`
- Network:
  - `GET /api/external-reviewers/sessions?includeExpired=true => 402`
  - `GET /api/external-reviewers/reviewers? => 402`
  - `GET /api/external-reviewers/audit-events? => 402`
  - duplicate 402s for the same three endpoints
  - three Sentry envelope POSTs returned 200

### GP-E2E-004 - Medium - Evidence bundles page exposes raw plan-gated 402 failure

Area: `/app/evidence-bundles`

Repro steps:

1. Use a Growth trial org.
2. Open `/app/evidence-bundles`.

Expected:

- Growth users should see a clear Audit-Ready plan-gated state or upgrade
  prompt.
- Expected 402 responses should not surface raw status-code copy, console
  errors, or Sentry capture.

Actual:

- The page shows `Failed to load bundles: 402`.
- `GET /api/external-reviewers/bundles?` returned 402 twice.
- Console logged two resource errors.
- A Sentry envelope was sent.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/32-evidence-bundles-402-errors.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/evidence-bundles-402-errors.png`
- Network: `GET /api/external-reviewers/bundles? => 402` twice; Sentry
  envelope POST returned 200.

### GP-E2E-005 - Low - Grant detail triggers reviewer API 402s before the user uses Share

Area: `/app/grants/:grantId`

Repro steps:

1. Use a Growth trial org.
2. Create a grant.
3. Open the grant detail page.

Expected:

- Reviewer/portal data should be lazy-loaded only when the Share workflow is
  opened, or the plan gate should be handled without console/Sentry noise.

Actual:

- Opening grant detail triggered duplicate
  `GET /api/external-reviewers/reviewers?` requests.
- Both returned 402.
- The console logged two errors.
- A Sentry envelope was sent even though the page itself remained usable.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/26-grant-detail-error.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/grant-detail-error.png`
- Network: `GET /api/external-reviewers/reviewers? => 402` twice; Sentry
  envelope POST returned 200.

### GP-E2E-006 - Low - Mobile navigation dialog is missing an accessible description

Area: mobile shell, `/app/dashboard` at `390x844`

Repro steps:

1. Resize to `390x844`.
2. Open `/app/dashboard`.
3. Click `Open navigation`.

Expected:

- The mobile navigation dialog should include a `DialogDescription` or
  intentional `aria-describedby={undefined}` configuration that avoids runtime
  accessibility warnings.

Actual:

- Browser console logged:
  `Warning: Missing Description or aria-describedby={undefined} for {DialogContent}.`

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/34-mobile-nav-open.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/mobile-nav-open.png`
- Console: one DialogContent description warning.

### GP-E2E-007 - Low - Invalid portal token renders correctly but logs expected 401s as errors

Area: `/app/portal/:token`

Repro steps:

1. Open `/app/portal/not-a-real-token-20260505` in a clean unauthenticated
   browser context.

Expected:

- The invalid/expired portal link state should render without console error
  noise or Sentry capture for expected 401s.

Actual:

- The user-facing page correctly showed `Access link invalid`.
- `GET /api/public/portal/me` and `POST /api/public/portal/auth` returned 401.
- Both 401s logged console errors.
- Two Sentry envelopes were sent.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/37-invalid-portal-token.yml`
- Network: `GET /api/public/portal/me => 401`,
  `POST /api/public/portal/auth => 401`, two Sentry envelope POSTs returned 200.

## Retest Status

This table includes the April 9 exploratory findings plus the prior same-day
May 5 production signup blocker.

| Prior issue                                                | Status on 2026-05-05 production                               |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| Signup blocked by production 500 from prior same-day audit | Fixed; signup returned 200                                    |
| `/donors` empty pagination `Page 1 of 0`                   | Fixed; empty page showed `Page 1 of 1`                        |
| Donor stats stayed zero after visible contact creation     | Fixed; `Total Donors` and `New This FY` updated to 1          |
| Funder contact minimal submission failed with 400          | Fixed; minimal contact returned 201                           |
| Grant expense submission failed with 400                   | Fixed; expense returned 201                                   |
| Reports default `grant-1` generated a 500                  | Fixed; report button disabled until a grant is selected       |
| Event attendee donation creation failed with 400           | Blocked/unverified; event detail workflows were not completed |
| Event volunteer-hour logging failed with 400               | Blocked/unverified; event detail workflows were not completed |

## Passing Notes

- Fresh signup and onboarding completed with a disposable production org.
- Donor create and stats refresh worked with no console errors.
- Funder create and minimal funder contact create worked with no console errors.
- Grant create, pipeline display, grant detail load, and expense create worked.
- Reports index loaded without default placeholder IDs or immediate 500s.
- Accounting subroutes rendered plan/setup gates without API failures.
- Import, notifications, settings, team, help, and calendar route smoke passed.
- Mobile dashboard and navigation were usable; tablet grant pipeline rendered
  without obvious clipping in the captured viewport.
- Invalid invite token rendered `Invalid invite` and a `Back to sign in` link.

## Evidence Directory

`docs/superpowers/reports/evidence/2026-05-05-production-e2e/`

Key files:

- `03-signup-after-submit.yml`
- `05-select-plan-continue-stuck.yml`
- `06-select-plan-after-wait.yml`
- `11-dashboard-fresh-org.yml`
- `14-donors-after-create.yml`
- `21-funder-contact-minimal-submit.yml`
- `26-grant-detail-error.yml`
- `29-grant-expense-submit.yml`
- `30-reports-index.yml`
- `31-portal-access-402-errors.yml`
- `32-evidence-bundles-402-errors.yml`
- `34-mobile-nav-open.yml`
- `35-grants-pipeline-tablet.yml`
- `36-invalid-invite-token.yml`
- `37-invalid-portal-token.yml`

## Untested Or Partially Tested Areas

- No real Stripe payment was attempted; billing was checked only through trial
  banners, plan selection, and settings links.
- Event attendee donation and volunteer-hour workflows were not completed.
- Import preview/commit with an actual CSV was not completed.
- Accounting enablement was not clicked because it is described as irreversible
  in the UI.
- Reviewer share-link creation was not attempted because the Growth trial showed
  plan-gated 402 behavior for reviewer APIs.
