---
title: "Restricted Fund Tracking for Nonprofits [2026]"
description: "How nonprofits track restricted funds under GAAP (ASC 958). Covers donor-imposed vs time restrictions, spend-down reports, and software options."
seoTitle: "Restricted Fund Tracking Guide for Nonprofits"
seoDescription: "Restricted fund tracking for nonprofits in 2026: FASB ASC 958 requirements, donor-restricted funds, board-designated funds, and audit-ready workflows."
targetKeyword: "nonprofit restricted fund tracking guide"
publishedAt: "2026-04-01"
updatedAt: "2026-05-08"
lastReviewedAt: "2026-05-08"
verifiedAt: "2026-05-08"
buyerStage: "tofu"
schema: "Article"
bluf: "Restricted fund tracking is the process of segregating donor-restricted and grant-restricted dollars from unrestricted operating funds, monitoring expenditures against each restriction, and reporting spend-down to funders and boards. Under GAAP (ASC 958), nonprofits must classify net assets as either with donor restrictions or without donor restrictions - and track them accordingly. Organizations that do this in spreadsheets spend 8-15 hours per month on reconciliation and carry elevated audit risk. Organizations using software with native restricted fund tracking reduce that to a report pull."
definitions:
  - term: "Restricted funds"
    definition: "Money received by a nonprofit with donor-imposed or grantor-imposed conditions on how it may be spent. The restriction may be purpose-based (spend only on Program X), time-based (do not spend until 2027), or both. Restricted funds must be tracked separately from unrestricted operating revenue and reported to the funder or donor."
  - term: "Temporarily restricted (legacy term)"
    definition: "Under the pre-2018 GAAP framework, funds restricted by either purpose or time that would eventually become unrestricted upon fulfilling the condition. ASC 958 replaced this classification with 'net assets with donor restrictions' in 2018, but many nonprofit practitioners and accounting systems still use the older terminology."
  - term: "Permanently restricted (legacy term)"
    definition: "Under the pre-2018 GAAP framework, funds where the donor stipulated that the principal must be maintained in perpetuity (typically endowments), with only the investment income available for spending. ASC 958 folds this into 'net assets with donor restrictions' with disclosure of the nature and amount of restrictions."
  - term: "Net assets with donor restrictions"
    definition: "The current GAAP classification (ASC 958) for all restricted funds, replacing the former categories of temporarily restricted and permanently restricted. Includes purpose restrictions, time restrictions, and perpetual restrictions. Must be presented separately from net assets without donor restrictions on the statement of financial position."
  - term: "Spend-down report"
    definition: "A report showing the original restricted fund amount, cumulative expenditures charged against it, and the remaining balance. Typically organized by budget category for grant funds. Used for funder reporting, board updates, and internal compliance monitoring. The spend-down report is the primary tool for verifying that restricted dollars are being spent according to the donor or grantor's conditions."
answers:
  - question: "What is the difference between donor-imposed and time-restricted funds under GAAP?"
    answer: "A donor-imposed (purpose) restriction specifies how the money must be used - for example, funds restricted to a specific program, building project, or geographic area. A time restriction specifies when the money may be used - for example, a pledge payable in future years or a grant that cannot be spent until the program launch date. Some funds carry both restrictions simultaneously: $100,000 restricted to youth programming (purpose) and available only after July 1, 2027 (time). Under ASC 958, both types fall under 'net assets with donor restrictions' and must be tracked until the restriction is satisfied."
  - question: "How do nonprofits track restricted funds in practice?"
    answer: "Three approaches, ordered from least to most reliable: (1) Spreadsheets - a separate workbook or tab for each restricted fund, updated manually when transactions occur, reconciled against the general ledger monthly. Works for 1-3 funds but error-prone beyond that. (2) Accounting system fund codes - using classes, departments, or fund codes in QuickBooks or Sage to tag transactions. Better than spreadsheets but limited in reporting flexibility and funder-specific budget format support. (3) Purpose-built grant management software - restricted fund tracking integrated with expenditure coding, automatic balance updates, and funder-ready report generation. Eliminates the reconciliation step between tracking systems."
  - question: "What GAAP requirements apply to restricted fund reporting?"
    answer: "ASC 958 (Not-for-Profit Entities) requires nonprofits to classify net assets into two categories: with donor restrictions and without donor restrictions. The statement of financial position must present these separately. The statement of activities must show revenues, expenses, and reclassifications (releases from restriction) for each category. When a restriction is satisfied - the purpose is fulfilled or the time period lapses - the funds are reclassified from restricted to unrestricted. Disclosures must describe the nature and amounts of restrictions."
  - question: "What are the most common restricted fund compliance failures?"
    answer: "Five patterns recur: (1) Commingling - restricted dollars mixed with unrestricted operating funds in a single bank account or cost center without adequate tracking. (2) Spending beyond approved categories - charging expenses to a restricted fund that fall outside the funder's approved budget. (3) Delayed reclassification - failing to release funds from restriction when the condition has been met, which distorts financial statements. (4) Reconciliation gaps - differences between the general ledger restricted fund balance and the internal tracking spreadsheet. (5) Missing spend-down documentation - inability to produce an expenditure report tied to the restriction when the funder or auditor requests one."
