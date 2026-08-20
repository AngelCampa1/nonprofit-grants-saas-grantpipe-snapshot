# Wave 0.5 messaging claims ledger

Date: 2026-06-25
Owner: GrantPipe messaging foundation

## Live-safe claims

| Claim                                               | Status                  | Allowed use                                                                                                                            |
| --------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| "Always know where every dollar went."              | Safe as positioning     | Hero or pricing headline after copy gate. Pair with concrete proof paths, not unsupported speed promises.                              |
| "Donors, grants, funds, and records stay together." | Safe                    | Public site and pricing copy. This matches shipped product surfaces and Data Migration Studio imports.                                 |
| "Bring your tracker."                               | Safe with scope         | Use for supported tracker/import paths. Do not imply every legacy system can be migrated without review.                               |
| "GrantPipe includes native accounting records."     | Safe with scope         | Pair with the boundary that external accounting sync, including QuickBooks sync, is not available right now.                           |
| "The AI never acts alone. You confirm."             | Safe with scope         | Use for award intake and ledger-question flows where the user reviews sources before accepting output.                                 |
| "Founding price ends July 3."                       | Safe while promo active | Use as secondary urgency only. It must disappear when runtime promo state is inactive.                                                 |

## Gated claims

| Claim                                                                       | Gate before live publication                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$30K-$80K` assembled-stack or consultant floor                             | Keep tagged `[planning estimate]` in internal docs until verified against real fractional-CFO, audit-prep, or implementation-service pricing. Do not publish on the live pricing page before verification. |
| "No consultant"                                                             | Only use with a narrow explanation of shipped guided imports and staff-led setup. Do not make it a blanket implementation promise.                                                                         |
| "Full grant portfolio"                                                      | Do not use for capped self-serve plans. Starter, Growth, and Audit-Ready have active-grant caps.                                                                                                           |
| "Unlimited AI"                                                              | Do not use as a blanket site claim. Starter has monthly limits; Growth and up remove those limits for specific AI tools.                                                                                   |
| Fiscal-sponsor roll-ups, agency-client workflows, inter-entity eliminations | Keep gated until the later roll-up product work ships.                                                                                                                                                     |

## Copy source map

- Core reframe: `docs/offers/gtm-reframe-message-market.md`
- Offer stack and gated cost anchor: `docs/offers/grand-slam-offer.md`
- Founder setup language: `docs/offers/founder-setup-offer.md`
- Roadmap truth source: `docs/offers/MASTER-BUILD-ROADMAP.md`
- Execution evidence: `docs/offers/ROADMAP-EXECUTION-LEDGER.md`
- Live pricing data: `packages/shared/src/pricing.ts`
- Promo deadline and phase data: `packages/shared/src/promos.ts`

## Publication rule

Every public line must pass `humanizer`, `third-grade-copy`, zero-lies review,
and fit review. If a line depends on a gated claim above, keep it in docs until
the gate is cleared.
