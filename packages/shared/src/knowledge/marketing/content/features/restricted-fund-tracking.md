---
title: Restricted Fund Tracking for Nonprofits
entitlement: hasRestrictionLifecycle
description: "Restriction terms, balances, releases, evidence links, and restricted rollforwards built into the donor and grant system."
seoTitle: Restricted Fund Tracking Software for Nonprofits
seoDescription: "Track restriction terms, additions, releases, evidence, alerts, and restricted rollforwards without parallel spreadsheets."
targetKeyword: restricted fund tracking
publishedAt: "2026-04-24"
updatedAt: "2026-04-24"
lastReviewedAt: "2026-04-24"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: restricted-fund-accounting
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: nonprofit-crm-evaluation-scorecard
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - restricted-funds
  - fund-accounting
bluf: "Restricted fund tracking in GrantPipe connects the fund, grant, donor restriction, release record, and supporting evidence. Growth teams can manage terms, additions, releases, alerts, and restricted rollforwards. Audit-Ready teams can add evidence package output for auditor review."
faqs:
  - q: Do you track temporarily restricted net assets under FASB ASC 958?
    a: Yes. Growth includes structured restriction terms and manual release records. Audit-Ready adds evidence package output for auditor review.
  - q: Can we track multiple grants from the same funder separately?
    a: "Yes. Each grant is its own fund with its own restrictions, start and end dates, reporting schedule, and allocation rules. A single funder can have any number of open grants without ledger commingling."
  - q: How does the spend-down report handle shared expenses?
    a: "The first release is manual-control-first. You record the release against a term, link supporting documents or generated reports, and use alerts to catch missing evidence."
  - q: What happens if we overspend a restriction?
    a: "The API rejects a release that would take the restricted balance below zero, and alerts show restriction risk that still needs review."
  - q: Does this replace our accounting system?
    a: "GrantPipe keeps the restriction detail tied to funds, grants, documents, generated reports, and activity history. It is not legal or accounting advice, and it does not replace CPA judgment."
relatedPages:
  - /resources/guides/nonprofit-crm-pricing-guide
  - /free/grant-compliance-checklist
  - /free/nonprofit-crm-evaluation-scorecard
  - /for/board-treasurers
  - /for/finance-operations-staff
  - /resources/guides/grant-compliance-101-for-nonprofits
  - /product
  - /pricing
  - /features/role-based-permissions
  - /features/soft-credit-tracking
proscons:
  - subject: GrantPipe restricted fund tracking
    pros:
      - Per-grant ledger tied to the donor or funder record
      - Restriction releases are recorded from the grant or fund workspace with supporting evidence
      - Spend-down report runs on live data so the board number matches the funder number
      - Over-obligation guard blocks accidental overspend before it closes
    cons:
      - Requires allocation rules to be defined per expense category at setup
      - Does not replace a general ledger; pairs with QuickBooks or Sage Intacct
      - Legacy spreadsheet allocations need to be re-entered during migration
answers:
  - q: Why does restricted fund tracking matter for a $2M nonprofit?
    a: "At $2M in revenue with three to five restricted grants, the reconciliation burden is roughly 20 hours a month in spreadsheets and a recurring source of audit findings. A system of record for restrictions removes both."
  - q: What is a net asset release?
    a: "Under FASB ASC 958-205, funds held with donor restrictions are released to without-restriction status when the purpose or time condition is satisfied. In GrantPipe, teams record the release against the related restriction term and attach evidence for review."
  - q: Can we pull a funder-specific spend-down report?
    a: "Yes. Reports can filter to a single grant, a funder, a date range, or a program. Restricted rollforwards export as CSV, with related evidence links available for auditor review."
  - q: How is this different from fund accounting in QuickBooks?
    a: "QuickBooks classes can tag transactions, but do not enforce restrictions or generate ASC 958 releases. GrantPipe holds the restriction model; QuickBooks holds the debits and credits."
pricingStats:
  - stat: FASB ASC 958-205 requires nonprofits to classify net assets as with or without donor restrictions and present the composition of each class on the statement of financial position
    source: FASB Accounting Standards Codification 958-205
    sourceUrl: "https://asc.fasb.org/958"
  - stat: "GAO identified approximately 17 percent of federal spending in fiscal year 2023 as tied to programs flagged with audit findings, many of which trace to weak subrecipient compliance controls"
    source: U.S. GAO 2024 Annual Report on Federal Spending
    sourceUrl: "https://www.gao.gov/assets/gao-24-106608.pdf"
  - stat: Nonprofits with $500K-$10M budgets spend an average of 3.5 percent of operating budget on software per Nonprofit Tech for Good's 2024 report
    source: Nonprofit Tech for Good 2024 Technology Report
    sourceUrl: "https://www.nptechforgood.com/research-reports/"
