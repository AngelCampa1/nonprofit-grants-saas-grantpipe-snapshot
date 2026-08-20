# Capability Communication & Tier Repackaging — Design

> **Superseded on 2026-07-03 for external accounting integrations.** QuickBooks
> sync is unavailable on every plan. Ignore all QuickBooks entitlement, sync,
> ingestion, and connector instructions below. The supported QuickBooks path is
> manual CSV/opening-balance import, kept separate from the general ledger.

**Date:** 2026-06-20
**Status:** Approved design (pending written-spec review)
**Author:** Angel Campa (with Claude)

## Problem

Two problems, stated by the founder:

1. **Communication gap.** GrantPipe has shipped many capabilities — especially AI
   (Award Document Intake, Ask-Your-Ledger, Proposal/Report Drafting Assistant,
   Anomaly Detector, Outcome Measurement) — that are largely invisible on the
   marketing surfaces (homepage, pricing, product pages) and under-surfaced
   in-app. We are not communicating what the product can do on the surfaces that
   matter.

2. **Packaging gap (NOT pricing).** The Starter plan is gutted to the point of
   being "useless," and Growth is "not good enough." The tiers do not map to the
   three real buyer segments:
   - **Starter** → the scrappy nonprofit that does not want to spend much.
   - **Growth** → the fit for _most_ grant-funded nonprofits.
   - **Audit-Ready** → the biggest orgs, or the ones that most value the
     compliance/audit proposition.

### Hard constraint (verbatim from founder)

> "i like the prices right now, i actually just priced it 10% lower than
> instrumentl (and have the 80% off first year offer). So this is about
> packaging and communication."

**Prices do not change. Grant caps do not change (10 / 30 / 100).** This work is
(a) which features are packaged into which tier, and (b) how capabilities are
communicated.

### Decisions already made by the founder (via clarifying questions)

- **Entry tier: beef up the current Starter** - keep Starter at $49/mo, move in
  features that make it genuinely self-sufficient. No new free tier. The
  "won't spend a dime" need is served by the existing 30-day no-credit-card
  trial + 80%-off-first-year promo (~$66/mo year one).
- **AI packaging: included across paid tiers, capped** — bundle AI into paid
  tiers with usage caps that ladder up. Entry AI (Award Intake + Ask-Your-Ledger)
  reaches Starter with monthly caps; heavier AI (Drafting Assistant) lives at
  Growth+. Lets GrantPipe say "AI included" against Instrumentl's $499/mo AI gate.
  Communicate as **"AI-assisted, human-confirmed."**

## Research summary (the "ton of market research")

Conducted via parallel sub-agents across the competitive landscape, packaging
norms, buyer segmentation, AI-messaging best practices, and QuickBooks
limitations. Four **uncontested lanes** emerged and become the backbone of both
the packaging and the messaging:

1. **One system** for donors + grants + restricted funds + compliance + fund
   accounting. No competitor bundles all of it for the $500K–$10M tier (Aplos
   lacks grant compliance; Blackbaud Financial Edge NXT is enterprise-only and
   priced accordingly; the donor CRMs have no fund accounting).
2. **Post-2024 Uniform Guidance numbers** ($1M single-audit threshold, 15% de
   minimis, $50K MTDC cap, $10K equipment). No competitor markets these.
3. **Restriction _enforcement_, not just tracking** — GrantPipe alerts before
   overspend; QuickBooks and the CRMs track and discover at audit. QuickBooks
   has no native fund accounting (class-tracking workarounds), no restriction
   enforcement ("year-end reclassification nightmare"), and no grant
   budget-vs-actual. This is precisely the layer GrantPipe adds.
4. **GrantHub was discontinued Jan 31 2026** — a vacated $99–$349/mo mid-market
   with no direct successor. A migration lane.

