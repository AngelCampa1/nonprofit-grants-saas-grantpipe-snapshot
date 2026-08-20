---
title: "How to Track Donor Pledges vs Payments"
description: "Step-by-step workflow for recording unconditional and conditional donor pledges, recognizing contribution receivables under FASB ASC 958-605, and reconciling pledge payments against schedules."
seoTitle: "Track Donor Pledges vs Payments Workflow"
seoDescription: "Record pledges under FASB ASC 958-605: unconditional vs conditional, present-value discounting, allowance for uncollectibles, and payment schedule tracking."
targetKeyword: "track donor pledges vs payments"
publishedAt: "2026-04-24"
updatedAt: "2026-04-24"
lastReviewedAt: "2026-04-24"
buyerStage: "tofu"
schema: "HowTo"
topicCluster: "grant-compliance"
contentIntent: "workflow"
primaryCta: "lead-magnet"
ctaMode: "educate"
refreshCadenceMonths: 12
leadMagnetSlug: "grant-compliance-checklist"
targetPersona:
  - "development-director"
  - "finance-operations-staff"
tags:
  - "workflow"
  - "pledges"
  - "donor management"
  - "ASC 958"
timeEstimate: "4-8 hours initial setup, 1-2 hours monthly"
difficulty: "intermediate"
prerequisites:
  - "Signed pledge documentation from each donor"
  - "Payment schedule specifying amounts and due dates"
  - "Discount rate policy for multi-year pledges"
  - "Historical collection rate data for allowance calculation"
  - "Donor management system or spreadsheet for tracking"
outputs:
  - "Pledge register with unconditional vs conditional classification"
  - "Contribution receivable balance with present-value discount"
  - "Allowance for uncollectible pledges by aging bucket"
  - "Monthly pledge payment variance report"
bluf: "A donor pledge is not a donation until it is unconditional. Under FASB ASC 958-605, unconditional pledges are recorded as contribution revenue and receivable at the point the promise is made, not when cash arrives. Multi-year pledges are discounted to present value, and an allowance covers expected uncollectibles. Conditional pledges stay off the books until the barrier is met. Most pledge reporting errors trace to misclassifying conditional as unconditional or forgetting the present-value discount."
steps:
  - title: "Classify the pledge as unconditional or conditional"
    content: "A pledge is conditional if a donor-imposed barrier must be overcome before the recipient is entitled to the funds - matching-gift requirements, milestone completion, or a future event. Anything without a barrier is unconditional. ASC 958-605 requires a conditional pledge to stay off the balance sheet until the barrier is met; an unconditional pledge is recorded on promise."
  - title: "Capture the pledge in the donor record"
    content: "Record the donor name, pledge amount, payment schedule, intent (general support vs restricted purpose), and any donor-imposed restrictions. Attach the signed pledge card, grant agreement, or letter of intent. Pledges without written documentation are much harder to defend at audit."
  - title: "Apply present-value discounting for multi-year pledges"
    content: "Pledges collectible beyond one year must be discounted to present value using a risk-adjusted rate. The discount is unwound over time as interest income (or release from restriction). A five-year $100,000 pledge at a 4% discount rate is recorded at roughly $89,000 today, not $100,000."
  - title: "Record the allowance for uncollectible pledges"
    content: "Every pledge portfolio has some expected loss. Use historical collection rates by donor type, pledge size, or aging bucket to estimate the allowance. Booking an allowance of zero is almost never defensible. Review and true-up the allowance annually."
  - title: "Track pledges with vs without donor restrictions"
    content: "Under ASC 958-205, net assets are classified as without donor restrictions or with donor restrictions. A pledge designated for a specific program or time period falls into restricted net assets until the restriction is released. Track the release events (time passage or purpose fulfillment) separately from the pledge payments themselves."
  - title: "Record payments against the schedule"
    content: "When a payment arrives, reduce the pledge receivable by the cash received, recognize the portion of the discount that has unwound as contribution or interest revenue, and release any time-restriction that has expired. Match each payment to the scheduled installment - early, on-time, or late - and flag missed payments for follow-up."
  - title: "Age the receivable and follow up on late payments"
    content: "Pledges 30, 60, 90, and 120+ days past scheduled payment date need escalating follow-up. Development staff handle the donor relationship; finance updates the allowance if collection becomes doubtful. A pledge written off is a reduction to contribution revenue, not bad debt expense."
  - title: "Reconcile the pledge register to the general ledger monthly"
    content: "Pledge receivable balance per the register must match the GL control account. Payments received match cash deposits. Releases from restriction match the corresponding net asset reclassifications. Monthly reconciliation prevents year-end surprises during audit."
