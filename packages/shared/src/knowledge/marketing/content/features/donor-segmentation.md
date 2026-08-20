---
title: Donor Segmentation in GrantPipe
description: "Segment donors by giving history, recency, source, custom fields, and cohort. Saved segments drive outreach lists, board dashboards, and grant prospect identification."
seoTitle: Donor Segmentation Software for Nonprofits
seoDescription: "Segment donors by giving history, recency, source, custom fields, and cohort. Saved segments drive outreach lists and board dashboards."
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: nonprofit-crm
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - executive-director
  - development-director
tags:
  - feature
  - nonprofit-crm
  - donor-retention
  - segmentation
targetKeyword: donor segmentation software
bluf: "The average mid-sized nonprofit uses three donor segments. Organizations with strong retention programs use fifteen or more. Donor segmentation in GrantPipe is a saved-filter system: build a segment once using any combination of giving history, recency, source, fund, custom fields, and demographics, and it stays current automatically as donor records change."
faqs:
  - q: What fields can I use to build a segment?
    a: "Any standard donor field (first gift date, last gift date, total lifetime giving, largest gift, number of gifts, source, assigned staff, address) plus any custom fields your organization has defined. Giving-history filters support amount ranges, date ranges, fund filters, and gift-type filters."
  - q: Do saved segments stay current automatically?
    a: "Yes. Saved segments are live queries, not static lists. When a donor gives again, their record updates and they appear or leave segments based on the current filter criteria. There is no refresh step."
  - q: What RFM segmentation does GrantPipe support?
    a: "Recency, frequency, and monetary value filters are all available. You can build standard RFM segments (LYBUNT, SYBUNT, major donors, lapsed donors) using the filter builder without any configuration. Thresholds are fully configurable per organization."
  - q: Can segments drive email outreach lists?
    a: "Yes. Segments export to CSV for upload to any email platform. If you have the Mailchimp or Constant Contact integration enabled, segments can sync directly to mailing lists."
  - q: How many segments can I create?
    a: "No limit. Segments are lightweight - each is a stored filter definition, not a copy of the underlying records."
  - q: Can I use segments in board reports?
    a: "Yes. Board-facing dashboards can display segment counts, trend lines, and giving totals. Retention rate, LYBUNT count, and lapsed-donor recovery data pull from segments."
relatedPages:
  - /resources/guides/donor-retention-strategies
  - /resources/guides/donor-retention-reporting-for-boards
  - /features/donor-retention-reporting
  - /features/soft-credit-tracking
  - /features/csv-donor-import
  - /product
  - /pricing
  - /features/funder-reporting-templates
  - /features/grant-calendar-deadline-alerts
proscons:
  - subject: GrantPipe donor segmentation
    pros:
      - Live query segments stay current as records change - no manual refresh or export-and-reimport
      - Combines any standard field with any custom field in one filter definition
      - "RFM filters (LYBUNT, SYBUNT, lapsed, major) available without custom configuration"
      - Segments drive CSV exports and integration list syncs
      - No limit on the number of saved segments
    cons:
      - Segments are org-wide - there is no private or draft segment mode
      - Complex nested boolean logic (AND within OR) requires careful filter building; test on a small known dataset first
      - "Predictive scoring (likelihood to give, churn risk) is not currently a native filter option"
answers:
  - q: What is the LYBUNT segment and why does it matter?
    a: "LYBUNT stands for 'Last Year But Unfortunately Not This Year' - donors who gave in the prior fiscal year but have not yet given in the current year. It is the most commonly tracked lapsed-donor segment because these donors are recently engaged and have a significantly higher re-activation rate than multi-year lapsed donors. AFP Fundraising Effectiveness Project data shows first-year donor retention averaging 19-22%, while multi-year donor retention averages 60-65%. The LYBUNT segment is where recovery campaigns focus because the cost per recovered donor is lower than new-donor acquisition."
  - q: How do I build a major donor segment?
    a: "Define the threshold your organization uses (typically total lifetime giving above a dollar amount, or largest single gift above a threshold). Apply that filter in the donor list, save it as a segment named 'Major Donors' or 'Major Gift Prospects.' The segment updates automatically as donors cross the threshold. Add a portfolio-tier custom field if you want a manual override for donors approaching but not yet at the threshold."
  - q: Can I segment by which grant or fund a donor's gift supports?
    a: "Yes. Gift-level filters allow segmentation by fund, grant, campaign, or payment method. Donors who have given to a specific restricted fund appear in a segment built with a fund filter. This is useful for identifying donors to steward around a specific program's funder relationship."
pricingStats:
  - stat: "AFP Fundraising Effectiveness Project shows first-year donor retention rates averaging 19-22%, while donors retained for three or more years retain at 60-65%"
    source: AFP Fundraising Effectiveness Project 2024
    sourceUrl: "https://afpfep.org/"
  - stat: Organizations that use donor segmentation in their annual fund outreach report 15-25% higher renewal rates compared to undifferentiated outreach
    source: Bloomerang Nonprofit Benchmarks Report 2023
    sourceUrl: "https://bloomerang.co/resources"
  - stat: "The average nonprofit acquires a new donor for $50-$100 and retains a lapsed donor for $15-$30, making retention segmentation among the highest-ROI activities in fundraising"
    source: AFP Fundraising Effectiveness Project 2024
    sourceUrl: "https://afpfep.org/"
