# Wave 0 trial-to-pay copy gate

Date: 2026-06-24

Scope:

- Expired-trial paywall title, body copy, and primary CTA.
- Billing recovery copy and CTA for non-trial billing blocks.
- Non-admin blocked-screen copy.

Final copy:

- "Start billing to keep using GrantPipe"
- "Your free trial ended. Start the Starter annual plan to get back in."
- "Your free trial ended. Start the Growth annual plan to get back in."
- "Your free trial ended. Start the Audit-Ready annual plan to get back in."
- "Start Starter annual"
- "Start Growth annual"
- "Start Audit-Ready annual"
- "Your free trial has ended"
- "Your free trial ended. Ask an admin to choose a plan so your team can keep using GrantPipe."
- "Billing action required"
- "Your billing stopped. Add billing to get back in."
- "Add billing from Settings to keep using GrantPipe."
- "Ask an admin to add billing. They can get you back in."
- "Start billing"
- "We could not start checkout. Try again or start billing in Settings."

Humanizer pass:

- Removed settings-detour wording from the expired-trial purchase path.
- Kept the message plain and specific. No fake proof, numbers, urgency, or broad claims were added.
- No em dashes, rule-of-three phrasing, vague superlatives, or promotional filler.
- Removed data-loss wording after review because the product source only proves access is blocked, not that data is at risk.

Third-grade-copy pass:

- `echo Start billing to keep using GrantPipe | python <third-grade-copy>/scripts/evaluate_copy.py --headline` passed.
- `echo Start Starter annual | python <third-grade-copy>/scripts/evaluate_copy.py --cta` passed.
- `echo Start Growth annual | python <third-grade-copy>/scripts/evaluate_copy.py --cta` passed.
- `echo Start Audit-Ready annual | python <third-grade-copy>/scripts/evaluate_copy.py --cta` passed.
- `echo Start billing | python <third-grade-copy>/scripts/evaluate_copy.py --cta` passed.
- Body-copy evaluation with required term `GrantPipe` passed after the review revisions: average sentence length under 10 words, max sentence length 14 words, and Flesch-Kincaid grade about 3 or lower.

Zero-lies check:

- "Free trial ended" comes from `paywall.state.reason === "trial_expired"`.
- The expired-trial CTA names the plan and annual billing before redirecting to Stripe checkout.
- Fallback checkout copy says `Growth annual` because invalid or missing plan data falls back to Growth annual in `_authenticated.tsx`.
- No pricing, discount, guarantee, testimonial, customer count, deadline, or integration claim was added.

Contextual fit:

- Admins with expired trials get a direct checkout CTA for the selected annual plan.
- Non-admins are told to ask an admin.
- Canceled or inactive billing still routes admins to the billing recovery path.
- Checkout-start failures show an inline recovery message instead of leaving the user with no feedback.
