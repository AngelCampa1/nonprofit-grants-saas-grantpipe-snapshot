# Proposal and Report Drafting Assistant PRD

## Summary

The proposal and report drafting assistant helps staff draft grant proposal
narratives, interim reports, and final reports from GrantPipe records. The first
release is an editable drafting surface. It uses cited grant, budget, reporting,
impact metric, and outcome data. Staff review the text before it leaves
GrantPipe.

The assistant uses OpenRouter with MiniMax M2.7 through the
`minimax/minimax-m2.7` model id. The prompt is locked to GrantPipe source data
and must fail closed when the model key is not configured.

## Jobs To Be Done

- As a grants manager, I want a first draft from the grant record so I can start
  report work without rebuilding context by hand.
- As a program lead, I want the draft to show source gaps so I can fix missing
  outcome data before a report is sent.
- As a finance or operations reviewer, I want citations beside draft text so I
  can trace numbers and claims before approval.

## Scope

Included:

- Audit-Ready and Enterprise entitlement via `hasProposalReportDrafting`.
- API route at `/drafting-assistant/generate`.
- Reports workspace entry at `/reports/drafts`.
- Draft types for proposal narratives, interim reports, and final reports.
- Grounding from the selected grant, funder, reporting requirements, impact
  metrics, approved budget lines, and outcome goals.
- Editable draft sections in the web app.
- Human review gate before copy.
- Source citations and fixed safeguards in the response.
- Safe PostHog events on API and web paths.
- Sentry capture for API analytics failures and web generation failures.
- Public feature page at `/features/proposal-report-drafting-assistant`.

Not included:

- Auto-submission to funder portals.
- Email delivery to funders.
- A final-ready or legally approved report claim.
- Funder-specific scoring, eligibility advice, or success predictions.
- Client-level case data import.
- Bulk document assembly for every grant in one action.

## API

Base path: `/drafting-assistant`

- `POST /generate`: creates an editable draft from one selected grant.

The route requires:

- Active billing.
- Audit-Ready or Enterprise plan access.
- `grants:edit`.
- `reports:view`.
- `OPENROUTER_API_KEY` in the Worker secret store.

The request accepts:

- `grantId`
- `draftType`
- `userPrompt`
- Optional report period dates

The response returns:

- Draft title and body.
- Editable sections.
- Citations.
- Safeguards.
- Model id and prompt version.
- Generated timestamp.

## Prompt Rules

The system prompt must tell the model to:

- Return JSON only.
- Use only the supplied GrantPipe source context.
- Avoid invented facts, numbers, names, dates, testimonials, and funder rules.
- Mark missing data instead of filling gaps.
- Treat the output as an editable staff draft.
- Avoid language that implies GrantPipe submits or approves the report.

## UX

The first surface lives in Reports because staff begin report work there.

The page includes:

- Grant selector.
- Draft type selector.
- Staff instructions field.
- Draft rules panel.
- Generate button.
- Editable section textareas.
- Source list.
- Safeguard list.
- Human review checkbox.
- Copy button disabled until review is checked.

The primary future extension should add a contextual entry from the grant detail
page. The source of truth still stays the selected grant record.

## Observability

PostHog events:

- `drafting_assistant_started`
- `drafting_assistant_generated`
- `drafting_assistant_failed`

Allowed event fields:

- Surface.
- Draft type.
- Prompt length bucket.
- Report period present flag.
- Citation count bucket.
- Section count bucket.
- Status.
- Failure type.

Do not send grant names, funder names, raw prompt text, draft text, raw record
ids, metric values, or budget values.

Sentry capture:

- API captures analytics delivery failures as background exceptions.
- Web hooks capture generation failures with `feature = drafting_assistant` and
  `operation = generate`.

## Release Checks

- Shared validators cover accepted draft types, prompt bounds, and response
  safeguards.
- API service tests cover org-scoped grant loading, OpenRouter config failure,
  outcome grounding, citations, and provider schema failure.
- API route tests cover entitlement, permissions, safe analytics, and Sentry
  capture for analytics failures.
- Web hook tests cover safe PostHog and Sentry instrumentation.
- Web route tests cover editable draft review and disabled copy before review.
- Site tests cover feature page metadata, entitlement, internal links, and
  capability linking.
