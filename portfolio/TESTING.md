# Testing

GrantPipe has more test code than application code. That is the single most
honest thing to say about how it was built.

|                    |                                           |
| ------------------ | ----------------------------------------- |
| Application source | 250,218 lines across 1,117 files          |
| Test code          | 388,074 lines across 905 files            |
| Ratio              | **1.55 lines of test per line of source** |

## Measured coverage

Every workspace, from one uncached `pnpm exec turbo test:coverage --force` run:

| Workspace         | Lines  | Statements | Functions | Branches |
| ----------------- | ------ | ---------- | --------- | -------- |
| `apps/api`        | 99.3%  | 99.3%      | 99.8%     | 97.0%    |
| `apps/web`        | 99.6%  | 99.6%      | 99.3%     | 97.2%    |
| `apps/site`       | 99.1%  | 99.1%      | 99.1%     | 96.4%    |
| `packages/db`     | 100.0% | 100.0%     | 100.0%    | 100.0%   |
| `packages/shared` | 99.97% | 99.97%     | 99.6%     | 99.2%    |
| `packages/ui`     | 99.6%  | 99.6%      | 100.0%    | 98.2%    |

`packages/shared`'s lines and statements are shown to a second decimal because rounding to one
decimal would print 100.0%, indistinguishable from `packages/db`'s genuine 100%. See
[`docs/architecture/repo-stats.json`](../docs/architecture/repo-stats.json).

Branch coverage is the lowest column in every workspace, which is what you would
expect. It is also the number that matters most, since a missed branch is an
unexercised decision rather than an unexercised line.

## Why the ratio is that shape

This is compliance software written by one person with no reviewer. A mistake in
the posting engine does not produce a visibly broken page; it produces a
plausible number that is wrong, and it surfaces months later in an audit. The
only available substitute for a second pair of eyes was a test that fails.

So the workflow was strict TDD: write the failing test, confirm it fails,
implement the smallest thing that passes, confirm it passes, refactor. Not
aspirationally: the coverage gate makes it difficult to do otherwise.

## The coverage gate

**95% per file touched, not 95% repo average.** A repo average lets a
well-covered utility file pay for an untested service. A per-file gate does not.

Enforced in three places:

- `vitest.config.ts` in `apps/api`, `apps/site`, `packages/db`, `packages/shared`
  and `packages/ui` sets `thresholds` with `perFile: true` at 95% for lines,
  statements, functions and branches.
- [`scripts/lib/coverage-gates.ts`](../scripts/lib/coverage-gates.ts) reads each
  workspace's `coverage/coverage-summary.json` and checks only the files changed
  against `upstream/master`, so the gate applies to work in progress rather than
  to history.
- [`apps/web/scripts/verify-coverage-thresholds.mjs`](../apps/web/scripts/verify-coverage-thresholds.mjs)
  carries an explicit, individually justified baseline map for the handful of
  files that predate the gate.

**One asymmetry worth naming:** `apps/web` and the root `scripts/` runner have no
native `thresholds` block in their vitest configs. `apps/web` is gated by the
`verify-coverage-thresholds.mjs` script instead, which is equivalent in effect
but not in mechanism. `scripts/` has no coverage gate at all. The other five
packages enforce natively.

## Layers

**Unit and integration (Vitest, 905 files).** Services are tested against a
mocked database handle rather than a live Postgres, which keeps the suite fast
enough to run on every commit. The trade-off is real and known: mocked query
builders cannot catch a malformed SQL fragment. That class of bug has bitten
this codebase before: a Drizzle relational query that re-qualified a cross-table
`sql` fragment produced a runtime 500 that every mocked test passed straight
through. The mitigation is the e2e layer, not more mocks.

**End-to-end (Playwright, 13 specs).** Real browser, real API, real database.
Covers the flows where a break is invisible to a unit test: signup through
onboarding to first value, authentication, the reviewer portal.

