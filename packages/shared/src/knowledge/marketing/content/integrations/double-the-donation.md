---
title: "GrantPipe + Double the Donation Integration"
description: "Surface matching-gift eligibility on donation forms and track match submissions through GrantPipe reporting."
seoTitle: "Double the Donation (360MatchPro) Integration + GrantPipe"
seoDescription: "Connect Double the Donation to GrantPipe to track corporate matching gift eligibility, submission status, and match revenue by donor - without a separate."
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: "bofu"
schema: "SoftwareApplication"
topicCluster: "donor-operations"
contentIntent: "category"
primaryCta: "trial"
ctaMode: "convert"
refreshCadenceMonths: 12
targetKeyword: "double the donation integration"
targetPersona:
  - "finance-operations-staff"
  - "executive-director"
tags:
  - "integration"
  - "matching-gifts"
  - "double-the-donation"
  - "corporate-matching"
bluf: "Corporate matching programs leave $4-$7 billion unclaimed annually - the gap is almost entirely a tracking and follow-up problem, not an eligibility problem. GrantPipe's Double the Donation integration surfaces matching gift eligibility at donation time, tracks submission status on the donor record, and gives the development team a pipeline view of pending matches so nothing falls through after the initial gift."
faqs:
  - q: "How does the Double the Donation integration work with donation forms?"
    a: "Double the Donation's 360MatchPro widget can be embedded on any donation form - your own website, Stripe Checkout, or a landing page. When a donor enters their employer, the widget checks eligibility against Double the Donation's employer database. After the gift, GrantPipe records the matching gift status on the donor's donation record."
  - q: "Does GrantPipe receive matching gift status from Double the Donation?"
    a: "Yes. Double the Donation's API provides eligibility and submission status for matching gift requests linked to a donor record. GrantPipe pulls this status and displays it on the donation record - pending, submitted, approved, or declined."
  - q: "How does GrantPipe track the match separately from the original gift?"
    a: "When a corporate match is received, it is recorded as a separate donation in GrantPipe with a type of 'corporate match,' linked to the original gift and the donor. This keeps the donor's hard credit accurate (they gave X dollars) while the match is attributed correctly as a separate revenue source."
  - q: "Can I see all pending matching gift submissions in one place?"
    a: "Yes. GrantPipe includes a matching gift pipeline view that lists all donations with matching gift eligibility, their submission status, and the expected match amount. The pipeline filters to show overdue submissions - where the submission deadline is approaching or passed."
  - q: "Does Double the Donation require a separate subscription?"
    a: "Yes. Double the Donation's 360MatchPro is a separate subscription product. GrantPipe integrates with an existing 360MatchPro account. Pricing for 360MatchPro starts at approximately $499/year for small nonprofits."
  - q: "What if a matching gift is declined?"
    a: "Declined matches are recorded on the donation record with the decline reason if provided by Double the Donation. Declined matches remove the donation from the pending pipeline so follow-up resources are focused on actionable submissions."
relatedPages:
  - "/resources/guides/donor-retention-strategies"
  - "/integrations/zapier"
  - "/features/soft-credit-tracking"
  - "/resources/guides/match-tracking-cash-vs-in-kind"
sourceUrls:
  - "https://doublethedonation.com/api/"
  - "https://doublethedonation.com/360matchpro/"
  - "https://doublethedonation.com/matching-gift-statistics/"
  - "https://doublethedonation.com/nonprofit-toolkit/"
statistics:
  - stat: "An estimated $4-$7 billion in corporate matching gifts goes unclaimed annually in the United States because donors are unaware of eligibility or do not complete the submission process"
    source: "Double the Donation - Matching Gift Statistics"
    sourceUrl: "https://doublethedonation.com/matching-gift-statistics/"
  - stat: "65% of Fortune 500 companies offer employee matching gift programs, with match ratios typically ranging from 1:1 to 3:1 on employee donations"
    source: "Double the Donation - Corporate Matching Gift Research"
    sourceUrl: "https://doublethedonation.com/matching-gift-statistics/"
  - stat: "Nonprofits using 360MatchPro report recovering an average of $18 in matching gifts for every $1 invested in the tool, based on Double the Donation's customer benchmarks"
    source: "Double the Donation Customer ROI Benchmarks"
    sourceUrl: "https://doublethedonation.com/360matchpro/"
partner:
  name: "Double the Donation"
  slug: "double-the-donation"
  url: "https://doublethedonation.com"
