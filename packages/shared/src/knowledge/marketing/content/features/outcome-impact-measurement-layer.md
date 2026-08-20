---
title: Track Grant Outcomes
entitlement: hasOutcomeImpactMeasurement
description: "GrantPipe lets teams set outcome goals. Teams can add funder measures and link them to grant metrics."
seoTitle: Outcome Tracking for Nonprofit Grant Reports
seoDescription: "Track goals and funder measures in GrantPipe. Keep results with grants, budgets, and reports so staff can check progress."
targetKeyword: nonprofit outcome tracking software
publishedAt: "2026-06-18"
updatedAt: "2026-06-18"
lastReviewedAt: "2026-06-18"
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
  - reporting
  - grant-management
  - compliance
  - programs
bluf: "GrantPipe keeps goals and funder measures near the program record."
faqs:
  - q: What does outcome tracking cover?
    a: "It covers outcome goals and measures. A measure can come from a funder or your team."
  - q: Can measures use existing grant metrics?
    a: "Yes. A measure can link to an existing grant impact metric."
  - q: Does this prove impact?
    a: "No. It tracks the goals and measures your team enters. Staff still review the results."
  - q: Which plan includes outcome tracking?
    a: "Outcome tracking is on Growth, Audit-Ready, and Enterprise plans."
relatedPages:
  - /product
  - /pricing
  - /features/cross-entity-report-builder
  - /features/funder-reporting-templates
  - /features/payroll-allocation
proscons:
  - subject: Outcome tracking
    pros:
      - Keeps program goals near grant records.
      - Tracks funder-defined measures.
      - Can link indicators to grant impact metrics.
      - Records create actions in the activity log.
    cons:
      - It does not replace research design.
      - It does not manage client-level case records.
      - It does not write report narratives in this release.
answers:
  - q: What is outcome impact measurement in GrantPipe?
    a: "It tracks program goals and the measures funders ask for."
  - q: Why does it live on the program page?
    a: "Programs own the work. Grants and budgets can still connect to the same outcome goal."
  - q: How does it protect data?
    a: "Safe event data uses flags and groups. It does not send names or raw values."
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.301"
  - "https://www.councilofnonprofits.org/running-nonprofit/fundraising-and-resource-development/grants"
tableData:
  name: Outcome tracking fields
  description: What teams can record first.
  columns:
    - Field
    - Purpose
    - Review use
  rows:
    - - Outcome goal
      - Names what should change
      - Keeps program intent clear
    - - Measure
      - Names what will be measured
      - Shows whether a target has data
    - - Funder-defined flag
      - Marks measures from an award or report
      - Helps staff find required fields
    - - Metric link
      - Connects to an existing grant impact metric
      - Pulls the latest live entry
---

## The problem

Funder reports often ask for more than spending.

They ask what changed. They ask how many people reached a goal. They ask for a
target, a date range, and a clear measure.

Small teams can track those numbers in a sheet. That works for a while.

Then the goal, budget, and report split apart.

Then staff have to match rows by hand. They may know the target. They may not
know the latest value. They may know the program. They may not know which grant
asked for the measure. They may know the grant. They may not know who changed
the measure.

That gap matters during reporting week. A late report can slow renewal work. A
number with no source can force a second review. A goal with no owner can sit
until the due date is close.

## How GrantPipe solves it

GrantPipe adds outcome goals to the program record.

A goal says what should change. A measure says what staff will count.

Mark a measure as funder-defined. Use that when it comes from an award, report,
or proposal.

Measures can link to grant impact metrics. GrantPipe reads the latest live
entry. It shows that value next to the target. GrantPipe skips deleted entries.

The result is a simple program view. Staff can see the goal. They can see the
measure. They can see the current value. They can add a goal from the program
page.

GrantPipe does not claim that the result proves impact. It records the goal and
the measure. Your team still reviews the data before it goes to a funder.

## What teams can track

Start with the outcome goal.

Name the goal. Write the change in plain language. Add who the goal is for.
This helps the team read it later.

Then add measures. A measure can be an output, outcome, or quality check. It
can have a target value. It can have a starting value, unit, source, and report
cadence.

Use the funder-defined flag for award measures. Use it for grant report
measures too. Staff can spot required fields before a deadline.

Use the metric link when the number already exists. GrantPipe can show the
latest value. Staff do not have to copy it.

## Built for funder review

Outcome data is review work. It needs a clear trail.

GrantPipe records create actions in the activity log. The log shows the goal or
measure. It shows who added it. It shows when it changed.

Role access still applies. Users need program access to view or edit the
outcome layer. Auditor access stays read-only through the existing role model.

Safe event tracking is wired into the feature. GrantPipe tracks create events.
It does not send names, statements, raw values, or record ids to PostHog.

Sentry is wired in too. If a web save fails, GrantPipe captures the error with
the outcome feature tag. If API event capture fails, GrantPipe sends the
background failure to Sentry. The user action can still finish.

## Where it fits

Outcome goals live on the program page. Programs own the work.

Grants can still connect to the same goal. That helps when a program has more
than one funder. It also helps when one grant pays for part of the work.

Budgets stay nearby too. The program page already shows budget periods and
expense context. Outcome goals belong beside that view. Funder reports often
need both money and results.

This keeps the first version focused. Staff do not need another dashboard just
to add a required measure. They can start from the program they already use.

## Example work step

A grants manager opens the youth services program.

They add an outcome called "School readiness." The statement says that students
can start school ready. The program lead adds a reading score measure. They
mark it as funder-defined.

If the reading score already exists, link the measure to it. GrantPipe then
shows the latest value beside the target.

Before a report is due, staff can open the program page. They can see which
measures have data. They can see which ones are missing. They can follow up
before they write the report.

## What it does not do

GrantPipe does not replace a study plan.

It does not decide which outcomes are valid. It does not run client surveys. It
does not manage client-level case notes. It does not write a final report for
you.

The first release is a tracking layer. It keeps goals, measures, and linked
metric values close to the grant and program records.

That is the right start for small teams. It keeps required data in one place.
Staff can check it before the deadline.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

See [custom report builder](/features/cross-entity-report-builder). See
[funder report templates](/features/funder-reporting-templates). See
[program cost splits](/features/payroll-allocation).
