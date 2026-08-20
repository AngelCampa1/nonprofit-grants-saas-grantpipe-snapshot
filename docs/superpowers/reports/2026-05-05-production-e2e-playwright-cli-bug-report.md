# Production E2E Bug Report - Playwright CLI

Date: 2026-05-05
Target: `https://app.grantpipe.com` and `https://grantpipe.com`
Tooling: `playwright-cli` 0.1.8, Chromium default session
Branch/worktree: `audit/production-e2e-2026-05-05` in `.worktrees/production-e2e-audit`

## Tested Account

Fresh production org creation was attempted but did not complete.

- Attempt 1: `e2e-prod-20260505-151332@grantpipe.test`
- Attempt 2: `angel+e2e-prod-20260505-151406@grantpipe.com`
- Intended org name: `GrantPipe Production E2E Audit 2026-05-05`
- Result: no authenticated production test org was created because signup returned HTTP 500.

## Coverage Completed

| Area                        | Result                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| Signup                      | Blocked by production 500                                          |
| Login invalid credentials   | Passed; generic invalid credential error shown                     |
| Forgot password entry point | Passed; request returns 200 and shows non-enumerating success text |
| Protected route redirect    | Passed; unauthenticated `/app/dashboard` redirects to `/app/login` |
| App 404 route               | Rendered a 404 page; recovery UX issue noted                       |
| Marketing to app flow       | Passed; CTAs route to app signup and normalize to `/app/signup`    |
| Responsive smoke            | Desktop, tablet, and mobile auth/marketing surfaces checked        |

## Summary By Severity

| ID         | Severity | Area          | Title                                                              |
| ---------- | -------- | ------------- | ------------------------------------------------------------------ |
| GP-E2E-001 | P1       | Auth / Signup | Email signup returns HTTP 500 and blocks fresh org creation        |
| GP-E2E-002 | P3       | App routing   | 404 recovery CTA points unauthenticated users to a protected route |

## Findings

### GP-E2E-001 - P1 - Email signup returns HTTP 500 and blocks fresh org creation

Environment: production, desktop viewport `1280x720`, unauthenticated clean browser session.

Repro steps:

1. Run `playwright-cli close-all` and `playwright-cli delete-data`.
2. Open `https://app.grantpipe.com/signup`.
3. Fill:
   - Name: `Production E2E Audit`
   - Email: `e2e-prod-20260505-151332@grantpipe.test`
   - Password: `AuditPass-2026-05-05!`
4. Click `Create account`.
5. Repeat with `angel+e2e-prod-20260505-151406@grantpipe.com`.

Expected:

- A valid new user should be created, or invalid input should return a specific 4xx validation error.
- The user should continue into onboarding / org creation without a credit card.

Actual:

- Both submissions stayed on `/app/signup`.
- The UI showed the generic alert `Sign up failed. Please try again.`
- The browser console recorded failed resource loads for the signup API.
- Network showed `POST https://app.grantpipe.com/api/auth/better/sign-up/email => [500]`.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/02-signup-after-submit.yml`
- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/03-signup-grantpipe-alias-failure.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/signup-500-generic-error.png`
- Console: two signup API 500 resource errors.
- Network: two `POST /api/auth/better/sign-up/email` calls returned 500.

Impact:

- Fresh production trial signup is blocked.
- This also prevented testing onboarding, org setup, donor/grant/fund CRUD, compliance, accounting, billing, settings, team invites, and authenticated navigation with a fresh isolated org.

Suggested fix direction:

- Inspect production Worker logs for `POST /api/auth/better/sign-up/email` around 2026-05-05 15:13-15:14 America/Mexico_City.
- Confirm Better Auth production secrets, database connectivity, email lifecycle hooks, trial creation, and any post-signup org/bootstrap side effects.
- Convert expected validation failures into 4xx responses with actionable client copy; reserve 500 for true server errors.

### GP-E2E-002 - P3 - 404 recovery CTA points unauthenticated users to a protected route

Environment: production, unauthenticated clean browser session.

Repro steps:

1. Open `https://app.grantpipe.com/app/definitely-missing-route`.
2. Observe the 404 page.
3. Click `Back to dashboard`.

Expected:

- For unauthenticated users, the recovery CTA should point directly to a usable public/auth route, such as sign in, or preserve intended redirect context clearly.

Actual:

- The 404 page shows `Back to dashboard`.
- Clicking it sends the unauthenticated user to `/app/dashboard`, then redirects to `/app/login`.

Evidence:

- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/09-unknown-app-route.yml`
- Snapshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/10-404-back-to-dashboard-redirects-login.yml`
- Screenshot: `docs/superpowers/reports/evidence/2026-05-05-production-e2e/unknown-route-back-to-dashboard.png`

Suggested fix direction:

- Render auth-aware 404 recovery: authenticated users get `Back to dashboard`; unauthenticated users get `Back to sign in` or `Go to sign in`.

## Passing Checks And UX Notes

- Invalid login with `not-a-user@example.com` returned `POST /api/auth/better/sign-in/email => [401]` and displayed `Invalid email or password`.
- Forgot password for `not-a-user@example.com` returned `POST /api/auth/better/request-password-reset => [200]` and displayed non-enumerating copy: `If an account exists...`.
- Unauthenticated protected route access to `/app/dashboard` redirected to `/app/login` after `GET /api/auth/better/get-session => [200]`.
- Marketing homepage CTAs to `https://app.grantpipe.com/signup` successfully landed on `/app/signup`.
- Mobile auth pages at `390x844` were usable with no obvious clipping in the first viewport.
- Marketing mobile navigation opened and exposed product/resource/pricing/sign-in/free-trial links.

## Screenshots And Snapshots

Evidence directory:

`docs/superpowers/reports/evidence/2026-05-05-production-e2e/`

Key files:

- `01-signup-initial.yml`
- `02-signup-after-submit.yml`
- `03-signup-grantpipe-alias-failure.yml`
- `04-login-initial.yml`
- `05-login-invalid.yml`
- `06-forgot-password-initial.yml`
- `07-forgot-password-after-submit.yml`
- `08-protected-dashboard-unauth.yml`
- `09-unknown-app-route.yml`
- `10-404-back-to-dashboard-redirects-login.yml`
- `11-marketing-home.yml`
- `12-marketing-cta-to-signup.yml`
- `13-marketing-tablet.yml`
- `14-marketing-mobile.yml`
- `15-marketing-mobile-menu.yml`
- `16-pricing-mobile.yml`
- `17-login-mobile.yml`
- `18-signup-mobile.yml`
- `19-app-root-unauth.yml`
- `signup-500-generic-error.png`
- `unknown-route-back-to-dashboard.png`
- `marketing-home-desktop.png`
- `marketing-tablet.png`
- `marketing-mobile.png`
- `marketing-mobile-menu.png`
- `forgot-password-initial.png`
- `login-mobile.png`
- `signup-mobile.png`

## Untested Areas

The following areas were intentionally left untested because fresh production signup failed and no authenticated isolated org existed:

- Onboarding and org creation.
- Dashboard shell, side nav active states, command/search behavior.
- Donors/contacts, donations, communications, tags, custom fields.
- Funders, funds, grants, grant pipeline, allocations.
- Events and attendees.
- Reports, calendar, notifications, imports.
- Accounting overview, chart of accounts, journal entries, ledger, periods, trial balance, bank/accounting subroutes.
- Settings, team/invites, billing page, portal/access pages.
- Destructive record actions.

No real payment submission, Google OAuth signup, external invite, or production data mutation beyond attempted signup and password-reset request was performed.