category: "other"
setupSteps:
  - title: "Connect your 360MatchPro account"
    content: "In GrantPipe, navigate to Settings †’ Integrations †’ Double the Donation and enter your 360MatchPro API key and public key. These are available in your 360MatchPro account dashboard under API settings."
  - title: "Verify the donor identifier field"
    content: "GrantPipe and 360MatchPro link records by the donor's email address. Confirm that your donation forms collect donor email consistently - this is the join key for matching gift status retrieval."
  - title: "Embed the 360MatchPro widget on donation forms"
    content: "Follow Double the Donation's widget embed instructions for your donation forms. The employer lookup widget must be on the form before the integration can capture eligibility at donation time. This step happens in your form provider (Stripe Checkout, your website CMS, etc.) - not in GrantPipe."
  - title: "Configure match type attribution"
    content: "In GrantPipe, set how corporate match payments should be recorded: as a separate donation linked to the original gift, or as an additive amount on the original donation record. The default is a separate linked donation for accurate revenue attribution."
  - title: "Set up the matching gift pipeline view"
    content: "Configure alert thresholds for the matching gift pipeline: which submission age triggers an overdue flag, and which staff member receives alerts for overdue submissions."
  - title: "Run a retroactive eligibility check"
    content: "GrantPipe can send your recent donor list to Double the Donation's API for a retroactive eligibility check. Donors who work for matching-gift-eligible employers are flagged in GrantPipe even if they did not check eligibility at the time of their gift."
  - title: "Enable ongoing status sync"
    content: "Enable nightly sync of matching gift submission statuses from Double the Donation. Pending submissions that move to approved or declined update in GrantPipe automatically."
supportedFeatures:
  - "360MatchPro API key authentication"
  - "Matching gift eligibility status on donation records"
  - "Matching gift submission status tracking (pending, submitted, approved, declined)"
  - "Corporate match recorded as separate linked donation"
  - "Matching gift pipeline view with overdue alerts"
  - "Retroactive eligibility check via API"
  - "Nightly status sync from Double the Donation"
useCases:
  - "Track pending corporate match submissions and alert the development team before deadlines pass"
  - "Record approved corporate matches as separate donations for accurate fund accounting"
  - "Run a retroactive eligibility check on last year's donors to identify missed matching opportunities"
  - "Filter the donor database for matching-gift-eligible donors to prioritize in year-end campaigns"
  - "Report to the board on total matching gift revenue received and pipeline value"
tableData:
  name: "Matching gift status lifecycle"
  description: "How matching gift status flows through the integration"
  columns: ["Status", "Source", "GrantPipe Action"]
  rows:
    - ["Eligible (employer identified)", "360MatchPro widget", "Flag donation as match-eligible"]
    - ["Submission started", "360MatchPro tracking", "Update donation status to 'submitted'"]
    - ["Approved", "360MatchPro status update", "Create linked corporate match donation"]
    - ["Declined", "360MatchPro status update", "Mark as declined, remove from pipeline"]
    - ["Overdue", "GrantPipe age calculation", "Alert development staff"]
proscons:
  - subject: "Double the Donation integration"
    pros:
      - "Retroactive eligibility check recovers missed matches from historical gifts without re-contacting donors"
      - "Pipeline view with overdue alerts prevents the most common reason matches go unclaimed: no one followed up"
      - "Corporate match recorded as separate linked donation keeps fund revenue attribution accurate"
    cons:
      - "Requires a separate 360MatchPro subscription starting at approximately $499/year"
      - "Widget embed on donation forms must be done outside GrantPipe, in your form provider"
      - "Match approval timelines vary by employer (weeks to months), requiring ongoing pipeline monitoring"
answers:
  - question: "How far back can I run the retroactive eligibility check?"
    answer: "Double the Donation's API allows retroactive employer matching against your donor email list. GrantPipe can send any segment of your donor list for eligibility checking. The practical limit is the quality of email addresses in older records and whether employers' matching programs have changed since the original gift date."
  - question: "Can I track matching gift pledges before they are approved?"
    answer: "Yes. Once a donor reports they have submitted a matching gift request, you can manually update the matching gift status on the donation record in GrantPipe to 'submitted' even before the 360MatchPro tracking confirms it. This keeps the pipeline view complete."
  - question: "What if a donor's employer is not in Double the Donation's database?"
    answer: "Double the Donation's database covers more than 26,000 companies. Employers not in the database show as 'unknown eligibility.' GrantPipe flags these as manual-review items. You can add custom employer match notes to the donation record if you discover eligibility through other means."
