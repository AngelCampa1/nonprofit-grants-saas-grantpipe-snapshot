---
title: "Accounting for Restricted Funds in a Nonprofit: The Complete Framework"
description: "Restricted fund accounting errors are the most common cause of single audit findings. Here is the complete framework: recognition, journal entries, release"
seoTitle: "Accounting for Restricted Funds in a Nonprofit: Complete"
seoDescription: "Restricted fund accounting errors drive most single audit findings. Learn the complete framework: donor intent, recognition under FASB ASU 2018-08, releases."
targetKeyword: "accounting for restricted funds in nonprofit"
publishedAt: "2026-04-28"
updatedAt: "2026-04-28"
lastReviewedAt: "2026-04-28"
buyerStage: "tofu"
targetPersona:
  - "finance-operations-staff"
schema: "Article"
bluf: "Restricted fund accounting errors are the most common cause of single audit findings at nonprofits receiving federal awards - and the errors almost always trace to one of three moments: when the fund is set up, when expenses are recorded against it, or when the restriction is released. Understanding FASB ASU 2018-08's conditional vs. unconditional distinction and the correct release-from-restriction workflow eliminates the majority of these errors."
faqs:
  - q: "What is the difference between a donor-restricted fund and a board-designated fund?"
    a: "A donor-restricted fund has limitations placed on it by an external party - a donor, grantor, or federal agency - that the organization cannot remove without the donor's consent or returning the funds. A board-designated fund is an internal allocation made by the board - it restricts use for planning purposes, but the board can rescind the designation by vote. Both may appear in the restricted category on the Statement of Financial Position in informal organizational tracking, but FASB ASC 958 requires them to be classified differently: donor-restricted funds in 'net assets with donor restrictions' and board designations in 'net assets without donor restrictions' with separate disclosure."
  - q: "How does FASB ASU 2018-08 change how nonprofit grants are recognized?"
    a: "FASB ASU 2018-08, effective for public nonprofit entities after June 15, 2018 and other nonprofits after December 15, 2018, clarified the distinction between exchange transactions and contributions, and between conditional and unconditional contributions. A grant is a contribution (not an exchange) if the funder receives no direct commensurate value. Among contributions, a conditional grant - one with a barrier that must be overcome before the nonprofit has a right to the resources - is not recognized as revenue until the conditions are substantially met. An unconditional grant is recognized immediately. The determination affects when revenue appears on the Statement of Activities."
  - q: "What journal entries record a restricted grant receipt and its release?"
    a: "Grant receipt (conditional, before conditions met): Debit Cash, Credit Refundable Advance (liability). Upon condition satisfaction: Debit Refundable Advance, Credit Contribution Revenue - With Donor Restrictions. When restricted expenses are incurred: Debit Program Expense, Credit Cash/Accounts Payable. Release from restriction: Debit Net Assets With Donor Restrictions (Reclassification Out), Credit Net Assets Without Donor Restrictions (Reclassification In). These four entries collectively move a restricted grant through its full lifecycle while maintaining FASB ASC 958 compliance."
answers:
  - question: "How do nonprofits account for restricted funds?"
    answer: "Nonprofits account for restricted funds through a four-stage process: (1) classification - determining whether the restriction is donor-imposed or board-designated, and whether it is conditional or unconditional; (2) revenue recognition - recording the award as deferred revenue (conditional) or restricted revenue (unconditional) when received; (3) expenditure recording - charging expenses against the restricted fund and maintaining documentation that expenditures meet the grant conditions; (4) release from restriction - recording a reclassification entry that moves net assets from 'with donor restrictions' to 'without donor restrictions' when conditions are met or purposes are fulfilled."
relatedPages:
  - "/resources/guides/restricted-fund-accounting-basics"
  - "/glossary/restricted-fund"
  - "/resources/guides/net-asset-release-workflow"
tags:
  - "guide"
  - "restricted fund accounting"
  - "FASB ASU 2018-08"
  - "grant compliance"
definitions:
  - term: Conditional contribution
    definition: Under FASB ASU 2018-08, a contribution that includes a barrier the recipient must overcome to be entitled to the resources, and a right of return or right of release if the barrier is not met. Common barriers include incurring qualifying expenses, achieving a specified level of programmatic output, or obtaining matching funds. Conditional contributions are recognized as revenue only when the conditions are substantially met.
  - term: Release from restriction
    definition: The accounting entry that transfers net assets from the 'with donor restrictions' classification to the 'without donor restrictions' classification when a donor-imposed purpose or time restriction has been satisfied. The entry does not affect total net assets - it is a reclassification between categories.
  - term: Refundable advance
    definition: A liability recorded when a nonprofit receives cash from a conditional grant before the conditions have been met. The liability reflects the organization's obligation to return the funds if conditions are not met. When conditions are substantially satisfied, the refundable advance is derecognized and contribution revenue is recognized.
