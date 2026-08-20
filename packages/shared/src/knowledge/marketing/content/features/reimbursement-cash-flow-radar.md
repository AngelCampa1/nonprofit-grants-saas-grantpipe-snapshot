---
title: Find Reimbursement Cash Gaps
entitlement: hasPaymentRequests
description: "GrantPipe shows posted grant costs that still need a request, approval, or payment. Finance can see which grant needs work next."
seoTitle: Reimbursement Cash Flow Software for Nonprofits
seoDescription: "See posted grant costs that still need a reimbursement request, funder approval, or cash receipt. GrantPipe turns grant cash gaps into a worklist."
targetKeyword: reimbursement cash flow software
publishedAt: "2026-06-17"
updatedAt: "2026-06-17"
lastReviewedAt: "2026-06-17"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: grant-compliance
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: grant-spend-down-tracker
targetPersona:
  - finance-operations-staff
  - executive-director
tags:
  - feature
  - grant-payments
  - reimbursements
  - cash-flow
bluf: "Reimbursement Cash-Flow Radar shows the cash gap across active grants. It reads posted expenses, payment requests, approvals, and cash receipts. Then it shows which grant needs a request, a follow-up, or a payment record."
faqs:
  - q: What is a reimbursement cash gap?
    a: "It is money your nonprofit has spent for a grant but has not received back yet. The gap can come from costs not requested, requests not approved, or approved requests not paid."
  - q: Does this replace the payment request workflow?
    a: "No. The radar points to work. Your team still creates payment requests in the Cash workspace."
  - q: Which expenses count?
    a: "The radar reads posted expenses marked reimbursable and tied to a grant. It skips deleted expenses and rejected requests."
  - q: Which plan includes it?
    a: "Reimbursement Cash-Flow Radar is part of the Growth plan and higher plans."
relatedPages:
  - /features/grant-drawdowns-reimbursements
  - /features/grant-budget-sentinel
  - /features/compliance-deadline-radar
  - /product
  - /pricing
proscons:
  - subject: Reimbursement Cash-Flow Radar
    pros:
      - Shows posted costs that still need a request
      - Shows submitted requests waiting on approval
      - Shows approved requests that are still unpaid
      - Ranks grants by cash gap
    cons:
      - It does not submit requests to funder portals
      - It depends on expenses being tagged to grants
      - It does not forecast bank balances
answers:
  - q: Why does this matter?
    a: "A reimbursement grant can drain cash before the funder pays. The radar shows where that gap is growing, so finance can act before month end."
  - q: How does GrantPipe find the gap?
    a: "GrantPipe compares posted reimbursable costs with active request lines. It also reads submitted requests, approved amounts, and recorded payments."
  - q: What should my team do first?
    a: "Start with the top work item. If costs are not requested, create a request. If a request is submitted, follow up with the funder. If it is approved, record the cash when it arrives."
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/part-200/section-200.305"
tableData:
  name: Reimbursement cash-flow radar
  description: How GrantPipe turns grant cash gaps into next steps.
  columns:
    - Gap
    - What it means
    - Next step
  rows:
    - - Not requested
      - Posted costs are not in an active request
      - Create a reimbursement request
    - - Awaiting approval
      - A submitted request needs a funder response
      - Follow up with the funder
    - - Approved, unpaid
      - A request was approved but cash is not recorded
      - Record the payment when it arrives
---

## The problem

Reimbursement grants can make cash tight even when the grant is healthy.

Your team pays the cost first. Then someone has to build the request. Then the
funder has to approve it. Then the payment has to arrive and be recorded. Each
step may live in a different place. The expense is in the ledger. The request is
in a tracker. The approval may be in email. The cash receipt may be in the bank
feed or another accounting view.

That split creates a basic question that is hard to answer: which grant is
using cash right now?

The answer matters at month end. It also matters in the middle of the month,
when payroll, vendors, and program costs are still moving. A reimbursement grant
can look fine on the budget while it still has costs that have not been
requested. Another grant may have a request waiting on a funder. A third grant
may already be approved but not paid.

