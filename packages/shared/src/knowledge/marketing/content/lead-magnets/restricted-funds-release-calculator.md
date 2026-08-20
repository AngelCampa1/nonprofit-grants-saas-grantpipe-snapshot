---
title: "Restricted Funds Release Calculator"
description: "A worksheet for calculating when and how restrictions are released: fund name, restriction type, release conditions, eligible expenses to date, amount releasable, documentation required, and journal entry reference - with ASC 958 release-from-restriction guidance."
seoTitle: "Restricted Funds Release Calculator"
seoDescription: "Free restricted funds release calculator: release conditions, eligible expenses, amount releasable, documentation required, and ASC 958."
targetKeyword: "restricted funds release calculator"
publishedAt: "2026-04-26"
updatedAt: "2026-04-26"
verifiedAt: "2026-05-24"
lastReviewedAt: "2026-05-24"
bluf: "Release-from-restriction is the accounting event that moves restricted funds to unrestricted net assets - but only when the donor's conditions have been satisfied and documented. This worksheet helps finance staff calculate the releasable amount, identify the required documentation, and prepare the journal entry reference for each restricted fund."
sourceUrls:
  - "https://storage.fasb.org/ASU%202016-14.pdf"
freePreviewSections: 2
deliverableType: pdf
deliverableUrl: "/downloads/restricted-funds-release-calculator.pdf"
relatedPages:
  - "/glossary/restricted-fund/"
  - "/glossary/fund-accounting/"
  - "/glossary/net-assets-with-donor-restrictions/"
  - "/restricted-fund-tracking-software/"
buyerStage: "mofu"
faqs:
  - q: "What is release-from-restriction?"
    a: "The accounting event under FASB ASC 958 where net assets with donor restrictions are reclassified to net assets without donor restrictions because the donor's conditions have been satisfied. It is recorded as 'net assets released from restrictions' on the statement of activities - a decrease in restricted net assets and an equal increase in unrestricted net assets."
  - q: "When is a restriction released?"
    a: "Purpose restrictions are released when qualifying expenditures are incurred for the specified use. Time restrictions are released when the required time period elapses or the specified event occurs. Perpetual restrictions on principal are never released - only investment income may be released."
  - q: "What documentation is required to release a restriction?"
    a: "The documentation connecting the release event to the donor's conditions: for purpose restrictions, expenditure records showing the costs incurred for the specified purpose; for time restrictions, confirmation that the required period has elapsed or the event has occurred. The journal entry should reference this documentation."
tags:
  - "release from restriction"
  - "restricted funds"
  - "ASC 958"
leadMagnetSlug: "restricted-funds-release-calculator"
schema: "Article"
---

## What This Calculator Does

The restricted funds release calculator provides a working document for determining when and by how much a restricted fund can be released to unrestricted net assets. It is designed for use at month-end close and at year-end audit preparation.

The calculator does three things: identifies which funds are eligible for release in the current period, calculates the releasable amount based on qualifying expenditures, and documents the release event for the accounting records and audit file.

---

## ASC 958 Release-from-Restriction Rules

Before using the calculator, understand the three-part rule that governs when restrictions are released.

**Purpose restrictions** are released when the organization incurs qualifying expenditures for the specified purpose. The release amount equals the expenditures that satisfy the restriction - not the total fund balance, and not a lump sum at year-end, but the amount corresponding to each batch of qualifying expenses as they are incurred.

**Time restrictions** are released when the required time condition is met: when a pledge installment becomes due, when a specified date arrives, or when a specified event occurs. The release amount equals the amount of the restriction that is now freed from the time condition.

**Perpetual restrictions** on principal are never released. Investment income generated from permanently restricted endowment principal is released according to the organization's spending policy and the donor's stated purpose for the income.

A common error is releasing the full fund balance at year-end regardless of when conditions were satisfied. The correct approach is to release as qualifying expenses are incurred - monthly, if the fund is active and expenses are posting regularly.

---

## The Calculator Structure

The calculator is organized with one row per restricted fund. For each fund:

**Fund Name and Funder** - Match the names used in the restricted fund tracking spreadsheet and the accounting system.

**Restriction Type** - Purpose, Time, or Perpetual. This determines the release trigger.

**Release Conditions** - Copied verbatim from the grant agreement or donor correspondence. "Restricted to workforce development training activities for unemployed adults." "Pledge installment due March 1, 2027." "Endowment principal to be held in perpetuity; income released for general scholarship support."

**Fund Balance at Period Start** - The restricted fund balance at the beginning of the current period, from the prior period's reconciled balance.

**New Receipts This Period** - Any new restricted receipts posted to this fund during the current period.

