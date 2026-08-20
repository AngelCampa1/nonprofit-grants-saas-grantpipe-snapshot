# Pricing Packaging Realignment Implementation Plan

> **Superseded on 2026-07-03 for external accounting integrations.** QuickBooks
> sync is unavailable on every plan. Ignore all QuickBooks entitlement, sync,
> ingestion, and connector instructions below. The supported QuickBooks path is
> manual CSV/opening-balance import, kept separate from the general ledger.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align GrantPipe packaging so Starter stands on its own, Growth is the default plan for day-to-day grant compliance, Audit-Ready owns external review and audit-depth workflows, and true cross-entity reporting belongs only in Enterprise.

**Architecture:** Keep `packages/shared/src/constants/index.ts` and `packages/shared/src/pricing.ts` as the source of truth. Update entitlement contracts first, then API/app gates, public pricing and feature copy, AI-SDR context, and drift guards. Every user-facing copy change must pass `humanizer`, then `third-grade-copy`, then a zero-lies check against `PLAN_ENTITLEMENTS` and `PLAN_CATALOG`.

**Tech Stack:** TypeScript, Vitest, Hono on Cloudflare Workers, React 19 + TanStack Router, Astro, shared GrantPipe pricing/constants package.

---

## Scope Decisions

- Starter remains a real product tier, not a teaser: grant/donor records, budgets, deadlines, restricted-fund basics, reminder emails, budget alerts, capped AI Award Document Intake, and capped Ask-Your-Ledger stay visible.
- Growth is the recommended/default plan for day-to-day grant compliance: compliance report pack, budget exports, planned expenses, payment requests, QuickBooks read-only sync, proposal/report drafting, unrestricted AI usage, and single-org operating visibility.
- Audit-Ready is for external review and audit pressure: Auditor & Funder Portal, guided onboarding/import/setup, evidence packages, subrecipient monitoring, indirect cost rules, payment evidence packets, budget audit views, and program allocation management/exports.
- Enterprise is the only tier for true cross-entity reporting and multi-entity consolidation.
- Prices, grant caps, trial terms, and promo behavior do not change in this plan.

## File Structure

