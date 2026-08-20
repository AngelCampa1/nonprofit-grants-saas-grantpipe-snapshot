# How to Calculate Donor Retention Rate (With Formula and Example)

A nonprofit closes the fiscal year with 150 donors. Twelve months later, 65 of those original 150 give again. That is a 43.3% retention rate, sitting almost exactly on the sector average — and it means 85 donors from the prior year are gone, taking their fundraising investment, relationship-building time, and future revenue with them.

Most organizations do not calculate this number. They look at total dollars raised, total donor count, and major gift activity, but the retention rate itself rarely appears on the development director's dashboard. The first step in fixing donor retention is knowing the number, and a surprising share of nonprofits cannot pull it from their current system without a manual VLOOKUP across two year-end exports.

## The Formula

The donor retention rate formula is straightforward:

**(Donors who gave in the current year who also gave in the prior year) / (Total donors who gave in the prior year) x 100**

The denominator is always the prior year's donor count, not the current year. The denominator represents the population the organization is trying to retain.

If 150 donors gave in 2024 and 65 of them also gave in 2025, the retention rate is 65 / 150 x 100 = 43.3%. The 85 who lapsed are the gap. To maintain 2024 revenue without growing it, the organization had to acquire at least 85 new donors in 2025 just to replace the lapsed ones.

That replacement math is why retention matters more than acquisition. Acquisition costs five to ten times more per dollar raised than retention. An organization losing 57% of its donors annually is running on a treadmill that gets faster every year.

## A Worked Example

Consider an organization with three years of donor counts:

- 2023: 120 donors gave at least one gift
- 2024: 150 donors gave at least one gift
- 2025: 135 donors gave at least one gift

To calculate 2025 retention rate, the relevant comparison is 2024 to 2025. Pull the list of 150 donors from 2024 and check which of them also appear in the 2025 donor list. Suppose 65 do.

65 / 150 x 100 = 43.3% retention rate for 2025.

Note what this number does and does not tell you. It tells you how well the organization held onto its existing base. It does not tell you whether the organization grew, because the 135 total in 2025 includes 70 new donors who were not in the 2024 group. Total donor count and retention rate are independent metrics, and both matter.

## The Three-Part Retention Framework

A single retention rate is a starting point, not an answer. The number breaks down into three sub-calculations that determine where to focus retention investment.

### New Donor Retention Rate

First-time donors retain at much lower rates than multi-year donors. Calculating new donor retention separately reveals whether onboarding and second-gift strategies are working.

The formula isolates first-time givers: (first-time donors from last year who also gave this year) / (total first-time donors from last year) x 100.

Sector benchmarks from the Fundraising Effectiveness Project put new donor retention at 19-26%. If 40 of the 150 prior-year donors were first-time givers and only 9 of them gave again, the new donor retention rate is 9 / 40 x 100 = 22.5%. That sits in the sector range but well below the overall 43.3%.

When new donor retention is low and overall retention is acceptable, the problem is the second-gift conversion, not the relationship with established donors. The fixes are operational: faster acknowledgment, an early second-ask, an onboarding sequence that ties the donor's gift to specific program outcomes.

### Multi-Year Cohort Retention

Donors in their second, third, and fourth+ years retain at progressively higher rates. Calculating retention by cohort year reveals where donors fall off.

Pull every donor by year of first gift. For each cohort, calculate what percentage gave again in the most recent year. The pattern usually looks like this: 22% retention in year two, 50% in year three, 65% in year four, and 75%+ for donors past their fourth year. The biggest cliff is between year one and year two.

The cohort view tells the development director where retention spending produces the highest return. Adding a major gift officer to steward five-year donors who already retain at 75% produces less marginal lift than adding a touchpoint between gift one and gift two for first-year donors retaining at 22%.

### Channel Retention

Online donors retain at lower rates than offline or major donors. Calculating retention by acquisition channel — online, direct mail, event, major gift — reveals which channels produce durable donors.

A peer-to-peer fundraiser who gave once because a friend ran a marathon may retain at 12%. A donor acquired through a long-form direct mail appeal may retain at 38%. A donor acquired through an in-person event tour may retain at 55%. The channel that produces the highest acquisition volume is rarely the channel that produces the highest retention.

When acquisition spending is concentrated in low-retention channels, total revenue can grow while the donor base hollows out. Channel retention reveals that pattern before it shows up in the bottom line.

## Industry Benchmarks

The Fundraising Effectiveness Project publishes annual sector benchmarks based on data from thousands of nonprofits.

- Sector average overall retention: 43-46%
- High-performing retention: 60% or above
- High-risk threshold: below 35%
- New donor (first-year) retention: 19-26%
- Recurring (monthly) donor retention: 80-90%

