# Restriction Lifecycle Design Specification

**Date:** 2026-05-02
**Status:** Draft - pending review
**Source PRD:** `docs/grant-operating-system/03-restriction-lifecycle-prd.md`

---

## 1. Product Thesis

Restriction lifecycle is the structured accounting and compliance layer behind
GrantPipe's existing funds, grants, donations, documents, reports, dashboard
risk, permissions, billing, and public positioning. It should not ship as a
standalone tracker beside funds and grants.

The user should be able to answer one question from the product without
rebuilding a spreadsheet: for each restricted balance, what created the
restriction, what changed it, what released it, what evidence supports the
release, and what is left at the end of the period?

## 2. Target Users

- Finance directors who own restricted net asset integrity and rollforwards.
- Grant managers who own award terms, spend-down, and funder reporting.
- Executive directors and boards reviewing restricted balance risk.
- Auditors reviewing support for releases, terms, and restricted activity.

## 3. Positioning And Packaging

Restriction lifecycle is a Growth+ capability.

- **Starter:** can see upgrade prompts where restricted fund tracking currently
  appears. Starter keeps basic fund and grant visibility, but cannot manage
  structured restriction terms, additions, releases, evidence, alerts, or
  rollforward reports.
- **Growth:** gets core restriction lifecycle: terms, additions, releases,
  evidence links, alerts, dashboard risk, and restricted rollforward exports.
- **Audit-Ready:** gets enhanced auditor packaging: evidence bundle metadata,
  auditor-facing export output, stronger evidence completeness checks, and
  evidence package generation.

Public feature claims must match this packaging. Existing pages can still say
GrantPipe helps with restricted funds, but plan-level copy must distinguish
basic fund visibility from Growth+ restriction lifecycle and Audit-Ready
evidence packaging.

## 4. Non-Goals

- No accounting or legal advice about FASB rules.
- No replacement for CPA judgment.
- No automated release suggestions from expenses in the first release.
- No duplicate document storage for evidence.
- No complete rebuild of every possible restricted net asset report format.

## 5. Data Model

Add a first-class restriction domain in `packages/db/src/schema/restrictions.ts`
and re-export it from the DB package.

### `restriction_terms`

Org-scoped, soft-delete aware records describing why money is restricted.

Fields:

- `id`
- `org_id`
- `fund_id` nullable FK to `funds`
- `grant_id` nullable FK to `grants`
- `donation_id` nullable FK to `donations`
- `source_document_id` nullable FK to `documents`
- `restriction_type`: `purpose`, `time`, `purpose_and_time`,
  `board_designated`, `unrestricted`
- `source`: `donor`, `funder`, `board`, `internal`, `other`
- `title`
- `purpose_statement`
- `release_rule`
- `start_date`
- `end_date`
- `beginning_balance_cents`
- `currency`
- `evidence_requirement`
- `created_by`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- At least one of `fund_id`, `grant_id`, `donation_id`, or
  `source_document_id` must be present.
- All linked entities must belong to the same `org_id`.
- Money is stored as integer cents.
- `deleted_at` excludes the term from active lists and rollforward math.

### `restriction_balances`

Period balance snapshots for imports, carryforwards, and generated
rollforwards. This table does not replace transaction math; it stores the
approved period view so historical rollforwards and imported beginning balances
remain stable after later activity is entered.

Fields:

- `id`
- `org_id`
- `restriction_term_id`
- `fund_id` nullable FK to `funds`
- `grant_id` nullable FK to `grants`
- `period_start`
- `period_end`
- `beginning_balance_cents`
- `additions_cents`
- `releases_cents`
- `ending_balance_cents`
- `generated_report_id` nullable FK to `generated_reports`
- `source`: `manual_import`, `rollforward_generation`, `period_close`
- `created_by`
- `created_at`
- `deleted_at`

Rules:

- Active rollforward generation calculates from terms, additions, and releases,
  then may persist a balance snapshot with the generated report.
- Historical setup can import beginning balances through this table when the
  organization does not have detailed prior additions and releases.
- Active snapshots are org-scoped and soft-delete aware.

### `restriction_additions`

Transactions that increase a restricted balance.

Fields:

- `id`
- `org_id`
- `restriction_term_id`
- `donation_id` nullable
- `grant_id` nullable
- `journal_line_id` nullable
- `amount_cents`
- `date`
- `description`
- `created_by`
- `created_at`
- `deleted_at`

### `restriction_releases`

Manual release records that decrease a restricted balance.

Fields:

- `id`
- `org_id`
- `restriction_term_id`
- `expense_id` nullable
- `journal_line_id` nullable
- `amount_cents`
- `date`
- `reason`
- `created_by`
- `created_at`
- `deleted_at`