relatedPages:
  - "/resources/guides/grant-budget-tracking"
  - "/compare/alternatives/salesforce-nonprofit"
  - "/resources/best/best-grant-management-software"
tags:
  - "restricted funds"
  - "fund accounting"
  - "GAAP"
  - "ASC 958"
  - "compliance"
  - "nonprofit accounting"
pricingStats:
  - stat: "The median nonprofit spends 6-8 hours per grant per year on reporting, with cumulative lifetime compliance effort reaching 30+ hours per grant"
    source: "Center for Effective Philanthropy Grantee Perception Reports (2021-2023)"
---

Restricted fund tracking is the operational core of nonprofit financial compliance. Every grant award, every donor-restricted gift, every endowment contribution creates an obligation to track how those dollars are spent, report on them to the funder or donor, and present them separately on financial statements.

Most mid-sized nonprofits handle this obligation with a combination of general ledger entries and supplementary spreadsheets. The general ledger records the transaction. The spreadsheet tracks which specific restriction the dollars belong to, what budget category the expenditure falls under, and how much remains.

This two-system approach works until it does not. The breaking point usually comes at audit time, when the spreadsheet and the general ledger disagree.

## What Restricted Funds Are Under GAAP

The Financial Accounting Standards Board (FASB) updated nonprofit financial reporting requirements with ASU 2016-14, effective for fiscal years beginning after December 15, 2017. The update simplified net asset classification from three categories to two:

**Net assets with donor restrictions:** All funds subject to donor-imposed purpose restrictions, time restrictions, or both. This single category replaces the former "temporarily restricted" and "permanently restricted" classifications.

**Net assets without donor restrictions:** All unrestricted funds, including board-designated funds (which are internally restricted but not donor-restricted under GAAP).

Despite the FASB update, many practitioners, accounting systems, and funder reports still use the older terminology. QuickBooks does not natively distinguish between temporarily and permanently restricted funds. Many grant agreements reference "restricted funds" without specifying the GAAP classification. This terminology gap is a source of confusion for development directors who manage funder relationships and finance directors who manage the books.

For practical purposes, the tracking obligation is the same regardless of terminology: every dollar with a donor or grantor restriction must be segregated, monitored, and reported separately from unrestricted revenue.

## Types of Restrictions

### Purpose Restrictions

A purpose restriction specifies what the money may be used for. Examples:

- A foundation grant restricted to direct program costs for the after-school tutoring program
- A donor gift restricted to building renovation
- A corporate gift restricted to staff professional development
- A government grant restricted to equipment purchases for the mobile health clinic

Purpose restrictions are satisfied when the organization spends the money on the specified purpose. At that point, the funds are reclassified from restricted to unrestricted on the statement of activities.

### Time Restrictions

A time restriction specifies when the money may be used. Examples:

- A multi-year pledge where the donor designates $25,000 per year over four years
- A grant with a specified project period (funds may not be spent before the start date)
- A contribution received in December that the donor designates for the following fiscal year

Time restrictions are satisfied when the specified time period arrives or lapses. The reclassification happens automatically based on the calendar.

### Perpetual Restrictions

Some donors stipulate that the principal of their gift must be maintained in perpetuity - endowment funds. Only the investment income generated by the principal is available for spending, and that income may itself carry purpose restrictions (income restricted to scholarships, for example).

Under ASC 958, perpetual restrictions are reported within "net assets with donor restrictions" with additional disclosures about the nature of the restriction and the organization's endowment spending policy.

## Tracking Methods: From Spreadsheets to Software

### Spreadsheet Tracking

The most common approach for organizations managing 1-5 restricted funds. A workbook with a tab for each fund, listing every transaction, the budget category, and the running balance.

**What works:** Low cost, familiar interface, customizable to any funder's budget format.

**What fails at scale:** No audit trail (anyone can change a cell), no automated reconciliation with the general ledger, formula errors accumulate silently, and staff turnover means the new person inherits a workbook they did not build. For organizations managing 5+ restricted funds, reconciliation alone can consume 8-15 hours per month.

### Accounting System Fund Codes

QuickBooks classes, Sage Intacct dimensions, or similar mechanisms that tag transactions to specific funds within the general ledger. Better than spreadsheets because the tracking lives inside the accounting system rather than alongside it.

**What works:** Eliminates the reconciliation step between two separate systems. Transactions are coded to the restricted fund and the general ledger simultaneously.

**What fails:** Most general-purpose accounting systems lack funder-specific reporting. They can show total expenses coded to a fund, but cannot produce a report in the format the funder requires (budget-to-actual by their specific categories). They also cannot prevent expenditures that would exceed the approved budget for a specific category - they record the transaction regardless. And they do not track compliance deadlines or reporting obligations.

### Purpose-Built Grant Management Software

Platforms designed specifically for the grant recipient's restricted fund tracking needs. Transactions are tagged to grants and budget categories at entry. Fund balances update automatically. Spend-down reports generate in funder-required formats. Budget overrun warnings fire before the transaction posts.