| File                                                               | Responsibility                                                               | Action                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/shared/src/constants/index.ts`                           | Plan entitlement source of truth and helper gates                            | Modify                                                          |
| `packages/shared/src/constants/index.test.ts`                      | Entitlement and helper contract tests                                        | Modify                                                          |
| `packages/shared/src/pricing.ts`                                   | Plan catalog, marketed feature rows, pricing copy helpers                    | Modify                                                          |
| `packages/shared/src/pricing.test.ts`                              | Catalog, feature row, minimum-plan, and drift tests                          | Modify                                                          |
| `apps/api/src/domains/report-builder/routes.ts`                    | API gate message for cross-entity report builder                             | Modify                                                          |
| `apps/api/src/domains/report-builder/routes.test.ts`               | Enterprise-only report-builder access tests                                  | Modify                                                          |
| `apps/web/src/routes/_authenticated/reports/builder.tsx`           | Report builder gated-state copy                                              | Modify                                                          |
| `apps/web/src/routes/_authenticated/reports/builder.test.tsx`      | Report builder gated-state UI tests                                          | Modify                                                          |
| `apps/web/src/routes/_authenticated/reports/index.tsx`             | Report hub CTA/tier language if stale                                        | Modify if stale                                                 |
| `apps/web/src/routes/_authenticated/reports/index.test.tsx`        | Report hub tier contract if stale                                            | Modify if stale                                                 |
| `apps/web/src/components/settings-billing-panel.tsx`               | In-app plan chooser copy                                                     | Modify                                                          |
| `apps/web/src/components/settings-billing-panel.test.tsx`          | Billing plan copy tests                                                      | Modify                                                          |
| `apps/web/src/routes/_authenticated/confirm-plan.tsx`              | Trial confirmation plan framing                                              | Modify if stale                                                 |
| `apps/web/src/routes/_authenticated/confirm-plan.test.tsx`         | Confirmation copy tests                                                      | Modify if stale                                                 |
| `apps/site/src/components/pricing-plan-cards.astro`                | Pricing cards rendered from shared catalog                                   | Verify/modify                                                   |
| `apps/site/src/components/pricing-plan-cards-source.test.ts`       | Pricing card source contracts                                                | Modify                                                          |
| `apps/site/src/components/feature-comparison-matrix.astro`         | Public feature matrix                                                        | Verify/modify                                                   |
| `apps/site/src/feature-comparison-matrix-source.test.ts`           | Matrix source contract                                                       | Modify                                                          |
| `apps/site/src/tier-alignment.test.ts`                             | Cross-surface tier alignment contracts                                       | Modify                                                          |
| `apps/site/src/pricing-page-seo-contract.test.ts`                  | Pricing SEO/copy contract if stale                                           | Modify if stale                                                 |
| `apps/site/src/pricing-sticky-cta-source.test.ts`                  | Sticky CTA tier drift guard                                                  | Modify                                                          |
| `apps/site/src/config/site.ts`                                     | Site FAQ and pricing/tier answer copy                                        | Modify                                                          |
| `apps/site/src/config/site.test.ts`                                | Site FAQ/package drift tests                                                 | Modify                                                          |
| `apps/site/src/lib/marketed-capabilities.ts`                       | Product capability narratives and tier bindings                              | Modify                                                          |
| `apps/site/src/product-page-contract.test.ts`                      | Product page package narrative contract                                      | Modify                                                          |
| `apps/site/src/product-proof-section-contract.test.ts`             | Product proof/tier binding contract                                          | Modify                                                          |
| `apps/site/src/feature-landing-pages-contract.test.ts`             | Feature page routing/availability contracts                                  | Modify                                                          |
| `packages/shared/src/public-kb/ai-sdr-context.ts`                  | AI-SDR plan/product context                                                  | Modify                                                          |
| `packages/shared/src/public-kb/ai-sdr-context.test.ts`             | AI-SDR plan context tests                                                    | Modify                                                          |
| `apps/site/src/lib/ai-sdr/context.test.ts`                         | Public AI-SDR context contract                                               | Modify                                                          |
| `.agents/product-marketing-context.md`                             | Legacy marketing context with stale pricing/tier notes                       | Modify or retire from source of truth                           |
| `apps/site/src/content-tests/grantpipe-tier-copy-contract.test.ts` | Corpus-wide tier-claim drift sweep (all 17 content subdirs + `.astro` pages) | Modify                                                          |
| `packages/shared/src/knowledge/marketing/content/**/*.md`          | Tier-availability claims across the full content corpus                      | Discovered + fixed via the Task 8 sweep (do not hand-enumerate) |
| `packages/shared/src/knowledge/generated/indexes.ts`               | Generated knowledge index                                                    | Regenerate if content changes                                   |
| `packages/shared/src/knowledge/generated/marketing-knowledge.json` | Generated marketing knowledge payload                                        | Regenerate if content changes                                   |
| `scripts/live-e2e-package-contract.test.ts`                        | Live package script contract                                                 | Verify unchanged                                                |

---

## Preflight

- [ ] **Step 1: Confirm implementation is in an isolated worktree**

Run:

```powershell
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
```

Expected:

- Path is under `.worktrees\`.
- Branch is not `master`.
- Status is clean except for intentional implementation changes.

- [ ] **Step 2: Confirm base branch is current**

Run from the main checkout before implementation work starts:

```powershell
git pull
```

Expected: `Already up to date.` or a clean fast-forward before creating/reusing the worktree.

---

## Phase 1 - Entitlement Contracts

### Task 1: Write the packaging decision as failing shared tests

**Files:**

- Modify: `packages/shared/src/constants/index.test.ts`
- Modify: `packages/shared/src/pricing.test.ts`

- [ ] **Step 1: Add failing entitlement tests**

Add this block near the existing `PLAN_ENTITLEMENTS` tests in `packages/shared/src/constants/index.test.ts`:

```ts
it("keeps Starter credible while reserving day-to-day compliance depth for Growth", () => {
  expect(PLAN_ENTITLEMENTS.starter).toMatchObject({
    activeGrantCap: 10,
    hasAutomationEmails: true,
    hasRestrictionLifecycle: true,
    hasGrantBudgetBasics: true,
    hasGrantBudgetAlerts: true,
    hasAwardDocumentIntake: true,
    hasAskYourLedger: true,
    hasComplianceReportPack: false,
    hasGrantBudgetExports: false,
    hasPlannedExpenses: false,
    hasAccountingIntegrations: false,
    hasProposalReportDrafting: false,
  });

  expect(PLAN_ENTITLEMENTS.growth).toMatchObject({
    activeGrantCap: 30,
    hasComplianceReportPack: true,
    hasPaymentRequests: true,
    hasGrantBudgetExports: true,
    hasPlannedExpenses: true,
    hasAccountingIntegrations: true,
    hasProposalReportDrafting: true,
    hasAuditorFunderPortal: false,
    hasRestrictionEvidencePackage: false,
    hasSubrecipientMonitoring: false,
  });
});

