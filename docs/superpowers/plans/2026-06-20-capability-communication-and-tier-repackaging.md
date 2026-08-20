# Capability Communication & Tier Repackaging — Implementation Plan

> **Superseded on 2026-07-03 for external accounting integrations.** QuickBooks
> sync is unavailable on every plan. Ignore all QuickBooks entitlement, sync,
> ingestion, and connector instructions below. The supported QuickBooks path is
> manual CSV/opening-balance import, kept separate from the general ledger.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repackage the three paid tiers so Starter is genuinely workable, Growth is the default for most grant-funded nonprofits, and Audit-Ready stays the audit-proof premium — and surface GrantPipe's capabilities (especially AI) on the marketing and in-app surfaces that matter. Prices and grant caps are fixed.

**Architecture:** Entitlements are a config map in `packages/shared`. We (1) re-allocate boolean entitlements, (2) add two numeric per-feature monthly AI caps plus a new `ai_usage_events` metering table and a shared usage helper, (3) enforce caps at the two AI service boundaries (Award Intake, Ask-Your-Ledger) with a typed `ai_usage_cap_reached` error, (4) map that error to a friendly in-app upgrade prompt, (5) rewrite the pricing catalog and marketing/in-app copy compliance-led with AI as "AI-assisted, human-confirmed." All user-facing copy passes `humanizer` → `third-grade-copy` → zero-lies check.

**Tech Stack:** TypeScript, Drizzle ORM + Neon Postgres (`packages/db`), Hono on Cloudflare Workers (`apps/api`), React 19 + TanStack (`apps/web`), Astro 5 (`apps/site`), Vitest, PostHog, Sentry.

---

## Pre-flight (worktree)

- [ ] **Create the worktree** via `superpowers:using-git-worktrees` under `.worktrees/` (e.g. `.worktrees/packaging-repackage`), branch `feat/tier-repackaging-comms`. Run `git pull` on master first. All tasks below run inside the worktree.

## File Structure

| File                                                          | Responsibility                                                                                 | Action             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| `packages/shared/src/constants/index.ts`                      | `PlanEntitlements` type + caps fields, `PLAN_ENTITLEMENTS` re-allocation, cap accessor helpers | Modify             |
| `packages/shared/src/constants/index.test.ts`                 | Entitlement + cap contract tests                                                               | Modify             |
| `packages/shared/src/pricing.ts`                              | `PLAN_CATALOG` bullets/descriptions; `AI_FEATURE_CAPS` derived copy helper                     | Modify             |
| `packages/shared/src/pricing.test.ts`                         | Catalog contract tests                                                                         | Modify             |
| `packages/shared/src/errors/ai-usage.ts`                      | `ai_usage_cap_reached` error code + payload type + `nextPlanAbove*Cap` helper                  | Create             |
| `packages/db/src/schema/ai-usage-events.ts`                   | `ai_usage_events` table                                                                        | Create             |
| `packages/db/src/schema/index.ts`                             | export new table                                                                               | Modify             |
| `packages/db/migrations/NNNN_*.sql`                           | generated migration                                                                            | Create (generated) |
| `apps/api/src/lib/ai-usage.ts`                                | `getMonthlyAiUsage`, `recordAiUsage`, `assertAiUsageWithinCap`                                 | Create             |
| `apps/api/src/lib/ai-usage.test.ts`                           | metering + enforcement tests                                                                   | Create             |
| `apps/api/src/domains/document-extractions/service.ts`        | enforce Award Intake cap at upload; record usage                                               | Modify             |
| `apps/api/src/domains/ledger-assistant/service.ts`            | lower gate to Starter; enforce cap; record usage                                               | Modify             |
| `apps/web/src/lib/api-errors.ts` (or existing error util)     | map `ai_usage_cap_reached` → typed client error                                                | Modify             |
| `apps/web/src/components/ai/ai-usage-cap-dialog.tsx`          | friendly upgrade prompt                                                                        | Create             |
| `apps/web/src/components/billing/trial-upgrade-card.tsx`      | new unlock copy                                                                                | Modify             |
| `apps/web/src/components/settings/settings-billing-panel.tsx` | new unlock copy                                                                                | Modify             |
| `apps/site/src/pages/index.astro`                             | AI capability band + proof points                                                              | Modify             |
| `apps/site/src/pages/pricing.astro`                           | identity sub-headers + feature matrix + AI cap rows                                            | Modify             |
| `apps/site/src/pages/product.astro`                           | AI capability narratives                                                                       | Modify             |
| `apps/site/src/lib/marketed-capabilities.ts`                  | add AI capabilities                                                                            | Modify             |
| `packages/shared/src/positioning.ts`                          | tier-identity consistency                                                                      | Modify             |
| `apps/site/src/config/site.ts`                                | tier identity strings                                                                          | Modify             |
| `apps/site/src/*contract.test.ts`                             | entitlement/feature-page contract tests                                                        | Modify             |

