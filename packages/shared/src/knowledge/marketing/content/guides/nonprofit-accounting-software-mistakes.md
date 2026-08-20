---
title: "7 Nonprofit Accounting Software Mistakes That Lead to Audit Findings"
description: "Seven specific accounting software configuration and usage mistakes that produce audit findings, misclassified restricted funds, and inaccurate financial"
seoTitle: "7 Nonprofit Accounting Software Mistakes That Lead to Audit"
seoDescription: "Using QuickBooks class tracking as fund accounting, one bank account for all funds, retroactive payroll allocation - seven nonprofit accounting mistakes."
targetKeyword: "nonprofit accounting software mistakes"
publishedAt: "2026-04-28"
updatedAt: "2026-04-28"
lastReviewedAt: "2026-04-28"
buyerStage: "tofu"
targetPersona:
  - "finance-operations-staff"
  - "executive-director"
schema: "Article"
bluf: "A nonprofit that uses QuickBooks class tracking as its fund accounting system and carries a single bank account for restricted and unrestricted funds will fail an auditor's fund accounting review. These seven mistakes produce that failure - and four of the seven are configuration choices that organizations make when they go live on accounting software and never revisit."
faqs:
  - q: "Does QuickBooks work for nonprofit fund accounting?"
    a: "QuickBooks can produce fund-level reporting if configured correctly - primarily through class tracking - but class tracking is not a substitute for true fund accounting. The fundamental difference is that QuickBooks class tracking applies a tag to transactions but does not enforce fund-level restrictions at the accounting control level. A true fund accounting system prevents restricted funds from being spent on non-approved purposes at the software level; QuickBooks permits the transaction and relies on the user to notice the error. For nonprofits with straightforward restricted fund structures and under five active grants, QuickBooks with class tracking is workable. For organizations with complex grant portfolios, multiple restricted funds with overlapping expense categories, or federal award requirements, dedicated nonprofit accounting software (Blackbaud Financial Edge, Sage Intacct for nonprofits, MIP Fund Accounting) provides the control structure that QuickBooks cannot."
  - q: "What is fund accounting and why do nonprofits need it?"
    a: "Fund accounting is an accounting method that tracks resources in separate funds based on their purpose and restriction status - unrestricted, temporarily restricted (by time or purpose), and permanently restricted. FASB ASC 958 requires nonprofits to present financial statements with net asset classes that reflect these restrictions. Unlike for-profit accounting, which measures profit, fund accounting measures compliance: are restricted resources being used for their intended purpose? A nonprofit that cannot produce a fund-level balance showing each grant's beginning balance, additions, expenditures, and ending balance cannot demonstrate to a funder or auditor that it is managing restricted resources appropriately."
  - q: "What is FASB ASU 2018-08 and how does it affect contribution recognition?"
    a: "FASB ASU 2018-08 changed how nonprofits classify contributions as either exchange transactions (where the recipient delivers value in return) or contributions (where there is no commensurate value exchange). The standard introduced clearer criteria for determining whether a contribution is conditional - meaning the donor imposed a barrier that must be overcome before revenue is recognized - or unconditional. A conditional contribution (one with a specific performance requirement or right of return) is recognized as revenue only when the barrier is met, not when the cash is received. This matters for accounting software configuration: a conditional contribution received but not yet earned should be recorded as a refundable advance (liability), not as contribution revenue. Misclassifying conditional contributions as revenue at receipt overstates revenue and may affect compliance with donor-imposed restrictions."
answers:
  - q: "Does QuickBooks work for nonprofit fund accounting?"
    a: "QuickBooks can produce fund-level reporting if configured correctly - primarily through class tracking - but class tracking is not a substitute for true fund accounting. The fundamental difference is that QuickBooks class tracking applies a tag to transactions but does not enforce fund-level restrictions at the accounting control level. A true fund accounting system prevents restricted funds from being spent on non-approved purposes at the software level; QuickBooks permits the transaction and relies on the user to notice the error. For nonprofits with straightforward restricted fund structures and under five active grants, QuickBooks with class tracking is workable. For organizations with complex grant portfolios, multiple restricted funds with overlapping expense categories, or federal award requirements, dedicated nonprofit accounting software (Blackbaud Financial Edge, Sage Intacct for nonprofits, MIP Fund Accounting) provides the control structure that QuickBooks cannot."
  - q: "What is fund accounting and why do nonprofits need it?"
    a: "Fund accounting is an accounting method that tracks resources in separate funds based on their purpose and restriction status - unrestricted, temporarily restricted (by time or purpose), and permanently restricted. FASB ASC 958 requires nonprofits to present financial statements with net asset classes that reflect these restrictions. Unlike for-profit accounting, which measures profit, fund accounting measures compliance: are restricted resources being used for their intended purpose? A nonprofit that cannot produce a fund-level balance showing each grant's beginning balance, additions, expenditures, and ending balance cannot demonstrate to a funder or auditor that it is managing restricted resources appropriately."
