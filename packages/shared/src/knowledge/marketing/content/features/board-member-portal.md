---
title: Share board packets without full app access
entitlement: hasAuditorFunderPortal
description: "Share board packets through a scoped portal link. Pick the board packet, bundle, or records. Board members see only what you share."
seoTitle: Board Member Portal for Nonprofit Board Packets
seoDescription: "Give board members scoped access to board packets, evidence bundles, and selected records without a full GrantPipe login."
targetKeyword: board member portal nonprofit
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
  - board-treasurer
tags:
  - feature
  - board-reporting
  - portal
  - compliance
bluf: "Board Member Portal gives board members a scoped link to the packet and records you choose. They do not need a full GrantPipe login."
faqs:
  - q: Do board members need a GrantPipe account?
    a: "No. Staff send a signed portal link. The board member opens the link and sees the records attached to that session."
  - q: What can a board member see?
    a: "Only the items staff share. Board packets, evidence bundles, reports, documents, grants, funds, programs, and restriction terms can be scoped to the portal."
  - q: Does the portal log activity?
    a: "Yes. GrantPipe logs portal opens, record views, and downloads on the reviewer activity trail."
  - q: Is this board meeting software?
    a: "No. The portal is for read-only packet access. It does not manage votes, minutes, or agendas."
relatedPages:
  - /product
  - /pricing
  - /features/board-packet-composer
  - /features/auditor-funder-portal
  - /features/role-based-permissions
proscons:
  - subject: Board Member Portal
    pros:
      - Shares board packets without full app access
      - Keeps each portal session scoped to selected records
      - Logs views and downloads for review history
      - Reuses generated reports and evidence bundles
    cons:
      - It is read-only in this release
      - It does not manage board votes, minutes, or agendas
      - Staff still choose and review what to share
answers:
  - q: What is Board Member Portal?
    a: "Board Member Portal is a read-only link for board packet access. Staff choose the packet, bundle, or records a board member can see."
  - q: Why use a board portal instead of email?
    a: "Email sends files out of context. A scoped portal keeps the packet with the records staff chose and logs what was opened."
  - q: How does it work with Board Packet Composer?
    a: "Board Packet Composer makes the PDF packet. Board Member Portal gives selected board members a link to that packet or a bundle of support records."
sourceUrls:
  - "https://boardsource.org/fundamental-topics-of-nonprofit-board-service/nonprofit-board-responsibilities/"
  - "https://www.councilofnonprofits.org/running-nonprofit/governance-leadership/financial-literacy-nonprofit-boards"
tableData:
  name: Board portal access
  description: Common items staff can share through Board Member Portal.
  columns:
    - Item
    - How it is shared
    - Why it helps
  rows:
    - - Board packet PDF
      - Generated report scope
      - Gives board members the packet from live GrantPipe records
    - - Finance support files
      - Evidence bundle scope
      - Groups the documents behind the packet
    - - Restricted fund detail
      - Fund scope
      - Shows the fund context behind board questions
    - - Grant record
      - Grant scope
      - Shows award status and reporting context
    - - Policy or report file
      - Document scope
      - Lets board members download the file staff selected
---

## The problem

Board packets are easy to send and hard to control.

Staff build a packet before the meeting. Then they email a PDF. Someone asks for
the fund detail behind a number. Another person needs the grant report that
backs up a note. The files start to spread across inboxes.

That creates two problems. Board members may not have the record they need. Or
they may get more than they should see. A board packet should answer questions
without opening the whole app.

BoardSource says board members have a duty to oversee the organization. The
National Council of Nonprofits says boards need clear financial information.
GrantPipe does not replace that judgment. It gives staff a safer way to share
the packet and the records behind it.

## How GrantPipe solves it

Board Member Portal gives a board member a scoped link. Staff decide what the
link can show. The board member opens a read-only portal. They see the packet,
bundle, or records staff shared.

The portal is separate from the main GrantPipe app. Board members do not get
team settings. They do not get billing. They do not get donor lists unless staff
share a record that includes donor context through another shipped workflow.

Board packets appear first. Generated board reports and evidence bundles sit in
one Board packets section. If staff share more records, those appear under Other
shared records.

The portal keeps the existing safety model. Links expire. Staff can revoke a
session. GrantPipe logs portal opens, record views, and downloads.

## How it works with board packets

Board Packet Composer creates the PDF packet. It can pull giving totals, grant
pipeline totals, fund balances, and due dates from live records. Board Member
Portal handles the sharing step.

A common flow looks like this:

1. Build the packet in Reports
2. Review the generated PDF
3. Add the packet to a board review session
4. Add a finance bundle or support records if needed
5. Send the portal link to the board member
6. Review portal activity after the meeting

The board member sees the packet first. If staff shared a bundle, they can open
the support files from the same portal. If staff shared a fund or grant, they
can open that record without seeing the rest of the workspace.

## What board members can see

Staff control each portal session. A board member can see only records attached
to that session.

The portal can show generated reports, evidence bundles, grants, funds,
programs, documents, and restriction terms. Unsupported record types do not turn
into broken links. GrantPipe shows a disabled card until that record has a
portal view.

This keeps board packet sharing narrow. A finance committee member can get the
packet and fund detail. A grants committee member can get the packet and the
grant records staff chose. Another board member can get only the final PDF.

## What gets logged

GrantPipe records portal activity. When a board member opens the portal, the
session activity is logged. When they view or download supported records, that
activity is logged too.

That does not make the portal a legal archive. Staff still own the governance
process. The log does give the organization a clear record of what was shared
and when it was opened.

This is useful after a meeting. If a board member asks where a number came from,
staff can see which packet and records were shared. If access should end, staff
can revoke the session.

## What it does not do

Board Member Portal is not board meeting software. It does not manage votes,
minutes, agendas, attendance, or board terms.

It is also not a full board member role in the main app. GrantPipe already has
team roles for staff and auditors. This feature is for read-only packet access
through a scoped link.

That boundary matters. Board members often need enough context to review the
packet. They do not need broad app access for that job.

## Who it is for

This is for executive directors, finance leads, and grants staff who prepare
board materials.

The executive director wants one clean packet link before the meeting. The
finance lead wants fund detail close to the packet. Grants staff want support
records available without sending a shared drive folder.

It also helps board treasurers and committee members. They can open the packet,
review selected support records, and ask better questions from the same place.

## What it replaces

- Board packet PDFs sent without support records
- Shared drive folders with too much access
- Follow-up emails asking for the same grant file
- Untracked downloads of packet support files
- Full app access for people who only need read-only packet review

For the packet builder, see [Board Packet Composer](/features/board-packet-composer). For auditor and funder access, see [Auditor and Funder Portal](/features/auditor-funder-portal). For app roles, see [Role-Based Permissions](/features/role-based-permissions).

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [board packet composer](/features/board-packet-composer)
- [auditor and funder portal](/features/auditor-funder-portal)
- [role-based permissions](/features/role-based-permissions)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
