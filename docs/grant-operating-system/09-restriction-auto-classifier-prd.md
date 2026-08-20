# PRD: Restriction Auto-Classifier (Roadmap #4)

## Status

Draft → In implementation (2026-06-15)

## Strategic Thesis

The unified ledger is only as trustworthy as the net-asset classification on
each gift. Today the donation `restriction` field is a manual binary
(`unrestricted` | `restricted`) that the user picks by hand, while funds already
carry a FASB-correct ternary `type` (`unrestricted` |
`temporarily_restricted` | `permanently_restricted`) and restriction terms model
the full lifecycle. Mis-classification at entry poisons every downstream alert,
release schedule, and report (#3 Overspend Sentinel, #7 gift→GL, #10 Anomaly,
#17 NL reporting all read this). This feature makes correct classification the
default, not a manual chore.

## Problem

At gift entry a user must manually decide restriction status with no guidance
from the fund they linked, the donor's written designation, or the campaign.
This is error-prone and silently wrong (e.g. a gift linked to a
`permanently_restricted` endowment fund but left `unrestricted`).

## Target Users

- Development Directors / gift-entry staff (the daily enterers).
- Finance Directors who inherit the classification downstream.

## Goal

At gift entry, **infer a suggested net-asset class + restriction type + release
schedule** from deterministic signals and pre-fill the form, with the user able
to accept or override. No fabrication: every suggestion cites the signal that
produced it, and the user is always in control of the final value.

## Design

### Classification inputs (deterministic, in priority order)

1. **Linked fund `type`** — strongest signal. `permanently_restricted` fund →
   suggest permanently restricted; `temporarily_restricted` → temporarily
   restricted; `unrestricted` → unrestricted.
2. **Linked grant** — a grant-linked gift is restricted (purpose) by default.
3. **Existing restriction term** on the linked fund/grant — inherit its
   `restrictionType`, `releaseRule`, `startDate`/`endDate` for the release
   schedule prefill.
4. **Donor designation text** (donation `notes` / a new `designation` free-text):
   keyword match against a deterministic phrase table (e.g. "endowment",
   "in perpetuity" → permanent; "for <program>", "restricted to", "until" →
   temporary/purpose). Pure rules, no LLM — this is a data-quality floor and
   must be explainable and testable.
5. Default fallback: `unrestricted` with `source: internal`.

### Output (pure function `classifyRestriction(input): ClassificationResult`)

```
ClassificationResult = {
  netAssetClass: "unrestricted" | "temporarily_restricted" | "permanently_restricted",
  donationRestriction: "unrestricted" | "restricted",   // back-compat for postDonation
  restrictionType: RestrictionLifecycleType,
  suggestedReleaseRule?: string,
  suggestedStartDate?: string,
  suggestedEndDate?: string,
  confidence: "high" | "medium" | "low",
  signals: Array<{ source: string; detail: string }>,   // explainability
}
```

Lives in `packages/shared` (pure, fully unit-tested ≥95%) so both API and web
use the identical logic. No new LLM dependency.

### API

New endpoint on the donors domain (or a small `classification` service reused by
donation create/update): `POST /classify-restriction` taking
`{ fundId?, grantId?, designation?, campaign?, date }` and returning
`ClassificationResult`. The donation create path optionally consumes the result
to auto-link/create a restriction term + release schedule when the user accepts.

### Web UX

In `donation-form.tsx`: when fund/grant/designation changes, call the classifier
(debounced) and show a **suggestion banner** ("Suggested: Temporarily restricted
— because the linked fund _Youth Program Fund_ is temporarily restricted").
Pre-fill the restriction control; user can override with one click. Pill-styled
controls per design canon. Add an optional `designation` text input.

### Schema

- Add nullable `designation` (text) to `donations` for the donor's written
  purpose (distinct from internal `notes`). Migration in `packages/db`.
- No change to `funds`/`restrictionTerms` (reused as-is).

### Marketing

New feature page markdown
`packages/shared/src/knowledge/marketing/content/features/restriction-auto-classifier.md`
following the `restricted-fund-tracking.md` pattern. Copy run through
`humanizer` + `third-grade-copy`. Entitlement: `hasRestrictionLifecycle`.

## Non-Goals

- No AI/LLM inference (deterministic rules only — explainability + cost).
- Not changing the binary `donation.restriction` storage (kept for posting
  back-compat; classifier also returns it).
- Not auto-posting without user confirmation of the suggestion.

## Acceptance Criteria

- `classifyRestriction` pure fn with ≥95% coverage; table-driven tests for every
  signal + precedence + fallback.
- API endpoint validated by shared Zod schema, org-scoped, permission-gated
  (`donors` view), ≥95% coverage.
- Donation form shows suggestion, prefills, allows override; accepting a
  restricted suggestion on a fund creates/links a restriction term + release
  schedule via existing restrictions service.
- `designation` migration generated + applied.
- Marketing feature page live, copy passed both writing checks.
- typecheck + test:coverage green; reviewed; merged; deployed.
