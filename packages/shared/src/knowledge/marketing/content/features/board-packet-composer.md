---
title: Build the board packet from live records
entitlement: hasComplianceReportPack
description: "Create a board packet from live records. Pull giving, grants, fund balances, and due dates. Pick the sections, then make the PDF."
seoTitle: Board Packet Composer for Nonprofits
seoDescription: "Create a board packet from live fundraising, grant, fund balance, and deadline data. Pick the sections, then generate the PDF."
targetKeyword: board packet composer
publishedAt: "2026-06-17"
updatedAt: "2026-06-17"
lastReviewedAt: "2026-06-17"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: grant-management
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - board-reporting
  - grant-management
  - compliance
bluf: "Board Packet Composer turns live GrantPipe records into a board-ready PDF. Pick the date. Pick the sections. GrantPipe pulls giving, grants, fund balances, and due dates."
faqs:
  - q: What goes into the board packet?
    a: "The default packet has a top view, giving totals, grant totals, and due dates. It also has fund balances. You can remove sections before you make the PDF."
  - q: Does the packet use live data?
    a: "Yes. The packet reads donor giving, grants, funds, expenses, grant due dates, and report dates. Staff do not paste numbers into a slide deck."
  - q: Can I make a packet for a specific meeting?
    a: "Yes. Add the board meeting date. Pick one-time, monthly, or quarterly. GrantPipe stores those choices with the report."
  - q: Is this a board portal?
    a: "No. Board Packet Composer makes the PDF packet. Board login is a separate portal feature. Use roles when a board member needs app access."
relatedPages:
  - /product
  - /pricing
  - /features/donor-retention-reporting
  - /features/restricted-fund-tracking
  - /features/compliance-deadline-radar
proscons:
  - subject: Board Packet Composer
    pros:
      - Pulls packet sections from live GrantPipe records
      - Lets staff choose the meeting date, cadence, and sections
      - Keeps the generated PDF in the same report library as other compliance outputs
      - Shows fund balances from grant money set aside and expenses
    cons:
      - It makes a PDF packet, not a board member login
      - It does not replace CPA review or board governance judgment
      - It does not email or auto-schedule packet delivery in this release
answers:
  - q: What is Board Packet Composer?
    a: "Board Packet Composer makes a board packet PDF from live GrantPipe records. Staff pick the year, date, cadence, and sections."
  - q: Why does board reporting need live records?
    a: "Board members need current money and work data. A copied slide can drift from the donor report. It can drift from the grant list too. A packet built from records cuts that drift."
  - q: Which GrantPipe records does the packet read?
    a: "The packet reads gifts, grants, funds, expenses, and due dates. The report stores the chosen sections in metadata."
sourceUrls:
  - "https://www.councilofnonprofits.org/running-nonprofit/governance-leadership/financial-literacy-nonprofit-boards"
  - "https://boardsource.org/fundamental-topics-of-nonprofit-board-service/nonprofit-board-responsibilities/"
tableData:
  name: Board packet sections
  description: The default sections Board Packet Composer can include in a generated PDF.
  columns:
    - Section
    - Data source
    - Why it matters
  rows:
    - - Executive snapshot
      - Fiscal year, meeting date, cadence, fundraising, grants, and funds
      - Gives the board one opening view of the period
    - - Fundraising
      - Donation and donor stats
      - Shows giving, donor count, new donors, and retention
    - - Grant pipeline
      - Live grant records
      - Shows open grant count and grant value
    - - Fund balances
      - Fund allocations and expenses
      - Shows allocated, spent, and current balance by fund
    - - Compliance deadlines
      - Grant dates and open reporting requirements
      - Shows the dates staff need to watch before the next meeting
---

## The problem

Board prep should not start with a blank slide deck.

Yet that is how many teams work. A finance lead pulls fund balances. A grants
manager pulls grant dates. A giving lead sends donor totals. Someone pastes it
all into one packet.

That packet can go stale fast. One gift changes the fundraising total. One
posted expense changes a fund balance. One grant report moves from pending to
overdue. Now the board packet and the product record disagree.

The National Council of Nonprofits says boards need current financial
information to make good decisions. BoardSource also frames financial oversight
as part of a board's fiduciary role. GrantPipe cannot make those choices for a
board. It can make the packet easier to trust.

## How GrantPipe solves it

Board Packet Composer creates a board-ready PDF from GrantPipe records. Open
Reports. Choose the board fiscal year. Add a meeting date. Pick a cadence.
Choose the sections you want.

GrantPipe then builds the packet from live data. Fundraising totals come from
donor and donation records. Grant pipeline totals come from grant records. Fund
balances come from fund allocations and expenses. Deadline rows come from grant
application dates and open reporting requirements.

The PDF sits in the same report library as audit and IRS 990 prep. It also sits
with grant compliance and gift letters. Staff can preview it. They can download
it from the report list.

## What the packet includes

The default packet includes five sections:

- Executive snapshot
- Fundraising
- Grant pipeline
- Fund balances
- Compliance deadlines

You can remove a section before you make the PDF. A finance packet may keep
fund balances and due dates. A giving-heavy board meeting may keep fundraising
and pipeline.

GrantPipe saves the selected sections in report metadata. It also saves the
meeting date and cadence. Staff can see what the packet was meant to cover.

## How it works

1. Open Reports
2. Find Board Packet Composer
3. Enter the fiscal year
4. Add the meeting date
5. Pick one-time, monthly, or quarterly
6. Check the sections you want
7. Generate the PDF
8. Preview or download it from the report list

The composer does not need a separate setup step. It reads from records your
team already keeps in GrantPipe.

## Who it's for

This is for leaders and finance leads. It is also for grants staff who prepare
board packets.

The director wants one clean view before the meeting. The finance lead wants
fund balances to match the ledger. The grants manager wants open reports and
grant dates visible.

Board Packet Composer helps those roles start from one source. It is not legal
or accounting advice. It makes the source data easier to gather and review.

## What it does not do

Board Packet Composer is not a board portal. It creates the PDF packet. If a
board member needs app access, use roles or scoped reviewer access.

It also does not email the packet or auto-schedule delivery in this release.
Staff still review the PDF before they share it. That review matters. The
packet can carry data forward, but the team still owns the message and the
governance context.

## Why GrantPipe built it this way

Board reporting is a monthly ritual. It should reuse the same records staff
trust during the rest of the month.

That is why the packet reads from donor history. It also reads grants, funds,
expenses, and due dates. Staff do not retype the same numbers.

The section picker keeps the output focused. A board meeting does not need every
work detail. It needs the few views that help people ask the next question.

## What it replaces

- The copied board slide that no longer matches the app
- The spreadsheet of fund balances sent around before each meeting
- The separate donor report pasted into a packet by hand
- The grant deadline list that lives outside the board materials
- The late search for the number behind a board question

For retention numbers that feed the packet, see [Donor Retention Reporting](/features/donor-retention-reporting). For fund balance detail, see [Restricted Fund Tracking](/features/restricted-fund-tracking). For the deadline list behind the packet, see [Compliance Deadline Radar](/features/compliance-deadline-radar).

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [donor retention reporting](/features/donor-retention-reporting)
- [restricted fund tracking](/features/restricted-fund-tracking)
- [compliance deadline radar](/features/compliance-deadline-radar)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
