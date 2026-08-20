# GrantPipe Books - Native Fund Accounting

## What this is

GrantPipe already tracks funds, grants, donations, and expenses. GrantPipe Books adds a full FASB ASC 958 double-entry general ledger on top of that existing data - so every donation, expense, and grant allocation auto-posts to the ledger. No QuickBooks. No manual journal entries for things the system already knows happened.

The product wedge: QuickBooks has no concept of a restricted fund. GrantPipe owns both sides of the transaction, so the GL writes itself.

**Scope of v1:** Chart of accounts (nonprofit template), double-entry journal, general ledger, trial balance, Statement of Financial Position, Statement of Activities, Statement of Functional Expenses, bank accounts, CSV/OFX import, bank reconciliation, fiscal periods with open/close, year-end close, recurring journal templates.

**Explicitly out of scope:** QuickBooks/Xero sync, Plaid live bank feeds, accounts payable, payroll, multi-currency, consolidated entities.

---

## Status

| Phase | Description                        | Status                                |
| ----- | ---------------------------------- | ------------------------------------- |
| A     | Ledger foundation                  | âœ… Complete (merged master)          |
| B     | Auto-posting integration           | âœ… Complete (merged master)          |
| C     | FASB financial statements          | âœ… Complete (merged master)          |
| D     | Bank accounts + reconciliation     | âœ… Complete (merged master)          |
| E     | Year-end close + recurring entries | âœ… Complete (merged master)          |
| F     | Web UI + feature flag              | âœ… Complete (merged master)          |
| G     | Marketing launch                   | ðŸ”´ Pending - gate: production usage |

---

## Phase A - Ledger foundation âœ…

**Delivered:** Chart of accounts, manual journal entries, reversal, trial balance, general ledger, fiscal periods, FASB statement scaffolding, nonprofit COA seed, activity log, role gates.

**Key files:**

- `packages/db/src/schema/accounting.ts` - 4 tables: `chart_of_accounts`, `fiscal_periods`, `journal_entries`, `journal_lines`
- `packages/db/src/migrations/0016_adorable_kingpin.sql`
- `packages/shared/src/validators/accounting.ts` - full Zod schema suite
- `apps/api/src/domains/accounting/` - `service.ts` (15 functions), `routes.ts` (14 endpoints), `coaSeed.ts`, `postingEngine.ts` (stubs)
- `apps/api/src/app.ts` - accounting routes mounted at `/api/accounting`

**Implementation notes:**

- `JournalLineInput` and `CreateJournalEntryInput` use `z.infer` (post-parse output type) - `debitCents` is always `number`, not `number | undefined`.
- Trial balance uses a LEFT JOIN with `or(isNull(journalLines.id), isNotNull(journalEntries.id))` to include zero-balance accounts and exclude lines from entries after the `asOf` date.
- Period validation inside `createJournalEntry` runs inside the transaction (TOCTOU fix).
- `postingEngine.ts` has empty stub functions - Phase B implements them.

---

## Phase B - Auto-posting integration

**Goal:** Every donation/expense create, update, or delete posts a balanced journal entry to the GL in the same DB transaction as the source record mutation.

### postingEngine.ts

Implement the two stubs in `apps/api/src/domains/accounting/postingEngine.ts`:

**`postDonation(db, { orgId, donationId, action })`**

- `"create"`: look up the donation (amountCents, restriction, fundId, date). Post JE with `source = "donation"`, `sourceId = donationId`.
  - Unrestricted: Dr Cash (account 1010), Cr Contributions-Unrestricted (4000). No fund tag on either line.
  - Restricted: Dr Cash (1010), Cr Contributions-Restricted (4010). Tag credit line with `fund_id`.
- `"update"`: reverse the original source-linked JE, then re-post with new values.
- `"delete"`: reverse the original JE.

**`postExpense(db, { orgId, expenseId, action })`**

- `"create"`: look up the expense (amountCents, grantId, fundId, functionalClass, date). Post JE with `source = "expense"`, `sourceId = expenseId`.
  - Dr Program/M&G/Fundraising Expense (by functionalClass), Cr Cash. Tag debit line with `fund_id` and `grant_id`.
  - If expense is against a restricted fund, also post: Dr Net Assets With Donor Restrictions-Released (3200), Cr Net Assets Without Donor Restrictions-Released (3100), same amount. This is the release-of-restriction pair.