When the team tracks those steps by hand, the cash gap gets rebuilt over and
over. Staff check expenses, compare request lines, read request status, and
look for payments. That work is slow, and it is easy to miss one grant while
chasing another.

## How GrantPipe solves it

GrantPipe turns the reimbursement trail into one worklist.

The radar reads posted expenses, payment request lines, request status, and
recorded payments. It looks only at active grant work for the current
organization. Then it groups the gap by grant so finance can see where cash is
still out.

The panel does not replace the request workflow. It points to the next action.
If posted reimbursable costs are not in an active request, the work item says to
create a reimbursement request. If a request has been submitted but not
approved, the work item says to follow up. If a request has been approved but
cash is not recorded, the work item says to record the payment when it arrives.

This keeps the Cash workspace focused on action. A finance user does not need
to open every grant to find the largest gap. The radar shows the grants with
the largest open amount first, then labels the risk as watch, warning, or
critical.

## TL;DR

- The radar shows reimbursement cash gaps across active grants.
- It splits the gap into not requested, awaiting approval, and approved unpaid.
- It ranks grants by the largest cash gap.
- It gives finance the next action for each grant.
- It is part of the Growth plan and higher plans.

## What this feature does

Reimbursement Cash-Flow Radar is a cash view for grant finance work. It starts
with posted reimbursable expenses tied to a grant. It checks whether those costs
are already tied to a non-rejected request. Costs in rejected requests do not
count as covered, because the team may need to request them again.

The radar also reads submitted requests. Those amounts are not yet cash, but
they are already in motion. They need funder review or a follow-up. It then
reads approved requests and subtracts recorded payments, so the team can see
what has been approved but not yet received.

The result is a cash gap per grant. GrantPipe shows the total gap and the three
parts of the gap. This lets a user tell the difference between "we have not
asked yet" and "we asked, but the funder has not paid." Those are different
problems. They need different actions.

The risk label is simple. A large gap, an old unrequested expense, or a gap that
is large compared with the grant amount becomes critical. A smaller but still
meaningful gap becomes warning. Everything else stays watch. The point is not
to score the grant perfectly. The point is to help a busy finance user start
with the grant that needs attention first.

## How it works

1. Post expenses and tag reimbursable costs to the right grant.
2. Create reimbursement requests from eligible expenses in the Cash workspace.
3. Move requests through submitted, approved, paid, rejected, or closed status.
4. Record funder payments when cash arrives.
5. Open the Cash workspace and review the radar panel.
6. Start with the top work item and take the recommended next step.

The radar uses the same payment request data that powers the request table. It
does not ask the team to keep a second tracker. When expenses, request status,
or payment records change, the next radar refresh reflects the new cash gap.

## Who it's for

This is for finance staff who manage reimbursement grants and need to protect
working cash. It also helps an executive director who wants to know which grant
is tying up cash before the next board or finance meeting.

It is most useful when the nonprofit has several active grants at once. One
grant may be waiting for a reimbursement request. One may be waiting on a
funder. One may be approved and unpaid. The radar puts those items in one
place, so the team does not rely on memory or a spreadsheet to decide what
needs work.

## Why GrantPipe built it this way

Grant cash work is a set of small follow-up tasks.
That is why the radar is in the Cash workspace, close to the request workflow.

The feature also keeps the language tied to the real process. "Not requested"
means posted costs are not in an active request. "Awaiting approval" means a
submitted request still needs a funder response. "Approved, unpaid" means the
request was approved, but the cash receipt is not recorded.

Those labels are plain on purpose. A team should not need to decode an
accounting report before taking the next step. The panel shows the amount, the
grant, the risk, and the action.

## What it replaces

- A spreadsheet of grant costs not yet requested
- A separate list of requests waiting on funders
- Manual checks for approved but unpaid requests
- Month-end cash gap math
- Repeated grant-by-grant reviews to find the next follow-up

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [grant drawdowns and reimbursements](/features/grant-drawdowns-reimbursements)
- [grant budget sentinel](/features/grant-budget-sentinel)
- [compliance deadline radar](/features/compliance-deadline-radar)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