---

Restricted fund errors generate more single audit findings than any other category of nonprofit compliance failure. The Government Accountability Office's 2022 analysis of single audit reports identified net asset classification and release-from-restriction errors as among the most prevalent material weaknesses at nonprofit federal award recipients. Understanding the three decision points - fund setup, expenditure recording, and restriction release - eliminates most of the risk.

### What Makes a Fund Restricted: Donor Intent vs. Board Designation

The source of a restriction determines its accounting treatment and its legal weight.

A donor-imposed restriction exists when an external party - an individual donor, a private foundation, or a government agency - specifies that resources must be used for a particular purpose or during a particular time period. The organization cannot change this restriction without the donor's consent or returning the funds. Spending restricted funds on an unapproved purpose is a breach of the gift agreement and, for federal grants, a potential violation of 2 CFR Part 200.

A board designation is an internal governance decision. The board votes to set aside unrestricted funds for a specific purpose - a capital reserve, a technology replacement fund, a programmatic initiative. This limitation is entirely within the board's authority to revoke. Under FASB ASC 958, board-designated amounts are presented as part of net assets without donor restrictions, with a separate disclosure showing the designation purpose and amount.

The practical distinction matters because organizations frequently tell auditors they have "restricted reserves" when what they have is a board-designated reserve that sits in the unrestricted net assets category. This misclassification on the Statement of Financial Position is a GAAP error.

### How Restrictions Appear in the Chart of Accounts

A properly constructed chart of accounts for a restricted-fund-intensive organization has a fund dimension or cost center dimension that identifies the source of restriction at the account level.

For each active grant, the chart of accounts should include: a fund code unique to that award, accounts for grant receivable or refundable advance, revenue accounts by restriction class, and expense accounts with sub-accounts or class tracking that ties expenditures to the award. The fund code is not a QuickBooks class - it is a structural element of the ledger that enables fund-level trial balances and reconciliation.

Federal grants should reference their Assistance Listing number (formerly CFDA number) in the fund code or a linked reference field, because the Schedule of Expenditures of Federal Awards (SEFA) required for single audit must aggregate expenditures by Assistance Listing number. If your chart of accounts does not connect award-level expenditures to Assistance Listing numbers, your SEFA must be manually constructed - which is error-prone and audit-visible.

### Revenue Recognition for Restricted Funds: FASB ASU 2018-08

FASB ASU 2018-08, "Clarifying the Scope and the Accounting Guidance for Contributions Received and Contributions Made," became effective for most nonprofits for fiscal years beginning after December 15, 2018. It answered a question that had produced inconsistent practice for years: when is a grant a contribution, and when is it an exchange transaction?

The two-part test: First, is the award a contribution (funder receives no direct commensurate value) or an exchange transaction (funder receives something of approximately equal value)? Government contracts where the agency specifies deliverables and the primary beneficiary is the government are exchange transactions, recognized as revenue under ASC 606 as performance obligations are satisfied. Grants where the public is the primary beneficiary are contributions.

Second, among contributions: is the grant conditional or unconditional? A conditional grant contains a barrier - a specific programmatic requirement, a matching funds threshold, or a performance target - that the nonprofit must overcome to be entitled to the resources. Until the barrier is substantially overcome, the grant is recorded as a refundable advance (liability), not as revenue. An unconditional grant is recognized as revenue (restricted or unrestricted) when the award is made.

Federal grants are almost always conditional contributions: the right to the funds depends on incurring allowable costs under the approved budget. This means a federal award letter, by itself, does not create revenue recognition - it creates an entitlement that is triggered by allowable expenditures. Many nonprofits incorrectly recognize federal grant revenue when cash is received rather than when qualifying expenditures are incurred. This misstatement overstates revenue and understates liabilities in the period of receipt.

### Release from Restriction: When and How

A restriction is released when the donor-imposed purpose has been substantially fulfilled or the specified time period has elapsed. The accounting entry is a reclassification - not a revenue or expense entry - between net asset classes.

