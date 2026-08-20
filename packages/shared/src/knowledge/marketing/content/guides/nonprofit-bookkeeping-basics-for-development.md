---
title: "Nonprofit Bookkeeping Basics: What Development Directors Need to Know"
description: "Nonprofit bookkeeping basics for development teams, including chart of accounts, restricted tracking, monthly close, reconciliations, and grant reporting."
seoTitle: "Nonprofit Bookkeeping Basics for Development Directors"
seoDescription: "Plain-English guide to nonprofit bookkeeping: fund accounting, chart of accounts, restricted fund tracking, monthly close, and what development directors must."
targetKeyword: "nonprofit bookkeeping"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
lastReviewedAt: "2026-04-29"
buyerStage: "tofu"
contentIntent: "category"
topicCluster: "restricted-fund-accounting"
schema: "Article"
bluf: "Nonprofit bookkeeping is fund accounting wearing the clothes of small-business bookkeeping. The single thing that separates a working nonprofit ledger from a broken one is whether every transaction carries both an account code and a fund code - without that pairing, the books cannot answer the question 'how much restricted money have we spent and how much remains?', which is the only question grant funders and the auditor will ask."
faqs:
  - q: "What is nonprofit bookkeeping?"
    a: "Nonprofit bookkeeping is the process of recording financial transactions using fund accounting principles, where every transaction is tagged to both a general ledger account (revenue, expense, asset, liability) and a fund or net asset class (unrestricted, donor-restricted, or board-designated). It differs from for-profit bookkeeping because nonprofits must track the spending obligations attached to restricted revenue and report on net assets without donor restrictions versus net assets with donor restrictions under FASB ASC 958."
  - q: "Do nonprofits use cash or accrual accounting?"
    a: "Most nonprofits with revenue above $250,000 use accrual accounting because GAAP, federal grants, and most audits require it. Cash basis is permitted for very small organizations, but federal awards under 2 CFR 200 and the FASB ASC 958 financial statement framework both assume accrual. Switching from cash to accrual mid-year is a heavy lift; choose accrual at the start if the organization expects to grow."
  - q: "What software do nonprofits use for bookkeeping?"
    a: "Most mid-sized nonprofits use QuickBooks Online with class tracking or QuickBooks Online Advanced for fund segmentation, then layer a grant management or restricted fund tracking system on top to handle the multi-fund reporting QuickBooks does not produce natively. Larger organizations move to Sage Intacct or Blackbaud Financial Edge once they have more than ten active restricted funds."
  - q: "How often should a nonprofit close its books?"
    a: "Monthly. A nonprofit that closes only quarterly or annually cannot detect restricted fund overspending in time to correct it, cannot produce timely board financials, and will struggle through the audit because reconciliations have piled up. The monthly close should produce a statement of activities, statement of financial position, and a fund balance report by the 15th of the following month."
  - q: "What is the difference between bookkeeping and accounting in a nonprofit?"
    a: "Bookkeeping is the day-to-day recording of transactions: entering bills, recording deposits, reconciling bank accounts, posting payroll. Accounting is the higher-order work: closing the books, preparing financial statements, calculating functional expense allocations, managing the audit, filing Form 990, and advising leadership on financial decisions. A nonprofit needs both functions even if one person performs them."
relatedPages:
  - "/resources/guides/cash-vs-accrual-for-grant-accounting"
  - "/resources/guides/nonprofit-chart-of-accounts-restricted-funds"
  - "/resources/guides/restricted-fund-accounting-basics"
  - "/resources/guides/nonprofit-financial-statements-guide"
sourceUrls:
  - "https://asc.fasb.org/"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
  - "https://www.councilofnonprofits.org/running-nonprofit/administration-and-financial-management/financial-management"
statistics:
  - stat: "Federal awards above $1,000,000 in a fiscal year trigger the single audit requirement under 2 CFR 200 Subpart F."
    source: "Office of Management and Budget, 2 CFR 200.501"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F"
  - stat: "Approximately 1.8 million tax-exempt organizations are registered with the IRS, the majority of which are required to maintain books and records sufficient to substantiate Form 990 filings."
    source: "IRS Tax Exempt Organization Search and Form 990 instructions"
    sourceUrl: "https://www.irs.gov/charities-non-profits/tax-exempt-organization-search"
tags:
  - "guide"
  - "nonprofit bookkeeping"
  - "fund accounting"
  - "restricted funds"
targetPersona:
  - "executive-director"
  - "finance-manager"
definitions:
  - term: Fund accounting
    definition: A bookkeeping system in which transactions are tagged to both a general ledger account and a fund (a self-balancing set of accounts representing a restricted purpose, a board designation, or unrestricted operations). Fund accounting is the foundation of nonprofit bookkeeping.
  - term: Net assets without donor restrictions
    definition: The FASB ASC 958 term for what was previously called "unrestricted" net assets. Money the organization can spend on any mission-consistent purpose, including operating reserves and board-designated funds.
  - term: Net assets with donor restrictions
    definition: Donor-imposed restrictions on the use or timing of funds. Includes both temporarily restricted (purpose or time-limited) and permanently restricted (endowment) categories under the prior GAAP framework.
