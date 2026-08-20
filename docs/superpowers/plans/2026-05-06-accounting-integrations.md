# Accounting integrations implementation plan

Date: 2026-05-06

> Superseded on 2026-07-03. External accounting sync is unavailable in the
> current product and is not included in any plan. Do not use this plan as
> current implementation guidance.

## Goal

Implement the first QuickBooks Online accounting integration slice as an
Audit-Ready+ read-only MVP.

## Worktree

Branch: `feat/accounting-integrations`

Worktree: `.worktrees/accounting-integrations`

`git pull` was run before work began and the checkout was up to date.

## Implementation steps

1. Add shared entitlement and validators.
   - Add `hasAccountingIntegrations`.
   - Make Starter and Growth false.
   - Make Audit-Ready and Enterprise true.
   - Add validators for integration settings, sync requests, mappings, and
     conflict resolution.

2. Add database schema.
   - Add accounting integration, sync, external object, mapping, and conflict
     tables.
   - Add external source fields to journal entries, journal lines, and bank
     transactions.
   - Add indexes for org scoping, source object identity, and idempotency.

3. Add API domain.
   - Mount under `/api/accounting/integrations`.
   - Add QuickBooks connect URL generation with signed OAuth state.
   - Add encrypted token helpers.
   - Add list, settings, disconnect, sync, sync runs, events, mappings,
     unmapped, and conflict resolution routes.
   - Queue sync jobs instead of running QBO imports inline.

4. Add web workspace.
   - Add Accounting -> Integrations navigation.
   - Add `/accounting/integrations`.
   - Show plan-aware upgrade state.
   - Show QuickBooks read-only connection, setup, sync health, mapping, unmapped,
     and conflict review placeholders.
   - Add QuickBooks source badges to imported accounting rows.

5. Revise marketing.
   - Update shared pricing/capability sources.
   - Rewrite QuickBooks page around read-only ingestion.
   - Remove or correct public claims that imply two-way sync or write-back.

6. Verify.
   - Run targeted shared, db, api, web, and site tests.
   - Run typecheck.
   - Build web and site.
   - Request review.
   - Fix review issues.
   - Merge to master.
   - Remove worktree.
   - Run changed deploy dry run and deploy changed apps.

## Out of scope

- QuickBooks write-back.
- Customer, invoice, payment, or journal creation in QBO.
- Sage Intacct or Blackbaud connector implementation.
- Intuit App Store certification claim.
