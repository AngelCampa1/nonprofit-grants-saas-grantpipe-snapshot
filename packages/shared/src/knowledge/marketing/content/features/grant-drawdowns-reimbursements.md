---
title: Grant Drawdown and Reimbursement Request Tracking
entitlement: hasPaymentRequests
description: "Create drawdown requests, pick eligible expenses, track status from draft to payment, and maintain a live outstanding cash dashboard for every active grant."
seoTitle: Grant Drawdown & Reimbursement Tracking Software
seoDescription: "Track drawdown requests, reimbursement status, and outstanding cash across federal and foundation grants without spreadsheets or manual reconciliation."
targetKeyword: grant drawdown reimbursement tracking
publishedAt: "2026-05-04"
updatedAt: "2026-05-04"
lastReviewedAt: "2026-05-04"
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
  - drawdowns
  - reimbursements
bluf: "Grant drawdown and reimbursement tracking in GrantPipe connects each request to eligible expenses, tracks status through draft, submitted, approved, and paid stages, records cash receipts, and maintains an outstanding balance dashboard per grant. Growth teams get the full request and payment lifecycle, indirect cost rate rules, and a reimbursement evidence packet PDF for auditor or funder review."
faqs:
  - q: What is the difference between a drawdown and a reimbursement request in GrantPipe?
    a: Both are request types within the same lifecycle. A drawdown request asks the funder to release funds in advance of expenses being incurred. A reimbursement request asks for payment after eligible expenses are already documented. GrantPipe models both under the same request workflow so the outstanding balance calculation works correctly regardless of which method the funder requires.
  - q: Which expense records can be linked to a drawdown request?
    a: "Requests pull from expenses already tagged to the grant in GrantPipe. Eligible expenses are those within the approved budget period, within approved cost categories, and not already linked to a prior paid request. The picker shows remaining eligible balances per category so staff can select the right amount without manual calculation."
  - q: How does the outstanding cash dashboard work?
    a: "The dashboard shows, per grant, the total awarded, total drawn or reimbursed (paid requests), total in-flight (submitted or approved requests), and the remaining undrawn balance. It updates when request statuses change. Finance staff can see the full picture across all active grants on one screen without rebuilding it from exported data."
  - q: Does GrantPipe enforce indirect cost rate rules automatically?
    a: "On Growth plans and up, yes. You define a negotiated indirect cost rate or select the 15 percent de minimis rate under 2 CFR 200.414, and GrantPipe applies the rate to eligible direct costs when calculating the indirect cost line on a reimbursement request."
  - q: What is the reimbursement evidence packet?
    a: "A Growth feature. When a reimbursement request reaches the paid status, GrantPipe can export a PDF packet that includes the request summary, the linked expense records, the supporting documentation attachments, and the indirect cost calculation. The packet is formatted for auditor or program officer review and follows the same structure across requests so reviewers know what to expect."
  - q: Does this feature replace our federal payment system like ASAP?
    a: "No. ASAP, HHS Payment Management System, and similar federal portals are the systems through which grantees actually receive cash from federal agencies. GrantPipe is the internal record-keeping and workflow system. Staff create a request in GrantPipe, get internal approval, then use the figures to submit the actual drawdown in the federal payment portal. The two systems serve different functions and both are needed."
relatedPages:
  - /glossary/drawdown/
  - /restricted-fund-tracking-software/
  - /for/finance-operations-staff/
  - /free/grant-spend-down-tracker
  - /resources/guides/grant-compliance-101-for-nonprofits
  - /product
  - /pricing
  - /features/grant-pipeline-management
  - /features/multi-entity-consolidation
proscons:
  - subject: GrantPipe drawdown and reimbursement tracking
    pros:
      - Request lifecycle from draft to paid in one workflow  -  no separate tracker
      - "Expense picker shows eligible, unlinked balances per cost category at the time of request"
      - Outstanding cash dashboard updates in real time as request statuses change
      - Growth indirect cost rules apply the negotiated or de minimis rate automatically
    cons:
      - "Does not replace the federal payment portal (ASAP, HHS PMS); staff still submit the actual drawdown there"
      - Expense eligibility depends on expenses being tagged to the grant in GrantPipe first
      - Reimbursement evidence packet is a Growth feature