relatedPages:
  - "/resources/guides/nonprofit-accounting-software-guide"
  - "/glossary/fund-accounting"
  - "/resources/guides/nonprofit-chart-of-accounts-restricted-funds"
  - "/resources/faq/faq-nonprofit-accounting-software"
  - "/resources/benchmarks/nonprofit-accounting-software-benchmarks-2026"
tags:
  - "guide"
  - "mistakes"
  - "nonprofit accounting"
  - "fund accounting"
---

A nonprofit audit that surfaces fund accounting deficiencies is not discovering a bookkeeping error - it is discovering a systems architecture problem. Most of the mistakes below were built into the organization's accounting configuration on day one and have compounded ever since. Seven mistakes, each with the specific consequence and the precise fix.

### Mistake 1: Using QuickBooks Class Tracking as a Fund Accounting Proxy

**The mistake:** The organization uses QuickBooks and assigns a class to each grant or restricted fund. Staff believe this constitutes fund accounting because they can generate class-based profit and loss reports by fund. The chart of accounts is a single set of revenue and expense accounts shared by all funds.

**Why it happens:** QuickBooks is familiar, affordable, and widely recommended for small businesses. Nonprofit staff who set it up - often without an accounting background - follow the "use classes for departments" advice and extend it to funds. QuickBooks does not prevent this configuration, and vendors selling QuickBooks to nonprofits do not always flag the limitation.

**The consequence:** Class tracking is a reporting tag - it does not enforce fund-level restrictions at the transaction level, does not maintain separate fund balances, and does not produce FASB ASC 958-compliant net asset class reporting without significant manual adjustment. An auditor who finds class tracking serving as the sole fund tracking mechanism will issue a finding under inadequate fund accounting controls. For organizations with federal awards, this finding may constitute a material weakness in internal controls.

**The fix:** Configure QuickBooks with a separate set of accounts per fund (using the sub-account structure) so restricted fund balances are maintained at the account level, not just through class reporting - or migrate to dedicated nonprofit accounting software with true fund accounting. For organizations with more than three active restricted grants, migration to dedicated software is the more sustainable path.

---

### Mistake 2: One Bank Account for All Restricted and Unrestricted Funds

**The mistake:** All cash - unrestricted operating revenue, restricted grant drawdowns, temporarily restricted donor gifts, and permanently restricted endowment distributions - flows through a single checking account. Fund separation exists only on paper, in the accounting system's class or fund coding.

**Why it happens:** Managing multiple bank accounts creates administrative overhead - separate reconciliations, separate signatories, separate statements. Organizations that started small and grew their grant portfolio without updating their banking structure carry this configuration for years.

**The consequence:** Commingling restricted and unrestricted funds is a compliance finding under most federal grant terms and a significant audit red flag. If a funder requires separate account maintenance - which many federal grants do explicitly - commingling is a condition violation that can result in award suspension. When separate accounts are not contractually required, the absence of physical separation makes it significantly harder to demonstrate that restricted funds were used only for approved purposes - the audit trail relies entirely on accounting entries rather than bank transaction evidence.

**The fix:** Establish a separate bank account for each major federal award or restricted fund pool (one account for all federal grants, one for foundation grants, one for unrestricted operations). The operational overhead is modest; the audit defensibility benefit is substantial. Reconcile each account separately and retain the reconciliation in each award's grant file.

---

### Mistake 3: No Formal Indirect Cost Allocation Method Documented Before Year-End

**The mistake:** The organization allocates indirect costs to grants and programs using a method determined informally - often by splitting shared costs based on program size estimates or whatever seems "fair" - without documenting the method in writing before the allocation period begins.

**Why it happens:** Cost allocation methodology is treated as an internal decision made at year-end during financial statement preparation, not as a documented policy maintained throughout the year. The finance director makes the allocation in December, enters the journal entries, and the allocations appear in the financial statements without any written methodology on file.

**The consequence:** An undocumented cost allocation method fails the 2 CFR 200.405 requirement that allocated costs benefit each program in proportion to the allocation. If an auditor asks how indirect costs were distributed and the organization cannot produce a written methodology that predates the allocation, the auditor cannot verify consistency or reasonableness. The likely finding: indirect costs allocated to federal awards are disallowed until the methodology is documented and shown to be defensible.

**The fix:** Write a Cost Allocation Plan (CAP) before the start of each fiscal year describing: what costs are in the indirect cost pool, the allocation base (total direct costs, total salaries, or square footage), and the calculation method. Approve it and retain it in the accounting files. Use the same methodology throughout the year - do not adjust the allocation basis retroactively at year-end.

---

### Mistake 4: Releasing Funds from Restriction Before Purpose Conditions Are Met

**The mistake:** The organization receives a restricted grant or restricted donor gift and records the full amount as contribution revenue in the period received, releasing it from restriction immediately - rather than holding the unearned portion in temporarily restricted net assets until the purpose condition is met.

