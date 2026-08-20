---
title: "Foundation Accounting: How Private Foundations Track Grants, Investments, and Distributions"
description: "Private foundation accounting is governed by IRC 4942, 4940, and the self-dealing rules - requirements that create accounting obligations general-purpose"
seoTitle: "Foundation Accounting: Grants, Investments, and Guide"
seoDescription: "How private foundation accounting differs from public charity accounting: the 5% minimum distribution, IRC 4940 excise tax, self-dealing rules, and software."
targetKeyword: "foundation accounting basics"
publishedAt: "2026-04-28"
updatedAt: "2026-04-28"
lastReviewedAt: "2026-04-28"
buyerStage: "tofu"
targetPersona:
  - "finance-operations-staff"
  - "executive-director"
schema: "Article"
bluf: "Private foundation accounting is governed by a different regulatory framework than public charities - the 5% minimum distribution requirement under IRC 4942, the 1.39% excise tax on net investment income under IRC 4940, and the self-dealing rules under IRC 4941 create accounting obligations that general-purpose nonprofit software handles poorly. Every private foundation must file Form 990-PF regardless of size, with no revenue threshold exemption."
faqs:
  - q: "What is the 5% distribution requirement for private foundations?"
    a: "Under IRC 4942, private foundations must distribute at least 5% of the average fair market value of their investment assets each year for charitable purposes. This is the minimum distribution requirement, sometimes called the qualifying distribution requirement. The calculation uses a 12-month average of investment asset values (typically the monthly average at each month-end during the fiscal year). Failure to meet the requirement results in a 30% excise tax on the undistributed amount in the first year, increasing to 100% if not corrected."
  - q: "What is the excise tax on private foundation investment income?"
    a: "Under IRC 4940, private foundations pay an excise tax on net investment income. The rate was unified at 1.39% by the Taxpayer Certainty and Disaster Tax Relief Act of 2019 (effective for tax years beginning after December 20, 2019), eliminating the previous two-rate structure (1% vs. 2%). Net investment income includes interest, dividends, rents, royalties, and net capital gains. Investment expenses directly related to the income are deductible in calculating the net investment income base."
  - q: "What is Form 990-PF and who must file it?"
    a: "Form 990-PF is the annual information return for private foundations. All private foundations must file regardless of gross receipts or total assets - there is no size exemption, unlike the Form 990 series for public charities (which has Form 990-N for very small organizations). Form 990-PF is filed annually, generally due by the 15th day of the 5th month after the fiscal year ends (May 15 for calendar-year foundations). The return reports financial activities, qualifying distributions, investment income, excise tax calculations, grant distributions, and officer/director compensation."
answers:
  - question: "How is private foundation accounting different from public charity accounting?"
    answer: "Private foundations face three accounting and compliance obligations that public charities do not: (1) the 5% minimum distribution requirement under IRC 4942, which requires tracking investment asset values and qualifying distributions separately from operating expenses; (2) the excise tax on net investment income under IRC 4940, which requires tracking investment income, investment expenses, and capital gains on a separate schedule; and (3) Form 990-PF filing regardless of size, with no exemption for small foundations. Public charities use Form 990, which has a size-based filing structure (990-N, 990-EZ, or full 990)."
relatedPages:
  - "/resources/guides/form-990-pf-private-foundations-guide"
  - "/glossary/fund-accounting"
  - "/resources/guides/restricted-fund-accounting-basics"
tags:
  - "guide"
  - "foundation accounting"
  - "private foundations"
  - "Form 990-PF"
definitions:
  - term: Qualifying distribution
    definition: Under IRC 4942, amounts paid by a private foundation to accomplish charitable purposes - primarily grants to public charities and operating expenses for charitable programs. Qualifying distributions count toward the 5% minimum distribution requirement. Investment in program-related investments (PRIs) also counts. Administrative expenses may qualify if directly related to charitable activities.
  - term: Net investment income
    definition: For private foundation excise tax purposes under IRC 4940, gross investment income (interest, dividends, rents, royalties) plus net capital gains from investment asset dispositions, less investment expenses. Taxed at 1.39% under the rate unified by the 2019 tax legislation.
  - term: Self-dealing
    definition: Under IRC 4941, any direct or indirect financial transaction between a private foundation and a disqualified person (substantial contributor, foundation manager, 20% owners of businesses that are substantial contributors, or family members of these persons). Self-dealing transactions are generally prohibited regardless of whether they benefit the foundation. Excise taxes of 10% of the amount involved (on the disqualified person) plus 5% (on any foundation manager who participated) apply per year until the transaction is corrected.