answers:
  - q: Why does drawdown tracking matter for a mid-sized nonprofit?
    a: "At three to five active federal grants, the drawdown reconciliation is a monthly burden. Staff track which expenses have been drawn, which have not, and what balance each grant still holds  -  usually across spreadsheets that do not connect to the actual expense records. A system that links requests to posted expenses and shows the outstanding balance directly removes that reconciliation step and reduces the risk of over-drawing or under-drawing."
  - q: What is an over-draw and why does it create audit risk?
    a: "An over-draw occurs when a grantee requests more funds from a federal payment system than are supported by posted, allowable expenditures. Under 2 CFR 200.305, excess advance funds must be returned promptly. An uncorrected over-draw is a compliance finding. GrantPipe's expense picker shows the eligible balance before the request is submitted, reducing the chance of requesting more than the documented expenditures support."
  - q: How does reimbursement evidence differ from a standard funder report?
    a: "A funder report like the SF-425 is a periodic financial summary covering the full grant. A reimbursement evidence packet is request-specific  -  it documents the individual expenses, cost categories, and supporting files tied to one payment request. Auditors and program officers sometimes ask for the transaction-level support behind a drawdown, which the evidence packet provides without requiring staff to reassemble it from source files."
  - q: Can foundation grants use the same workflow as federal grants?
    a: "Yes. The request lifecycle  -  draft, submitted, approved, paid  -  applies to both federal and foundation grants. Foundation grants typically use reimbursement rather than advance payment, and they may not use indirect cost rates, but the workflow handles both patterns. The outstanding dashboard shows all active grants regardless of funder type."
pricingStats:
  - stat: 2 CFR 200.305 requires that federal advance payments be for the minimum amounts needed for immediate cash requirements and reconciled against actual expenditures within applicable timing standards
    source: "Code of Federal Regulations, 2 CFR Part 200  -  Uniform Administrative Requirements, Cost Principles, and Audit Requirements for Federal Awards"
    sourceUrl: "https://www.ecfr.gov/current/title-2/part-200/section-200.305"
  - stat: "The 2024 OMB Uniform Guidance revision raised the single audit threshold to $1,000,000 in federal expenditures, expanding the set of organizations that must demonstrate reliable financial management systems for federal award tracking"
    source: "2 CFR 200.501, OMB Uniform Guidance (effective October 2024)"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/section-200.501"
  - stat: GAO identified recurring deficiencies in grantee financial management controls  -  particularly in documentation of expenditures supporting drawdown requests  -  as a leading category of federal grant audit findings
    source: "U.S. Government Accountability Office, High-Risk Series 2024"
    sourceUrl: "https://www.gao.gov/high-risk"
tableData:
  name: Grant drawdown and reimbursement tracking capability comparison
  description: How GrantPipe models the drawdown and reimbursement lifecycle compared to spreadsheet and generalist approaches.
  columns:
    - Capability
    - Spreadsheet
    - Generalist CRM
    - GrantPipe
  rows:
    - - Request lifecycle tracking
      - Manual status column
      - Not supported
      - Draft to submitted to approved to paid
    - - Expense eligibility picker
      - Manual lookup
      - Not supported
      - Linked to posted grant expenses
    - - Outstanding balance dashboard
      - Manual calculation
      - Not supported
      - Live per-grant view
    - - Indirect cost rate rules
      - Manual formula
      - Not supported
      - Automated on Growth tier
    - - Reimbursement evidence packet
      - Manually assembled
      - Not supported
      - PDF export on Growth tier
    - - Multi-grant view
      - Separate tabs
      - Partial
      - Unified across all active grants
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/part-200/section-200.305"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/section-200.501"
  - "https://www.gao.gov/high-risk"
  - "https://www.fiscal.treasury.gov/asap/"
  - "https://www.fasb.org/page/PageContent?pageId=/projects/recentlycompleted/not-for-profit-financial-statements.html"
---

## The problem

Drawdowns and reimbursements create cash pressure when requests, spending, documentation, and approval status are tracked separately. Finance needs to know what can be requested now and what evidence is still missing.

## How GrantPipe solves it

GrantPipe connects drawdown requests and reimbursement status to grant budgets, spending, documents, and approvals. Finance can see what is ready to request and what still needs support.

