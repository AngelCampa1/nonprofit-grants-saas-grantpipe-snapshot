# Feature #11: Board Packet Composer

Status: in build. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 3 #11.

## Problem

GrantPipe can already generate a single board report. That does not match the
monthly work most teams do.

Board prep pulls from several live records: fundraising totals, grant pipeline,
restricted fund balances, and compliance dates. When staff copy those numbers
into slides by hand, the packet goes stale before the meeting starts.

## Scope

Build on the existing generated report workflow.

1. Rename the in-app board report surface to Board Packet Composer.
2. Let staff choose a fiscal year, meeting date, cadence, and packet sections.
3. Support section choices for executive snapshot, fundraising, grant pipeline,
   fund balances, and compliance deadlines.
4. Pull fundraising totals from live donor and donation stats.
5. Pull grant pipeline totals from live grant records.
6. Pull fund balances from live fund allocations and expenses.
7. Pull compliance deadline rows from grant application deadlines and open
   reporting requirements.
8. Store the selected composer options in report metadata.
9. Keep the generated artifact in the same report library as audit, 990,
   compliance, and acknowledgment outputs.
10. Market the feature as a public feature page.

## Non-goals

- A board member login. That belongs to Board Member Portal.
- Automatic email delivery.
- Legal or accounting advice.
- Auto-submission of reports to a funder, auditor, or board system.
- A custom slide designer.

## Data model

No new tables are required for this slice.

The composer stores its choices in `generated_reports.metadata.composer`:

- `meetingDate`
- `cadence`
- `sections`

The generated PDF remains a `generated_reports` row with `type = "board"` and
`format = "pdf"`.

## API

Extend the existing board report endpoint:

- `POST /compliance/reports/board`

The request accepts:

- `fiscalYear`
- `title`
- `meetingDate`
- `cadence`
- `sections`

Default behavior should still generate a useful board packet when only
`fiscalYear` is supplied. Empty section arrays and unknown section values are
invalid.

## Web

The `/reports` page should show Board Packet Composer in the reporting grid.

The card must include:

- Fiscal year input.
- Meeting date input.
- Cadence selector.
- Section checkboxes.
- Disabled state when fiscal year or section selection is missing.
- Existing generated artifact list and download behavior.

## Acceptance criteria

- Staff can generate a board packet with all default sections.
- Staff can remove any optional section before generation.
- The generated preview includes selected section headings only.
- Fund balance rows show allocated, spent, and current balance values from live
  fund data.
- Compliance deadline rows show open grant dates and reporting requirements.
- Report metadata stores cadence, meeting date, and section choices.
- Existing report artifact list, preview, and download flows still work.
- A marketing page exists at `/features/board-packet-composer`.
- The feature is linked from the product capability map.
