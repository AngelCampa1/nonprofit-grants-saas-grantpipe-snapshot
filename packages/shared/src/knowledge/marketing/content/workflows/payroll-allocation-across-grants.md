---
title: "Workflow: Allocating Payroll Across Multiple Grants"
description: "Allocating payroll across multiple federal awards: base-salary splits, fringe pools, time-and-effort reconciliation, and month-end trueup."
seoTitle: "Payroll Allocation Across Grants Workflow"
seoDescription: "Step-by-step payroll allocation workflow for nonprofits managing multiple federal grants. Base salary splits, fringe pools, T&E reconciliation."
targetKeyword: "payroll allocation across grants"
publishedAt: "2026-04-25"
updatedAt: "2026-04-25"
lastReviewedAt: "2026-04-25"
buyerStage: "mofu"
schema: "HowTo"
topicCluster: "grant-compliance"
contentIntent: "workflow"
primaryCta: "lead-magnet"
ctaMode: "educate"
refreshCadenceMonths: 12
leadMagnetSlug: "grant-reporting-calendar-template"
targetPersona:
  - "finance-operations-staff"
  - "grants-manager"
tags:
  - "workflow"
  - "payroll allocation"
  - "federal grants"
  - "time and effort"
  - "uniform guidance"
timeEstimate: "3-6 hours monthly"
difficulty: "intermediate"
prerequisites:
  - "Payroll register showing gross wages, fringe benefits, and withholdings by employee"
  - "Current time-and-effort allocation percentages or actual time records for each employee"
  - "Approved indirect cost rate and the MTDC base calculation for the period"
  - "Grant budget detail showing the approved salary and fringe amounts by award"
  - "GL account structure with grant-level coding for salary and fringe accounts"
outputs:
  - "Monthly payroll allocation journal entry by employee across all grants"
  - "Budget-vs-actual comparison showing cumulative salary spend per grant"
  - "Fringe benefit allocation schedule by grant"
  - "Reconciliation of allocation percentages to time-and-effort documentation"
bluf: "Payroll allocations must reconcile to time-and-effort certifications monthly - not quarterly, despite common practice. Under 2 CFR 200.430, the after-the-fact confirmation principle requires that payroll charges reflect the actual time worked on each activity, not the budgeted percentages. An organization that posts payroll at the budgeted split and reconciles annually creates a full year of questioned costs if the actual time differed materially from the budget."
steps:
  - title: "Obtain the payroll register for the pay period"
    content: "Pull the payroll register showing each employee's gross wages for the period, the fringe benefit amounts (FICA, health insurance, retirement, workers' comp), and any special pay items. The register should be at the individual employee level - payroll allocation requires employee-by-employee coding, not department-level totals. If payroll runs biweekly and you close monthly, you will have two or three pay periods to allocate."
  - title: "Determine the allocation basis for each employee"
    content: "Under 2 CFR 200.430, charges to federal awards for salaries and wages must be based on actual hours worked on each activity, supported by time records. For employees with predictable grant allocations, the prior-period actual time serves as the allocation basis, subject to monthly reconciliation. For employees with variable assignments, actual current-period time records are required before posting payroll. Never use the grant budget as the allocation basis - the budget is the ceiling, not the basis."
  - title: "Allocate base salary across grants"
    content: "For each employee, apply the allocation percentage derived from time records to their gross wages for the period. An employee spending 60% of time on Grant A and 40% on Grant B has salary allocated 60%/40%. Build the allocation in a spreadsheet or payroll allocation module that shows each employee, each grant, the percentage, and the dollar amount. The sum of all grants for each employee must equal their total gross wages - no rounding errors."
  - title: "Allocate fringe benefits"
    content: "Fringe benefits follow salary allocation percentages - an employee's health insurance allocates to the same grants in the same proportions as their salary. Some organizations use a pooled fringe benefit rate rather than employee-level actual fringes. If you use a pooled rate, apply it consistently to all grants and document the rate calculation. The pooled rate must be reviewed and updated annually."
  - title: "Calculate the indirect cost allocation"
    content: "If the organization has a negotiated indirect cost rate (or uses the 15% de minimis rate under 2 CFR 200.414), apply the rate to the modified total direct costs (MTDC) base for each grant for the period. Salary and wages are typically included in the MTDC base; equipment, capital expenditures, and participant support costs are excluded. The indirect charge is a separate line in the grant expenditures - do not blend it into the direct salary allocation."
  - title: "Post the payroll allocation journal entry"
    content: "Book the monthly payroll allocation entry. Each line in the entry specifies: the employee, the grant, the account (salaries, FICA, health insurance, etc.), and the dollar amount. The total of all entries must equal the gross payroll and fringe benefits for the period. Attach the payroll register and the allocation worksheet to the journal entry as backup."
  - title: "Reconcile to budget and check for overruns"
    content: "After posting, run the cumulative budget-vs-actual for salary by grant. Compare current cumulative payroll charges to the approved salary budget for each award. If any grant is approaching or exceeding the approved salary budget, alert the grants manager immediately - you may need to reallocate the employee's time, seek a budget modification, or charge future time to unrestricted. A salary overrun on a federal grant is a questioned cost."
  - title: "Reconcile allocation percentages to time-and-effort documentation"
    content: "At month-end, the payroll allocation percentages used for posting must match the time records employees have certified for the period. If an employee's time sheet shows 55% on Grant A but the payroll was allocated at 60%, a correcting entry is required. Monthly reconciliation prevents a full-quarter or full-year adjustment at audit time. Document the comparison and any corrections made."
