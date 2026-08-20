# AI Award Document Intake Design Spec

> Status: Draft -> In implementation
> Authored: 2026-05-05
> Source PRD: `docs/grant-operating-system/07-ai-award-document-intake-prd.md`
> Plan: `docs/superpowers/plans/2026-05-05-ai-award-document-intake.md`
> External API references checked: OpenRouter API reference, Plugins overview,
> Response Healing guide, and model page for
> `google/gemini-3.1-flash-lite`.

## Strategic Thesis

Award setup is the highest-leverage moment for GrantPipe to prove it understands
restricted funds. AI Award Document Intake turns an uploaded award letter,
Notice of Award, or grant agreement into a reviewed setup package for a grant,
while keeping the human reviewer in control of every write.

## Goals

- Extract award setup data from uploaded documents into structured fields.
- Require explicit review, duplicate decisions, and commit confirmation before
  creating records.
- Preserve source references for every extracted item.
- Create the grant and approved child records from the reviewed extraction.
- Log extraction lifecycle events, review decisions, and created records.
- Gate run and commit actions to Growth, Audit-Ready, and Enterprise plans.

## Non-Goals

- Silent overwrites of existing funders, grants, or child records.
- Legal, accounting, or compliance advice.
- Inline synchronous LLM calls in request/response handlers.
- Automatic submission to funder portals.
- Broad document classification beyond award-document intake.

## Tier Entitlements

| Capability                         | Starter | Growth | Audit-Ready | Enterprise |
| ---------------------------------- | ------- | ------ | ----------- | ---------- |
| `hasAwardDocumentIntake`           | -       | yes    | yes         | yes        |
| See intake affordance/upgrade copy | yes     | yes    | yes         | yes        |
| Start extraction                   | -       | yes    | yes         | yes        |
| Commit reviewed setup              | -       | yes    | yes         | yes        |

Starter users can see the affordance and review the value proposition, but the
API blocks extraction creation and commit with `402 insufficient_plan`.

## Permissions

- Admin and editor can create, review, and commit extractions.
- Viewer can read extraction results when they can read the source document.
- Auditor can read extraction history only when scoped to grants, funds,
  documents, compliance, accounting, reports, or evidence bundles.
- Mutations still honor the existing role middleware and org context.

## Data Model

```
document_extractions
  id, org_id, document_id, created_grant_id?,
  status, model_id, provider, provider_request_id?,
  prompt_version, raw_normalized_json, token_usage_json?, estimated_cost_cents?,
  failure_message?, created_by, created_at, updated_at, completed_at?

document_extraction_fields
  id, org_id, extraction_id, field_key, section, destination_entity_type,
  destination_field, value_json, normalized_value_json?, confidence,
  status, required, created_record_type?, created_record_id?,
  created_at, updated_at

document_extraction_sources
  id, org_id, extraction_id, field_id?, page_number?, snippet,
  bounding_box_json?, source_offset_start?, source_offset_end?, created_at

document_extraction_actions
  id, org_id, extraction_id, field_id?, action,
  previous_value_json?, next_value_json?, mapped_entity_type?, mapped_entity_id?,
  created_record_type?, created_record_id?, note?, actor_id, created_at
```

Statuses:

- Extraction: `pending`, `processing`, `ready_for_review`, `committing`,
  `committed`, `failed`, `canceled`.
- Field review: `pending`, `accepted`, `edited`, `rejected`, `deferred`,
  `mapped_existing`.
- Action: `accept`, `edit`, `reject`, `defer`, `map_existing`, `commit`,
  `cancel`, `fail`.

Indexes must preserve org-scoped lookups:

- `document_extractions (org_id, document_id, status)`
- `document_extractions (org_id, created_grant_id)`
- `document_extraction_fields (org_id, extraction_id, section)`
- `document_extraction_sources (org_id, extraction_id, field_id)`
- `document_extraction_actions (org_id, extraction_id, created_at)`

## Document Intake Entity Type

Award files can exist before a grant exists. Add an intake-safe document entity
type named `award_intake`. The uploaded document starts with
`entity_type = "award_intake"` and no grant id. After commit, the extraction and
document link to the created grant without deleting the source intake context.

