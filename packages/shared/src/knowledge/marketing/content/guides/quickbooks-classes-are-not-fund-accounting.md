---
title: "Why QuickBooks Classes Are Not Fund Accounting"
description: "QuickBooks classes are a cost-center tagging feature. Nonprofit fund accounting under FASB ASC 958 requires native restriction tracking"
seoTitle: "Why QuickBooks Classes Are Not Fund Accounting"
seoDescription: "Why QuickBooks classes are not fund accounting under FASB ASC 958, and where the technical gap matters for auditors. Includes practical checks, reporting."
targetKeyword: "quickbooks classes are not fund accounting"
publishedAt: "2026-04-18"
updatedAt: "2026-05-08"
lastReviewedAt: "2026-05-08"
verifiedAt: "2026-05-08"
buyerStage: "mofu"
targetPersona:
  - "finance-director"
  - "executive-director"
schema: "Article"
bluf: "QuickBooks classes are a cost-center allocation feature built for general-purpose accounting. FASB ASC 958 fund accounting requires tracking the restriction status of net assets, posting paired release-of-restriction journal entries when restrictions are satisfied, and generating two-column financial statements that auditors can verify against donor intent. QuickBooks classes cannot express any of those three things natively. The gap is not cosmetic - it creates audit exposure and requires ongoing manual workarounds that grow more fragile as the grant portfolio scales."
faqs:
  - q: "What is the difference between QuickBooks classes and fund accounting?"
    a: "QuickBooks classes are cost-center tags - they categorize transactions by program, department, or project for internal reporting. Fund accounting under FASB ASC 958 is a structural accounting practice that tracks the restriction status of net assets, requires specific journal entry patterns (including release-of-restriction entries), and drives the two-column financial statements auditors and funders expect. A class tag records where money was spent; fund accounting records whether the money was restricted, by whom, for what purpose, and whether that restriction has been satisfied. These are fundamentally different concepts."
  - q: "Can QuickBooks produce a Statement of Activities for nonprofits?"
    a: "QuickBooks can produce a profit-and-loss report that resembles a Statement of Activities, but it cannot produce a FASB ASC 958-compliant Statement of Activities natively. The FASB statement requires two columns - without-donor-restrictions and with-donor-restrictions - and a release-from-restriction row that moves amounts between columns when restrictions are satisfied. QuickBooks does not have a restriction status field on transactions, so it cannot generate those columns or that row without manual reformatting in a spreadsheet."
  - q: "When do QuickBooks classes become a liability for nonprofits?"
    a: "QuickBooks classes become a liability when auditors ask for restriction-level documentation. Auditors reviewing a nonprofit's books want to see the journal entries that track when restrictions were imposed and when they were released. A class tag on an income line does not document whether the income was restricted, who imposed the restriction, or whether the restriction has been satisfied. If your auditor reviews the nonprofit reporting package and asks how restrictions are tracked, a QuickBooks class report will not answer the question."
  - q: "What does a release-of-restriction entry look like?"
    a: "When a restricted fund is spent - say, a $5,000 grant for youth programming is used to pay a program coordinator - two journal entries are required: the expense entry (Dr Program Expense / Cr Cash) and a separate release-of-restriction entry (Dr Net Assets With Donor Restrictions - Released / Cr Net Assets Without Donor Restrictions - Released, same amount). The second entry is what moves the balance from the restricted column to the unrestricted column on the Statement of Activities. QuickBooks does not generate this entry automatically because it has no concept of donor restrictions - a class tag tells QuickBooks which program the expense belongs to, not that a restriction was satisfied."
  - q: "Is there a situation where QuickBooks classes are sufficient for a nonprofit?"
    a: "Yes. If a nonprofit's revenue is largely unrestricted, grant activity is minimal, and auditors are not asking for restriction-level documentation, QuickBooks classes may be a workable proxy. The issue arises when restricted funding is a material portion of total revenue, when multiple grants have overlapping purpose restrictions, or when the auditor's management letter starts citing restricted-fund tracking as a finding. At that point, the class workaround stops being sufficient."
