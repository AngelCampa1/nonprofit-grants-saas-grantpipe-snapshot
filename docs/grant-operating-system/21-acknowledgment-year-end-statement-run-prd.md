# Feature #14: Acknowledgment and Year-End Statement Run

Status: shipped. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 3 #14 and `docs/offers/MASTER-BUILD-ROADMAP.md` 2.6.

Shipped evidence: donation goods/services fields, acknowledgment letter generation, calendar-year donor statement run, quid-pro-quo deductible math, generated PDF artifact storage, included-donation receipt markers, donor communication-log tracking, Reports page controls, Growth+ entitlement gating, privacy-safe report analytics, and Sentry-covered route error handling. The shipped slice prepares downloadable statements; automated email or postal delivery remains outside this PRD.

## Problem

Donor receipts often happen one gift at a time. At year end, staff still need a
clean donor statement run that groups each donor's gifts, separates the value of
goods or services, and leaves a record that the statement was prepared.

For this slice, the goal is a reliable statement bundle from existing donation
records. The goal is not tax advice, a legal opinion, or a full email delivery
suite.

## Scope

1. Add fair market value fields to donation records.
2. Add a generated report type for donor year-end statements.
3. Add a report endpoint for a calendar-year statement run.
4. Group eligible donations by donor.
5. Show total gifts, goods or services value, and potential deductible amount.
6. Store the statement bundle as a generated report artifact.
7. Mark included donations as receipt sent.
8. Write one communication log entry per donor in the run.
9. Add a Reports page control for generating the run.
10. Add a public feature page.

## Non-goals

- Tax advice or legal advice.
- Automated statement emailing.
- Postal mail fulfillment.
- Delivery webhooks.
- Donor portal statement download.
- IRS form generation.
- Duplicate-proof provider retry handling.

Those can be added later after the statement bundle is stable.

## Data model

Donations gain two optional fields:

- `goods_services_value_cents`
- `goods_services_description`

Generated reports gain a new type:

- `donor_year_end_statement`

The first release uses the existing generated report artifact flow for PDF
storage and the existing communication log for donor history.

## API

Add:

- `POST /api/compliance/reports/donor-year-end-statements`

Request:

- `year`: calendar year, 2000 to 2100
- `deliveryMode`: `download`
- `minimumAmountCents`: optional, defaults to 0
- `title`: optional

The route must:

- require compliance view, reports view, and donor view permissions
- require the compliance report pack plan entitlement
- resolve only non-deleted donations in the active org
- use Jan 1 through Dec 31 UTC for the selected year
- group donations by donor contact
- calculate potential deductible amount as gift amount minus goods or services value
- never calculate a negative deductible amount
- store a report artifact
- mark included donations as receipt sent
- log statement preparation on each donor communication timeline

## Web

Add a Year-end statements panel to Reports.

The panel should:

- default to the current calendar year
- allow a year from 2000 to 2100
- generate a downloadable statement bundle
- navigate to the generated report detail page
- show inline errors if generation fails
- stay disabled for plans without the compliance report pack

## Marketing

Add `/features/acknowledgment-year-end-statement-run`.

The page must:

- say this creates a donor statement bundle from saved donations
- say it tracks gift totals, goods or services value, and potential deductible amount
- say statement preparation is logged on donor timelines
- avoid tax advice claims
- avoid claims about automated email or mail delivery

## Acceptance criteria

- Growth or higher orgs can generate a donor year-end statement run.
- Starter orgs receive an upgrade response.
- The route rejects invalid years.
- The service groups donations by donor.
- Goods or services value is subtracted from the gift amount.
- Deductible totals never go below zero.
- Included donations are marked receipt sent.
- One communication log row is written per donor in the run.
- The Reports page can trigger the run and navigate to the artifact.
- The public feature page exists and passes site contracts.
