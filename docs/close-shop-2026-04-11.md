# Close Shop - 2026-04-11

## What Changed

- Continued the desktop-first QA and polish loop across donors, events, grants, funds, reports, settings, notifications, dashboard, and signup.
- Added a shared shell layer in `packages/ui` with `PageShell` and `InsetPanel` so route-level pages can stop reimplementing spacing and inset-card treatments.
- Hardened settings and reports against stale query states instead of collapsing sections on refetch failures.
- Kept local QA anchored to the singleton local stack (`db:local:start`, one API server, one web server).

## Learnings

- The biggest UI debt is not component primitives; it is route-level duplication. Repeated page padding, inset-card layouts, and compact summary rows still exist in multiple authenticated routes.
- The most common functional regression pattern is stale-state handling. Several screens treated `isError` as terminal even when cached data still existed.
- Placeholder hero metadata (`Updated time unavailable`) reads as unfinished product copy and should be omitted unless the page can source real freshness data.
- The local E2E path is reliable when it signs up fresh users instead of depending on seeded auth state.
- MCP Playwright can deadlock on a reused browser profile. The Playwright CLI / package-level test path is the more dependable fallback for this repo.

## Verification Evidence

- `pnpm --filter @grantpipe/ui test -- src/components/page-shell.test.tsx`
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/dashboard.test.tsx src/routes/_authenticated/settings.test.tsx src/routes/_authenticated/reports/index.test.tsx`
- `pnpm exec playwright test e2e/auth-onboarding.spec.ts --project=chromium`
- One-off Playwright desktop smoke against `/app/dashboard`, `/app/settings`, and `/app/reports` using a fresh signup flow

## Outstanding Todos

- Add direct coverage and manual QA for `apps/web/src/routes/_authenticated/reports/$reportId.tsx`.
- Add desktop-path tests for edited settings saves, invite-link clipboard copy, and generated-report navigation.
- Continue replacing remaining route-local `slate-*` card treatments with semantic `@grantpipe/ui` primitives.
- Add retry affordances to first-load fatal states that still dead-end the user.
- Audit the remaining authenticated pages for cached-data-on-error handling, especially detail views.
- Decide which screenshot artifacts in the repo root should be kept as evidence versus moved to a dedicated QA artifact folder or removed.