answers:
  - q: "What is the difference between QuickBooks classes and fund accounting?"
    a: "QuickBooks classes are cost-center tags - they categorize transactions by program, department, or project for internal reporting. Fund accounting under FASB ASC 958 is a structural accounting practice that tracks the restriction status of net assets, requires specific journal entry patterns (including release-of-restriction entries), and drives the two-column financial statements auditors and funders expect. A class tag records where money was spent; fund accounting records whether the money was restricted, by whom, for what purpose, and whether that restriction has been satisfied. These are fundamentally different concepts."
  - q: "Can QuickBooks produce a Statement of Activities for nonprofits?"
    a: "QuickBooks can produce a profit-and-loss report that resembles a Statement of Activities, but it cannot produce a FASB ASC 958-compliant Statement of Activities natively. The FASB statement requires two columns - without-donor-restrictions and with-donor-restrictions - and a release-from-restriction row that moves amounts between columns when restrictions are satisfied. QuickBooks does not have a restriction status field on transactions, so it cannot generate those columns or that row without manual reformatting in a spreadsheet."
relatedPages:
  - "/compare/grantpipe-vs-quickbooks"
  - "/resources/guides/restricted-fund-accounting-basics"
  - "/resources/guides/fasb-asc-958-nonprofit-reporting"
  - "/books"
tags:
  - "guide"
  - "fund accounting"
  - "QuickBooks"
  - "FASB ASC 958"
  - "nonprofit accounting"
  - "restricted funds"
---

QuickBooks is the default accounting tool for small organizations in the U.S. Millions of businesses - including a large share of U.S. nonprofits - use it. For many of those nonprofits, the classes feature becomes the go-to mechanism for tracking restricted grants and funds. It is a reasonable workaround for a small, lightly audited organization. It stops being reasonable once restricted funding is a meaningful share of total revenue, or once an auditor starts looking carefully.

This guide explains what QuickBooks classes actually do, what FASB ASC 958 fund accounting actually requires, and where the gap between the two creates real problems.

## What QuickBooks Classes Actually Do

QuickBooks classes are a transaction-tagging feature. You create a class - "Youth Programs," "Federal Grant - Title IV," "General Operating" - and assign it to income and expense lines. At period end, you can run a Profit & Loss by Class report that breaks down revenue and expenses by those tags.

This is cost-center accounting. The class tells you where money was allocated, in the same way a department code in a general accounting system breaks out expenses by business unit. It is useful for internal management reporting, grant budget-vs-actual tracking, and program cost analysis.

What it does not do:

- Record the restriction status of a contribution (restricted vs. unrestricted)
- Track who imposed the restriction (donor vs. grantor vs. board)
- Post a release-of-restriction journal entry when restrictions are satisfied
- Generate the two-column financial statements FASB ASC 958 requires

These are not minor omissions. They are the structural requirements of nonprofit fund accounting.

## What FASB ASC 958 Actually Requires

FASB Accounting Standards Codification Topic 958 governs financial reporting for U.S. not-for-profit entities. ASU 2016-14, effective for fiscal years beginning after December 15, 2017, simplified the prior three-class system to two net asset classes:

- **Net assets with donor restrictions** - resources whose use is limited by donor-imposed conditions (purpose, time, or both)
- **Net assets without donor restrictions** - resources the board can direct to any organizational purpose

The distinction matters because it changes what the organization is allowed to spend. Net assets with donor restrictions cannot be used for general operations until the restriction is satisfied. Spending restricted funds outside their intended purpose is a compliance violation - one that funders, auditors, and in some cases state attorneys general take seriously.

FASB ASC 958 requires three financial statements:

1. **Statement of Financial Position (SFP)** - assets, liabilities, and net assets, with the two classes displayed separately
2. **Statement of Activities (SOA)** - revenue and expenses in two columns (without restrictions and with restrictions), plus a release-from-restriction row that moves amounts between columns
3. **Statement of Functional Expenses (SFE)** - expenses by functional class (Program, Management & General, Fundraising) - required for all nonprofits under ASU 2016-14

None of these can be produced directly from QuickBooks without manual reformatting, because QuickBooks does not have a restriction-status field on transactions or accounts.

## The Release-of-Restriction Problem

The most technically significant gap between QuickBooks classes and FASB fund accounting is the release-of-restriction journal entry.

Under FASB ASC 958, when a restricted fund is spent, two things happen at the accounting level:

1. The expense is recorded (Dr Program Expense / Cr Cash)
2. A release-of-restriction entry moves the corresponding amount out of the restricted net assets column and into the unrestricted column (Dr Net Assets With Donor Restrictions - Released / Cr Net Assets Without Donor Restrictions - Released)

