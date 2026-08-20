# PRD: AI Award Document Intake

## Status

Draft

## Strategic Thesis

Award setup is the moment GrantPipe can prove it understands restricted funds.
AI document intake should turn an award letter, Notice of Award, or grant
agreement into structured GrantPipe records: deadlines, restrictions, contacts,
budget categories, reporting requirements, special conditions, and closeout
items. Human review stays in control.

## Problem

GrantPipe supports documents, grants, funds, reporting requirements, closeout
items, impact metrics, and expenses. But users still need to read award
documents manually and type the same details into multiple places:

- Award amount and period.
- Funder contacts.
- Reporting deadlines.
- Budget categories.
- Restrictions and allowable costs.
- Special conditions.
- Closeout requirements.
- Required evidence.

This setup work is tedious, error-prone, and strategically important because it
defines the compliance workflow that follows.

## Target Users

- Grant managers setting up new awards.
- Finance directors reviewing restrictions and budgets.
- Program directors identifying deliverables and outcomes.
- Compliance staff preparing reporting calendars.

## Current GrantPipe Baseline

GrantPipe has document storage, grants, funds, reporting requirements, closeout
items, impact metrics, and activity logs. It does not yet extract structured
award data from documents or support a human review queue before committing
extracted data.

## Market Signal

Instrumentl has Award Assistant. AwardTrace highlights Notice of Award parsing
and compliance automation. These features signal that award intake is becoming
an expected AI surface in grant management software.

## Goals

- Extract structured award setup data from uploaded documents.
- Show confidence and source references for every extracted field.
- Let a human approve, edit, ignore, or map each extracted item.
- Create or update grants, contacts, budget lines, reporting requirements,
  restrictions, closeout items, and special conditions from approved
  extraction.
- Preserve an auditable trail from source document to created records.

## Non-Goals

- Auto-committing extracted data without review.
- Providing legal, accounting, or compliance advice.
- Handling every possible funder document format perfectly in MVP.

## MVP Scope

- Upload award document from grant setup or document library.
- Extraction targets: funder name, funder contacts, award amount, grant period,
  budget categories, reporting deadlines, restrictions, allowable categories,
  special conditions, matching requirements when detected, closeout items, and
  required evidence.
- Review screen with extracted fields, confidence, source page or snippet, and
  destination mapping.
- Create records from approved extraction.
- Extraction status and audit trail.
- Manual correction flow.

## Functional Requirements

- Users can upload a document and request extraction.
- The system stores the original file and extraction result.
- The system returns structured fields with confidence scores and source
  references.
- Users can accept, edit, reject, or defer each extracted item.
- Accepted items create or update records only after user confirmation.
- Created records link back to the source document and extraction event.
- The system flags low-confidence fields for review.
- The system should never overwrite existing structured data silently.

## Data Model Implications

- `document_extractions`
- `document_extraction_fields`
- `document_extraction_sources`
- `document_extraction_actions`

Extraction actions should link source fields to created or updated grants,
funders, contacts, budget lines, restrictions, reporting requirements, closeout
items, and documents.

## UX Surfaces

- Extract from document action in document library.
- Award setup flow with upload and review.
- Side-by-side document and extracted data review.
- Destination mapping controls.
- Extraction history on document detail.
- Source links from created records back to the document.

## Permissions And Audit

- Admin and editor can run extraction and approve created records.
- Viewer can read extraction results only if they can read the source document.
- Auditor can read extraction history when scoped to the relevant grant or
  evidence bundle.
- Every extraction, approval, rejection, edit, and created record should be
  logged.

## Success Metrics

- Percentage of new grants created with document intake.
- Time from award upload to structured grant setup.
- Number of reporting requirements created from intake.
- Number of restriction terms created from intake.
- Field acceptance rate and correction rate.

## Risks And Open Questions

- AI extraction errors can create compliance risk. Human review and source
  traceability are mandatory.
- Some award documents include tables and scanned PDFs. OCR quality will matter.
- The extraction schema should align with the budget, restriction, and portal
  PRDs so this feature feeds the operating system instead of becoming a demo.

## Launch Slice

Start with award amount, period, contacts, reporting requirements, restrictions,
budget categories, special conditions, and closeout items. Require human review
for every write. Add templates by funder later.
