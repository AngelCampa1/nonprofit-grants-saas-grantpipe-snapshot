---
title: Build a SEFA Draft
entitlement: hasAuditorFunderPortal
description: "GrantPipe tracks federal award spend against the $1M single audit threshold, then creates a SEFA draft from grant-linked expenses."
seoTitle: SEFA Builder for Nonprofit Single Audit Tracking
seoDescription: "Track federal award expenses, see when single audit risk is rising, and create a SEFA draft from grants and grant-linked expenses in GrantPipe."
targetKeyword: nonprofit SEFA builder
publishedAt: "2026-06-26"
updatedAt: "2026-06-26"
lastReviewedAt: "2026-06-26"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: grant-compliance
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: nonprofit-audit-readiness-assessment
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - sefa
  - single-audit
  - federal-awards
bluf: "GrantPipe gives finance teams a SEFA draft and a single audit tripwire. It totals federal grant expenses for the fiscal year, compares them with the $1M federal threshold, and flags missing ALN or agency details before review. Your team still reviews the draft and works with the auditor."
faqs:
  - q: What does the SEFA builder create?
    a: "It creates a SEFA draft from federal award metadata and grant-linked expenses in GrantPipe. It is a draft for review, not a filed audit document."
  - q: What threshold does the tripwire use?
    a: "It uses the federal single audit threshold in 2 CFR 200.501, which is $1M in federal awards expended during the fiscal year as checked on June 26, 2026."
  - q: Does this replace an auditor?
    a: "No. GrantPipe helps prepare the draft and warning list. Your team and auditor still review the final support."
  - q: Which plan includes it?
    a: "SEFA Builder and the tripwire are available on Audit-Ready and Enterprise plans."
relatedPages:
  - /product
  - /pricing
  - /features/auditor-funder-portal
  - /features/audit-readiness-score-binder-starter
  - /features/functional-expense-allocation-studio
  - /features/grant-budget-sentinel
proscons:
  - subject: SEFA Builder
    pros:
      - Totals federal grant expenses by fiscal year
      - Shows distance from the $1M single audit threshold
      - Creates a CSV bundle and preview for review
      - Flags missing ALN or federal agency details
    cons:
      - It does not file with the Federal Audit Clearinghouse
      - It does not replace CPA or auditor review
      - It depends on clean federal award metadata and expense coding
answers:
  - q: What is a SEFA?
    a: "A SEFA is a Schedule of Expenditures of Federal Awards. It lists federal awards and the related spending for the fiscal year."
  - q: Why does the threshold matter?
    a: "Federal rules require a single audit when an organization expends at least the stated threshold in federal awards during its fiscal year."
  - q: What does GrantPipe check before the draft is ready?
    a: "GrantPipe checks whether federal awards have the key SEFA fields, including Assistance Listing Number and federal agency."
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F/subject-group-ECFRfd0932e473d10ba/section-200.501"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
tableData:
  name: SEFA draft checks
  description: The checks GrantPipe runs before a SEFA draft is reviewed.
  columns:
    - Check
    - What GrantPipe uses
    - Staff action
  rows:
    - - Federal award spend
      - Grant-linked expenses in the fiscal year
      - Review expense coding and support
    - - Single audit tripwire
      - The $1M federal threshold in 2 CFR 200.501
      - Watch spending before year end
    - - Assistance Listing Number
      - Federal award metadata on the grant
      - Fill missing ALN fields
    - - Federal agency
      - Federal award metadata on the grant
      - Confirm agency names before review
---

## The problem

Federal award tracking gets hard before the audit starts.

A nonprofit may know its grant budget. It may know each reimbursement request.
But the single audit question is different. Staff need to know how much federal
award money was expended during the fiscal year. That amount can sit across
many grants, programs, and expense records.

The risk grows when the team tracks the work in spreadsheets. One file has the
grant list. Another has the expense rollup. Another has ALN values. Another has
notes from the pass-through entity. When those files drift, the finance team
has to rebuild the story at year end.

The threshold also needs an early warning. Under 2 CFR 200.501, a non-federal
entity must have a single audit when it expends at least $1M in federal awards
during the fiscal year. That rule is about expenditures, not only the grant
award amount.

If the team only checks after books close, there is less time to clean up
missing ALN fields, confirm agency names, or gather support. The result is not
always a wrong SEFA. Often it is a rushed one.

GrantPipe cannot decide audit scope for your organization. It can give your
team a clearer draft and a live tripwire before the audit request list arrives.

## How GrantPipe solves it

GrantPipe adds a SEFA builder to the report library for Audit-Ready teams.

The builder starts with federal award metadata on each grant. Staff can track
the Assistance Listing Number, federal agency, FAIN, pass-through entity,
program name, and cluster name. GrantPipe then totals grant-linked expenses for
the selected fiscal year.

The single audit tripwire compares that federal expense total with the $1M
threshold. The status is simple:

- Clear when federal expenses are below the watch level.
- Watch when the total is close to the threshold.
- Crossed when the total reaches or exceeds $1M.

The report output is a SEFA draft, not a final filing. It includes a CSV bundle
with the grant rows and a summary. It also creates a preview in the report
library so staff can review the federal expense total, threshold status, and
warning list before sharing anything.

Warnings are plain. If a federal award is missing an ALN, GrantPipe flags it.
If the federal agency is missing, GrantPipe flags it. The goal is not to hide
the gap. The goal is to make the gap visible while staff still have time to fix
the source record.

This fits with the rest of the Audit-Ready workflow. The team can use the SEFA
draft alongside the audit readiness score, auditor portal, audit report output,
and evidence bundles. Each tool has a narrow job. Together, they help finance
staff prepare cleaner support.

GrantPipe does not file with the Federal Audit Clearinghouse. It does not
certify the SEFA. It does not replace CPA or auditor review. Your team still
reviews the draft, checks the expense support, and works with the auditor on
the final audit package.

## What teams can do before year end

The best use of the tripwire is routine review.

Finance staff can open the report library during the year and check the current
federal expense total. If the status is clear, the team still has a view of the
data that feeds the draft. If the status is watch, the team can start checking
award metadata before closing work gets busy. If the status is crossed, staff
can prepare for single audit support with fewer surprises.

This is also useful for teams with pass-through funding. The award may come
through a state or local agency, but the federal fields still matter for SEFA
review. Keeping those fields on the grant record makes the draft easier to
trace later.

The output is designed for review, not ceremony. It gives the team the rows,
the total, the threshold, and the missing-field warnings. That is enough to
start the right internal check without pretending the audit is complete.
