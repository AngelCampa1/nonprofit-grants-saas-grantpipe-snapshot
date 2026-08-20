# GrantPipe Code Audit Findings

Date: 2026-04-09
Environment: repository audit on `master`
Scope: backend services, shared validators, authenticated web routes, and build-time integrations

## Setup Notes

- This report is based on a non-mutating code audit plus verification runs of `turbo typecheck`, `turbo lint`, `turbo test`, and `turbo build`.
- The repository moved after the initial audit pass, so findings below focus on defects that were directly evidenced in the current code and warning output rather than broad speculative cleanup.

## Findings

### 1. Soft-deleted financial rows are still included in balances and compliance outputs

- Severity: High
- Area: grants, funds, overview, compliance
- Evidence:
  - [grant.service.ts#L318](../../../apps/api/src/domains/grants/grant.service.ts#L318)
  - [fund.service.ts#L67](../../../apps/api/src/domains/grants/fund.service.ts#L67)
  - [overview/service.ts#L445](../../../apps/api/src/domains/overview/service.ts#L445)
  - [compliance/service.ts#L621](../../../apps/api/src/domains/compliance/service.ts#L621)
- Actual:
  - Related children such as expenses and grant allocations are loaded without `deletedAt` filtering, which allows deleted records to continue affecting balances, dashboards, and generated reports.
- Expected:
  - Soft-deleted child records should be excluded from all live financial and compliance calculations.
- Impact:
  - Financial summaries and exported compliance artifacts can be materially wrong after deletes.

### 2. Funder detail can resurrect deleted contacts and grants

- Severity: High
- Area: funders
- Evidence:
  - [funder.service.ts#L59](../../../apps/api/src/domains/grants/funder.service.ts#L59)
- Actual:
  - `getFunder()` loads `contacts` and `grants` without soft-delete filtering.
- Expected:
  - Deleted related records should stay hidden from funder detail responses.
- Impact:
  - UI and API consumers can see deleted records reappear unexpectedly.

### 3. Attendee updates can link the wrong donor's donation

- Severity: High
- Area: events attendees
- Evidence:
  - [attendee.service.ts#L157](../../../apps/api/src/domains/events/attendee.service.ts#L157)
  - [routes.ts#L133](../../../apps/api/src/domains/events/routes.ts#L133)
- Actual:
  - The generic attendee update path checks only org ownership of the donation, not whether the donation belongs to the attendee's `contactId`.
- Expected:
  - Donation linkage should enforce both org ownership and contact ownership.
- Impact:
  - Donation records can be incorrectly attached across contacts.

### 4. Volunteer-hour updates can point to foreign or deleted events

- Severity: High
- Area: events volunteer hours
- Evidence:
  - [volunteer.service.ts#L123](../../../apps/api/src/domains/events/volunteer.service.ts#L123)
  - [routes.ts#L73](../../../apps/api/src/domains/events/routes.ts#L73)
- Actual:
  - Create validates `eventId`; update does not.
- Expected:
  - Update should apply the same event validation as create.
- Impact:
  - Volunteer-hour rows can be moved onto invalid events.

### 5. Inline attendee contact creation bypasses affiliated-org validation

- Severity: High
- Area: events attendees
- Evidence:
  - [attendee.service.ts#L78](../../../apps/api/src/domains/events/attendee.service.ts#L78)
  - [contact.service.ts#L11](../../../apps/api/src/domains/donors/contact.service.ts#L11)
- Actual:
  - The attendee flow inserts contacts directly and skips the affiliated-org guard enforced by the donor contact service.
- Expected:
  - Inline creation should reuse or mirror the same tenant-safe validation path.
- Impact:
  - Contact data can be created with invalid affiliated-org references.

### 6. Custom-field values can target nonexistent or wrong-tenant entities

- Severity: High
- Area: org settings custom fields
- Evidence:
  - [org/service.ts#L116](../../../apps/api/src/domains/org/service.ts#L116)
  - [routes.ts#L308](../../../apps/api/src/domains/org/routes.ts#L308)
- Actual:
  - The write path validates the field definition but does not verify that the supplied `entityId` exists for the declared entity type in the current org.
- Expected:
  - Custom-field writes should validate entity existence and org ownership.
- Impact:
  - Orphaned or cross-entity custom-field data can be created.

### 7. `softDeleteCustomFieldDefinition()` hard-deletes data

- Severity: High
- Area: org settings custom fields
- Evidence:
  - [org/service.ts#L90](../../../apps/api/src/domains/org/service.ts#L90)
- Actual:
  - The function name says soft delete, but it deletes the definition and all related values.
- Expected:
  - Custom-field definitions should follow the repo's soft-delete model or be explicitly named and handled as destructive deletes.
- Impact:
  - Historical custom-field data is permanently lost.

### 8. Document uploads can orphan storage objects on DB failure

- Severity: Medium
- Area: documents
- Evidence:
  - [documents/service.ts#L174](../../../apps/api/src/domains/documents/service.ts#L174)
- Actual:
  - The R2 object is written before the DB row is committed, and the failure path does not delete the uploaded object.
- Expected:
  - Failed DB writes should clean up uploaded objects or invert the write order safely.
- Impact:
  - Storage drift accumulates over time and makes cleanup/reporting harder.

### 9. Event summaries count deleted donations and ignore `createdAt` sorting

- Severity: Medium
- Area: events
- Evidence:
  - [event.service.ts#L29](../../../apps/api/src/domains/events/event.service.ts#L29)
  - [event.service.ts#L52](../../../apps/api/src/domains/events/event.service.ts#L52)
  - [event.service.ts#L79](../../../apps/api/src/domains/events/event.service.ts#L79)
- Actual:
  - Revenue sums attendee-linked donations without excluding deleted donations.
  - `sortBy="createdAt"` is effectively a no-op because the comparator returns `0`.
- Expected:
  - Deleted donations should not affect revenue, and declared sort options should behave as advertised.
- Impact:
  - Event analytics and list ordering are incorrect.

### 10. Volunteer-hour listing advertises unsupported sorting

- Severity: Medium
- Area: events volunteer hours
- Evidence:
  - [events.ts#L122](../../../packages/shared/src/validators/events.ts#L122)
  - [volunteer.service.ts#L61](../../../apps/api/src/domains/events/volunteer.service.ts#L61)
- Actual:
  - Validator allows `sortBy="createdAt"`, but the service falls back to sorting by `date` for anything except `hours`.
- Expected:
  - Validator and service behavior should match.
- Impact:
  - API consumers can request sorting modes that are silently ignored.

### 11. Money formatting drops cents across the product

- Severity: Medium
- Area: donors UI, compliance reports
- Evidence:
  - [donors/$contactId.tsx#L62](../../../apps/web/src/routes/_authenticated/donors/$contactId.tsx#L62)
  - [donors/index.tsx#L55](../../../apps/web/src/routes/_authenticated/donors/index.tsx#L55)
  - [stats-bar.tsx#L17](../../../apps/web/src/components/donors/stats-bar.tsx#L17)
  - `apps/web/src/components/donors/pipeline-board.tsx#L54` (that file no longer exists in the final tree, so this reference is left unlinked)
  - [compliance/service.ts#L81](../../../apps/api/src/domains/compliance/service.ts#L81)
- Actual:
  - UI formatting floors cent values and report formatting rounds to whole dollars.
- Expected:
  - Currency should preserve cents unless a specific report intentionally rounds and labels that behavior.
- Impact:
  - Monetary values are understated or imprecise in user-visible surfaces.

### 12. Donor detail fetch failures render as endless loading

- Severity: Medium
- Area: donors UI
- Evidence:
  - [donors/$contactId.tsx#L160](../../../apps/web/src/routes/_authenticated/donors/$contactId.tsx#L160)
  - [donors/$contactId.tsx#L210](../../../apps/web/src/routes/_authenticated/donors/$contactId.tsx#L210)
- Actual:
  - Missing `contactData` is treated like a loading state, so failed queries can keep the skeleton visible instead of surfacing an error.
- Expected:
  - Failed detail fetches should render an explicit error state.
- Impact:
  - Users get stuck on a misleading loading experience with no recovery cue.

### 13. Affiliated-organization display reads a nonexistent field

- Severity: Low
- Area: donors UI
- Evidence:
  - [donors/$contactId.tsx#L459](../../../apps/web/src/routes/_authenticated/donors/$contactId.tsx#L459)
  - [contacts.ts#L10](../../../packages/db/src/schema/contacts.ts#L10)
- Actual:
  - The UI casts `affiliatedOrg` as if it exposes `name`, while the backing schema uses `firstName`, `lastName`, and `organizationName`.
- Expected:
  - UI display logic should match the actual shape of affiliated-org records.
- Impact:
  - The affiliated-org label can render incorrectly or blank.

### 14. Org settings query helper can return `undefined`

- Severity: Low
- Area: org settings UI
- Evidence:
  - [use-org-settings.ts#L39](../../../apps/web/src/hooks/use-org-settings.ts#L39)
  - [use-org-settings.test.ts#L239](../../../apps/web/src/hooks/use-org-settings.test.ts#L239)
- Actual:
  - A success path can yield `undefined`, which violates React Query expectations.
- Expected:
  - Query functions should always return defined data or throw.
- Impact:
  - This matches the runtime warning already emitted during tests.

### 15. Dialog content is missing required accessibility description wiring

- Severity: Low
- Area: shared UI, donors UI
- Evidence:
  - [dialog.tsx#L40](../../../packages/ui/src/components/dialog.tsx#L40)
  - [donors/$contactId.tsx#L302](../../../apps/web/src/routes/_authenticated/donors/$contactId.tsx#L302)
  - [donors/index.tsx#L273](../../../apps/web/src/routes/_authenticated/donors/index.tsx#L273)
- Actual:
  - Dialog content is used without `DialogDescription` or explicit `aria-describedby`.
- Expected:
  - Dialogs should satisfy Radix accessibility requirements.
- Impact:
  - Tests emit warnings and assistive technology support is degraded.

### 16. Site builds trigger live IndexNow submission

- Severity: Low
- Area: site build pipeline
- Evidence:
  - [indexnow-integration.ts#L16](../../../packages/ui/src/site/lib/indexnow-integration.ts#L16)
  - [astro.config.mjs#L25](../../../apps/site/astro.config.mjs#L25)
- Actual:
  - The build hook submits to IndexNow during build instead of being gated to an explicit deploy/publish path.
- Expected:
  - Local and CI builds should not perform live external submissions unless intentionally enabled.
- Impact:
  - Builds have side effects and can fail noisily on external service responses.

## Recommended Fix Order

1. Close data-integrity and tenancy bugs first:
   - soft-delete filtering
   - attendee donation ownership validation
   - volunteer-hour event validation
   - custom-field entity validation
   - destructive custom-field deletion behavior
2. Fix financial correctness next:
   - event revenue aggregation
   - unsupported sorting contracts
   - money formatting
3. Clean up UX and build warnings after that:
   - donor error states
   - org-settings undefined path
   - dialog accessibility
   - IndexNow build side effects

## Verification Notes

- `turbo typecheck` completed without type errors.
- `turbo lint` completed with one React Compiler warning in the donor contact form.
- `turbo test` surfaced warnings consistent with finding 14 and finding 15.
- `turbo build` surfaced the live IndexNow submission side effect consistent with finding 16.