- `"update"`: reverse + re-post.
- `"delete"`: reverse.

### Wrap existing domain services

- `apps/api/src/domains/donors/service.ts` - call `postDonation` inside the same transaction for createDonation, updateDonation, deleteDonation.
- `apps/api/src/domains/grants/service.ts` - call `postExpense` inside the same transaction for createExpense, updateExpense, deleteExpense.
- Guard: only call posting engine if org has `accountingEnabled = true` and an open fiscal period covers the record's date.

### Grant closeout

When a grant is closed with a remaining restricted balance, post an adjusting JE. Expose `closeoutDisposition: "release" | "return"` on the grant closeout call (default `"release"`):

- `"release"`: Dr Net Assets With Donor Restrictions, Cr Contribution Revenue-Unrestricted.
- `"return"`: Dr Net Assets With Donor Restrictions, Cr Program Expense (funds returned to funder).

### `accountingEnabled` flag

- Add `accountingEnabled boolean default false` to the `organizations` table (migration `0017_*`).
- `PATCH /org/settings { accountingEnabled: true }` (admin-only).
- All posting engine calls are no-ops when this flag is false.

### Constraints

- All postings happen inside the source record's DB transaction - JE insert failure rolls back the source mutation.
- If no open fiscal period covers the source record's date, throw a clear error.
- If no COA exists for the org, log a warning and no-op rather than hard-failing the donation/expense save.
- Tests: table-driven integration tests covering restriction Ã— functional class Ã— action combinations.

### Files to touch

```
apps/api/src/domains/accounting/postingEngine.ts   â† implement stubs
apps/api/src/domains/donors/service.ts             â† wrap create/update/delete
apps/api/src/domains/grants/service.ts             â† wrap expense + closeout
packages/db/src/schema/infrastructure.ts           â† accountingEnabled column (check where orgs table lives)
packages/db/src/migrations/0017_*.sql              â† new migration
```

---

## Phase C - FASB ASC 958 financial statements

**Goal:** Three headline FASB statements generated directly from the GL. Phase A scaffolded them; this phase implements them fully.

### Statement functions

Add to (or extract from) `apps/api/src/domains/accounting/service.ts`:

**`getStatementOfFinancialPosition(db, { orgId, asOf })`**

- Assets: `debitCents - creditCents` for all `type = "asset"` accounts where `entry.date â‰¤ asOf`.
- Liabilities: `creditCents - debitCents` for all `type = "liability"` accounts.
- Net assets: split by `naturalRestriction`. Sum `type = "net_assets"` accounts.
- Return shape: `{ assets: { total, items[] }, liabilities: { total, items[] }, netAssets: { unrestricted, temporarilyRestricted, permanentlyRestricted, total }, totalLiabilitiesAndNetAssets }`.
- Must satisfy: `assets.total = liabilities.total + netAssets.total`. Throw 500 with diagnostics if it doesn't.

**`getStatementOfActivities(db, { orgId, startDate, endDate })`**

- Revenue rows: `type = "revenue"` accounts, split by restriction (`fund_id` tag â†’ With Restrictions, no tag â†’ Without Restrictions).
- Releases from restriction: the release-of-restriction JEs from Phase B. Show as positive in "Without Restrictions" and negative in "With Restrictions".
- Expense rows: `type = "expense"` accounts by functional class.
- Three columns: Without Donor Restrictions / With Donor Restrictions / Total.
- Show change in net assets per column, beginning net assets, ending net assets.

**`getStatementOfFunctionalExpenses(db, { orgId, startDate, endDate })`**

- Rows: expense accounts grouped by name/subtype.
- Columns: Program / Management & General / Fundraising / Total.
- Driven by `account.functionalClass`.

### New endpoints

Add to `apps/api/src/domains/accounting/routes.ts`:

```
GET /accounting/reports/financial-position?asOf=      (viewer)
GET /accounting/reports/activities?from=&to=          (viewer)
GET /accounting/reports/functional-expenses?from=&to= (viewer)
```

All three accept optional `?format=csv` - return JSON by default, CSV when requested (use `c.body()` with `Content-Type: text/csv`).

### New validators

Add to `packages/shared/src/validators/accounting.ts`:

- `financialPositionQuerySchema` - `{ asOf: isoDatetimeString }`
- `activitiesQuerySchema` - `{ from: isoDatetimeString, to: isoDatetimeString }`
- `functionalExpensesQuerySchema` - same as activities

### Constraints

- All math in integer cents. No division anywhere in the service layer.
- Balance check on SFP is a hard invariant - if it fails, there's a bug in the GL.
- Tests: unit tests with mock GL data of known balances; verify every column and total.

---

## Phase D - Bank accounts + reconciliation

**Goal:** Import bank transactions, match them to GL entries, lock matched entries on reconciliation.

### New tables (migration `0018_*`)

**`bank_accounts`**

```
id, orgId, name, accountNumber (last 4 digits only), institutionName,
currencyCode (default "USD"), currentBalanceCents (nullable), isActive, createdAt
```

**`bank_transactions`**

```
id, orgId, bankAccountId, date, description, amountCents (positive = money in),
referenceNumber (nullable), status: unmatched|matched|ignored,
matchedJournalLineId (nullable), importedAt, source: csv|ofx
```

**`bank_reconciliations`**

```
id, orgId, bankAccountId, statementDate, statementEndingBalanceCents,
status: draft|completed, completedAt (nullable), completedBy (nullable), createdAt
```

### Import endpoints

**CSV import** `POST /accounting/bank-accounts/:bankAccountId/import/csv`

- Accept multipart/form-data with CSV file.
- Parse date, description, amount (handle positive/negative and debit/credit column conventions).
- Deduplicate by (bankAccountId, date, amountCents, referenceNumber).
- Insert as `status: unmatched`.
- Return `{ imported: N, skipped: N }`.

**OFX import** `POST /accounting/bank-accounts/:bankAccountId/import/ofx`

- Parse OFX/QFX SGML - extract `<STMTTRN>` blocks.
- Same dedup + insert logic as CSV.

### Matching endpoints

```
GET  /accounting/bank-accounts/:bankAccountId/transactions
     - paginated, filter by status/date

POST /accounting/bank-accounts/:bankAccountId/transactions/:txnId/match
     - body: { journalLineId }
     - sets status=matched; validates sign alignment between txn amount and JE line

POST /accounting/bank-accounts/:bankAccountId/transactions/:txnId/create-entry
     - body: CreateJournalEntryInput
     - creates a manual JE and immediately matches this txn to the first line

POST /accounting/bank-accounts/:bankAccountId/transactions/:txnId/ignore
     - sets status=ignored
```

### Reconciliation endpoints

```
POST /accounting/bank-accounts/:bankAccountId/reconciliations
     - creates draft reconciliation for statementDate + statementEndingBalanceCents

GET  /accounting/bank-accounts/:bankAccountId/reconciliations/:reconId
     - returns transactions through statementDate: cleared (matched) vs uncleared

POST /accounting/bank-accounts/:bankAccountId/reconciliations/:reconId/complete
     - validates: GL balance + uncleared credits - uncleared debits = statementEndingBalanceCents
     - if balanced: status=completed, lock all matched JEs (add reconciliationId to journal_lines)
```

### Constraints

- Matched/reconciled JEs cannot be edited or reversed without admin override + reason.
- Sign convention: positive = money in (from account holder perspective). A positive bank txn matches a debit line on the cash account; a negative bank txn matches a credit line.
- Tests: CSV parsing variations, matching logic, reconciliation balance check.

---

## Phase E - Year-end close + recurring entries

**Goal:** Proper fiscal year close (roll revenue/expense into net assets), and recurring JE templates for monthly allocations.

### Year-end close

`POST /accounting/fiscal-periods/:periodId/year-end-close` (admin only)

1. Validate: period status is `closed`, no unreconciled bank accounts for the period.
2. Generate closing JEs dated `period.endDate` with `source = "year_end_close"`:
   - For each revenue account with net credit balance: Dr Revenue Account, Cr Net Assets Without Donor Restrictions (3000).
   - For each expense account with net debit balance: Dr Net Assets Without Donor Restrictions, Cr Expense Account.
3. Mark period status = `locked`. Return generated JEs.

Idempotent: check for existing `year_end_close` JEs before generating - do not double-close.

### Recurring journal templates