pricingStats:
  - stat: "Double the Donation's 360MatchPro starts at $499/year for nonprofits with under $1M in annual revenue; pricing scales to $999-$2,499/year for larger organizations based on database size"
    source: "Double the Donation Pricing"
    sourceUrl: "https://doublethedonation.com/360matchpro/"
  - stat: "The average corporate match ratio is 1:1, meaning $1 in corporate matching for every $1 a donor gives; approximately 26% of employers offer ratios above 1:1"
    source: "Double the Donation - Matching Gift Statistics"
    sourceUrl: "https://doublethedonation.com/matching-gift-statistics/"
---

Corporate matching gifts represent one of the highest-ROI activities in nonprofit fundraising - money that is already earned and waiting for someone to file the paperwork. The reason so much of it goes unclaimed ($4-$7 billion annually by industry estimates) is not that donors are unwilling to submit. It is that nobody is tracking which submissions are pending, which are overdue, and which employers have been notified.

GrantPipe's Double the Donation integration makes matching gift status a first-class field on the donor record. Eligibility is captured at donation time via the 360MatchPro widget. Submission status syncs nightly. Overdue submissions trigger alerts. Corporate matches, when approved, record as separate linked donations so fund accounting stays accurate.

## What the integration does

GrantPipe connects to Double the Donation's 360MatchPro via API key authentication. After connecting, GrantPipe can pull matching gift eligibility and submission status for any donor with an email that appears in both systems.

The 360MatchPro widget lives on your donation forms - embedded by your web team in your form provider, not in GrantPipe. When a donor enters their employer during a gift, the widget checks eligibility against Double the Donation's database of 26,000+ companies. That eligibility status is passed to GrantPipe and stored on the donation record.

From there, GrantPipe tracks the submission lifecycle: eligible †’ submitted †’ approved or declined. The matching gift pipeline view shows every open submission, when it was made, the expected match amount, and how many days until the submission deadline. Overdue submissions trigger alerts to the development staff member assigned to that donor.

When a corporate match arrives, it is recorded as a separate donation in GrantPipe - type "corporate match," linked to the original gift and donor - so the revenue is attributed correctly without inflating the donor's personal giving total.

## Roadmap status

This integration is **on the GrantPipe roadmap**. Matching gift tracking is a frequently requested feature from mid-sized nonprofits that already use 360MatchPro but track match status in a separate spreadsheet. The integration will ship in the donor operations cluster. Contact the team for timeline.

## Data flows

- **360MatchPro †’ GrantPipe** (matching gift eligibility status on donation records, nightly sync)
- **360MatchPro †’ GrantPipe** (submission status updates: pending †’ submitted †’ approved/declined)
- **GrantPipe donor list †’ 360MatchPro** (retroactive eligibility check, on demand)

## Setup steps

1. Enter your 360MatchPro API credentials in GrantPipe Settings †’ Integrations †’ Double the Donation
2. Confirm donor email is the shared identifier between both systems
3. Embed the 360MatchPro widget on your donation forms (done in your form provider)
4. Configure corporate match attribution mode
5. Set up the matching gift pipeline view with overdue alert thresholds
6. Run a retroactive eligibility check on recent donors
7. Enable nightly status sync

## Common use cases

A development director runs a year-end campaign and asks every gift for employer information. After the campaign, GrantPipe's retroactive eligibility check identifies 32 donors who work for matching-gift-eligible employers. The development team sends a targeted follow-up - "Did you know your employer will match your December gift?" - and recovers 14 matches over the following six weeks.

The development officer monitors the matching gift pipeline view every Monday. Three submissions are flagged as overdue - employer deadlines approaching in two weeks. They send a reminder to each donor with instructions to resubmit. Two of the three matches are recovered.

## Limitations and gotchas

The 360MatchPro widget must be embedded on your donation forms by your web team. GrantPipe does not host donation forms; the eligibility capture happens before the donation data reaches GrantPipe. If your donation forms are hosted in Donorbox, Classy, or another platform, consult Double the Donation's widget integration documentation for that specific platform.

Match approval timelines vary significantly by employer - some approve within days, others take three to four months. The pipeline view is designed for ongoing monitoring, not one-time review.

Double the Donation's database covers 26,000+ companies but not all employers. Small businesses and private companies are often absent. Unknown-eligibility employers require manual research, which GrantPipe supports via manual status notes on the donation record.

## Pricing implications

360MatchPro is a separate subscription from GrantPipe, starting at $499/year for smaller nonprofits. The ROI calculation is straightforward: if 360MatchPro helps you recover $5,000 in matching gifts you would otherwise have missed, the tool pays for itself many times over. GrantPipe's subscription is priced independently.

## Start a free trial

[Start a trial](/signup).
