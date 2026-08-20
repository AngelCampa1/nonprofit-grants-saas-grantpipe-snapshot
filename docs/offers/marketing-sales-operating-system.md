# GrantPipe Marketing and Sales Operating System

Date: 2026-06-26
Owner: GrantPipe product, marketing, and sales
Status: internal source map

This document ties the funnel together. It does not replace the offer, pricing,
roadmap, claims ledger, or route tests. It tells future work where each truth
lives and how one step moves to the next.

## Operating Thesis

GrantPipe serves mid-sized US nonprofits with roughly $500K to $10M budgets that
manage donors, grants, restricted funds, reporting deadlines, and audit evidence
across too many tools.

The buyer is not paying for software trivia. They are paying to answer the hard
question: where did the dollar go, what is due next, and can we show the work?
The whole system exists to help them get that answer faster with less risk.

The business endpoint is paid conversion. The ethical route to that endpoint is
to give the buyer far more value than the price before and after they pay.
GrantPipe earns the sale by proving useful work, not by pressure, fake proof, or
unsupported claims.

## Funnel Spine

Acquisition -> activation -> first value -> paid conversion -> retention.

Every surface must do one job and point to one next step.

| Stage           | User state                                                        | Surface examples                                                            | Job                                                                                         | Next step                                                     |
| --------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Acquisition     | They know the pain but may not know GrantPipe                     | Homepage, SEO pages, paid LPs, LinkedIn, AI assistant                       | Teach the answerability problem and show why one system matters                             | Start a 1-month trial or take the relevant free resource      |
| Lead capture    | They want a specific asset or answer                              | Free tools, lead magnets, AI assistant handoff                              | Give a useful artifact that helps them now                                                  | Invite the 1-month trial when the next job needs live records |
| Activation      | They created an account                                           | Signup, onboarding, empty states                                            | Get them to a concrete setup action: sample records, import, or first manual record         | Reach first value, not a blank dashboard                      |
| First value     | They see records connected or have committed the next data action | Onboarding final step, dashboard, import, records, reports, Ask Your Ledger | Prove GrantPipe can answer a real question from records and keep the next data step obvious | Ask them to keep the system by choosing billing               |
| Paid conversion | They are near trial end or hit a paid gate                        | Billing panel, paywall, plan selection, feature gates                       | Preserve the chosen plan, explain what they keep, start checkout                            | Stripe checkout or founder call for custom path               |
| Retention       | They paid or are deciding to stay                                 | Emails, in-app alerts, reports, portal, support                             | Keep proving value through reminders, reports, evidence, and exports                        | Renew, expand, or book help when needed                       |

## Message Architecture

Primary promise: always know where every dollar went.

Mechanism: donors, grants, restricted funds, reporting dates, and ledger context
belong in one operating record.

Safety promise: GrantPipe includes native accounting records and does not sync
with QuickBooks right now. GrantPipe keeps the grant, donor, restricted fund,
accounting, evidence, and reporting record together.

Trust promise: AI never acts alone. Users confirm outputs before records are
created or changed.

Offer promise: a 1-month free trial with no card, clear public pricing, no setup
fee on self-serve plans, and a 30-day money-back guarantee after the first paid
month.

Builder stance: Angel built the product. Do not claim nonprofit sector tenure,
testimonials, customer counts, rankings, or social proof that has not been
approved and sourced.

## Product and Marketing Boundary

Allowed now:

- Donors, grants, funds, deadlines, reports, evidence, and activity live in one
  workspace.
- GrantPipe includes native accounting records.
- GrantPipe does not sync with QuickBooks right now.
- GrantPipe can track restricted fund context, grant budgets, releases,
  evidence, and audit-ready review trails according to plan entitlements.
- Every paid plan includes the scoped AI tools described in
  `packages/shared/src/pricing.ts`.
- Users start without a card and add billing later.

Gated or forbidden until a source changes:

- No self-serve claim may promise a completed setup without user review.
- No onboarding path may complete into a blank app without a chosen setup action.
- Do not say GrantPipe replaces QuickBooks, posts every journal entry, or removes
  all reconciliation work.
- Do not say "no email required" for a lead magnet unless the delivery path is
  truly ungated.
- Do not publish the `$30K-$80K` assembled-stack anchor as fact until the
  planning estimate is verified against named sources.
- Do not sell multi-entity consolidation, federal edition SKUs, or unbuilt
  roadmap items as current product.
- Do not use "most teams" or broad category claims without a named source.

## Revenue Path

The preferred path is:

1. Public page or social post teaches one real problem.
2. CTA preserves source, plan, billing cycle, and promo context.
3. Signup stores plan intent when present.
4. Onboarding gets to sample records, a committed import, or a first manual-record
   path. Do not mark onboarding complete on an import or scratch click alone.