---

## Phase 1 — Shared entitlements + AI caps

### Task 1: Add AI cap fields to the entitlement type

**Files:**

- Modify: `packages/shared/src/constants/index.ts:573-608` (`PlanEntitlements`), `:610-645` (`PLAN_ENTITLEMENT_LABELS`)
- Test: `packages/shared/src/constants/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// in index.test.ts
import { PLAN_ENTITLEMENTS } from "./index";

describe("AI monthly caps", () => {
  it("ladders award intake cap: starter finite, growth+ unlimited", () => {
    expect(PLAN_ENTITLEMENTS.starter.awardIntakeMonthlyCap).toBe(5);
    expect(PLAN_ENTITLEMENTS.growth.awardIntakeMonthlyCap).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_ENTITLEMENTS.audit_ready.awardIntakeMonthlyCap).toBe(Number.POSITIVE_INFINITY);
    expect(PLAN_ENTITLEMENTS.enterprise.awardIntakeMonthlyCap).toBe(Number.POSITIVE_INFINITY);
  });
  it("ladders ask-your-ledger cap: starter 20, growth+ unlimited", () => {
    expect(PLAN_ENTITLEMENTS.starter.askYourLedgerMonthlyCap).toBe(20);
    expect(PLAN_ENTITLEMENTS.growth.askYourLedgerMonthlyCap).toBe(Number.POSITIVE_INFINITY);
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm --filter @grantpipe/shared test -- index.test.ts`
Expected: FAIL (`awardIntakeMonthlyCap` is undefined).

- [ ] **Step 3: Add the two numeric fields to `PlanEntitlements`**

```ts
// near the existing plan capability fields
awardIntakeMonthlyCap: number;
askYourLedgerMonthlyCap: number;
```

Add labels in `PLAN_ENTITLEMENT_LABELS`:

```ts
  awardIntakeMonthlyCap: "AI Award Document Intake (per month)",
  askYourLedgerMonthlyCap: "Ask-Your-Ledger questions (per month)",
```

- [ ] **Step 4: Set values on every tier in `PLAN_ENTITLEMENTS`**

starter: `awardIntakeMonthlyCap: 5, askYourLedgerMonthlyCap: 20,`
growth / audit_ready / enterprise: both `Number.POSITIVE_INFINITY,`

- [ ] **Step 5: Run, expect pass.** Run: `pnpm --filter @grantpipe/shared test -- index.test.ts` → PASS.

- [ ] **Step 6: Commit.** `git commit -am "feat(shared): add per-feature AI monthly cap entitlements"`

### Task 2: Re-allocate boolean entitlements

**Files:**

