# Config-driven promo engine + July 3 deadline

**Date:** 2026-06-23
**Status:** Approved (goal-directed)
**Author:** Angel Campa / Claude

## Goal

1. Make the existing **80% off first year** launch promo **end Friday, July 3, 2026**, and make that deadline clear everywhere it makes sense.
2. Replace the one-off hardcoded launch promo with a **config-driven promo engine** that supports future promo types: time-limited discounts, bonus inclusions ("extra stuff"), and added support ("extra support").
3. After the deadline, everything reverts to full list price automatically.

## Decisions (locked)

- **Date is the hard end.** Promo ends at the July 3 deadline regardless of redemptions. The existing redemption caps stay as a silent safety ceiling.
- **Revert to full price** after the deadline — no follow-up promo.
- **Live countdown + explicit date** on the marketing site.
- **Config-driven promo engine**, one active promo at a time, swapped by editing config.
- **Cutoff instant:** `2026-07-04T06:59:59Z` = end of day **July 3 Pacific (PDT, UTC-7)**, so no one on the continent loses the deal early.

## Architecture

### Static-site reality

`apps/site` is statically built Astro on Cloudflare Pages. Prices render at **build time**. Therefore deactivation is enforced at three layers:

1. **Client-side auto-hide** — the promo banner already supports an `endsAt` expiry; the countdown ticks client-side and the banner removes itself once the deadline passes, with **no redeploy required**.
2. **API enforcement (hard money gate)** — the checkout promo resolver and the public `/launch-promo` endpoint become date-aware. After the cutoff, checkout refuses to attach the discount code and the endpoint reports the promo inactive. A stale static page cannot get the discount post-deadline.
3. **Post-deadline redeploy** — a normal redeploy after July 3 rebuilds the static site at full price (build-time `getActivePromo(now)` returns `null`). Tested by building with a mocked clock for both states.

The **web app** (`apps/web`) is a runtime React SPA, so its `new Date()` date-gating reverts live with no redeploy.

### New module: `packages/shared/src/promos.ts`

Owns promo **definition + activation**. `pricing.ts` keeps the **price math**. To avoid a circular import, `LaunchPromo` type, `LAUNCH_PROMO_PHASES`, `getLaunchPromoForBillingCycle`, and `pickActiveLaunchPhase` move from `pricing.ts` into `promos.ts`; `pricing.ts` imports them back. `promos.ts` imports only from `./constants`. `index.ts` re-exports everything so external import sites are unaffected.

```ts
export type PromoKind = "discount"; // future: "bonus" | "added_support" composed via fields below

export type Promo = {
  slug: string;
  name: string;
  kind: PromoKind;
  /** Activation window. endsAt is the advertised deadline. */
  window: { startsAt?: string; endsAt?: string }; // ISO 8601 instants
  discount: {
    kind: "percent" | "amount";
    /** percentOff (1-100) when kind==="percent"; cents off when kind==="amount" */
    value: number;
    appliesToCycle: "monthly" | "annual" | "both";
  };
  /** Per-code redemption caps — silent safety ceiling, NOT advertised. */
  redemptionCaps?: Partial<Record<LaunchPromoCode, number>>;
  /** Discount phases (Stripe codes + per-cycle eligibility). */
  phases: readonly LaunchPromo[];
  /** "extra stuff" — rendered only when present. */
  bonuses?: readonly string[];
  /** "extra support" — rendered only when present. */
  addedSupport?: string | null;
  copy: {
    badge: string;
    headline: string;
    bannerEyebrow: string;
    bannerMessage: string;
    /** Human deadline line, e.g. "Offer ends Friday, July 3". */
    deadlineLine: string;
  };
};

export const PROMO_CATALOG: readonly Promo[]; // currently: the 80% launch promo w/ endsAt
export function getActivePromo(now?: Date): Promo | null; // window-gated single active promo
export function isPromoWindowOpen(promo: Promo, now?: Date): boolean;
export const LAUNCH_PROMO_DEADLINE_ISO = "2026-07-04T06:59:59.000Z";
export function getPromoDeadlineLabel(): string; // "Friday, July 3"
```