faqs:
  - q: "When does a conditional pledge become unconditional?"
    a: "When the donor-imposed barrier is substantially met. For a matching gift, that is when enough matching funds have been raised. For a milestone pledge, it is when the milestone is documented as complete. The barrier must be specific and measurable for conditional treatment - vague intentions do not make a pledge conditional."
  - q: "Do we record multi-year pledges at full face value?"
    a: "No. FASB ASC 958-605 requires discounting pledges collectible beyond one year to present value using a risk-adjusted discount rate. The undiscounted amount is disclosed, but the balance sheet carries the discounted value. Each year, part of the discount unwinds into revenue."
  - q: "What discount rate should we use?"
    a: "A risk-free rate (such as a Treasury rate matching the pledge duration) adjusted upward for credit risk specific to the donor or donor group. Many organizations use 3-5% as a baseline. The rate locked in at the promise date generally stays fixed for that pledge."
  - q: "How do we handle a pledge payment that is larger than the scheduled installment?"
    a: "Apply the excess against future scheduled installments unless the donor specifies otherwise. Document the donor's intent. Revising the payment schedule without written donor approval creates audit questions - always get it in writing."
  - q: "Can board-designated funds count as pledges?"
    a: "No. Internal designations are not pledges. A pledge requires an external party's promise to contribute. Board-designated net assets stay in net assets without donor restrictions - they do not create a receivable."
relatedPages:
  - "/resources/guides/nonprofit-grant-compliance-guide"
  - "/resources/guides/federal-grant-reporting-requirements"
  - "/resources/guides/uniform-guidance-2-cfr-200-practical-guide"
  - "/free/grant-compliance-checklist"
  - "/for/board-treasurers"
  - "/for/grants-managers"
definitions:
  - term: "Unconditional pledge"
    definition: "A promise to give with no donor-imposed barrier. Recognized as contribution revenue and receivable when the promise is made, per FASB ASC 958-605."
  - term: "Conditional pledge"
    definition: "A promise to give contingent on a specified event, milestone, or match. Not recorded on the balance sheet until the condition is substantially met."
  - term: "Present-value discount"
    definition: "The reduction in recorded pledge value for pledges collectible beyond one year, reflecting the time value of money. The discount unwinds over the pledge period."
  - term: "Allowance for uncollectible pledges"
    definition: "Estimated portion of the pledge receivable not expected to be collected, based on historical collection rates. A contra-asset reducing the net receivable balance."
answers:
  - question: "Where is the line between a pledge and an intention?"
    answer: "A pledge is a legally enforceable promise. A verbal intent or informal commitment is not. For audit purposes, documentary evidence - a signed pledge card, countersigned letter, or grant agreement - is the minimum. Without documentation, many auditors require organizations to treat the item as intent rather than pledge."
  - question: "How do multi-year pledges affect the Statement of Activities?"
    answer: "The full present-value of a multi-year unconditional pledge is recorded as contribution revenue in the year the promise is made, not spread across the pledge period. Each subsequent year records the discount accretion as additional revenue. This can cause large year-over-year swings for organizations with episodic pledge activity."
  - question: "What happens if a donor stops paying?"
    answer: "Attempt collection through development staff first. If collection becomes doubtful, adjust the allowance. If the pledge is formally written off, reduce contribution revenue (not bad debt expense) and remove the receivable. Document the write-off decision with board or executive approval."
  - question: "Do verbal pledges count?"
    answer: "Verbal pledges are difficult to enforce and even harder to audit. Most nonprofit CPAs will not let an organization book a verbal pledge without a follow-up written confirmation. The right practice is to treat a verbal commitment as a prospect until it is papered."