- Modify: `packages/shared/src/constants/index.ts:648-755` (`starter`, `growth`)
- Test: `packages/shared/src/constants/index.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
describe("repackaged entitlements", () => {
  it("starter is workable: reminders, restriction lifecycle, alerts, entry AI", () => {
    const s = PLAN_ENTITLEMENTS.starter;
    expect(s.hasAutomationEmails).toBe(true);
    expect(s.hasRestrictionLifecycle).toBe(true);
    expect(s.hasGrantBudgetAlerts).toBe(true);
    expect(s.hasAwardDocumentIntake).toBe(true);
    expect(s.hasAskYourLedger).toBe(true);
    // fences still closed
    expect(s.hasComplianceReportPack).toBe(false);
    expect(s.hasGrantBudgetExports).toBe(false);
    expect(s.hasPlannedExpenses).toBe(false);
    expect(s.hasGrantBudgetAiExtraction).toBe(false);
    expect(s.hasAccountingIntegrations).toBe(false);
    expect(s.hasProposalReportDrafting).toBe(false);
    expect(s.activeGrantCap).toBe(10);
  });
  it("growth adds QBO sync, drafting, uncapped AI; default tier", () => {
    const g = PLAN_ENTITLEMENTS.growth;
    expect(g.hasAccountingIntegrations).toBe(true);
    expect(g.hasProposalReportDrafting).toBe(true);
    expect(g.activeGrantCap).toBe(30);
    // audit fences still closed at growth
    expect(g.hasRestrictionEvidencePackage).toBe(false);
    expect(g.hasAuditorFunderPortal).toBe(false);
    expect(g.hasSubrecipientMonitoring).toBe(false);
    expect(g.hasAccountingAnomalyDetector).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail.** Run: `pnpm --filter @grantpipe/shared test -- index.test.ts` → FAIL.

- [ ] **Step 3: Edit `PLAN_ENTITLEMENTS.starter`** — set these `true` (were `false`): `hasAutomationEmails`, `hasRestrictionLifecycle`, `hasGrantBudgetAlerts`, `hasAwardDocumentIntake`, `hasAskYourLedger`. Leave all other starter flags unchanged.

- [ ] **Step 4: Edit `PLAN_ENTITLEMENTS.growth`** — set these `true` (were `false`): `hasAccountingIntegrations`, `hasProposalReportDrafting`. Leave all other growth flags unchanged.

- [ ] **Step 5: Run, expect pass** including any existing `canUseAskYourLedger`/`getMinimumPlanForFeatures` tests that now change. Update those expectations:
  - `constants/index.test.ts:371-372` — `canUseAskYourLedger("starter")` and `("growth")` are now `true`.
  - `pricing.test.ts:614,619` — re-derive: `getMinimumPlanForFeatures(["hasAccountingIntegrations"])` is now `"growth"`; `getMinimumPlanForFeatures(["hasAwardDocumentIntake"])` is now `"starter"`.

Run: `pnpm --filter @grantpipe/shared test` → PASS.

- [ ] **Step 6: Commit.** `git commit -am "feat(shared): repackage Starter/Growth entitlement allocation"`

---

## Phase 2 — DB metering table

### Task 3: Add `ai_usage_events` table

**Files:**

- Create: `packages/db/src/schema/ai-usage-events.ts`
- Modify: `packages/db/src/schema/index.ts` (export)
- Test: follow existing schema test pattern if present; otherwise covered by API tests.

Decision (resolves spec open item): a single uniform metering table. One row per billable AI action. Award Intake dedupes by `referenceId = extractionId`; Ask-Your-Ledger writes one row per successful call (`referenceId` null).

- [ ] **Step 1: Create the table** (match existing schema conventions — `org_id`, `created_at`, soft-delete NOT needed for an append-only event log):

```ts
import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(), // "award_intake" | "ask_your_ledger"
    referenceId: text("reference_id"), // extractionId for award_intake; null otherwise
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgFeatureCreatedIdx: index("ai_usage_events_org_feature_created_idx").on(
      t.orgId,
      t.feature,
      t.createdAt,
    ),
    dedupeIdx: uniqueIndex("ai_usage_events_dedupe_idx")
      .on(t.orgId, t.feature, t.referenceId)
      .where(sql`reference_id is not null`),
  }),
);
```

(Import `sql` from `drizzle-orm`; verify the org table import name against `packages/db/src/schema/index.ts`.)

- [ ] **Step 2: Export** it from `packages/db/src/schema/index.ts` following the existing export style.

- [ ] **Step 3: Generate migration.** Run: `pnpm --filter @grantpipe/db generate`. Confirm a new `NNNN_*.sql` creating `ai_usage_events` with both indexes.

- [ ] **Step 4: Apply locally.** Run: `pnpm --filter @grantpipe/db migrate`. Expected: applies cleanly.

- [ ] **Step 5: Commit.** `git commit -am "feat(db): add ai_usage_events metering table"`

---

## Phase 3 — Shared cap error + API metering helper

### Task 4: Shared `ai_usage_cap_reached` error contract

**Files:**

- Create: `packages/shared/src/errors/ai-usage.ts`
- Modify: `packages/shared/src/index.ts` (export)
- Test: `packages/shared/src/errors/ai-usage.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { AI_USAGE_CAP_REACHED, nextPlanAboveCap, type AiCappedFeature } from "./ai-usage";