AI-messaging finding (strong, consistent): the buyer (risk-averse
finance/compliance leaders) distrusts "AI automatically…" and trusts "AI
surfaces, you confirm, your review is logged." Messaging stays compliance-led,
with AI as a **human-in-the-loop** supporting capability — never an AI-led hero.

## Current state (source of truth)

Entitlements live in `packages/shared/src/constants/index.ts`
(`PLAN_ENTITLEMENTS`, lines 647–792). The display catalog (prices, bullets,
CTAs) lives in `packages/shared/src/pricing.ts` (`PLAN_CATALOG`). Enforcement:

- `hasAwardDocumentIntake` → `apps/api/src/domains/document-extractions/service.ts`
  via `requireAwardIntakePlan`.
- Ask-Your-Ledger → `apps/api/src/domains/ledger-assistant/service.ts` via
  `canUseAskYourLedger` (currently audit_ready+).
- `getMinimumPlanForFeatures` (pricing.ts) derives "available on plan X" copy
  from the entitlement map, so flipping an entitlement updates marketing copy
  automatically.
- **No monthly usage-metering exists.** AI caps are a new build.

### Current allocation (the thing being repackaged)

| Entitlement                                             | Starter | Growth | Audit-Ready          |
| ------------------------------------------------------- | ------- | ------ | -------------------- |
| `activeGrantCap`                                        | 10      | 30     | 100                  |
| `hasGrantOpportunitySearch`                             | ✅      | ✅     | ✅                   |
| `hasGrantBudgetBasics`                                  | ✅      | ✅     | ✅                   |
| `hasAutomationEmails`                                   | ❌      | ✅     | ✅                   |
| `hasRestrictionLifecycle`                               | ❌      | ✅     | ✅                   |
| `hasGrantBudgetAlerts`                                  | ❌      | ✅     | ✅                   |
| `hasAwardDocumentIntake`                                | ❌      | ✅     | ✅                   |
| `hasAskYourLedger`                                      | ❌      | ❌     | ✅                   |
| `hasComplianceReportPack`                               | ❌      | ✅     | ✅                   |
| `hasPaymentRequests`                                    | ❌      | ✅     | ✅                   |
| `hasGrantBudgetExports`                                 | ❌      | ✅     | ✅                   |
| `hasPlannedExpenses`                                    | ❌      | ✅     | ✅                   |
| `hasGrantBudgetAiExtraction`                            | ❌      | ✅     | ✅                   |
| `hasPledgeTracker`                                      | ❌      | ✅     | ✅                   |
| `hasFunctionalExpenseAllocation`                        | ❌      | ✅     | ✅                   |
| `canViewProgramContext`                                 | ❌      | ✅     | ✅                   |
| `hasAccountingIntegrations` (QBO)                       | ❌      | ❌     | ✅                   |
| `hasProposalReportDrafting`                             | ❌      | ❌     | ✅                   |
| `hasRestrictionEvidencePackage`                         | ❌      | ❌     | ✅                   |
| `hasAuditorFunderPortal`                                | ❌      | ❌     | ✅                   |
| `hasIndirectCostRules`                                  | ❌      | ❌     | ✅                   |
| `hasPaymentEvidencePackage`                             | ❌      | ❌     | ✅                   |
| `hasSubrecipientMonitoring`                             | ❌      | ❌     | ✅                   |
| `hasAccountingAnomalyDetector`                          | ❌      | ❌     | ✅                   |
| `hasGrantBudgetAmendments`                              | ❌      | ❌     | ✅                   |
| `hasGrantBudgetAuditViews`                              | ❌      | ❌     | ✅                   |
| `hasCrossEntityReportBuilder`                           | ❌      | ❌     | ✅                   |
| `hasOutcomeImpactMeasurement`                           | ❌      | ❌     | ✅                   |
| `hasRecurringGiftEngine`                                | ❌      | ❌     | ✅                   |
| `canManagePrograms` / `…Allocations` / `…ExportReports` | ❌      | ❌     | ✅                   |
| `hasGuidedOnboarding`                                   | ❌      | ❌     | ✅                   |
| `hasMultiEntityConsolidation`                           | ❌      | ❌     | ❌ (enterprise only) |

