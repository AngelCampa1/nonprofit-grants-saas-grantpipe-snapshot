# Recurring Gift Engine and Dunning PRD

Status: Retired on 2026-07-03.

GrantPipe no longer ships donor payment processing through Stripe Connect. The
retired implementation used `/recurring-gifts`, Stripe Connect onboarding,
Stripe-hosted Checkout, Connect webhooks, and `recurring_gift_*` tables. Those
surfaces were removed so GrantPipe stays out of donor payment processing.

GrantPipe's own SaaS subscription billing remains under `/billing`.