The release requires two conditions: first, the expenditures charged against the fund must be allowable under the restriction terms (purpose test); second, for time-restricted funds, the specified period must have elapsed.

For purpose-restricted grants, the release is triggered by the expenditure event - not by the reporting event, not by the funder's acknowledgment of the report, and not by receipt of a final payment. The moment qualifying expenses are incurred and properly documented, the restriction on the corresponding dollar amount is released. Waiting until the funder approves the final report to record releases understates restricted fund releases and overstates restricted fund balances during the grant period.

The journal entry for a release from restriction:

- Debit: Net Assets With Donor Restrictions - Reclassification Out (increases the decrease to restricted net assets)
- Credit: Net Assets Without Donor Restrictions - Reclassification In (increases unrestricted net assets)

This entry is separate from and in addition to the expense entry. Many organizations record the expense without recording the corresponding release, which causes cumulative overstatement of restricted net asset balances and understates unrestricted net assets.

### Journal Entry Examples: Grant Receipt and Release

**Scenario: A nonprofit receives a $100,000 conditional federal grant in October. It incurs $30,000 in qualifying expenses in November.**

October - Grant receipt (conditional):

- Debit Cash $100,000
- Credit Refundable Advance - Federal Grant $100,000

November - Qualifying expenses incurred:

- Debit Program Expense - Grant Name $30,000
- Credit Cash / Accounts Payable $30,000

November - Revenue recognition (conditions met for $30,000):

- Debit Refundable Advance - Federal Grant $30,000
- Credit Contribution Revenue - With Donor Restrictions $30,000

November - Release from restriction (purpose fulfilled for $30,000):

- Debit Net Assets With Donor Restrictions - Reclassification Out $30,000
- Credit Net Assets Without Donor Restrictions - Reclassification In $30,000

At November month-end: Refundable Advance = $70,000, Restricted Revenue YTD = $30,000, Restricted Net Assets balance is net zero for this grant (revenue recognized and released in same period as expenses).

### Audit Documentation Requirements for Restricted Fund Releases

When your auditor tests releases from restriction, they will request documentation that demonstrates: (1) the restriction terms, from the original grant agreement; (2) the expenditures that triggered the release, with source documentation; and (3) evidence that the expenditures met the restriction conditions (allowable under the award terms).

For federal grants, the documentation standard under 2 CFR Part 200.333 requires that financial records, supporting documents, statistical records, and all other records pertaining to a federal award be retained for three years from the date the final expenditure report is submitted. This documentation must be sufficient to allow the auditor to reconstruct the relationship between individual expenditures and specific award conditions without relying on your staff's recollection.

The most common documentation failure: releases from restriction are recorded without a reference to the underlying award agreement or the specific expenditure documents that triggered the release. The journal entry exists, but the supporting documentation trail is broken. Auditors call this an unsupported journal entry - it is both an accounting deficiency and an audit finding.

### Common Errors That Produce Audit Findings

**Fund setup after spending begins.** Recording expenditures to a general operating cost center and retroactively reclassifying them to the correct restricted fund after period-end creates a documented correction trail that auditors examine for errors and consistency.

**Recording federal grant revenue at cash receipt.** Recognizing revenue when cash is received rather than when qualifying conditions are met overstates revenue and understates liabilities. This is the most common FASB ASU 2018-08 misapplication for federal grantees.

**Expenses recorded against the wrong fund.** A personnel cost charged to the operating fund instead of the grant fund understates grant expenditures and overstates operating expenses. The error affects the SEFA, the fund-level financial statements, and the grant's compliance status simultaneously.

**Missing or late release-from-restriction entries.** Failing to record releases overstates restricted net assets and understates unrestricted net assets. This misstatement is typically material - it affects both the Statement of Financial Position and the Statement of Activities.

**Using board-designated reserves to satisfy funder restriction claims.** An organization that spends donor-restricted funds on unapproved purposes and then documents the spending as "from board-designated reserves" has misappropriated restricted funds regardless of the journal entry description. Auditors will trace the cash flow, not just the fund label.

For a primer on the foundational concepts of restricted fund accounting, see [Restricted Fund Accounting Basics](/resources/guides/restricted-fund-accounting-basics). For a glossary definition and examples, see [Restricted Fund](/glossary/restricted-fund). For a step-by-step workflow for processing net asset releases, see [Net Asset Release Workflow](/resources/guides/net-asset-release-workflow).
