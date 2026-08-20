# Feature #1: Data Migration and Onboarding Studio

Status: in build. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 1 #1.

## Problem

GrantPipe already has a CSV import path for contacts, donations, grants, and
grant opportunities. That is not enough for a real nonprofit switch.

An organization also needs to bring over restricted funds, starting ledger
balances, and pledge schedules. If those records stay in spreadsheets, the new
system is not the system of record.

## Scope

Build on the existing import workflow instead of adding a second migration
tool.

1. Add import entity types for funds, opening balances, and pledge schedules.
2. Keep the same four-step flow: choose source, upload CSV, preview, commit.
3. Provide CSV templates and header aliases for each new entity type.
4. Create funds with org scoping and duplicate-name protection.
5. Post opening balances as one balanced journal entry.
6. Import pledge schedules with installments and pledge recognition.
7. Refresh donor, fund, pledge, accounting, dashboard, and activity queries
   after each import.
8. Show the import page as Data Migration Studio during setup.

## Non-goals

- One-click API migration from Bloomerang, DonorPerfect, QuickBooks, or
  Blackbaud.
- Automated source-system credentials.
- Background batch processing for very large files.
- Automatic cleanup or merge review for every possible legacy data issue.
- Direct donor payment collection.

## Data model

No new tables are required for the first slice. The studio writes to existing
tables:

- `contacts`
- `donations`
- `grants`
- `funds`
- `journal_entries`
- `journal_lines`
- `pledges`
- `pledge_installments`
- `import_history`
- `activity_log`

## Import contracts

### Funds

Required fields:

- `name`
- `type`

Optional fields:

- `externalId`
- `description`
- `restrictionPurpose`
- `restrictionSource`
- `startDate`
- `endDate`
- `status`
- `balance`

The import creates one fund per unique name in the org. Duplicate fund names
are skipped as duplicates.

### Opening balances

Required fields:

- `accountCode` or `accountId`
- `debit` or `credit`
- `entryDate`

Optional fields:

- `fundName` or `fundId`
- `grantName` or `grantId`
- `description`

The import must balance before anything is posted. All rows in a file must use
the same entry date and fiscal period. The service writes one journal entry with
`source = "opening_balance"` and one journal line per valid CSV row.

### Pledge schedules

Required fields:

- donor identity
- `pledgeDate`
- `installmentDueDate`
- `installmentAmount`

Optional fields:

- `externalPledgeId`
- `fundName` or `fundId`
- `grantName` or `grantId`
- `discountRateBasisPoints`
- `netAssetClass`
- conditional pledge fields
- `notes`

Rows are grouped into pledges by `externalPledgeId` when present. Otherwise the
fallback key is donor plus pledge date. Each group creates one pledge and one
installment per row.

## Accounting rules

- Opening balances must be balanced before the transaction commits.
- Opening balances post only into an open fiscal period for the entry date.
- Opening balance lines may be tagged to funds and grants only when those
  records belong to the same org.
- Pledge imports use the same present-value math as the pledge tracker.
- Conditional pledges are stored without recognition entries.
- Unconditional pledges post recognition entries through the pledge posting
  engine.

## API

The existing import endpoints remain the integration surface:

- `POST /import/preview`
- `POST /import/commit`
- `GET /import`

`commitImport` branches by entity type for batch imports that need cross-row
checks:

- `opening_balances`
- `pledges`

Row-by-row imports still handle:

- `contacts`
- `donations`
- `grants`
- `grant_opportunities`
- `funds`

## Web

The `/import` route becomes Data Migration Studio.

The page must show:

- Supported setup data: donors and gifts, funds and grants, opening balances,
  and pledge schedules.
- A record-type selector with all supported import types.
- A source preset selector.
- Template download for the selected import type.
- CSV upload, preview, commit, and import history.
- Inserted, duplicate, failed, and row-level error states.

## Acceptance criteria

- Funds import creates funds and skips duplicate fund names within the org.
- Opening balance import posts one balanced journal entry and rejects
  unbalanced files without writing a journal entry.
- Pledge import groups installments into pledges and creates installment rows.
- Conditional pledge imports do not post revenue.
- The web page exposes funds, opening balances, and pledge schedules as
  importable source types.
- Analytics include count buckets for funds, opening balance lines, pledges,
  and pledge installments.
- Cache invalidation covers the affected donor, fund, pledge, accounting,
  dashboard, and activity views.
- A marketing page exists at
  `/features/data-migration-onboarding-studio`.
