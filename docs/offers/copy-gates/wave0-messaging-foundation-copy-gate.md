# Wave 0.5 messaging foundation copy gate

Date: 2026-06-25

## Scope reviewed

- Promo-state pricing copy in `PricingPlanCards`.
- Promo-state offer-stack copy in `OfferStack`.
- Pricing schema and signup CTA promo-code behavior.
- Internal Wave 0.5 source docs and claim controls.

## Humanizer pass

Removed or avoided discount-first phrasing, fake urgency, broad "no consultant"
language, and abstract sales claims. The live change keeps existing plan copy
and only fixes when promo-specific text can render.

## Third-grade-copy pass

The new visible strings stay short:

- "Offer ends Friday, July 3"
- Existing "Limited price", "List price", and trial copy remain unchanged.

No new long public marketing block ships in this slice.

## Zero-lies pass

- `$30K-$80K` remains internal and tagged `[planning estimate]`.
- "No consultant" remains gated.
- "Full grant portfolio" remains blocked for capped self-serve plans.
- Broad "unlimited AI" was replaced on the edited public surfaces with scoped
  plan-limit language.
- Promo CTAs now include a promo code only when promo display is active.

## Fit pass

This slice supports the reframe without changing the entire live hero yet. The
discount now flows through the same fetched build-time promo state for pricing
cards, the offer stack, CTA URLs, and pricing schema. The static site still
needs the deadline redeploy in the runbook.