it("keeps Audit-Ready for external review and Enterprise for cross-entity reporting", () => {
  expect(PLAN_ENTITLEMENTS.audit_ready).toMatchObject({
    hasAuditorFunderPortal: true,
    hasGuidedOnboarding: true,
    hasRestrictionEvidencePackage: true,
    hasPaymentEvidencePackage: true,
    hasIndirectCostRules: true,
    hasSubrecipientMonitoring: true,
    hasGrantBudgetAuditViews: true,
    hasMultiEntityConsolidation: false,
    hasCrossEntityReportBuilder: false,
  });

  expect(PLAN_ENTITLEMENTS.enterprise).toMatchObject({
    hasMultiEntityConsolidation: true,
    hasCrossEntityReportBuilder: true,
  });
});
```

Add this block near the `getMinimumPlanForFeatures` tests in `packages/shared/src/pricing.test.ts`:

```ts
it("requires Enterprise for true cross-entity reporting", () => {
  expect(getMinimumPlanForFeatures(["hasCrossEntityReportBuilder"])).toBe("enterprise");
  expect(formatMinimumPlanLabelForFeatures(["hasCrossEntityReportBuilder"])).toBe("Enterprise");

  const row = MARKETED_FEATURE_CATALOG.find((item) => item.key === "hasCrossEntityReportBuilder");
  expect(row?.byTier).toMatchObject({
    starter: "not_included",
    growth: "not_included",
    audit_ready: "not_included",
    enterprise: "included",
  });
});
```

- [ ] **Step 2: Run the tests to verify the current mismatch**

Run:

```powershell
pnpm --filter @grantpipe/shared test -- constants/index.test.ts pricing.test.ts
```

Expected: FAIL because `audit_ready.hasCrossEntityReportBuilder` is currently `true`.

### Task 2: Move cross-entity report builder to Enterprise only

**Files:**

- Modify: `packages/shared/src/constants/index.ts`
- Modify: `packages/shared/src/constants/index.test.ts`
- Modify: `packages/shared/src/pricing.test.ts`

- [ ] **Step 1: Update entitlement source**

Change only this value in `PLAN_ENTITLEMENTS.audit_ready`:

```ts
hasCrossEntityReportBuilder: false,
```

Keep this value in `PLAN_ENTITLEMENTS.enterprise`:

```ts
hasCrossEntityReportBuilder: true,
```

- [ ] **Step 2: Update existing helper tests**

Replace the existing `reports cross-entity report builder eligibility from Audit-Ready upward` expectation with:

```ts
expect(canUseCrossEntityReportBuilder("starter")).toBe(false);
expect(canUseCrossEntityReportBuilder("growth")).toBe(false);
expect(canUseCrossEntityReportBuilder("audit_ready")).toBe(false);
expect(canUseCrossEntityReportBuilder("enterprise")).toBe(true);
```

- [ ] **Step 3: Run shared tests**

Run:

```powershell
pnpm --filter @grantpipe/shared test -- constants/index.test.ts pricing.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add packages/shared/src/constants/index.ts packages/shared/src/constants/index.test.ts packages/shared/src/pricing.test.ts
git commit -m "fix(shared): gate cross-entity reporting to Enterprise"
```

---

## Phase 2 - API and App Gates

### Task 3: Make report-builder API Enterprise-only

**Files:**

- Modify: `apps/api/src/domains/report-builder/routes.ts`
- Modify: `apps/api/src/domains/report-builder/routes.test.ts`

- [ ] **Step 1: Update route tests first**

In `routes.test.ts`, change any Audit-Ready success case for report-builder metadata, preview, save, or export to an Enterprise success case. Add an explicit Audit-Ready rejection case:

```ts
it("rejects Audit-Ready orgs from the cross-entity report builder", async () => {
  const app = buildApp({
    orgSubscription: {
      planTier: "audit_ready",
      subscriptionStatus: "active",
      trialEndsAt: null,
    },
  } as never);

  const response = await app.request("/report-builder/metadata");

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toMatchObject({
    error: "insufficient_plan",
    message: expect.stringContaining("Enterprise"),
  });
});

