# Feature #13: Outbound Donor Email / Mail-Merge

Status: in build. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 3 #13.

## Problem

GrantPipe tracks donor records and communication history. Staff still need a
simple way to email a selected group of donors without leaving the donor record
behind.

For this slice, the goal is not to replace a full email marketing platform. The
goal is a practical batch send for stewardship notes, follow-ups, and small
appeals where every sent message is written back to the donor timeline.

## Scope

1. Add a donor batch email endpoint.
2. Let staff select donor records and compose one message.
3. Support safe merge tokens for donor name and email fields.
4. Send one Resend email per donor with an email address.
5. Skip selected donors that have no email address or are marked as opted out.
6. Log each successful send to `communication_log`.
7. Return sent, skipped, and failed recipient counts.
8. Add a donor email page under Fundraising.
9. Gate the API behind donor edit permission and the existing automation email
   entitlement.
10. Add a public feature page.

## Non-goals

- Marketing journey automation.
- Drip sequences.
- Automated unsubscribe preference center.
- Email template library.
- A/B testing.
- Attachment sending.
- Scheduled sending.
- Delivery webhooks or retry queues.

Those can be added later if demand justifies a fuller email system.

## Data model

A contact-level `email_opt_out` flag is added so donor batch email can skip
suppressed contacts.

Successful recipient sends create one `communication_log` row per contact:

- `type = "email"`
- `subject = rendered subject`
- `body = rendered body`
- `loggedBy = sending user`

Skipped and failed recipient rows are returned in the API response but are not
persisted in this first slice.

## API

Add:

- `POST /api/donors/mail-merge/send`

Request:

- `contactIds`: 1 to 250 contact IDs
- `subject`: required, max 120 characters
- `body`: required, max 20,000 characters

Supported merge tokens:

- `{{firstName}}`
- `{{lastName}}`
- `{{fullName}}`
- `{{organizationName}}`
- `{{email}}`

The route must:

- require `donors:edit`
- require `hasAutomationEmails`
- resolve only contacts in the active org
- ignore soft-deleted contacts
- skip missing-email and opted-out contacts
- not log failed sends as successful communications

## Web

Add `/donors/email`.

The page should:

- list donor records with email and pipeline stage
- let staff select recipients
- show how many selected donors have email addresses
- let staff edit subject and body
- show supported merge tokens
- send the batch
- show sent, skipped, and failed counts

## Marketing

Add `/features/outbound-donor-email-mail-merge`.

The page must:

- state this is for selected donor email, not a full marketing automation suite
- explain that successful sends are saved on donor communication timelines
- avoid claims about sequences, scheduling, deliverability optimization, or
  automated unsubscribe handling
- connect the feature to donor records and retention work

## Acceptance criteria

- Editors and admins can send a donor email batch.
- Viewers cannot send donor email.
- Starter-plan orgs receive an upgrade response.
- Unsupported merge tokens fail validation.
- Donors without email addresses or marked opt-out are skipped.
- Resend failures are returned per recipient.
- Successful sends create donor communication log rows.
- The donor email page is reachable from the Fundraising nav for donor editors.
- The public feature page exists and passes site contracts.
