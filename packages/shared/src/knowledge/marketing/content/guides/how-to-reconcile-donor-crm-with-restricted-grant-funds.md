---
title: "How to Reconcile Donor CRM Data with Restricted Grant Funds"
description: "Development and finance track the same funders in different systems with different data. This guide explains why the records diverge, what a reconciliation"
seoTitle: "How to Reconcile Donor CRM with Restricted Grant Funds"
seoDescription: "Donor CRM and grant records diverge when separate teams enter data in separate systems. Learn the reconciliation workflow that keeps finance and development."
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
lastReviewedAt: "2026-04-26"
buyerStage: "mofu"
contentIntent: "category"
targetKeyword: "reconcile donor crm restricted funds"
targetPersona:
  - "finance-operations-staff"
  - "development-director"
  - "executive-director"
schema: "HowTo"
bluf: "Donor CRM records and grant fund records describe the same funders but from different operational perspectives. Development enters grant income as a donation with a fund designation. Finance enters it as a restricted fund award in the accounting system. When these two records are not reconciled, the organization has two different answers to 'how much did we receive from Foundation X this year' - and neither answer can be trusted fully."
timeEstimate: "4-8 hours initial reconciliation; 1-2 hours monthly maintenance"
difficulty: "intermediate"
steps:
  - title: "Map funder records between systems"
    content: "Start by generating a list of all funders in the donor CRM for the period under review - typically the current fiscal year. Export the list with funder name, gift date, gift amount, fund designation, and restriction classification. Then generate the matching list from the grants management or accounting system: grant name, funder, award date, award amount, restricted fund code, and grant status. The first reconciliation step is matching every CRM gift record to a corresponding grant record. Most funders will match on name and amount. Some will not match - that is where the work starts."
  - title: "Identify the four types of discrepancies"
    content: "After the matching exercise, remaining unmatched records fall into four categories. First: CRM has a gift that grants management does not - development recorded a contribution that finance never received or never coded as restricted. Second: grants management has a restricted award that the CRM does not - finance coded a grant that development never entered as a gift. Third: both systems have the funder but with different amounts - a common source is that development entered the pledged amount and finance entered the received amount. Fourth: both systems have the same amount but different restriction classifications - development coded it as unrestricted general support and finance coded it as restricted to Program X. Each discrepancy type has a different resolution path."
  - title: "Resolve CRM-only gifts - the development record without a finance record"
    content: "When development has a gift that finance does not, investigate whether the money was actually received. Check the bank statement for the relevant period. If the payment arrived and was deposited but not coded as a restricted fund in the accounting system, the error is on the finance side - create the restricted fund record and post the revenue correctly. If the payment has not yet arrived (a pledge or grant award letter that development treated as received income), the CRM record is premature. Update the CRM record to reflect the pledge status. Document the resolution and the date."
  - title: "Resolve grants management-only awards - the finance record without a CRM record"
    content: "When finance has a restricted fund award that development has not entered in the CRM, two situations are common. First, a government or agency grant came directly to finance without going through development - common for pass-through or agency awards that are not foundation relationships. Second, a grant was awarded and finance coded it but development forgot to update the CRM record. In both cases, add the missing record to the CRM with the correct award date, amount, and funder information. For government grants that are not cultivation relationships, note them as administrative records rather than development-managed relationships."
  - title: "Resolve amount discrepancies - pledge vs. received"
    content: "Amount discrepancies almost always trace to timing. Development may record the grant award amount when the award letter arrives. Finance records the amount when funds arrive in the bank, which may be different if the funder sends an initial payment followed by subsequent disbursements, or if the award was amended. Resolve by agreeing on one source of truth for each stage: the award amount (from the grant agreement or award letter) and the received-to-date amount (from the bank statement and accounting records). Update both systems to distinguish between award amount and received-to-date. This distinction matters for spend-down monitoring."
  - title: "Resolve classification discrepancies - unrestricted vs. restricted"
    content: "The most consequential discrepancy is when the two systems disagree on restriction status. Development enters a gift as unrestricted. Finance codes the same amount as restricted to a specific program. This usually happens when the grant agreement contains restrictions that the development team did not flag when entering the gift. The resolution requires reading the grant agreement or award letter to determine what the funder actually restricted. If restrictions exist in the award document, the CRM record must be updated to reflect the restriction, and the restriction classification must be documented with reference to the award document section that specifies it. A gift entered as unrestricted in the CRM that is actually restricted creates financial statement risk - the organization may be reporting available operating funds that are not actually available."
  - title: "Document the reconciliation for auditors"
    content: "The completed reconciliation should be a document - ideally a formal reconciliation worksheet - that shows every funder record in both systems, how they were matched, what discrepancies were found, and how each discrepancy was resolved. Include the date of reconciliation, the fiscal period covered, and the name of the staff member who performed it. This document becomes part of the audit file. An auditor testing restricted fund balances will want to see that finance and development are working from the same underlying data."
  - title: "Establish the ongoing monthly process"
    content: "After the initial reconciliation is complete, the monthly process is much lighter. Add a standing agenda item to the monthly close process: review new gifts entered in the CRM against new restricted fund receipts in the accounting system. Any new gift tagged with a fund designation should have a corresponding restricted fund entry in accounting within the same period. The goal is to never let the gap grow large enough to require a multi-day reconciliation exercise."
