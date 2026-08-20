# PRD: Reimbursement Cash-Flow Radar

## Status

Shipped. The API, Cash workspace panel, and feature page are implemented, and
the web hook now records privacy-safe success/failure analytics without sending
grant names or free-form financial detail.

## Strategic thesis

Reimbursement grants create cash pressure after the expense is posted and before
the funder pays. GrantPipe already tracks grant expenses, payment requests,
approvals, and cash receipts. The radar turns those records into a worklist.

## Problem

Finance teams need to know:

- Which posted costs have not been requested yet.
- Which submitted requests need a funder follow-up.
- Which approved requests are still unpaid.
- Which grants create the largest cash gap.

Without this view, the answer lives in a spreadsheet.

## Target users

- Finance directors watching restricted cash.
- Grant accountants preparing requests.
- Executive directors watching cash timing.

## MVP scope

- Compute cash gaps from existing payment request records.
- Show posted reimbursable expenses that are not in an active request.
- Show submitted request dollars awaiting approval.
- Show approved request dollars still unpaid.
- Rank grants by total cash gap.
- Surface the top work items in the Cash workspace.

## Non-goals

- Direct submission to funder portals.
- Bank balance forecasting.
- New payment processing.

## Data model

No new table is required for the first slice. The radar reads:

- `expenses`
- `grants`
- `grant_payment_requests`
- `grant_payment_request_lines`
- `grant_payments`

## API

`GET /payments/cash-flow-radar`

The endpoint returns totals plus a per-grant worklist. It is scoped by `org_id`
and uses the existing `payments:view` permission and Growth plan gate.

## UX

The Cash workspace shows the radar above the request list. Users can see:

- Total cash gap.
- Not requested.
- Awaiting approval.
- Approved, unpaid.
- Top grant work items.

Each work item links to the grant.

## Acceptance criteria

- The radar excludes deleted grants, deleted expenses, deleted requests, and
  rejected requests from active claims.
- The radar never crosses organization boundaries.
- Approved outstanding cash is not multiplied by request line count.
- The web page shows loading, error, empty, and populated states.
- A marketing page exists at `/features/reimbursement-cash-flow-radar`.
