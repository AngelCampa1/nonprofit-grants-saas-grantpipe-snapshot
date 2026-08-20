---
title: Track Multi-Year Pledges Without Booking Revenue Twice
entitlement: hasPledgeTracker
description: "Track multi-year donor pledges. GrantPipe posts entries, ages installments, and shows what is due."
seoTitle: Multi-Year Pledge Tracker for Nonprofits
seoDescription: "Track multi-year donor pledges in GrantPipe. We post each entry and age every installment. You can see what is due and avoid booking a gift twice."
targetKeyword: nonprofit pledge tracker
publishedAt: "2026-06-16"
updatedAt: "2026-06-16"
lastReviewedAt: "2026-06-16"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: donor-operations
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: grant-compliance-checklist
targetPersona:
  - executive-director
  - development-director
tags:
  - feature
  - donor-management
  - pledges
  - asc-958
  - present-value
  - fundraising
bluf: "Pledge Tracker records multi-year donor promises. It posts the entries ASC 958-605 requires. It discounts future installments to present value. It shows due and overdue balances. Conditional promises wait until the barrier is cleared. It does not collect donor payments."
faqs:
  - q: What is present-value discounting for pledges?
    a: "A donor promises $10,000 per year for three years. The money due next year is worth close to $10,000 today. The money due in year three is worth less, because you cannot use it yet. ASC 958-605 requires nonprofits to book the promise at what the future payments are worth today, not the full $30,000 face amount. GrantPipe does the math at pledge date, locks the discount rate, and posts the right entry automatically."
  - q: What journal entries does GrantPipe post?
    a: "At pledge date, GrantPipe debits Pledges Receivable for the full face amount, credits Contribution Revenue for the present value, and credits a Discount on Pledges Receivable contra account for the difference. When an installment is paid, GrantPipe debits Cash and credits Pledges Receivable. It also unwinds the discount (accretion) through the payment date and credits that amount to Contribution Revenue. No revenue is double-counted."
  - q: What is a conditional pledge?
    a: "A conditional pledge has a barrier the donor must clear before the promise is binding, and a right of return if the barrier is not cleared. ASC 958-605 says you cannot book conditional promises as revenue. GrantPipe stores them with a conditional flag and posts no journal entries. When the barrier clears, you promote the pledge to active and recognition fires."
  - q: What happens when a pledge goes overdue?
    a: "GrantPipe ages each installment from the due date. Past due pledges sit in day buckets. The buckets are 1 to 30, 31 to 60, and 61 to 90. There is also a 90 plus bucket. The pledge list shows what is due and overdue."
  - q: Which plan includes the Pledge Tracker?
    a: "Pledge Tracker is on Growth and higher plans. Starter does not include this feature."
  - q: Does GrantPipe collect payments from donors?
    a: "No. Pledge Tracker records what donors owe and paid. It does not collect donor payments."
relatedPages:
  - /product
  - /pricing
  - /features/restricted-fund-tracking
  - /features/donor-retention-reporting
  - /features/grant-budget-sentinel
proscons:
  - subject: Pledge Tracker
    pros:
      - Posts ASC 958-605 recognition, accretion, and payment entries automatically
      - Discounts future installments to present value at pledge date and locks the rate
      - Ages installments into five buckets so your team can see what is due
      - Holds conditional pledges with no journal entries until the barrier is cleared
      - Allows you to estimate and post an allowance for pledges you do not expect to collect
    cons:
      - Does not collect payments from donors directly
      - Discount rate is locked at pledge date and not re-measured later
      - Accretion is posted as a catch-up at payment time, not automatically each month
      - Gated to Growth plan and above
answers:
  - q: What is ASC 958-605?
    a: "It is the FASB accounting standard for nonprofit revenue recognition. It covers when a nonprofit can record a promise to give as revenue and how to measure that revenue. For multi-year pledges, it requires discounting future payments to present value."
  - q: How does GrantPipe compute present value for a pledge?
    a: "GrantPipe takes each installment due more than one year from pledge date and divides it by one plus the discount rate, raised to the power of the number of years until payment. Installments due within one year are used at face value. The sum of all discounted installments is the present value. The difference between the face total and the present value is recorded as a discount contra."
  - q: What is pledge accretion?
    a: "Over time, the present value of a pledge grows toward the face amount as the due dates get closer. That growth is called accretion. It is recorded as additional contribution revenue using the effective-interest method. GrantPipe computes accretion through the payment date each time an installment is paid."
pricingStats:
  - stat: ASC 958-605 requires nonprofits to recognize unconditional promises to give as revenue in the period the promise is received, measured at present value for multi-year commitments
    source: FASB ASC 958-605
    sourceUrl: "https://asc.fasb.org/958-605"
sourceUrls:
  - "https://asc.fasb.org/958-605"
  - "https://asc.fasb.org/958-310"
tableData:
  name: Pledge installment aging buckets
  description: How GrantPipe classifies each installment relative to its due date.
  columns:
    - Bucket
    - Days past due
    - Follow-up view
  rows:
    - - Current
      - Not yet due
      - Shows in the pledge list
    - - 1 to 30
      - 1 to 30 days overdue
      - Shows as overdue
    - - 31 to 60
      - 31 to 60 days overdue
      - Shows as overdue
    - - 61 to 90
      - 61 to 90 days overdue
      - Shows as overdue
    - - 90 plus
      - More than 90 days overdue
      - Shows as overdue
---

## The problem

A donor signs a pledge card. They will give $5,000 a year for five years. You record $25,000 as revenue this year. Your auditor marks up the financial statements. You restate.