definitions:
  - term: Fund designation
    definition: The CRM field or tag that identifies which restricted fund a gift is intended to support. A fund designation in the donor record should correspond to a specific restricted fund code in the accounting system. When these do not match, the reconciliation fails.
  - term: Award amount vs. received-to-date
    definition: A grant award may be issued in full at the start or in installments over the award period. The award amount is the total from the grant agreement. The received-to-date is the cumulative cash received. Both figures matter for planning - the award amount sets the compliance obligation, while received-to-date sets the cash available.
  - term: Restriction classification
    definition: The determination of whether a contribution is unrestricted, temporarily restricted (purpose or time), or permanently restricted under ASC 958. This classification determines how the gift is reported in the financial statements and when the restrictions can be released.
faqs:
  - q: "Why do donor CRM and grant records get out of sync?"
    a: "Development staff enter gifts in the CRM as they manage the relationship - when an award letter arrives, when a check is received, when a pledge is made. Finance staff record receipts in the accounting system when money arrives in the bank and is properly classified. These two workflows happen independently with different timing and different purposes. Without a reconciliation step, the records diverge naturally."
  - q: "What is the most common reconciliation error?"
    a: "The most common error is classification disagreement - one system has a grant coded as unrestricted and the other has it coded as restricted. This usually happens when development enters a gift based on the relationship context (a trusted general support funder) but the grant agreement contains restrictions that were not reviewed before entry. Resolving it requires reading the actual grant agreement, not relying on either system's entry."
  - q: "How often should this reconciliation happen?"
    a: "A full reconciliation should happen at least annually, typically at fiscal year-end before the audit. Mid-year spot checks for major funders are advisable. After the initial reconciliation establishes a clean baseline, the ongoing monthly process - matching new CRM entries to new fund receipts within the same period - prevents the gap from growing."
  - q: "What if the two systems will never be fully synchronized?"
    a: "Some discrepancies are structural - government grants that are tracked in grants management but are not cultivation relationships in the CRM, for example. Document these as administrative-only records and note that they are not expected to match across systems. The reconciliation framework should account for deliberate exclusions, not just errors."
answers:
  - q: "Why do donor CRM and grant records get out of sync?"
    a: "Development staff enter gifts in the CRM as they manage the relationship - when an award letter arrives, when a check is received, when a pledge is made. Finance staff record receipts in the accounting system when money arrives in the bank and is properly classified. These two workflows happen independently with different timing and different purposes. Without a reconciliation step, the records diverge naturally."
  - q: "What is the most common reconciliation error?"
    a: "The most common error is classification disagreement - one system has a grant coded as unrestricted and the other has it coded as restricted. This usually happens when development enters a gift based on the relationship context (a trusted general support funder) but the grant agreement contains restrictions that were not reviewed before entry. Resolving it requires reading the actual grant agreement, not relying on either system's entry."