it("allows Enterprise orgs to use the cross-entity report builder", async () => {
  const app = buildApp({
    orgSubscription: {
      planTier: "enterprise",
      subscriptionStatus: "active",
      trialEndsAt: null,
    },
  } as never);

  const response = await app.request("/report-builder/metadata");

  expect(response.status).toBe(200);
});
```

Use the exact `buildApp` helper shape already present in `apps/api/src/domains/report-builder/routes.test.ts`; adjust only the existing fixture fields if the helper signature has drifted.

- [ ] **Step 2: Run failing API test**

Run:

```powershell
pnpm --filter @grantpipe/api test -- report-builder/routes.test.ts
```

Expected: FAIL if the route message still says "Audit-Ready and above" or tests still seed Audit-Ready as allowed.

- [ ] **Step 3: Keep implementation entitlement-driven and update the message**

Keep this route guard:

```ts
if (!canUseCrossEntityReportBuilder(planTier)) {
```

Update the response message in `apps/api/src/domains/report-builder/routes.ts` to:

```ts
message: "The Cross-Entity Report Builder is available on Enterprise.",
```

- [ ] **Step 4: Run API test**

Run:

```powershell
pnpm --filter @grantpipe/api test -- report-builder/routes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/src/domains/report-builder/routes.ts apps/api/src/domains/report-builder/routes.test.ts
git commit -m "fix(api): require Enterprise for cross-entity report builder"
```

### Task 4: Align report-builder UI language

**Files:**

- Modify: `apps/web/src/routes/_authenticated/reports/builder.tsx`
- Modify: `apps/web/src/routes/_authenticated/reports/builder.test.tsx`
- Modify if stale: `apps/web/src/routes/_authenticated/reports/index.tsx`
- Modify if stale: `apps/web/src/routes/_authenticated/reports/index.test.tsx`

- [ ] **Step 1: Update UI tests first**

In `builder.test.tsx`, assert the gated state names Enterprise:

```ts
expect(screen.getByText("Enterprise plan required")).toBeInTheDocument();
expect(screen.getByText(/The Report Builder is on the Enterprise plan\./)).toBeInTheDocument();
```

If `reports/index.test.tsx` mentions Audit-Ready for the report builder CTA, update it to expect Enterprise.

- [ ] **Step 2: Run failing UI tests**

Run:

```powershell
pnpm --filter @grantpipe/web test -- reports/builder.test.tsx reports/index.test.tsx
```

Expected: FAIL if copy still says Audit-Ready/Enterprise.

- [ ] **Step 3: Update UI copy**

Change the gated alert in `builder.tsx` from:

```tsx
<Alert variant="info" title="Audit-Ready plan required">
  The Report Builder is on the Audit-Ready and Enterprise plans.{" "}
```

to:

```tsx
<Alert variant="info" title="Enterprise plan required">
  The Report Builder is on the Enterprise plan.{" "}
```

If possible without broad refactoring, derive the plan label with:

```ts
formatMinimumPlanLabelForFeatures(["hasCrossEntityReportBuilder"]);
```

- [ ] **Step 4: Copy gate**

Run `humanizer` then `third-grade-copy` on changed user-facing text. Confirm no text says Audit-Ready includes true cross-entity reporting.

- [ ] **Step 5: Run UI tests**

Run:

```powershell
pnpm --filter @grantpipe/web test -- reports/builder.test.tsx reports/index.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/routes/_authenticated/reports/builder.tsx apps/web/src/routes/_authenticated/reports/builder.test.tsx apps/web/src/routes/_authenticated/reports/index.tsx apps/web/src/routes/_authenticated/reports/index.test.tsx
git commit -m "fix(web): describe report builder as Enterprise-only"
```

---

## Phase 3 - Shared Pricing Catalog

### Task 5: Rewrite plan catalog deltas and buying guidance

**Files:**

- Modify: `packages/shared/src/pricing.ts`
- Modify: `packages/shared/src/pricing.test.ts`

- [ ] **Step 1: Add failing catalog tests**

Add this block to `pricing.test.ts`:

```ts
it("keeps the public catalog aligned to the packaging decision", () => {
  const starter = getPricingPlan("starter");
  const growth = getPricingPlan("growth");
  const auditReady = getPricingPlan("audit_ready");
  const enterprise = getPricingPlan("enterprise");

  expect(starter.features.join(" ")).toMatch(/deadline|reminder/i);
  expect(starter.features.join(" ")).toMatch(/restricted/i);
  expect(starter.features.join(" ")).toMatch(/AI Award Document Intake/i);
  expect(starter.features.join(" ")).toMatch(/Ask-Your-Ledger/i);

  expect(growth.highlighted).toBe(true);
  expect(`${growth.description} ${growth.pricingPageGuide} ${growth.chooseThisIf}`).toMatch(
    /day-to-day grant compliance|most grant-funded nonprofits|most day-to-day/i,
  );
  expect(growth.features.join(" ")).toMatch(/QuickBooks/i);
  expect(growth.features.join(" ")).toMatch(/proposal|draft/i);

  expect(auditReady.features.join(" ")).toMatch(/Auditor & Funder Portal/i);
  expect(auditReady.features.join(" ")).toMatch(/evidence package/i);
  expect(auditReady.features.join(" ")).toMatch(/Subrecipient/i);
  expect(auditReady.features.join(" ")).toMatch(/Indirect cost/i);
  expect(auditReady.features.join(" ")).not.toMatch(/Cross-entity report builder/i);

  expect(enterprise.features.join(" ")).toMatch(/Cross-entity report builder/i);
  expect(enterprise.features.join(" ")).toMatch(/Multi-entity consolidation/i);
});
```

- [ ] **Step 2: Run failing catalog test**

Run:

```powershell
pnpm --filter @grantpipe/shared test -- pricing.test.ts
```

Expected: FAIL until Enterprise includes cross-entity reporting and any stale descriptions are updated.

- [ ] **Step 3: Update `PLAN_CATALOG`**

Keep plan order, prices, caps, and `highlighted: true` for Growth unchanged.

Starter copy requirements:

- Present as useful for a small team getting out of spreadsheets.
- Include reminders, budgets, restricted-fund basics, capped AI intake, and capped Ask-Your-Ledger.
- Do not imply Starter is tracking-only or fake.

Growth copy requirements:

- Present as the default for most day-to-day grant compliance.
- Include QuickBooks read-only sync, compliance report pack, budget exports, planned expenses, reimbursement/drawdown workflow, proposal/report drafting, and unlimited AI.
- Do not claim auditor/funder portal or formal evidence packets.

Audit-Ready copy requirements:

- Present as review/audit readiness, not merely "more compliance."
- Include Auditor & Funder Portal, evidence packages, guided onboarding/import/setup, subrecipient monitoring, indirect cost rules, reimbursement evidence packets, budget audit views, and program allocation management/exports.
- Do not include cross-entity report builder.

Enterprise copy requirements:

- Include `Cross-entity report builder`.
- Include `Multi-entity consolidation`.
- Keep contact/founder/custom rollout framing.

- [ ] **Step 4: Copy gate**

Run `humanizer`, then `third-grade-copy`, then manually verify every changed sentence against `PLAN_ENTITLEMENTS`.

- [ ] **Step 5: Run shared tests**

Run:

```powershell
pnpm --filter @grantpipe/shared test -- pricing.test.ts constants/index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/shared/src/pricing.ts packages/shared/src/pricing.test.ts
git commit -m "fix(shared): realign plan catalog packaging"
```

---

## Phase 4 - Marketing Matrix and Tier Drift Guards

### Task 6: Update marketed feature rows and matrix contracts

**Files:**

- Modify: `packages/shared/src/pricing.ts`
- Modify: `packages/shared/src/pricing.test.ts`
- Modify: `apps/site/src/tier-alignment.test.ts`
- Modify: `apps/site/src/feature-comparison-matrix-source.test.ts`
- Verify/modify: `apps/site/src/components/feature-comparison-matrix.astro`

- [ ] **Step 1: Add matrix contract assertions**

In the best existing matrix/alignment test file, assert:

```ts
expect(crossEntityRow?.byTier).toMatchObject({
  starter: "not_included",
  growth: "not_included",
  audit_ready: "not_included",
  enterprise: "included",
});

expect(portalRow?.byTier.audit_ready).toBe("included");
expect(subrecipientRow?.byTier.audit_ready).toBe("included");
expect(indirectCostRow?.byTier.audit_ready).toBe("included");
expect(compliancePackRow?.byTier.growth).toBe("included");
```

- [ ] **Step 2: Run matrix tests**

Run:

```powershell
pnpm --filter @grantpipe/site test -- tier-alignment.test.ts feature-comparison-matrix-source.test.ts
pnpm --filter @grantpipe/shared test -- pricing.test.ts
```

Expected: FAIL if the matrix or source tests still assume Audit-Ready includes cross-entity reporting.

- [ ] **Step 3: Update labels only where needed**

Keep these labels plain and specific:

- `Cross-entity report builder` -> Enterprise only.
- `Auditor & Funder Portal` -> Audit-Ready and Enterprise.
- `Subrecipient monitoring` -> Audit-Ready and Enterprise.
- `Indirect cost rate rules` -> Audit-Ready and Enterprise.
- `Compliance report pack` -> Growth and above.

- [ ] **Step 4: Run tests**

Run the same commands from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/pricing.ts packages/shared/src/pricing.test.ts apps/site/src/tier-alignment.test.ts apps/site/src/feature-comparison-matrix-source.test.ts apps/site/src/components/feature-comparison-matrix.astro
git commit -m "fix(site): align feature matrix with plan packaging"
```

### Task 7: Add the cross-cutting catalog/entitlement contract

**Files:**

- Modify: `packages/shared/src/pricing.test.ts`
- Modify if better fit: `apps/site/src/tier-alignment.test.ts`

- [ ] **Step 1: Add one cross-cutting contract**

This guards the structured catalog only. The free-text corpus is guarded by the
sweep in Task 8 (Phase 5). Add a test named:

```ts
it("keeps pricing packaging decision aligned across catalog and entitlements", () => {
  const starterText = getPricingPlan("starter").features.join(" ");
  const growthText = getPricingPlan("growth").features.join(" ");
  const auditText = getPricingPlan("audit_ready").features.join(" ");
  const enterpriseText = getPricingPlan("enterprise").features.join(" ");

  expect(PLAN_ENTITLEMENTS.starter.hasRestrictionLifecycle).toBe(true);
  expect(starterText).toMatch(/Restriction|restricted/i);

  expect(PLAN_ENTITLEMENTS.growth.hasComplianceReportPack).toBe(true);
  expect(getPricingPlan("growth").highlighted).toBe(true);
  expect(growthText).toMatch(/Compliance report pack/i);

  expect(PLAN_ENTITLEMENTS.audit_ready.hasAuditorFunderPortal).toBe(true);
  expect(auditText).toMatch(/Auditor & Funder Portal/i);

  expect(PLAN_ENTITLEMENTS.audit_ready.hasCrossEntityReportBuilder).toBe(false);
  expect(auditText).not.toMatch(/Cross-entity report builder/i);
  expect(PLAN_ENTITLEMENTS.enterprise.hasCrossEntityReportBuilder).toBe(true);
  expect(enterpriseText).toMatch(/Cross-entity report builder/i);
});
```

- [ ] **Step 2: Run tests**

Run:

```powershell
pnpm --filter @grantpipe/shared test -- pricing.test.ts
pnpm --filter @grantpipe/site test -- tier-alignment.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```powershell
git add packages/shared/src/pricing.test.ts apps/site/src/tier-alignment.test.ts
git commit -m "test: guard GrantPipe packaging boundaries"
```

---

## Phase 5 - Corpus-Wide Tier-Claim Sweep and Content Fixes

> **Approach change.** Do not hand-enumerate which marketing files mention a
> tier. The goal is that the packaging story is correct on _every_ surface and
> _stays_ correct as new content is added. A curated file list cannot deliver
> that — it misses surfaces today (listicles, comparisons, alternatives,
> city-pages, guides) and silently misses any surface added tomorrow. Instead,
> add one source-of-truth-derived sweep over the whole content corpus, let its
> red output reveal the real file list, and fix every file it flags.
>
> The mechanism already exists: `apps/site/src/content-tests/grantpipe-tier-copy-contract.test.ts`
> already recursively walks the entire content root (`listMarkdownFiles(contentRoot)`,
> all 17 subdirectories) and all `.astro` pages (`listAstroFiles`), collecting
> violations across the corpus. Extend that file; do not invent a new walker.

### Task 8: Add the corpus-wide tier-claim sweep

**Files:**

- Modify: `apps/site/src/content-tests/grantpipe-tier-copy-contract.test.ts`

- [ ] **Step 1: Add a source-derived boundary sweep**

Derive the correct tier and the forbidden lower tiers from the source of truth
(`getMinimumPlanForFeatures` plus the tier order read off the already-ordered
`PLAN_CATALOG`) so the sweep keeps matching after copy is reworded. There is no
`PLAN_TIER_ORDER` export — read the order from `PLAN_CATALOG`. Add to the
existing `describe("GrantPipe tier-copy contract", ...)` block, reusing the
already-built `allMarkdown` list and the `allAstro` list:

```ts
// A capability must never be advertised on a tier below its minimum plan.
// Correct tier and forbidden tiers are derived, not hardcoded, so the rule
// survives future repackaging.
const BOUNDARY_CAPABILITIES = [
  {
    feature: "hasCrossEntityReportBuilder",
    aliases: [/cross-?entity report builder/i, /\breport builder\b/i],
  },
  { feature: "hasAccountingIntegrations", aliases: [/quickbooks/i] },
  {
    feature: "hasProposalReportDrafting",
    aliases: [/proposal (?:and|&|\/) report drafting/i, /report drafting assistant/i],
  },
  { feature: "hasAuditorFunderPortal", aliases: [/auditor (?:and|&) funder portal/i] },
  { feature: "hasSubrecipientMonitoring", aliases: [/subrecipient monitoring/i] },
] as const;

const TIER_ORDER = PLAN_CATALOG.map((plan) => plan.tier); // ordered: starter..enterprise
const TIER_WORD: Record<string, RegExp> = {
  starter: /\bstarter\b/i,
  growth: /\bgrowth\b/i,
  audit_ready: /\baudit[- ]ready\b/i,
  enterprise: /\benterprise\b/i,
};

it("never advertises a capability below its minimum plan in any content surface", () => {
  const violations: string[] = [];
  const allSurfaces = [...allMarkdown, ...allAstro];

  for (const { feature, aliases } of BOUNDARY_CAPABILITIES) {
    const minPlan = getMinimumPlanForFeatures([feature]); // e.g. "enterprise"
    const forbidden = TIER_ORDER.filter(
      (tier) => TIER_ORDER.indexOf(tier) < TIER_ORDER.indexOf(minPlan),
    );

    for (const file of allSurfaces) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        if (!aliases.some((rx) => rx.test(line))) return;
        for (const tier of forbidden) {
          if (TIER_WORD[tier].test(line)) {
            violations.push(
              `${file}:${i + 1} - ${feature} (min plan ${minPlan}) advertised on ${tier}\n  ${line.trim()}`,
            );
          }
        }
      });
    }
  }

  expect(violations).toEqual([]);
});
```

Import `getMinimumPlanForFeatures` from `../../../../packages/shared/src/pricing`
alongside the existing `PLAN_CATALOG` import. `feature` values are
`PremiumFeatureKey`s, so type `BOUNDARY_CAPABILITIES[number]["feature"]`
accordingly.

Tune each alias so a sentence like "moved from Audit-Ready to Enterprise" (which
correctly names the new tier) does not trip the rule — prefer anchoring on
availability phrasing (`on the X plan`, `included in X`, `X and Enterprise
plans`) if the simple co-occurrence rule produces false positives.

- [ ] **Step 2: Run the sweep — let red reveal the file list**

Run:

```powershell
pnpm --filter @grantpipe/site test -- content-tests/grantpipe-tier-copy-contract.test.ts
```

Expected: FAIL with a violations list. **That list is the authoritative set of
files to fix** — it will include `features/cross-entity-report-builder.md` and
should surface every other stale surface (listicles, comparisons, alternatives,
city-pages, guides, vertical-pages) the old hand-enumerated plan missed. Record
the full list before editing.

- [ ] **Step 3: Commit the failing guard**

```powershell
git add apps/site/src/content-tests/grantpipe-tier-copy-contract.test.ts
git commit -m "test(site): sweep all content for tier-claim drift"
```

### Task 9: Fix every surface the sweep flags

**Files:**

- Modify: every file in the Task 8 Step 2 violations list. Known certain hits:
  - `packages/shared/src/knowledge/marketing/content/features/cross-entity-report-builder.md` (move from Audit-Ready to Enterprise; the FAQ answer currently reads "Cross-Entity Report Builder is on Audit-Ready and Enterprise plans.")
  - `packages/shared/src/knowledge/marketing/content/features/proposal-report-drafting-assistant.md` (Growth+, not Audit-Ready+)
- Modify: `.agents/product-marketing-context.md` (legacy pricing/tier notes — outside the content root, so fix directly even though the sweep does not cover it; or retire it from source of truth)
- Verify only (sweep proves correct, no edit if green): `auditor-funder-portal.md`, `subrecipient-monitoring.md`, `audit-readiness-score-binder-starter.md`

- [ ] **Step 1: Fix each flagged file with canonical wording**

Walk the violations list top to bottom. For each file, make only
tier-availability and buying-guidance edits using current source-of-truth
boundaries:

- Starter: restriction lifecycle basics, capped AI intake, capped Ask-Your-Ledger.
- Growth: QuickBooks read-only sync, compliance report pack, proposal/report drafting, unlimited AI.
- Audit-Ready: portal, evidence packages, guided onboarding, subrecipient, indirect-cost depth.
- Enterprise: cross-entity report builder, multi-entity consolidation.

Do not add new claims, proof, testimonials, unsupported integrations (SSO,
SAM.gov, FFATA helpers, single-audit workpaper export, team-based permissions),
or hardcoded prices.

- [ ] **Step 2: Copy gate (after editing, before re-locking)**

For every file touched, run `humanizer`, then `third-grade-copy`, then a
zero-lies check against `PLAN_CATALOG` and `PLAN_ENTITLEMENTS`. The sweep keys
on capability aliases and tier words, not on exact marketing phrasing, so the
copy gate is free to reword sentences without breaking the guard.

- [ ] **Step 3: Regenerate knowledge artifacts (once, after all content edits)**

Run:

```powershell
pnpm knowledge:generate
pnpm knowledge:check
```

Expected: generated files under `packages/shared/src/knowledge/generated/` are
current and the check passes. Regenerate only here — not per file — so a single
generated snapshot reflects all content edits.

- [ ] **Step 4: Run the sweep plus feature-page contracts to green**

Run:

```powershell
pnpm --filter @grantpipe/site test -- content-tests/grantpipe-tier-copy-contract.test.ts feature-landing-pages-contract.test.ts
```

Expected: PASS. Zero violations across the whole corpus.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/src/knowledge/marketing/content packages/shared/src/knowledge/generated/indexes.ts packages/shared/src/knowledge/generated/marketing-knowledge.json .agents/product-marketing-context.md apps/site/src/feature-landing-pages-contract.test.ts
git commit -m "fix(content): align every tier claim with packaging boundaries"
```

