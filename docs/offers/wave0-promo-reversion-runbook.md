# Wave 0.5 promo reversion runbook

Date: 2026-06-25

## Trigger

The launch promo ends at `LAUNCH_PROMO_DEADLINE_ISO` in
`packages/shared/src/promos.ts`. The public deadline label renders as Friday,
July 3 in Pacific time.

## Required behavior

- Pricing cards show launch promo prices only when the fetched build-time
  `activePromo` state is active and has remaining capacity.
- Pricing CTAs include `promo=M80OFF` or `promo=Y80OFF` only for the active
  phase and that phase's eligible billing cycle.
- The pricing offer stack shows the limited-offer card only while the fetched
  build-time promo state is active.
- Pricing schema stays on monthly list prices so annual promo invoices are not
  exposed as ambiguous bare prices.
- The discount is never the hero message. It is a secondary closing note while
  active.

## Verification

Run:

```bash
pnpm --filter @grantpipe/site test -- pricing-page-seo-contract.test.ts public-signup-source.test.ts
pnpm --filter @grantpipe/site test -- site-promo-banner-config.test.ts
pnpm --filter @grantpipe/shared test -- pricing.test.ts promos.test.ts
```

After deploy, check:

- `https://grantpipe.com/pricing/` returns 200.
- The visible plan cards match the runtime promo state.
- Signup links include promo codes only while the cards show limited pricing.
- The page source schema price remains the monthly list price.

## Manual deadline redeploy

Because the site is static, redeploy the site around the deadline. The code
uses the fetched promo state during build, so old HTML can stay stale until the
next deploy:

```bash
pnpm run deploy:site
```

Then rerun the live pricing checks.
