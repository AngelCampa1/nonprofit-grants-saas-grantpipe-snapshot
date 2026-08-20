---
title: CSV Donor Import for Nonprofits
description: "Import your donor list from CSV with field mapping, de-duplication, and validation. Migrate from spreadsheets or a legacy CRM in under 15 minutes - no consultants, no migration fees."
seoTitle: "CSV Donor Import: Migrate Donors From Spreadsheets or Legacy"
seoDescription: "Import your donor list from CSV with validation, de-duplication, and field mapping. No consultants, no migration fees - under 15 minutes."
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: nonprofit-crm
contentIntent: workflow
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - executive-director
  - development-director
  - finance-operations-staff
tags:
  - feature
  - data-migration
  - nonprofit-crm
  - import
targetKeyword: csv donor import nonprofit
bluf: "CSV donor import handles field mapping, household de-duplication, and data validation before a single record writes to the database. Most CRM import failures come from one cause: inconsistent household formatting in the source file. GrantPipe surfaces those errors at preview time, not after the import runs."
faqs:
  - q: What fields does the CSV import support?
    a: "All standard donor fields: first name, last name, organization, email, phone, mailing address, giving history (date, amount, fund, payment method), soft credits, and custom fields your organization has defined. The field mapper lets you match any column header to any GrantPipe field."
  - q: How does household de-duplication work during import?
    a: "The importer matches on email address first, then on a normalized name-plus-address combination. Probable duplicates are flagged for review before the import completes. You choose whether to merge, skip, or create a new record for each flagged pair."
  - q: Can I import giving history alongside the donor record?
    a: Yes. Giving history rows can be included in the same CSV or imported separately after the donor records exist. The importer links gift rows to donor records by email or by an external ID column you define.
  - q: What happens if the import fails partway through?
    a: The import runs in a transaction. A failure rolls back the entire batch - no partial records. Fix the flagged rows and re-run. The error report identifies the exact row and column for each validation failure.
  - q: Is there a row limit on the CSV?
    a: "No hard row limit is enforced by the platform. Files over 50,000 rows process in background batches with progress tracking. The practical limit for a single run is the size of your source dataset."
  - q: Can I map custom fields during import?
    a: "Yes. If you have defined custom fields for contacts, you can map CSV columns to those fields during the field-mapping step. Custom fields must exist before the import runs."
relatedPages:
  - /resources/guides/how-to-migrate-from-salesforce-npsp
  - /resources/guides/switching-from-spreadsheets-to-crm
  - /features/audit-trail-activity-log
  - /features/custom-fields
  - /features/donor-segmentation
  - /product
  - /pricing
  - /features/donor-retention-reporting
proscons:
  - subject: GrantPipe CSV donor import
    pros:
      - Validation preview shows all errors before any record writes - no partial state to clean up
      - "Household de-duplication runs automatically, flagging probable matches for human review"
      - Giving history can be imported in the same file or in a separate pass
      - Custom field mapping at import time avoids a separate data-entry step
      - Background processing for large files with progress tracking
    cons:
      - Custom fields must be defined before the import run - they cannot be created inline during import
      - De-duplication matching is name-and-address based; low-quality source addresses produce more manual review flags
      - Import history is logged but past imports cannot be individually reversed - use the audit trail to identify and manually correct records if needed
answers:
  - q: What is the most common reason CSV donor imports fail?
    a: "Inconsistent household formatting. A spreadsheet that has 'John and Jane Smith' in one row and 'Smith, John' in another cannot be de-duplicated automatically. Standardizing name columns before import - last name, first name as separate fields - eliminates the majority of import failures and review flags."
  - q: How do I migrate from Salesforce NPSP using CSV import?
    a: "Export contacts, accounts, and opportunities from Salesforce as separate CSVs. Import donors first (contacts/accounts), then gifts (opportunities linked to contact records by email or external ID). The field mapper handles the Salesforce column naming conventions. Most NPSP-to-GrantPipe migrations using the CSV path complete within one business day."
  - q: Does CSV import support recurring gift history?
    a: Yes. Include a 'gift type' or 'recurrence' column in the giving history CSV and map it to the recurring flag. Historical recurring gift records appear in the donor's giving timeline. Active recurring schedules must be re-created manually or via the recurring-gift import path.
  - q: What format should the CSV be in?
    a: "UTF-8 encoded CSV with a header row. Comma-delimited. Date fields should be ISO 8601 (YYYY-MM-DD) or US format (MM/DD/YYYY) - the importer auto-detects the format from the first ten rows. Currency values should be numeric, no dollar sign or commas."
pricingStats:
  - stat: Organizations switching from spreadsheets to a CRM report spending an average of 4-8 hours on manual data entry per 100 donor records without an import tool
    source: Nonprofit Technology Network (NTEN) 2024 Nonprofit Technology Survey
    sourceUrl: "https://www.nten.org/research"
  - stat: Data migration is cited as the top barrier to CRM adoption by 44% of nonprofits that have delayed a software switch
    source: Idealware / NTEN State of Nonprofit Data 2023
    sourceUrl: "https://www.nten.org/research"
  - stat: Nonprofits with $500K-$10M budgets spend an average of 3.5% of operating budget on software per Nonprofit Tech for Good's 2024 report
    source: Nonprofit Tech for Good 2024 Technology Report
    sourceUrl: "https://www.nptechforgood.com/research-reports/"