---

A development director walks into the executive director's office holding a foundation grant agreement and asks a simple question: how much of last year's restricted grant money is still unspent, and which programs is it earmarked for? If the answer requires opening a spreadsheet someone built in 2022, calling the bookkeeper, or scrolling through QuickBooks reports that don't quite reconcile, the organization has a bookkeeping problem - not an accounting problem, not a software problem, a bookkeeping problem. The day-to-day recording of transactions has not been built to answer the question that funders, auditors, and the board will ask every month for the rest of the organization's life.

Nonprofit bookkeeping is fund accounting wearing the clothes of small-business bookkeeping. The mechanics look like QuickBooks; the underlying logic is a separate world. This guide walks through the structural difference, the chart of accounts decisions that determine whether reports will reconcile, the monthly close cadence that keeps grant reporting honest, and the handoff between bookkeeping and the higher-order accounting functions that produce audited financials and Form 990. The audience is development directors and executive directors who do not personally enter transactions but who depend on bookkeeping to run a credible development operation.

## What makes nonprofit bookkeeping different

A for-profit business records revenue when earned and expenses when incurred. The two combine into net income, and the chart of accounts can stop there. Nonprofit bookkeeping has a third dimension that for-profit systems do not: every transaction must be tagged to a fund or net asset class. Restricted revenue cannot mix with unrestricted revenue. A grant from the Walton Family Foundation restricted to youth literacy cannot pay for the executive director's salary, and the bookkeeping system must make that constraint visible at the moment of every transaction, not at the end of the year when someone tries to reconstruct it.

The Financial Accounting Standards Board governs nonprofit accounting through ASC 958, which requires that financial statements distinguish between net assets with donor restrictions and net assets without donor restrictions. That distinction has to be supportable from the underlying books - meaning every revenue transaction has to be tagged with whether it carries restrictions, and every expense transaction has to be tagged with which fund it draws against. A bookkeeping system that records "grant revenue $50,000" and stops there cannot produce ASC 958-compliant statements without manual reconstruction, which is where audit findings and grant reporting errors come from.

Federal grants add a second layer. Under 2 CFR 200 (the Uniform Guidance), grantees must maintain financial management systems that "permit the tracing of funds to a level of expenditures adequate to establish that such funds have been used according to the federal statutes, regulations, and the terms and conditions of the federal award" (2 CFR 200.302). That language is operational: each federal award requires its own fund or grant code, and every expense charged against it has to be traceable in the books. Bookkeeping that can't pass this test will fail the single audit at the first finding.

## The chart of accounts decision

Most nonprofit bookkeeping problems trace back to a chart of accounts that was designed for a different organization at a different size. A 501(c)(3) that started with a five-account chart inherited from a CPA's template and grew to twelve active restricted grants without restructuring the chart will hit a wall: the bookkeeper either creates dozens of duplicate expense accounts (one per grant, which destroys functional expense reporting) or runs everything through generic accounts (which destroys grant reporting). Neither works.

The clean structure separates two dimensions:

- **Account codes** - what the transaction was for. Salaries, rent, professional services, program supplies, indirect costs. These roll up into the functional expense categories required on Form 990 and the statement of functional expenses: Program, Management & General, Fundraising.
- **Fund codes** (or class codes in QuickBooks Online) - which fund the transaction belongs to. Unrestricted operating, Walton Foundation Youth Literacy 2026, HRSA Section 330 cycle 12, Board-Designated Reserve, etc.

Every transaction takes one account code and one fund code. The general ledger then supports two cuts: the functional expense view (what we spent the money on) and the fund balance view (which restricted obligations were drawn against). Reports that combine both - fund x function - are what grant reports and auditor schedules require. We cover the structural decisions in detail in [the nonprofit chart of accounts guide for restricted funds](/resources/guides/nonprofit-chart-of-accounts-restricted-funds).

### Common chart of accounts mistakes

The most expensive mistake is collapsing the two dimensions into one. A bookkeeper who creates an account called "Walton Foundation Salaries" instead of using the Salaries account with a Walton Foundation fund tag has destroyed the chart's ability to produce a clean functional expense report - every grant gets its own salary line, the chart balloons to hundreds of entries within two years, and Form 990 Part IX becomes a manual reconstruction project every fall. Use the fund/class dimension for the grant. Use the account dimension for the expense type. They are different questions; they need different fields.

## Cash vs. accrual: the choice that compounds

Cash basis bookkeeping records transactions when money moves. Accrual basis records them when the obligation is incurred - revenue when earned, expense when committed. For nonprofits, the choice has compliance consequences:

- **GAAP requires accrual.** Audited financials are accrual.
- **Federal grants require accrual.** 2 CFR 200 financial management standards assume accrual. A federal report that lists $400,000 in grant draws but only $300,000 in cash-basis expenses will not pass review.
- **Form 990 supports both** but requires consistency. Switching methods requires IRS notification.