---

## Phase 6 - Pricing Cards, Product Narratives, and AI-SDR Context

### Task 10: Align site FAQ, pricing cards, and sticky CTAs

**Files:**

- Modify: `apps/site/src/config/site.ts`
- Modify: `apps/site/src/config/site.test.ts`
- Verify/modify: `apps/site/src/components/pricing-plan-cards.astro`
- Modify: `apps/site/src/components/pricing-plan-cards-source.test.ts`
- Modify: `apps/site/src/pricing-page-seo-contract.test.ts`
- Modify: `apps/site/src/pricing-sticky-cta-source.test.ts`

- [ ] **Step 1: Add failing source tests**

Assert:

- Site FAQ copy says Starter owns restricted-fund basics/lifecycle, Growth owns QuickBooks read-only sync, and Audit-Ready owns evidence/portal depth.
- Growth is marked as the recommended/default plan.
- Starter card has concrete value language.
- Audit-Ready card emphasizes external review, evidence packages, guided onboarding, subrecipient, and indirect-cost depth.
- Enterprise custom path is where cross-entity reporting appears.
- No card says Audit-Ready includes cross-entity report builder.
- No source test still says QuickBooks is Audit-Ready and Enterprise only.

- [ ] **Step 2: Run pricing card tests**

Run:

