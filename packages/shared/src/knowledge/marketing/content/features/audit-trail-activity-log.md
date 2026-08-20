---
title: Audit Trail and Activity Log
entitlement: hasComplianceReportPack
description: "Activity history with user, timestamp, before/after change detail, CSV export for audit evidence, and retention aligned to 2 CFR 200.334."
seoTitle: Nonprofit Audit Trail and Activity Log
seoDescription: "Polymorphic activity log captures every change with user, timestamp, and before/after diff. Export as audit evidence. Includes practical checks, reporting."
targetKeyword: audit trail activity log
publishedAt: "2026-04-24"
updatedAt: "2026-04-24"
lastReviewedAt: "2026-04-24"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: grant-compliance
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
leadMagnetSlug: nonprofit-crm-evaluation-scorecard
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - audit-trail
  - activity-log
bluf: "The activity log records every create, update, and delete across donors, grants, funds, and allocations with the acting user, a timestamp, and before/after change detail. Records retain for the full federal requirement under 2 CFR 200.334 (three years after grant closeout), and an auditor-ready CSV export rebuilds the trail for any entity or period."
faqs:
  - q: What is captured in the activity log?
    a: "Every create, update, and delete on core records such as contacts, donations, pledges, grants, funds, allocations, and reports. Each entry records what changed, who made the change, when it happened, and the before/after values needed for audit review."
  - q: How long are activity records retained?
    a: "Indefinitely by default. Organizations with data residency or deletion obligations can configure retention, but the default is set to meet 2 CFR 200.334, which requires records for three years after grant closeout."
  - q: Can I export the log for an audit?
    a: "Yes. Exports filter by entity, date range, user, or grant. Output is CSV with one row per change and the full diff in a JSON column. Auditors can open it in Excel or a JSON tool, no special software required."
  - q: Does it capture read access as well?
    a: No. The activity log captures mutations only. Read-access logging is on the roadmap and is typically required only for HIPAA-adjacent or PII-sensitive workflows.
  - q: What about deletions?
    a: "Deletion events are preserved for audit review. The activity log records who marked a record inactive and when, so the supporting history remains available when auditors need to understand what changed."
relatedPages:
  - /resources/guides/grant-compliance-101-for-nonprofits
  - /free/grant-compliance-checklist
  - /free/nonprofit-crm-evaluation-scorecard
  - /for/finance-operations-staff
  - /for/board-treasurers
  - /resources/guides/nonprofit-crm-pricing-guide
  - /product
  - /pricing
  - /features/auditor-funder-portal
  - /features/csv-donor-import
proscons:
  - subject: GrantPipe audit trail
    pros:
      - "Activity history covers every core operating record, not a subset"
      - "Before/after change detail captures the full context, not only a change flag"
      - Deletion history preserves records for audit retrieval
      - Retention default aligns with 2 CFR 200.334 federal requirement
      - "CSV export with filter by entity, date range, user, or grant"
    cons:
      - Does not capture read access; mutation-only logging
      - Storage grows over time; very large orgs may need retention tuning after year three
      - Diff readability assumes the auditor is comfortable with JSON or Excel
answers:
  - q: What is 2 CFR 200.334?
    a: "The federal records retention rule for grantees under the Uniform Guidance. Financial records, supporting documents, and statistical records must be retained for three years from the date of submission of the final expenditure report, with exceptions for litigation and audit extension."
  - q: How does the log help during an audit?
    a: "An auditor testing a sample of grant expenditures will ask who approved the allocation, when, and what it looked like before the change. The log answers all three questions as a CSV row with before/after detail, produced in minutes."
  - q: Can activity entries be edited or deleted?
    a: "No. Activity entries are append-only from the customer's point of view, so staff can export the trail for review without rewriting the history it represents."
  - q: Does the log show org-level isolation?
    a: "Yes. Activity history is separated by organization, and users only see records for the organization they are authorized to access."
pricingStats:
  - stat: 2 CFR 200.334 requires federal grantees to retain financial records for three years after the final expenditure report is submitted
    source: 2 CFR 200.334 Retention Requirements for Records
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR4acc10e7e3b676f/section-200.334"
  - stat: GAO's 2024 High Risk Series identifies weak grantee documentation as a recurring finding in federal grant audits
    source: U.S. GAO 2024 High Risk Series
    sourceUrl: "https://www.gao.gov/highrisk/overview"
  - stat: AICPA Statement on Auditing Standards 145 requires auditors to evaluate the design and implementation of IT general controls including change logging
    source: AICPA SAS No. 145
    sourceUrl: "https://www.aicpa-cima.com/professional-insights/download/sas-no-145"