Starter today has only opportunity search + budget basics. Everything that makes
GrantPipe _GrantPipe_ — restriction tracking, deadline automation, AI — is off.
That is the "useless" complaint, confirmed.

## Design

### Part 1 — Tier repackaging

Three clean tier identities; **only deltas from current are called out**. Prices
and grant caps unchanged.

#### Starter - "Get out of spreadsheets" ($49/mo - 10 active grants)

Make it genuinely workable for a scrappy org. Turn **ON**:

| Entitlement               | Was | Now                           | Why                                                                                                                                                |
| ------------------------- | --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasAutomationEmails`     | ❌  | ✅                            | Deadline reminders are table stakes; every competitor has them. A nonprofit that misses a report deadline is the exact failure GrantPipe prevents. |
| `hasRestrictionLifecycle` | ❌  | ✅                            | Restricted-fund tracking is GrantPipe's reason to exist and a scrappy org's #1 need. Full lifecycle (terms, additions, releases).                  |
| `hasGrantBudgetAlerts`    | ❌  | ✅                            | Spend-down alerts are the core safety net; cheap to include, high trust value.                                                                     |
| `hasAwardDocumentIntake`  | ❌  | ✅ **capped 5 docs/mo**       | Entry AI differentiator — "AI included" from the first paid tier.                                                                                  |
| `hasAskYourLedger`        | ❌  | ✅ **capped 20 questions/mo** | Entry AI grounded Q&A; huge differentiator vs Instrumentl's AI gate.                                                                               |

Fences kept for Growth (stay OFF at Starter): compliance report pack, restriction
_evidence package_, budget exports, planned expenses, AI budget extraction,
drawdowns/reimbursements, pledge tracker, functional-expense studio, program
visibility.

#### Growth - "Operate & control" ($99/mo - 30 active grants - Most Popular)

The default for the core ICP. Already has: automation emails, compliance pack,
restriction lifecycle, AI Award Intake, AI budget extraction, budget
alerts/exports/planned, drawdowns, pledge tracker, functional-expense studio,
program visibility. **Add:**

| Entitlement                                      | Was | Now | Why                                                                                                                                                                                                                  |
| ------------------------------------------------ | --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasAccountingIntegrations` (QBO read-only sync) | ❌  | ✅  | Buyer research: QBO sync is non-negotiable for the $2M–$10M core ICP. Nobody bundles a fund-accounting/restriction layer synced to QuickBooks at mid-tier. "Works with your QuickBooks, adds what QuickBooks can't." |
| `hasProposalReportDrafting`                      | ❌  | ✅  | Development directors at the core ICP want proposal/report drafting; completes Growth's "full AI" story.                                                                                                             |

AI caps at Growth: **Award Intake and Ask-Your-Ledger become uncapped.**

#### Audit-Ready - "Prove it & withstand audit" ($199/mo - 100 active grants)

Remains the premium proof tier. **No features removed.** It keeps everything that
defines audit-readiness and remains clearly differentiated from Growth:
restriction _evidence package_ output, Auditor & Funder Portal, subrecipient
monitoring, indirect-cost rules, reimbursement evidence packets, anomaly
detector, budget amendment history + audit views, cross-entity report builder,
outcome & impact measurement, program-allocation _management_ (vs view), advanced
fund accounting, recurring gift engine, guided onboarding. AI uncapped.

**Anti-cannibalization check:** Growth still adds 3× grants, compliance pack,
restriction evidence/rollforward, budget exports, drawdowns, pledge + functional
expense, QBO sync, full AI drafting, and uncapped AI over Starter — a compelling
upgrade. Audit-Ready still has ~14 capabilities Growth lacks. Each tier upgrade
is clearly motivated.

### Part 2 — AI usage caps (new build)

