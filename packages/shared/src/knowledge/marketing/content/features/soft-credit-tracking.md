---
title: Soft Credit Tracking in GrantPipe
description: "Attribute gifts to the advising donor while preserving the hard credit for the donor of record. DAF gifts, matching gifts, and tribute gifts handled correctly - without misstating 990 totals."
seoTitle: Soft Credit Tracking for Nonprofit Donors
seoDescription: Attribute gifts to the advising donor while preserving the hard credit for the donor of record. DAF and matching-gift workflows supported.
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
  - donor-management
  - gift-processing
targetKeyword: soft credit tracking nonprofit
bluf: "Getting soft credits right is how you keep major donors credited for DAF gifts without misstating Form 990 totals. Soft credit links the attributed donor to a gift without transferring ownership of the revenue - the hard credit stays with the legal donor of record, the soft credit appears in the attributed donor's giving history and stewardship record."
faqs:
  - q: What is the difference between a hard credit and a soft credit?
    a: Hard credit is the legally recognized donor of record - the entity whose gift appears in Form 990 revenue totals and receives the tax acknowledgment. Soft credit is an attribution record - a link between the gift and another person or organization that influenced or directed the gift. Soft credits appear in the attributed donor's giving history but are not counted in revenue totals.
  - q: When do I use soft credits?
    a: "Three common scenarios: (1) A donor-advised fund makes a gift - the DAF is the hard credit, the recommending donor receives a soft credit. (2) A matching gift arrives from an employer - the employer is the hard credit, the employee may receive a soft credit for stewardship purposes. (3) A tribute or memorial gift is made - the legal donor is the hard credit, the tribute honoree's record may receive a soft credit for family communications."
  - q: Can one gift have multiple soft credits?
    a: "Yes. A single gift can have one hard credit and multiple soft credits. The soft-credit amounts do not need to sum to the gift amount - soft credits are attribution, not a split of revenue."
  - q: Do soft credits appear in donor giving history?
    a: "Yes. The attributed donor's profile shows soft-credited gifts in their giving history, clearly labeled as soft credits. This allows development staff to see the full picture of a donor's engagement - direct gifts plus influenced gifts - without the soft-credited amounts appearing in revenue reports."
  - q: How does soft credit affect LYBUNT and other retention segments?
    a: "By default, retention segments use hard credits only. You can optionally include soft credits in segment calculations - useful if you want to steward DAF donors as 'active' based on their advised gifts even though the hard credit belongs to the DAF."
  - q: Do soft credits affect Form 990 revenue totals?
    a: No. Soft credits are attribution records. Revenue totals on Form 990 and in financial reports use hard credits only. The design prevents double-counting.
relatedPages:
  - /resources/guides/donor-retention-strategies
  - /features/donor-retention-reporting
  - /features/donor-segmentation
  - /features/audit-trail-activity-log
  - /product
  - /pricing
  - /features/subrecipient-monitoring
  - /features/ai-award-document-intake
proscons:
  - subject: GrantPipe soft credit tracking
    pros:
      - Hard credit and soft credit are cleanly separated - no risk of revenue double-counting in 990 or financial reports
      - Supports multiple soft credits per gift for complex attribution scenarios
      - Soft-credited gifts appear in attributed donor history for stewardship and relationship management
      - "DAF workflow: hard credit goes to DAF sponsor, soft credit goes to recommending donor"
      - Configurable inclusion in retention segments
    cons:
      - Soft credit setup is manual - there is no automatic attribution based on gift source
      - Matching gift employers must exist as donor records to receive soft credits; employer records that are only in the gift notes cannot be attributed
      - Reporting filters must specify whether to include or exclude soft credits - the default is exclusion
answers:
  - q: How do donor-advised funds affect donor stewardship without soft credits?
    a: "Without soft credits, a DAF gift records to the DAF sponsor (e.g., Fidelity Charitable) as the donor of record. The recommending donor - the person who advised the gift - has no giving history in the CRM. Development staff have no systematic way to track that this donor is actively giving through a DAF, and stewardship communications cannot account for the full scope of their engagement. Over time, DAF donors who are not stewarded as donors churn at higher rates because the relationship is not being maintained."
  - q: What does the DAF soft credit workflow look like in practice?
    a: "A gift arrives from Fidelity Charitable with a note referencing the donor's name. Record the gift with Fidelity Charitable as the hard credit. Add a soft credit to the recommending donor's record for the gift amount. The recommending donor's profile now shows the DAF gift in their history. Development staff can see their full engagement, send appropriate stewardship, and include them in retention analysis. The 990 revenue total records correctly against Fidelity Charitable."
  - q: How does soft credit differ from a split gift?
    a: A split gift divides the hard credit - and the legal acknowledgment - between two or more donors. Each hard credit recipient receives a tax acknowledgment for their portion. A soft credit does not split the acknowledgment. The full gift amount is legally attributed to one donor; the soft credit is an internal stewardship record only.
pricingStats:
  - stat: "DAFs now contribute approximately 22% of all individual giving in the US, with Fidelity Charitable, Schwab Charitable, and Vanguard Charitable together distributing over $25 billion annually"
    source: National Philanthropic Trust DAF Report 2024
    sourceUrl: "https://www.nptrust.org/reports/daf-report/"
  - stat: Nonprofits that systematically steward DAF donors as individual donors (using soft credit records) report 30-40% higher DAF renewal rates in subsequent years
    source: DAF Research Collaborative 2023
    sourceUrl: "https://www.nptrust.org/reports/daf-report/"
  - stat: "Double the Donation estimates $4-7 billion in corporate matching gift funds go unclaimed annually, partly due to inadequate attribution tracking"
    source: Double the Donation Matching Gift Statistics 2024
    sourceUrl: "https://doublethedonation.com/tips/matching-gift-statistics/"