faqs:
  - q: "Can we use budget percentages to allocate payroll?"
    a: "No. Under 2 CFR 200.430, payroll charges to federal awards must reflect actual time worked, not budgeted time. Budget percentages can be used as a starting point for preliminary allocations, but the final allocation must be reconciled to actual time records before reporting. The distinction is meaningful: auditors compare payroll charges to time-and-effort documentation, not to the budget."
  - q: "How often must we reconcile payroll allocations to time records?"
    a: "Monthly at minimum. The 2 CFR 200.430 after-the-fact principle means that by month-end, the posted charges and the certified time records must agree. Some organizations reconcile each pay period; most reconcile monthly. Quarterly reconciliation is common but insufficient - it allows misallocations to compound over three months before correction."
  - q: "What happens if an employee's actual time differed from the allocation?"
    a: "Book a correcting journal entry moving the difference from one grant to another. The correction must be dated in the period the time actually occurred (or as close as your system permits) and accompanied by the time record supporting the correction. If the original allocation put too much salary on a federal grant, the excess is a questioned cost until the correction is posted."
  - q: "Can employees allocate 100% to a single grant?"
    a: "Yes, if they actually work 100% on that grant. An employee fully funded by a federal award should have their entire salary and fringe charged to that award, provided they work exclusively on grant activities. Single-award employees may be eligible for semi-annual time-and-effort certification rather than monthly, per 2 CFR 200.430(i)."
  - q: "How do we handle employees on multiple federal awards with different budget periods?"
    a: "Each federal award tracks independently. An employee at 40% on Grant A and 60% on Grant B has separate budget ceilings for each. If Grant A is in the final month of its budget period and approaching its salary ceiling, you cannot shift charges to Grant B - the charges must go where the time was actually spent. Work with the grants manager to identify upcoming budget constraints before they become overruns."
relatedPages:
  - "/resources/guides/time-and-effort-certification-federal-grants"
  - "/workflows/time-and-effort-certification"
  - "/features/payroll-allocation"
  - "/resources/guides/2-cfr-200-subpart-e-cost-principles"
  - "/resources/guides/allowable-costs-federal-grants"
  - "/resources/guides/indirect-cost-rate-explained"
definitions:
  - term: "After-the-fact confirmation"
    definition: "The 2 CFR 200.430 principle requiring that payroll charges to federal awards reflect actual time worked, verified by time records, rather than prospective budgeted allocations."
  - term: "Modified Total Direct Costs (MTDC)"
    definition: "The base used to calculate indirect cost charges under federal awards. Includes direct salaries, wages, and fringe, but excludes equipment, capital costs, patient care, tuition, and participant support costs."
  - term: "Semi-annual certification"
    definition: "A time-and-effort certification covering six months at once, permitted under 2 CFR 200.430(i) only for employees who work exclusively on a single federal award or cost objective - not employees split across multiple awards."
  - term: "Fringe benefit pool"
    definition: "An organization-wide fringe rate applied uniformly to all salary charges, calculated as total fringe benefits divided by total salaries. Used as an alternative to tracking actual fringe by employee when the organization has a relatively uniform benefit structure."
answers:
  - question: "What documentation does an auditor expect for payroll allocations?"
    answer: "The auditor expects: payroll registers for each pay period, the payroll allocation worksheet showing how each employee's pay was distributed across grants, the time-and-effort records (time sheets or activity reports) that support the allocation percentages, monthly reconciliation documentation showing that posted percentages match certified time, and budget-vs-actual showing cumulative salary charges against approved grant budgets."
  - question: "How do we handle a retroactive payroll correction?"
    answer: "Retroactive payroll corrections must be processed within 90 days of the original payroll for timely correction, per prevailing federal agency guidance. The correcting journal entry requires additional justification for corrections older than 90 days. Document the reason the correction was not caught earlier, the support for the corrected allocation, and the review sign-off. Late corrections raise questions about monitoring effectiveness."
  - question: "Do we need separate accounts for each grant's payroll charges?"
    answer: "Not necessarily separate GL accounts, but grants must be trackable at the level of detail needed for reporting. Whether you use segment-level grant codes, dimension tags, or a true fund accounting structure depends on your accounting system. What matters is that the detail behind any grant-level salary report is auditable to individual employees and pay periods."
