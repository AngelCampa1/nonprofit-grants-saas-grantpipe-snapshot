---
title: Email selected donors from the donor record
entitlement: hasAutomationEmails
description: "Send a batch email to selected donors, personalize it with safe merge fields, and save each sent message on the donor timeline."
seoTitle: Donor Email Mail Merge for Nonprofit CRM
seoDescription: "Send selected donor emails from GrantPipe, keep approved template text in one place, and log each sent message on donor timelines."
targetKeyword: nonprofit donor email mail merge
publishedAt: "2026-06-18"
updatedAt: "2026-06-18"
lastReviewedAt: "2026-06-18"
buyerStage: mofu
schema: SoftwareApplication
topicCluster: donor-operations
contentIntent: category
primaryCta: trial
ctaMode: convert
refreshCadenceMonths: 12
targetPersona:
  - development-director
  - executive-director
  - finance-operations-staff
tags:
  - feature
  - donor-management
  - email
  - fundraising
bluf: "Donor Email Mail-Merge lets staff send one message to selected donors and save each sent email on the donor record."
faqs:
  - q: Is this a full email marketing platform?
    a: "No. This release is for selected donor emails from GrantPipe. It does not include drip sequences, A/B tests, scheduled sends, or a template library."
  - q: What merge fields are supported?
    a: "Staff can use first name, last name, full name, organization name, and email."
  - q: What happens after an email is sent?
    a: "Each successful send is saved as an email entry on that donor communication timeline."
  - q: What happens if a donor has no email address?
    a: "GrantPipe skips that donor. It also skips contacts marked as opted out of donor email."
relatedPages:
  - /product
  - /pricing
  - /features/donor-segmentation
  - /features/donor-lapse-early-warning
  - /features/donor-retention-reporting
proscons:
  - subject: Donor Email Mail-Merge
    pros:
      - Sends one email to selected donors
      - Supports safe donor merge fields
      - Logs each successful send on the donor timeline
      - Skips donors without email addresses or marked opt-out
    cons:
      - It is not a drip campaign builder
      - It does not schedule emails in this release
      - It does not replace a full email marketing platform
answers:
  - q: What is Donor Email Mail-Merge?
    a: "It is a batch send tool for selected donor records. Staff write one message, add safe merge fields, and send it to the donors they choose."
  - q: Why keep donor email inside GrantPipe?
    a: "The message stays connected to the donor timeline. Staff can see what was sent without checking another tool."
  - q: Who should use it?
    a: "Development staff can use it for small stewardship notes, follow-ups, and donor updates that should stay tied to the donor record."
sourceUrls:
  - "https://grantpipe.com/product"
tableData:
  name: Donor email workflow
  description: What the mail-merge flow does in GrantPipe.
  columns:
    - Step
    - What staff do
    - What GrantPipe records
  rows:
    - - Select donors
      - Pick donor records from the fundraising workspace
      - Selected contact IDs
    - - Write the message
      - Add subject, body, and safe merge fields
      - The message template
    - - Send
      - Send one email per donor with an email address
      - Sent, skipped, and failed counts
    - - Review timeline
      - Open the donor record later
      - The sent email in communication history
---

## The problem

Donor email often lives away from the donor record.

A development lead sends a note from an email tool. A staff member logs a call
in the CRM. A finance person checks giving history in another place. Later,
someone asks, "Did we send that update?"

The answer should be on the donor record.

## How GrantPipe solves it

Donor Email Mail-Merge lets staff send one message to selected donors from
GrantPipe.

Staff pick donor records, write a subject and message, and use simple merge
fields such as first name or full name. GrantPipe sends one email per donor with
an email address.

After the send, GrantPipe shows how many emails were sent, skipped, or failed.
Each successful send is saved on that donor communication timeline.

## What you can send

This feature is built for selected donor messages. Use it for small stewardship
notes, follow-ups after a meeting, or a simple update to donors in a segment.

It supports these merge fields:

- `{{firstName}}`
- `{{lastName}}`
- `{{fullName}}`
- `{{organizationName}}`
- `{{email}}`

Unsupported fields are blocked before sending. That keeps messages from going
out with broken placeholders.

## What gets logged

Every successful recipient gets an email entry on the donor timeline. The entry
stores the rendered subject and body, the donor record, the staff member who
sent it, and the send time.

That makes follow-up easier. Staff can open the donor record and see what was
sent before the next call, pledge follow-up, or stewardship touch.

## What gets skipped

If a selected donor has no email address, GrantPipe skips that donor. GrantPipe
also skips contacts marked as opted out of donor email. The send result shows
the skipped count.

If Resend rejects a recipient send, GrantPipe marks that recipient as failed and
does not log a successful communication for that donor.

The skipped list helps staff clean up donor data. Staff can send to the group
they need today, then come back to skipped donors later. Missing email addresses
do not block the whole batch.

Failed sends stay separate from successful sends. That keeps the timeline
honest. A donor record should not say an email was sent if the email provider
rejected it.

## How staff use it

The Donor Email page sits inside the Fundraising area. Staff open the page,
select donors, and write the message.

The page shows the number of selected donors. It also shows how many of those
donors have email addresses. That gives staff a quick check before they send.

A simple message might use the donor first name in the subject and body. A
staff member can also use the full name or organization name when the donor is a
company, foundation, or household record.

After the send, the result shows three counts:

- Sent
- Skipped
- Failed

Those counts help staff decide what to do next. A skipped donor may need an
email address added. A failed donor may need a resend from another tool or a
manual follow-up.

## Why this belongs with donor records

Many donor notes are not large campaigns. They are small touches that still need
history.

A staff member might send a thank-you note after a board event. They might send
an update to donors in stewardship. They might follow up with a group of lapsed
donors after reviewing the at-risk list.

Those emails affect the relationship. Keeping them on the donor timeline helps
the next staff member see the story before they call, ask, or thank the donor.

GrantPipe already stores calls, meetings, notes, and email logs. This feature
uses that same timeline. The difference is that staff can send the email first
and let GrantPipe write the timeline entry for each successful recipient.

## What it does not do

This is not a full email marketing suite.

It does not run drip campaigns. It does not schedule messages. It does not run
A/B tests. It does not include an automated unsubscribe preference center or a
template library in this release.

That boundary is intentional. GrantPipe keeps this first slice close to the
donor record and communication history.

## Where it fits

Use donor email with [Donor Segmentation](/features/donor-segmentation),
[Donor Lapse Early-Warning](/features/donor-lapse-early-warning), and
[Donor Retention Reporting](/features/donor-retention-reporting).

Those tools help staff decide who needs attention. Donor Email Mail-Merge helps
staff send the note and keep the history in one place.

## Start a free trial

[Start a trial](/pricing).

## Related feature pages

- [donor segmentation](/features/donor-segmentation)
- [donor lapse early-warning](/features/donor-lapse-early-warning)
- [donor retention reporting](/features/donor-retention-reporting)
- [Product overview](/product)
- [Pricing and plan fit](/pricing)