tableData:
  name: Common donor segments and filter logic
  description: Pre-built segment patterns used by mid-sized nonprofits. All are configurable; thresholds should match your organization's definitions.
  columns:
    - Segment name
    - Filter criteria
    - Typical use
  rows:
    - - LYBUNT
      - "Last gift date: prior fiscal year; no gift in current fiscal year"
      - Lapsed-donor re-activation appeals
    - - SYBUNT
      - "Last gift date: 2+ years ago; giving history exists"
      - Deep lapsed re-engagement; lower priority than LYBUNT
    - - Major donors
      - Total lifetime giving >= threshold OR largest gift >= threshold
      - Individualized stewardship and moves management
    - - First-year donors
      - "First gift date: current fiscal year"
      - Retention-focused second-gift cultivation
    - - Monthly sustainers
      - "Recurring gift: active"
      - Upgrade and stewardship campaigns
    - - Lapsed sustainers
      - "Recurring gift: cancelled in past 12 months"
      - Recurring gift re-activation
    - - Event attendees
      - "Source: event OR gift campaign: event"
      - Conversion to annual fund donors
sourceUrls:
  - "https://afpfep.org/"
  - "https://bloomerang.co/resources"
  - "https://www.nptechforgood.com/research-reports/"
  - "https://www.irs.gov/charities-non-profits/charitable-organizations/substantiating-charitable-contributions"
---

## The problem

Donor lists become blunt when every appeal starts from the same export. Without useful segments, teams over-message loyal donors, miss lapsed donors, and cannot see which relationships connect to grants, events, or restricted programs.

## How GrantPipe solves it

GrantPipe builds segments from giving, relationship, campaign, event, and grant context. Development can create focused lists without exporting the donor file into another worksheet.

Donor segmentation turns a flat list of contacts into a structured view of your fundraising program. The average mid-sized nonprofit uses three segments - everyone, major donors, and lapsed donors. Organizations with strong retention programs use fifteen or more, each driving a different outreach or stewardship workflow.

## TL;DR

- Build segments from any combination of giving history, recency, source, fund, and custom fields
- Saved segments are live queries - no manual refresh when records change
- Standard RFM segments (LYBUNT, SYBUNT, major, first-year) available without custom configuration
- Segments export to CSV or sync to email platform lists
- No limit on the number of saved segments

## What this feature does

The filter builder accepts any field on the donor or gift record and combines them with AND/OR logic into a segment definition. A segment named "Major Gift Prospects - Not Yet Asked" might filter on: total lifetime giving between $5,000 and $24,999, last gift in the past 18 months, and portfolio tier not equal to "Asked." That definition runs as a query against the live database. When a donor crosses the $5,000 threshold, they appear in the segment. When a prospect is moved to "Asked," they leave.

Saved segments appear in three places: the donor list (as a quick filter), the export tool (as a segment to export), and the board dashboard (as a counted, trended metric). Building a segment once makes it available everywhere.

## Who it's for

Development directors who run annual fund appeals and need differentiated lists for LYBUNT re-activation, first-year retention, and major gift upgrades. Grants managers who need to identify donors who give to the same programs a grant supports. Executive directors who want a dashboard showing donor retention trends without asking the development director for a status report.

## Workflow example

Building a first-year retention campaign using donor segmentation:

1. Define the "First-year donors" segment: first gift date within the current fiscal year
2. Define the "First-year donors - second gift made" segment: first gift date within the current fiscal year AND number of gifts >= 2
3. Monitor the second segment count as the year progresses - this is your first-year retention rate in real time
4. Export the "First-year donors" minus "second gift made" as a suppression list for the re-activation appeal
5. At year-end, compare the two counts for the board report

The segments update as gifts come in. No spreadsheet reconciliation required.

## RFM segmentation in practice

Recency, frequency, and monetary value are the three variables that predict future giving behavior. GrantPipe's filter builder supports all three:

- **Recency:** Last gift date filters (within 12 months, within 24 months, more than 24 months ago)
- **Frequency:** Number of gifts filters (one-time donor, two or more gifts, five or more gifts)
- **Monetary:** Total lifetime giving ranges and largest single gift filters

Combining these three dimensions produces segments like "multi-year donors who have given three or more times with a largest gift over $500" - a profile that predicts high major-gift upgrade potential. AFP Fundraising Effectiveness Project data consistently shows that frequency is the strongest predictor of retention: donors who give twice in their first year retain at more than double the rate of one-time donors.

## Integration with the rest of GrantPipe

Segments connect to the email platform integrations (Mailchimp, Constant Contact) for direct list sync. They feed the donor retention reporting dashboard with live counts and trend data. They are available in the export tool for any CSV-based outreach workflow. And they appear in board dashboards as configurable metrics - the executive director's dashboard can show LYBUNT count, first-year retention rate, and lapsed-donor recovery rate without any manual data pull.

## What it replaces

- The quarterly export-to-Excel process to build appeal lists
- The manual LYBUNT calculation that took half a day before each campaign
- The static segment lists that went stale between campaign cycles
- The conversation where the development director explains to the ED what "LYBUNT" means every year

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [funder reporting templates](/features/funder-reporting-templates)
- [grant calendar deadline alerts](/features/grant-calendar-deadline-alerts)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