`getActivePromo(now)` returns the first catalog promo whose `[startsAt, endsAt]` window contains `now`, else `null`. Redemption caps are NOT checked here (they need live Stripe data); they remain a poller-side ceiling.

### `pricing.ts` changes

- `isLaunchPromoEligible(tier, cycle, now, promo)` — **now honors `now`**: returns `false` when `getActivePromo(now)` is `null` (deadline passed / no active promo). This single change cascades: `getLaunchPromoPriceCents` → `null` after the deadline → display helpers return `null` → cards/copy revert to list price.
- `getLaunchPromoForBillingCycle` / `pickActiveLaunchPhase` re-exported from `promos.ts`.
- `getGrantPipePricingCopy()` gains promo-deadline-aware copy (deadline line) and, when the active promo has `bonuses`/`addedSupport`, surfaces them. The 80% promo has neither, so those render nothing.

### API (`apps/api`)

- `resolveCheckoutPromoCode` (in `src/lib/integrations.ts`): refuse to attach a launch code when `getActivePromo(new Date())` is `null`. Falls through to `allow_promotion_codes` / no discount. A Sentry breadcrumb is added on the "promo expired, code refused" path.
- `launch-promo-poller.ts` + `GET /launch-promo` (`src/domains/public/routes.ts`): response gains `active: boolean`, `endsAt: string`, `deadlineLabel: string`. `active` is `false` once the window closes. Poller still records redemptions for the safety ceiling.

### Marketing site (`apps/site`)

- **Promo banner** (`config/site.ts` `promoBanner`): set `endsAt` to the cutoff ISO and message to include the deadline. Banner component (`packages/ui/src/site/components/promo-banner.astro`) gains a **live countdown** rendered client-side from `endsAt` ("Ends in 4d 12h 30m") next to "Offer ends Friday, July 3"; existing expiry JS hides it after the cutoff.
- **Pricing cards / offer-stack / FAQ / SEO / machine-readable / pricing-txt**: add the deadline line; render `bonuses`/`addedSupport` only when the active promo provides them.
- `lib/launch-promo.ts`: consume the new `active`/`endsAt` fields; treat `active:false` as "no promo" for client-driven scarcity display.

### Web app (`apps/web`)

- `settings-billing-panel.tsx`: route promo display through `getActivePromo`/date-aware eligibility; show the deadline; revert to full price with no code attached after the cutoff.
- `routes/signup.tsx`: keep existing `?promo=` plumbing; it already logs `promo_code` to analytics.

## Observability (required)

- **PostHog:** `promo_banner_viewed` (site, with `promo_slug`, no PII), `promo_countdown_expired` (client, when banner self-hides), existing `promo_code` on signup retained.
- **Sentry:** capture in the poller failure path (already wrapped) and add a breadcrumb/capture when checkout refuses an expired promo code. Reuse existing helpers/tags.
- **Tests** prove analytics + Sentry hooks fire on the new success/failure paths.

## Testing (TDD)

- **New** `packages/shared/src/promos.test.ts`: active before cutoff, inactive after, window math, caps untouched, bonus/support presence rendering, full-price reversion via `getLaunchPromoPriceCents` with mocked `now`.
- **Flip** `apps/site/src/.../site-promo-banner-config.test.ts`: currently _forbids_ `endsAt`/deadline copy → now _requires_ `endsAt` set to the cutoff and the deadline line present.
- **Update in lockstep**: copy/price contract tests (`site.test.ts`, `machine-readable.test.ts`, `pricing-txt`, `grantpipe-tier-copy-contract.test.ts`, AI-SDR context test) to include the deadline line.
- **API** tests: checkout refuses expired promo; `/launch-promo` returns `active:false` after cutoff.
- **Web** test: billing panel reverts to full price after cutoff.
- 95% per-file coverage on every touched file.

## Out of scope (YAGNI)

- Admin UI for promos, concurrent/stackable promos, per-audience targeting, scheduling calendar. The engine supports one active promo swapped via config; that covers the stated near-term needs (limited-time, extra stuff, extra support).

## Completion sequence

Worktree → TDD implementation via sub-agents → code review → fix → merge to master → remove worktree → deploy site + web + api via Wrangler scripts.
