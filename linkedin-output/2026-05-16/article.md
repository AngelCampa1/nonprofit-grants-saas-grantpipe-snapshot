# Restricted Fund Tracking: Why the Spreadsheet Breaks and What to Do Before It Does

The phone call that development directors dread comes on a Tuesday in October, three weeks before the funder's interim report is due: the finance director says the restricted fund balance in the accounting system does not match the tracking spreadsheet. The difference is $4,200. Neither person knows when it started.

This scenario repeats itself at hundreds of mid-sized nonprofits every fiscal year. The cause is almost never fraud. It is architecture — two systems that were never designed to stay in sync, managed by two teams who assumed the other had it covered.

Restricted fund tracking is not a software problem in isolation. It is a financial compliance obligation with GAAP requirements, funder reporting requirements, and audit risk attached to every active fund. Understanding why the two-system approach fails — and what replaces it — is the practical work of any organization managing more than a handful of restricted grants.

## The GAAP Obligation

FASB Accounting Standards Codification Topic 958 governs how nonprofits classify and report restricted funds. ASU 2016-14, effective for fiscal years beginning after December 15, 2017, simplified net asset classification from three categories to two.

Net assets with donor restrictions covers all funds subject to purpose restrictions, time restrictions, or both. This includes what was formerly called temporarily restricted and permanently restricted. Net assets without donor restrictions covers unrestricted funds, including board-designated amounts — which are internally restricted but not donor-restricted under GAAP.

The simplification on the face of the financial statements does not mean less tracking work. It means more. The notes to financial statements must now describe the nature and amounts of restrictions in the "with donor restrictions" category. When an auditor or funder asks for a breakdown of restricted net assets, the organization must produce a fund-by-fund listing tied to the balance sheet total. A summary figure with no underlying detail is not sufficient.

The standard is the floor. Every active restricted fund — every foundation grant, every donor-restricted gift, every government award with approved budget categories — must be tracked against its specific restriction and reported separately from unrestricted operating revenue.

## The Three Tracking Approaches

Organizations use three approaches to manage this obligation, each with a distinct failure mode.

**Spreadsheets** are the starting point for almost every organization that manages restricted funds without purpose-built software. A workbook with a tab per fund, listing transactions, budget categories, and running balances. The cost is low. The interface is familiar. The failure comes at scale.

Spreadsheets have no audit trail. Any cell can be changed without a record. Formula errors accumulate silently. When a staff member leaves, the new person inherits a workbook they did not build, with logic they did not document, and no way to verify that the formulas still match the underlying data. For organizations managing more than three or four restricted funds, the monthly reconciliation burden — ensuring the spreadsheet matches the general ledger — routinely reaches 8-15 hours per month. That time is not strategic work.

**Accounting system fund codes** — QuickBooks classes, Sage Intacct dimensions, similar mechanisms — improve on spreadsheets by keeping the tracking inside the accounting system. Transactions are coded to specific funds when posted. The reconciliation step between two separate systems disappears.

The failure mode here is reporting. Most general-purpose accounting systems can show total expenses coded to a fund, but they cannot produce a report in the format the funder requires. A foundation that wants a budget-to-actual report by their specific budget categories does not want a QuickBooks printout; they want their own format, with their own line items, showing how their money was spent. Producing that from a general ledger export requires a manual reformatting step that reintroduces the error risk that fund codes were supposed to eliminate.

General-purpose accounting systems also do not prevent budget overruns. They record the transaction regardless of whether it exceeds the approved budget for a specific category. They do not fire a warning when the supplies line is at 95% of the approved budget. They do not track compliance deadlines or reporting obligations.

**Purpose-built grant management software** handles all three gaps: fund-level transaction tagging, automatic balance updates, and funder-ready report generation. Transactions are assigned to grants and budget categories at entry. The spend-down report generates in the funder's format without an export step. Budget overrun warnings fire before the transaction posts.

The practical effect is that audit-ready documentation becomes a byproduct of normal operations rather than a year-end assembly project.

## The Five Compliance Failures

Five patterns recur in restricted fund audits at mid-sized nonprofits. Each is preventable.

**Commingling** is restricted dollars deposited into a general operating account without adequate sub-accounting. The funds are not misused — they are simply not tracked with enough precision to prove they were spent correctly. For organizations using a single bank account for all revenue, the tracking must happen at the accounting or software level, not the bank account level.

**Spending beyond approved categories** happens when a grant budget approves $10,000 for program supplies and the organization charges $12,000. The $2,000 overage may be a legitimate expense, but it exceeds the approved budget category — a compliance issue independent of whether the expense itself is allowable. Prevention requires budget-to-actual monitoring at the category level, with alerts before overages occur rather than after they are recorded.

**Delayed reclassification** occurs when a time-restricted gift becomes unrestricted but the reclassification is not recorded until audit. For months, the statement of financial position overstates restricted net assets and understates unrestricted. This distortion affects every financial metric and report produced during the gap period. Prevention requires a monthly review of time-restricted funds against their scheduled release dates.