The second entry is what makes the Statement of Activities accurate. Without it, the restricted column accumulates indefinitely. The SOA would show donations arriving into the restricted column but no outflows when the programs are actually delivered - misrepresenting the organization's financial position.

QuickBooks has no mechanism for this second entry. You can create a manual journal entry, but:

- It must be created manually every time a restricted fund is spent
- It is not linked to the original restriction or donation record
- It requires the bookkeeper to know which restriction was satisfied and by how much
- Any update to the expense record does not automatically update the release entry

This is not a workflow inconvenience. It is a structural accounting requirement that QuickBooks cannot express without ongoing manual intervention that is inherently error-prone at scale.

## The Audit Problem

Auditors reviewing nonprofit financial statements ask for restriction documentation. The specific questions are predictable:

- What donations or grants were recorded as restricted this period?
- What were the stated restrictions?
- When were those restrictions satisfied?
- What journal entries document the release?
- What is the remaining restricted balance for each fund?

A QuickBooks class report answers some of these questions indirectly - it can show how much was coded to a particular program. It cannot show whether the coding reflects a donor restriction or an internal allocation decision, whether a restriction has been fully satisfied, or whether the release entries are present and correct.

A management letter finding on restricted-fund tracking does not just create accounting work. It can raise questions with funders about financial stewardship, delay grant renewals, and in some states trigger regulatory attention.

## The Practical Problem at Scale

For a nonprofit managing one or two small restricted grants, the QuickBooks class workaround is manageable. A disciplined bookkeeper can maintain the class tags, post manual release entries, and produce a reformatted SOA in a spreadsheet for audit. It is extra work, but it is tractable.

The workload multiplies with the grant portfolio. Each new restricted fund requires:

- A new class (or multiple classes if the grant has sub-components)
- A separate tracking mechanism for the restriction terms and end dates
- Manual release entries for every expense coded to the fund
- Year-end reconciliation of the class balance against the grant budget

At five active grants with overlapping purpose and time restrictions, this system typically fails in one of two ways: either the bookkeeper maintains it correctly and audit prep takes weeks, or the class tags drift and the audit finds discrepancies.

## When QuickBooks Classes Are Fine, and When They Are Not

QuickBooks classes are adequate for a nonprofit when:

- Revenue is overwhelmingly unrestricted (operating grants, general contributions, earned income)
- Grant activity is minimal - one or two small grants with straightforward purpose restrictions
- The organization has a dedicated bookkeeper who maintains the class structure manually
- Audit scrutiny is limited or informal

QuickBooks classes become a liability when:

- Restricted grants are a material share of total revenue (generally, more than 20-30%)
- The grant portfolio includes multiple funders with different restriction terms and reporting cycles
- Auditors have cited restricted-fund tracking in prior management letters
- Staff - not a dedicated bookkeeper - are responsible for recording donations and expenses

## What Purpose-Built Nonprofit Fund Accounting Looks Like

True fund accounting tracks restriction status at the source. When a donation is recorded, the system knows it is restricted because the donor record says so - not because someone remembered to apply a class tag. When an expense is recorded against a restricted fund, the system posts the release-of-restriction entry automatically, because it knows which restriction the expense satisfies.

That is the architectural difference. The source record - the donation, the grant award - carries the restriction information. The accounting layer reads from that source and writes the correct journal entries without requiring the bookkeeper to manually replicate context the system already has.

GrantPipe Books is built on that architecture. Every donation and expense recorded in GrantPipe carries restriction and fund metadata. When accounting is enabled, the general ledger posts automatically - including release-of-restriction entries when expenses are applied to restricted funds. The Statement of Activities, Statement of Financial Position, and Statement of Functional Expenses generate from live GL data without manual reformatting.

GrantPipe includes native accounting. It does not connect to QuickBooks right now. GrantPipe keeps donor, grant, restricted fund, accounting, and compliance records in one place.

## The Practical Takeaway

If your nonprofit has active restricted grants and you are using QuickBooks classes as a fund-tracking proxy, the question is not whether the workaround can work - it can, with enough manual discipline. The question is whether the cost of maintaining it (staff time, audit risk, CPA hours reformatting reports) is worth it against a purpose-built alternative.

The answer depends on the complexity and value of your grant portfolio. For organizations where restricted funding drives mission delivery, the case for native fund accounting is straightforward.