New table `recurring_journal_templates`:

```
id, orgId, name, frequency: monthly|quarterly|annually, nextRunDate,
lines: JSONB [{accountId, fundId, grantId, debitCents, creditCents, memo}],
createdBy, isActive, lastRunAt
```

Endpoints (admin):

```
GET    /accounting/recurring-templates
POST   /accounting/recurring-templates
PATCH  /accounting/recurring-templates/:templateId
DELETE /accounting/recurring-templates/:templateId
POST   /accounting/recurring-templates/:templateId/run   â† manual trigger
```

Cron (Cloudflare Workers scheduled trigger in `wrangler.toml`):

- Daily handler: find all active templates where `nextRunDate â‰¤ today`.
- Post JE into current open period.
- Advance `nextRunDate` by frequency.
- Emit activity log entries.
- Guard: idempotent by `nextRunDate` - never use "did it run today?".

### Period-close checklist

`GET /accounting/fiscal-periods/:periodId/close-checklist` (admin)

Returns:

```json
{
  "unreconciled": [BankAccount],
  "unappliedTransactions": 12,
  "adjustingEntries": [JournalEntry],
  "openRecurring": [Template]
}
```

### Constraints

- Year-end close is idempotent.
- Cron is idempotent.
- Tests: year-end close with known balances verifying net asset roll; recurring template frequency advancement.

---

## Phase F - Web UI, feature flag, opening balances

**Goal:** Full in-app accounting module under `apps/web`, `accountingEnabled` flag, opening-balance seeder.

### Opening-balance seeder

`POST /accounting/seed/opening-balances` (admin)

- `?dryRun=true` returns `{ donations: N, expenses: N, estimatedJEs: N }` without writing anything. Admin must acknowledge.
- On commit: creates a fiscal period named "Opening Balances" with dates `[org.createdAt, firstRealPeriodStart - 1 day]`.
- Posts each historical donation as a JE using Phase B rules, `source = "opening_balance"`.
- Posts each historical expense as a JE.

### Web UI route tree

Under `apps/web/src/routes/_authenticated/accounting/`:

```
index.tsx                         - dashboard: cash position, unreconciled count,
                                    open period, net assets without/with restrictions
chart-of-accounts.tsx             - COA table, add/edit/deactivate accounts
journal/
  index.tsx                       - journal entry list, filter by date/source/fund
  new.tsx                         - manual JE form with balanced line editor
  $entryId.tsx                    - JE detail: lines, source link, reverse button
ledger.tsx                        - account + date range â†’ running-balance GL view
trial-balance.tsx                 - as-of date â†’ trial balance, CSV export
reports/
  financial-position.tsx          - SFP: as-of date, three-section layout
  activities.tsx                  - SOA: date range, three-column layout
  functional-expenses.tsx         - SFE: date range, matrix layout
bank/
  index.tsx                       - bank account list, add new
  $bankAccountId.tsx              - transaction list: unmatched/matched/ignored tabs,
                                    CSV/OFX import
  $bankAccountId/reconcile/
    $reconId.tsx                  - reconciliation workspace
periods.tsx                       - list periods, create/edit, close, year-end close
recurring.tsx                     - recurring template list and form
```

### Feature gate

- `accountingEnabled = false`: render a soft-launch card on all `/accounting/*` routes with a one-click "Preview & Enable" that calls the dry-run seeder, shows results in a modal, then confirms.
- Starter tier: show upgrade prompt pointing to Audit-Ready pricing.

### Design guidance

- Follow density and typography of `apps/web/src/routes/_authenticated/funds/$fundId.tsx`.
- Financial statement pages: print-friendly layout (white background, no sidebar, table-heavy). Add `window.print()` button.
- Journal entry form: running debit/credit total footer that turns red when unbalanced. Disable submit when unbalanced.
- All monetary amounts via `formatCents` or equivalent. Never display raw integers.

---

## Phase G - Marketing launch

**Gate:** Do not flip site copy until at least one paying org is running Books end-to-end in production.

**Positioning:** The first donor+grant system where restricted-fund accounting is native. Auto-posting is the wedge - the GL writes itself because GrantPipe owns donations, grants, and expenses.

**Working name:** GrantPipe Books. Confirm before writing copy.

