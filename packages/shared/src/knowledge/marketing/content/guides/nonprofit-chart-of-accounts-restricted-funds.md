---
title: "Nonprofit Chart of Accounts for Restricted Funds"
description: "Design a chart of accounts that cleanly tracks restricted vs unrestricted net assets, with segment-dimension examples for QuickBooks and Sage Intacct."
seoTitle: "Nonprofit Chart of Accounts for Restricted Funds 2026"
seoDescription: "How to design a nonprofit chart of accounts that tracks restricted funds correctly: segment structure, dimension approach, QuickBooks class limitations."
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: "tofu"
contentIntent: "workflow"
topicCluster: "restricted-fund-accounting"
primaryCta: "lead-magnet"
refreshCadenceMonths: 12
targetKeyword: "nonprofit chart of accounts restricted funds"
leadMagnetSlug: "grant-compliance-checklist"
targetPersona:
  - "executive-director"
  - "finance-operations-staff"
schema: "Article"
bluf: "Most nonprofits track restricted funds by multiplying account numbers - creating a separate expense account for each grant. This approach produces an unmanageable chart of accounts, makes cross-grant reporting impossible, and fails as the portfolio grows. The correct architecture uses a segment or dimension to carry restriction and fund identity separately from the natural account. Whether the system is QuickBooks, Sage Intacct, or a specialized nonprofit accounting platform, the principle is the same: nature of expense in the account, identity of fund in the segment."
faqs:
  - q: "What is a segment or dimension in nonprofit accounting?"
    a: "A segment (in Sage Intacct) or dimension (in many systems) is a data field attached to every transaction that carries additional classification information beyond the natural account number. For example, a salary expense might be coded to account 6100 (Salaries) plus dimension: Grant-2024-HUD-CoC. The account captures what the cost is; the dimension captures which fund it belongs to. This separates restriction identity from expense nature."
  - q: "Why is multiplying account numbers the wrong approach for restricted funds?"
    a: "When organizations create a separate account for each grant (e.g., 6101 Salaries-Grant A, 6102 Salaries-Grant B), the chart of accounts grows with each new award and must be maintained perpetually. Cross-grant reporting requires summing multiple accounts manually. Budget vs actual reports are difficult to produce. The structure also makes FASB ASC 958 functional expense reporting harder because the split between nature and function is embedded in account numbers rather than tracked as separate attributes."
  - q: "How should restricted and unrestricted net assets appear in the chart of accounts?"
    a: "Under FASB ASC 958, the balance sheet shows two net asset classes: with donor restrictions and without donor restrictions. The chart of accounts should have distinct net asset accounts for each class. A typical structure: 3100 Net assets without donor restrictions; 3200 Net assets with donor restrictions; 3210 (sub-account) Temporarily restricted - purpose; 3220 (sub-account) Temporarily restricted - time; 3230 (sub-account) Permanently restricted. Sub-accounts map to specific fund categories, not individual grants."
  - q: "Can QuickBooks classes be used for restricted fund tracking?"
    a: "QuickBooks classes can segment transactions by fund, grant, or program - but they are not true fund accounting and have significant limitations. Classes do not enforce balance sheet segmentation by fund; they cannot produce fund-level statements of activities; and the class structure is flat (no hierarchy). QuickBooks classes work for basic program expense allocation but fail for organizations with more than 5-6 active grants or with complex restriction types. See our guide on why QuickBooks classes are not fund accounting."
  - q: "What is a fund in nonprofit accounting?"
    a: "A fund is a self-balancing set of accounts used to account for resources designated for specific purposes or from specific sources. In formal fund accounting systems, each fund has its own assets, liabilities, and net assets. For most mid-sized nonprofits tracking donor-restricted grants, a fund corresponds to a single grant award or a category of restriction - though not every accounting system supports true fund accounting at the GL level."
  - q: "What does a grant-ready chart of accounts look like?"
    a: "A grant-ready COA uses: a four-digit natural account range organized by statement (1000s for assets, 2000s for liabilities, 3000s for net assets, 4000s for revenue, 5000s-6000s for expenses); a separate dimension or segment for fund/grant identity; a separate dimension for program or functional classification; and a separate dimension for department or location if needed. The result is that a single salary transaction can carry nature (6100), fund (CoC-2024), program (Housing), and department (Case Management) as independent searchable attributes."