pricingStats:
  - stat: "FASB ASC 958-605 requires unconditional pledges to be recognized as contribution revenue when the promise is made, not when cash is received"
    source: "FASB Accounting Standards Codification 958-605"
  - stat: "Multi-year pledges collectible beyond one year must be discounted to present value under ASC 958-605-30-6"
    source: "FASB ASC 958-605-30-6"
  - stat: "Conditional pledges remain off the balance sheet until the donor-imposed barrier is substantially met, per ASU 2018-08"
    source: "FASB ASU 2018-08"
sourceUrls:
  - "https://asc.fasb.org/"
  - "https://asc.fasb.org"
  - "https://www.aicpa-cima.com/resources/landing/not-for-profit-entities-audit-and-accounting-guide"
---

The pledge-to-payment cycle is where donor management and accounting meet. Handled well, it is a reliable revenue picture. Handled loosely, it produces audit adjustments, restricted-fund errors, and financial statements that do not match reality.

## TL;DR

- Unconditional pledges are recorded as contribution revenue and receivable when made.
- Conditional pledges stay off the books until the barrier is met.
- Multi-year pledges are discounted to present value; the discount unwinds over time.
- Every pledge portfolio needs an allowance for uncollectibles.
- Reconcile the pledge register to the GL monthly, not annually.

## Step-by-step

1. Classify each pledge as unconditional or conditional.
2. Capture the pledge in the donor record with documentation.
3. Apply present-value discounting for multi-year pledges.
4. Record the allowance for uncollectible pledges.
5. Separate pledges with donor restrictions from those without.
6. Record payments against the schedule.
7. Age the receivable and follow up on late payments.
8. Reconcile the pledge register to the GL monthly.

## The Conditional vs Unconditional Distinction

This is where most pledge errors start. ASU 2018-08 sharpened the definition of a barrier - it must be specific, measurable, and related to the purpose of the agreement. A donor who says "I will give $50,000 if you hire a program director" has imposed a barrier. A donor who says "I hope you will hire a program director with this $50,000" has not.

When in doubt, err toward unconditional. Conditional classification delays revenue recognition and creates disclosure burden. Misclassifying unconditional as conditional understates current-year revenue and distorts financial trends.

## Present-Value Discounting

A $100,000 pledge payable $20,000 per year for five years is worth less than $100,000 today. ASC 958-605 requires discounting to a present-value amount using a risk-adjusted rate. The discount unwinds annually as additional contribution or interest revenue. Many organizations skip this step because the math looks complicated - but skipping it overstates pledge receivables and contribution revenue.

Lock the discount rate at the pledge promise date. Do not revisit it unless circumstances substantially change the collectibility assessment.

## The Allowance Question

An allowance for uncollectible pledges of zero is almost never defensible. Even strong donor portfolios experience 1-5% attrition - death, financial hardship, donor disputes. Use historical data from your own organization where possible; otherwise, peer-benchmark cautiously. Review the allowance annually and true-up based on actual collection experience.

Writing off an uncollectible pledge reduces contribution revenue, not bad debt expense. This is unique to nonprofit accounting and catches many organizations coming from for-profit backgrounds.

## Restrictions and Releases

A restricted pledge stays in net assets with donor restrictions until the time or purpose restriction is released. The release is a reclassification on the Statement of Activities, not a revenue event. Track releases separately from pledge payments - they are different accounting events even when they happen on the same day.

## What GrantPipe Does Here

GrantPipe records pledges with the classification, schedule, and restriction metadata needed to automate present-value discounting, allowance calculation, and release tracking. Monthly reconciliation is a standing report rather than a manual rebuild. [Start a trial](/signup).
