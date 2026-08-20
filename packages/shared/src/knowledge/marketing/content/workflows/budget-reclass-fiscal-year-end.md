---
title: "Workflow: Reclass Grant Budget at Fiscal Year-End"
entitlement: "hasGrantBudgetAmendments"
description: "Step-by-step workflow for reclassifying grant budgets at FY-end: reconcile expenditures, book cross-year adjustments, and document for audit."
seoTitle: "Grant Budget Fiscal Year-End Reclass Workflow"
seoDescription: "Reconcile grant expenditures, reclassify cross-fiscal-year budget lines, and document every reclass entry before FY close. Audit-ready step-by-step."
targetKeyword: "budget reclass fiscal year end"
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: "mofu"
schema: "HowTo"
topicCluster: "grant-compliance"
contentIntent: "workflow"
primaryCta: "lead-magnet"
ctaMode: "educate"
refreshCadenceMonths: 12
leadMagnetSlug: "grant-reporting-calendar-template"
targetPersona:
  - "grants-manager"
  - "finance-operations-staff"
tags:
  - "workflow"
  - "grant budget"
  - "fiscal year-end"
  - "fund accounting"
  - "restricted funds"
timeEstimate: "4-8 hours at year-end, 1 hour monthly throughout the year"
difficulty: "intermediate"
prerequisites:
  - "Detailed grant budget by line item and fiscal year"
  - "General ledger expenditure detail coded to each grant"
  - "Grant agreements with period of performance dates"
  - "Prior-year grant carryforward balances if applicable"
  - "List of all open awards spanning the fiscal year-end date"
outputs:
  - "Budget-vs-actual variance schedule by grant and budget line"
  - "Journal entries reclassifying misposted expenditures to correct grants or periods"
  - "Roll-forward schedule of restricted fund balances into the new fiscal year"
  - "Signed reclass memo with preparer and reviewer signatures"
bluf: "Cross-fiscal-year grant budget reclassifications are where the restricted-fund roll-forward always breaks. Multi-year awards require splitting expenditures between fiscal years, reclassifying incorrectly coded charges before close, and carrying forward unspent restricted balances with precision. A reclass posted to the wrong year or the wrong fund code is an audit finding waiting for year-end fieldwork to surface it."
steps:
  - title: "Pull the budget-vs-actual for every open grant"
    content: "Extract expenditures by grant and budget category for the full fiscal year. Every open award needs its own variance report: approved budget by category, actual expenditures by category, and the difference. Use grant-level coding from the general ledger - not program-level summaries. Multi-year awards should show both the current-year column and the cumulative column."
  - title: "Identify expenditures that cross the grant period-of-performance"
    content: "Check each award's period-of-performance end date. Expenditures incurred before period end are eligible; those incurred after are not. Awards with a June 30 end date but a calendar fiscal year often produce split-period errors. Flag any expenditure where the invoice date, payment date, and budget period do not all fall within the award period."
  - title: "Locate misposted charges requiring reclass"
    content: "Compare the GL expenditure detail to the grant budget categories. Common errors: payroll coded to the wrong grant, indirect costs applied at the wrong rate, supply purchases that belong to an adjacent award. Also check for expenses coded to overhead or unrestricted that should carry a grant code. Document each potential reclass with the original entry date, account, amount, and grant."
  - title: "Confirm allowability before reclassifying"
    content: "A reclass moves a cost to a grant - it does not make an otherwise unallowable cost allowable. Before booking any reclass, confirm the charge meets the allowable, allocable, and reasonable test under 2 CFR 200 Subpart E (for federal awards) or the specific award terms (for foundations). If in doubt, leave the cost on unrestricted rather than reclassify it incorrectly."
  - title: "Book the reclass journal entries"
    content: "Enter each reclass as a dated journal entry in the fiscal year being closed. The entry reduces the original account code and fund, and increases the correct grant fund and account. Attach the supporting documentation - invoice, payroll report, or allocation worksheet - to each journal entry. Never book a batch reclass entry without line-level backup."
  - title: "Update the restricted fund roll-forward schedule"
    content: "For every grant with unspent restricted funds at year-end, the unspent balance carries forward as net assets with donor restrictions or as a deferred grant liability, depending on award type. Update the roll-forward schedule with the corrected balances after reclass. The roll-forward total must agree to the GL balance for each restricted fund at year-end."
  - title: "Tie the corrected totals to the grant budget schedule"
    content: "After reclasses are posted, re-run the budget-vs-actual. Corrected expenditures should now fall within approved budget categories. Any remaining variance requires written explanation: a legitimate budget overage, an underspend to be discussed with the funder, or a timing difference the funder has acknowledged. The grant budget schedule becomes the source for funder financial reporting."
  - title: "Obtain signatures and file the reclass documentation"
    content: "A reclass memo must state the reason for each entry, identify the preparer, and carry a reviewer's signature. File the memo, journal entry detail, and supporting documents together. Auditors test year-end reclass entries as part of both the financial statement audit and any Single Audit. Missing documentation is a significant deficiency finding - signed backup is not optional."