```powershell
pnpm --filter @grantpipe/site test -- config/site.test.ts pricing-plan-cards-source.test.ts pricing-page-seo-contract.test.ts pricing-sticky-cta-source.test.ts
```

Expected: FAIL on stale source/copy.

- [ ] **Step 3: Update source through shared catalog where possible**

Prefer changing `PLAN_CATALOG` over hardcoding component-only copy. Preserve pill button classes.

- [ ] **Step 4: Copy gate and zero-lies check**

- [ ] **Step 5: Run tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/site/src/config/site.ts apps/site/src/config/site.test.ts apps/site/src/components/pricing-plan-cards.astro apps/site/src/components/pricing-plan-cards-source.test.ts apps/site/src/pricing-page-seo-contract.test.ts apps/site/src/pricing-sticky-cta-source.test.ts
git commit -m "fix(site): align pricing FAQ and cards with package boundaries"
```

### Task 11: Align product capability narratives

**Files:**

- Modify: `apps/site/src/lib/marketed-capabilities.ts`
- Modify: `apps/site/src/product-page-contract.test.ts`
- Modify: `apps/site/src/product-proof-section-contract.test.ts`
- Modify: `apps/site/src/feature-landing-pages-contract.test.ts`

- [ ] **Step 1: Add failing narrative tests**

Assert:

- Compliance narrative maps to Growth as the common day-to-day compliance plan.
- Accounting/audit narrative maps to Audit-Ready only for external review and audit-depth features.
- Migration/guided onboarding references Audit-Ready and Enterprise, not Growth.
- Cross-entity report builder and multi-entity consolidation are Enterprise/custom-path concepts.
- The existing line "Growth and Audit-Ready plans include the rollout help teams need" is removed or changed so it does not imply guided onboarding on Growth.

- [ ] **Step 2: Run narrative tests**

Run:

```powershell
pnpm --filter @grantpipe/site test -- product-page-contract.test.ts product-proof-section-contract.test.ts feature-landing-pages-contract.test.ts
```

Expected: FAIL if stale narrative mapping remains.

- [ ] **Step 3: Update narratives**

Do not invent proof, metrics, usage counts, nonprofit experience, testimonials, or unsupported customer claims. If existing sample UI figures remain, keep them clearly illustrative under current patterns.

- [ ] **Step 4: Copy gate**

- [ ] **Step 5: Run tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/site/src/lib/marketed-capabilities.ts apps/site/src/product-page-contract.test.ts apps/site/src/product-proof-section-contract.test.ts apps/site/src/feature-landing-pages-contract.test.ts
git commit -m "fix(site): align product narratives with tier packaging"
```