**Copy rules:** Run `stop-slop` then `humanizer` on all user-facing copy. No fabricated testimonials or user counts. Builder perspective only.

### Site deliverables

| File                                                                     | Change                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/lib/homepage-content.ts`                                            | Flip accounting bullets from "coming soon" to included           |
| `src/pages/pricing.astro`                                                | Remove "coming soon" panel; accounting is in Audit-Ready         |
| `src/pages/index.astro`                                                  | Add secondary hero line tying accounting to the all-in-one claim |
| `src/content/vertical-pages/grant-funded-nonprofits.md`                  | Rewrite deferral sections to present tense                       |
| `src/config/site.ts`                                                     | Add Books to Product nav                                         |
| `src/pages/books.astro` _(new)_                                          | Full product page                                                |
| `src/pages/compare/grantpipe-vs-quickbooks.astro` _(new)_                | Capability matrix comparison page                                |
| `src/content/blog/quickbooks-classes-are-not-fund-accounting.md` _(new)_ | Cornerstone blog post                                            |

### Books page sections

1. Hero: "Your books, already posted." - "Every donation and expense auto-posts to your GL. No classes. No manual entry. No QuickBooks."
2. Auto-posting wedge: before/after diagram (QB manual tagging vs. GrantPipe auto-JE).
3. The three statements: SFP, SOA, SFE - with real screenshots.
4. COA template preview: show the nonprofit seed as a table.
5. Bank reconciliation: three-step visual (import â†’ match â†’ reconcile).
6. Period-close checklist screenshot.
7. Audit posture: every transaction is timestamped, activity-logged, tamper-evident.
8. FAQ: do I still need QuickBooks? Can I import my COA? What about my CPA? Is this audit-ready? Payroll?
9. Pricing CTA: Audit-Ready tier. QB sync as one coming-soon sentence.

### SEO

Target keywords: "nonprofit fund accounting software", "FASB ASC 958 software", "QuickBooks alternative nonprofit", "restricted fund tracking software", "nonprofit general ledger software".

Use `marketing-skills:seo-audit` + `marketing-skills:ai-seo` for titles, meta descriptions, slugs, and internal links.

Restore "FASB ASC 958-ready" in the site SEO description (removed in commit `26bbee5`, now earned).

### Structured data

- `books.astro`: `WebPage` + `FAQPage` JSON-LD.
- Update `schema.org/SoftwareApplication` blocks site-wide to add accounting.
- Use `marketing-skills:schema-markup` skill.

### In-app

- Empty-state card on `/accounting` (built in Phase F) links to the Books marketing page.
- Upgrade prompt for Starter orgs links to pricing page.
- Release-notes modal on first login after launch for existing Audit-Ready users.

### Analytics

- PostHog events on Books page: CTA clicks, FAQ expansions, scroll depth past statements section.
- Conversion funnel: homepage â†’ Books page â†’ pricing â†’ signup.

---

## End-to-end verification checklist

Run all of these before flipping Phase G copy to "available":

1. Enable `accountingEnabled` on a dev org â†’ nonprofit COA seeded + opening-balance JEs generated from existing data.
2. Create an unrestricted donation for $1,000 â†’ trial balance: Dr Cash $1,000 / Cr Contributions-Unrestricted $1,000; SOA "Without Restrictions" +$1,000.
3. Create a restricted donation to a fund for $5,000 â†’ SOA "With Restrictions" +$5,000; fund ledger $5,000 balance.
4. Enter a $2,000 expense against that restricted fund â†’ program expense posted; release-of-restriction JE $2,000; fund balance drops to $3,000; SOA reflects the release.
5. SFP balances: `assets = liabilities + net assets`.
6. SFE columns sum correctly across all rows.
7. Import CSV bank transactions; match some to existing JEs; create one JE from unmatched; complete reconciliation. Locked JEs cannot be edited.
8. Close the fiscal period â†’ further posts rejected; trial balance renders correctly for closed period.
9. Run year-end close â†’ closing JEs zero revenue/expense into net assets; next period opens clean.
10. Role gates: Viewer cannot POST journal entries (403); Editor can post manual JEs but cannot close periods; Admin can do everything.
11. Activity log shows every post/reverse/close/reconcile event.
12. Site pricing + features pages show accounting as "available"; QB sync still "coming soon".
