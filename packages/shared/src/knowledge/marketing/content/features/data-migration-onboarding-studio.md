---
title: Move Your Nonprofit Data Into GrantPipe
description: "Import donors, gifts, funds, opening balances, and pledge schedules from CSV. Preview each file before GrantPipe writes records."
seoTitle: Data Migration Software for Nonprofits
seoDescription: "Move nonprofit data from CSV into GrantPipe. Import donors, gifts, funds, balances, and pledges. Preview each file first."
targetKeyword: nonprofit data migration software
publishedAt: "2026-06-18"
updatedAt: "2026-06-18"
lastReviewedAt: "2026-06-18"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: nonprofit-crm
contentIntent: workflow
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: nonprofit-crm-cost-calculator
targetPersona:
  - executive-director
  - development-director
  - finance-operations-staff
tags:
  - feature
  - data-migration
  - onboarding
  - import
bluf: "Move setup data from CSV. Bring contacts, gifts, grants, funds, balances, and pledges. Check each file first. Then GrantPipe saves records."
faqs:
  - q: What can I import?
    a: "You can import contacts, gifts, grants, and funds. You can also import opening balances and pledge schedules."
  - q: Does preview save any data?
    a: "No. Preview reads the file and shows the rows. GrantPipe writes records only after you choose Commit import."
  - q: Can I import opening balances?
    a: "Yes. Opening balances must balance before GrantPipe posts the journal entry."
  - q: Can I import pledge schedules?
    a: "Yes. GrantPipe can import pledge rows with due dates and amounts. It groups rows into pledge schedules."
  - q: Which source presets exist?
    a: "GrantPipe has presets for Bloomerang, DonorPerfect, QuickBooks, and Salesforce NPSP. Other systems can use Generic CSV."
relatedPages:
  - /features/csv-donor-import
  - /features/restricted-fund-tracking
  - /features/pledge-multi-year-commitment-tracker
  - /features/multi-entity-consolidation
  - /product
  - /pricing
proscons:
  - subject: Data Migration Studio
    pros:
      - Previews each CSV before records are saved
      - Imports donors, gifts, grants, funds, balances, and pledges
      - Rejects opening balance files that do not balance
      - Keeps an import history with inserted, duplicate, and failed counts
    cons:
      - It does not connect to old systems by API
      - It depends on clean CSV exports
      - It does not merge every possible duplicate automatically
answers:
  - q: Why does migration need more than donor import?
    a: "A nonprofit switch needs more than names and emails. Funds and balances affect finance work when the new file is used."
  - q: How does GrantPipe reduce import risk?
    a: "The studio previews the file first. It shows rows and required columns before GrantPipe saves data."
  - q: What should my team import first?
    a: "Start with contacts. Then add gifts, funds, balances, grants, and pledges as needed."
sourceUrls:
  - "https://www.nten.org/research"
tableData:
  name: Data Migration Studio imports
  description: Setup files GrantPipe can import from CSV.
  columns:
    - File
    - What it creates
    - Guardrail
  rows:
    - - Contacts
      - Donor and organization records
      - Required type column
    - - Gifts
      - Donation history
      - Donor must match or be created
    - - Funds
      - Restricted and unrestricted funds
      - Duplicate fund names are skipped
    - - Opening balances
      - Starting journal entry
      - Debits must equal credits
    - - Pledge schedules
      - Pledges and installment rows
      - Rows are grouped into schedules
---

## The problem

Switching systems breaks when the first data move is weak.

Donor names may come over, but finance still lives in spreadsheets. Funds are
missing. Your team has not posted starting balances. Pledges have no due dates.
The team has a new app, but old files still run the work.

That is not a real launch.

## How GrantPipe solves it

Data Migration Studio gives setup data one place to land.

Your team uploads CSV files. Files can hold contacts, gifts, grants, funds,
balances, or pledges. GrantPipe previews each file. You can check rows. Fix the
source. Try again.

Balance files get a check. Debits must match credits. Then GrantPipe posts the
entry. Pledge files keep due dates with the promise. The donor keeps the
schedule.

## Summary

- Import contacts, gifts, grants, funds, balances, and pledges.
- Preview the file before GrantPipe saves records.
- Download a template for each import type.
- Use source presets or Generic CSV.
- Keep an import history for each run.

## What this feature does

Data Migration Studio uses the donor import path.

You pick the record type. You choose a source preset or Generic CSV. Then you
upload the file and preview it. GrantPipe shows the rows it can read. It also
shows required columns for that import type.

When you choose Commit import, GrantPipe writes records for your org. The
history card shows insert, skipped, and failed counts.

Fund imports create fund records. GrantPipe skips duplicate fund names.

Opening balance imports post one starting journal entry. The file must balance
first.

Pledge schedule imports group rows into pledges. Each due date becomes an
installment.

## How to plan the first import

Start with the data your team needs this week. Do not move every old note first.
That slows the launch and makes cleanup harder.

Most teams should start with contacts. Bring over people and groups first. Then
bring over gifts. That lets gift rows match the right donor record.

Next, set up funds. Funds link donor money to grant money. They also feed
finance reports. If a fund name appears in gifts or grants, create it first.
Then import those rows.

Then add opening balances. This step matters for finance. It tells GrantPipe
where the ledger starts. The file must balance before GrantPipe posts it. If it
does not balance, fix the CSV and try again.

Pledges should come over with due dates. A pledge without a schedule is hard to
collect and hard to book. Use one row per due date. GrantPipe groups those rows
into one pledge when they share the same pledge ID.

Keep each file small enough to review. A clean first import builds trust. A huge
file with old fields can hide errors. Move what the team needs first, then bring
older history over after launch.

## What to check after commit

Open a few records after each import. Check a donor, a gift, a fund, and one
pledge. Make sure names, dates, and amounts look right.

Open the journal entry for balances. Debits should match credits. Check the
date. It should use the right fiscal period.

For pledge schedules, open the pledge. Each due date should appear once. The
total should match the source file.

Use the import history card for setup. It shows the file and row counts. If a
row fails, fix the source. Then run that file again.

## Who it is for

This is for teams leaving spreadsheets. It also fits teams leaving old donor tools.

Gift staff can bring over donors and gifts. Finance can set up funds and
balances. Your team can keep pledge schedules in GrantPipe.

## What it replaces

- A donor import plus a separate finance spreadsheet
- Manual fund setup from old exports
- Hand-built opening balance journals
- Pledge schedules kept outside the CRM
- Import notes that live in email

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [csv donor import](/features/csv-donor-import)
- [restricted fund tracking](/features/restricted-fund-tracking)
- [pledge tracker](/features/pledge-multi-year-commitment-tracker)
- [multi-entity consolidation](/features/multi-entity-consolidation)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