---

The IRS requires Form 990-PF from every private foundation - a $50,000 family foundation and a $5 billion institutional foundation file the same form. There is no 990-N equivalent for small private foundations, no gross receipts threshold below which the filing obligation disappears. This universally applicable filing requirement reflects the higher regulatory scrutiny that private foundations face relative to public charities - scrutiny encoded in IRC Sections 4940 through 4945 and operationalized through accounting requirements that most general-purpose nonprofit software was not designed to handle.

### How Private Foundation Accounting Differs from Public Charity Accounting

The fundamental difference is the investment-first business model. Public charities primarily receive revenue through donations, grants, and program fees, then deploy it for charitable purposes. Private foundations primarily hold an investment portfolio and deploy investment returns for charitable purposes. This inversion creates accounting obligations with no public charity equivalent.

Public charity accounting under FASB ASC 958 focuses on restricted fund management, functional expense allocation, and net asset classification. These obligations exist for private foundations too, but they sit on top of a second layer of regulatory accounting driven by the Internal Revenue Code: investment asset valuation, minimum distribution calculations, excise tax computation, and self-dealing compliance documentation.

The Form 990-PF is 13 pages plus schedules. Part I presents revenue and expenses on a dual-column basis: book (GAAP) and tax (IRC). Part II is the balance sheet. Part VIII, Column (b) presents the investment income schedule for IRC 4940 purposes. Part XI is the distributable amount calculation under IRC 4942. Part XII is the qualifying distribution record. These schedules require simultaneous GAAP and tax-basis accounting with precision that many accounting systems do not support natively.

### The 5% Distribution Requirement and How It Is Calculated

IRC 4942 requires private foundations to distribute an amount equal to at least 5% of the average fair market value of their investment assets each year as qualifying distributions.

The calculation proceeds in three steps.

Step 1: Calculate the average fair market value of investment assets for the year. For most foundations, this means averaging the end-of-month fair market values across 12 months (or 13 values for a 12-month period starting with the prior year-end). Cash held for investment counts; program-related assets and assets used for exempt purposes are excluded.

Step 2: Apply the 5% rate to the average to determine the distributable amount. The distributable amount may be reduced by the IRC 4940 excise tax liability for the year.

Step 3: Count qualifying distributions for the year. Grants to public charities with 501(c)(3) status qualify. Operating expenses directly related to charitable programs qualify. Amounts paid to acquire program-related investments qualify. Administrative expenses for investment management do not qualify.

If qualifying distributions fall short of the distributable amount, the shortfall is subject to a 30% excise tax under IRC 4942(a) in the first year. If the deficiency is not corrected by the end of the correction period (typically the following year), the tax increases to 100% under IRC 4942(b). The correction period and the carry-forward provisions for excess distributions in prior years create a planning complexity that requires careful accounting throughout the year - not a year-end calculation.

### Investment Accounting: Endowment vs. Operating Portfolio

Private foundations typically maintain two distinct investment pools: an endowment or investment portfolio held to generate long-term returns, and operating accounts held for near-term grant disbursements and administrative expenses.

The investment portfolio must be tracked at fair market value because the 5% minimum distribution calculation depends on average fair market value of investment assets. This means monthly valuation of the portfolio - not just annual valuation at fiscal year-end - to support the IRC 4942 calculation. Your custodian's monthly statements are the primary source for this data, but the accounting system must receive and record these values systematically.

FASB ASC 958-320 governs investment accounting for nonprofits, requiring that debt and equity securities with readily determinable fair values be carried at fair value with unrealized gains and losses recognized in the Statement of Activities. For private foundations, unrealized gains are also included in the net investment income calculation for IRC 4940 purposes, which means the same valuation data feeds both GAAP financial statements and the tax-basis excise tax computation.

The distinction between the endowment portfolio and program-related investments (PRIs) matters for both accounting and compliance. PRIs - investments made primarily to accomplish charitable purposes rather than to generate financial return - are excluded from the investment assets subject to the 5% minimum distribution calculation and are treated as qualifying distributions in the year made. Misclassifying a below-market-rate loan to a nonprofit as a PRI when it does not meet the IRC 4944 definition creates both a compliance failure and an accounting misstatement.

### Excise Tax on Net Investment Income: Form 990-PF Schedule B