5. Billing reads route search or stored signup intent and starts checkout for
   the same plan and cycle.
6. Stripe checkout completes the paid conversion.
7. The app keeps showing the next useful job: deadlines, reports, evidence,
   alerts, exports, and founder help when the plan includes it.

The user should never feel a hard reset between marketing, signup, onboarding,
billing, and checkout.

## System Source Map

| Truth                                                | Source                                                                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan prices, entitlements, guarantees, founder links | `packages/shared/src/pricing.ts`                                                                                                                                                  |
| Promo codes, deadline, and active promo behavior     | `packages/shared/src/promos.ts`                                                                                                                                                   |
| Public capability claims and allowed surfaces        | `packages/shared/src/capabilities.ts` (`CAPABILITY_CLAIMS`), `apps/site/src/lib/marketed-capabilities.ts`                                                                         |
| Public site funnel copy and CTAs                     | `apps/site/src/config/site.ts`                                                                                                                                                    |
| SEO and content URL system                           | `docs/seo/marketing-funnel-content-system.md`, `packages/shared/src/knowledge/marketing/content`, `apps/site/src/content-tests`                                                   |
| Paid landing page claim boundaries                   | `apps/site/src/paid-landing-pages-contract.test.ts`                                                                                                                               |
| Pricing and plan selection flow                      | `apps/site/src/pages/pricing.astro`, `apps/web/src/routes/signup.tsx`, `apps/web/src/routes/_authenticated/select-plan.tsx`, `apps/web/src/components/settings-billing-panel.tsx` |
| Messaging claims ledger                              | `docs/offers/wave0-messaging-claims-ledger.md`                                                                                                                                    |
| Offer strategy                                       | `docs/offers/grand-slam-offer.md`                                                                                                                                                 |
| Go-to-market roadmap                                 | `docs/offers/gtm-reframe-message-market.md`                                                                                                                                       |
| Signup to pay mechanics                              | `docs/offers/productization-system.md`                                                                                                                                            |
| LinkedIn publishing gate                             | `scripts/linkedin-post-review-gate.mjs`                                                                                                                                           |
| Lead magnet asset truth                              | `packages/shared/src/constants/lead-magnets.ts`                                                                                                                                   |
| Production E2E account variables                     | ignored `.env` keys named `GRANTPIPE_E2E_*`                                                                                                                                       |

## Drift-Prevention Gates

Before publishing or merging funnel work:

- Run relevant unit and contract tests for every touched package.
- Run `node scripts/linkedin-post-review-gate.mjs content/social/linkedin`
  before Postiz upload or scheduling.
- Check user-facing marketing copy with `humanizer`, then
  `third-grade-copy`, then zero-lies review, then fit review.
- Compare all price, promo, guarantee, and entitlement copy against
  `packages/shared/src/pricing.ts` and `packages/shared/src/promos.ts`.
- Every public capability claim must trace back to `CAPABILITY_CLAIMS` in
  `packages/shared/src/capabilities.ts`. Check `allowedPublicSurfaces` before
  using a claim on `features`, `pricing`, `machine-readable`, `public-kb`, or
  `ai-sdr` surfaces, and keep `/product` proof items aligned through
  `apps/site/src/lib/marketed-capabilities.ts`.
- Compare every accounting claim against the boundary: QuickBooks remains the
  accounting system.
- Keep every CTA connected to its next step. Marketing CTAs should preserve
  route context. Billing should preserve selected plan and cycle. Feature gates
  should lead to checkout or a founder call, not a dead end.
- Every new public page must have one next step, one claim source, and one
  place in the SEO and content URL system documented in
  `docs/seo/marketing-funnel-content-system.md`.
- Add a contract test when a new drift class is found.

## E2E Coverage Target

Local and production E2E should prove:

- Public CTA to signup preserves attribution, plan, cycle, and promo context.
- Signup leads new users to onboarding.
- Onboarding reaches at least one real data path, with no skip-to-blank-app path.
  Completion requires sample data success, a committed import with inserted rows,
  or a first manual record.
- Billing preselects the intended plan from route search or stored signup state.
- Checkout starts with the right plan, cycle, and active promo code.
- Paywall and feature gates give a working path to paid conversion.
- Lead magnet and social CTAs state only what the delivery path actually does.
- Production smoke uses the reusable `GRANTPIPE_E2E_*` account or creates a new
  disposable account without exposing secrets.

## Change Rule

Any future marketing, sales, onboarding, pricing, or billing change must answer
four questions before it ships:

1. What buyer problem does this step solve?
2. What exact next step does it point to?
3. What source proves the claim is true?
4. What test or gate prevents this from drifting later?

If any answer is missing, the work is not done.
