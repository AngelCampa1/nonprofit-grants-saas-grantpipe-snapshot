# Feature 06 Pledge Tracker Wrap-Up

Date: 2026-06-19
Branch: `codex/feature-06-pledge-tracker`
Worktree: `.worktrees/feature-06-pledge-tracker`

## Goal

Wrap up Feature 06, the pledge and multi-year commitment tracker, with safer
pledge behavior, explicit PostHog and Sentry coverage, stronger tests, and a
clear list of remaining product gaps.

## Progress Completed

- Updated `AGENTS.md` and `CLAUDE.md` so new feature work must include PostHog
  and Sentry wiring, tests, and review coverage.
- Clarified the repo workflow so sub-agent driven development is required when
  the active runtime exposes usable sub-agents and the work can be safely
  delegated.
- Added pledge API PostHog events for pledge creation, payment recording,
  allowance recording, write-off, and promotion.
- Kept pledge analytics properties privacy-safe by using booleans, buckets, and
  categories instead of raw IDs, free text, exact counts, exact rates, or money.
- Expanded the API PostHog allowlist with the safe pledge properties needed by
  the new events.
- Captured API analytics transport failures in Sentry through
  `captureBackgroundException` without failing the user request.
- Added sanitized Sentry support for handled expected web errors through
  `includeExpected` and `sanitize` options.
- Added safe web telemetry for pledge success and failure paths, including
  sanitized handling for expected 4xx API errors.
- Updated pledge math so amortization schedule rows expose the web contract
  fields `period`, `date`, `carryingValueCents`, and
  `cumulativeAccretionCents`.
- Capped pledge accretion so cumulative accretion cannot exceed the pledge
  discount amount.
- Hardened pledge service behavior around invalid statuses, installment
  ownership checks, tied overpayments, payments on written-off installments,
  untied payments without enough open balance, due-date allocation, and write-off
  behavior for already paid installments.
- Cleaned pledge page copy, added dialog descriptions, and removed unsupported
  marketing claims about alerts, email, and filters.
- Added app help metadata and a help article for pledge tracking.
- Updated the PostHog tracking plan with the new pledge events and safe
  properties.

## Verification Evidence

- `pnpm --filter @grantpipe/api exec vitest run src/domains/pledges/routes.test.ts src/domains/pledges/service.test.ts src/lib/integrations.test.ts`
  passed with 140 tests.
- `pnpm --filter @grantpipe/web exec vitest run src/hooks/use-pledges.test.ts src/lib/sentry.test.ts src/routes/_authenticated/donors/pledges.test.tsx`
  passed with 160 tests before coverage additions.
- `pnpm --filter @grantpipe/web exec vitest run src/hooks/use-pledges.test.ts src/lib/sentry.test.ts`
  passed with 76 tests after coverage additions.
- `pnpm --filter @grantpipe/shared exec vitest run src/validators/pledge-math.test.ts src/validators/help.test.ts src/knowledge.test.ts src/public-kb/public-kb.test.ts`
  passed with 63 tests.
- `pnpm --filter @grantpipe/api typecheck` passed.
- `pnpm --filter @grantpipe/web typecheck` passed.
- `pnpm --filter @grantpipe/shared typecheck` passed.
- `pnpm --filter @grantpipe/api lint` passed.
- `pnpm --filter @grantpipe/web lint` passed.
- `pnpm --filter @grantpipe/shared lint` passed.
- `pnpm knowledge:check` passed.
- `pnpm --filter @grantpipe/api test:coverage` passed.
- `pnpm --filter @grantpipe/shared test:coverage` passed.
- Focused touched-file web coverage passed with 164 tests:
  `pnpm --filter @grantpipe/web exec vitest run src/hooks/use-pledges.test.ts src/lib/sentry.test.ts src/routes/_authenticated/donors/pledges.test.tsx --coverage --coverage.include=src/hooks/use-pledges.ts --coverage.include=src/lib/sentry.ts --coverage.include=src/routes/_authenticated/donors/pledges.tsx`
- Focused web coverage results:
  - `src/hooks/use-pledges.ts`: 99.12% statements, 99.12% lines,
    98.55% branches, 100% functions.
  - `src/lib/sentry.ts`: 100% statements, lines, branches, and functions.
  - `src/routes/_authenticated/donors/pledges.tsx`: 97.31% statements,
    97.31% lines, 95.55% branches, 95.45% functions.
- `git diff --check` passed.

## Known Remaining Work

- Production deploy and live verification still need to run after merge.
- Full web package coverage was not completed because the broader web coverage
  run timed out after 10 minutes amid unrelated suite noise. Focused coverage for
  touched web files passed above the 95% per-file target.
- API pledge analytics currently await the capture call and catch failures. A
  future cleanup can move this to a safe fire-and-forget `waitUntil` pattern if a
  consistent local pattern is available.
- Pledge page write controls are still visible even though the API requires the
  `accounting.manage` permission.
- `usePledges` still conflates 402 and 403 responses into the plan-gate path.
- The pledge table can still show a raw contact ID when contact display data is
  missing.
- The create pledge dialog still lacks optional fund and grant selectors.
- Clickable pledge rows need richer accessible link or button semantics.
- Empty and paywall states could better guide the next useful action.
- API posting helpers may silently skip missing chart-of-account accounts.
- `promotePledge` recomputes present value at promotion time while posting still
  uses the stored pledge date.
- Real production manual E2E using the `GRANTPIPE_E2E_*` account was not run in
  this wrap-up.
- Additional pledge filters beyond status, such as date or net asset filters,
  remain future work.