Rules:

- A release cannot exceed the available term balance unless the API explicitly
  returns a validation error for an attempted negative restricted balance.
- Releases can be linked to expenses or journal lines, but first release is
  manual-control-first.
- Every release must support evidence completeness checks.

### `restriction_evidence_links`

Links existing documents or generated reports to restriction releases without
copying files.

Fields:

- `id`
- `org_id`
- `restriction_release_id`
- `document_id` nullable
- `generated_report_id` nullable
- `label`
- `evidence_type`: `award_letter`, `grant_agreement`, `invoice`,
  `receipt`, `journal_entry`, `board_minutes`, `report`, `other`
- `created_by`
- `created_at`
- `deleted_at`

Rules:

- Exactly one of `document_id` or `generated_report_id` must be present.
- Linked records must share `org_id`.

### `restriction_allowed_programs`

Optional rows for allowed program tags or program names.

Fields:

- `id`
- `org_id`
- `restriction_term_id`
- `program`
- `created_at`
- `deleted_at`

### `restriction_allowed_categories`

Optional rows for allowed expense categories or account IDs.

Fields:

- `id`
- `org_id`
- `restriction_term_id`
- `category`
- `account_id` nullable
- `created_at`
- `deleted_at`

## 6. Shared Types And Validators

Add shared constants in `packages/shared/src/constants/index.ts`:

- `RESTRICTION_LIFECYCLE_TYPES`
- `RESTRICTION_SOURCES`
- `RESTRICTION_EVIDENCE_TYPES`
- `RESTRICTION_ALERT_TYPES`
- add `restricted_rollforward` to `GENERATED_REPORT_TYPES`
- add `restriction_term`, `restriction_addition`, `restriction_release`, and
  `restriction_evidence_link` to `ACTIVITY_ENTITY_TYPES`
- add entitlement flags:
  - `hasRestrictionLifecycle`
  - `hasRestrictionEvidencePackage`

Entitlement rules:

- Starter: both flags false.
- Growth: `hasRestrictionLifecycle` true,
  `hasRestrictionEvidencePackage` false.
- Audit-Ready: both flags true.

Add `packages/shared/src/validators/restrictions.ts` with schemas for:

- term list filters
- create/update/delete term
- create/delete addition
- create/delete release
- create/delete evidence link
- alert summary filters
- rollforward filters and export options

Validation rules:

- Amounts are positive integer cents.
- Date ranges require `periodStart <= periodEnd`.
- `purpose` terms require a purpose statement.
- `time` terms require an end date.
- `purpose_and_time` requires both purpose statement and end date.
- Evidence link input requires exactly one document or generated report target.

## 7. API Design

Add `apps/api/src/domains/restrictions/` using the domain style already used by
grants, documents, activity, and billing.

Services:

- `term.service.ts`: list, get summary, create, update, soft delete.
- `addition.service.ts`: list and create/delete additions.
- `release.service.ts`: list and create/delete releases, validate balance,
  validate evidence completeness.
- `evidence.service.ts`: link/unlink evidence to releases.
- `rollforward.service.ts`: calculate beginning balance, additions, releases,
  ending balance, and exception rows by period.
- `alerts.service.ts`: negative balance, missing evidence, expired time
  restriction with remaining balance, release without support, release term
  conflict, and expense term conflict.

Routes:

- `GET /restrictions/terms`
- `POST /restrictions/terms`
- `GET /restrictions/terms/:termId`
- `PATCH /restrictions/terms/:termId`
- `DELETE /restrictions/terms/:termId`
- `GET /restrictions/terms/:termId/additions`
- `POST /restrictions/terms/:termId/additions`
- `DELETE /restrictions/additions/:additionId`
- `GET /restrictions/terms/:termId/releases`
- `POST /restrictions/terms/:termId/releases`
- `DELETE /restrictions/releases/:releaseId`
- `POST /restrictions/releases/:releaseId/evidence`
- `DELETE /restrictions/evidence/:evidenceLinkId`
- `GET /restrictions/alerts`
- `POST /restrictions/reports/rollforward`

Permissions:

- Admin and editor can manage terms, additions, releases, and evidence.
- Viewer can read restriction records and rollforward outputs.
- Auditor can read terms, additions, releases, evidence, alerts, and
  rollforward reports.
- Report generation uses report permissions.
- Fund and grant embedded routes use the existing fund/grant permission checks.

Billing gates:

- Core routes require `hasRestrictionLifecycle`.
- Audit evidence package output requires `hasRestrictionEvidencePackage`.
- Read-only upgrade preview endpoints may return prompt metadata for Starter
  surfaces without exposing restricted records.