describe("ai usage cap contract", () => {
  it("exposes a stable error code", () => {
    expect(AI_USAGE_CAP_REACHED).toBe("ai_usage_cap_reached");
  });
  it("finds the next plan whose cap is higher for award intake", () => {
    expect(nextPlanAboveCap("award_intake", "starter")).toBe("growth");
  });
  it("finds the next plan for ask your ledger", () => {
    expect(nextPlanAboveCap("ask_your_ledger", "starter")).toBe("growth");
  });
  it("returns null when already uncapped", () => {
    expect(nextPlanAboveCap("award_intake", "growth")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect fail.** Run: `pnpm --filter @grantpipe/shared test -- ai-usage` → FAIL.

- [ ] **Step 3: Implement**

```ts
import { PLAN_TIERS, PLAN_ENTITLEMENTS, type PlanTier } from "../constants";

export const AI_USAGE_CAP_REACHED = "ai_usage_cap_reached" as const;

export type AiCappedFeature = "award_intake" | "ask_your_ledger";

const CAP_FIELD: Record<AiCappedFeature, "awardIntakeMonthlyCap" | "askYourLedgerMonthlyCap"> = {
  award_intake: "awardIntakeMonthlyCap",
  ask_your_ledger: "askYourLedgerMonthlyCap",
};

export type AiUsageCapPayload = {
  error: typeof AI_USAGE_CAP_REACHED;
  feature: AiCappedFeature;
  cap: number;
  used: number;
  currentPlan: PlanTier;
  upgradeToPlan: PlanTier | null;
};

export function capForFeature(feature: AiCappedFeature, plan: PlanTier): number {
  return PLAN_ENTITLEMENTS[plan][CAP_FIELD[feature]];
}

export function nextPlanAboveCap(feature: AiCappedFeature, plan: PlanTier): PlanTier | null {
  const current = capForFeature(feature, plan);
  if (!Number.isFinite(current)) return null;
  const startIdx = PLAN_TIERS.indexOf(plan);
  for (let i = startIdx + 1; i < PLAN_TIERS.length; i++) {
    const tier = PLAN_TIERS[i]!;
    if (capForFeature(feature, tier) > current) return tier;
  }
  return null;
}
```

Export both from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run, expect pass.** Run: `pnpm --filter @grantpipe/shared test -- ai-usage` → PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(shared): ai_usage_cap_reached error contract + nextPlanAboveCap"`

### Task 5: API metering helper

**Files:**

- Create: `apps/api/src/lib/ai-usage.ts`
- Test: `apps/api/src/lib/ai-usage.test.ts`

Functions:

- `monthStartUtc(now: Date): Date` — first instant of `now`'s UTC month.
- `getMonthlyAiUsage(db, { orgId, feature, now }): Promise<number>` — count `ai_usage_events` for org+feature with `createdAt >= monthStartUtc(now)`.
- `recordAiUsage(db, { orgId, feature, referenceId?, now? }): Promise<void>` — insert; on the dedupe unique violation for award_intake, swallow (idempotent).
- `assertAiUsageWithinCap(db, { orgId, feature, planTier, now }): Promise<void>` — resolve cap via `capForFeature`; if finite and `used >= cap`, throw an error carrying the `AiUsageCapPayload` (status 402) built with `nextPlanAboveCap`.

- [ ] **Step 1: Write failing tests** (use the existing API DB test harness — see `document-extractions/service.test.ts` for the in-memory/Neon test pattern):

```ts
describe("getMonthlyAiUsage", () => {
  it("counts only current-month events for the feature", async () => {
    await recordAiUsage(db, {
      orgId,
      feature: "ask_your_ledger",
      now: new Date("2026-06-10T00:00:00Z"),
    });
    await recordAiUsage(db, {
      orgId,
      feature: "ask_your_ledger",
      now: new Date("2026-05-30T00:00:00Z"),
    });
    const used = await getMonthlyAiUsage(db, {
      orgId,
      feature: "ask_your_ledger",
      now: new Date("2026-06-20T00:00:00Z"),
    });
    expect(used).toBe(1);
  });
});

describe("assertAiUsageWithinCap", () => {
  it("throws ai_usage_cap_reached at the cap on starter", async () => {
    for (let i = 0; i < 20; i++) {
      await recordAiUsage(db, {
        orgId,
        feature: "ask_your_ledger",
        now: new Date("2026-06-01T00:00:00Z"),
      });
    }
    await expect(
      assertAiUsageWithinCap(db, {
        orgId,
        feature: "ask_your_ledger",
        planTier: "starter",
        now: new Date("2026-06-20T00:00:00Z"),
      }),
    ).rejects.toMatchObject({
      body: { error: "ai_usage_cap_reached", upgradeToPlan: "growth", used: 20, cap: 20 },
    });
  });
  it("never throttles uncapped growth", async () => {
    await expect(
      assertAiUsageWithinCap(db, {
        orgId,
        feature: "ask_your_ledger",
        planTier: "growth",
        now: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
  it("dedupes award_intake by referenceId", async () => {
    await recordAiUsage(db, {
      orgId,
      feature: "award_intake",
      referenceId: "ext-1",
      now: new Date("2026-06-01T00:00:00Z"),
    });
    await recordAiUsage(db, {
      orgId,
      feature: "award_intake",
      referenceId: "ext-1",
      now: new Date("2026-06-02T00:00:00Z"),
    });
    expect(
      await getMonthlyAiUsage(db, {
        orgId,
        feature: "award_intake",
        now: new Date("2026-06-20T00:00:00Z"),
      }),
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect fail.** Run: `pnpm --filter @grantpipe/api test -- ai-usage` → FAIL.

- [ ] **Step 3: Implement** `apps/api/src/lib/ai-usage.ts` using Drizzle (`count`, `and`, `eq`, `gte`), importing `aiUsageEvents` from `@grantpipe/db` and `capForFeature`/`nextPlanAboveCap`/`AI_USAGE_CAP_REACHED` from `@grantpipe/shared`. Build the thrown error as `Object.assign(new Error(AI_USAGE_CAP_REACHED), { status: 402, body: payload })` to match the existing `requireAwardIntakePlan` pattern. Wrap `recordAiUsage` insert in try/catch that ignores the unique-violation code and rethrows otherwise.

- [ ] **Step 4: Run, expect pass.** Run: `pnpm --filter @grantpipe/api test -- ai-usage` → PASS.

- [ ] **Step 5: Commit.** `git commit -am "feat(api): AI usage metering + cap enforcement helper"`

---

## Phase 4 — Enforce Award Intake cap

### Task 6: Gate + meter Award Intake at upload

**Files:**

- Modify: `apps/api/src/domains/document-extractions/service.ts` (the upload/create-extraction path that calls `requireAwardIntakePlan`)
- Test: `apps/api/src/domains/document-extractions/service.test.ts`

- [ ] **Step 1: Write failing test** — a starter org that already has 5 award-intake usage events this month gets `ai_usage_cap_reached` (402) on the 6th upload; a 5th succeeds and records one usage event; growth org is never capped. Use the existing service test harness and the create/upload entry point.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement** — in the create path, after `requireAwardIntakePlan(planTier)` and before enqueue/insert side effects complete, call `await assertAiUsageWithinCap(db, { orgId, feature: "award_intake", planTier, now })`. After the extraction row is created, call `await recordAiUsage(db, { orgId, feature: "award_intake", referenceId: extraction.id, now })`. (Recording after creation with the real `extractionId` keeps it idempotent across retries.)

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(api): enforce Award Intake monthly cap on Starter"`

---

## Phase 5 — Lower Ask-Your-Ledger gate to Starter + enforce cap

### Task 7: Ask-Your-Ledger cap

**Files:**

- Modify: `apps/api/src/domains/ledger-assistant/service.ts:135-137`
- Test: `apps/api/src/domains/ledger-assistant/service.test.ts`

- [ ] **Step 1: Write failing test** — starter org can call `askLedger` (no longer 400 "Audit-Ready and above"); at 20 used this month the 21st throws `ai_usage_cap_reached` with `upgradeToPlan: "growth"`; each successful call records one usage event; growth is uncapped.

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement** — the boolean gate (`canUseAskYourLedger`) is now satisfied at Starter via Task 2, so the existing `if (!canUseAskYourLedger(...)) throw badRequest(...)` stays as a defense (still blocks if somehow false) but starter now passes it. Immediately after that check, add `await assertAiUsageWithinCap(db, { orgId: params.orgId, feature: "ask_your_ledger", planTier: params.planTier, now: params.now ?? new Date() })`. At the end of a successful `askLedger` (just before each `return`, or by wrapping the body and recording once before returning the answer), call `await recordAiUsage(db, { orgId: params.orgId, feature: "ask_your_ledger", now })`. Prefer a single `try { ...compute answer... } finally`-free explicit record right before the final return so failed answers do not count.

- [ ] **Step 4: Run, expect pass.**

- [ ] **Step 5: Commit.** `git commit -am "feat(api): Ask-Your-Ledger on Starter with 20/mo cap"`

---

## Phase 6 — Pricing catalog repackaging

### Task 8: Rewrite `PLAN_CATALOG` bullets + descriptions

**Files:**

- Modify: `packages/shared/src/pricing.ts:180-310`
- Test: `packages/shared/src/pricing.test.ts`

Copy is user-facing → **must pass `humanizer` then `third-grade-copy` then zero-lies check** before this task is "done." Do not invent counts/testimonials. Cap numbers come from `PLAN_ENTITLEMENTS` (single source of truth) — reference them, do not hardcode "5"/"20" as bare literals where a derived value is feasible.

Structural requirements (validated by tests; final wording set by copy passes):

- **Starter** `features[]` must now include reminder emails, restriction lifecycle, spend-down alerts, "AI Award Document Intake (capped)", "Ask-Your-Ledger (capped)". Remove any bullet implying it lacks restriction tracking. `description`/`bestFit`/`chooseThisIf` reflect the "get out of spreadsheets, never miss a deadline, basic AI included" identity.
- **Growth** `features[]` must include "QuickBooks Online sync", "Proposal & report drafting", "Unlimited AI Award Intake & Ask-Your-Ledger". Identity = "operate & control, most popular." `highlighted: true` stays.
- **Audit-Ready** `features[]` must NOT list QBO or drafting as _new_ (they moved to Growth) — restructure to "Everything in Growth, plus" the audit-only proof set. Identity = "prove it & withstand audit."
- `UNIVERSAL_PLAN_INCLUSIONS` adds an "AI assistance included on every paid plan" line.

- [ ] **Step 1: Write failing contract test**

```ts
import { getPricingPlan } from "./pricing";
describe("repackaged catalog", () => {
  it("starter advertises restriction tracking + entry AI", () => {
    const f = getPricingPlan("starter").features.join(" ").toLowerCase();
    expect(f).toMatch(/restrict/);
    expect(f).toMatch(/award/);
    expect(f).toMatch(/ledger/);
    expect(f).toMatch(/reminder/);
  });
  it("growth advertises quickbooks + drafting + unlimited ai", () => {
    const f = getPricingPlan("growth").features.join(" ").toLowerCase();
    expect(f).toMatch(/quickbooks/);
    expect(f).toMatch(/draft/);
    expect(f).toMatch(/unlimited/);
  });
  it("audit-ready no longer lists quickbooks/drafting as its own additions", () => {
    const f = getPricingPlan("audit_ready").features.join(" ").toLowerCase();
    expect(f).toMatch(/evidence/);
    expect(f).toMatch(/auditor/);
  });
});
```

- [ ] **Step 2: Run, expect fail.** Run: `pnpm --filter @grantpipe/shared test -- pricing` → FAIL.

- [ ] **Step 3: Rewrite the three plans' `description`, `bestFit`, `pricingPageGuide`, `chooseThisIf`, and `features[]`** per the structural requirements. Add the universal AI inclusion line.

- [ ] **Step 4: Run the copy gate** on every changed string: `humanizer` → `third-grade-copy` → manual zero-lies check against the entitlement map and product docs. Apply edits.

- [ ] **Step 5: Run, expect pass.** Run: `pnpm --filter @grantpipe/shared test` → PASS. Fix any other catalog/positioning tests that assert old bullets.

- [ ] **Step 6: Commit.** `git commit -am "feat(shared): repackage pricing catalog copy for new tiers"`

---

## Phase 7 — Client cap handling

### Task 9: Map cap error + upgrade dialog

**Files:**

- Modify: web error-mapping util (find via `grep "insufficient_plan" apps/web/src`)
- Create: `apps/web/src/components/ai/ai-usage-cap-dialog.tsx`
- Test: co-located `*.test.tsx`

- [ ] **Step 1: Write failing test** — given a 402 response body `{ error: "ai_usage_cap_reached", feature, cap, used, currentPlan, upgradeToPlan }`, the error mapper returns a typed object the UI can switch on; the dialog renders "You've used all 5 of this month's AI Award Intake. It resets [date] — or upgrade to Growth for unlimited." with a pill "Upgrade" CTA, and fires a PostHog `ai_usage_cap_prompt_viewed` event (feature + plan only, no free text).

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implement** the mapper branch (parse the body, fall back gracefully) and the dialog (Shadcn dialog, pill buttons per design canon, warm non-scare tone, reset date = first of next UTC month). Wire the cap error from the Award Intake and Ask-Your-Ledger mutation hooks to open the dialog. Capture failures with the existing Sentry helper.

- [ ] **Step 4: Run the copy gate** on the dialog copy (`humanizer` → `third-grade-copy`).

- [ ] **Step 5: Run, expect pass.**

- [ ] **Step 6: Commit.** `git commit -am "feat(web): AI usage cap upgrade dialog + error mapping"`

---

## Phase 8 — In-app upgrade surfaces

### Task 10: Refresh trial/billing unlock copy

**Files:**

- Modify: `apps/web/src/components/billing/trial-upgrade-card.tsx`, `apps/web/src/components/settings/settings-billing-panel.tsx` (confirm exact paths via grep)
- Test: co-located tests

- [ ] **Step 1: Write failing test** — these surfaces list each plan's headline unlocks in outcome language derived from `PLAN_CATALOG`/entitlements (Starter→"never miss a deadline + basic AI"; Growth→"QuickBooks sync, unlimited AI, run more grants"; Audit-Ready→"evidence packages, auditor portal, prepare for your single audit"). Assert the derived unlock list is non-empty and references the moved features.

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** by reading from the shared catalog (no duplicated literals); pill buttons.
- [ ] **Step 4: Copy gate** the new strings.
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.** `git commit -am "feat(web): outcome-language upgrade unlocks in trial/billing surfaces"`

---

## Phase 9 — Marketing surfaces

> Each task below changes user-facing copy → **mandatory `humanizer` → `third-grade-copy` → zero-lies** pass before "done." 2 CFR 200 numbers must match verified post-2024 values; keep `apps/site/src/audit-threshold-amount.test.ts` green. Pill buttons. No fabricated proof.

### Task 11: Marketed-capabilities — add AI capabilities

**Files:**

- Modify: `apps/site/src/lib/marketed-capabilities.ts`
- Test: `apps/site/src/feature-landing-pages-contract.test.ts`, `apps/site/src/feature-pages-entitlement-contract.test.ts`

- [ ] **Step 1: Write failing test** — the marketed-capabilities list includes Award Intake, Ask-Your-Ledger, Proposal/Report Drafting, Anomaly Detector, Outcome Measurement, each declaring its minimum plan derived from the entitlement map (Award Intake→Starter, Ask-Your-Ledger→Starter, Drafting→Growth, Anomaly→Audit-Ready). The entitlement-contract test asserts the advertised minimum plan equals `getMinimumPlanForFeatures([...])`.

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** the capability entries with human-in-the-loop narratives ("AI surfaces, you confirm; every acceptance is logged").
- [ ] **Step 4: Copy gate.**
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.** `git commit -am "feat(site): surface AI capabilities in marketed-capabilities"`

### Task 12: Pricing page — identities + feature matrix + AI rows

**Files:**

- Modify: `apps/site/src/pages/pricing.astro`
- Test: extend the pricing-page contract test if present; otherwise add a render assertion test.

- [ ] **Step 1: Write failing test** — the rendered pricing page contains the three identity sub-headers, a feature-matrix row for QuickBooks under Growth (✓) not Starter, AI rows showing "5/mo"/"20/mo" on Starter and "Unlimited" on Growth+ (numbers derived from caps), and "Most Popular" on Growth.

- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** the matrix (driven by `PLAN_ENTITLEMENTS` + `PLAN_CATALOG`, with tooltips for compliance terms), identity sub-headers, AI cap rows.
- [ ] **Step 4: Copy gate** the new prose.
- [ ] **Step 5: Run, expect pass + `audit-threshold-amount.test.ts` green.**
- [ ] **Step 6: Commit.** `git commit -am "feat(site): rebuild pricing page with tier identities + feature matrix"`

### Task 13: Homepage — AI band + proof points

**Files:**

- Modify: `apps/site/src/pages/index.astro`
- Test: homepage render/contract test (add if absent)

- [ ] **Step 1: Write failing test** — homepage renders an "AI that respects your judgment" section naming the four AI capabilities with the human-in-the-loop framing, plus the "one system" and post-2024 Uniform Guidance proof points.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** the section (compliance-led spine preserved; AI is a supporting band, not the hero).
- [ ] **Step 4: Copy gate.**
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.** `git commit -am "feat(site): homepage AI capability band + proof points"`

### Task 14: Product page + positioning/config consistency

**Files:**

- Modify: `apps/site/src/pages/product.astro`, `packages/shared/src/positioning.ts`, `apps/site/src/config/site.ts`
- Test: relevant contract tests

- [ ] **Step 1: Write failing test** — product page presents the AI capabilities as first-class narratives; `positioning.ts`/`site.ts` tier strings match the three identities (no stale "Starter = tracking only" language).
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Copy gate.**
- [ ] **Step 5: Run, expect pass.**
- [ ] **Step 6: Commit.** `git commit -am "feat(site): product page AI narratives + positioning consistency"`

---

## Phase 10 — Observability verification

### Task 15: Confirm PostHog + Sentry coverage on new paths

**Files:**

- Modify: wherever gaps exist (cap dialog analytics from Task 9; metering/enforcement Sentry in `apps/api/src/lib/ai-usage.ts`)
- Test: assert analytics + Sentry hooks fire, or document shared-wrapper coverage.

- [ ] **Step 1: Write failing test** — `ai_usage_cap_reached` enforcement path reports nothing to Sentry on the _expected_ cap (it's a normal 402, not an error), but a metering-write failure (`recordAiUsage` non-dedupe DB error) IS captured via `captureBackgroundException` and does NOT block the user's successful AI action. Client: `ai_usage_cap_prompt_viewed` / `_clicked` PostHog events fire with privacy-safe props.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** — make `recordAiUsage` best-effort at the call sites (await, but catch+capture and continue) so a metering failure never fails the AI request; ensure the cap dialog fires the two analytics events.
- [ ] **Step 4: Run, expect pass.**
- [ ] **Step 5: Commit.** `git commit -am "feat: observability for AI cap metering + prompts"`

---

## Phase 11 — Gates, review, merge, deploy

### Task 16: Full quality gates

- [ ] **Step 1: Typecheck + tests with cache bust.** Run: `turbo typecheck test --force` (per the "Turbo --force after merge" gotcha). Fix all failures.
- [ ] **Step 2: Coverage.** Run: `turbo test:coverage`. Confirm 95% per-file on every touched file. Add tests for any gap.
- [ ] **Step 3: Lint/format.** Run: `turbo lint && pnpm format:check`.
- [ ] **Step 4: Build the three apps.** Run: `turbo build`. Confirm green (web build is also a prerequisite for the shared pre-commit coverage gate).
- [ ] **Step 5: Commit any fixes.**

### Task 17: Review → fix → merge → deploy

- [ ] **Step 1: Review** all worktree changes via the active runtime's permitted review path (subagent code review). Capture every finding.
- [ ] **Step 2: Fix** every issue the review flags; re-run Task 16 gates.
- [ ] **Step 3: Merge** the branch to `master`.
- [ ] **Step 4: Remove** the worktree (`superpowers:using-git-worktrees` teardown).
- [ ] **Step 5: Deploy** affected apps via Wrangler: `pnpm run deploy:api` (cap enforcement + migration), `pnpm run deploy:web` (cap dialog + surfaces), `pnpm run deploy:site` (marketing). Apply the DB migration to prod before/with the API deploy.
- [ ] **Step 6: Verify in prod** — pricing page shows new tiers/matrix; a Starter test org hits the AI cap and sees the upgrade prompt; Growth org is uncapped; `audit-threshold-amount` values intact. Update the goal ledger.

---

## Self-Review (against the spec)

- **Spec Part 1 (repackaging):** Tasks 2, 8, 11–14. ✓
- **Spec Part 2 (AI caps build):** Tasks 1, 3, 4, 5, 6, 7. ✓
- **Spec Part 3 (catalog):** Task 8. ✓
- **Spec Part 4 (comms surfaces):** Tasks 9, 10, 11, 12, 13, 14. ✓
- **Spec Part 5 (observability):** Tasks 9, 15. ✓
- **Testing strategy / 95% coverage:** Task 16. ✓
- **Migration/rollout (strict upgrade, Wrangler deploy):** Tasks 3, 17. ✓
- **Copy gate (humanizer→third-grade→zero-lies):** Tasks 8, 9, 10, 11, 12, 13, 14. ✓
- **2 CFR 200 regression green:** Tasks 12, 16. ✓

Type consistency: `AiCappedFeature` ("award_intake" | "ask_your_ledger"), `AI_USAGE_CAP_REACHED`, `AiUsageCapPayload`, `awardIntakeMonthlyCap`/`askYourLedgerMonthlyCap`, `getMonthlyAiUsage`/`recordAiUsage`/`assertAiUsageWithinCap`, `nextPlanAboveCap`/`capForFeature` are used consistently across Tasks 1–9. No undefined references.
