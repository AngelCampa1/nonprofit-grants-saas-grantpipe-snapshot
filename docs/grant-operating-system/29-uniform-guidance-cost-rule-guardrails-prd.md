# Uniform Guidance Cost-Rule Guardrails PRD

## Summary

Uniform Guidance cost-rule guardrails check draft payment request lines before
staff add them to a federal reimbursement request. The first slice blocks lines
that use a budget line marked unallowable and warns when an expense may affect
modified total direct cost, or MTDC, treatment.

Official basis checked on June 26, 2026: the repo verified-facts table pins the
current federal values used in this slice at 15% de minimis, $50,000 MTDC
subaward cap, and a $10,000 federal equipment ceiling. Some organizations use a
lower equipment policy, so this slice warns on equipment-like costs until a
first-class org policy field exists.

## Jobs To Be Done

- As a grant finance lead, I want GrantPipe to block known unallowable federal
  cost lines, so they do not reach an auditor packet.
- As a reimbursement preparer, I want warnings for MTDC-sensitive expenses, so I
  know which lines may need indirect-cost review.
- As an admin, I want the same rule check on preview and save, so a user cannot
  bypass the warning surface by submitting directly.

## Scope

Included:

- Growth and above preview route for payment request line guardrails, aligned
  with add-line access.
- Server-side enforcement in the payment request line service.
- Guardrail findings for:
  - Budget lines marked `allowable = false`.
  - Subaward or subrecipient expenses above the $50,000 MTDC cap.
  - Equipment or capital expense lines that may need review against the federal
    ceiling and the organization's own policy.
  - Indirect lines when no active indirect-cost rule exists.
  - Indirect lines that do not match the active indirect-cost rule.
- Add-line dialog preview for eligible expenses.
- Privacy-safe PostHog events for previewed and blocked guardrail checks.
- Sentry capture for unexpected preview failures.

Not included:

- Legal or accounting advice.
- Reclassifying expenses automatically.
- Auto-detecting every unallowable Uniform Guidance category from free-form
  text.
- Calculating the lower of the federal equipment ceiling and the organization's
  own equipment policy. That requires a new org policy field.
- Replacing review by a grant manager, CPA, or auditor.
- Publishing buyer-facing Federal SKU claims before Wave 3.3 and 3.4 ship.

## Rule Behavior

The rule evaluator returns:

- `clear` when no finding applies.
- `warning` when the line can be saved but may need review.
- `blocked` when the line cannot be saved.

Blocking findings:

- Unallowable budget line.
- Missing active indirect-cost rule for an indirect line.
- Indirect line amount mismatch against the active rule.

Warning findings:

- Subaward or subrecipient expense above $50,000.
- Equipment or capital expense that may need policy review.

Server-side save enforcement checks the same rules as the preview route. Preview
is a user aid, not the only gate.

## Observability

- Preview success: `uniform_guidance_guardrails_previewed`.
- Preview blocked: `uniform_guidance_guardrails_blocked`.
- Preview failure: existing `payment_operation_failed` with operation
  `uniform_guidance_guardrail_preview`.
- Unexpected preview exception: Sentry context
  `uniform_guidance_guardrail_preview` with feature tag
  `ug_cost_rule_guardrails`.
- Client preview success and blocked states emit the same privacy-safe event
  names without request ids, donor names, funder names, or raw descriptions.

## Copy Guardrails

Allowed copy:

- "Checking award rules..."
- "Cost review blocked"
- "Cost may need review"
- "Fix this item before adding the line."

Forbidden copy:

- Guarantees that GrantPipe catches every disallowed federal cost.
- Claims that GrantPipe replaces an auditor or CPA.
- Claims that warnings are legal advice.
- Claims that MTDC treatment is complete without user review.
- Claims that GrantPipe knows the organization's lower equipment policy before
  that policy field ships.

## Tests First

Write failing tests before implementation:

- Shared validator tests for guardrail preview input and result payloads.
- Shared analytics tests for the new event names.
- API service tests for federal applicability, blocking budget lines, MTDC
  warnings, equipment warnings, and missing indirect rules.
- API route tests for preview payloads and privacy-safe analytics.
- Payment line service tests proving blocking findings prevent save.
- Web hook tests for preview success, blocked analytics, and sanitized event
  properties.
- Web dialog tests for warning display and blocked submit behavior.

## Release Checklist

- Rule constants match the repo verified-facts table.
- Preview and save use the same evaluator.
- 95% coverage is maintained for touched files.
- Copy passes humanizer, third-grade-copy, zero-lies, and fit-context checks.
- Roadmap row 3.2 is marked complete only after merge, deploy, and live checks.