tableData:
  name: Restricted fund tracking capability comparison
  description: How GrantPipe models restrictions compared to spreadsheet and generalist CRM approaches.
  columns:
    - Capability
    - Spreadsheet
    - Generalist CRM
    - GrantPipe
  rows:
    - - Per-grant ledger
      - Manual tab per grant
      - Not supported
      - Native
    - - FASB ASC 958 net asset release
      - Manual journal entry
      - Not supported
      - Manual release workflow
    - - Over-obligation block
      - "No"
      - "No"
      - "Yes"
    - - Audit evidence pull
      - Rebuild from tabs
      - Custom report build
      - Evidence-linked export
    - - Live board-ready balance
      - Stale
      - Partial
      - Live
sourceUrls:
  - "https://asc.fasb.org/958"
  - "https://www.gao.gov/assets/gao-24-106608.pdf"
  - "https://www.nptechforgood.com/research-reports/"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
  - "https://www.fasb.org/page/PageContent?pageId=/projects/recentlycompleted/not-for-profit-financial-statements.html"
---

## The problem

Restricted funds become fragile when the donor restriction, grant award, spending plan, and balance report live in separate places. Staff can spend the money correctly and still struggle to prove it later.

## How GrantPipe solves it

GrantPipe keeps restrictions, grant allocations, spending, balances, and reports connected. The fund view shows both the current posture and the record behind it.

For teams that ask about a chart of accounts, this page is the restriction layer behind that accounting structure. GrantPipe does not try to become the general ledger; it keeps grant, fund, release, and evidence context organized so finance can map restricted activity back to the accounts it already closes.

Restricted fund tracking in GrantPipe connects each restriction term to the fund, grant, donation, source document, release record, and supporting evidence. The goal is simple: when someone asks what created a restricted balance, what released it, what evidence supports the release, and what is left, the answer is in the product.

## TL;DR

- Growth includes restriction terms, additions, releases, evidence links, alerts, and restricted rollforwards
- Audit-Ready adds evidence package output for auditor review
- Starter keeps basic fund and grant visibility, with upgrade prompts for lifecycle workflows
- Releases are manual-control-first in this release
- GrantPipe does not replace CPA judgment or provide accounting advice

## What this feature does

Restricted fund tracking is the operating record for money accepted with restrictions. A federal grant, a donor gift restricted to scholarships, or a board-designated reserve can have its own term, balance, release history, and evidence checklist.

The first version keeps releases manual because teams need control over messy historical records. The system checks available balance, keeps soft-deleted activity out of active math, and links evidence to existing documents or generated reports instead of copying files.

## How it works

1. Create a restriction term tied to a fund, grant, donation, or source document
2. Record additions when restricted money comes in
3. Record releases when a purpose or time condition has been satisfied
4. Link existing documents or generated reports as release evidence
5. Review missing evidence, expired time restrictions, and negative balance risk
6. Generate a restricted rollforward for the period

## Who it's for

Finance leads at $500K to $10M nonprofits who currently maintain parallel spreadsheets for every restricted grant. Executive directors who have been surprised at the audit when a restriction showed a different balance than the board report. Grants managers who have been asked by a program officer for a spend-down and spent two days rebuilding it.

## Why GrantPipe built it this way

GrantPipe approaches this as product infrastructure, not as accounting advice. The restriction layer is a first-class record that sits beside funds, grants, documents, reports, and activity history. The GL stays the GL. The restriction lifecycle owns the terms, balance movements, releases, evidence, and rollforward output.

## What it replaces

- The per-grant spreadsheet tab with a pivot that never matches the GL
- The monthly journal entry to move funds out of restriction
- The two-day scramble to rebuild a funder spend-down
- The audit finding on missing or misclassified net asset releases
- The board report that is two weeks stale by the time it is printed

For organizations on Audit-Ready and Enterprise plans, restricted fund records are also accessible through the [Auditor & Funder Portal](/features/auditor-funder-portal): external reviewers see the specific grants and fund balances you choose to share, with scoped, expiring access and a full view log - no spreadsheet exports, no inbox threads.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [role based permissions](/features/role-based-permissions)
- [soft credit tracking](/features/soft-credit-tracking)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