AI entitlements are boolean today. Add **per-feature monthly caps** so AI can be
"included, capped" at Starter and uncapped at Growth+.

**Schema (`PlanEntitlements`):** add two numeric fields, where
`Number.POSITIVE_INFINITY` means uncapped:

| Field                     | Starter | Growth | Audit-Ready | Enterprise |
| ------------------------- | ------- | ------ | ----------- | ---------- |
| `awardIntakeMonthlyCap`   | 5       | ∞      | ∞           | ∞          |
| `askYourLedgerMonthlyCap` | 20      | ∞      | ∞           | ∞          |

**Metering.** Add a shared `getMonthlyAiUsage(db, { orgId, feature, now })`
helper that counts persisted usage in the current calendar month (org timezone =
UTC month boundary, consistent with existing date handling):

- **Award Intake** — count `document_extractions` rows of the award-intake kind
  created this month (already persisted; no new table).
- **Ask-Your-Ledger** — no per-question persistence exists today. Add a minimal
  append-only `ai_usage_events` table (`org_id`, `feature`, `created_at`) written
  once per successful `askLedger` call. Award Intake may also write to it for a
  single uniform counting path; final choice made in the plan, but the cap
  contract is: count successful, billable AI actions per feature per month.

**Enforcement.** At each service boundary, after the boolean entitlement check
and before doing the work:

1. Resolve the cap from `getPlanEntitlements(planTier)`.
2. If finite, read `getMonthlyAiUsage`. If `usage >= cap`, throw a typed
   `ai_usage_cap_reached` error carrying `{ feature, cap, used, upgradeToPlan }`.
3. Otherwise proceed; record the usage event on success.

`upgradeToPlan` = the next tier whose cap is higher (derived, not hardcoded).

**Client.** Map `ai_usage_cap_reached` to a friendly, non-blocking upgrade
prompt: "You've used all N of this month's [feature]. It resets [date], or
upgrade to [plan] for unlimited." Pill buttons, warm tone, no scare language.

### Part 3 — Catalog / pricing data

Update `PLAN_CATALOG` in `packages/shared/src/pricing.ts`:

- Per-tier `description` / `bestFit` / `chooseThisIf` rewritten to the three
  identities above.
- `features[]` bullets rewritten to match the new allocation (Starter gains
  reminders, restriction tracking, spend alerts, "AI Award Intake (5/mo)",
  "Ask-Your-Ledger (20/mo)"; Growth gains "QuickBooks sync", "Proposal & report
  drafting", "Unlimited AI"; Audit-Ready emphasizes evidence/portal/audit proof).
- Prices, `annualMonthlyEquiv`, `highlighted` (Growth) unchanged.
- `UNIVERSAL_PLAN_INCLUSIONS` may add "AI included on every paid plan."
- AI cap numbers in copy are derived from the entitlement caps (single source of
  truth), not re-typed as literals where avoidable.

### Part 4 — Communication overhaul (marketing surfaces)

Compliance-led; AI surfaced as "AI-assisted, human-confirmed." Surfaces:

1. **Homepage** (`apps/site/src/pages/index.astro`) — add an "AI that respects
   your judgment" capability band (Award Intake, Ask-Your-Ledger, Drafting,
   anomaly detection), each framed human-in-the-loop; add the "one system" + the
   post-2024 Uniform Guidance proof points; keep the compliance/proof spine.
