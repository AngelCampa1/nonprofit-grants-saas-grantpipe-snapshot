---
title: "Nonprofit Data Migration Cleanup Checklist"
description: "A cleanup checklist for nonprofit software migration across donor CRM data, grant records, restricted funds, documents, users, and reporting history."
seoTitle: "Nonprofit Data Migration Cleanup Checklist"
seoDescription: "Clean nonprofit data before migration. Check donors, funders, grants, restricted funds, documents, duplicate records, permissions, and report history."
targetKeyword: "nonprofit data migration cleanup checklist"
publishedAt: "2026-06-29"
updatedAt: "2026-06-29"
lastReviewedAt: "2026-06-29"
verifiedAt: "2026-06-29"
buyerStage: "tofu"
contentIntent: "category"
topicCluster: "grant-management"
primaryCta: "lead-magnet"
ctaMode: "educate"
targetPersona:
  - "finance-operations-staff"
  - "grants-manager"
schema: "Article"
bluf: "A nonprofit migration works best when donor, funder, grant, restriction, document, and user data are cleaned before import instead of repaired after launch."
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/section-200.302"
  - "https://www.ecfr.gov/current/title-2/section-200.334"
  - "https://www.irs.gov/charities-non-profits/form-990-resources-and-tools"
  - "https://www.cisa.gov/sites/default/files/publications/data_backup_options.pdf"
faqs:
  - q: "What data should nonprofits clean before migration?"
    a: "Clean contacts, organizations, gifts, pledges, grants, restrictions, funds, documents, users, tags, and reporting fields before import."
  - q: "Should old grant records be migrated?"
    a: "Migrate active grants, retained closed grant files, and records needed for reports, audits, renewals, or donor history."
  - q: "Who should own migration cleanup?"
    a: "Finance should own balances and restrictions. Grants should own award terms and reports. Development should own donor and funder records."
answers:
  - question: "What is the first migration cleanup step?"
    answer: "Export a full backup from each source system before changing records. Keep the backup read-only."
  - question: "What is the most common migration mistake?"
    answer: "Teams import messy data too early, then spend weeks fixing duplicates, stale fields, and missing documents inside the new system."
relatedPages:
  - "/resources/guides/nonprofit-crm-data-hygiene-guide"
  - "/resources/guides/donor-crm-migration-preparation"
  - "/resources/guides/nonprofit-crm-implementation-plan"
  - "/resources/guides/grant-document-management-system-requirements"
  - "/resources/guides/grant-management-spreadsheet-risk-checklist"
definitions:
  - term: "Data migration"
    definition: "The process of moving records from old systems into a new system while preserving meaning, history, and required support."
  - term: "Field mapping"
    definition: "The step that matches each source field to the correct field in the new system."
tags:
  - "migration"
  - "data-cleanup"
  - "nonprofit-crm"
---

# Nonprofit data migration cleanup checklist

Data migration is where a software project becomes real. The vendor demo is over. Now the team must move years of donor, grant, finance, and document records into a new system without losing the meaning behind them.

Do the cleanup before import. It is slower at first, but it prevents weeks of repair after launch. Use this with the [donor CRM migration guide](/resources/guides/donor-crm-migration-preparation) and the [nonprofit CRM implementation plan](/resources/guides/nonprofit-crm-implementation-plan).

## 1. Make a read-only backup

Before cleaning anything, export every source system. Include CRM data, grant spreadsheets, document folders, accounting exports, user lists, tags, custom fields, and reports.

Store the backup where only the migration owner can edit permissions. CISA recommends backups as a basic protection step. For nonprofits, backups also protect audit and donor history.

## 2. List every source of truth

Write down where each record type lives now. Do not assume the CRM is the source for all contacts. Funder records may live in a grant spreadsheet. Restrictions may live in accounting. Reports may live in shared folders.

Use this table:

| Record type   | Current source | Owner       | Keep, merge, or archive |
| ------------- | -------------- | ----------- | ----------------------- |
| Donors        | CRM            | Development | Keep                    |
| Grants        | Spreadsheet    | Grants      | Keep                    |
| Fund balances | Accounting     | Finance     | Keep                    |
| Documents     | Drive          | Grants      | Keep                    |

## 3. Deduplicate people and organizations

Merge duplicate donors, funders, vendors, board members, and contacts before import. Pick one naming rule. For organizations, decide whether to use legal names, common names, or both.

Pay close attention to foundations. The same funder may appear as a donor, grantmaker, and report contact. Migration is the right time to connect those records.

## 4. Clean grant records

Each active grant should have award amount, award period, funder, program, owner, approved budget, restriction terms, report dates, and closeout status.

For federal awards, 2 CFR 200.302 requires financial records that identify award source and use. If grant records lack award numbers or assistance listing details, add them before import when they apply.

## 5. Reconcile restricted balances

Finance should confirm balances before migration. Compare the grant tracker, accounting system, and last submitted report. If they do not match, fix the reason before import.

Do not import a disputed balance as if it were final. Use a status field such as "under review" if the team must move forward.

## 6. Standardize fields and tags

Old systems collect messy labels. "Foundation," "Foundations," and "Grantmaker" may mean the same thing. "Active," "Open," and "In progress" may mean different things.

Create a mapping sheet. Keep the final choices simple. Too many custom values make the new system feel old on day one.

## 7. Link documents to records

Documents are part of the data. Signed agreements, budgets, amendments, reports, invoices, approvals, and closeout letters should link to the right grant.

Use the [grant document management requirements guide](/resources/guides/grant-document-management-system-requirements) for file rules. If a document cannot be linked during import, store a clear path field.

## 8. Clean users and permissions

Do not migrate old access patterns by default. Staff roles may have changed. Former employees may still appear in old exports. Volunteers may have more access than needed.

Define roles before launch. Separate editors, viewers, finance reviewers, grants staff, and auditor access.

## 9. Decide what to archive

Not all old data needs to be active. Closed records may need to be retained but not used in daily work. Federal grant records are generally retained for three years after final report submission under 2 CFR 200.334, with exceptions.

Archive old data with clear search rules. Do not delete records needed for audit, Form 990 support, donor history, or renewal context.

## 10. Test the import

Run a small test import first. Use one donor, one foundation, one active grant, one closed grant, one restricted balance, and one document set.

Check record counts, totals, dates, links, and permissions. Then let the record owners review. Migration is done when the people who use the data can trust it.

## Keep a migration issue log

During cleanup and test import, keep one shared issue log. Record missing fields, duplicate rules, balance questions, broken document links, and permission concerns. Assign each issue an owner and status.

This log prevents the same question from returning in every meeting. It also gives leadership a clear view of what still blocks launch.

Do not hide unresolved issues. If a balance needs finance review or a document set is incomplete, mark it clearly. A known issue can be managed. A hidden issue becomes a launch surprise.

GrantPipe can be included in this process if your team is moving donor and grant records together. The same cleanup rules apply no matter which system you choose.
