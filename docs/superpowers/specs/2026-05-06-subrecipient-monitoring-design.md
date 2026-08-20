# Subrecipient Monitoring Design

Date: 2026-05-06

## Goal

Add subrecipient monitoring as an Audit-Ready+ compliance workflow inside GrantPipe. The feature gives pass-through organizations one place to track subrecipients, subawards, risk assessments, monitoring tasks, logs, findings, corrective actions, documents, activity history, and evidence bundles.

## Product Scope

Subrecipient Monitoring is part of Compliance, not a separate product surface. It reuses:

- Grant records for award context
- Contact records for partner contacts
- Documents for subrecipient evidence
- Activity log for audit trail
- Generated reports for evidence bundle artifacts
- Auditor & Funder Portal evidence surfaces
- Existing compliance permissions

Starter and Growth may show upgrade-aware entry points in the app, but API mutations require Audit-Ready or Enterprise and return `402 insufficient_plan` below that tier.

## Compliance Framing

The workflow is modeled around official pass-through monitoring concepts rather than legal advice. OJP describes subrecipient monitoring as ensuring subawards are used for authorized purposes, comply with federal program and grant requirements, and achieve performance goals. OJP also points pass-through entities to 2 CFR 200.332 for subrecipient monitoring requirements and describes risk factors such as prior experience, audit results, changed systems, complex requirements, and award size. OVC similarly emphasizes review of financial and performance reports, timely follow-up on deficiencies, management decisions for audit findings, and risk-based monitoring frequency.

Sources:

- https://www.ojp.gov/funding/financialguidedoj/iii-postaward-requirements
- https://www.ovc.ojp.gov/program/victims-crime-act-voca-administrators/victim-assistance/subrecipient-monitoring
- https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.332

## Data Model

New org-scoped, soft-deleted tables:

- `subrecipients`
- `subawards`
- `subrecipient_risk_assessments`
- `subrecipient_monitoring_tasks`
- `subrecipient_monitoring_logs`
- `subrecipient_findings`
- `subrecipient_corrective_actions`

Money is stored in cents. Risk and workflow states are shared constants so API, web, and site surfaces speak the same language.

## API

New domain: `apps/api/src/domains/subrecipients`, mounted at `/api/subrecipients`.

MVP routes include portfolio CRUD, subaward creation/update/read, risk assessment creation, risk-based task generation, monitoring task update, monitoring logs, findings, corrective actions, and evidence bundle creation.

## Monitoring Task Templates

- Low: agreement document, annual report review, closeout check.
- Medium: low-risk tasks plus quarterly financial/performance review and evidence check.
- High: medium-risk tasks plus site visit/desk review, corrective-action follow-up, and payment-condition review note.

## Permissions

- Admin/Editor: manage through `compliance: edit`.
- Viewer: read through `compliance: view`.
- Auditor: read through existing compliance, document, report, and evidence surfaces.

## Marketing Positioning

Package the feature in Audit-Ready and Enterprise. Avoid unsupported guarantees; copy should say the workflow helps teams organize monitoring evidence and should not claim to guarantee compliance.