**Eligible Expenses This Period** - Expenses incurred during the period that satisfy the restriction conditions. For purpose restrictions, this is the expenses charged to the fund that are for the approved purpose. For time restrictions, this is zero (time restrictions release automatically; see below). For endowments, this is zero for the principal calculation.

**Calculation: Amount Releasable**

- Purpose restriction: Amount releasable = Eligible Expenses This Period (expenses drive the release, dollar for dollar)
- Time restriction: Amount releasable = Amount of the restriction that expires in the current period (see Time Restriction Release section below)
- Perpetual restriction: Amount releasable = $0 for principal; calculate income release separately using the endowment spending policy

**Fund Balance at Period End** - Fund Balance at Period Start + New Receipts ’ Amount Releasable

**Documentation Required** - What must be in the file to support this release:

- Purpose restriction: Itemized list of qualifying expenses (GL detail report by fund code for the period), with a note confirming each expense is within the restriction scope
- Time restriction: Confirmation of date or event satisfaction (pledge letter showing installment date, or documentation of event occurrence)
- Perpetual: Annual endowment spending policy calculation

**Journal Entry Reference** - The journal entry number or reference for the release-from-restriction entry in the accounting system. The journal entry should debit "Net assets with donor restrictions" and credit "Net assets without donor restrictions" for the releasable amount, with the documentation reference in the entry memo.

---

## Purpose Restriction Release Process

For grants with purpose restrictions, the release happens as expenses are incurred. Here is the step-by-step:

**Step 1: Confirm the expense is qualifying**

Before releasing, confirm that each expense charged to the restricted fund during the period is within the scope of the restriction. An expense is qualifying if it was incurred for the specified purpose and is allowable under the grant agreement's cost principles.

An expense is not qualifying if:

- It was for a purpose not covered by the restriction (even if the expense benefited the organization generally)
- It was coded to the restricted fund in error (wrong fund code assigned during payroll processing or AP entry)
- It was for a time period outside the grant's award period

**Step 2: Calculate the release amount**

Sum the qualifying expenses for the period. This is the releasable amount. It equals what was actually spent on the restriction's purpose - no more, no less.

**Step 3: Record the journal entry**

The release entry:

- Debit: Net Assets with Donor Restrictions - [Fund Name]
- Credit: Net Assets without Donor Restrictions - Released from Restrictions
- Amount: Total qualifying expenses for the period
- Memo: "Release from restriction - [Fund Name] - qualifying expenses [date range] - see GL Fund Code [XXX] expenditure report"

**Step 4: Update the restricted fund balance**

After the journal entry, the fund balance decreases by the release amount. The remaining restricted balance is the starting balance minus all releases to date.

---

## Time Restriction Release Process

Time restrictions release automatically when the condition is met - no qualifying expense is required.

For pledge installments:

- The time restriction releases when the pledge installment becomes due
- Record the release entry on the date the installment becomes due (not the date the cash arrives, if those differ)
- Documentation: the pledge agreement showing the installment schedule and the date the installment became due

For future-dated grants:

- Some grants specify that funds may not be used until a future date
- The restriction releases on that date
- Documentation: the grant agreement specifying the date restriction and confirmation of the current date

---

## Perpetual Restriction and Endowment Income Release

For endowments with perpetual restrictions on principal:

The principal never releases. The income earned on the principal may be released according to:

1. The spending policy (commonly 4-5% of the three-year average fund value)
2. The donor's stated purpose for the income (may be restricted to a specific program or unrestricted)

Use a separate endowment spending calculation worksheet to determine the annual distribution amount. The release entry for endowment income:

- Debit: Net Assets with Donor Restrictions - [Endowment Fund Name] - Income
- Credit: Net Assets without Donor Restrictions - Released from Restrictions
- Amount: Annual spending policy distribution
- Memo: "Endowment income release - [Fund Name] - FY[XX] spending policy distribution"

---

## Year-End Audit Preparation

At year-end, the release calculator becomes a key audit documentation document. The auditor will verify that:

1. Every release was supported by qualifying expenditures (for purpose restrictions) or documented time/event conditions (for time restrictions)
2. Releases were recorded in the correct period
3. The restricted fund balances at year-end reflect only amounts that have not yet been released
4. The journal entry trail connects releases to the supporting documentation

Assemble the following for each released fund:

- The grant agreement or donor correspondence specifying the restriction
- The GL expenditure report for the period showing qualifying expenses
- The journal entry for the release
- A copy of this calculator showing the calculation

This package is the release-from-restriction audit file. It demonstrates that the organization managed restricted funds correctly throughout the year - not just that the year-end balance is correct.