faqs:
  - q: "When must grant budget reclasses be posted by?"
    a: "They must be posted before the fiscal year-end close date - typically three to six weeks after the fiscal year ends, depending on your audit timeline. Reclasses posted after the trial balance is finalized require reopening the period, which most auditors require documented board or management approval."
  - q: "Can we reclass a charge to a grant whose period has already ended?"
    a: "Only if the expenditure was incurred during the award period and the close-out period has not elapsed. The standard close-out window is 90 days under 2 CFR 200.344 for federal awards. After that window, a post-closeout adjustment requires federal agency prior approval in writing."
  - q: "Do foundation grants follow the same reclass rules?"
    a: "The accounting mechanics are the same, but the allowability rules are set by the grant agreement rather than 2 CFR 200. Some foundation grants permit budget flexibility across categories (for example, up to 10% can move between line items without approval); others require prior written approval for any change. Check the award terms before posting."
  - q: "What is a restricted fund roll-forward?"
    a: "A schedule showing the beginning restricted balance, additions during the year, expenditures during the year, and the ending balance that carries into the next fiscal year. It reconciles net assets with donor restrictions per the general ledger and supports the financial statements and funder reporting."
  - q: "How many months of reclass history do auditors typically review?"
    a: "Most auditors focus on year-end entries (October through December for a September 30 fiscal year). However, prior-year reclasses and large mid-year entries also receive scrutiny. Maintaining consistent monthly reconciliation throughout the year reduces the volume and dollar size of year-end corrections."
relatedPages:
  - "/resources/guides/grant-budget-amendment-process"
  - "/workflows/year-end-restricted-release"
  - "/resources/guides/nonprofit-fiscal-year-end-close-checklist"
  - "/workflows/perform-monthly-grant-drawdown-reconciliation"
  - "/resources/guides/uniform-guidance-2-cfr-200-practical-guide"
  - "/resources/guides/allowable-costs-federal-grants"
definitions:
  - term: "Reclass (reclassification)"
    definition: "A journal entry that moves an expenditure from one account, fund, or grant to another, correcting a misposting without changing the total expenses on the organization's books."
  - term: "Period of performance"
    definition: "The date range during which a grantee may incur allowable costs under a grant award. Expenditures outside this window are generally unallowable regardless of budget availability."
  - term: "Restricted fund roll-forward"
    definition: "A reconciliation schedule tracing beginning restricted balances, current-year activity, and ending balances for each donor-restricted or grant-restricted fund."
  - term: "Budget-vs-actual variance"
    definition: "The difference between a grant's approved budget by category and the actual expenditures posted. Material variances require explanation and may require funder notification or prior approval."
answers:
  - question: "Who should prepare and review grant budget reclasses?"
    answer: "The grants accountant or bookkeeper prepares; the controller or finance director reviews and approves. Segregation of duties between the person identifying the reclass and the person approving it is a standard internal control. Auditors look for evidence of this two-signature process in the reclass documentation."
  - question: "What is the risk of skipping year-end grant budget reclasses?"
    answer: "Expenditures remain coded to the wrong grant or period. Funder financial reports overstate some awards and understate others. Restricted fund balances are inaccurate. These errors compound into prior-period adjustments in the following audit year - a corrected financial statement is far more expensive than a thorough year-end reclass."
  - question: "How do budget reclasses affect federal grant financial reporting?"
    answer: "Federal Financial Reports (SF-425) draw from the same grant data as the general ledger. If expenditures are misposted at year-end and the FFR is filed before they are corrected, the FFR is misstated. The correction requires an amended FFR filing, which triggers a query from the program officer and extends the audit scope."
pricingStats:
  - stat: "Allowable costs under federal grants must be consistently applied across fiscal periods and supported by adequate documentation, per 2 CFR 200.405"
    source: "OMB 2 CFR 200.405"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.405"
  - stat: "Federal grant close-out requires the submission of all financial, performance, and other reports within 120 calendar days of the end of the period of performance under 2 CFR 200.344"
    source: "OMB 2 CFR 200.344"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.344"
  - stat: "Cost transfers should be processed within 90 days of the original transaction to remain timely and adequately documented; later transfers require additional justification"
    source: "NIH Grants Policy Statement (illustrative federal agency guidance)"
    sourceUrl: "https://grants.nih.gov/grants/policy/nihgps/HTML5/section_7/7.4_changes_in_project_and_budget.htm"
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.405"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.344"
  - "https://grants.nih.gov/grants/policy/nihgps/HTML5/section_7/7.4_changes_in_project_and_budget.htm"
  - "https://asc.fasb.org/"