The practical decision: any organization with revenue above $250,000, any organization with active federal grants, and any organization that anticipates an audit within two years should be on accrual from day one. The conversion from cash to accrual is painful enough that most CPAs charge a special engagement fee to do it. The deeper analysis lives in our [cash vs. accrual for grant accounting guide](/resources/guides/cash-vs-accrual-for-grant-accounting).

## The monthly close: what bookkeeping must produce

Bookkeeping isn't done when transactions are entered. It's done when the books are closed for the month and someone can pull a financial statement that ties to the bank reconciliation, the payroll register, and every grant draw. A working monthly close produces, by the 15th of the following month:

1. **Bank and credit card reconciliations** for every account, with all timing differences identified and explained.
2. **Statement of activities** (the nonprofit P&L) for the month and year-to-date, segmented by net asset class.
3. **Statement of financial position** (the nonprofit balance sheet) showing current cash, receivables, and net assets by class.
4. **Fund balance report** showing each restricted grant: amount awarded, amount drawn or recognized, amount expended, amount remaining, period of performance.
5. **Functional expense report** showing program/management/fundraising splits.
6. **Grant draw and reporting calendar** for the next 60 days.

If the close cannot produce items 4 and 5 from the books alone - without spreadsheets - the chart of accounts is mis-designed or the bookkeeping is incomplete. Most monthly close failures show up here: the books reconcile to the bank, but they cannot answer the restricted fund question, which is the only question that matters for development.

## The handoff to accounting

Bookkeeping ends and accounting begins around the monthly close. The bookkeeper records and reconciles. The accountant - internal controller, fractional CFO, or outside CPA - closes the books, reviews the trial balance, prepares the statement of cash flows, calculates accruals, manages the year-end audit prep, and prepares Form 990. In a small nonprofit, one person may do both. In an organization with multiple federal grants and a single audit, separating the roles is a control requirement.

The audit relationship is built on bookkeeping quality. An audit that begins with three weeks of cleanup before fieldwork can start signals that the bookkeeping was incomplete during the year - which costs hours, money, and trust with the audit committee. We walk through what the auditor expects to see in [the common single audit findings guide](/resources/guides/common-single-audit-findings) and how to build a clean audit trail in [the FASB ASC 958 nonprofit reporting guide](/resources/guides/fasb-asc-958-nonprofit-reporting).

## Internal controls a development director should expect

Even small nonprofits should enforce these controls. The development director is rarely the person doing bookkeeping, but is often the person who notices when controls are missing:

- **Segregation of duties.** The person who records cash should not be the person who reconciles the bank. The person who approves an invoice should not be the person who cuts the check.
- **Dual signature** on checks above a board-set threshold (typically $5,000-$10,000 for mid-sized nonprofits).
- **Monthly bank reconciliations reviewed by someone other than the preparer.**
- **Restricted fund balance reports** reviewed by the executive director and shared with the board finance committee monthly.
- **Documented gift acceptance policy** and consistent recording of restricted contributions per FASB ASC 958-605.

If the development director is hearing "the books are a mess" or "we'll figure it out at audit time," the issue is rarely the bookkeeper's skill - it's that the bookkeeping system was never structured for the fund complexity the organization now operates at. That is fixable, but it requires deliberate design, not heroics.

## When to upgrade your bookkeeping operation

Three signals indicate the bookkeeping has outgrown its current setup:

1. **Grant reports take more than four hours each.** If pulling spending against a single grant for a quarterly report requires combining QuickBooks reports with two spreadsheets and the bookkeeper's memory, the books cannot answer the question - which is a structural problem, not a labor problem.
2. **The audit produces management letter comments about fund tracking.** Auditors flag this when the books do not cleanly support the net asset roll-forward in the financial statements.
3. **The board cannot see restricted fund balances on a single page.** A working report shows every active grant with award, drawn, expended, and remaining, sortable by program officer and period of performance. If the board financials don't include this, the bookkeeping needs to be rebuilt to produce it - or layered with software that can.

GrantPipe was built to solve the third problem without forcing organizations to abandon QuickBooks. Bookkeeping continues in QuickBooks (or Xero, or Sage Intacct); the restricted fund layer, the grant calendar, the donor records, and the compliance reporting consolidate in one place. That is the design choice. Most mid-sized nonprofits do not need a new general ledger. They need their fund accounting to actually work.

## Where bookkeeping fits in the development operation

A development director who treats bookkeeping as someone else's problem will eventually get a board report with the wrong restricted fund balance, a foundation report that doesn't match the financials, or a grant proposal that cites incorrect prior-year program expense. The bookkeeping is the source of truth for every financial number the development office produces. Building a relationship with the bookkeeper, reviewing the monthly close output, and flagging chart of accounts problems early is part of the job - not finance's job, the development director's job.

Solid bookkeeping is what makes everything else possible: clean grant reports, defensible donor acknowledgments, audited financials that funders trust, a Form 990 that does not contradict the development pitch deck. Treat it as infrastructure. Inspect it regularly. And when it stops scaling, restructure it before the audit forces the issue.
