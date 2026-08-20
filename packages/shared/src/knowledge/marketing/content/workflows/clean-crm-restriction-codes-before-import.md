---
title: "Clean CRM Restriction Codes Before Import"
description: "A workflow for cleaning donor and grant restriction codes before moving CRM data into a grant or fund system."
seoTitle: "Clean CRM Restriction Codes Before Import"
seoDescription: "Clean CRM restriction codes before import with source checks, mapping rules, owner review, exceptions, and audit evidence."
targetKeyword: "clean CRM restriction codes before import"
publishedAt: "2026-06-29"
updatedAt: "2026-06-29"
lastReviewedAt: "2026-06-29"
verifiedAt: "2026-06-29"
buyerStage: "tofu"
primaryCta: "lead-magnet"
ctaMode: "educate"
contentIntent: "workflow"
topicCluster: "restricted-fund-accounting"
refreshCadenceMonths: 12
targetPersona:
  - "finance-operations-staff"
  - "grants-manager"
  - "development-director"
schema: "HowTo"
leadMagnetSlug: "grant-compliance-checklist"
bluf: "Clean restriction codes before import so donor intent, grant limits, release rules, and report fields enter the new system with one clear meaning."
sourceUrls:
  - "https://www.irs.gov/pub/irs-pdf/p1771.pdf"
  - "https://www.irs.gov/pub/irs-pdf/p4221pc.pdf"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.302"
faqs:
  - q: "Which restriction codes should be cleaned first?"
    a: "Start with active restricted gifts, open grants, reimbursable awards, and any code used in board or funder reports."
  - q: "Should old codes be imported?"
    a: "Import old codes only when they support open balances, required history, or audit support. Archive dead codes with a crosswalk."
  - q: "Who approves the final mapping?"
    a: "Finance should approve fund treatment, development should confirm donor intent, and grants staff should confirm award rules."
relatedPages:
  - "/resources/guides/nonprofit-crm-grant-tracking-requirements"
  - "/resources/guides/nonprofit-data-migration-cleanup-checklist"
  - "/resources/guides/grant-management-spreadsheet-risk-checklist"
  - "/resources/guides/restricted-fund-reconciliation-template-guide"
  - "/workflows/intake-donor-restriction-before-deposit"
  - "/workflows/reconcile-restricted-grant-cash"
answers:
  - q: "Why clean restriction codes before import?"
    a: "Dirty codes can turn one donor or funder rule into several system values, which makes balances and reports hard to trust."
  - q: "What is the main output?"
    a: "The main output is an approved code crosswalk with import values, retired values, source proof, and owner signoff."
estimatedTime: "2-5 hours for a small CRM export"
timeEstimate: "2-5 hours for a small CRM export"
difficulty: "intermediate"
roles:
  - "Finance reviewer"
  - "Development operations owner"
  - "Grants manager"
  - "Data migration lead"
prerequisites:
  - "CRM export with restriction codes"
  - "Open restricted fund balance list"
  - "Active grant list"
  - "Gift agreements and award letters"
  - "Chart of accounts or fund list"
steps:
  - title: "Export and group codes"
    content: "List every active and historical restriction code, usage count, balance, donor or funder source, and last transaction date."
  - title: "Map each code"
    content: "Assign each source code to a target fund, grant, restriction, report field, or archive value."
  - title: "Approve exceptions"
    content: "Review unclear codes with finance, development, and grants before import."
outputs:
  - "Restriction code inventory"
  - "Approved import crosswalk"
  - "Exception log"
  - "Archived code list"
auditEvidence:
  - "CRM export"
  - "Gift agreement or award source files"
  - "Code mapping approval"
  - "Balance tieout"
  - "Import test results"
commonFailures:
  - "Several old codes mean the same restriction"
  - "Donor intent is guessed from a short code"
  - "Closed grants are imported as active values"
  - "Finance and development use different names for the same fund"
automationOpportunities:
  - "Detect duplicate code names"
  - "Flag codes with open balances"
  - "Match codes to donor agreement files"
  - "Create import-ready picklist values"
tags:
  - "data migration"
  - "restricted funds"
  - "crm cleanup"
---

Restriction codes look small until they move into a new system. A code like "REST-EDU" may mean a donor restriction, a grant program, a campaign, or a board designation. If the team imports it without review, the new system starts with bad rules.

Use this workflow before importing donor, grant, or fund data from a CRM. The goal is to give every restriction code one clear meaning. It should be tied to a source file, a balance, and a future reporting use.

## Step 1: export the full code list

Export every restriction code from the CRM. Include active codes, inactive codes, transaction counts, last use date, total gift amount, open balance if available, campaign, fund, grant, appeal, and notes.

Do not clean only the active picklist. Some old values still matter because they support restricted net asset balances or audit history. A code with no recent gifts may still hold money that has not been released.

Add a column for source proof. This is where you will link the gift agreement, award letter, donor email, pledge, or board action.

## Step 2: group codes by meaning

Sort the export by name and description. Look for near duplicates. Examples include "Food Pantry," "Pantry," "FP," and "Restricted Food." These may need one target value.

Then sort by funder and campaign. A campaign name may have been used as a restriction code even when the actual donor restriction was narrower.

Group codes into four buckets:

- keep as active
- merge into another active value
- archive with history
- hold for review

Avoid guessing. A short code is not proof of donor intent.

## Step 3: tie codes to source files

For each active or open code, find the source document. Use the gift agreement, award letter, receipt language, board minutes, or funder terms.

The IRS donor acknowledgment rules in Publication 1771 are a good reminder that written gift records matter. For federal grants, 2 CFR 200.302 points to financial systems that identify awards and support accurate reporting. The same principle applies here: the code should connect to proof.

If the source file cannot be found, mark the code as an exception. Do not erase it. Bring it to finance and development for review.

## Step 4: map to the target system

Build a crosswalk with the old code, old label, target fund, target grant, target restriction type, target status, and import action.

Use plain target names. Staff should know what the value means without decoding it. If the new system separates grants from restricted funds, do not force both ideas into one field.

In GrantPipe, that usually means linking the award, fund, restriction note, budget, report dates, and evidence files instead of relying on one overloaded CRM code.

## Step 5: check open balances

Ask finance for the current restricted fund balance list. Compare it to the code inventory.

Every open balance should have a target value. Every target value with a balance should have source proof. If a code has gifts but no balance, confirm that the restriction was already released or spent.

This step prevents a common migration error: importing many historical values while missing the small set that still controls current money.

## Step 6: approve merges and archives

Merging codes changes how future reports group history. Archiving codes changes what staff can select after import. Both choices need approval.

Use a short approval sheet. List the codes to merge, codes to archive, reason, open balance, and source proof. Finance should approve fund treatment. Development should confirm donor intent. Grants should confirm award terms.

Keep rejected merge ideas in the exception log. That record helps explain why two similar values stayed separate.

## Step 7: test the import

Run a test import with a small sample. Include clean records, merged codes, archived codes, and exceptions.

After the test, check whether the target fields appear correctly. Then run a balance report and compare it to finance records. Also open several gift and grant records to confirm staff can understand the restriction without reading the old CRM export.

## Step 8: freeze changes before final import

Set a cutoff date. After that date, staff should not add new restriction codes in the old CRM unless the migration owner approves them.

Export one final code list, compare it to the approved crosswalk, and review any new values. Then import.

After import, save the export, crosswalk, approval sheet, exception log, and test results. A future auditor, funder, or board member should be able to see how the team moved restricted records without changing donor or funder intent.
