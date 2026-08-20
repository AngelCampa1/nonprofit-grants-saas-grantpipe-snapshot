# Wave 0.5 messaging foundation plan

Date: 2026-06-25
Branch: `codex/roadmap-wave05-messaging-foundation`
Worktree: `.worktrees/roadmap-wave05-messaging-foundation`

## Goal

Move GrantPipe off discount-led messaging without publishing unsupported claims.
The first production slice makes launch promo rendering obey the runtime active
state and creates the source docs needed before broader hero and pricing copy
changes.

## Scope

- Centralize public pricing promo display around the fetched promo state.
- Keep signup CTAs aligned with active promo phase codes.
- Keep pricing schema aligned with visible pricing.
- Reconcile Wave 0.4 as complete in the roadmap and ledger.
- Create the Wave 0.5 claims ledger, promo reversion runbook, and copy gate.

## Out of scope for this slice

- Publishing `$30K-$80K` on the live pricing page before external verification.
- Publishing broad "no consultant" or "full grant portfolio" claims.
- Sending live outbound email, posting social content, or launching paid ads.

## TDD checks

1. Add failing site contract tests for active promo gating in pricing cards,
   offer stack, and pricing schema.
2. Add failing signup-source assertions for promo-code CTA URLs.
3. Implement the narrow promo-state fix.
4. Re-run targeted tests, then broader site/shared gates before merge.

## Review and release

Use sub-agent read-only critique for promo implementation and no-lies copy
risks, then request a post-implementation review. Merge to `master`, remove the
worktree, deploy affected apps through Wrangler scripts, and live-check
`https://grantpipe.com/pricing/`.