### Task 12: Align public AI-SDR context

**Files:**

- Modify: `packages/shared/src/public-kb/ai-sdr-context.ts`
- Modify: `packages/shared/src/public-kb/ai-sdr-context.test.ts`
- Modify: `apps/site/src/lib/ai-sdr/context.test.ts`
- Verify: `apps/site/src/lib/ai-sdr/context.ts`

- [ ] **Step 1: Add failing public-context tests**

Assert AI-SDR plan context says:

- Starter is standalone and includes basic compliance tracking.
- Growth is the default for most day-to-day grant compliance.
- Audit-Ready is for external review and audit readiness.
- Enterprise owns cross-entity reporting.
- No promo code leaks into signup or context URLs.

- [ ] **Step 2: Run tests**

Run:

```powershell
pnpm --filter @grantpipe/shared test -- public-kb/ai-sdr-context.test.ts
pnpm --filter @grantpipe/site test -- lib/ai-sdr/context.test.ts
```

Expected: FAIL if stale plan context remains.

- [ ] **Step 3: Update the context builder**

Use shared pricing/catalog data where available. Keep signed context route behavior unchanged.

- [ ] **Step 4: Copy gate**

- [ ] **Step 5: Run tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/shared/src/public-kb/ai-sdr-context.ts packages/shared/src/public-kb/ai-sdr-context.test.ts apps/site/src/lib/ai-sdr/context.test.ts
git commit -m "fix(shared): align AI-SDR plan context"
```

---

## Phase 7 - In-App Billing and Trial Copy

### Task 13: Align billing plan chooser copy

**Files:**

- Modify: `apps/web/src/components/settings-billing-panel.tsx`
- Modify: `apps/web/src/components/settings-billing-panel.test.tsx`
- Modify if stale: `apps/web/src/routes/_authenticated/confirm-plan.tsx`
- Modify if stale: `apps/web/src/routes/_authenticated/confirm-plan.test.tsx`
- Modify if stale: `apps/web/src/lib/billing-checkout-copy.ts`
- Modify if stale: `apps/web/src/lib/billing-checkout-copy.test.ts`

- [ ] **Step 1: Add failing billing tests**

Assert:

- Starter card does not read as a crippled teaser.
- Growth card is the recommended/default day-to-day compliance plan.
- Audit-Ready card emphasizes external review/audit readiness.
- Cross-entity report builder appears only on Enterprise/custom path copy, if shown at all.
- QuickBooks and proposal/report drafting are Growth features.

- [ ] **Step 2: Run billing tests**

Run:

```powershell
pnpm --filter @grantpipe/web test -- settings-billing-panel.test.tsx confirm-plan.test.tsx billing-checkout-copy.test.ts
```

Expected: FAIL if stale copy remains.

- [ ] **Step 3: Update UI copy**

Prefer `getPricingPlan(tier)` and shared helpers over duplicated literals. Keep all button-like controls pill-shaped.

- [ ] **Step 4: Copy gate**

- [ ] **Step 5: Run tests**

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/components/settings-billing-panel.tsx apps/web/src/components/settings-billing-panel.test.tsx apps/web/src/routes/_authenticated/confirm-plan.tsx apps/web/src/routes/_authenticated/confirm-plan.test.tsx apps/web/src/lib/billing-checkout-copy.ts apps/web/src/lib/billing-checkout-copy.test.ts
git commit -m "fix(web): align billing copy with plan packaging"
```