2. **Pricing page** (`apps/site/src/pages/pricing.astro`) — per-tier identity
   sub-headers ("For nonprofits getting organized" / "For orgs running multiple
   grants" / "For orgs facing an audit"), "Everything in X, plus" structure,
   "Most Popular" emphasis on Growth, a full feature matrix with tooltips for
   compliance terms, and AI rows showing the caps.
3. **Product page** (`apps/site/src/pages/product.astro`) +
   `apps/site/src/lib/marketed-capabilities.ts` — add the missing AI capabilities
   as first-class narratives (Award Intake, Ask-Your-Ledger, Drafting, Anomaly
   Detector, Outcome Measurement).
4. **In-app** — `trial-upgrade-card.tsx`, `settings-billing-panel.tsx`, and
   locked-feature states surface what each upgrade unlocks in outcome language
   ("Prepare for your single audit…"); add the AI-cap upgrade prompt.
5. **Positioning / config** — `packages/shared/src/positioning.ts`,
   `apps/site/src/config/site.ts`, `apps/site/src/lib/pricing-txt.ts`,
   `apps/site/src/lib/launch-promo.ts` reviewed for consistency with the new
   tier identities.

**Copy rules (mandatory).** All new/changed user-facing copy passes the
`humanizer` skill, then `third-grade-copy`, then a zero-lies check against
product source of truth (no fabricated counts, testimonials, integrations, or
capabilities — founder writes from the builder perspective, never claims
nonprofit-sector experience). The 2 CFR 200 numbers must match the verified
post-2024 values; the existing `apps/site/src/audit-threshold-amount.test.ts`
regression guard must stay green.

### Part 5 — Observability

Per repo requirement, every changed capability path ships analytics + error
capture:

- **PostHog:** track `ai_usage_cap_reached` (feature, plan — no donor/funder/free
  text), upgrade-prompt views/clicks from cap prompts, and pricing/feature-matrix
  interactions using existing analytics helpers and privacy-safe names.
- **Sentry:** capture failures in the new metering helper, the cap-enforcement
  path, and the `ai_usage_events` write (best-effort; a metering write failure
  must not block a successful AI answer, but must be reported).
- **Tests:** prove analytics + Sentry hooks fire on the cap success/exceeded
  paths, or document existing shared-wrapper coverage.

## Testing strategy

TDD, 95% per-file coverage on every touched file.

- **`packages/shared`** — `PLAN_ENTITLEMENTS` snapshot/contract tests for the new
  allocation; new cap fields present on every tier; `getMinimumPlanForFeatures`
  reflects the moved features (Award Intake → starter, Ask-Your-Ledger →
  starter, QBO → growth, Drafting → growth); pricing-catalog contract tests.
- **`apps/api`** — cap enforcement in document-extractions and ledger-assistant:
  under-cap succeeds + records usage; at-cap throws `ai_usage_cap_reached` with
  correct `upgradeToPlan`; uncapped tiers never throttle; metering helper counts
  the right month boundary; metering-write failure is reported but non-blocking.
- **`apps/web`** — cap-reached error maps to the upgrade prompt; locked-feature
  and trial-upgrade surfaces render the new unlock copy.
- **`apps/site`** — feature-page / entitlement-contract tests
  (`feature-pages-entitlement-contract.test.ts`,
  `feature-landing-pages-contract.test.ts`) updated for the new minimum plans;
  `audit-threshold-amount.test.ts` stays green.

## Migration / rollout

- DB migration adds `ai_usage_events` (or chosen metering table) via
  `pnpm --filter @grantpipe/db generate` → `migrate`.
- Entitlement changes are pure config; existing customers on each tier
  immediately gain the newly-included features (a strict upgrade — no one loses
  access). Starter customers gain reminders/restriction/alerts/AI; Growth
  customers gain QBO + drafting + uncapped AI. No downgrades.
- Stripe price IDs unchanged (prices fixed). No checkout changes.
- Deploy all three apps via Wrangler (`deploy:api`, `deploy:web`, `deploy:site`).

## Out of scope

- Any price change, grant-cap change, or new tier (free or otherwise).
- New AI capabilities — this packages and communicates existing ones.
- Multi-entity consolidation (stays enterprise-only).
- Stripe checkout / billing-flow changes beyond display copy.

## Open questions

None blocking. The metering table-vs-derived-count choice for Award Intake is an
implementation detail resolved in the plan; the cap contract is fixed here.