A retention rate below 35% means more than 65% of the donor base is replaced every year. Acquisition spending alone cannot solve that. Acquisition raises the top of the funnel while the bottom drains; the answer is closing the leak, not pumping more water through.

A recurring giving program is the highest-impact retention move available to most organizations. Recurring donors retain at 80-90%. Converting even 10% of one-time donors to monthly giving lifts overall retention by several points and stabilizes cash flow.

## Step-by-Step Calculation

Most CRM systems can produce the data needed for this calculation, but not all of them produce it cleanly. Here is the practical sequence.

1. Pull the donor list for the prior fiscal year. Use the donor record, not the gift record — a donor who gave three times last year counts as one donor, not three.

2. Pull the donor list for the current fiscal year. Same rule: one row per donor.

3. Match the two lists on a unique identifier (donor ID, not email or name). Email addresses change. Names get entered inconsistently. The donor ID is the only reliable join key.

4. Count the matches. That is the numerator.

5. Count the prior year list. That is the denominator.

6. Divide and multiply by 100.

In a spreadsheet, the match step is a VLOOKUP or INDEX-MATCH from one year's list against the other. It works but is error-prone, especially at scale or when the same donor appears under slightly different IDs from a CRM merge that did not fully complete.

A donor management CRM should generate this query in seconds, not require a manual export. If the current system cannot produce a LYBUNT (Last Year But Unfortunately Not This Year) report or calculate retention rate directly, that is a tooling gap. The number is the starting point for retention work, and a number that takes three hours to calculate gets calculated less often than it should.

## What to Do With the Result

Three actions follow the calculation, in order.

**Pull the LYBUNT list.** Every donor who gave in the prior fiscal year but has not yet given in the current year is a re-engagement priority. Donors within 12 months of their last gift are dramatically more reachable than donors who have been gone two or more years. The LYBUNT segment gets a personal outreach sequence, not a mass appeal.

**Calculate the value of a 5-point improvement.** If 150 prior-year donors averaged $250 per gift, moving from 43% retention to 48% retention means retaining 7.5 more donors per year. At $250 per gift, that is $1,875 in year one — and those donors continue giving in subsequent years, so the compounded value across five years is meaningful. For organizations with 1,000+ donors, the math scales into six figures quickly.

**Set a retention goal for the next fiscal year.** A 2-3 point improvement is realistic for an organization with no current retention strategy. A 5-point improvement requires investment in onboarding, recurring giving conversion, or major donor stewardship. A 10-point improvement means restructuring the development calendar around retention rather than acquisition.

## The Most Common Mistake

The single most common retention rate mistake is calculating it on transactions instead of donors.

A spreadsheet that counts gifts in 2024 and gifts in 2025, then divides one by the other, produces a number that looks like a retention rate but is not. A donor who gave three times last year and once this year shows up as three transactions versus one — a 33% "retention" that misrepresents what actually happened.

The correct calculation is donor-level, not gift-level. One row per unique donor in the prior year, one row per unique donor in the current year, match by donor ID.

This mistake is most common in organizations that pull retention numbers from accounting systems rather than donor management systems. Accounting tracks transactions; donor management tracks donors. The two systems answer different questions, and retention rate is a donor question.

## Why This Number Belongs on the Dashboard

Donor retention rate is a leading indicator for revenue stability. A rising retention rate shows up in next year's revenue with very little additional spending. A falling retention rate shows up two years later, when the cumulative effect of replacement-only acquisition catches up.

Boards rarely ask about retention rate, which is exactly why it should appear on every quarterly board report. Total dollars raised is the easy number. Donors retained is the durable number. Organizations that grow on retention compound. Organizations that grow on acquisition treadmill.

## Takeaway and What to Do This Week

Pull the donor lists for the last two fiscal years. Match them by donor ID. Calculate the rate. The full exercise takes 30 to 60 minutes if the CRM cooperates, longer if the data needs cleanup. Once the number is on paper, calculate the new donor retention sub-rate and the 5-point improvement value separately so the conversation with the executive director and the board can move from abstract concern to specific dollars.

Then build the LYBUNT list and set a date to begin re-engagement outreach. Most lapsed donors do not lapse for any specific reason — they simply do not get asked. The number will only move if the work moves first.

GrantPipe includes donor management with giving history tracking, LYBUNT segmentation, and retention reporting in the Starter tier so the calculation runs in seconds rather than hours.

---

_This article is from the GrantPipe team. GrantPipe is a donor and grant management platform built for mid-sized nonprofits managing donors, restricted funds, and grant compliance in one place._