---

## Phase 8 - Package Contract and Full Verification

### Task 14: Keep live E2E package command contract unchanged

**Files:**

- Verify: `scripts/live-e2e-package-contract.test.ts`

- [ ] **Step 1: Run package contract**

Run:

```powershell
pnpm exec vitest run scripts/live-e2e-package-contract.test.ts --config scripts/vitest.config.ts
```

Expected: PASS. No implementation change expected.

### Task 15: Run targeted package tests

Run each command and fix failures:

- [ ] `pnpm --filter @grantpipe/shared test -- constants/index.test.ts pricing.test.ts public-kb/ai-sdr-context.test.ts`
- [ ] `pnpm --filter @grantpipe/api test -- report-builder/routes.test.ts`
- [ ] `pnpm --filter @grantpipe/web test -- reports/builder.test.tsx reports/index.test.tsx settings-billing-panel.test.tsx confirm-plan.test.tsx billing-checkout-copy.test.ts`
- [ ] `pnpm --filter @grantpipe/site test -- config/site.test.ts tier-alignment.test.ts feature-landing-pages-contract.test.ts feature-comparison-matrix-source.test.ts pricing-plan-cards-source.test.ts pricing-page-seo-contract.test.ts pricing-sticky-cta-source.test.ts lib/ai-sdr/context.test.ts product-page-contract.test.ts product-proof-section-contract.test.ts content-tests/grantpipe-tier-copy-contract.test.ts`
- [ ] `pnpm knowledge:check`

Expected: all PASS.

### Task 16: Run full gates

- [ ] Run: `turbo typecheck`
- [ ] Run: `turbo test`
- [ ] Run: `turbo test:coverage`
- [ ] Run: `turbo lint`
- [ ] Run: `pnpm format:check`
- [ ] Run: `turbo build`

Expected: all PASS, with at least 95% coverage on every touched file per repo policy.

---

## Phase 9 - Review, Merge, Deploy

### Task 17: Review and fix

- [ ] Get a code review through the active runtime's permitted review path.
- [ ] Fix every finding.
- [ ] Re-run targeted tests from Task 15.
- [ ] Re-run full gates from Task 16.

### Task 18: Merge and deploy

- [ ] Merge the worktree branch to `master`.
- [ ] Remove the worktree.
- [ ] Deploy affected apps:
  - `pnpm run deploy:api` because report-builder API gate copy/behavior changes.
  - `pnpm run deploy:web` because report-builder and billing UI copy changes.
  - `pnpm run deploy:site` because pricing, feature, product, and AI-SDR public context changes.
- [ ] Live smoke:
  - `curl.exe -I https://grantpipe.com/pricing/`
  - `curl.exe -I https://app.grantpipe.com`
  - `curl.exe https://app.grantpipe.com/api/health`
- [ ] Verify production pricing page shows:
  - Starter as credible standalone.
  - Growth as recommended/default for day-to-day compliance.
  - Audit-Ready as external-review/audit-readiness.
  - Enterprise as true cross-entity reporting/custom path.

---

## Self-Review Checklist

- [ ] Starter remains credible and standalone.
- [ ] Growth is the default for day-to-day grant compliance.
- [ ] Audit-Ready owns Auditor & Funder Portal, guided onboarding, evidence packages, subrecipient monitoring, indirect-cost depth, payment evidence, and audit views.
- [ ] Cross-entity report builder is Enterprise only in entitlements, API gates, app copy, marketing copy, AI-SDR context, and feature content.
- [ ] QuickBooks read-only sync and proposal/report drafting are consistently Growth+.
- [ ] No user-facing copy claims unsupported features, integrations, prices, proof, testimonials, guarantees, or nonprofit operator experience.
- [ ] No hardcoded GrantPipe prices were introduced outside existing pricing helpers.
- [ ] All changed user-facing copy passed `humanizer`, then `third-grade-copy`, then zero-lies review.
- [ ] Targeted tests and full gates pass.