relatedPages:
  - "/resources/guides/restricted-fund-accounting-basics"
  - "/resources/guides/quickbooks-classes-are-not-fund-accounting"
  - "/resources/guides/fasb-asc-958-nonprofit-reporting"
  - "/resources/guides/restricted-fund-tracking-for-nonprofits"
  - "/resources/guides/donor-restricted-vs-board-designated-funds"
sourceUrls:
  - "https://asc.fasb.org"
  - "https://www.aicpa-cima.com/resources/download/not-for-profit-entities-aicpa-audit-guide"
  - "https://quickbooks.intuit.com/learn-support/en-us/chart-of-accounts/nonprofit-chart-of-accounts/00/185412"
  - "https://www.sageintacct.com/nonprofit-accounting-software"
statistics:
  - stat: "FASB ASC 958-210-45-1 requires nonprofits to display total assets, total liabilities, and total net assets on the statement of financial position, with net assets shown in two classes: with and without donor restrictions"
    source: "FASB Accounting Standards Codification 958-210, Not-for-Profit Entities - Balance Sheet"
    sourceUrl: "https://asc.fasb.org"
  - stat: "The FASB ASU 2016-14 standard, effective for fiscal years beginning after December 15, 2017, reduced net asset classes from three (unrestricted, temporarily restricted, permanently restricted) to two (without and with donor restrictions)"
    source: "FASB Accounting Standards Update No. 2016-14, Presentation of Financial Statements of Not-for-Profit Entities"
    sourceUrl: "https://asc.fasb.org"
  - stat: "Sage Intacct's dimension-based architecture for nonprofits allows organizations to track fund, grant, department, location, and project as independent dimensions without multiplying chart of accounts entries"
    source: "Sage Intacct Not-for-Profit Edition product documentation"
    sourceUrl: "https://www.sageintacct.com/nonprofit-accounting-software"
tags:
  - "chart-of-accounts"
  - "restricted-funds"
  - "nonprofit-accounting"
  - "fund-accounting"
  - "fasb-asc-958"
definitions:
  - term: "Natural account"
    definition: "The base account code that describes the economic nature of a transaction - for example, salaries, rent, supplies. The natural account answers 'what kind of cost is this?'"
  - term: "Segment (dimension)"
    definition: "A separate data field attached to transactions that carries classification information beyond the natural account. Common segments in nonprofit accounting include fund, grant, program, department, and location. Segments answer 'which fund does this belong to?' and 'which program does this serve?'"
  - term: "Fund accounting"
    definition: "An accounting approach where resources are segregated into self-balancing sets of accounts (funds), each with its own assets, liabilities, and equity/net assets. Used by governments and some nonprofits. Mid-sized nonprofits more commonly use segment tracking rather than true fund-level balance sheet segmentation."
  - term: "Net assets"
    definition: "The nonprofit equivalent of equity: total assets minus total liabilities. Under FASB ASC 958, presented in two classes - with and without donor restrictions - on the statement of financial position."
  - term: "Class tracking"
    definition: "QuickBooks' mechanism for segmenting transactions. Classes are single-level labels attached to transaction lines. Useful for basic program allocation; insufficient for multi-grant restricted fund tracking."