**Reconciliation drift** is the accumulating gap between the spreadsheet and the general ledger. Two transactions posted in the accounting system but not in the spreadsheet in March become a $4,200 discrepancy by October. Small discrepancies caught weekly are straightforward to trace. Large accumulated discrepancies require forensic work and sometimes a qualified third-party accountant to untangle.

**Missing spend-down documentation** is the inability to produce an expenditure report tied to a specific restriction when the funder or auditor requests one. If generating the report requires pulling data from multiple sources and assembling it manually, the tracking system has a gap. The spend-down report — original award amount, cumulative expenditures by budget category, remaining balance — should be available on demand, not assembled under deadline pressure.

## The Spend-Down Report as the Core Document

The spend-down report answers three questions for every restricted fund: what was the original amount, what has been spent and in which categories, and what remains. For grant-funded restrictions, it mirrors the funder's budget format.

A typical grant spend-down at 78% of the period:

| Budget Category | Approved Budget | Expended     | Remaining   | % Spent |
| --------------- | --------------- | ------------ | ----------- | ------- |
| Personnel       | $120,000        | $95,000      | $25,000     | 79%     |
| Fringe Benefits | $30,000         | $23,750      | $6,250      | 79%     |
| Travel          | $8,000          | $3,200       | $4,800      | 40%     |
| Supplies        | $12,000         | $11,400      | $600        | 95%     |
| Contractual     | $25,000         | $18,000      | $7,000      | 72%     |
| Indirect Costs  | $19,500         | $15,135      | $4,365      | 78%     |
| **Total**       | **$214,500**    | **$166,485** | **$48,015** | **78%** |

The supplies line at 95% is the signal that matters. A finance director or grants manager looking at this report on a Tuesday has time to investigate before posting another supply order that voids the budget category. A finance director who sees this report for the first time when preparing the interim funder report does not.

The spend-down report should be producible on demand — for a funder's interim report, for an auditor's request, for a board meeting, for the development director checking in before a cultivation call. If generating it takes more than a few clicks, the tracking architecture has a gap.

## What Boards Need to See

Boards have a fiduciary responsibility for restricted fund oversight. Three deliverables satisfy the minimum:

A quarterly restricted fund summary showing every active fund, its original amount, cumulative expenditures, remaining balance, and next reporting deadline. This report should come from the tracking system, not be assembled by a staff member the night before the board meeting.

An annual explanation of net asset classification tied to the audited statements. Board members who do not understand the composition of restricted net assets — which funds are largest, which are approaching full expenditure, which have imminent deadlines — cannot exercise meaningful oversight.

Release-from-restriction notifications when purpose or time restrictions are satisfied. This changes the composition of net assets and may affect budgeting decisions for unrestricted programs.

Most boards of mid-sized nonprofits are not getting all three consistently. The constraint is usually not board interest — it is that the staff infrastructure to produce these reports reliably does not exist.

## Evaluating Whether a Platform Actually Solves the Problem

Before committing to any platform, test five specific capabilities during the trial.

Enter an expense and assign it to a specific grant and budget category. Does the system require this at entry, or allow it to be added later? Systems that require it at entry produce cleaner records.

Check whether the restricted fund balance updates automatically after the expense is entered. Does the spend-down report reflect the new transaction without a manual refresh?

Enter an expense that would exceed the approved budget for a specific category. Does the system warn you? Systems that merely record the transaction have not solved the budget overrun problem.

Generate a budget-to-actual report in the format a specific funder requires. Can the system produce this directly, or does it require data export and reformatting?

Release a time-restricted fund from restriction. Does the system handle the reclassification entry, or is it a manual step in the general ledger?

If a platform cannot demonstrate all five in a trial, it has automated part of the restricted fund tracking workflow and left the rest to spreadsheets.

## The Common Mistake

The most damaging pattern at mid-sized nonprofits is not a dramatic compliance failure. It is gradual drift — the spreadsheet and the general ledger slowly diverging, small discrepancies never quite resolved, report assembly becoming a project rather than a report pull, and the organization discovering the full extent of the problem only when the auditor arrives.

The practical fix is to consolidate: one system where the transaction, the fund tag, and the report live together. Reconciliation cannot drift when there is nothing to reconcile between.

Organizations that manage restricted funds in a single system with fund-level tracking, automatic balance updates, and funder-format reporting typically reduce their monthly compliance overhead from 8-15 hours to under two. That is time returned to program work, not saved by cutting corners.

## Starting This Week

Two things to do before the next board meeting:

First, calculate the current gap between the restricted fund tracking system and the general ledger. If any fund balance in the spreadsheet or tracking system does not match the corresponding balance in the GL, trace the discrepancy. A gap that exists now will not resolve itself.

Second, identify every active restricted fund with a reporting deadline in the next 60 days. Confirm the spend-down report for each is producible today, not at deadline.

GrantPipe was built around restricted fund tracking as the foundation that compliance reporting depends on — transaction-level fund tagging, automatic spend-down reports, and budget overrun warnings built into the workflow from the first transaction. Start a trial at grantpipe.com to see whether the workflow holds up against your current fund list.

---

_This article is from the GrantPipe team. GrantPipe is a donor and grant management platform built for mid-sized nonprofits managing donors, restricted funds, and grant compliance in one place._