This is the most common pledge accounting error at nonprofits that track pledges in spreadsheets or donor databases not built for accounting. The money due in year five is not worth $5,000 today. ASC 958-605 says to book the present value, not the face amount. And it says not to book anything at all if the promise is conditional.

No spreadsheet does this math. Most donor databases do not either.

## How GrantPipe solves it

GrantPipe computes present value at the moment you enter the pledge. It discounts each installment due more than one year out by the rate you set, locks that rate, and posts the recognition entry automatically. Future installments stay on the books as receivables. Each time a payment comes in, GrantPipe posts the cash receipt and unwinds the remaining discount through that date.

The result is a clean ledger that matches what ASC 958-605 requires, with no manual journal entries and no end-of-year surprises.

## What the Pledge Tracker does

Pledge Tracker has five parts.

**Recognition.** When you create a pledge, you enter the donor, the installment schedule, a discount rate, and whether the promise is unconditional. GrantPipe computes present value, posts the recognition entry, and creates an installment schedule. The discount contra sits on the balance sheet next to Pledges Receivable until it unwinds.

**Aging.** Every installment sits in a due bucket. The current bucket is for items not yet due. Past due buckets are 1 to 30, 31 to 60, and 61 to 90. There is also a more than 90 days bucket. The aging view shows all pledges. You can filter by status.

**Follow-up view.** GrantPipe shows due dates, overdue status, and outstanding balances. Your team can see what needs follow-up from the pledge list.

**Payments.** When a payment arrives, you record it against the installment. GrantPipe posts cash in, pledges receivable out, and the accretion for the period since the last payment. Revenue only hits once, at pledge date. Payments reduce the receivable.

**Allowance and write-off.** If you do not expect to collect a pledge, you post an allowance estimate. If it becomes uncollectible, you write it off. GrantPipe posts the expense and closes the receivable.

## Journal entries GrantPipe posts

At pledge date:

- Debit Pledges Receivable for the full face amount
- Credit Discount on Pledges Receivable for the difference between face and present value
- Credit Contribution Revenue for the present value

At payment date:

- Debit Cash for the payment amount
- Credit Pledges Receivable for the payment amount
- Debit Discount on Pledges Receivable for the accretion since the last payment
- Credit Contribution Revenue for that accretion amount

For an allowance estimate:

- Debit Uncollectible Pledge Expense
- Credit Allowance for Uncollectible Pledges

For a write-off:

- Debit the Allowance against the receivable to close both

GrantPipe uses your existing chart of accounts for Cash, Pledges Receivable, and Contribution Revenue. It adds three accounts: Discount on Pledges Receivable, Allowance for Uncollectible Pledges, and Uncollectible Pledge Expense.

## Conditional promises

Some donors make promises with strings attached. The gift only happens if the building gets named. The pledge only stands if the campaign hits its goal. ASC 958-605 calls these conditional promises. They are not revenue yet because the barrier has not been cleared.

GrantPipe stores conditional pledges with a flag and posts no journal entries. The record is there. The receivable is not. When the condition is met, you mark it unconditional and recognition fires.

This is the right treatment under ASC 958-605. Booking a conditional promise as revenue early is an error your auditor will find.

## The pledge list view

The main pledge list shows all active pledges with an aging summary across the top: total face value, total present value carrying amount, current balance, and amounts in each overdue bucket.

Each row shows the donor name, pledge date, face amount, present value, carrying value today, next installment due, and days past due if overdue. Click any row to open the pledge detail with the full installment schedule, payment history, and amortization table.

Filters let you narrow the list by pledge status.

## How it works step by step

1. You enter a pledge: donor, installment schedule, discount rate, unconditional or conditional.
2. GrantPipe computes present value and posts the recognition entry.
3. Installments appear in the aging view sorted by due date.
4. The pledge list shows what is due, overdue, and still outstanding.
5. A payment arrives. You record it. GrantPipe posts cash and closes the receivable, plus accretion.
6. If a pledge looks doubtful, you post an allowance estimate.
7. If it is uncollectible, you write it off. GrantPipe closes the receivable and the contra.

## Who it is for

Finance leads who close the books. They need the receivable and the discount contra to match the amortization schedule. Pledge Tracker gives them both.

Development directors who track major gifts. They need to see which installments are coming due and which are past due. The aging view gives them that without a spreadsheet.

Executive directors who sign the audit. They need to know the pledge portfolio is on the books correctly. Correct recognition at pledge date, no double-counting at payment, allowance posted when needed.

## What this is not

Pledge Tracker does not collect payments from donors. It does not send invoices or reminders to donors. It records what is owed and what has been paid on the nonprofit's side.

The discount rate is locked at pledge date. GrantPipe does not re-measure it later.

Accretion posts as a catch-up when a payment is recorded, not on a monthly cron.

## What it replaces

The pledge spreadsheet that lives outside your accounting system. The manual journal entries your accountant posts at year-end to get the discount right. The audit finding that says your pledge receivable balance does not reconcile to the amortization schedule.

For donor retention and major gift tracking, see [donor retention reporting](/features/donor-retention-reporting). For restricted fund tracking tied to pledge revenue, see [restricted fund tracking](/features/restricted-fund-tracking).

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

See [restricted fund tracking](/features/restricted-fund-tracking). See [donor retention reporting](/features/donor-retention-reporting). See [grant budget sentinel](/features/grant-budget-sentinel). See the [product overview](/product). See [pricing and plan fit](/pricing).