The IRC 4940 excise tax on net investment income is calculated on Form 990-PF, Part VIII (Analysis of Income-Producing Activities) in conjunction with the income and expense schedules. The unified 1.39% rate, effective for tax years beginning after December 20, 2019, applies to all private foundations - eliminating the prior structure where foundations that made sufficient distributions could qualify for the 1% rate.

Net investment income includes: interest on bonds and other fixed-income investments, dividends on equity investments, rental income from investment properties, royalties from investment assets, and net capital gains from dispositions of investment assets. Investment expenses directly allocable to the production of this income reduce the base.

Capital gains accounting for private foundations follows a special rule under IRC 4940(c)(4): gains from investment asset dispositions are included in net investment income, but losses from investment asset dispositions cannot offset gains (no net loss offset). This differs from both individual tax treatment and GAAP treatment, requiring a separate tracking mechanism for the tax-basis excise tax calculation.

The quarterly estimated excise tax payments follow the same schedule as corporate estimated taxes under IRC 6655 - due on the 15th day of the 4th, 6th, 9th, and 12th months of the fiscal year. Private foundations that underpay estimated excise taxes face penalties, which means the net investment income calculation must be current at each estimated payment date, not just at year-end.

### Grant Disbursement Tracking and Grantee Compliance Responsibility

Private foundations that make grants to organizations bear due diligence obligations under IRC 4945 for certain grant types. Grants to organizations that are not Section 501(c)(3) public charities - including foreign organizations, government units, and certain individual recipients - require either expenditure responsibility (ongoing monitoring of grant use) or a good faith determination that the grantee is the equivalent of a U.S. public charity.

Expenditure responsibility requires: a written grant agreement specifying the charitable purpose, a requirement that the grantee report on grant use, maintenance of records of the grantee's reports, and reporting of the grant on Form 990-PF Part IV-A. Foundations that fail to exercise expenditure responsibility where required face a 10% excise tax on the grant amount under IRC 4945(a).

Grant disbursement tracking for foundation accounting purposes requires more than a payment record. It requires: the grant award letter or grant agreement, documentation of the grantee's public charity status (or the equivalency determination for foreign grantees), any required mid-grant or final reports received from the grantee, and evidence that the grant was used for the stated charitable purpose. This documentation is required for Form 990-PF reporting and for the foundation's own governance records.

### IRS Self-Dealing Rules and Financial Documentation Requirements

IRC 4941 prohibits self-dealing transactions between a private foundation and disqualified persons - a category that includes substantial contributors, foundation managers, 20% owners of organizations that are substantial contributors, and family members of any of these persons.

Self-dealing transactions subject to excise tax include: sales or exchanges of property, leases, loans, extensions of credit, furnishing goods or services, payment of compensation (except reasonable compensation for actual services), and transfer to a disqualified person of any foundation income or assets. The "except reasonable compensation" carve-out means that paying a board member's family member as a program officer is not automatically self-dealing - but it requires careful documentation of reasonable compensation for actual services rendered.

The self-dealing rules require financial record-keeping that many general-purpose accounting systems do not support: identifying disqualified persons in the vendor and payee database, flagging transactions for review when a payee is a disqualified person or related entity, and maintaining contemporaneous documentation of arm's-length basis for any transactions that could be scrutinized.

### Software Requirements for Private Foundations

Private foundation accounting software must support four capabilities that are either minimal or absent in public charity software: dual-column book-and-tax reporting for Form 990-PF, investment portfolio valuation tracking with monthly history for the IRC 4942 calculation, a grant management module with expenditure responsibility tracking, and disqualified person flagging for self-dealing compliance.

Most mid-market nonprofit accounting platforms support the GAAP side of foundation accounting but require significant manual work to support the tax-basis calculations required for Form 990-PF. Organizations that use general-purpose software often maintain a separate spreadsheet model for the 990-PF excise tax and minimum distribution calculations - a manual process that is both time-intensive and error-prone.

Purpose-built foundation accounting solutions - or nonprofit platforms with foundation-specific modules - close this gap by automating the investment asset valuation history, the distributable amount calculation, and the qualifying distribution ledger. The annual time savings typically justify the software cost within one to two fiscal years for foundations with investment portfolios above $5 million.

For a guide to Form 990-PF preparation, see [Form 990-PF for Private Foundations](/resources/guides/form-990-pf-private-foundations-guide). For a foundational glossary definition of fund accounting concepts, see [Fund Accounting](/glossary/fund-accounting). For the public charity equivalent of restricted fund accounting, see [Restricted Fund Accounting Basics](/resources/guides/restricted-fund-accounting-basics).
