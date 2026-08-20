---
title: "External Review Session"
description: "An External Review Session gives a named reviewer secure, scoped, time-limited access to specific grant records without requiring a full account login."
seoTitle: "External Review Session Definition | GrantPipe Glossary"
seoDescription: "External Review Session defined: secure, scoped, time-limited portal access for auditors and funders, with every view and download logged automatically."
publishedAt: "2026-05-04"
updatedAt: "2026-05-04"
lastReviewedAt: "2026-05-04"
buyerStage: "tofu"
targetKeyword: "external review session grant management"
targetPersona:
  - "executive-director"
  - "finance-operations-staff"
schema: "Article"
topicCluster: "grant-compliance"
term: "External Review Session"
shortDefinition: "An External Review Session gives a named external reviewer, such as an auditor, funder, or board member, secure, scoped, time-limited access to specific records in a grant management system. The reviewer receives an access link, does not need to create an account, and loses access automatically on the date set by the organization."
longDefinition: "An External Review Session is the client-facing access workflow behind an Auditor & Funder Portal. When a nonprofit invites an external party to review grant records, the organization chooses which grants, restricted funds, and documents are visible, names the reviewer, and sets an access end date. The reviewer receives a secure access link by email. When the reviewer opens the link, GrantPipe performs server-side verification before showing only the records included in that scope. Any document view or file download during the review is logged against the reviewer's name in the organization's audit trail. The session scope cannot be expanded after creation: to add new grants or funds, the organization creates a new review session. Access can also be revoked from the portal management screen before the end date."
relatedTerms:
  - "Auditor & Funder Portal"
  - "Evidence Bundle"
  - "Audit Trail"
examples:
  - "An organization invites an external auditor by creating a session with a 30-day expiry, scoped to three grants and the associated restricted fund summaries. The auditor receives a link that opens the portal view directly, with no username or password required."
  - "A foundation program officer follows a portal link scoped to a single grant. After the review call, the organization revokes the session. The link immediately stops working, and the revocation is recorded in the audit trail."
answers:
  - q: "Why use an External Review Session instead of creating a full user account?"
    a: "A full user account usually creates broader and longer-lived access than an auditor or funder needs. An External Review Session is narrow by design: it is scoped to selected records, ends on a date the organization controls, and can be revoked when the review is finished."
  - q: "Can an external reviewer forward their session link to someone else?"
    a: "Forwarding a link may be possible depending on the organization's access controls. This is why the organization should set a short access window, scope the session narrowly, and revoke access immediately if the link may have reached an unauthorized party."
  - q: "What happens when a session expires?"
    a: "When the access window ends, the reviewer can no longer open the portal view. No further action is required from the organization unless it wants to create a new session with a later end date."
bluf: "An External Review Session is the building block behind every Auditor & Funder Portal invitation: a secure, scoped, time-limited access link that proves what was shared, with whom, and for how long."
faqs:
  - q: "Is an External Review Session the same as a guest login?"
    a: "No. A guest login typically creates a persistent credential for an ongoing relationship. An External Review Session is single-purpose, scoped to a specific set of records, and expires automatically. There is no persistent credential to manage or revoke over time."
  - q: "How are External Review Sessions logged?"
    a: "Every action in the session, including opening a document, downloading a file, or viewing a fund summary, is recorded in the organization's audit trail with the reviewer name from the invitation, the UTC timestamp, and the specific record accessed."
  - q: "Can the expiry be extended after the session is created?"
    a: "The safer workflow is to create a new session with a later end date and send a fresh access link. That keeps each review window explicit in the audit trail."
relatedPages:
  - "/auditor-funder-portal-software"
  - "/features/auditor-funder-portal"
  - "/glossary/auditor-funder-portal"
leadMagnetSlug: "auditor-evidence-checklist"
tags:
  - "glossary"
  - "external-review-session"
  - "auditor-portal"
  - "grant-compliance"
  - "security"
---

An External Review Session is the mechanism that makes an Auditor & Funder Portal work without giving external reviewers a full account. Rather than creating a user in the system, the organization creates a secure, scoped, time-limited access link for a named reviewer.

## How access stays scoped

The organization chooses the reviewer, the grant and fund scope, the included documents, and the access end date before sending the invitation. When the reviewer opens the link, GrantPipe performs server-side verification and displays only the records included in that session.

If the scope is wrong, the organization should revoke the session and create a new one with the correct records. If the review ends early, revocation stops access before the scheduled end date. Both automatic expiration and manual revocation are captured in the audit trail.

## What the session log captures

The audit trail records every interaction during the session:

- The reviewer name and email from the invitation
- The specific record accessed (grant, document, fund summary)
- The action type (view, download)
- The UTC timestamp

The log is append-only. Neither the reviewer nor the organization can remove entries.

## See Also

- [Auditor & Funder Portal](/glossary/auditor-funder-portal)
- [Evidence Bundle](/glossary/evidence-bundle)
- [Auditor & Funder Portal Software](/auditor-funder-portal-software)