tableData:
  name: CSV import field categories and examples
  description: Standard field categories supported by the importer. Custom fields are mapped after the standard fields.
  columns:
    - Category
    - Example fields
    - Notes
  rows:
    - - Contact identity
      - "First name, last name, organization"
      - Required; at least one name field must be present
    - - Contact details
      - "Email, phone, mailing address"
      - Email is used as the de-duplication anchor
    - - Giving history
      - "Gift date, amount, fund, payment method"
      - Can be included in the same CSV or imported separately
    - - Soft credits
      - "Attributed donor name, attributed amount"
      - Soft credits link to existing donor records by email
    - - External IDs
      - "Source system ID, legacy CRM ID"
      - Used to link gifts to donors when email is unavailable
    - - Custom fields
      - Any org-defined field
      - Must be pre-defined in GrantPipe before import
statistics:
  - stat: Organizations switching from spreadsheets to a CRM report spending 4-8 hours on manual data entry per 100 donor records without an import tool
    source: NTEN Nonprofit Technology Survey 2024
    sourceUrl: "https://www.nten.org/research"
  - stat: Data migration is cited as the top barrier to CRM adoption by 44% of nonprofits that have delayed a software switch
    source: Idealware / NTEN State of Nonprofit Data 2023
    sourceUrl: "https://www.nten.org/research"
  - stat: Nonprofits with $500K-$10M budgets spend an average of 3.5% of operating budget on software
    source: Nonprofit Tech for Good 2024 Technology Report
    sourceUrl: "https://www.nptechforgood.com/research-reports/"
sourceUrls:
  - "https://www.nten.org/research"
  - "https://www.nptechforgood.com/research-reports/"
  - "https://afpfep.org/"
  - "https://www.irs.gov/charities-non-profits/charitable-organizations/substantiating-charitable-contributions"
---

## The problem

Donor migration breaks down when old exports contain duplicate people, inconsistent names, stale addresses, and giving history that does not map cleanly into the new system. Teams need import control without turning setup into a data consulting project.

## How GrantPipe solves it

GrantPipe imports donor CSVs through a guided path that preserves giving history, relationship context, and cleanup decisions. The import becomes part of the setup record instead of a one-time spreadsheet event.

For onboarding and guided import questions, this is the feature page behind the first data move. The rollout starts with a controlled import path so staff can see what came over, what needed cleanup, and what records are ready for daily use.

CSV donor import is the fastest path from a spreadsheet or legacy CRM to a clean database. The importer handles field mapping, de-duplication, and validation before any record writes - so the errors you fix are the errors in your source data, not errors created by the import itself.

## TL;DR

- Field mapper connects any CSV column to any GrantPipe donor or gift field
- De-duplication runs on email and normalized name-plus-address before import completes
- Validation preview shows all errors by row and column before a single record writes
- Giving history imports in the same file or in a separate pass
- Large files (50K+ rows) process in background batches with progress tracking

## What this feature does

The CSV import takes a file from your current system - a spreadsheet, a Blackbaud export, a Salesforce CSV, a DonorPerfect extract - and walks it into GrantPipe through three steps: map the fields, review flagged rows, confirm and import.

The field mapper handles the reality that every system names columns differently. "First Name" in your file might be "fname" or "Contact: First Name" or "Donor First." You drag and drop until every column you want is linked to a GrantPipe field. Columns you do not map are ignored.

The validation step reads the entire file and surfaces every error before the import runs: missing required fields, duplicate email addresses, date values it cannot parse, currency values with unexpected formatting. You see the error count by category, and you can download a report listing each flagged row. Fix the source file and re-upload, or accept the import without the flagged rows.

The de-duplication step compares incoming records against existing donors and against each other. Matches are flagged for review, not automatically merged. You decide whether to merge or create a separate record.

## Who it's for

Development directors migrating from a spreadsheet-based donor tracking system. Finance staff handling a CRM switch after the organization outgrew its previous platform. Operations teams that received a donor database from a predecessor organization and need to bring it into the current system without losing the giving history.

## Workflow example

1. Export donors from your current system as a CSV (most platforms have an export button; spreadsheets save directly to CSV)
2. Upload the CSV to the GrantPipe import screen
3. Map each column header to the corresponding GrantPipe field
4. Review the validation report - fix any flagged rows in the source file or accept the import without them
5. Review de-duplication flags - merge, skip, or create for each probable duplicate
6. Confirm the import; records write in a single transaction
7. Run a second import for giving history if you imported donors-only in the first pass

The total time for a 5,000-donor file with clean source data is typically under 30 minutes from export to completed import.

## Why clean source data matters

The importer surfaces problems in source data it cannot resolve programmatically. The most common: multiple records for the same person under different name formats, addresses that do not parse cleanly, and gift rows that reference donor records not yet in the system.

Most of these are fixable in the source file before the import runs. The validation report tells you exactly which rows to fix. Spending 20 minutes cleaning the export before re-uploading is faster than correcting records one at a time after import.

## Integration with the rest of GrantPipe

Imported donor records work identically to manually created records. They appear in segments, donor reports, and communications history. Imported gift records appear in giving history and roll up into retention and LYBUNT reports. The full import history is logged in the audit trail - every batch is timestamped with the importing user and the file name.

## What it replaces

- Manual data entry for donor lists received as spreadsheets
- The consultant engagement most CRM vendors require for a data migration
- The multi-day import processes used by legacy platforms that process in overnight batches
- The partial-import failures that leave databases in inconsistent state

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [custom fields](/features/custom-fields)
- [donor retention reporting](/features/donor-retention-reporting)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
