# Remove Stripe Connect Implementation Plan

> **Status:** Executed on 2026-07-03. The checklist is retained as release
> evidence for the Stripe Connect removal sweep.

**Goal:** Remove GrantPipe-managed Stripe Connect donor payment processing while keeping GrantPipe's own SaaS billing through Stripe intact.

**Architecture:** Stripe Connect lived behind the donor recurring-gift engine.
The removal deleted the Connect-backed API, webhook, route, hook, schemas,
generated route entries, dashboard analytics, and product claims. Existing SaaS
subscription billing under `apps/api/src/domains/billing` and
`apps/api/src/lib/integrations.ts` remains in place.

**Tech Stack:** TypeScript, Hono, React, TanStack Router, TanStack Query, Drizzle, Vitest, Prettier, ESLint, Cloudflare Workers.

---

## Scope Boundary

Remove:

- `/api/recurring-gifts` authenticated routes.
- `/api/recurring-gifts/webhook` public Connect webhook route.
- `apps/api/src/domains/recurring-gifts/*`.
- `apps/web/src/routes/_authenticated/donors/recurring-gifts.tsx`.
- `apps/web/src/hooks/use-recurring-gifts.ts`.
- Shared recurring-gift checkout/connect validators.
- Drizzle recurring-gift Connect/payment schema exports and tests.
- Recurring-gift production stress harnesses.
- `STRIPE_CONNECT_WEBHOOK_SECRET` runtime binding type and docs.
- Analytics/dashboard entries whose only purpose is Connect-backed recurring gifts.
- Product, AI-CS, pricing, and marketing claims that GrantPipe ships a Stripe-backed recurring-gift engine.

Keep:

- SaaS billing Stripe keys, webhooks, checkout, and customer portal.
- Generic CRM/content mentions that recurring gifts exist as a nonprofit concept or may be imported/tracked historically, as long as they do not claim GrantPipe processes donor payments through Stripe Connect.
- Accounting recurring journal templates (`apps/api/src/domains/accounting/recurringService.ts` and `/accounting/recurring`), which are unrelated to Stripe Connect.

## Task 1: API Route Removal

**Files:**

- Modify: `apps/api/src/app.ts`
- Delete: `apps/api/src/domains/recurring-gifts/routes.ts`
- Delete: `apps/api/src/domains/recurring-gifts/service.ts`
- Delete: `apps/api/src/domains/recurring-gifts/stripe.ts`
- Delete: `apps/api/src/domains/recurring-gifts/webhooks.ts`
- Delete tests under `apps/api/src/domains/recurring-gifts/*.test.ts`
- Modify: `apps/api/src/domains/billing/webhooks.ts`
- Modify: `apps/api/src/domains/billing/webhooks.test.ts`

- [x] Remove recurring-gift imports and `.route("/recurring-gifts", ...)` registrations from `app.ts`.
- [x] Remove recurring-gift paywall middleware entries from `app.ts`.
- [x] Delete the `domains/recurring-gifts` implementation and tests.
- [x] Remove billing webhook delegation to recurring-gift webhook processing so donor Connect invoices cannot affect SaaS billing logic.
- [x] Update billing webhook tests to assert SaaS billing behavior without recurring-gift delegation.
- [x] Run `pnpm --filter @grantpipe/api exec vitest run src/domains/billing/webhooks.test.ts`.

## Task 2: Shared Contract and DB Schema Removal

**Files:**

- Delete: `packages/shared/src/validators/recurring-gifts.ts`
- Delete: `packages/shared/src/validators/recurring-gifts.test.ts`
- Modify: `packages/shared/src/validators/index.ts`
- Delete: `packages/db/src/schema/recurring-gifts.ts`
- Delete: `packages/db/src/schema/recurring-gifts.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/wrangler.toml`

- [x] Remove recurring-gift validator exports from shared index.
- [x] Remove recurring-gift schema exports from DB index.
- [x] Remove `STRIPE_CONNECT_WEBHOOK_SECRET` from Worker binding types and env docs.
- [x] Run `pnpm --filter @grantpipe/shared exec vitest run src/validators/index.test.ts src/constants/index.test.ts src/pricing.test.ts` after related entitlement changes.
- [x] Run `pnpm --filter @grantpipe/db exec vitest run src/schema/index.test.ts` if present, otherwise run `pnpm --filter @grantpipe/db test`.

