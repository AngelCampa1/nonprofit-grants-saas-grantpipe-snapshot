# Feature #12: Board Member Portal

Status: in build. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 3 #12.

## Problem

GrantPipe can now build a board packet from live records. Staff still need a
safe way to share that packet.

Email and shared drives make that harder than it should be. A board member may
need the final PDF, a finance bundle, or a few supporting records. They do not
need donor lists, team settings, billing, or the full app.

## Scope

Build on the existing external reviewer portal.

1. Treat `reviewerType = "board"` as a first-class portal audience.
2. Give board reviewers a board-specific portal home.
3. Pull scoped generated reports and evidence bundles into a Board packets
   section.
4. Show any other scoped records under Other shared records.
5. Keep signed-link access, session expiry, and audit logging unchanged.
6. Keep the main app role model unchanged.
7. Explain in portal settings that board members can use portal access for
   board packets.
8. Market the feature as a public feature page.

## Non-goals

- A persistent board member app account.
- A new `board` application role.
- Board meeting minutes, voting, or agenda management.
- Automatic packet email delivery.
- A custom board governance system.
- Broader access to donor, billing, settings, or team areas.

## Data model

No new tables are required for this slice.

GrantPipe already supports:

- `external_reviewers.reviewerType = "board"`
- `evidence_bundles.purpose = "board_review"`
- generated reports as scoped portal targets
- evidence bundles as scoped portal targets
- view and download audit events

## API

No new API primitives are required for this slice.

The portal keeps using:

- `POST /public/portal/auth`
- `GET /public/portal/session`
- `GET /public/portal/generated-reports/:id`
- `GET /public/portal/generated-reports/:id/download`
- `GET /public/portal/bundles/:id`
- scoped record read endpoints for grants, funds, programs, documents, and
  restriction terms

All portal reads must continue to call the existing scope checks before data is
returned.

## Web

The `/portal/home` page should branch by reviewer type.

For board reviewers:

- Heading: Board portal
- Welcome line with the reviewer name
- Session purpose when present
- Board packets section for generated reports and evidence bundles
- Other shared records section for any remaining scoped records
- Board-specific empty state when no records are shared

For non-board reviewers, keep the existing grouped record view.

## Marketing

Add a feature page at `/features/board-member-portal`.

The page must:

- Explain that board members use a signed portal link, not a full app account.
- Connect the feature to Board Packet Composer.
- State that staff choose exactly what the board member can see.
- State that portal activity is logged.
- Avoid claims about minutes, voting, or board management features that do not
  ship.

## Acceptance criteria

- Admins can add a board reviewer from the existing reviewer type selector.
- The portal settings page explains board packet use.
- A board reviewer sees Board portal as the page heading.
- Scoped generated reports and evidence bundles appear under Board packets.
- Other scoped records remain accessible under Other shared records.
- Unsupported scoped records still render as disabled cards instead of broken
  links.
- Existing auditor and funder portal sessions keep the prior grouped layout.
- The public feature page exists and is linked from the product capability map.
