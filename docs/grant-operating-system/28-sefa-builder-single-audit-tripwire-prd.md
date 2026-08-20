# SEFA Builder and Single-Audit Tripwire PRD

## Summary

The SEFA builder helps Audit-Ready teams track federal award spend during the
fiscal year and draft a Schedule of Expenditures of Federal Awards for review.
It adds a single-audit tripwire against the current 2 CFR 200.501 threshold and
exports the source rows staff need before the auditor asks for them.

Official basis checked on June 26, 2026: eCFR 2 CFR 200.501 requires a single
or program-specific audit when a non-Federal entity expends $1,000,000 or more
in Federal awards during its fiscal year, with an exemption below $1,000,000
except as noted in the regulation.

## Jobs To Be Done

- As a finance lead, I want GrantPipe to total federal award expenditures in the
  current fiscal year, so I know when we are close to the single-audit line.
- As a grant compliance lead, I want a SEFA draft by federal award, so I can
  reconcile the schedule before audit fieldwork.
- As an auditor or reviewer, I want the draft to show the grant, agency, ALN,
  pass-through source, and expenditure total, so I can trace each line back to
  GrantPipe records.

## Scope

Included:

- Audit-Ready and above access through the existing compliance report pack
  entitlement.
- Federal award setup fields on grants:
  - Federal award flag.
  - Assistance Listing Number (ALN).
  - Federal agency.
  - Federal award identification number (FAIN) or award number.
  - Pass-through entity name, when applicable.
- A fiscal-year SEFA preview endpoint that totals non-deleted grant-linked
  expenses inside the org fiscal year.
- A generated SEFA draft report artifact with CSV bundle data and HTML preview.
- A single-audit tripwire status:
  - `clear` below 80% of the threshold.
  - `watch` from 80% up to, but not including, the threshold.
  - `crossed` at or above the threshold.
- Privacy-safe report generation analytics and Sentry failure capture using the
  existing report generation wrappers.
- Reports page controls to view the tripwire and generate the SEFA draft.
- Public feature page copy that claims only shipped behavior.

Not included:

- Filing a single audit, replacing an auditor, or submitting to the Federal
  Audit Clearinghouse.
- Legal or accounting advice.
- Program cluster determination, major program risk scoring, Type A/Type B
  program selection, or auditor opinion generation.
- Inferring federal award metadata from grant names or free-form notes.
- Hard-coding a future Federal Edition plan before the pricing model exists.

## Data Model

The grants table should store explicit federal award metadata because SEFA rows
require fields that cannot be inferred reliably from current records.

Fields:

- `is_federal_award boolean not null default false`
- `assistance_listing_number text`
- `federal_agency text`
- `fain text`
- `pass_through_entity text`

Validation rules:

- When `isFederalAward` is true, ALN and federal agency are required.
- ALN must be a short printable value. Do not enforce a perfect numeric pattern
  because agencies and imported data may include formatting differences.
- Pass-through entity and FAIN are optional.

## API

Base path: `/compliance/reports/sefa`

- `GET /preview?fiscalYear=FY2026` returns the tripwire, threshold, period, row
  totals, and missing metadata warnings.
- `POST /` generates the SEFA draft report artifact.

Every route requires:

- `compliance:view`
- `reports:view`
- Existing `hasComplianceReportPack` plan access.

## Report Contents

The CSV bundle should contain:

- `sefa.csv`: organization, fiscal year, grant id, grant name, federal agency,
  ALN, FAIN, pass-through entity, period expenditures, and metadata status.
- `summary.csv`: threshold, total federal expenditures, amount remaining, and
  tripwire state.

The HTML preview should show:

- Total federal expenditures.
- Current single-audit threshold.
- Remaining amount or crossed amount.
- Tripwire state.
- SEFA draft rows.
- Warnings for federal grants that lack ALN or agency data.

## Observability

- API success: existing `report_generated` and `first_report_generated` events
  with `report_type: "sefa"`.
- API failure: existing `report_generation_failed` event with
  `report_type: "sefa"` and a safe failure type.
- Web success/failure: existing report hook event capture.
- Sentry: route-level unhandled errors already flow through the shared API error
  handler; route tests must prove generation failures still emit the safe
  failure event. Web mutation failures must be captured only if a new custom
  mutation wrapper bypasses the existing report hook.

## Copy Guardrails

Allowed claims:

- "Track federal award spend against the $1M single-audit threshold."
- "Draft a SEFA from grants and grant-linked expenses."
- "Flag missing ALN or agency details before review."

Forbidden claims:

- Filing, certifying, or replacing an official single audit.
- Guaranteeing audit readiness or compliance.
- Saying GrantPipe submits to the Federal Audit Clearinghouse.
- Claiming federal award metadata is auto-detected unless that behavior ships.

## Tests First

Write failing tests before implementation:

- Shared validator tests for SEFA generation input and generated report type.
- Shared grant validator tests for required federal metadata.
- API service tests for tripwire states, fiscal-year expense filtering, missing
  metadata warnings, and stored SEFA artifact metadata.
- API route tests for plan gating, permissions, success analytics, and failure
  analytics.
- Web hook and Reports page tests for generating a SEFA draft and surfacing the
  tripwire preview.
- Site feature page contract tests for the public feature page and entitlement.

## Release Checklist

- Migration and schema are in sync.
- 95% coverage is maintained for touched files.
- Public copy passes humanizer, third-grade-copy, zero-lies, and contextual fit.
- Roadmap row 3.1 is marked complete only after merge, deploy, and live checks.
