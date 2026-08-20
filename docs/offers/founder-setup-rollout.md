# The Founder Setup — Rollout Plan (internal)

Companion to [founder-setup-offer.md](./founder-setup-offer.md). This is the work needed to ship the flagship offer honestly. Internal engineering/ops doc — not subject to the copy gates.

Offer: **The Founder Setup**, Guarantee **Tier B** (conditional service guarantee), scoped to **Audit-Ready / Enterprise**.

## Verified code facts (the plan rests on these)

- `hasGuidedOnboarding` in `packages/shared/src/constants/index.ts`: `false` on Starter and Growth, `true` on Audit-Ready and Enterprise. The founder-led session can only be promised where this is true.
- Promo redemption caps in `packages/shared/src/promos.ts`: `M80OFF` = 100, `Y80OFF` = 200 (confirmed by `promos.test.ts:51-52`). Total redeemable = **300**, not 100. Any "Founding 100" claim is a lie until reconciled.
- Promo deadline July 3, 2026 is real and code-enforced via `getActivePromo`. The static Astro site does NOT auto-revert promo copy (per repo memory: site is static, needs redeploy).

## Workstreams

### 1. Entitlement gating (correctness guard)

- Gate the Founder Setup offer surface and guarantee on `getPlanEntitlements(tier).hasGuidedOnboarding === true`. Do not render the offer or its guarantee for Starter/Growth.
- If annual Growth gets a courtesy founder call, label it a **courtesy**, never an entitlement, in copy and in any booking flow.
- Test: assert the offer block + guarantee are absent for `starter`/`growth` and present for `audit_ready`/`enterprise`.

### 2. Scarcity that is real (founder-session cohort cap)

- Add a hard cap on bookable founder-setup sessions per month, tied to actual calendar capacity. This is the truest scarcity GrantPipe has.
- When the cap is hit: show a waitlist path; keep product + free trial fully open.
- New work — there is no session-cap primitive today. Smallest honest version: a configurable monthly slot count + a booked-count check before the Cal.com handoff (`FOUNDER_BOOKING_URLS.onboardingCall`), with a waitlist capture when full.
- Do not advertise a hard seat number until #3 is resolved.

### 3. Reconcile the "Founding" count (kill the lie risk)

- Decide one of:
  - (a) Drop the hard number. Copy says "founding cohort, closes July 3." (Ship-ready today.)
  - (b) Lower the promo caps in `promos.ts` so the stated number is true (e.g. set total redeemable to the number you advertise), and update `promos.test.ts`.
- Until (a) or (b) lands, the offer copy must not state a seat count. The draft already enforces this with an inline guardrail note.

### 4. Guarantee operations (Tier B fulfillment)

- Define the claim process: confirm the customer is on Audit-Ready/Enterprise + active paid plan, attended the session, and brought ≥1 real award document.
- Define the "live" check: first grant created, its deadlines on the calendar, its fund linked. These are founder-controlled outputs (no audit-outcome dependency).
- Clock/credit: clock starts at completed session + confirmed import; remedy capped at one paid month; reconcile the credit against Stripe.
- The quiet correctness line is a separate, narrower promise: reproducible calculation/alert defect from confirmed inputs → fix + month credit; data-entry/import errors excluded. Track these separately from Tier B claims.
- New operational work — script the attendance/credit tracking; do not run it from memory.

### 5. July 3 expiry ownership (the recurring landmine)

- Make the founding-window copy config-driven so it auto-expires on the deadline, OR calendar a named-owner site redeploy for July 3, 2026.
- The `getGrantPipePricingCopy()` already falls back to full-price copy when `getActivePromo()` returns null, so the API/web surfaces revert automatically. The **static site** is the exposure: stale promo copy past the deadline is a live lie and a legal risk.
- Repo memory flags this repeatedly. Treat it as an owned task, not a reminder.

### 6. Where the copy lands

- Offer surface candidates: a dedicated Audit-Ready offer block on `apps/site/src/pages/pricing.astro` and/or `apps/site/src/components/offer-stack.astro`; the guarantee terms near the existing `GRANTPIPE_GUARANTEE_COPY` reference.
- Keep `GRANTPIPE_GUARANTEE_COPY` (the live 30-day money-back) intact. Tier B sits on top of it, it does not replace it.
- Any new buyer-facing string must re-clear `humanizer` → `third-grade-copy` before publish.

### 7. Observability (required by CLAUDE.md — no feature without it)

- PostHog (privacy-safe event names, no donor/funder/PII): `founder_setup_offer_viewed`, `founder_setup_cta_clicked`, `founder_setup_session_booked`, `founder_setup_waitlisted`, `founder_setup_guarantee_claimed`. Reuse existing analytics helpers.
- Sentry: capture failures at the booking handoff, the cohort-cap check, and the guarantee-claim/Stripe-credit path with existing helpers + feature tags.
- Tests: prove the analytics + Sentry hooks fire on the success and failure paths, or document existing shared-wrapper coverage.

## Honesty checklist (must all be true to ship)

- [ ] Founder Setup shown only where `hasGuidedOnboarding` is true.
- [ ] No stated seat count until promo caps are reconciled (or the number is dropped).
- [ ] No invented dollar tags; only "comparable to" framing against costs the buyer knows.
- [ ] QuickBooks sync is unavailable. Keep the CSV opening-balance import separate.
- [ ] Guarantee scoped to founder-controlled outputs, never an audit outcome.
- [ ] Remedy capped at one paid month; correctness SLA excludes data-entry/import errors.
- [ ] 30-day money-back and 1-month free trial language unchanged.
- [ ] July 3 expiry is an owned task or config-driven.
- [ ] PostHog + Sentry wired with tests.

## Suggested sequence

1. Ship copy on the Audit-Ready surface with "founding cohort, closes July 3" (no number) + Tier B guarantee terms. Re-run the copy gates.
2. Build the cohort-cap booking gate + waitlist; wire PostHog/Sentry.
3. Decide and implement the Founding count (drop vs reconcile caps).
4. Stand up the guarantee claim/credit tracking + Stripe reconciliation.
5. Lock the July 3 auto-expiry (config) or calendar the redeploy.
