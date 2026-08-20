# Pricing Tier Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change GrantPipe self-serve pricing to Starter $49 monthly / $39 annual monthly-equivalent ($468/yr), Growth $99 monthly / $79 annual monthly-equivalent ($948/yr), and Audit-Ready $199 monthly / $159 annual monthly-equivalent ($1,908/yr). Annual pricing must stay clear as a monthly-equivalent price billed annually, with annual billing 20% off monthly.

**Architecture:** Keep `packages/shared/src/pricing.ts` as the price source of truth. Retire the launch promo as an active offer by making shared promo helpers return no active promo and by removing public banner/CTA promo wiring, while preserving passive historical promo fields only where stored billing history already needs them. Regenerate public agent/knowledge artifacts from shared pricing.

**Tech Stack:** TypeScript, Vitest, Astro site config/components, Hono API, Stripe checkout integration, shared generated marketing knowledge.

---

### Task 1: Shared Pricing Contract

**Files:**

- Modify: `packages/shared/src/pricing.test.ts`
- Modify: `packages/shared/src/pricing.ts`
- Modify: `packages/shared/src/promos.test.ts`
- Modify: `packages/shared/src/promos.ts`

- [ ] **Step 1: Write failing tests for new list prices and no active launch offer**

Update `packages/shared/src/pricing.test.ts` so the existing catalog tests expect:

```ts
expect(getPlanPriceCents("starter", "monthly")).toBe(4900);
expect(getPlanPriceCents("starter", "annual")).toBe(46800);
expect(getPlanPriceCents("growth", "monthly")).toBe(9900);
expect(getPlanPriceCents("growth", "annual")).toBe(94800);
expect(getPlanPriceCents("audit_ready", "monthly")).toBe(19900);
expect(getPlanPriceCents("audit_ready", "annual")).toBe(190800);
```

Update display expectations to `$39/mo billed annually`, `$79/mo billed annually`, `$159/mo billed annually`, `$49/mo`, `$99/mo`, `$199/mo`, and copy expectations to current full-price lines with annual totals and empty limited-offer fields.

Update `packages/shared/src/promos.test.ts` to expect `getActivePromo(new Date("2026-07-03T12:00:00Z"))` to be `null`, `PROMO_CATALOG` to be empty, and no launch promo window to be open.

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
pnpm --filter @grantpipe/shared test -- pricing.test.ts promos.test.ts
```

Expected: failures showing old prices and active promo behavior.

- [ ] **Step 3: Implement the shared price and promo changes**

In `PLAN_CATALOG`, update only the `prices` objects:

```ts
starter: {
  monthlyCents: 4900,
  annualCents: 46800,
  annualMonthlyEquivalentCents: 3900,
}
growth: {
  monthlyCents: 9900,
  annualCents: 94800,
  annualMonthlyEquivalentCents: 7900,
}
audit_ready: {
  monthlyCents: 19900,
  annualCents: 190800,
  annualMonthlyEquivalentCents: 15900,
}
```

In `packages/shared/src/promos.ts`, make `PROMO_CATALOG` an empty readonly array and `getActivePromo` return `null`. Keep exported promo code types and `LAUNCH_PROMO_PHASES` only for passive stored metadata and old webhook tests unless the later API cleanup removes those references safely.

In `getGrantPipePricingCopy`, keep limited-offer fields empty and make `starterMonthlyPromo`, `growthMonthlyPromo`, and `auditReadyMonthlyPromo` fall back to list prices.

- [ ] **Step 4: Run shared tests to verify green**

Run:

```bash
pnpm --filter @grantpipe/shared test -- pricing.test.ts promos.test.ts
```

Expected: all targeted shared pricing and promo tests pass.

### Task 2: Site, Public API, and Checkout Promo Removal

**Files:**

- Modify: `apps/site/src/config/site.test.ts`
- Modify: `apps/site/src/config/site.ts`
- Modify: `apps/api/src/domains/public/routes.test.ts`
- Modify: `apps/api/src/domains/public/routes.ts`
- Modify: `apps/api/src/lib/integrations.test.ts`
- Modify: `apps/api/src/lib/integrations.ts`
- Modify as needed: `apps/web/src/routes/_authenticated/settings.billing.test.tsx`
- Modify as needed: `apps/web/src/routes/_authenticated/select-plan.test.tsx`

- [ ] **Step 1: Write failing tests for no promo banner, no implicit promo codes, and inactive public promo endpoint**

In site config tests, assert `siteConfig.promoBanner` is `undefined`, `pricingConfig.annualSavingsText` is an empty string or neutral annual text, and pricing tier values map to the new cents.

In API/public route tests, assert `/api/public/marketing/launch-promo` returns `active: false`, no active code intended for checkout, and a neutral inactive shape.

In integration tests, assert checkout sessions no longer attach `M80OFF` or `Y80OFF` implicitly when no promo is supplied, and explicit old launch codes are refused without adding a discount.

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
pnpm --filter @grantpipe/site test -- src/config/site.test.ts
pnpm --filter @grantpipe/api test -- src/domains/public/routes.test.ts src/lib/integrations.test.ts
```

