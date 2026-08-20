# PRD: Drawdowns, Reimbursements, and Payments

## Status

Draft

## Strategic Thesis

Grant-funded nonprofits care deeply about cash timing. It is not enough to know
what has been spent. GrantPipe needs to answer what can be drawn or invoiced,
what has been submitted, what has been approved, what has been reimbursed, and
what is still outstanding.

## Problem

GrantPipe currently tracks expenses and grant spenddown, but it does not yet
model reimbursement, drawdown, billing, or payment workflows. That leaves a
critical operational gap:

- Which expenses are eligible for reimbursement?
- Which indirect costs can be included?
- What reimbursement request has been submitted?
- What did the funder approve or reject?
- Which payments have been received?
- How much cash is outstanding by grant?

Without this, finance teams continue to run reimbursement trackers in
spreadsheets and accounting systems.

## Target Users

- Finance directors managing grant cash flow.
- Grant accountants preparing reimbursement requests.
- Grant managers monitoring funder payments.
- Executive directors watching receivables and cash risk.

## Current GrantPipe Baseline

GrantPipe has expenses, grants, funds, accounting journal entries, reporting
requirements, documents, and spenddown visibility. It also has the foundation to
connect reimbursements to accounting deposits or receivables. The missing
product object is the reimbursement or drawdown request lifecycle.

## Market Signal

Sage Intacct and Blackbaud both emphasize reimbursement, billing, eligible
charges, indirect costs, and grant accounting controls. Instrumentl Spenddown
includes payments and spenddown views. These are strong signals that
post-award cash workflows are core operating-system territory.

## Goals

- Identify reimbursable or drawable expenses.
- Create drawdown, reimbursement, invoice, or payment request records.
- Track submitted, approved, rejected, paid, and outstanding amounts.
- Connect requests to expenses, budget lines, restrictions, and accounting
  entries.
- Show cash lag and reimbursement risk by grant.

## Non-Goals

- Direct submission to every funder portal in the first release.
- Replacing invoicing modules in accounting systems.
- Automating complex indirect cost negotiation.

## MVP Scope

- Request type: drawdown, reimbursement, invoice, advance liquidation, other.
- Request status: draft, submitted, partially approved, approved, rejected,
  paid, closed.
- Eligible expense picker filtered by grant, budget line, period, and
  reimbursement status.
- Request line items with direct costs, indirect costs, adjustments, and notes.
- Payment records with received date, amount, reference number, and accounting
  link.
- Outstanding reimbursement dashboard.
- Exportable reimbursement packet with selected expenses and evidence.

## Functional Requirements

- Users can create a reimbursement or drawdown request from a grant.
- Users can select eligible expenses and exclude ineligible expenses.
- Users can include indirect cost lines when configured for the grant.
- Users can attach supporting evidence to request lines.
- Users can mark requests submitted, approved, rejected, paid, and closed.
- Users can record partial approvals and partial payments.
- Users can link received payments to accounting deposits or journal entries.
- The system prevents the same expense from being fully reimbursed twice unless
  an admin explicitly overrides with an audit reason.

## Data Model Implications

- `grant_payment_requests`
- `grant_payment_request_lines`
- `grant_payment_request_adjustments`
- `grant_payments`
- Optional `grant_indirect_cost_rules`

Request lines should link to expenses, budget lines, programs, restriction
terms, documents, and accounting lines where applicable.

## UX Surfaces

- Payments or Reimbursements tab on grant detail.
- Create request flow from eligible expenses.
- Cash dashboard showing outstanding, submitted, approved, paid, and overdue.
- Request detail page with evidence bundle and status history.
- Payment matching workflow connected to accounting.

## Permissions And Audit

- Admin and editor can create and update requests.
- Viewer can read requests.
- Auditor can read requests, support, approvals, payments, and accounting
  evidence.
- Status changes, selected expenses, exclusions, overrides, and payment links
  must be logged.

## Success Metrics

- Percentage of grant expenses classified as reimbursable or not reimbursable.
- Dollar value of reimbursement requests generated in GrantPipe.
- Outstanding reimbursement amount tracked.
- Average time from expense to submitted request.
- Reduction in duplicate or missed reimbursement issues.

## Risks And Open Questions

- Drawdown and reimbursement vocabulary varies across funders.
- Eligibility depends on budget rules, restrictions, dates, documentation, and
  cost principles. MVP should support human review and clear warnings.
- Accounting sync needs idempotent matching before two-way posting.

## Launch Slice

Ship reimbursement request creation, eligible expense selection, request status,
payment recording, and outstanding dashboard. Add indirect cost automation and
accounting posting after the first workflow is stable.