**Production verification.** Separate Playwright configs target deployed
environments (`playwright.prod.config.ts`, `playwright.authenticated-prod.config.ts`,
`playwright.public-prod.config.ts`), plus a stress suite that fires roughly 35
domain-specific smoke scripts at production, and
[`scripts/prod-e2e-cleanup.ts`](../scripts/prod-e2e-cleanup.ts) with a
`--dry-run` flag to remove the data those runs create.

**Guard tests.** Tests that enforce architecture rather than behaviour:
analytics-event governance, the QuickBooks retirement contract, the repo-wide
regulatory sweep, and a fabricated-claims linter. These are described in
[`portfolio/ENGINEERING-LOG.md`](./ENGINEERING-LOG.md).

## Pre-commit

Two layers, in [`.husky/pre-commit`](../.husky/pre-commit):

1. **lint-staged**: ESLint `--fix` and Prettier `--write` on staged files.
2. **affected packages**:
   [`scripts/run-affected-checks.ts`](../scripts/run-affected-checks.ts) maps
   staged files to workspace packages by path prefix and runs `turbo typecheck`
   plus coverage for only those.

A docs-only or screenshot-only commit maps to no package and exits immediately.
Touching `packages/shared` triggers the full API, web and UI suites, which takes
roughly thirteen minutes. That is the intended cost of changing shared code.

## A worked example: the date bomb

Worth including because it is a defect class that only appears in long-lived
repositories, and because the fix has a wrong version that looks right.

Seven tests in `invitation-delivery.service.test.ts` began failing months after
they were written, with no source change. Their fixtures hardcoded
`expiresAt: new Date("2026-08-01T00:00:00Z")`. The service's `claim()` gates on
`isInvitationDeliveryEligible(session, new Date())` using the real wall clock,
which it does not accept as a parameter. On 2026-08-01 every fixture session
became expired, `claim()` correctly returned `null`, and the assertions broke.

The service was right. The tests had a dependency on the calendar that nobody
declared.

The tempting fix is to move the constant to a later date. That re-arms the same
bomb. The correct fix freezes the clock:

```ts
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-11T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});
```

Fixing it also exposed a second problem. Five other tests in the same file were
passing for the wrong reason: `claim()` runs an unconditional "quarantine stale
leases" update _before_ the eligibility check, so their
`expect(sets).toContainEqual({ invitationDeliveryStatus: "quarantined" })`
assertions were satisfied by that unrelated write. They would have passed even
if the code under test were entirely broken. Freezing the clock made them assert
what they claim to assert.

## Running the suite

```bash
pnpm test                    # all packages
pnpm test:coverage           # all packages with coverage
pnpm audit:coverage          # coverage + the changed-file gate
pnpm e2e                     # Playwright, local

pnpm --filter @grantpipe/api test:coverage    # one package
```

Three things that will waste your time otherwise:

- **Turbo caches on content, not on commit.** A green `pnpm test:coverage` can be
  six cache replays that wrote no coverage files at all. Use
  `pnpm exec turbo test:coverage --force` when the numbers matter.
- **The root `scripts/` suite will report failures on a fresh clone, and that is
  the guard working.** `pnpm exec vitest run --config scripts/vitest.config.ts`
  picks up roughly 33 production-E2E harness files alongside the ordinary script
  tests. Those files call into
  [`scripts/lib/live-e2e-proof.ts`](../scripts/lib/live-e2e-proof.ts), which
  refuses to run without a token issued by the cleanup wrapper: `production E2E
requires a cleanup wrapper run token`. There is deliberately no skip flag, because
  a suite that can quietly opt out of its own cleanup proof is how you end up with
  orphaned rows in a live database. These files are not part of
  `turbo test:coverage`, which is why that command exits 0.
- **`PUBLIC_TURNSTILE_SITE_KEY` must not be set** in the shell running tests.
  `packages/ui/src/site/lib/public-turnstile.ts` falls back to reading it from
  the environment, so a value left over from a production build makes roughly
  five UI test files fail on assertions about the no-key path.
