# Plan Repackaging — Entitlements, Tier Promises, and Surface Alignment (C onwards)

**Date:** 2026-07-03
**Status:** Approved by Angel (chat, 2026-07-03)
**Scope owner:** This workstream owns sections C–G below. Sections A (new prices) and B (80%-off promo removal) are owned by a separate concurrent agent and are explicitly OUT of scope here, except for verification/coordination noted in "Dependencies".

## Context

GrantPipe is repricing (Starter $49/$39, Growth $99/$79, Audit-Ready $199/$159 monthly/annual-equivalent, with annual totals of $468/$948/$1,908 and 20% annual savings) and removing the 80%-off launch promo. In parallel, plan packaging changes so each tier's promises match its price. Zero paid subscriptions exist (verified 2026-06-23), so no grandfathering is required - but re-verify before shipping.

## C. Entitlement changes (source of truth: `PLAN_ENTITLEMENTS` in `packages/shared/src/constants/index.ts`)

1. **Starter loses Ask-Your-Ledger entirely.** Today Starter has a 20-questions/month metered cap. After this change, ask-your-ledger is Growth+. The Starter enforcement path changes from a metered 402 `AI_USAGE_CAP_REACHED` to a plan-gate upgrade error consistent with other gated features. Enforced server-side in the API route, not just hidden in UI.
2. **Starter keeps AI Award Document Intake, capped at 5/month.** No change. The AI metering system (`apps/api/src/lib/ai-usage.ts`, `packages/shared/src/errors/ai-usage.ts`) remains, now covering award intake only for Starter.
3. **Starter gains Grant Budget Exports (PDF/CSV/JSON)** (moves down from Growth). A $49 product that tracks budgets must let users get them out; Growth's upsell levers remain planned expenses, compliance report pack, unlimited AI, and indirect cost rules. QuickBooks sync is not a tier promise.
4. **Growth gains Indirect Cost Rules** (moves down from Audit-Ready). API gating and web UI unlock for Growth. Audit-Ready/Enterprise unchanged.
5. **Growth gains Reimbursement Evidence Packets** (moves down from Audit-Ready). Pairs with drawdowns/reimbursement requests, already Growth — the workflow no longer splits across tiers.
6. **Growth active-grant cap raises 30 → 50.** Starter 10, Audit-Ready 100, Enterprise unlimited — all unchanged. Cap enforcement, upgrade prompts, and pricing FAQ overage copy updated.
7. **No other movement.** Anomaly & misallocation detector, guided onboarding, SEFA, auditor & funder portal, subrecipient monitoring, restriction evidence packages, amendment history stay Audit-Ready+. Cross-Entity Report Builder stays Enterprise-only (contract test pins this; must keep passing).

## D. Tier positioning (canonical copy direction)

- **Starter ($39 annual-equivalent / $49 monthly):** run donors + grants properly, with budget exports included; AI reads your award documents (5 intakes/month). Copy must sell Starter AI as document intake specifically - not a generic "AI included" claim, since ask-your-ledger is no longer in the tier.
- **Growth ($79 annual-equivalent / $99 monthly):** everything a funded nonprofit runs day-to-day - native accounting records, unlimited AI (award intake, ask-your-ledger, budget extraction, proposal drafting, outcome measurement), indirect cost rates, reimbursement requests with evidence packets, room for 50 active grants. External accounting sync, including QuickBooks Online sync, is not available right now.
- **Audit-Ready ($159 annual-equivalent / $199 monthly):** when the auditor is coming - SEFA/single-audit support, restriction evidence packages, auditor & funder portal, subrecipient monitoring, anomaly detection, amendment history, guided onboarding.

All user-facing copy derived from this must pass `humanizer`, then `third-grade-copy`, then a zero-lies check against the coded entitlement matrix.

## E. Surfaces that must agree with C and D

- **Site (`apps/site`):** `pricing.astro`, `pricing-plan-cards.astro`, `pricing-copy-tokens.ts`, plan comparison matrix, pricing calculator, FAQ (grant caps), homepage/feature pages naming tier availability, schema.org/SEO contract.
- **Web (`apps/web`):** billing settings panel, plan display helpers, upgrade paywalls/prompts, ask-your-ledger locked state for Starter with upgrade CTA, indirect-cost-rules unlocked for Growth, grant-cap messages.
- **API (`apps/api`):** ask-your-ledger route plan-gate, indirect-cost-rules route gate, grant cap enforcement, AI metering scope reduction.
- **AI-CS grounding:** `packages/shared/src/knowledge/ai-cs/feature-knowledge.ts` teaches the new tier facts.
- **Content:** grep `content/`, email templates, lead-nurture copy for stale tier-availability claims.
- **Tests pinning the matrix:** `pricing.test.ts` (only if entitlement-adjacent; prices are the other agent's), `constants/index.test.ts`, `ai-usage` tests, `grantpipe-tier-copy-contract.test.ts`, `plan-display.test.ts`, SEO contract test.

## F. Stripe (verification-only unless the pricing agent hasn't covered it)

New Stripe prices/promo-code deactivation belong to the pricing agent (A/B). This workstream verifies after their merge: 6 new prices exist and bind to checkout, old prices archived, M80OFF/Y80OFF deactivated, zero paid subscriptions still true. If gaps are found, close them then.

## G. Quality gates (repo policy)

- TDD: failing test first for every entitlement/gate change. 95% coverage per touched file.
- Observability: PostHog events + Sentry capture on new gate paths (ask-ledger upsell hit on Starter, indirect-cost unlock usage, grant-cap prompt), with tests or verified shared-wrapper coverage. Privacy-safe event names.
- Buttons introduced/edited are pills (`rounded-full`).
- Review before merge; fix all findings; merge to `master`; remove worktree; deploy api + web + site via Wrangler scripts.
- Post-deploy prod verification: Starter account hits ask-ledger upgrade gate; Growth sees indirect cost rules; grant-cap copy shows 50; site tier promises match matrix.

## Dependencies & sequencing

- Sections A/B are WIP by another agent in parallel. This workstream implements in a worktree branched from current `master`; before merge, rebase onto `master` after the pricing agent lands (or coordinate ordering). The site tier-copy contract test is the tripwire that catches copy/price drift between the two workstreams.
- `packages/shared` commits trigger the full ~13-minute coverage gate and need a prior web build; re-run turbo with `--force` after merges.

## Error handling

- Ask-your-ledger on Starter returns the standard plan-gate error shape (as other gated features do) with an "upgrade to Growth" recommendation; web renders the locked/upsell state, never a dead button.
- Grant cap at 50 for Growth returns the existing cap error with updated numbers; upgrade prompt points to Audit-Ready.

## Out of scope

- Price constants, promo engine changes, Stripe price creation (pricing agent).
- Enterprise tier changes. Anomaly detector, guided onboarding stay put.
- Trial mechanics (trials continue resolving effectivePlanTier to audit_ready).
