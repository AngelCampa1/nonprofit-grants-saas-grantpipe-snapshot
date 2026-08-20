---
title: "How to Track Federal Grant Draws and Reimbursements"
description: "A practical guide to federal grant draw tracking, covering advances, reimbursements, expense linkage, reconciliation, timing, and documentation."
seoTitle: "How to Track Federal Grant Draws and Reimbursements"
seoDescription: "Track federal grant draws and reimbursements: advance payment vs. reimbursement draw methods, connecting draws to expenses, GL reconciliation, and audit."
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
lastReviewedAt: "2026-04-26"
buyerStage: "mofu"
contentIntent: "workflow"
targetKeyword: "federal grant draw tracking workflow"
targetPersona:
  - "finance-operations-staff"
  - "executive-director"
schema: "HowTo"
topicCluster: "grant-compliance"
ctaMode: "evaluate"
primaryCta: "lead-magnet"
steps:
  - title: "Determine your payment method for each award"
    content: "Federal grants use two primary payment methods: advance payment and reimbursement. Under advance payment, the grantee requests funds before incurring expenses and must maintain the cash in an interest-bearing account (2 CFR 200.305). Under reimbursement, the grantee incurs expenses first and requests reimbursement afterward. Check the notice of award to confirm which method applies. Some agencies default to reimbursement; others allow advance payment requests through systems like Payment Management System (PMS) or Automated Standard Application for Payments (ASAP)."
  - title: "Set up the draw tracking record before the first request"
    content: "Before making the first draw, create a tracking record for each award: total award amount, cumulative amount drawn, cumulative expenditures per general ledger, period-specific expenditures, and any program income to offset. This record becomes the reconciliation tool for every draw request and for SF-425 preparation. Update it with every draw request and every monthly close."
  - title: "Connect each draw request to actual expenses in the general ledger"
    content: "Each draw request must be supported by actual expenses in your accounting system. For reimbursement draws, the expenses have already been incurred - pull a report of expenditures for the period, verify against the approved budget, and use that as the basis for the draw amount. For advance payment draws, incur the expenses against the advance before making the next draw. The connection between the draw amount and the supporting expenditures is the documentation trail auditors follow."
  - title: "Submit the draw through the correct payment system"
    content: "Different federal agencies use different payment systems: HHS grants commonly use PMS; education and other agencies use ASAP; some agencies have agency-specific portals. Confirm the payment system in the notice of award. Draw requests must include the grant award number, the reporting period, the federal share of expenditures, and any program income. Keep a copy of every draw request and the system confirmation."
  - title: "Reconcile draws to the general ledger monthly"
    content: "At month-end, reconcile three numbers: total draws requested to date, total federal expenditures per the general ledger, and any unspent cash on hand from advance draws. These three numbers must balance. Cumulative draws should not exceed cumulative expenditures plus any authorized advance. If the reconciliation shows a gap - draws exceeding expenses - the excess cash must be returned or offset against the next draw."
  - title: "Document each draw and maintain the trail"
    content: "Maintain a draw log for each award: date of request, amount requested, period covered, system confirmation number, and the expenditure report that supported the request. This log becomes the supporting documentation for the Federal Cash section of the SF-425 and for any auditor questions about cash management practices."
bluf: "Federal grant draws are not just cash transfers - they are compliance events. Each draw request must be supported by actual expenditures in the accounting system, reconciled monthly against the general ledger, and documented with enough detail that an auditor can trace every dollar from draw request to underlying expense. Organizations that treat draws as routine cash management without the documentation discipline create audit findings in the Federal Financial Transactions section of their single audit."
faqs:
  - q: "What is the difference between advance payment and reimbursement for federal grants?"
    a: "Under advance payment, the grantee requests funds before incurring expenses. Under 2 CFR 200.305, cash advances must be requested as close to the time of disbursement as possible and maintained in interest-bearing accounts. Under reimbursement, expenses are incurred first and the grantee requests repayment after the fact. Many agencies require reimbursement unless the grantee demonstrates the administrative capacity to manage advance payments."
  - q: "How long can an organization hold advance cash before drawing down?"
    a: "2 CFR 200.305(b)(3) requires advance payment funds to be disbursed by the grantee within 30 calendar days after receiving the advance. Cash held beyond 30 days is potentially subject to interest calculation and remittance. Practically, this means advance draws should be timed to match anticipated disbursements within the 30-day window."
  - q: "What happens if draws exceed actual expenditures?"
    a: "If cumulative draws exceed cumulative expenditures, the grantee is holding excess federal cash. This is a compliance issue under 2 CFR 200.305. The excess must be returned to the agency or offset against future draw requests. If discovered in an audit, it is a finding in the cash management compliance area, which is one of the tested compliance requirements in the OMB Compliance Supplement."
  - q: "What systems do federal agencies use for draw requests?"
    a: "The two most common are the Payment Management System (PMS), used primarily by HHS grantees, and the Automated Standard Application for Payments (ASAP), used by education, USDA, and other agencies. Some agencies use agency-specific portals. The notice of award specifies which system to use and provides registration information."
