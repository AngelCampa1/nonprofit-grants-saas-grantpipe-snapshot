# Pricing Generosity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GrantPipe's Starter and Growth tiers more generous across shared pricing, marketing surfaces, API cap enforcement, and app plan displays while keeping prices and entitlement boundaries unchanged.

**Architecture:** `packages/shared` remains the source of truth for plan caps, display copy, and entitlement rows. API cap enforcement, web billing cards, pricing pages, `pricing.txt`, and public knowledge should either derive from shared constants or have explicit tests when they carry user-facing copy.

**Tech Stack:** TypeScript, Vitest, React, Astro, Hono, TanStack app routes, pnpm, Turbo.

---

### Task 1: Shared Plan Source Of Truth

**Files:**

- Modify: `packages/shared/src/constants/index.test.ts`
- Modify: `packages/shared/src/pricing.test.ts`
- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/pricing.ts`

- [x] Update tests first so Starter expects `10`, Growth expects `30`, Audit-Ready remains `100`, soft headroom remains `10`, and best-fit lines are `Stop losing track`, `Stay ahead of the work`, and `Prove what happened`.
- [x] Run `pnpm --filter @grantpipe/shared test -- src/constants/index.test.ts src/pricing.test.ts` and confirm RED against old `5/20` caps and old best-fit copy.
- [x] Update only `activeGrantCap` values in `PLAN_ENTITLEMENTS`, and update plan descriptions/features in `PLAN_CATALOG`. Do not change prices, promo logic, universal inclusions, or entitlement booleans.
- [x] Rerun `pnpm --filter @grantpipe/shared test -- src/constants/index.test.ts src/pricing.test.ts` and confirm GREEN.

### Task 2: API And Web Plan Enforcement Fixtures

**Files:**

- Modify: `apps/api/src/domains/grants/grant.service.test.ts`
- Modify: `apps/api/src/domains/import/service.test.ts`
- Modify: `apps/web/src/lib/plan-display.test.ts`
- Modify: `apps/web/src/components/settings-billing-panel.test.tsx`

- [x] Update test expectations for derived caps: Starter included cap `10`, Starter hard cap with headroom `20`, Growth cap `30`, and Growth hard cap with headroom `40`.
- [x] Run `pnpm --filter @grantpipe/api test -- src/domains/grants/grant.service.test.ts src/domains/import/service.test.ts` and `pnpm --filter @grantpipe/web test -- src/lib/plan-display.test.ts src/components/settings-billing-panel.test.tsx` to confirm RED where stale expectations remain.
- [x] Update stale fixtures only. Do not change API/web production enforcement code unless a failing test proves it does not derive from shared constants.
- [x] Rerun the same API and web targeted tests and confirm GREEN.

### Task 3: Marketing, SEO, And Machine-Readable Pricing Surfaces

**Files:**

- Modify: `apps/site/src/config/site.test.ts`
- Modify: `apps/site/src/pricing-page-seo-contract.test.ts`
- Modify: `apps/site/src/lib/pricing-txt.test.ts`
- Modify: `apps/site/src/pages/pricing.astro`
- Modify: `apps/site/src/components/pricing-plan-cards.astro`
- Modify: `apps/site/src/config/site.ts`
- Regenerate if changed by scripts: `packages/shared/src/knowledge/generated/marketing-knowledge.json`
- Regenerate if changed by scripts: `packages/shared/src/knowledge/generated/indexes.ts`
- Regenerate if changed by scripts: `apps/site/public/AGENTS.md`

- [x] Update tests first so public copy expects `Up to 10 active grants`, `Up to 30 active grants`, no `4x Starter`, no `5x Growth`, and best-fit ladder copy: `Stop losing track`, `Stay ahead of the work`, `Prove what happened`.
- [x] Run `pnpm --filter @grantpipe/site test -- src/config/site.test.ts src/pricing-page-seo-contract.test.ts src/lib/pricing-txt.test.ts` and confirm RED for stale public copy.
- [x] Update pricing page guide copy, plan card choice notes, and FAQ copy. Starter should read as tracking/visibility; Growth as operational control; Audit-Ready as proof, evidence, external review, and accounting outputs.
- [x] Run `pnpm knowledge:generate` and `pnpm public-agents:generate`.
- [x] Rerun the same site targeted tests and confirm GREEN.

### Task 4: Cross-System Verification, Review, Merge, And Deploy

**Files:**

- Inspect all modified files from Tasks 1-3.

- [x] Run `rg -n "Up to 5|Up to 20|5 active grants|20 active grants|4x Starter|5x Growth|for up to 5|for up to 20" apps packages` and verify there is no active app/package user-facing stale copy.
- [x] Run affected verification:
  - `pnpm --filter @grantpipe/shared test:coverage`
  - `pnpm --filter @grantpipe/api test -- src/domains/grants/grant.service.test.ts src/domains/import/service.test.ts`
  - `pnpm --filter @grantpipe/web test -- src/lib/plan-display.test.ts src/components/settings-billing-panel.test.tsx`
  - `pnpm --filter @grantpipe/site test -- src/config/site.test.ts src/pricing-page-seo-contract.test.ts src/lib/pricing-txt.test.ts`
  - `turbo typecheck`
- [x] Run review cycle 1 for spec compliance. Fix every Critical/Important issue and rerun relevant tests.
- [x] Run review cycle 2 for code quality, stale copy, gating risk, and deploy risk. Fix every Critical/Important issue and rerun relevant tests.
- [x] Complete an objective audit: prices unchanged; unlimited users unchanged; Starter `10`, Growth `30`, Audit-Ready `100`; soft headroom `10`; Starter tracking/visibility only; Growth operational control; Audit-Ready proof/external review; API/import enforcement derive new caps; web/site/machine-readable pricing show new caps.
- [ ] Merge to `master`, remove the worktree, and deploy affected production apps with the repo Wrangler deploy scripts.
