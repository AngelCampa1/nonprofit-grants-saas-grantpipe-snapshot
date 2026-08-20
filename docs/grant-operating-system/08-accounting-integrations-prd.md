# PRD: Accounting Integrations

## Status

Deferred - unavailable in the current product

This PRD is future research. It is not a shipped feature or plan promise.
QuickBooks CSV and opening-balance imports remain available without live sync.

## Strategic Thesis

GrantPipe does not need to replace accounting on day one to become the grant
operating system. It does need to ingest accounting truth smoothly. The right
strategy is to become the restricted-funds subledger and post-award operating
layer that syncs with QuickBooks, Sage Intacct, and Blackbaud Financial Edge.

## Problem

GrantPipe has a real internal accounting module, but many nonprofits already
run accounting in QuickBooks, Sage Intacct, Blackbaud Financial Edge, or a
similar system. If GrantPipe cannot ingest or sync accounting truth, users will
not trust budget-vs-actual, reimbursement, restricted balance, or audit
outputs.

The operating-system question is:

- Which accounting system is the source of truth for each object?
- How do expenses, deposits, journal entries, classes, funds, projects, and
  vendors map into GrantPipe?
- How do we avoid duplicate imports and silent overwrites?
- How does GrantPipe push useful grant dimensions back to accounting?

## Target Users

- Finance directors using an existing accounting system.
- Grant accountants reconciling expenses to awards.
- Executive directors who need trustworthy grant dashboards.
- Implementation users importing historical data.

## Current GrantPipe Baseline

GrantPipe already has chart of accounts, journal entries, journal lines,
fiscal periods, trial balance, ledger, financial statements, functional
expenses, bank import, matching, and reconciliation. It does not yet have
productized integrations with QuickBooks, Sage Intacct, or Blackbaud Financial
Edge.

## Market Signal

Sage Intacct and Blackbaud are incumbent accounting systems. QuickBooks is
common in smaller and mid-sized nonprofits. MissionGranted and SmartGrant
Solutions style offerings exist because nonprofits need help bridging grant
requirements and accounting workflows. GrantPipe can reduce consultant
dependency if it integrates cleanly.

## Goals

- Import accounting transactions and dimensions into GrantPipe.
- Map accounting classes, customers, projects, funds, accounts, vendors, and
  departments to GrantPipe grants, funds, programs, contacts, and budget lines.
- Preserve source-system identity and sync history.
- Support read-only sync first, then controlled write-back.
- Make GrantPipe dashboards trustworthy without forcing an accounting system
  migration.

## Non-Goals

- Replacing Sage Intacct or Blackbaud in the first integration release.
- Supporting every accounting platform at once.
- Building a custom ETL framework before one integration proves the model.

## MVP Scope

- QuickBooks Online read-only integration as the first connector.
- OAuth connection and organization-level integration settings.
- Import chart of accounts, classes, customers or projects, vendors, expenses,
  deposits, and journal entries where API access allows.
- Mapping UI from accounting dimensions to GrantPipe grants, funds, programs,
  contacts, and budget lines.
- Sync status, sync logs, and error resolution.
- Duplicate detection through source object IDs and idempotency keys.
- Manual review queue for unmapped transactions.

## Functional Requirements

- Admin can connect and disconnect an accounting integration.
- Admin can choose sync start date and imported object types.
- Users can map accounting dimensions to GrantPipe dimensions.
- The system imports transactions without silently overwriting local edits.
- The system records source-system ID, sync timestamp, and sync status.
- The system flags unmapped or ambiguous transactions for review.
- Users can re-run sync safely.
- Users can see whether a GrantPipe expense or journal line came from the
  accounting system.

## Data Model Implications

- `accounting_integrations`
- `accounting_sync_runs`
- `accounting_sync_events`
- `external_accounting_objects`
- `accounting_dimension_mappings`
- `accounting_sync_conflicts`

Existing accounting tables should store optional external source references
where appropriate. Idempotency must be designed before import jobs run in
production.

## UX Surfaces

- Accounting integrations settings page.
- Connect QuickBooks flow.
- Mapping workspace.
- Sync health dashboard.
- Unmapped transaction review queue.
- Source-system badges on expenses and journal entries.
- Conflict resolution drawer.

## Permissions And Audit

- Only admin can connect, disconnect, or change integration settings.
- Editor can resolve mappings if allowed by org settings.
- Viewer and auditor can see source references where they can see the
  underlying accounting data.
- Every connection, disconnect, sync run, mapping change, imported object,
  conflict resolution, and write-back action must be logged.

## Success Metrics

- Number of connected accounting integrations.
- Percentage of imported transactions mapped to GrantPipe dimensions.
- Time from accounting close to GrantPipe dashboard refresh.
- Reduction in CSV imports and manual reconciliation.
- Accuracy of budget-vs-actual and reimbursement reports after sync.

## Risks And Open Questions

- Integration APIs vary widely. Start with QuickBooks Online to prove the sync
  model before Sage or Blackbaud.
- Two-way sync increases risk. Read-only import should be first.
- Accounting systems use classes, customers, projects, funds, departments, and
  custom fields differently. Mapping needs to be flexible but understandable.
- Blackbaud and Sage integrations may require partner access, customer API
  credentials, or paid modules.

## Launch Slice

Build QuickBooks Online read-only import, dimension mapping, sync logs, and
unmapped transaction review. Add controlled write-back and additional
connectors after the import model is trusted.