answers:
  - question: "Why is draw tracking a compliance area in the single audit?"
    answer: "Cash management is one of the standard compliance requirements tested in a single audit under the OMB Compliance Supplement. Auditors verify that draws were supported by actual expenditures, that cash was disbursed within required timeframes, that interest earned on federal cash was calculated and remitted appropriately, and that the draw amounts reconcile with the general ledger and the SF-425."
  - question: "How should draw tracking be set up for an organization with multiple federal awards?"
    answer: "Each award should have its own draw tracking record - not a combined tracking spreadsheet. The award-specific record shows the complete draw history, reconciles to the award-specific general ledger account, and provides the basis for the SF-425 Federal Cash section. Combined tracking introduces reconciliation errors and makes audit response slower."
definitions:
  - term: "Draw request"
    definition: "A formal request by a federal grantee to receive payment from the awarding agency, either as an advance (before expenses are incurred) or as reimbursement (after expenses are incurred)."
  - term: "Payment Management System (PMS)"
    definition: "HHS's centralized payment system used by grantees receiving funds from HHS agencies, including NIH, CDC, HRSA, SAMHSA, and others."
  - term: "ASAP (Automated Standard Application for Payments)"
    definition: "The Department of the Treasury's payment system used by many federal agencies including Department of Education, USDA, and others for grant payment requests."
  - term: "Program income"
    definition: "Gross income earned by a non-federal entity that is directly generated by a supported activity or earned as a result of the federal award. Must be reported on the SF-425 and may offset grant expenditures or require return depending on the award terms."
relatedPages:
  - "/grant-tracking-software/"
  - "/resources/topics/grant-compliance/"
leadMagnetSlug: "grant-budget-tracking-template"
tags:
  - "guide"
  - "federal grant draws"
  - "reimbursements"
  - "cash management"
  - "2 CFR 200"
---

## How Draw Requests Work

The mechanics of requesting federal grant funds differ by payment system and agency, but the underlying requirement is consistent: every draw request must be supported by actual expenditures in the accounting system, and the total draws made to date cannot exceed the total expenditures incurred to date.

This requirement - cumulative draws tied to cumulative expenditures - is the core of federal cash management compliance under 2 CFR 200.305.

## Advance Payment vs. Reimbursement

The distinction matters for both cash flow management and compliance.

Under advance payment, the organization requests funds in anticipation of expenditures. The advance must be disbursed within 30 days under 2 CFR 200.305(b)(3). Cash held beyond 30 days must earn interest, and any interest earned on federal cash above $500 per year must be returned to the federal government.

The documentation requirement for advance payment is the same as for reimbursement - the difference is timing. With advance payment, the documentation comes from the disbursements made within the 30-day window. With reimbursement, the documentation is the expenditure record that precedes the draw request.

Organizations with strong cash management systems and reliable monthly bookkeeping can generally manage either method. Organizations where close periods stretch and reconciliations lag often do better on a reimbursement basis - it forces the expenditure documentation before the draw can be made.

## The Reconciliation That Matters

The reconciliation that prevents cash management findings is simple in concept and frequently neglected in practice: monthly, the total federal draws made to date should equal the total federal expenditures recorded in the general ledger.

If draws exceed expenditures, the organization is holding federal cash it has not yet spent. This is an advance cash balance that must be returned or offset before the next draw.

If expenditures exceed draws, the organization has not yet been reimbursed for actual expenses. This is the normal state for organizations on reimbursement basis, and it is not a compliance problem - it is a cash flow management issue.

The reconciliation should be run as part of the monthly close process, not assembled for audit. Organizations that discover large reconciliation gaps at audit time are dealing with accumulated errors that are much harder to trace and correct than the same errors would have been month by month.

## Documenting Each Draw

A draw log for audit purposes contains:

The award grant number. The payment system and request number. The date the request was submitted. The period covered by the request (beginning and ending dates). The federal share of expenditures claimed. The expenditure report that supported the draw (typically a grant-specific expenditure detail for the period). The system confirmation and the date funds were received.

This log is not only a compliance record - it is the source data for the Federal Cash Transactions section of the SF-425. Organizations that maintain it throughout the year reduce SF-425 preparation time from days to hours.

Download the [Grant Budget Tracking Template](/free/grant-budget-tracking-template) for a pre-built tracking structure that includes draw reconciliation columns alongside budget-to-actual tracking.