tableData:
  name: Activity log fields captured
  description: Every mutation produces one log row with the following fields.
  columns:
    - Field
    - Type
    - Example
  rows:
    - - entity_type
      - string
      - grant
    - - entity_id
      - uuid
      - b7b1a2e0-...
    - - action
      - enum
      - update
    - - user_id
      - uuid
      - 2f8c3b4d-...
    - - occurred_at
      - timestamp UTC
      - "2026-04-24T14:02:11Z"
    - - change_detail
      - before/after values
      - "{ amount: [10000, 12500] }"
sourceUrls:
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/subject-group-ECFR4acc10e7e3b676f/section-200.334"
  - "https://www.gao.gov/highrisk/overview"
  - "https://www.aicpa-cima.com/professional-insights/download/sas-no-145"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
---

## The problem

Audit questions get harder when staff can see the current record but cannot explain who changed it, when it changed, or what evidence supported the decision. A clean record is not enough if the history behind it lives in email threads and memory.

## How GrantPipe solves it

GrantPipe records activity against the donor, grant, fund, document, and reviewer workflows that produced it. Staff can open the history beside the record instead of rebuilding the sequence from emails.

When product pages mention the journal or ledger, this page covers the traceability layer behind those accounting records. GrantPipe shows the operating activity that changed a grant, fund, allocation, or report so finance can explain the source record behind a posted entry.

The activity log records every create, update, and delete across donors, grants, funds, and allocations with the acting user, a timestamp, and before/after change detail. Records retain for the full federal requirement under 2 CFR 200.334 (three years after grant closeout), and an auditor-ready CSV export rebuilds the trail for any entity or period.

## TL;DR

- Activity history covers every core operating record
- Before/after detail captures the full change context
- Append-only history from the customer's point of view
- Retention default meets 2 CFR 200.334 federal records requirement
- CSV export filters by entity, date range, user, or grant for audit evidence

## What this feature does

The activity log is the compliance record every nonprofit that accepts federal funds needs and most do not actually have. When an auditor samples ten grant expenditures and asks for the approval chain, the organization either produces it or accepts a finding. GrantPipe captures the chain automatically: every time a record changes, the log records who changed it, when, and exactly what changed. The export turns that into the evidence packet an auditor expects.

## How it works

1. Every record change creates an activity entry automatically
2. The entry shows the record type, action, user, and UTC timestamp
3. Updates include before/after detail for changed fields
4. Deletion and restore events are logged as explicit actions
5. Entries are append-only from the customer's point of view
6. Exports filter by entity, user, grant, date range, or action type; output is CSV with change detail

## Who it's for

Finance leads responding to the annual single audit under OMB Uniform Guidance. Executive directors fielding a funder compliance review. Board treasurers answering questions about who approved a transfer between restrictions. IT and compliance staff answering SOC 2 or data-handling questionnaires from major funders.

## Why GrantPipe built it this way

Activity history has to be consistent across the whole workspace. If donor records, grant budgets, restricted fund releases, and compliance reports each keep history differently, audit response still turns into reconstruction. GrantPipe keeps the activity trail in one exportable format, so staff can answer who changed what, when it changed, and what the record looked like before the change without assembling evidence by hand.

## What it replaces

- The per-record "last modified by" field that does not tell you what changed
- The ad-hoc spreadsheet of approvals the grants manager maintains for audit season
- The screenshot-of-the-email approval evidence packet
- The audit finding on weak documentation of changes to grant obligations
- The manual reconstruction of who approved a restriction reallocation six months ago

On Audit-Ready and Enterprise plans, the activity log works alongside the [Auditor & Funder Portal](/features/auditor-funder-portal): when an auditor accesses an evidence bundle through the portal, every document view is recorded in the same log. External access is controlled, time-limited, and fully traceable - no emailed ZIP files, no shared login credentials.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [auditor funder portal](/features/auditor-funder-portal)
- [csv donor import](/features/csv-donor-import)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
