# PRD: Auditor and Funder Portal

## Status

Draft

## Strategic Thesis

The auditor role already exists. The product opportunity is to turn that role
into a trust surface: scoped access, curated evidence, expiration, revocation,
and a view audit trail. This makes GrantPipe feel like the source of truth
during audits, funder reviews, renewals, and closeout.

## Problem

GrantPipe has auditor permissions, documents, compliance objects, accounting
records, and activity logs. What it lacks is the portal workflow:

- Invite an external reviewer.
- Scope access to only the relevant grants, funds, programs, reports, and
  documents.
- Package evidence for a specific request.
- Expire access automatically.
- Revoke access instantly.
- Track what the reviewer viewed.

Without this, teams still send exports, links, zip files, screenshots, and
email attachments.

## Target Users

- Finance directors preparing audits.
- Grant managers responding to funder monitoring or closeout.
- Executive directors handling board or funder review.
- External auditors.
- Funder program officers or grants managers.

## Current GrantPipe Baseline

GrantPipe already has role-based permissions including auditor, documents,
grants, funds, compliance, accounting, reports, and activity logs. This PRD
productizes the external access workflow around those primitives.

## Market Signal

ERPs and audit tools compete on trust, reporting, and evidence. Grant discovery
tools are weaker here. A portal gives GrantPipe a retention surface because it
becomes part of the organization's audit and funder relationship workflow, not
just internal tracking.

## Goals

- Let internal users invite external reviewers safely.
- Scope external access by entity, report, document, and time.
- Create evidence bundles that are easy to review.
- Track reviewer access and views.
- Support funder and auditor review without exposing donor or unrelated
  operational data.

## Non-Goals

- Building a full virtual data room in the first release.
- Supporting external reviewer edits or comments in MVP.
- Replacing formal audit software.

## MVP Scope

- External reviewer invite flow.
- Reviewer types: auditor, funder, board reviewer, other.
- Scoped access to selected grants, funds, programs, documents, reports,
  reimbursement requests, restriction rollforwards, and subrecipient files.
- Expiration date and manual revocation.
- Evidence bundle builder.
- Portal landing page for external reviewers.
- View audit trail showing who viewed which item and when.

## Functional Requirements

- Admins can create portal invitations.
- Admins can set access scope and expiration.
- Admins can revoke access.
- Reviewers can authenticate through secure invite links or account-based
  access depending on security implementation.
- Reviewers can view only scoped records and documents.
- Reviewers can download allowed reports and evidence files.
- Internal users can see reviewer activity.
- The system blocks portal access after expiration or revocation.

## Data Model Implications

- `external_reviewers`
- `external_review_sessions`
- `external_review_scopes`
- `evidence_bundles`
- `evidence_bundle_items`
- `external_review_audit_events`

Existing role, user, document, report, grant, fund, compliance, and accounting
objects should be reused.

## UX Surfaces

- Portal access tab under organization settings or compliance.
- Evidence bundle builder from grant, fund, report, or document views.
- External reviewer landing page.
- Scoped report viewer.
- Access log table.
- Revoke and extend-access controls.

## Permissions And Audit

- Admin can invite, scope, extend, and revoke external access.
- Editor may be allowed to prepare evidence bundles but not invite reviewers,
  depending on org settings.
- Viewer cannot create portal access.
- Every invite, scope change, view, download, expiration, and revocation must
  be logged.
- Portal access must preserve org scoping and must never expose billing,
  settings, donor CRM, or team management unless explicitly added later.

## Success Metrics

- Number of evidence bundles created.
- Number of external review sessions completed.
- Time from audit request to evidence delivery.
- Number of email attachment or manual export workflows replaced.
- Retention or expansion mentions tied to audit/funder review.

## Risks And Open Questions

- Security requirements are high. Scope leakage would be a serious trust issue.
- Download controls may need watermarking or signed URLs.
- Funder and auditor needs overlap, but their terminology differs. Start with
  neutral "external reviewer" internals and tune UX copy by reviewer type.

## Launch Slice

Ship scoped reviewer invites, evidence bundles, expiration, revocation, and view
audit logs. Add reviewer comments, request lists, and watermarking later.
