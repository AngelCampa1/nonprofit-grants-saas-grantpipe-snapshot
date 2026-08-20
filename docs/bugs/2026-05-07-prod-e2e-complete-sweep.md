# 2026-05-07 Production E2E Complete Sweep

## Scope

- Environment: `GRANTPIPE_E2E_APP_URL` from ignored local `.env`
- Account: reusable disposable production E2E org
- Tooling: `playwright-cli` manual production session plus authenticated browser API probes
- Evidence: `tmp/prod-e2e-complete-sweep-2026-05-07/`
- Safety: no real customer data, no live Stripe/QBO/bank/email-provider connection

## Coverage

- Admin CRUD/API: contacts, donations, tags, segments, funders, funder contacts, funds, grants,
  grant allocations, grant expenses, reporting requirements, closeout items, impact metrics,
  events, attendees, programs, program budgets, program allocations, document upload/download,
  invalid document type handling, donor CSV export, program budget CSV export, import preview,
  import commit, import history, activity log, award-intake gated state.
- Route/UI sweep: 34 authenticated routes across desktop, tablet, and mobile viewports.
- Roles: admin invite creation and public invite verification for editor, viewer, auditor.
  Attempted real invited-user signup/acceptance found an invite-acceptance 500.
- Accounting/integrations: disabled accounting states and gated integration/subrecipient states.
- Cleanup: deleted E2E-created sweep contacts, CSV-import contacts, and main CRUD records.

## Findings

### P1: Import preview accepts malformed CSV with an unterminated quoted field

- Route: `POST /api/import/preview`
- Account/role: E2E admin
- Evidence: `admin-crud-sweep.out.txt`
- Repro:
  1. Submit import preview for contacts.
  2. Use CSV text: `type,firstName\nindividual,"unterminated`.
- Expected: `400` with a clear CSV parse error.
- Actual: `200`; preview treats the malformed field as `unterminated`.
- Fix:
  - `apps/api/src/domains/import/csv.ts` now rejects EOF while still inside a quoted field with
    `CSV contains an unterminated quoted field.`
  - Regression added in `apps/api/src/domains/import/service.test.ts`.

### P2: Settings Team panel overflows horizontally on mobile

- Route: `/app/settings#team`
- Account/role: E2E admin
- Evidence: `ui-route-sweep.out.txt`
- Repro:
  1. Set viewport to 390x844.
  2. Navigate to `/app/settings#team`.
- Expected: no horizontal page overflow.
- Actual: `documentElement.scrollWidth` was `475` while viewport width was `390`.
- Fix:
  - Settings content and team rows now use `min-w-0`.
  - Team member identities use `break-words`.
  - Team action groups can wrap on narrow viewports.
  - Regression added in `apps/web/src/routes/_authenticated/settings.test.tsx`.

### P1: Invited role user acceptance returned 500 in production

- Route: `POST /api/auth/invites/:token/accept`
- Account/role: newly signed-up disposable editor invitee
- Evidence: `role-login-sweep.out.txt`
- Repro:
  1. As admin, create an editor invite link.
  2. Sign up as a new disposable user.
  3. Accept the invite link.
- Expected: invite acceptance creates the org membership and redirects into the invited org.
- Actual: invite acceptance returned `500`; the browser session had a valid Better Auth user
  session but no org membership.
- Root cause confirmed by post-deploy diagnostics: production's database adapter does not support
  the app's previous `db.transaction(callback)` calling convention for this path. The transaction
  helper attempted to read an internal `session` value and threw before the invite claim could run.
- Fix:
  - `apps/api/src/domains/auth/service.ts` now uses one atomic SQL statement for production invite
    acceptance. The statement claims the invite and inserts/reactivates/preserves membership in the
    same database operation, so a partial invite consumption cannot strand a user without access.
  - The production SQL path explicitly casts the nullable invitee email bind to `text` and supplies
    an explicit `org_members.id`, because raw SQL does not apply Drizzle `$defaultFn` values.
  - Failed atomic claims still classify not-found, expired, used, and email-mismatch outcomes.
  - Transaction `execute` results now accept both `{ rows }` and raw array result shapes, matching
    the production database adapter behavior seen in post-deploy verification.
  - Regression added in `apps/api/src/domains/auth/service.test.ts`.

## Verification

- Red tests:
  - `pnpm --filter @grantpipe/api test -- src/domains/import/service.test.ts -t "rejects CSV text with an unterminated quoted field"` failed before the parser fix.
  - `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.test.tsx -t "allows long team member identities"` failed before the layout fix.
  - `pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts -t "inserts a new membership when the transaction lacks relational query helpers"` failed before the invite fix.
- Green tests:
  - `pnpm --filter @grantpipe/api test -- src/domains/import/service.test.ts`
  - `pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts`
  - `pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts -t "classifies a failed claim when the transaction lacks relational query helpers"`
  - `pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts -t "reactivates a soft-deleted membership when relational query helpers are unavailable"`
  - `pnpm --filter @grantpipe/api test -- src/domains/auth/service.test.ts -t "accepts raw array results from transaction execute"`
  - `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.test.tsx`
- Coverage:
  - API targeted coverage command passed the import tests and showed `csv.ts` at 100% and
    import `service.ts` at 97.04%; it also showed auth `service.ts` at 100%. The command exited
    nonzero because package-wide global thresholds were applied to unrelated unexecuted files.
  - Web targeted coverage passed and showed `settings.tsx` at 99.64% statements,
    96.27% branches, and 100% functions.
- Typecheck:
  - `pnpm --filter @grantpipe/api typecheck`
  - `pnpm --filter @grantpipe/web typecheck`
- Lint:
  - `pnpm --filter @grantpipe/api lint`
  - `pnpm --filter @grantpipe/web lint` passed with the pre-existing React Compiler warning in
    `components/donors/contact-form.tsx`.
- Build:
  - `pnpm exec turbo build --filter=@grantpipe/api --filter=@grantpipe/web` completed the web
    production build; `@grantpipe/api` has no build script in `package.json`.
- Post-deploy verification:
  - `tmp/post-deploy-repros-2026-05-07.mjs` confirmed malformed CSV returns `400`.
  - `tmp/post-deploy-repros-2026-05-07.mjs` confirmed `/app/settings#team` has no mobile
    horizontal overflow at 390px.
  - The same repro returned `200` for invited-user acceptance after the final API deploy.
  - Earlier invite-acceptance deploys still returned `500`. Temporary sanitized Worker diagnostics
    captured the production transaction helper exception, and rollback-only SQL probes exposed the
    nullable email bind type and missing raw-SQL membership id issues. Diagnostics were removed
    before the final deploy.