**Why it happens:** Under older FASB guidance, the treatment of conditional contributions was ambiguous enough that many organizations defaulted to recognizing revenue when cash was received. FASB ASU 2018-08 clarified the conditional vs. unconditional distinction, but organizations that have not updated their revenue recognition policies continue to recognize conditional contributions at receipt.

**The consequence:** Premature release from restriction overstates net assets and understates liabilities. If the grant includes a return-of-funds clause and the purpose condition is never satisfied, the prematurely recognized revenue must be restated. An auditor who finds a restricted gift fully recognized at receipt - before the performance condition was met - will issue a revenue recognition finding under FASB ASC 958-605.

**The fix:** For every restricted contribution received, assess whether it is conditional (requires a performance barrier before revenue is earned) or unconditional (restriction is on purpose or time only). Conditional contributions are recorded as refundable advances (liabilities) until the barrier is overcome. Unconditional temporarily restricted contributions are recognized as revenue at receipt but tracked in temporarily restricted net assets until the purpose condition is met. Document the assessment for each material gift in the workpapers.

---

### Mistake 5: Payroll Allocated to the Wrong Grant Fund After the Fact

**The mistake:** Payroll is processed and recorded to a default cost center - typically the general operating fund - and then reallocated to specific grants at month-end through a journal entry adjustment, based on a staff member's recollection of how they spent their time.

**Why it happens:** The payroll system and the accounting system are not connected in a way that captures grant allocation at the time payroll is processed. Payroll runs on a biweekly cycle; grant allocations are updated monthly. The person responsible for the reallocation is working from memory or from rough time estimates rather than from actual time records.

**The consequence:** Retroactive payroll allocation based on estimates is a time-and-effort documentation failure under 2 CFR 200.430(i). Federal auditors specifically examine the gap between payroll processing dates and reallocation journal entry dates. Payroll booked to operating and then moved to a grant at month-end signals that the allocation is based on budget estimates rather than actual time worked. The affected payroll charges are at risk of disallowance.

**The fix:** Require all staff with any grant allocation to submit biweekly time records identifying the specific grant for each hour worked before payroll is processed. The payroll system should record wages against the correct fund code at the time payroll runs. If your payroll system cannot accommodate fund-level coding, implement a weekly timesheet submitted and approved before the pay period closes - and use those records as the basis for allocation, never from memory.

---

### Mistake 6: No Audit Trail for Manual Journal Entry Adjustments

**The mistake:** Staff with accounting system access make manual journal entries to correct coding errors, adjust allocations, or record accruals without documenting the reason for the entry, the authorization obtained, and the supporting documentation reviewed. The accounting system shows the entry but not why it was made.

**Why it happens:** Journal entry documentation is treated as optional - the entry fixes the number and the entry appears in the system, which seems sufficient. In small organizations, the same person who identifies the problem, approves the fix, and enters the journal entry. There is no segregation of duties and no formal documentation requirement.

**The consequence:** Manual journal entries without adequate documentation are a material internal control weakness finding. Auditors cannot distinguish a legitimate correction from a fraudulent manipulation of the accounting record when there is no supporting documentation. An entry that moves funds from a restricted grant account to an operating account - with no documentation of who authorized it or why - must be treated as a potential misuse of restricted funds until explained.

**The fix:** Implement a journal entry policy requiring every manual entry to include: the reason for the entry, the requesting staff member's name, supporting documentation referenced or attached, and supervisor or finance director approval. Configure accounting system access so at minimum two people are involved in every manual entry - one who prepares and one who approves. Document this policy in writing and train all accounting staff.

---

### Mistake 7: Chart of Accounts Built for Tax Filing Convenience, Not Fund-Level Reporting

**The mistake:** The organization's chart of accounts groups all program expenses into a small number of broad categories (Program Services, Management and General, Fundraising) that correspond to the Form 990 reporting categories - making the 990 preparation easy but making fund-level grant reporting difficult or impossible without additional off-system analysis.

**Why it happens:** The chart of accounts was originally set up by a bookkeeper or CPA who focused on what the 990 required, not on what grant reporting required. Adding detail to the chart of accounts later requires reclassifying historical transactions and is perceived as too disruptive to undertake.

**The consequence:** A chart of accounts without fund-level dimensions creates manual work every grant reporting cycle. Staff pull raw data, sort it by grant code from a separate spreadsheet, and manually compile the report - producing errors and a reconciliation gap between the submitted report and the general ledger. Funders who request a reconciliation cannot be satisfied.

**The fix:** Redesign the chart of accounts to include a fund dimension - as a separate account segment, class codes linked to specific funds, or a project/job tracking layer - so any expense can be reported at the fund level directly from the accounting system. The result should produce without manual work: a revenue and expense report per active grant, a restricted fund balance per award, and a consolidated statement. Implement during a fiscal year transition so prior-year comparatives can be restated consistently.
