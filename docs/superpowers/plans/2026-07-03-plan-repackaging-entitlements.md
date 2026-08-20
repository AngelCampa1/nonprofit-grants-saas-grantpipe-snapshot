# Plan Repackaging — Entitlements & Full-System Alignment Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repackage plan entitlements (Starter: −ask-your-ledger, +budget exports; Growth: +indirect cost rules, +evidence packets, cap 30→50) and sweep every surface until all tier promises match the coded matrix.

**Architecture:** `PLAN_ENTITLEMENTS` in `packages/shared/src/constants/index.ts` is the single source of truth. Flip flags there first (TDD), then fix the three places that are NOT derived from it: hard-coded `requirePlanTier("audit_ready")` route literals in `apps/api`, hand-written `PLAN_CATALOG.features` bullets in `packages/shared/src/pricing.ts`, and copy/knowledge surfaces. Finish with a loop-until-dry full-system sweep and review cycles.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), Hono API on Workers, React 19 web, Astro site, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-plan-repackaging-entitlements-design.md`

**Coordination:** Sections A (prices) and B (promo removal) are a parallel agent's scope. This work happens in a worktree branched from current `master`; Phase 8 rebases onto `master` after the pricing work lands. `packages/shared/src/pricing.ts` is touched by BOTH workstreams (they edit price cents; we edit `features` bullets) — expect a small rebase there.

**Repo gates that apply to every task:** TDD (failing test first), 95% coverage per touched file, no `any`, no TODO comments, pill buttons (`rounded-full`) for any new/edited button, PostHog + Sentry on new gate paths, humanizer → third-grade-copy → zero-lies check for user-facing copy. Committing `packages/shared` triggers the ~13-minute coverage pre-commit gate and needs a prior web build (`turbo build --filter=@grantpipe/web`) — poll it, don't idle.

---

## Phase 0: Worktree

### Task 0.1: Create isolated worktree

- [ ] **Step 1:** Use the `superpowers:using-git-worktrees` skill. Create branch `feat/plan-repackaging-entitlements` in a worktree at `.worktrees/plan-repackaging` (inside the grantpipe repo folder — never a sibling directory).
- [ ] **Step 2:** Run `git pull` on master first; branch from up-to-date master.
- [ ] **Step 3:** Verify `pnpm install` in the worktree does not clobber main-repo `@grantpipe/*` links (known junction-contamination hazard on this machine — if validators break in the main repo afterwards, fix with `mklink /J` junctions).

---

## Phase 1: Source of truth — `packages/shared`

### Task 1.1: Flip the six entitlement values (TDD)

**Files:**

- Modify: `packages/shared/src/constants/index.ts` (PLAN_ENTITLEMENTS, lines ~663-816)
- Test: `packages/shared/src/constants/index.test.ts`

- [ ] **Step 1: Update the pinned tests to the NEW truth first (they become the failing tests).** Exact assertion changes:
  - `it("keeps Starter credible while reserving day-to-day compliance depth for Growth")` (~line 367): starter `hasAskYourLedger: false`, starter `hasGrantBudgetExports: true`, growth `activeGrantCap: 50` (growth `hasGrantBudgetExports` stays `true`).
  - `it("reports Ask-Your-Ledger eligibility from Starter upward")` (~line 421): rename to `"reports Ask-Your-Ledger eligibility from Growth upward"`; assert `canUseAskYourLedger("starter") === false`, `canUseAskYourLedger("growth") === true`.
  - `it("reports advanced compliance and finance helper eligibility")` (~line 457): `hasIndirectCostRules("growth") === true`, `hasPaymentEvidencePackage("growth") === true` (starter stays `false` for both; audit_ready stays `true`).
  - `describe("AI monthly caps")` → ask-ledger ladder test (~line 773): starter cap is now `0`; growth+ remain `Number.POSITIVE_INFINITY`. Rename to `"ask-your-ledger is gated off Starter (cap 0), growth+ unlimited"`.
  - `describe("repackaged entitlements")` → starter test (~line 782): `s.hasAskYourLedger === false`, `s.hasGrantBudgetExports === true`; growth test (~line 798): `g.activeGrantCap === 50`.
  - Add a new test pinning the full change set in one place:

```ts
it("2026-07 repackaging: exports down to Starter, indirect+evidence down to Growth, ask-ledger off Starter, growth cap 50", () => {
  const s = PLAN_ENTITLEMENTS.starter;
  const g = PLAN_ENTITLEMENTS.growth;
  const a = PLAN_ENTITLEMENTS.audit_ready;
  expect(s.hasAskYourLedger).toBe(false);
  expect(s.askYourLedgerMonthlyCap).toBe(0);
  expect(s.hasGrantBudgetExports).toBe(true);
  expect(s.awardIntakeMonthlyCap).toBe(5);
  expect(g.hasIndirectCostRules).toBe(true);
  expect(g.hasPaymentEvidencePackage).toBe(true);
  expect(g.activeGrantCap).toBe(50);
  expect(a.hasIndirectCostRules).toBe(true);
  expect(a.hasPaymentEvidencePackage).toBe(true);
  expect(a.hasCrossEntityReportBuilder).toBe(false); // stays Enterprise-only
});
```

- [ ] **Step 2: Run to confirm failures.** `pnpm --filter @grantpipe/shared test -- constants` — expect the edited tests to FAIL against current constants.
- [ ] **Step 3: Flip the constants.** In `PLAN_ENTITLEMENTS`:
  - `starter.hasAskYourLedger: true` → `false` (~line 695 region)
  - `starter.askYourLedgerMonthlyCap: 20` → `0` (~line 700)
  - `starter.hasGrantBudgetExports: false` → `true` (~line 683)
  - `growth.hasIndirectCostRules: false` → `true` (~line 716)
  - `growth.hasPaymentEvidencePackage: false` → `true` (~line 717)
  - `growth.activeGrantCap: 30` → `50` (~line 703)
- [ ] **Step 4: Run tests, confirm pass.** `pnpm --filter @grantpipe/shared test -- constants`
- [ ] **Step 5:** Do NOT commit yet if the shared pre-commit gate would run against a broken downstream — first check which other shared tests now fail (`pnpm --filter @grantpipe/shared test`) and fix them in Tasks 1.2/1.3 before the commit at end of Phase 1.

### Task 1.2: AI-usage error helpers for a zero cap (TDD)

**Files:**

- Modify: `packages/shared/src/errors/ai-usage.ts` (only if behavior requires; likely no change)
- Test: `packages/shared/src/errors/ai-usage.test.ts`

- [ ] **Step 1: Update pinned tests:**
  - `capForFeature("ask_your_ledger", "starter")` now expects `0` (was `20`).
  - `nextPlanAboveCap("ask_your_ledger", "starter")` still expects `"growth"` (Infinity > 0) — keep, and add a comment-free companion assertion that it returns `"growth"` when cap is `0`.
- [ ] **Step 2: Run:** `pnpm --filter @grantpipe/shared test -- ai-usage` — expect FAIL (cap assertion) before Task 1.1's constant flip lands in the same worktree; after the flip it should PASS with only the test-value edits. Verify `nextPlanAboveCap` logic handles cap `0` without code change (it compares caps numerically; `Infinity > 0` holds).
- [ ] **Step 3:** If any implementation change is needed (it should not be), make the minimal edit; re-run to green.

### Task 1.3: `PLAN_CATALOG` marketing bullets + derived helpers (TDD-ish: contract tests are the guard)

**Files:**

- Modify: `packages/shared/src/pricing.ts` (PLAN_CATALOG `features` arrays, lines ~190-326)
- Test: `packages/shared/src/pricing.test.ts` (only entitlement-adjacent assertions; price values belong to the pricing agent)

- [ ] **Step 1:** Edit `PLAN_CATALOG` feature bullets (hand-written, NOT derived — this is the drift hotspot):
  - **starter:** remove `"Ask-Your-Ledger reporting (20 questions/month)"` (~line 224). Add `"Budget-vs-actual exports (PDF/CSV)"`. Keep `"Up to 10 active grants"`. Ensure the AI bullet reads as award-document intake specifically (e.g. `"AI reads your award documents (5/month)"`) — never a generic "AI included".
  - **growth:** `"Up to 30 active grants"` → `"Up to 50 active grants"` (~line 250). Keep `"Unlimited Ask-Your-Ledger reporting"` VERBATIM (~line 263 — the site contract test greps for this exact literal). Add `"Indirect cost rules"` and `"Reimbursement evidence packets"`.
  - **audit_ready:** remove `"Indirect cost rules"` (~line 293) and `"Reimbursement evidence packets"` (~line 297) bullets.
- [ ] **Step 2:** Verify derived behavior (add/update tests in `pricing.test.ts`):

```ts
it("derives premium feature keys from the new starter matrix", () => {
  expect(PREMIUM_FEATURE_KEYS).toContain("hasAskYourLedger"); // newly premium
  expect(PREMIUM_FEATURE_KEYS).not.toContain("hasGrantBudgetExports"); // no longer premium
});
it("minimum plan for ask-your-ledger is growth; for budget exports is starter", () => {
  expect(getMinimumPlanForFeatures(["hasAskYourLedger"])).toBe("growth");
  expect(getMinimumPlanForFeatures(["hasGrantBudgetExports"])).toBe("starter");
});
```

- [ ] **Step 3:** Run `pnpm --filter @grantpipe/shared test -- pricing` → green.
- [ ] **Step 4:** Run the FULL shared suite: `pnpm --filter @grantpipe/shared test`. Fix any remaining pinned assertions this plan missed (report them — they feed Phase 6's sweep list).
- [ ] **Step 5: Commit Phase 1** (one commit; the ~13-min shared coverage gate runs here — build web first: `turbo build --filter=@grantpipe/web`):

```bash
git add packages/shared
git commit -m "feat(plans): repackage entitlements — exports to Starter, indirect+evidence to Growth, ask-ledger Growth+, growth cap 50"
```

### Task 1.4: AI-CS grounding knowledge (TDD)

**Files:**

- Modify: `packages/shared/src/knowledge/ai-cs/feature-knowledge.ts`
- Test: colocated knowledge tests (find via `pnpm --filter @grantpipe/shared test -- knowledge`)

- [ ] **Step 1:** Write failing test: the `ask_ledger` entry's `why` must state Growth-and-up availability and must NOT mention a Starter question allowance:

```ts
it("teaches ask-your-ledger as Growth and up", () => {
  const entry = FEATURE_KNOWLEDGE.find((f) => f.key === "ask_ledger")!;
  expect(entry.why).toMatch(/Growth/);
  expect(entry.why).not.toMatch(/Starter gives you/);
  expect(entry.why).not.toMatch(/questions each month/);
});
```

- [ ] **Step 2:** Run → FAIL. Then rewrite `ask_ledger.why` (~line 853): replace the Starter-cap sentence with plan-gate teaching, e.g. `"Ask-Your-Ledger is included on Growth plans and up, with unlimited questions. Starter plans include AI award-document intake instead."` Remove the now-unused `STARTER_ASK_LEDGER_CAP` constant if nothing else references it.
- [ ] **Step 3:** Add tier-availability facts for the three moved features. If entries exist for grant budgets / payments workflows, extend their `why`; the recon found NO entries mentioning indirect cost rules, evidence packets, or budget exports — so add tier-availability sentences to the closest existing entries (payments/reimbursements entry, grants budget entry) rather than inventing new routes. Each claim must match the flipped matrix exactly (zero-lies check).
- [ ] **Step 4:** Run knowledge tests → green. Commit: `git commit -m "feat(ai-cs): grounding teaches repackaged tier availability"`.

---

## Phase 2: API gating

### Task 2.1: Ask-your-ledger becomes a Growth+ plan gate (TDD)

**Files:**

- Modify: `apps/api/src/domains/ledger-assistant/routes.ts` (gate middleware ~lines 102-114), `apps/api/src/domains/ledger-assistant/service.ts` (~lines 140-149)
- Modify: `packages/shared/src/constants/analytics.ts` (new event name)
- Test: `apps/api/src/domains/ledger-assistant/*.test.ts`, `apps/api/src/lib/ai-usage.test.ts`

- [ ] **Step 1: Failing tests:** (a) starter org calling `POST /ask` gets `403` with `errorCode: "insufficient_plan"` and copy naming Growth; (b) growth org passes the gate and is NOT metered (no cap error at any usage count); (c) the gate-block emits the analytics event.

```ts
it("blocks Starter with a Growth upsell", async () => {
  const res = await appRequest("/ask", { planTier: "starter" });
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.errorCode).toBe("insufficient_plan");
  expect(body.error).toContain("Growth");
});
```

- [ ] **Step 2:** Run → FAIL (today starter passes the `canUseAskYourLedger` gate and hits the 20-cap).
- [ ] **Step 3:** Implement:
  - Route middleware: use the standard Growth paywall response (`402` + `insufficient_plan`, `required`, and `current`) while preserving blocked-gate analytics.
  - Add `ledgerAssistantGateBlocked: "ledger_assistant_gate_blocked"` to `ANALYTICS_EVENTS`; fire it in the gate branch via `captureApiAnalyticsSafely` (payload: `plan_tier` only — privacy-safe), Sentry wrap via the existing `captureBackgroundException("ledger_assistant", ...)` pattern.
  - Service-level defense (~line 140): keep the `canUseAskYourLedger` check; update its message to match the route copy (leave its error type as-is — it is unreachable defense-in-depth).
  - Remove the now-dead ask-ledger metering call ONLY if starter is the sole capped tier (it is — growth+ are Infinity and `assertAiUsageWithinCap` already short-circuits on non-finite caps). Keep the call for safety; it is now a no-op for every tier that can reach it. Do not delete `recordAiUsage` for ask-ledger (usage analytics still valuable).
  - Replace `apps/api/src/lib/ai-usage.test.ts` ~line 288 (`starter ask_your_ledger at cap (20)…`) with: starter never reaches metering (gate first); add a unit test that `assertAiUsageWithinCap` with cap `0` throws immediately at `used = 0` (guards the constant against future misuse).
- [ ] **Step 4:** Run: `pnpm --filter @grantpipe/api test -- ledger-assistant ai-usage` → green.
- [ ] **Step 5:** Commit: `git commit -m "feat(api): gate ask-your-ledger to Growth+ with analytics on gate hits"`.

### Task 2.2: Indirect cost rules + evidence packets to Growth (TDD)

**Files:**

- Modify: `apps/api/src/domains/payments/routes.ts`
- Test: `apps/api/src/domains/payments/*.test.ts`

- [ ] **Step 1: Failing tests:** growth org gets 200-path (not 402) on: `GET /indirect-rules`, `POST /indirect-rules`, `PATCH /indirect-rules/:ruleId`, `DELETE /indirect-rules/:ruleId`, `POST /:id/indirect/recompute`, `GET /:id/packet`, `GET /:id/packet.pdf`. Starter still gets 402 on all seven.
- [ ] **Step 2:** Run → FAIL (all currently `requirePlanTier("audit_ready")`).
- [ ] **Step 3:** Change the seven `requirePlanTier("audit_ready")` call sites (~lines 176, 190, 207, 225, 456, 470, 482) to `requirePlanTier("growth")`. Add a one-line contract test asserting the middleware tier matches the entitlement flag's minimum plan, wiring the disconnected flag to the route:

```ts
it("route gates match the entitlement matrix", () => {
  expect(getMinimumPlanForFeatures(["hasIndirectCostRules"])).toBe("growth");
  expect(getMinimumPlanForFeatures(["hasPaymentEvidencePackage"])).toBe("growth");
});
```

- [ ] **Step 4:** Run payments tests → green. Commit: `git commit -m "feat(api): open indirect cost rules and evidence packets to Growth"`.

### Task 2.3: Grant cap 50 enforcement (verify + pin, TDD)

**Files:**

- Test: `apps/api/src/domains/grants/*.test.ts`, `apps/api/src/domains/import/*.test.ts`

- [ ] **Step 1:** Enforcement derives from `getActiveGrantCap` — no API code change expected. Search those test files for `30` cap pins; update to `50`. Add if missing:

```ts
it("growth orgs can hold 50 active grants plus soft headroom", () => {
  expect(getActiveGrantCap("growth")).toBe(50);
  expect(getGrantCapWithSoftHeadroom(50)).toBe(60);
});
```

- [ ] **Step 2:** Run `pnpm --filter @grantpipe/api test -- grants import` → green (fix any stale 30s). Commit: `git commit -m "test(api): pin growth grant cap at 50"`.
- [ ] **Step 3:** Run the FULL api suite `pnpm --filter @grantpipe/api test`; fix stragglers.

---

## Phase 3: Web app alignment

### Task 3.1: Ask-your-ledger locked state for Starter (TDD)

**Files:**

- Modify: the ask-ledger route component (route `/reports/ask-ledger` — locate exact file under `apps/web/src/routes/`)
- Test: colocated component test (jsdom)

- [ ] **Step 1: Failing test:** rendering the page with a starter-tier session shows a locked/upsell state (not the ask form); fires `upgrade_prompt_shown` with `{ feature: "ask_your_ledger" }`; the upgrade CTA links to billing/upgrade and fires `upgrade_clicked` on click. With growth session, the form renders.
- [ ] **Step 2:** Run → FAIL (no client gate exists today; the page relies on the API 403).
- [ ] **Step 3:** Implement: `const canAsk = canUseAskYourLedger(effectivePlanTier)` from the session (mirror the `hasIndirectCostRules` pattern in `payments/$requestId.tsx:783`). Locked state: brief explanatory copy ("Ask-Your-Ledger is included on Growth plans and up." — run humanizer + third-grade-copy on final copy), pill-shaped upgrade button (`rounded-full`), PostHog events via the existing analytics helpers (same wrappers `trial-upgrade-card.tsx` uses), render errors captured by the existing Sentry boundary.
- [ ] **Step 4:** Run web tests for the file → green. Verify in the local app (preview: starter session sees lock; growth sees form).
- [ ] **Step 5:** Commit: `git commit -m "feat(web): ask-your-ledger locked state with upgrade CTA for Starter"`.

### Task 3.2: Evidence-packet UI gating check + plan-display pin (TDD)

**Files:**

- Inspect: `apps/web/src/routes/_authenticated/payments/$requestId.tsx` and any packet download surface
- Test: `apps/web/src/lib/plan-display.test.ts`

- [ ] **Step 1:** Recon found NO client-side gating or rendering for evidence packets in `$requestId.tsx`. Locate where the packet download is exposed in the UI (search `packet`, `evidence`, `.pdf` in `apps/web/src`). If a download control exists: gate it with `hasPaymentEvidencePackage(effectivePlanTier)` (locked → upsell pattern from Task 3.1, upgrade target Growth). If NO UI exists at all, record that as a finding in the sweep ledger (feature shipped API-only) — do not build new UI in this plan.
- [ ] **Step 2:** Update `plan-display.test.ts` ~line 111: `"Higher active grants cap (10 -> 30)"` → `"Higher active grants cap (10 -> 50)"`. Run → confirm the diff copy derives correctly.
- [ ] **Step 3:** Indirect tab on `$requestId.tsx` unlocks automatically via the flipped constant (lines 948/1472 use `hasIndirectCostRules`). Verify with a component test or existing coverage: growth session sees the Indirect tab content.
- [ ] **Step 4:** Run `pnpm --filter @grantpipe/web test` (full) → green. Commit: `git commit -m "feat(web): align packet gating and plan-display copy with repackaged tiers"`.

---

## Phase 4: Marketing site alignment

### Task 4.1: Extend the copy-drift guard FIRST (TDD for copy)

**Files:**

- Modify: `apps/site/src/content-tests/grantpipe-tier-copy-contract.test.ts` (`BOUNDARY_CAPABILITIES`, ~lines 579-592)

- [ ] **Step 1:** Add the changed features to `BOUNDARY_CAPABILITIES` so the boundary sweep validates their marketing copy automatically: `hasAskYourLedger`, `hasIndirectCostRules`, `hasPaymentEvidencePackage`, `hasGrantBudgetExports`. Follow the existing entry shape in that array.
- [ ] **Step 2:** Run `pnpm --filter @grantpipe/site test -- tier-copy` — expect FAILURES wherever site copy still claims the old boundaries. Those failures are the work list for Task 4.2.

### Task 4.2: Fix site copy to the new matrix

**Files:**

- Modify: `apps/site/src/pages/pricing.astro` (FAQ, plan blurbs), `apps/site/src/components/pricing-plan-cards.astro`, any feature/homepage pages the contract test or grep flags
- Verify-only: `apps/site/src/components/feature-comparison-matrix.astro` (auto-derives from `MARKETED_FEATURE_CATALOG` → `PLAN_ENTITLEMENTS`; needs zero edits — confirm rendered rows moved)

- [ ] **Step 1:** Fix every contract-test failure from Task 4.1. Grep the site for stale claims and fix: `"20 questions"`, `"30 active grants"`, `"every paid plan"`, indirect/evidence described as Audit-Ready-only, budget exports described as Growth-only. Grant-cap FAQ copy: growth overage now starts past 50 (+10 soft headroom → hard cap 60; overage copy `"$10/active grant/month"` unchanged).
- [ ] **Step 2:** Keep `"Unlimited Ask-Your-Ledger reporting"` literal intact (test ~line 489 greps for it). If tier positioning copy changes around it, re-run that test.
- [ ] **Step 3:** Copy gates: run `humanizer` skill, then `third-grade-copy` skill on all changed user-facing strings; zero-lies check each claim against `PLAN_ENTITLEMENTS`.
- [ ] **Step 4:** `pnpm --filter @grantpipe/site test` (full, includes SEO contract) → green. Build check: `turbo build --filter=@grantpipe/site`.
- [ ] **Step 5:** Commit: `git commit -m "feat(site): tier promises match repackaged entitlement matrix"`.

---

## Phase 5: Content & docs sweep targets

### Task 5.1: Repo-wide stale-claim grep (mechanical)

- [ ] **Step 1:** From the worktree root, grep (case-insensitive) across `content/`, `docs/`, email templates in `apps/api`, and `apps/site/src/pages/` for: `20 questions`, `30 active grants`, `ask-your-ledger` (tier claims), `indirect cost` (tier claims), `evidence packet` (tier claims), `budget export` (tier claims), `Audit-Ready` (feature-availability sentences). Classify each hit: stale → fix; correct → leave; historical (changelogs, archives, old specs/plans) → leave.
- [ ] **Step 2:** Fix stale hits. LinkedIn/social content under `content/social/` that would be re-published must pass the review gate script if touched.
- [ ] **Step 3:** Commit: `git commit -m "docs/content: align tier claims with repackaged plans"`.

---

## Phase 6: Full-system alignment sweep (loop-until-dry)

The six known changes were the seed. This phase hunts UNKNOWN misalignments — any promise/gate/copy anywhere that disagrees with `PLAN_ENTITLEMENTS`.

### Task 6.1: Fan-out discovery, then fix, then repeat

- [ ] **Step 1:** Dispatch parallel read-only sub-agents (smallest capable model), one per surface, each returning findings as `{file, line, claim, matrix_truth, verdict}`:
  1. `apps/site` — every page/component: tier availability claims, upgrade CTAs, schema.org feature lists, FAQ answers.
  2. `apps/web` — paywalls, upgrade prompts, empty states, settings/billing copy, feature lock states, onboarding/First-Light copy.
  3. `apps/api` — every `requirePlanTier` literal, every entitlement-helper call site, error-message copy naming plans or caps.
  4. `packages/shared` — PLAN_CATALOG bullets, PLAN_ENTITLEMENT_LABELS, AI-CS knowledge, analytics constants, validators.
  5. `content/`, `docs/`, email templates — remaining prose claims.
- [ ] **Step 2:** Adjudicate findings against the matrix (the orchestrator does this locally). Fix every confirmed misalignment; add a pinning test where the surface has a test harness.
- [ ] **Step 3:** Repeat Step 1–2 with fresh sub-agents until a full round returns ZERO new confirmed findings (loop-until-dry — do not stop at a fixed pass count). Log each round's findings count in the commit message.
- [ ] **Step 4:** Commit per round: `git commit -m "fix(sweep): round N — <count> tier-alignment fixes"`.

---

## Phase 7: Review/fix cycles

- [ ] **Step 1:** Run full verification in the worktree: `turbo typecheck test --force` (— `--force`: turbo cache returns stale greens after merges) plus `turbo test:coverage` for touched packages; every touched file ≥95%.
- [ ] **Step 2:** Request code review via the active runtime's permitted review path (`superpowers:requesting-code-review` / `/code-review`) covering the whole worktree diff.
- [ ] **Step 3:** Fix EVERY finding. Re-run tests.
- [ ] **Step 4:** Re-review until a review pass reports no findings (multiple cycles are expected and required).

---

## Phase 8: Integration with the pricing agent (A/B)

- [ ] **Step 1:** Check whether the pricing agent's price/promo changes have landed on `master` (`git log origin/master`). If not landed yet, poll — do not merge first if avoidable; the copy sweep must run against final prices. If their work is abandoned/delayed, escalate to Angel rather than guessing.
- [ ] **Step 2:** Rebase the worktree branch onto updated `master`. Resolve `packages/shared/src/pricing.ts` conflicts (they own price cents + promo wiring; we own `features` bullets — keep both).
- [ ] **Step 3:** Re-run Phase 4's contract tests and one Phase 6 sweep round scoped to pricing surfaces (pricing page, plan cards, FAQ) — tier promises and prices co-occur in the same sentences; verify no sentence quotes an old price next to a new promise.
- [ ] **Step 4:** Full gate re-run: `turbo typecheck test --force`.

---

## Phase 9: Merge, deploy, prod verification

- [ ] **Step 1:** Merge to `master` (no `--no-verify`; let hooks run — build web first for the shared coverage gate). Remove the worktree.
- [ ] **Step 2:** Verify Stripe state (Section F of the spec — verification only): 6 new prices bound, old prices archived, M80OFF/Y80OFF deactivated, still zero paid subscriptions. Close gaps only if the pricing agent left them.
- [ ] **Step 3:** Deploy all three: `pnpm run deploy:api`, `pnpm run deploy:web`, `pnpm run deploy:site`. (Site may transiently 404 for ~1-3 min post-deploy — poll, don't roll back.)
- [ ] **Step 4:** Prod verification with the `GRANTPIPE_E2E_*` account (never print the password):
  - Starter-tier context: `/reports/ask-ledger` shows the locked upsell (and API returns 403); award intake still works within 5/month.
  - Growth-tier context (or entitlement-derived check): indirect-rules endpoints return non-402; packet endpoints non-402.
  - grantpipe.com/pricing: cards + comparison matrix show exports on Starter, indirect/evidence on Growth, 50-grant cap; no stale claims; no promo banner.
  - PostHog: `ledger_assistant_gate_blocked` / `upgrade_prompt_shown` events arrive; Sentry quiet.
- [ ] **Step 5:** Update the memory ledger + goal docs; record the repackaging as shipped.

---

## Self-review notes (spec → plan coverage)

- Spec C.1 ask-ledger gate → Tasks 1.1, 1.2, 2.1, 3.1. C.2 award-intake cap kept → Tasks 1.1 (pin), 2.1 (tests). C.3 exports→Starter → Tasks 1.1, 1.3, 4.2 (API needs no change — flag-driven gate confirmed). C.4 indirect→Growth → Tasks 1.1, 2.2, 3.2. C.5 evidence→Growth → Tasks 1.1, 2.2, 3.2. C.6 cap 50 → Tasks 1.1, 2.3, 3.2, 4.2. D positioning → Tasks 1.3, 4.2 (+copy gates). E surfaces → Phases 3-6. F Stripe verification → Phase 9 Step 2. G observability/quality → Tasks 2.1, 3.1, Phases 7-9.
- Known risk: exact line numbers drift as the pricing agent edits shared files — executors must match on identifiers/strings, not line numbers.