**What works:** Eliminates both the spreadsheet reconciliation problem and the funder reporting format problem. Creates an audit-ready record as a byproduct of normal operations.

**What to evaluate:** Not all grant management platforms handle restricted fund tracking equally. Some focus on the application and award tracking process but do not track expenditures at the budget category level. Test the specific workflows described below before committing.

## Board Reporting Obligations

Boards have a fiduciary responsibility to oversee restricted fund management. At minimum, the board should receive:

**Quarterly restricted fund summary.** A one-page report showing every active restricted fund, its original amount, cumulative expenditures, remaining balance, and next reporting deadline. This report should be generated from the tracking system, not assembled manually.

**Annual net asset classification.** The audited financial statements present net assets with and without donor restrictions. The board should understand the composition of restricted net assets - which funds are the largest, which are closest to full expenditure, and which have approaching deadlines.

**Release from restriction notifications.** When a purpose or time restriction is satisfied and funds are reclassified, the board should be informed. This changes the composition of net assets and may affect budgeting decisions for unrestricted programs.

## Spend-Down Reports: The Core Tracking Document

The spend-down report is the single most important restricted fund tracking document. It answers three questions for each restricted fund:

1. How much was the original award or gift?
2. How much has been spent, broken down by budget category?
3. How much remains?

For grant-funded restrictions, the spend-down report typically mirrors the funder's budget format:

| Budget Category | Approved Budget | Expended to Date | Remaining   | % Spent |
| --------------- | --------------- | ---------------- | ----------- | ------- |
| Personnel       | $120,000        | $95,000          | $25,000     | 79%     |
| Fringe Benefits | $30,000         | $23,750          | $6,250      | 79%     |
| Travel          | $8,000          | $3,200           | $4,800      | 40%     |
| Supplies        | $12,000         | $11,400          | $600        | 95%     |
| Contractual     | $25,000         | $18,000          | $7,000      | 72%     |
| Indirect Costs  | $19,500         | $15,135          | $4,365      | 78%     |
| **Total**       | **$214,500**    | **$166,485**     | **$48,015** | **78%** |

This report should be producible on demand - for a funder's interim report, for an auditor's request, for a board meeting, or for the development director's own compliance monitoring. If generating it requires manual compilation from multiple sources, the tracking system has a gap.

## Common Compliance Failures and Prevention

### Commingling

Restricted dollars deposited into a general operating account without adequate sub-accounting to track them separately. The money is not misused - it is just not tracked with enough precision to prove it was spent correctly.

Prevention: code every incoming restricted dollar to a specific fund at the point of deposit, not retrospectively. If your organization uses a single bank account for all revenue (common for mid-sized nonprofits), the tracking must happen at the accounting or software level, not the bank account level.

### Spending Beyond Approved Categories

A grant budget approves $10,000 for program supplies. The organization charges $12,000 in supplies to the grant. The $2,000 overage may be an allowable expense - but it exceeds the approved budget category, which is a compliance issue regardless of the expense's legitimacy.

Prevention: budget-to-actual monitoring at the category level. Systems that flag when a category approaches its approved limit prevent overages before they become findings. Spreadsheets do not flag; they record.

### Delayed Reclassification

A time-restricted gift becomes unrestricted on January 1, 2026, but the organization does not reclassify it until the June audit. For six months, the statement of financial position overstates restricted net assets and understates unrestricted.

Prevention: monthly review of time-restricted funds for reclassification eligibility. Calendar-triggered releases should be automatic in any competent tracking system.

### Reconciliation Drift

The spreadsheet shows $42,000 remaining on a grant. The general ledger shows $38,000. The $4,000 gap grew over three months because two transactions were recorded in the accounting system but not in the spreadsheet.

Prevention: eliminate the reconciliation requirement entirely by using a single system for both tracking and accounting, or by using a tracking system that syncs with the general ledger automatically. If you must maintain separate systems, reconcile weekly rather than monthly. Small discrepancies caught early are easy to trace; large accumulated discrepancies require forensic-level investigation.

## Evaluating Restricted Fund Tracking Software

When evaluating platforms, test these specific capabilities:

**Transaction-level fund tagging.** Enter an expense and assign it to a specific grant and budget category. Does the system require this at entry, or allow it to be added later? Systems that require it at entry produce cleaner records.

**Automatic balance updates.** After entering the expense above, check the restricted fund balance. Did it update automatically? Does the spend-down report reflect the new transaction without a manual refresh?

**Budget overrun prevention.** Enter an expense that would exceed the approved budget for a specific category. Does the system warn you? Prevent the transaction? Or simply record it?

**Funder report generation.** Generate a budget-to-actual report in the format a specific funder requires. Can the system produce this directly, or does it require data export and reformatting?

**Reclassification support.** Release a time-restricted fund from restriction. Does the system handle the reclassification entry, or must you do it manually in the general ledger?

If a platform cannot demonstrate all five capabilities in a trial, it is not solving the restricted fund tracking problem - it is automating part of it and leaving the rest to spreadsheets.

GrantPipe was built around these five capabilities because restricted fund tracking is not a feature to be added later. It is the foundation that the rest of grant compliance depends on.
