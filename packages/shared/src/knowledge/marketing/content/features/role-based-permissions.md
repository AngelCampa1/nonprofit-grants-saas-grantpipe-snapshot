---
title: Role-Based Permissions in GrantPipe
description: "Admin, Editor, Viewer, and Auditor roles with row-level org scoping. Assign clear team access without custom permission sets."
seoTitle: Role-Based Permissions for Nonprofit CRM
seoDescription: Admin / Editor / Viewer / Auditor roles with row-level org scoping. No custom permission sets required - just assign the role and move forward.
publishedAt: "2026-04-25"
updatedAt: "2026-06-25"
lastReviewedAt: "2026-06-25"
buyerStage: bofu
schema: SoftwareApplication
topicCluster: nonprofit-crm
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - nonprofit-crm
  - permissions
  - security
targetKeyword: nonprofit crm user permissions
bluf: "Permission systems that need a consultant are hard to keep clean. GrantPipe uses four roles: Admin, Editor, Viewer, and Auditor. Teams can assign clear access without custom rules."
faqs:
  - q: What are the four roles?
    a: "Admin: full access including team management, org settings, custom field definitions, and deleting records. Editor: create and edit records, import data, generate reports and exports; cannot delete records or change org settings. Viewer: read-only access to all data; can view reports and exports but cannot create, edit, or delete. Auditor: read-only access for grants, funds, documents, compliance, accounting, and reports."
  - q: Can I customize permissions beyond the four roles?
    a: "Not now. The four roles fit common team work. If they do not fit your team, tell us."
  - q: Is there row-level security - can I restrict a user to seeing only certain donors or grants?
    a: "Row-level org scoping ensures every user only sees data within their organization. Within an org, roles are global - there is no way to restrict an Editor to only their assigned portfolio. Portfolio-based access control is on the roadmap for multi-portfolio organizations."
  - q: How does role assignment work for multi-entity organizations?
    a: "Not yet. Treat it as planned Enterprise work. It is not live until the app and price list say so."
  - q: Can an Admin see what actions other users have taken?
    a: "Yes. The audit trail logs all record creates, edits, and deletes by user with timestamps. Admins can filter the audit trail by user to review activity."
  - q: What happens to data owned by a user who leaves the organization?
    a: "When a user is deactivated, their records remain. Grant ownership, donor portfolio assignments, and task assignments can be reassigned in bulk to another user. Deactivated users cannot log in but their historical activity remains in the audit trail."
relatedPages:
  - /resources/guides/nonprofit-software-evaluation-for-executive-directors
  - /resources/guides/why-nonprofit-crm-implementations-fail
  - /features/multi-entity-consolidation
  - /features/custom-fields
  - /product
  - /pricing
  - /features/soft-credit-tracking
  - /features/subrecipient-monitoring
proscons:
  - subject: GrantPipe role-based permissions
    pros:
      - Four clear roles reduce custom configuration
      - Admins can assign roles without a custom permission project
      - Audit trail shows every user action - role enforcement is verifiable
      - Deactivated users lose access immediately while their data and audit history remain
    cons:
      - "You cannot limit an Editor to one portfolio."
      - "You cannot change role rules today. Contact support if these roles do not fit."
      - No IP-allowlist or SSO enforcement at the role level - those are org-level security settings
answers:
  - q: What access level is appropriate for a board member?
    a: "Viewer. Board members need read access to financial dashboards, donor retention reports, and grant status summaries. They have no operational need to create or edit records. The Viewer role gives them full read access without the ability to accidentally modify data they are reviewing."
  - q: What access level is appropriate for a program staff member who submits grant reports?
    a: "Editor. Program staff who upload report documents, update grant milestones, and complete reporting deadlines need create and edit permissions on the grant record. They do not need Admin access to org settings or custom field definitions."
  - q: How should a finance staff member be configured if they need to see donor data but not edit it?
    a: "Viewer. Finance staff who need donor giving totals and fund allocation data for reconciliation do not need to edit donor records. Viewer access gives them read access to all records, reports, and exports without the risk of accidental edits."
sourceUrls:
  - "https://grantpipe.com/product"