## Task 3: Web Route and Navigation Removal

**Files:**

- Delete: `apps/web/src/routes/_authenticated/donors/recurring-gifts.tsx`
- Delete: `apps/web/src/routes/_authenticated/donors/recurring-gifts.test.tsx`
- Delete: `apps/web/src/hooks/use-recurring-gifts.ts`
- Delete: `apps/web/src/hooks/use-recurring-gifts.test.ts`
- Modify: `apps/web/src/config/nav.ts`
- Regenerate or edit: `apps/web/src/routeTree.gen.ts`
- Modify: `apps/web/build-output.test.ts`

- [x] Remove the donors nav item for `/donors/recurring-gifts`.
- [x] Delete the route and hook that can start Stripe Connect onboarding or checkout.
- [x] Regenerate TanStack route tree if the repo script is available; otherwise remove generated recurring-gift route entries carefully.
- [x] Update build-output expectations that mentioned recurring gifts.
- [x] Run `pnpm --filter @grantpipe/web exec vitest run src/config/nav.test.ts src/routes/_authenticated.test.tsx build-output.test.ts` if the files exist.

## Task 4: Entitlements, Analytics, and Support Knowledge

**Files:**

- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/constants/index.test.ts`
- Modify: `packages/shared/src/constants/analytics.ts`
- Modify: `packages/shared/src/constants/analytics.test.ts`
- Modify: `packages/shared/src/pricing.ts`
- Modify: `packages/shared/src/pricing.test.ts`
- Modify: `scripts/posthog-dashboards.ts`
- Modify: `scripts/posthog-dashboards.test.ts`
- Modify: `docs/analytics/posthog-tracking-plan.md`
- Modify: `packages/shared/src/knowledge/ai-cs/feature-knowledge.ts`
- Modify: `apps/api/src/domains/ai-cs/feature-teaching.test.ts`

- [x] Remove the recurring-gift entitlement from plan labels, entitlement objects, pricing feature rows, and tests.
- [x] Remove recurring-gift analytics event constants and dashboard tiles that describe Connect onboarding, checkout, dunning, or payment recovery.
- [x] Remove AI-CS route knowledge for `/donors/recurring-gifts`.
- [x] Run affected shared, script, and API AI-CS tests.

## Task 5: Docs, Content, and Harness Cleanup

**Files:**

- Delete: `e2e-adhoc/recurring-gifts-prod-stress.mjs`
- Delete: `scripts/recurring-gifts-prod-stress.test.ts`
- Delete or rewrite: `docs/grant-operating-system/27-recurring-gift-engine-prd.md`
- Modify content files that claim GrantPipe Connect/Stripe recurring-gift processing.
- Regenerate marketing knowledge indexes if content changes require it.

- [x] Delete obsolete live stress harness and its tests.
- [x] Replace the PRD with a retired-feature note or remove it if no docs index requires it.
- [x] Sweep marketing/content files for claims that GrantPipe processes donor payments through Stripe Connect or ships a recurring-gift engine.
- [x] Keep generic nonprofit recurring-gift educational content where it is not a product claim.
- [x] Run `pnpm exec vitest run scripts/posthog-dashboards.test.ts scripts/recurring-gifts-prod-stress.test.ts` before deleting the recurring test only if using TDD failure proof, then remove and rerun without it.

## Task 6: Verification and Release

**Files:**

- All touched files.

- [x] Run repository-wide searches:
  - `rg -n -i "stripe connect|STRIPE_CONNECT|connected account|account_links|recurring-gifts|hasRecurringGiftEngine|recurringGiftConnect|recurringGiftCheckout" apps packages scripts docs e2e-adhoc`
  - Review remaining matches and classify them as generic/non-product, unrelated accounting, or defects to remove.
- [x] Run focused test suites for API, web, shared, db, and scripts touched above.
- [x] Run `pnpm exec eslint <touched-ts-files>`.
- [x] Run `pnpm exec prettier --check <touched-files>`.
- [x] Run a local review pass for accidental SaaS billing deletion, stale imports, stale generated routes, and product claims.
- [x] Merge to `master`, remove the worktree, and deploy affected apps through Wrangler scripts once tests pass.