answers:
  - q: "How many expense accounts should a nonprofit have in its COA?"
    a: "A well-designed nonprofit COA typically has 40-80 natural expense accounts organized by type: personnel (salaries by category, benefits, payroll taxes), occupancy, professional services, supplies, travel, depreciation, and other. Organizations with more than 80-100 expense accounts usually have fund identity embedded in account numbers - which is the problem, not the solution. The fund identity should be in a segment, not in the account number."
  - q: "What is the difference between a program and a fund?"
    a: "A program is a functional activity of the organization - youth services, housing, job training. A fund represents a source of restricted resources - the HUD CoC grant, the XYZ Foundation grant, the board-designated reserve. The same program can be funded by multiple funds; the same fund can support multiple programs. Both should be tracked as independent dimensions so reporting can cut across either axis."
  - q: "How should a nonprofit handle a grant that funds multiple programs?"
    a: "When a single grant funds activities across multiple programs, each expense transaction should carry both the grant identifier (fund dimension) and the program identifier (program dimension). The fund dimension aggregates all costs for the grant; the program dimension aggregates all costs for the program. Neither dimension is sufficient alone. Most organizations that lack this dual tracking end up doing manual cost allocation in spreadsheets at reporting time."
tableData:
  name: "COA Structure Comparison: Multiplied Accounts vs Dimension Approach"
  columns: ["Scenario", "Multiplied account approach", "Dimension approach"]
  rows:
    - [
        "Salary expense on HUD CoC grant",
        "Account: 6102-Salaries-CoC",
        "Account: 6100-Salaries | Fund: CoC-2024 | Program: Housing",
      ]
    - [
        "Same salary on HHS ACF grant",
        "Account: 6103-Salaries-ACF",
        "Account: 6100-Salaries | Fund: ACF-2024 | Program: Family Services",
      ]
    - [
        "Report: Total salaries across all grants",
        "Must sum 6102+6103+others manually",
        "Filter Account=6100, all funds",
      ]
    - [
        "Report: All costs for CoC grant",
        "Must identify all CoC accounts (6102, 7102, 8102...)",
        "Filter Fund=CoC-2024, all accounts",
      ]
    - [
        "Add new grant next year",
        "Add new accounts for each expense type",
        "Add new fund dimension value only",
      ]
    - [
        "FASB functional expense report",
        "Must manually allocate multiplied accounts to functions",
        "Dimension cross-tab: Account - Program",
      ]
---

## BLUF

The fundamental design choice in a nonprofit chart of accounts is whether fund identity lives in the account number or in a separate dimension. When fund identity is in the account number, the COA expands with every new grant and cross-fund reporting requires manual aggregation. When fund identity is in a dimension, the natural account captures what the cost is and the dimension captures which fund it belongs to. The dimension approach scales, produces cleaner reports, and supports FASB ASC 958 presentation without restructuring accounts.

## TL;DR

- Wrong approach: separate account number per grant per expense type
- Right approach: natural account for expense type + dimension/segment for fund identity
- FASB ASC 958 requires: two net asset classes on the balance sheet (with and without donor restrictions)
- QuickBooks: classes help but are not true fund accounting
- Sage Intacct: dimension architecture is designed for this; configure funds, grants, programs as separate dimensions

## The core design problem

A nonprofit receives a HUD CoC grant and an HHS ACF grant in the same year. Both fund salaries. The organization needs to:

- Track salary costs separately for each grant
- Produce total salary costs across all programs for the functional expense report
- Show the restricted fund balance for each grant on the balance sheet
- Release restrictions as qualifying costs are incurred

The multiplied-account approach creates accounts like 6101-Salaries-CoC and 6102-Salaries-ACF. This works for two grants. By year five, with 15-20 active or recently closed grants, the COA has hundreds of accounts, reports are unusable without significant manual manipulation, and adding a new grant requires adding 15-20 new accounts.

The dimension approach keeps account 6100-Salaries as the single account for all salary expense. The CoC grant identity is carried in a fund dimension. Reports run against Account=6100 show total salaries. Reports run against Fund=CoC-2024 show all costs for that grant. No account proliferation.

## Net asset accounts: FASB ASC 958 structure

Under ASU 2016-14, effective for fiscal years beginning after December 15, 2017, the balance sheet shows two net asset classes:

**Net assets without donor restrictions** - previously called "unrestricted." Includes board-designated reserves.

**Net assets with donor restrictions** - previously called temporarily restricted and permanently restricted combined. Includes purpose-restricted grants, time-restricted pledges, and permanently restricted endowments.