Expected: failures around current promo banner and implicit promo wiring.

- [ ] **Step 3: Implement runtime cleanup**

Remove `PROMO_CATALOG`, `LAUNCH_PROMO_DEADLINE_ISO`, and `ACTIVE_PROMO_ENTRY` usage from `apps/site/src/config/site.ts`. Set `promoBanner` to `undefined` by omitting it from `siteConfig`. Set annual savings copy to a truthful non-promo annual note or empty string based on the component test.

In `apps/api/src/lib/integrations.ts`, change `resolveCheckoutPromoCode` so missing promo code returns `{ code: undefined, implicit: true }`. Old launch codes should not resolve to discounts. Keep arbitrary non-launch promo codes supported only if explicitly supplied and active in Stripe.

In `apps/api/src/domains/public/routes.ts`, stop surfacing an active launch code. Return a stable inactive response for compatibility, or remove dynamic promo state reads if tests and consumers allow it.

- [ ] **Step 4: Run site/API tests to verify green**

Run the same site/API targeted tests. Then run web pricing/billing tests if they were touched:

```bash
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.billing.test.tsx src/routes/_authenticated/select-plan.test.tsx
```

### Task 3: Generated Public Knowledge and Content Sweep

**Files:**

- Modify: `scripts/generate-public-agents.ts` tests if stale
- Regenerate: `apps/site/public/AGENTS.md`
- Regenerate: any `pricing.txt`, `llms.txt`, `llms-full.txt`, or public KB artifacts produced by repo scripts
- Modify stale docs/content only where they are current public/product truth, not historical notes

- [ ] **Step 1: Write or update failing generated-output assertions**

Update existing public KB / technical SEO / generated-agent tests to assert the new prices and absence of 80% limited-offer copy in active generated artifacts.

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
pnpm exec vitest run packages/shared/src/public-kb/public-kb.test.ts packages/shared/src/knowledge.test.ts apps/web/src/technical-seo-source.test.ts scripts/generate-public-agents.test.ts
```

Expected: stale generated output or assertions still mention old prices or promo copy.

- [ ] **Step 3: Regenerate artifacts and fix source templates**

Run the repo generation scripts that own public knowledge and site artifacts. Update source templates that use `{{grantpipe.price.*Promo}}` or `{{grantpipe.promo.limitedOffer}}` only if the generated output still renders stale promo text after shared copy is fixed.

- [ ] **Step 4: Sweep for stale price and promo strings**

Run:

```bash
rg -n "\$329|\$539|\$1,079|\$269|\$449|\$3,228|\$5,389|80% off|first year|M80OFF|Y80OFF|limited time offer|limited-offer" packages apps scripts content docs -g "!**/node_modules/**"
```

Expected: no active runtime, generated public, customer-facing content, or tests contain stale old pricing or active launch-promo claims. Historical docs may remain only when clearly historical and not used by public runtime.

### Task 4: Review, Broad Verification, Merge, Deploy

**Files:**

- All changed files from Tasks 1-3

- [ ] **Step 1: Run formatting and focused tests**

Run:

```bash
pnpm format:check
pnpm --filter @grantpipe/shared test
pnpm --filter @grantpipe/api test -- src/domains/public/routes.test.ts src/lib/integrations.test.ts
pnpm --filter @grantpipe/site test -- src/config/site.test.ts
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.billing.test.tsx src/routes/_authenticated/select-plan.test.tsx
```

- [ ] **Step 2: Run package-level quality gates for affected packages**

Run:

```bash
turbo typecheck --filter=@grantpipe/shared --filter=@grantpipe/api --filter=@grantpipe/site --filter=@grantpipe/web
turbo test --filter=@grantpipe/shared --filter=@grantpipe/api --filter=@grantpipe/site --filter=@grantpipe/web
```

- [ ] **Step 3: Request sub-agent review**

Dispatch at least two review passes: one spec compliance review focused on the requested price/promo sweep, and one code quality review focused on runtime regressions, stale generated artifacts, and billing/Stripe risk. Fix every important finding and rerun relevant tests.

- [ ] **Step 4: Merge, cleanup, deploy, and verify live**

Merge `chore/pricing-tier-update` to `master`, remove `.worktrees/pricing-tier-update`, and deploy affected apps using repo scripts:

```bash
pnpm run deploy:changed:dry-run
pnpm run deploy:api
pnpm run deploy:web
pnpm run deploy:site
```

After deploy, verify live `/pricing`, `/pricing.txt`, `/llms.txt`, signup URLs, and public promo endpoint show new list prices and no 80% limited offer.