Audit logging:

- Log every term, addition, release, evidence link, and generated report event
  through existing activity-log helpers.
- Diffs must include amounts as cents and entity links, not formatted strings.

## 8. Report Design

Add `restricted_rollforward` as a generated report type.

Growth rollforward output:

- period start and end
- grouped by fund, grant, donor, program, and fiscal period where available
- beginning balance
- additions
- releases
- ending balance
- exception rows for missing evidence, expired term with balance, release
  without support, release/expense term conflicts, and negative restricted
  balance attempts

Audit-Ready evidence package output:

- includes rollforward rows
- includes evidence bundle metadata
- includes release-to-document index
- includes missing evidence checklist
- includes source term documents and generated report links where present

## 9. UX Integration

### Fund Detail

Add a `Restrictions` tab to the existing fund detail route. It shows:

- restricted balance card
- term list
- additions and releases timeline
- release workflow
- evidence checklist
- upgrade prompt on Starter

### Grant Detail

Add a restriction panel or tab tied to:

- grant-fund allocations
- spend-down
- expenses
- reporting requirements
- documents
- release evidence

The grant view should make restricted balance risk visible next to grant
spend-down without duplicating fund records.

### Dashboard

Add restricted balance risk widgets:

- negative restricted balance warnings
- missing evidence count
- expired time restrictions with unreleased balance
- releases without support

### Documents

Allow documents to be linked as evidence to releases. Do not duplicate R2
objects. Existing document upload, list, and delete behavior remains the source
of truth for files.

### Activity

Surface restriction lifecycle events in the activity feed with readable labels:

- term created/updated/deleted
- addition recorded/deleted
- release recorded/deleted
- evidence linked/unlinked
- rollforward generated

### Reports

Add a restricted rollforward report flow under reports. Growth users can export
rollforward output. Audit-Ready users can include evidence package metadata.
Starter users see an upgrade prompt tied to the restricted-fund job to be done.

## 10. Marketing And SEO Integration

Update centralized public claims instead of one-off pages only.

Required files and systems:

- `apps/site/src/lib/marketed-capabilities.ts`
- `apps/site/src/config/site.ts`
- `apps/site/src/content/features/restricted-fund-tracking.md`
- restricted fund tracking and grant compliance category/config pages
- pricing pages and schema contracts
- programmatic content templates or generators used by SEO pages
- relevant tests for marketed capabilities, pricing text, schema, and content
  freshness

Copy rules:

- No fabricated testimonials, user counts, or social proof.
- Use builder perspective where founder context is needed.
- Do not claim nonprofit operating experience.
- `stop-slop` is unavailable in this Codex session; implementation should use
  the repository's copy guidance directly and run the `humanizer` skill when
  drafting or revising user-facing copy.

## 11. Analytics And Success Metrics

Track product events through existing analytics conventions:

- restriction term created
- restriction addition recorded
- restriction release recorded
- evidence linked to release
- restricted rollforward generated
- evidence package generated
- restriction alert viewed
- Starter upgrade prompt clicked from restriction surface

Success metrics:

- percentage of restricted funds with structured terms
- percentage of releases linked to evidence
- number of restricted rollforward exports
- number of Audit-Ready evidence packages generated
- reduction in manual restricted balance spreadsheet reliance, measured through
  user research and onboarding feedback

## 12. Edge Cases

- Historical beginning balances can be entered manually on the term.
- Messy legacy restrictions can start with a term, beginning balance, and
  evidence requirement before detailed additions are imported.
- Deleted additions, releases, and terms are excluded from active calculations
  but remain visible through activity history.
- Cross-org linked entity IDs are rejected.
- A term can be linked to both fund and grant when the restriction is grant
  funded into a restricted fund.
- Allowed program/category/account rules create warnings when a linked expense
  or release conflicts with the term. The first release does not auto-block all
  conflicts because nonprofit teams may need to record messy historical data,
  but conflicts must be visible in alerts and rollforward exception output.
- Board-designated restrictions are tracked separately from donor/funder
  restrictions so public copy and reports do not overstate donor restriction.

## 13. Acceptance Criteria

- Restrictions are represented as first-class org-scoped records.
- Funds and grants show restriction lifecycle information in context.
- Manual additions and releases change period balances correctly.
- Releases validate available balance and evidence requirements.
- Documents can be linked as evidence without duplicate storage.
- Activity log captures every lifecycle mutation.
- Growth users can generate restricted rollforwards.
- Audit-Ready users can generate evidence package output.
- Starter users see upgrade prompts instead of inaccessible broken flows.
- Public pricing and feature claims match shipped entitlements.
