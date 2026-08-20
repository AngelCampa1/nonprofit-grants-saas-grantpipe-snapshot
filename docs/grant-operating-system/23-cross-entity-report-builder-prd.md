# Cross-Entity Report Builder PRD

## Summary

Cross-Entity Report Builder lets staff build saved reports from donor, gift,
grant, and fund records. Users choose a base record type, select standard and
custom fields, preview rows, save the report definition, and export the result
to the existing generated report library.

## Jobs To Be Done

- As a finance lead, I want to pull grant, fund, and gift fields into one
  reusable report so I can answer board and audit questions without rebuilding
  a spreadsheet.
- As a grants manager, I want saved report definitions so recurring funder
  reports use the same columns each period.
- As an admin, I want custom fields available in the builder so local tracking
  fields can appear in exports.

## Scope

Included:

- Audit-Ready and Enterprise entitlement via `hasCrossEntityReportBuilder`.
- Saved report definitions scoped by `org_id`.
- Donor, donation, grant, and fund base entities.
- Standard field selection, custom field selection, preview, save, and CSV
  export.
- Generated report artifact records using the existing report library.

Not included:

- A visual join builder across arbitrary tables.
- Scheduled report delivery.
- Pivot tables or charting.
- Public portal sharing.

## Data Model

Add `saved_report_definitions`:

- `id`
- `org_id`
- `name`
- `description`
- `entity`
- `columns`
- `custom_field_ids`
- `filters`
- `sort`
- `created_by`
- `created_at`
- `updated_at`
- `deleted_at`

Definitions are soft deleted. Every query is scoped by `org_id`.

## API

Base path: `/report-builder`

- `GET /metadata`: returns entity labels, available columns, and custom fields.
- `GET /definitions`: lists active saved definitions, optionally filtered by
  entity.
- `POST /definitions`: creates a saved definition.
- `PATCH /definitions/:definitionId`: updates a saved definition.
- `DELETE /definitions/:definitionId`: soft deletes a saved definition.
- `POST /preview`: previews an ad hoc definition.
- `POST /definitions/:definitionId/run`: writes a CSV artifact to storage and
  creates a generated report record.

All routes require report view access plus donor and grant view access. The
feature requires `hasCrossEntityReportBuilder`.

## UX

The first app screen is `/reports/builder`.

The page has:

- Report name input.
- Base record selector.
- Standard column checklist.
- Custom field checklist.
- Preview action.
- Save action.
- CSV export action.
- Saved definitions list for the selected base record.
- Preview table.

The existing Reports page links to the builder.

## Validation

- Name is required.
- Base entity must be one of donor, donation, grant, or fund.
- At least one standard column is required.
- Selected columns must belong to the selected base entity.
- Duplicate standard columns and duplicate custom field IDs are rejected.
- Preview limit is capped at 100.

## Release Checks

- Shared validator tests cover duplicate field rejection and entity/column
  matching.
- DB schema tests cover table columns and indexes.
- API route tests cover metadata, entitlement gating, preview, save, and run.
- API service tests cover CSV labels and definition serialization.
- Web hook tests cover metadata, save, preview, and dynamic run IDs.
- Web route tests cover field selection, save, preview, and export.
