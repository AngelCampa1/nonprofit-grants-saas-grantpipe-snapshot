# Wave 0.3 Multi-Entity Architecture

Date: 2026-06-25

Status: design spike complete, implementation not complete.

This document defines the first safe architecture for roadmap item 0.3:
multi-client/entity support for fiscal sponsors, related legal entities,
agency-style client work, and future consolidated roll-up reporting.

## Decision

Keep `organizations` as the account, billing, subscription, and top-level
security boundary. Add a separate entity/client layer underneath it.

That means:

- `org_id` remains the account boundary for billing, trial state, team ownership,
  subscription gates, and existing tenant safety.
- `entity_id` becomes the client/data boundary for records that belong to a
  legal entity, sponsored project, agency client, or consolidation node.
- Roll-up reporting is an explicit read mode over authorized entities. It is not
  a broad replacement of `eq(table.orgId, orgId)` with `IN accessibleOrgIds`.
- Every existing organization gets one default entity during migration so
  current single-org customers keep working without choosing an entity.

## Current State

The current data model is flat:

- `packages/db/src/schema/auth.ts` stores `organizations`, `org_members`,
  `invite_links`, and trial email scheduling as direct `org_id` relationships.
- `apps/api/src/app.ts` resolves a single active organization from the Better
  Auth session, optional `X-Org-Id`, and `org_members`.
- `apps/web/src/lib/org-context.ts` stores `grantpipe.activeOrgId` and sends it
  as `X-Org-Id`.
- `/api/auth/session` returns one `orgId`, one `memberRole`, and one permission
  map.
- `/api/org/memberships` returns direct organization memberships for the current
  org switcher.

This already supports a user belonging to more than one organization. It does
not support multiple client entities inside one paid sponsor/account, per-client
membership, or consolidated roll-up views.

## Entity Model

Add an entity layer under each organization.

Recommended first schema:

- `entities`
  - `id`
  - `org_id`
  - `parent_entity_id`
  - `kind`: `root`, `legal_entity`, `sponsored_project`, `agency_client`,
    `consolidation_group`
  - `fiscal_sponsor_model`: `none`, `model_a`, `model_c`
  - `name`
  - `slug`
  - `ein`
  - `fiscal_year_start_month`
  - `timezone`
  - `status`: `active`, `archived`
  - `created_at`, `updated_at`, `deleted_at`
- `entity_members`
  - `id`
  - `entity_id`
  - `org_member_id`
  - `role`
  - `permissions`
  - `can_view_rollup`
  - `created_at`, `updated_at`, `deleted_at`

The first migration should also add an organization-level pointer to the default
entity, either `organizations.default_entity_id` or a unique `entities` row with
`kind = 'root'` and a stable lookup helper. A pointer makes request context
resolution simpler and avoids repeated default-row queries.

## Context Contract

The current request context should evolve from:

- `orgId`
- `memberRole`
- `memberPermissions`
- `orgSubscription`

to:

- `orgId`: account/billing boundary.
- `entityId`: active client/data boundary.
- `entityScope`: `single` or `rollup`.
- `availableEntities`: entities the current user can access.
- `memberRole` and `memberPermissions`: account-level role for existing
  compatibility.
- `entityRole` and `entityPermissions`: data-boundary role for entity-owned
  routes.
- `orgSubscription`: unchanged, still resolved from `organizations`.

The web client should add a separate active entity selection key instead of
overloading `grantpipe.activeOrgId`.

Recommended key:

- `grantpipe.activeEntityId`

Recommended header:

- `X-Entity-Id`

`X-Org-Id` keeps its current meaning: choose the paid account/organization.
`X-Entity-Id` chooses the active client/entity within that organization.

## Role Model

Do not replace the existing organization roles in the first slice. Extend around
them.

Account-level roles:

- `admin`: manages billing, settings, team, entities, and default access.
- `editor`, `viewer`, `auditor`: keep current behavior.

Entity-level roles:

- `entity_admin`: manages one entity/client and its invited users.
- `entity_editor`: edits entity-owned operational records.
- `entity_viewer`: reads entity-owned operational records.
- `entity_auditor`: reads grants, funds, documents, compliance, accounting,
  reports, and evidence for one entity.
- `rollup_viewer`: reads roll-up dashboards/reports but cannot mutate child
  entity data.

The first implementation can encode these as shared constants and validators
without migrating every route to enforce them immediately. Enforcement must be
proven in the migrated pilot slice before public claims go live.

## Entity Access Management

Entity access must be managed as a first-class part of the foundation, not as a
later shell-only concern.

Required first-slice rules:

- Existing active organization members are backfilled onto the default entity so
  current customers keep the same access after migration.
- Organization admins can assign and revoke entity access for existing members.
- Invite acceptance can place a new user into a specific entity/client without
  granting access to sibling entities.
- Client-only users can authenticate, see the active entity they were invited
  into, and cannot discover sibling entity names through session payloads,
  denied switches, analytics, or Sentry events.
- Every active entity keeps at least one entity admin or organization admin with
  access. Archive and membership-removal flows must enforce that invariant.
- Team UI needs an entity access matrix before public "client user" claims can
  ship.

## First Pilot Slice

The first implementation after the design spike should not migrate every table.
It should prove the foundation:

1. Schema: entities, entity_members, default entity backfill, migration metadata.
2. API context: central org/entity resolver used by `app.ts` and tests.
3. Session: `/auth/session` exposes active entity and available entities.
4. Org settings: list/create/update/archive entities behind admin permission.
5. Entity access management: member assignment, entity-scoped invite
   acceptance, client-only onboarding, and last-admin invariants.
6. Web shell: visible entity switcher and query-cache invalidation.
7. Pilot data isolation: migrate the grants domain graph, including funders,
   funder contacts, grants, funds, allocations, expenses, budgets, impact
   metrics, closeout records, summaries, and activity log records that touch
   those objects.

Roll-up reporting comes after the pilot isolation work. It should use explicit
roll-up services and tests.

## Data Boundary Priority

High-priority entity-owned tables:

- grants, funds, funders, expenses, budgets, grant allocations.
- contacts, donations, pledges, recurring gifts.
- documents, document extractions, external reviewer scopes.
- accounting fiscal periods, chart accounts, journal entries, journal lines,
  bank accounts, transactions, QBO mappings.
- reports, report templates, saved reports, generated reports.
- activity log, custom fields, imports, notifications, AI usage records.

Do not migrate all of these in one change. Every migrated family needs:

- backfill tests.
- isolation tests.
- route tests for unauthorized entity access.
- activity log context tests.
- analytics/Sentry privacy checks.

## Public Claim Gate

Public fiscal-sponsor, agency, or multi-entity copy stays gated until the
following are real:

- entity/client setup UI.
- entity-level memberships and permissions.
- shell entity switcher.
- one migrated operational slice with isolation tests.
- explicit roll-up read path with authorization tests.
- plan availability reconciled to pricing constants.

Current marketing content that mentions multi-entity consolidation must be
treated as drafted claim copy, not shipped-product proof.