relatedPages:
  - "/restricted-fund-tracking-software/"
  - "/resources/topics/restricted-fund-accounting/"
  - "/resources/guides/restricted-fund-tracking"
  - "/resources/faq/faq-restricted-funds"
  - "/resources/faq/faq-donor-management-software"
leadMagnetSlug: "donor-to-grant-reconciliation-template"
tags:
  - "guide"
  - "reconciliation"
  - "donor crm"
  - "restricted funds"
---

The conversation usually starts with a number that does not match.

The Executive Director asks how much Foundation X gave the organization this year. Development says $75,000 - that is what the CRM shows. Finance says $50,000 - that is what was actually received and coded as restricted. Both people are right from their own system's perspective. Neither answer is the one the question requires.

This is the core problem of reconciling donor CRM data with restricted grant funds. The two systems describe the same funders from different operational vantage points, with different timing, different purposes, and different staff entering the data. When those records are not explicitly reconciled, the organization has no single reliable answer to basic questions about its funding position.

## Why the Records Diverge

Development staff and finance staff interact with grant income at different moments in the grant lifecycle.

Development's interaction starts when a prospect is identified, continues through cultivation, application submission, and award notification, and includes the full relationship history with the foundation's program officers. The CRM is a relationship management tool - it captures correspondence, proposals, award letters, and the cultivation activities that led to the award. Development typically enters the gift when the relationship event happens: the award letter is received, the pledge is made, or the check arrives.

Finance's interaction starts when money arrives in the bank account. The accounting system records the deposit, classifies the revenue by restriction type, assigns it to the correct fund, and creates the compliance obligation. Finance is not necessarily aware of the cultivation history. They are recording the financial transaction.

Between these two entry points, several things can go wrong: Development enters the full award amount when the letter arrives; finance enters only the first installment when it clears the bank. Development codes the gift as unrestricted general support; finance reads the grant agreement and codes it as restricted to workforce development program. Finance receives a government pass-through award that development never entered in the CRM at all.

None of these are errors in isolation. They are natural consequences of two different workflows operating without a formal handoff point.

## The Annual Reconciliation Process

A complete annual reconciliation should cover the full fiscal year and establish a clean baseline before the audit begins. Budget four to eight hours for the initial pass. Plan to spend most of that time on discrepancies - the matched records go quickly.

The process in summary: export both systems for the period, build a matching worksheet, identify all unmatched or mismatched records, resolve each discrepancy using source documents (grant agreements, award letters, bank statements), update both systems to reflect the resolution, and document the final reconciliation for the audit file.

The hardest discrepancies are classification disagreements. When one system says unrestricted and the other says restricted, the answer is in the grant agreement - not in either system. Pull the original award document and read the restriction language. That is the authoritative source.

## The Monthly Maintenance Process

Once a clean baseline exists, monthly maintenance is straightforward. During the monthly close process, finance should review new gifts entered in the CRM for the period and confirm that each gift with a fund designation has a corresponding restricted fund receipt in the accounting system. Development should review new restricted fund receipts posted by finance and confirm that the CRM funder record reflects the correct award amount, restriction classification, and grant status.

This review takes fifteen to thirty minutes when current. It catches discrepancies before they compound.

The key discipline is same-period reconciliation. If a gift is entered in the CRM in March, the corresponding fund receipt should be posted in the accounting system in March. If March closes with both records in alignment, the April reconciliation starts from a clean baseline. If March's entries are not reviewed until June, the investigation covers ninety days of transactions instead of thirty.

## When a Single System Solves the Problem

The reconciliation process described above exists because the CRM and the fund accounting system are separate. Finance staff cannot see the CRM. Development staff cannot see the fund accounting. When they need to share information, someone exports and someone else reconciles.

Organizations that move donor and grant management into the same system as fund accounting eliminate this class of problem. When a development staff member enters a grant award in GrantPipe, the corresponding restricted fund entry is part of the same workflow. There is no separate finance entry to reconcile against. The CRM record and the fund record are the same record.

This does not eliminate the need for a review process - someone should still verify that restriction classifications are accurate and that amounts match the award documents. But the reconciliation exercise described in this guide becomes a validation step rather than a gap-closing exercise.