statistics:
  - stat: "Allowable costs under federal grants must be consistently applied across fiscal periods and supported by adequate documentation, per 2 CFR 200.405"
    source: "OMB 2 CFR 200.405"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.405"
  - stat: "Federal grant close-out requires the submission of all financial, performance, and other reports within 120 calendar days of the end of the period of performance under 2 CFR 200.344"
    source: "OMB 2 CFR 200.344"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.344"
  - stat: "Cost transfers should be processed within 90 days of the original transaction to remain timely and adequately documented"
    source: "NIH Grants Policy Statement"
    sourceUrl: "https://grants.nih.gov/grants/policy/nihgps/HTML5/section_7/7.4_changes_in_project_and_budget.htm"
---

Grant budget reclassifications at fiscal year-end are not optional housekeeping. They are the difference between financial statements that reflect reality and financial statements that require auditor adjustment. The grants accountant who defers reclasses to "deal with later" is setting up an avoidable prior-period adjustment.

## When to run this workflow

Run this workflow in the four to six weeks before your fiscal year close date - enough lead time to identify errors, obtain approvals, post corrections, and let the adjusted trial balance settle before the auditors arrive. For a September 30 fiscal year end, that means beginning the review in mid-August. For a December 31 fiscal year end, begin no later than the first week of December.

Also run a lighter version of this workflow monthly. Monthly budget-vs-actual reviews surface mispostings while they are small and recent. Year-end reclass volume is directly proportional to how inconsistently the monthly reviews happened throughout the year.

## Step-by-step

1. Pull the budget-vs-actual for every open grant.
2. Identify expenditures that cross the grant period-of-performance.
3. Locate misposted charges requiring reclass.
4. Confirm allowability before reclassifying.
5. Book the reclass journal entries with line-level backup.
6. Update the restricted fund roll-forward schedule.
7. Tie the corrected totals to the grant budget schedule.
8. Obtain signatures and file the documentation.

## When to run this workflow

Budget reclasses happen at two points in the grant lifecycle: mid-year, when a monthly reconciliation surfaces a misposting, and year-end, when the cumulative impact of smaller errors must be resolved before the trial balance closes. Year-end is where the stakes are highest, because a posting error that survives fiscal close becomes a prior-period adjustment requiring disclosure in the audited financial statements.

Multi-year awards with fiscal years that do not align to the grant's project year create the most complexity. A federal award running from October 1 to September 30 crosses two nonprofit fiscal years for an organization that closes December 31. Expenditures from January through September must be split precisely between the two fiscal years, and any reclass that touches the wrong calendar year requires opening a prior period.

## Common pitfalls

**Reclassing unallowable costs onto a grant.** Moving a charge from unrestricted to a federal award does not make it allowable. Alcohol purchases, contributions, and lobbying costs are unallowable regardless of which account they sit in. Reclassing them to a grant creates a questioned cost that an auditor will catch.

**Waiting until after the audit starts.** Auditors schedule fieldwork weeks after the fiscal year closes. Organizations that use the audit as the deadline for completing reclasses create exactly the scenario they want to avoid - auditors finding the errors first.

**Incomplete backup documentation.** A journal entry that references "budget reclass per manager instruction" without attaching the original invoice, payroll register, or allocation worksheet is not sufficient for audit. Each entry needs the source document it is correcting attached directly to the journal entry record.

**Misreading the period-of-performance end date.** Award amendment dates are not always reflected in accounting system grant setup. Always verify the current period-of-performance against the most recent Notice of Award, not the original award date.

**Conflating budget flexibility with allowability.** Some grant agreements allow up to 25% budget variance between categories without prior approval. Budget flexibility does not remove the allowability requirement - a charge must still meet the 2 CFR 200 cost principles regardless of whether it fits within a flexible budget envelope.

## Audit trail requirements

Every reclass journal entry requires:

- Date of the original misposting and date of the correcting entry
- Dollar amount and account codes for both the debit and credit sides
- Name of the preparer and date prepared
- Name of the reviewer and date approved
- Supporting documentation attached (invoice, payroll register, allocation schedule)
- Brief narrative explaining why the reclass is necessary

File all reclass documentation in the grant file, not solely in the accounting system. Auditors reviewing Single Audit workpapers expect to see physical or digital grant files with reclass documentation. A grant file that contains only the award and reports but lacks the year-end reconciliation documentation is a gap that auditors flag.

## How GrantPipe automates this

GrantPipe maintains grant budgets alongside general ledger expenditure coding, so the budget-vs-actual report for every open award is live rather than an end-of-year reconstruction. When a payroll allocation or an indirect cost application posts to the wrong grant, the variance appears immediately - not two months later when the reclass is harder to justify. Roll-forward balances update as reclasses are posted, so the restricted fund schedule is accurate throughout the year, not just at fiscal close. [Start a trial](/signup).
