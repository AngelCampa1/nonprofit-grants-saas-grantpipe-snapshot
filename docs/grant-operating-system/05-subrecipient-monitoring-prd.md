# PRD: Subrecipient Monitoring

## Status

Draft

## Strategic Thesis

Subrecipient monitoring can become a serious wedge for federal and
pass-through funding. AwardTrace is pushing into this surface because it is
high-friction, compliance-heavy, and poorly served by generic grant trackers.
GrantPipe should make subrecipient oversight part of the award lifecycle.

## Problem

GrantPipe currently has contacts, funders, grants, compliance tasks, documents,
and reporting requirements, but it does not yet model subrecipients or
monitoring obligations. For pass-through entities, that creates gaps around:

- Subrecipient vetting and risk assessment.
- Agreement tracking.
- Required identifiers and federal award metadata.
- Monitoring logs and site visits.
- Required documents and reports.
- Findings and corrective actions.
- Payment holds or conditions.

Without this, users rely on shared drives, spreadsheets, and calendar reminders
for a workflow that is audit-sensitive.

## Target Users

- Nonprofits that pass federal or restricted funds to partner organizations.
- Finance directors responsible for pass-through compliance.
- Grant managers responsible for monitoring and reporting.
- Program directors working with partner organizations.
- Auditors reviewing subrecipient monitoring evidence.

## Current GrantPipe Baseline

GrantPipe has contacts, funders, grants, documents, reporting requirements,
activity logs, and auditor access foundations. It lacks a subrecipient entity,
risk model, agreement lifecycle, monitoring tasks, findings, and corrective
actions.

## Market Signal

AwardTrace highlights subrecipient monitoring as a product wedge. OJP and 2 CFR
Part 200 guidance make subrecipient monitoring a real post-award compliance
responsibility for federal and pass-through funding. This is a high-trust
surface where generic grant discovery tools are weak.

## Goals

- Create a first-class subrecipient record.
- Track agreements, award metadata, risk ratings, monitoring requirements, and
  documentation.
- Manage findings and corrective actions.
- Produce an audit-ready subrecipient monitoring file.
- Connect subrecipient obligations to grant, budget, reimbursement, document,
  and reporting workflows.

## Non-Goals

- Becoming a full vendor management or procurement system.
- Replacing SAM.gov or UEI validation services in the first release.
- Automatically determining federal compliance status without user review.

## MVP Scope

- Subrecipient organization records linked to contacts.
- Subaward records linked to grants and programs.
- Required fields: subrecipient name, UEI when applicable, agreement number,
  award amount, period, scope, risk rating, monitoring owner, and status.
- Risk assessment checklist.
- Monitoring plan with tasks, due dates, documents, and notes.
- Monitoring log entries.
- Findings and corrective actions with owner, due date, status, and evidence.
- Subrecipient monitoring export or evidence bundle.

## Functional Requirements

- Users can create subrecipient records and link them to grants.
- Users can record subaward terms and agreement documents.
- Users can complete a risk assessment.
- Users can generate monitoring tasks from risk level or templates.
- Users can log monitoring activity.
- Users can record findings and corrective actions.
- Users can attach evidence to monitoring tasks and corrective actions.
- Users can export a subrecipient monitoring file.

## Data Model Implications

- `subrecipients`
- `subawards`
- `subrecipient_risk_assessments`
- `subrecipient_monitoring_tasks`
- `subrecipient_monitoring_logs`
- `subrecipient_findings`
- `subrecipient_corrective_actions`

Where possible, reuse contacts, documents, reporting requirements, grants, and
activity log infrastructure.

## UX Surfaces

- Subrecipients in navigation or under compliance.
- Subrecipient tab on grant detail.
- Risk assessment wizard.
- Monitoring task list and calendar integration.
- Findings and corrective actions table.
- Evidence bundle export.

## Permissions And Audit

- Admin and editor can manage subrecipients, assessments, monitoring, findings,
  and corrective actions.
- Viewer can read records.
- Auditor can read subrecipient monitoring evidence.
- Every risk rating change, finding, corrective action update, and evidence
  attachment must be logged.

## Success Metrics

- Number of grants with subrecipients tracked.
- Percentage of subawards with completed risk assessments.
- Percentage of monitoring tasks completed on time.
- Number of findings resolved by due date.
- Audit evidence bundles generated.

## Risks And Open Questions

- This feature is only relevant for a subset of customers, but it may be highly
  valuable for the right segment.
- Federal terminology can intimidate smaller nonprofits. UX should keep the
  workflow plain and practical.
- Some validation fields may need external data later.

## Launch Slice

Build subrecipient records, subaward terms, risk assessment, monitoring tasks,
and evidence export first. Add richer federal reporting fields and payment hold
workflows later.
