# Lead Magnet Quality Strategy - 2026-06-26

## Decision

GrantPipe now separates supported lead magnets from active public lead magnets.

- Supported slugs stay in `LEAD_MAGNET_SLUGS` so old signed links, R2 assets,
  Sequencer traits, analytics, and generated knowledge do not break.
- Active slugs live in `ACTIVE_LEAD_MAGNET_SLUGS`. These are the only lead
  magnets promoted as PDFs and listed on `/free`.
- Retired supported pages stay routable so older nurture emails, social posts,
  and source pages do not break before a replacement or redirect exists.

This trims public fat without creating dead links for people already in an
email or nurture flow.

## Active Library

The active set is focused on the work GrantPipe is built to solve:

- Grant compliance and audit prep
- Grant setup, closeout, reporting, and tracking
- Federal grant operations
- Restricted fund tracking and donor-to-grant reconciliation
- CRM migration, software cost, and board buy-in

The active set intentionally excludes broad donor-only and generic fundraising
resources from public promotion. Those resources can stay supported for
backwards compatibility, but they should be reframed before they return to
public promotion.

## Offer Strategy

TOFU pages should offer checks and assessments that help a visitor find the
problem quickly.

MOFU pages should offer calculators, worksheets, and trackers that help the
visitor price the cost of staying in spreadsheets or disconnected systems.

BOFU pages should offer migration maps, board memo templates, audit evidence
checklists, and grant tracking tools that create a clear reason to start a
GrantPipe trial.

Every lead magnet page should lead to one next step: use the resource, then try
the same workflow in GrantPipe.

## Mobile Readability

The public HTML page is the mobile-first reading experience. PDFs and XLSX files
remain delivery assets, but the on-page content must stay readable on a phone.
Tables in lead magnet pages now scroll horizontally instead of forcing the page
to overflow.

Future upgrades should make the most table-heavy resources interactive first:
scorecards as tap-friendly cards, checklists with progress, calculators with
mobile forms, and funder maps as filterable lists.

## Review Queue

Before a retired supported magnet returns to the active set, it must pass these
checks:

- It matches GrantPipe's ICP: mid-sized nonprofits managing grants, donors,
  restricted funds, compliance, or audit evidence.
- The name says the result clearly.
- The page gives enough value that a nonprofit operator would pay for it.
- The mobile page is readable before any PDF or XLSX download.
- The next step is obvious and tied to GrantPipe.
- The claims are source-backed and do not invent proof, numbers, or urgency.