tableData:
  name: Gift attribution scenarios and credit assignments
  description: "Common scenarios where soft credit applies, showing hard and soft credit assignment."
  columns:
    - Scenario
    - Hard credit (revenue)
    - Soft credit (stewardship)
    - Tax acknowledgment
  rows:
    - - DAF gift
      - "DAF sponsor (Fidelity, Schwab, etc.)"
      - Recommending donor
      - Sent to DAF sponsor only
    - - Corporate match
      - Matching employer
      - Employee donor
      - Sent to employer
    - - Tribute gift
      - Legal donor
      - Tribute honoree (optional)
      - Sent to legal donor
    - - Foundation grant influenced by board member
      - Foundation
      - Board member (optional)
      - Sent to foundation
    - - Peer-to-peer fundraiser gift
      - Actual donor
      - Campaign organizer (optional)
      - Sent to actual donor
sourceUrls:
  - "https://www.nptrust.org/reports/daf-report/"
  - "https://doublethedonation.com/tips/matching-gift-statistics/"
  - "https://afpfep.org/"
  - "https://www.irs.gov/charities-non-profits/charitable-organizations/substantiating-charitable-contributions"
---

## The problem

Soft credits fall apart when relationship credit is tracked outside the gift record. Major gifts, board influence, household giving, and funder introductions need context without changing the legal gift owner.

## How GrantPipe solves it

GrantPipe tracks relationship credit beside the legal gift record. Development can report influence and stewardship context without distorting receipting, accounting, or restricted-fund history.

Soft credit tracking is the mechanism that keeps major donor stewardship accurate when the legal gift is made through an intermediary. Donor-advised funds are the most common case: the legal donor is the DAF sponsor, but the person your development director has a relationship with is the recommending donor. Without soft credits, that recommending donor has no giving history in your system.

## TL;DR

- Hard credit = legal donor of record, tax acknowledgment recipient, included in 990 revenue
- Soft credit = attributed donor, stewardship record, excluded from revenue reporting
- One gift can have multiple soft credits; soft credit amounts do not need to match gift total
- DAF, matching gift, and tribute workflows all supported
- Configurable inclusion or exclusion in retention segments

## What this feature does

Soft credit creates a link between a gift and an attributed donor without transferring revenue recognition. The hard credit record - the entity that receives the tax acknowledgment and appears in Form 990 Line 1 - stays with the legal donor. The soft credit record appears in the attributed donor's giving history, tagged as a soft credit, so development staff can see the full picture of engagement.

The design follows standard fundraising data conventions. The Internal Revenue Service cares about the hard credit: who made the deductible contribution. Your development director cares about the relationship: who is actually funding your work and needs to be stewarded accordingly.

## Who it's for

Development directors at mid-sized nonprofits where DAF gifts represent a meaningful share of major gift revenue. Organizations with active corporate matching gift programs where employer credits should be paired with employee records. Major gifts programs where managing multiple-relationship gifts (tribute, advisor-influenced, board-sourced) is a regular workflow.

## The DAF problem without soft credits

Donor-advised fund giving has grown substantially. National Philanthropic Trust data shows DAFs distributing over $52 billion annually. For many mid-sized nonprofits, DAF gifts represent 10-25% of individual major gift revenue.

When a DAF gift records without a soft credit, the recommending donor disappears from the donor database. Their giving history shows no gifts. LYBUNT analysis excludes them because they have not made a gift in their own name. Stewardship communications treat them as a prospect rather than an active donor. The relationship erodes - not because the donor stopped giving, but because the CRM stopped tracking them correctly.

Adding a soft credit takes 30 seconds and keeps the recommending donor visible in the data. The 990 reports correctly. The donor retention program does too.

## Workflow example

1. A gift of $5,000 arrives from Fidelity Charitable with a note referencing "advised by Jane Smith"
2. Record the gift with Fidelity Charitable as the hard credit donor
3. Add a soft credit: attributed donor = Jane Smith, amount = $5,000
4. Jane Smith's donor profile now shows the $5,000 DAF gift labeled "Soft Credit"
5. Her giving history, total lifetime giving display, and LYBUNT status reflect the engagement
6. The development director can steward Jane as an active $5,000 donor
7. Fidelity Charitable's record shows the hard credit; Form 990 revenue is accurate

## Matching gifts

Corporate matching gifts use the same mechanism. The employer makes the legal gift - employer is the hard credit. The employee's record receives a soft credit for the original employee contribution amount, or for the matched amount, or for both depending on your organization's tracking preference. Either way, the employee's relationship to the organization is visible in the data.

## Integration with the rest of GrantPipe

Soft credits appear in the donor profile giving history view, filtered as "soft credits" alongside hard credits. They are available as an inclusion option in donor segments - if you want your LYBUNT segment to include donors with only soft-credited activity, you can configure that. The audit trail logs soft credit creation, modification, and deletion. Acknowledgment letters route to the hard credit donor only.

## What it replaces

- Manual notes in a donor record that say "DAF donor - check Fidelity" with no searchable data
- The spreadsheet that tracks DAF recommending donors separately from the CRM
- The major gift officer's personal list of donors who "give through DAFs" that lives nowhere in the system
- The annual confusion about why your LYBUNT count does not match your major gift officer's relationship count

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [subrecipient monitoring](/features/subrecipient-monitoring)
- [ai award document intake](/features/ai-award-document-intake)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