tableData:
  name: Role capabilities comparison
  description: "What Admin, Editor, Viewer, and Auditor can do."
  columns:
    - Capability
    - Admin
    - Editor
    - Viewer
    - Auditor
  rows:
    - - View all records and reports
      - "Yes"
      - "Yes"
      - "Yes"
      - "Limited"
    - - Export data to CSV
      - "Yes"
      - "Yes"
      - "Yes"
      - "Limited"
    - - Create and edit donor records
      - "Yes"
      - "Yes"
      - "No"
      - "No"
    - - Create and edit grant records
      - "Yes"
      - "Yes"
      - "No"
      - "No"
    - - Import data via CSV
      - "Yes"
      - "Yes"
      - "No"
      - "No"
    - - Complete reporting deadlines
      - "Yes"
      - "Yes"
      - "No"
      - "No"
    - - Delete records
      - "Yes"
      - "No"
      - "No"
      - "No"
    - - Manage team members and roles
      - "Yes"
      - "No"
      - "No"
      - "No"
    - - Configure custom fields
      - "Yes"
      - "No"
      - "No"
      - "No"
    - - Edit org settings
      - "Yes"
      - "No"
      - "No"
      - "No"
    - - View audit trail
      - "Yes"
      - "No"
      - "No"
      - "Limited"
---

## The problem

Access gets messy when everyone can see everything. It also breaks when rules live in someone's head. Finance, fundraising, auditors, and funders need different views.

## How GrantPipe solves it

GrantPipe uses roles for staff. It uses scoped views for outside reviewers. People see the data they need. They do not see donor, finance, or audit data their role should not open.

Roles control who can do what in GrantPipe. Admins set up the app. Editors do daily data work. Viewers can read data without changing it. Auditors get limited read-only access for audit and compliance work.

## Quick view

- Four roles: Admin, Editor, Viewer, Auditor
- Admin assigns roles without a custom setup project
- Editor: create/edit/import but cannot delete or configure org settings
- Viewer: full read access to all records and reports
- Auditor: limited read-only access. Covers grants, funds, documents, compliance, accounting, and reports
- Multi-entity role assignment stays gated
- Audit trail shows every user action
- Turned-off users lose access right away

## What this feature does

Role assignment is a two-field action. Pick a user. Pick a role. The role takes effect right away. Turn off a user and they cannot log in. Their data, audit history, and record assignments remain.

The four roles match common nonprofit staff jobs. Fundraising staff need Editor access for donor and grant records. Finance staff often need Viewer access to check data. Auditors need limited read-only access to grants, funds, documents, compliance, accounting, and reports. Board members need Viewer access for dashboards. The executive director and system owner need Admin access.

The audit trail records each create, edit, and delete. Each log shows the user and time. Admins can filter logs by user. That makes role checks easy to review later.

## Who it's for

Team leaders can give board members read access. Board members can view dashboards without edit rights. Team leads can add and remove staff. Finance staff can review donor and grant data without edit rights.

## The setup problem

Some CRM tools have dozens of role settings. They may include object rights, field rules, profiles, and sharing rules. That can be useful. It can also be hard for a small team to set up well. Teams may keep broad default access because the lock-down work is too much.

GrantPipe trades fine-grained rules for clear roles. If Admin, Editor, Viewer, and Auditor fit your team, setup stays simple.

## Example

Onboarding a new grants manager:

1. Admin opens Settings > Team
2. Clicks "Invite user," enters the new grants manager's email
3. Selects the Editor role
4. The invite email goes out
5. The new staff member creates a password and logs in
6. They can update deadlines, upload files, and edit grant details
7. They cannot delete records or change org settings

When they leave:

1. Admin opens Settings > Team
2. Admin finds the staff member
3. Admin clicks "Deactivate"
4. They lose access right away
5. Their audit trail history remains

## How it fits

Roles work with the audit trail and custom fields. Admins manage custom fields. Viewers can read dashboards and reports without changing records. Multi-entity role rules are planned work. They stay out of shipped claims until proof is complete.

## What it replaces

- People using Admin because roles were not set up
- A paid project to tune field rules
- Changing shared passwords when staff leave
- A spreadsheet that tracks who has access

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [soft credit tracking](/features/soft-credit-tracking)
- [subrecipient monitoring](/features/subrecipient-monitoring)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