pricingStats:
  - stat: "Under 2 CFR 200.430, charges to federal awards for salaries and wages must be based on the actual hours worked on each activity, not budgeted percentages - the after-the-fact confirmation principle"
    source: "OMB 2 CFR 200.430"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.430"
  - stat: "Employees working exclusively on a single federal award may use semi-annual certification under 2 CFR 200.430(i); employees on multiple awards must certify monthly or each pay period"
    source: "OMB 2 CFR 200.430(i)"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.430"
  - stat: "The de minimis indirect cost rate was raised from 10% to 15% of Modified Total Direct Costs by the 2024 Uniform Guidance revision, applicable to organizations that have never received a negotiated rate"
    source: "OMB 2 CFR 200.414(f)"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.414"
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.430"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.414"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.405"
  - "https://www.gao.gov/assets/gao-24-106173.pdf"
statistics:
  - stat: "Under 2 CFR 200.430, payroll charges to federal awards must reflect actual hours worked on each activity - not budgeted percentages - verified by time records and after-the-fact confirmation"
    source: "OMB 2 CFR 200.430"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.430"
  - stat: "Semi-annual time-and-effort certification is permitted only for employees working 100% on a single federal award; multi-award employees require monthly reconciliation per 2 CFR 200.430(i)"
    source: "OMB 2 CFR 200.430(i)"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.430"
  - stat: "The de minimis indirect cost rate was raised to 15% MTDC in the 2024 Uniform Guidance revision, applicable to nonprofits that have never negotiated a rate with a federal agency"
    source: "OMB 2 CFR 200.414(f)"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-E/section-200.414"
---

Payroll allocation across multiple grants is, for most mid-sized nonprofits, the single largest category of federal expenditure and the single largest source of audit findings. Personnel costs are both the easiest thing to misallocate and the hardest thing to correct after the fact. The combination - high dollar value, complex allocation rules, monthly cadence - makes this workflow one worth running well.

## When to run this workflow

Run this workflow every month-end, timed to follow the payroll closing for the period. For organizations on a biweekly pay schedule, the month-end payroll allocation may cover two or three pay periods. The allocation must be posted and reconciled to time records before the monthly grant financial reports go to funders - not after.

Also run this workflow whenever a staff member's grant assignment changes. A program manager moving from 40% to 60% on a specific grant requires an immediate update to the payroll allocation going forward, plus confirmation that prior months' allocations reflected the actual time worked during those months.

## Common pitfalls

**Posting at budgeted percentages without checking actual time.** The most common and most expensive error. The budget says 60% - the employee actually worked 45% on the grant that month. The difference is a questioned cost unless caught and corrected monthly.

**Using the prior month's allocation without updating for personnel changes.** Many organizations copy last month's allocation each month. If an employee left mid-month or a new grant started, the copy-forward produces incorrect allocations immediately.

**Charging indirect costs on top of already-indirect costs.** The MTDC base typically excludes indirect costs themselves. Adding indirect charges to a base that includes prior indirect charges creates circular and incorrect charges. Verify the MTDC calculation annually.

**Missing the monthly reconciliation to time records.** Allocating payroll and posting the entry is not the end of the process. The posted percentages must match the certified time records. Organizations that treat posting as completion and reconciliation as optional discover the gap only when auditors test time-and-effort documentation.

## Audit trail requirements

Payroll allocation audit evidence includes:

- Payroll registers for each pay period covered by the allocation
- The allocation worksheet showing employee-level grant distribution
- Time records (time sheets, activity reports, or dual-signature certifications) for each employee for the period
- Reconciliation showing that allocation percentages equal certified time percentages
- Budget-vs-actual showing cumulative salary charges against approved grant salary budgets
- Any correcting journal entries with supporting rationale and sign-off

Auditors testing compensation charges under Single Audit will request all of these for a sample of employees and pay periods. The audit is a lot easier when the documentation exists and is organized in advance.

## How GrantPipe automates this

GrantPipe connects payroll allocation data to grant budgets in real time, so cumulative salary charges update each month and the budget-vs-actual is always current. Allocation percentages are compared to time-and-effort records as they are certified, and discrepancies flag before the monthly close rather than at audit. [Start a trial](/signup).