Grant drawdown and reimbursement tracking in GrantPipe manages the complete payment request lifecycle - from creating a request against eligible expenses, through internal approval, to recording the cash receipt - and keeps a live outstanding balance view across all active grants. The goal is to eliminate the monthly reconciliation that finance staff currently perform across disconnected spreadsheets, expense records, and bank statements.

## TL;DR

- Growth includes the full request lifecycle (draft, submitted, approved, paid), expense eligibility picker, cash payment recording, and outstanding dashboard
- Growth includes indirect cost rate rule automation and reimbursement evidence packet PDF export
- Starter keeps basic grant and fund visibility with upgrade prompts for the full payment workflow
- GrantPipe is the internal workflow system; it does not replace the federal payment portal (ASAP, HHS PMS) where the actual funds are received
- Request types cover both advance payment (drawdown) and reimbursement depending on grant terms

## What this feature does

Grant payment tracking is the operating record for money that moves from an awarded grant into the organization's bank account. Every federal award and many foundation grants require a formal request process before funds are released. Without a system, that process lives across manual status columns, email threads, and a month-end reconciliation that rarely closes clean.

GrantPipe models each payment request as a discrete object with a status, a set of linked eligible expenses, and a cash receipt. The status moves through draft, submitted, approved, and paid. The outstanding dashboard aggregates the picture across all active grants so the finance lead can answer "what is still unpaid and what is pending approval" without rebuilding the answer from source data.

The expense picker is the core compliance safeguard. Before submitting a request, staff select the eligible expenses from those already tagged to the grant. The picker shows only expenses within the approved budget period, within approved cost categories, and not already associated with a prior paid request. This prevents requesting funds against the same expense twice - a common source of audit findings in spreadsheet-managed workflows.

## How it works

1. Create a payment request on the grant record - choose advance drawdown or reimbursement depending on the funder's payment method
2. Use the expense picker to select eligible posted expenses; the system shows available balances by cost category
3. Enter any indirect costs using the defined rate (Audit-Ready tier applies the rate automatically; Growth allows manual entry)
4. Submit the request for internal review and approval
5. Record the cash payment when funds arrive in the bank account
6. Review the outstanding balance dashboard to see what is drawn, what is in flight, and what remains undrawn across all active grants
7. For Audit-Ready teams: export the reimbursement evidence packet as a PDF when an auditor or program officer asks for transaction-level support

## Who it's for

Finance leads at $500K to $10M nonprofits who spend part of every month reconciling which expenses have been drawn, which are pending, and what cash is still outstanding across three to eight active federal or foundation grants. Development directors who get asked by a program officer for the current drawdown status and have to check a spreadsheet before answering. Executive directors who want to see what restricted cash is still owed to the organization without waiting for a monthly finance report.

## Why GrantPipe built it this way

The drawdown problem has two failure modes. The first is over-drawing - requesting more than documented expenses support, which creates a compliance finding and a required repayment. The second is under-drawing - leaving documented expenses unreimbursed until the grant period ends, which creates cash flow pressure and risks deobligation of funds.

Both failure modes trace to the same root cause: the expense records, the request history, and the outstanding balance are stored in different places. GrantPipe connects them in the same workflow so the expense picker can enforce eligible amounts at the point of request creation, and the outstanding dashboard can show the full picture without manual assembly.

The indirect cost feature addresses a specific compliance gap. Federal grantees with negotiated indirect cost rates under 2 CFR 200.414 are entitled to draw down those indirect costs alongside direct program expenses, but many mid-sized nonprofits either under-recover indirect costs or apply them inconsistently because the rate calculation is manual. The Audit-Ready tier automates the calculation so the rate is applied consistently on every request.

## What it replaces

- The monthly spreadsheet reconciliation comparing drawn amounts to expense records
- The manually assembled email chain tracking which payment requests are submitted, approved, or pending
- The end-of-period scramble to identify expenses that were never drawn and figure out whether it is too late to request them
- The two-day task of assembling expense documentation when an auditor or program officer asks for transaction-level support behind a drawdown
- The indirect cost calculation worksheet that someone rebuilds each time a new request is prepared

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [grant pipeline management](/features/grant-pipeline-management)
- [multi entity consolidation](/features/multi-entity-consolidation)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
