---
title: Donor Retention Reporting
description: "Year-over-year retention cohorts, LYBUNT and SYBUNT lists, lifecycle stages, and lapse risk scoring sitting on top of the donor CRM and gift history."
seoTitle: Donor Retention Reporting Software for Nonprofits
seoDescription: "Track donor retention with year-over-year cohort analysis, LYBUNT and SYBUNT lists, lifecycle stages, and lapse risk scoring built into the donor CRM."
targetKeyword: donor retention reporting
publishedAt: "2026-04-24"
updatedAt: "2026-04-24"
lastReviewedAt: "2026-04-24"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: donor-operations
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: nonprofit-crm-evaluation-scorecard
targetPersona:
  - executive-director
  - development-director
tags:
  - feature
  - donor-retention
  - lybunt-sybunt
bluf: "Donor retention reporting calculates year-over-year retention by cohort, produces LYBUNT and SYBUNT lists on demand, tracks each donor through a defined lifecycle (new, active, lapsing, lapsed, reactivated), and scores lapse risk using recency and frequency. The numbers are computed on live gift history, so the retention rate on a board report matches the retention rate a development director pulls the morning of the meeting."
faqs:
  - q: How is retention rate calculated?
    a: "Standard AFP methodology: donors who gave in both year N and year N-1, divided by donors who gave in year N-1. New-donor and repeat-donor retention are reported separately. First-time donor retention tends to run around 20-25 percent industry-wide; repeat-donor retention around 60 percent."
  - q: What is LYBUNT vs SYBUNT?
    a: LYBUNT (Last Year But Unfortunately Not This) lists donors who gave last fiscal year but not yet this year. SYBUNT (Some Year But Unfortunately Not This) lists donors who have given at any point historically but not this year. Both lists generate with one click and export to CSV.
  - q: How does lapse risk scoring work?
    a: Each donor is scored on recency and frequency relative to their own history. A monthly donor who missed one month scores high risk; an annual donor in month 11 scores moderate. Scores recompute nightly.
  - q: Can I segment retention by giving level?
    a: "Yes. Cohort views segment by first-gift amount, cumulative giving, acquisition channel, and program designation. The same filters apply to LYBUNT and SYBUNT outputs."
  - q: Does this cover recurring and pledge donors?
    a: Yes. Recurring donors roll up to an annualized figure for retention cohorts. Pledge commitments are tracked separately with fulfillment reporting so expected versus received is explicit.
relatedPages:
  - /resources/guides/nonprofit-crm-pricing-guide
  - /free/nonprofit-crm-evaluation-scorecard
  - /for/development-directors
  - /for/executive-directors
  - /resources/guides/how-to-calculate-donor-retention-rate
  - /compare/alternatives/bloomerang
  - /product
  - /pricing
  - /features/donor-segmentation
  - /features/funder-reporting-templates
proscons:
  - subject: GrantPipe retention reporting
    pros:
      - "Retention cohorts compute on live gift history, not a monthly refresh"
      - LYBUNT and SYBUNT lists generate without a separate query tool
      - "Lapse risk scoring uses each donor's own history, not a flat threshold"
      - "Segmentation by acquisition channel, program, and gift level"
    cons:
      - Requires at least 12 months of clean gift history to surface meaningful cohorts
      - Does not replace a dedicated marketing automation tool for outreach execution
      - "Lapse risk is descriptive, not predictive; does not promise to predict major-gift capacity"
answers:
  - q: What is a good donor retention rate?
    a: The AFP Fundraising Effectiveness Project reports overall donor retention around 43 percent and first-time donor retention around 20-25 percent across the sector. Rates above 50 percent overall and above 30 percent for new donors are strong signals.
  - q: How do retention cohorts help planning?
    a: "Cohorts reveal whether a campaign that acquired 500 donors in 2023 is still worth the CAC two years later. If retention of that cohort drops below 15 percent by year two, the channel underperforms and budget should shift."
  - q: How often do reports refresh?
    a: Retention cohorts and lapse risk scores recompute nightly. LYBUNT and SYBUNT lists recompute on request so they reflect gifts posted through the previous close.
  - q: Can donors be suppressed from lists?
    a: "Yes. Do-not-solicit, deceased, and board-excluded flags suppress donors from LYBUNT, SYBUNT, and outreach exports. Suppression is enforced at export, not after."
pricingStats:
  - stat: AFP Fundraising Effectiveness Project reports overall donor retention near 43 percent and new-donor retention around 20-25 percent
    source: AFP Fundraising Effectiveness Project 2024 Quarterly Reports
    sourceUrl: "https://afpfep.org/"
  - stat: Nonprofit Tech for Good 2024 Technology Report found 51 percent of small nonprofits did not have a written retention strategy despite using a donor CRM
    source: Nonprofit Tech for Good 2024 Technology Report
    sourceUrl: "https://www.nptechforgood.com/research-reports/"
  - stat: "Candid's Giving USA 2024 reported individual giving at $374 billion, reinforcing retention as a bigger lever than acquisition for most nonprofits"
    source: Giving USA 2024
    sourceUrl: "https://givingusa.org/"