A minimal compliant net asset structure in the COA:

| Account | Description                           |
| ------- | ------------------------------------- |
| 3100    | Net assets without donor restrictions |
| 3110    | Board-designated - [reserve name]     |
| 3200    | Net assets with donor restrictions    |
| 3210    | Donor-restricted - purpose            |
| 3220    | Donor-restricted - time               |
| 3230    | Permanently restricted - endowment    |

Organizations do not need a separate net asset account for each grant. The grant-level balance is tracked in the fund dimension, with the balance rolling into the 3200 class account.

## Revenue account structure for grants

Grants appear in the revenue section of the COA. A clean structure:

| Account | Description                              |
| ------- | ---------------------------------------- |
| 4100    | Contributions without donor restrictions |
| 4200    | Contributions with donor restrictions    |
| 4300    | Government grants - federal              |
| 4310    | Government grants - state/local          |
| 4400    | Net assets released from restrictions    |

The 4400 account records the offset to the net asset release journal entries. It shows on the statement of activities as a transfer between restriction classes.

Grant revenue hits 4300 or 4200 depending on whether it is a government contract or a private foundation grant. Federal grants that are exchange transactions (fee-for-service) may be classified differently under ASC 606. Fund dimension carries the specific grant identity in either case.

## QuickBooks: what classes can and cannot do

QuickBooks class tracking assigns a class label to transaction lines. For basic program-vs-admin allocation, classes work. For multi-grant restricted fund tracking, classes have structural limitations:

- Classes are flat - no parent-child hierarchy
- Class reports show expenses by class but cannot produce a fund-level balance sheet or statement of financial position by fund
- Classes cannot enforce double-entry by fund (debits and credits stay at the transaction level, not balanced by class)
- Class-based restricted fund reporting requires manual adjustments at period end

Organizations managing 3-5 grants with simple restrictions can operate with QuickBooks classes if they supplement with grant spreadsheets. Organizations with more complex portfolios need a system with true dimension or fund architecture.

## Sage Intacct: the dimension approach in practice

Sage Intacct is the most widely used accounting system for mid-sized nonprofits with complex grant portfolios. Its dimension architecture allows independent tracking of:

- **Fund** - the specific grant or restriction source (CoC-2024, ACF-2023, Foundation-XYZ)
- **Grant** - can duplicate Fund or add a layer for sub-grants
- **Program** - the functional program activity (Housing, Family Services, Youth)
- **Department** - the organizational unit (Case Management, Finance, Administration)
- **Location** - if the organization operates across multiple sites

Each transaction carries all applicable dimensions. Reports run against any dimension independently. A functional expense report by program uses the Program dimension; a grant budget-vs-actual uses the Grant or Fund dimension. Neither requires a separate COA restructuring.

At period end, restricted fund balances appear at the fund dimension level. Net asset release entries reduce the fund balance and increase the unrestricted fund balance - captured by the dimension, not by separate accounts.

## Segment structure for organizations without Sage Intacct

Organizations using accounting systems without native dimension support (older versions of Intacct, Blackbaud Financial Edge, church management systems) can approximate the dimension approach by:

- Using a multi-segment account format: 6100-2024-CoC where the first segment is the natural account and subsequent segments are fund and program
- Enforcing consistent segment population at transaction entry
- Building reports that aggregate and filter by segment

This approach is less clean than native dimensions but avoids uncontrolled account proliferation. The segment separator must be consistent and the segment values must be maintained in a reference table.

## How GrantPipe helps

GrantPipe tracks grant-level financial activity - drawdowns, expenditures, net asset releases - in parallel with the general ledger, using the grant as the organizing entity. For organizations where the accounting system's dimension structure is not yet clean, GrantPipe provides grant-level reporting that supplements the GL without requiring a COA redesign. Grant budget vs actual, restriction balance, and compliance status are visible per award. Start with a [free trial](/signup) to see grant-level financial reporting alongside your compliance calendar.