## Extraction Provider

Use OpenRouter chat completions:

- Secret: `OPENROUTER_API_KEY`.
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`.
- Model: `google/gemini-3.1-flash-lite`.
- Response format: strict JSON schema via `response_format.type =
"json_schema"`.
- Plugins: PDF parsing where supported through OpenRouter PDF input/file parser,
  plus `response-healing`.
- Request headers: bearer auth, JSON content type, app attribution headers when
  `APP_URL` is available.

The queue consumer validates the provider response with shared Zod schemas before
writing fields. Malformed, unparseable, or schema-invalid responses mark the
extraction `failed` and store a sanitized failure message.

## Async Processing

The API creates a pending extraction row and enqueues a job on
`AWARD_INTAKE_QUEUE`. The Worker `queue()` consumer:

1. Loads the extraction and source document for the org.
2. Marks the extraction `processing`.
3. Downloads the file from R2 or configured mock storage.
4. Calls OpenRouter.
5. Validates and normalizes the response.
6. Stores fields and source references.
7. Marks the extraction `ready_for_review`, or `failed` on recoverable errors.

The UI polls extraction detail until it reaches `ready_for_review`, `failed`,
`canceled`, or `committed`.

## Extraction Schema

The normalized output includes these sections:

- Funder match or create candidate.
- Funder contacts.
- Grant basics: title, award id, status, amount, start/end dates, description.
- Budget categories and fund allocation suggestions.
- Reporting requirements.
- Restrictions and allowable costs.
- Special conditions.
- Matching requirements.
- Closeout items.
- Required evidence.

Each extracted field must include:

- Stable `fieldKey`.
- Section.
- Destination entity and field.
- Raw value and normalized value when applicable.
- Confidence from 0 to 1.
- Required flag where commit cannot proceed without review.
- At least one source reference with page/snippet when available.

## Review UX

The review page is side-by-side:

- Left: document metadata, source context, and extracted snippet references.
- Right: extracted setup checklist grouped by section.

Every item shows confidence, source page/snippet, and destination. Low-confidence
items are visually flagged and remain explicitly review-required. Reviewer
actions are accept, edit, reject, defer, or map existing. Commit is disabled
until required grant basics and duplicate decisions are resolved.

Entry points:

- Grant list/new grant flow.
- Grant detail document tab.
- Eligible award-document rows in document lists.

## Commit Behavior

Commit creates a whole grant setup package in one transaction:

1. Verify extraction is `ready_for_review`.
2. Verify Growth+ entitlement.
3. Verify explicit funder decision: map existing or create new.
4. Verify explicit grant duplicate decision: map existing or confirm new grant.
5. Create or link the funder.
6. Create the grant and approved child records.
7. Link document and extraction to the created grant.
8. Store `document_extraction_actions` for every accepted, edited, rejected,
   deferred, mapped, and created record.
9. Record activity log entries for extraction commit and created records.

Any failure rolls back the transaction and leaves the extraction reviewable.

## Marketing

Marketing copy must describe the builder-perspective capability without
fabricated social proof. Add AI Award Document Intake to pricing and capability
inventory surfaces, create a dedicated feature page, and update feature-list or
related-feature surfaces where the capability naturally fits.

## Test Strategy

- Shared constants and validators cover entitlement, statuses, review actions,
  confidence bounds, source references, and commit payloads.
- DB schema tests cover org scoping, indexes, relations, statuses, and document
  entity support.
- API service and route tests cover plan gating, async enqueue, status polling,
  provider success/failure/malformed JSON, duplicate decisions, transaction
  rollback, and audit actions.
- Web tests cover entry points, Starter upgrade state, polling, review actions,
  duplicate decisions, low-confidence flags, and commit enablement.
- Site tests cover pricing/product inclusion, dedicated feature page, content
  contracts, and technical SEO.

## Security And Data Handling

- Do not log raw documents, secrets, auth tokens, or provider keys.
- Store sanitized provider request ids and token/cost metadata only.
- Preserve org scoping on every query.
- Keep source documents linked for auditability.
- Treat extraction output as untrusted input until schema validation and human
  review complete.