tableData:
  name: Donor lifecycle stages and default criteria
  description: Lifecycle stages are automatic; criteria are configurable per organization.
  columns:
    - Stage
    - Definition
    - Typical action
  rows:
    - - New
      - First gift in the last 12 months
      - Welcome series and second-gift ask
    - - Active
      - Gave in current fiscal year
      - Upgrade ask and stewardship
    - - Lapsing
      - "Gave last fiscal year, not current year, within expected cadence window"
      - Win-back outreach
    - - Lapsed
      - Last gift more than 18 months ago
      - Reactivation campaign
    - - Reactivated
      - Lapsed donor who gave in current year
      - Steward to prevent re-lapse
sourceUrls:
  - "https://afpfep.org/"
  - "https://givingusa.org/"
  - "https://www.nptechforgood.com/research-reports/"
  - "https://www.councilofnonprofits.org/running-nonprofit/fundraising-and-resource-development/donor-retention"
  - "https://www.irs.gov/charities-non-profits/charitable-organizations/substantiating-charitable-contributions"
---

## The problem

Retention gets discussed after revenue has already slipped because the report is buried in a spreadsheet or annual dashboard. Development teams need to see renewal risk early enough to change stewardship, not simply explain the result later.

## How GrantPipe solves it

GrantPipe shows retention signals from the same donor records staff already use for gifts, notes, campaigns, and grant relationships. The report points teams toward the donors who need attention next.

Donor retention reporting calculates year-over-year retention by cohort, produces LYBUNT and SYBUNT lists on demand, tracks each donor through a defined lifecycle (new, active, lapsing, lapsed, reactivated), and scores lapse risk using recency and frequency. The numbers are computed on live gift history, so the retention rate on a board report matches the retention rate a development director pulls the morning of the meeting.

When the product page links from donor pipeline, this page is the reporting view behind that pipeline. GrantPipe shows which donors are active, lapsing, lapsed, or ready for reactivation so a development team can turn pipeline review into the next retention action.

## TL;DR

- Year-over-year retention cohorts using AFP methodology
- LYBUNT and SYBUNT lists generate on request, not on a monthly batch
- Five-stage donor lifecycle with configurable criteria
- Lapse risk scoring based on each donor's own giving cadence
- Segmentation by acquisition channel, program, and gift level

## What this feature does

Retention reporting is how you know whether the money you spent to acquire donors last year is still giving this year. It is the single metric that separates development programs that compound from programs that churn. GrantPipe computes the retention metrics the AFP Fundraising Effectiveness Project publishes: overall retention, new-donor retention, repeat-donor retention, and monthly-donor retention, all on your actual gift history.

## How it works

1. Gift history is tagged to fiscal year, acquisition channel, program designation, and gift level
2. Each donor's lifecycle stage recomputes nightly against their own cadence
3. Retention cohorts compute on demand; a typical pull is three seconds
4. LYBUNT and SYBUNT lists apply suppression flags (do-not-solicit, deceased, board-excluded) at export
5. Lapse risk scores update nightly using recency and frequency relative to personal history
6. Export to CSV or push to an outreach queue for stewardship action

## Who it's for

Development directors who report retention to the board quarterly and cannot reconcile the number with the one from last quarter. Executive directors evaluating whether a capital campaign is retaining its acquired donors. Annual fund managers who need the LYBUNT list on the first of the month without waiting for a database administrator.

## Who it's for

Stewardship coordinators running win-back campaigns who need an accurate lapsing list, not a stale extract. Finance leads projecting individual giving revenue for the next twelve months against actual retention rates rather than aspirational assumptions.

## Why GrantPipe built it this way

Retention rates are easy to get wrong in three ways: inconsistent fiscal year definition, uncounted recurring gifts, and snapshot-vs-live reporting mismatches. The architectural decision was to treat retention as a computed view, not a stored table. Every query runs against the source gift records with a single canonical fiscal year definition per organization. Recurring gifts roll up to annualized figures automatically. There is no nightly snapshot that can go stale; there is no export that can drift from the source. The tradeoff is that a retention query is slightly more expensive than a stored rollup; the benefit is that two people asking the same question always get the same answer.

## What it replaces

- The annual retention calculation done manually in a spreadsheet from a gift export
- The LYBUNT list that required a database admin ticket
- The donor CRM that reports retention but cannot explain which cohort drove the change
- The board slide that says retention is 52 percent without showing which segment is pulling the average
- The reactivation campaign that went to deceased donors because suppression was not enforced at export

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [donor segmentation](/features/donor-segmentation)
- [funder reporting templates](/features/funder-reporting-templates)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
