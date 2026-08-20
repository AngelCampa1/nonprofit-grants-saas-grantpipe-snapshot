# Outcome Impact Measurement Layer PRD

## Summary

The outcome impact layer lets grant and program staff define outcome goals,
track funder-defined indicators, and connect those indicators to existing grant
impact metrics. The first version lives on the program detail page and in the
outcomes API. It is built for review and reporting, not for proving impact or
running research studies.

## Jobs To Be Done

- As a grants manager, I want funder-defined indicators tied to a program so I
  can prepare program reports without rebuilding a spreadsheet.
- As a program lead, I want to see whether outcome measures are on track so I
  can follow up before the report is due.
- As an auditor or funder reviewer, I want outcome records tied to the program
  and activity log so I can see what was entered and when.

## Scope

Included:

- Audit-Ready and Enterprise entitlement via `hasOutcomeImpactMeasurement`.
- API route at `/outcomes`.
- Program detail outcome goal section.
- Outcome goal creation.
- Outcome indicator creation.
- Optional links from indicators to existing grant impact metrics.
- Latest linked metric entry rollup.
- Safe PostHog events on API and web mutation paths.
- Sentry capture for API analytics failures and web mutation failures.
- Activity-log entries for created outcome goals and indicators.

Not included:

- Research-grade evaluation design.
- Client-level case management.
- Automated narrative writing.
- Claims that outcomes are proven.
- Custom report export templates for this first release.
- Bulk import of historical outcome data.

## API

Base path: `/outcomes`

- `GET /`: lists outcome goals with optional program, grant, and status filters.
- `POST /`: creates an outcome goal.
- `POST /:outcomeId/indicators`: creates an outcome indicator.

The route requires:

- Active billing.
- Audit-Ready or Enterprise plan access.
- `programs:view` for list.
- `programs:edit` for create actions.

Analytics must not send program names, grant names, outcome names, statements,
notes, raw metric values, or raw record ids. Allowed event fields include
surface, status, indicator type, boolean link flags, funder-defined flags,
operation, and failure type.

## UX

The first app surface is the program detail page.

The page has:

- Outcome goal summary section.
- Empty state.
- Add outcome dialog.
- Outcome cards with status and indicators.
- Add indicator dialog.
- Loading and error states.
- Viewer-safe read-only rendering.

The section stays near the program budget because outcome reporting depends on
both the program goal and the resources attached to the work.

## Validation

- Outcome name and statement are required.
- Program, grant, outcome, and metric ids must be valid UUIDs.
- End date cannot be before start date.
- Indicator name is required.
- Indicator target and baseline values accept numeric inputs.
- Optional linked metric must belong to the org.
- Entry rollups ignore soft-deleted metric entries.

## Observability

PostHog events:

- `outcome_goal_created`
- `outcome_indicator_created`
- `outcome_operation_failed`

Sentry capture:

- API captures analytics delivery failures as background exceptions.
- Web hooks capture create failures with feature and operation tags.

Activity log:

- `outcome_goal` created.
- `outcome_indicator` created.

## Release Checks

- Shared validator tests cover list filters, outcome creation, indicator
  creation, update validation, and date order checks.
- DB tests cover the new schema and migration.
- API service tests cover org scoping, metric ownership, rollup logic, and
  activity logs.
- API route tests cover entitlement, permissions, safe analytics, and Sentry
  capture for analytics failures.
- Web hook tests cover safe PostHog and Sentry instrumentation.
- Web route tests cover listing, goal creation, indicator creation, and
  read-only gating through existing edit checks.
