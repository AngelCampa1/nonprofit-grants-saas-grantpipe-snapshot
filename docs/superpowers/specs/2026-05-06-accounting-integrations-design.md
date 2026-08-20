# Accounting integrations design

Date: 2026-05-06

> Superseded on 2026-07-03. External accounting sync is unavailable in the
> current product and is not included in any plan. Keep this file as historical
> design research only. QuickBooks CSV and opening-balance imports remain live.

## Product slice

GrantPipe ships accounting integrations as an Audit-Ready+ read-only ingestion
layer, starting with QuickBooks Online. The MVP connects to QBO through Intuit
OAuth, imports accounting dimensions and transactions, maps imported source
objects to GrantPipe records, and shows sync health, unmapped items, conflicts,
and source-system badges.

GrantPipe does not write to QuickBooks Online in this release.

## Entitlement

Accounting integrations are included only in:

- Audit-Ready
- Enterprise

Starter and Growth users can see upgrade-aware product messaging, but API
connect and sync operations return `402 insufficient_plan`.

## Provider scope

MVP provider: QuickBooks Online.

Imported objects:

- Account
- Class
- Customer
- Vendor
- Department
- Purchase and expense-like transactions
- Deposits
- Journal entries

Future providers such as Sage Intacct and Blackbaud Financial Edge are out of
scope for this release.

## Data model

The integration stores:

- `accounting_integrations`
- `accounting_sync_runs`
- `accounting_sync_events`
- `external_accounting_objects`
- `accounting_dimension_mappings`
- `accounting_sync_conflicts`

Imported accounting rows can carry external source metadata:

- `externalSourceSystem`
- `externalSourceObjectId`
- `externalSourceObjectType`
- `externalSourceSyncedAt`
- `externalSourceStatus`

## Sync behavior

Sync is queue-backed. HTTP requests create sync runs and enqueue work instead
of calling QBO synchronously.

Re-runs must be idempotent by QBO source object ID and deterministic
idempotency keys. OAuth refresh tokens are encrypted and every returned refresh
token replaces the prior stored token.

## Mapping and conflicts

Mapping targets:

- Grant
- Fund
- Program
- Contact
- Budget line
- Account

GrantPipe never silently overwrites local edits. If an imported object changes
after local mapping or review, GrantPipe creates a conflict. Resolution options:

- Keep GrantPipe value
- Accept QuickBooks value
- Map to another GrantPipe record

## Audit trail

GrantPipe records activity for connect, disconnect, settings changes, sync run
queueing and completion, import events, mapping changes, conflict creation, and
conflict resolution.

## User experience

Primary app workspace: `/accounting/integrations`.

The page includes:

- QuickBooks connection status
- Plan-aware upgrade state
- Sync status cards
- Mapping and unmapped review surfaces
- Conflict review copy
- Source badges on imported journal/accounting rows

## Marketing position

Public marketing must describe the MVP as read-only ingestion of accounting
truth from QuickBooks Online. It must not claim two-way sync, QBO customer
creation, invoice posting, payment posting, journal write-back, Intuit
certification, partner status, or usage/social-proof claims that are not true.
