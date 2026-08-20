# Ask-Your-Ledger PRD

## Summary

Ask-Your-Ledger lets finance and grant staff ask narrow ledger questions and get
grounded answers. The first version answers grant budget risk and restricted
fund balance questions from GrantPipe records. It does not generate SQL, create
numbers, or answer outside the allowlisted question set.

## Jobs To Be Done

- As a finance lead, I want a quick answer about budget risk so I can spot
  grants that need review.
- As a grants manager, I want a plain answer with source links so I can check
  the math before I act.
- As an auditor, I want read-only answers tied to GrantPipe records so I can
  review funds and grants without seeing donor data.

## Scope

Included:

- Audit-Ready and Enterprise entitlement via `hasAskYourLedger`.
- App route at `/reports/ask-ledger`.
- API route at `/ask-ledger/ask`.
- Report view and accounting view permission checks.
- Deterministic answers for grant budget risk and restricted fund balances.
- Citations for every answer.
- Safe PostHog events and Sentry error capture.

Not included:

- Free-form SQL generation.
- Model-selected database tables.
- Legal or accounting advice.
- Answers for donor-specific questions.
- Scheduled digests or saved answer threads.

## API

Base path: `/ask-ledger`

- `POST /ask`: accepts a question and returns a grounded answer.

The route requires:

- Active billing.
- Audit-Ready or Enterprise plan access.
- `reports:view`.
- `accounting:view`.

Analytics must not send raw question text. Allowed event fields include surface,
operation, mode, intent type, date range presence, confidence, result count
bucket, citation count bucket, and failure type.

## UX

The first app screen is `/reports/ask-ledger`.

The page has:

- Question input.
- Example question buttons.
- Submit action.
- Answer panel.
- Citation links.
- Safeguards shown with the answer.
- Error state.

The existing Reports page links to the assistant.

## Validation

- Question is required.
- Question length is capped.
- Mode defaults to deterministic.
- Unsupported questions return a low-confidence fallback.
- Answers must include at least one citation.

## Release Checks

- Shared validator tests cover question parsing and answer shape.
- API service tests cover supported intents, citations, entitlement gating, and
  unsupported fallback.
- API route tests cover permission gating, safe analytics, and Sentry capture
  for analytics failures.
- Web hook tests cover safe PostHog and Sentry instrumentation.
- Web route tests cover submit, examples, answer display, citations, and error
  state.
