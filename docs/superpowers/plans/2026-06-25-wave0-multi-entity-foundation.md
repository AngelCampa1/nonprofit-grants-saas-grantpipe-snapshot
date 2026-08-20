# Wave 0.3 Multi-Entity Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the safe foundation for multi-client/entity support without weakening current org-level tenant isolation.

**Architecture:** Keep `organizations` as the billing/account boundary and add an entity/client layer beneath it. Add the context contract, admin setup surface, shell switcher, and one migrated pilot slice before any roll-up claims go live.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, Neon Postgres, React 19, TanStack Router, TanStack Query, Vitest, Cloudflare Workers/Pages.

---

## Non-Goals For This Plan

- Do not publish public multi-entity claims as shipped.
- Do not implement broad roll-up reporting in the first code slice.
- Do not change Stripe, trial, or subscription ownership away from
  `organizations`.
- Do not migrate every `org_id` table in one pass.

## Required Reading

- `docs/offers/wave0-multi-entity-architecture.md`
- `docs/offers/copy-gates/wave0-multi-entity-claims-ledger.md`
- `docs/offers/MASTER-BUILD-ROADMAP.md`
- `packages/db/src/schema/auth.ts`
- `apps/api/src/app.ts`
- `apps/api/src/middleware/org-context.ts`
- `apps/api/src/domains/auth/routes.ts`
- `apps/api/src/domains/org/routes.ts`
- `apps/web/src/lib/org-context.ts`
- `apps/web/src/components/shell/user-menu.tsx`

## Task 0: Existing Marketing Claim Quarantine

This runs before implementation work because existing multi-entity marketing
knowledge is already a known public-risk source.

**Files:**

- Modify:
  `packages/shared/src/knowledge/marketing/content/features/multi-entity-consolidation.md`
- Modify affected marketing knowledge tests or snapshots.
- Modify: `docs/offers/copy-gates/wave0-multi-entity-claims-ledger.md`

- [x] **Step 1: Write failing copy/knowledge tests or snapshot checks**

Completed in commit `9ce15ee6` and merge `2a859696`.
`packages/shared/src/knowledge/marketing/__tests__/multi-entity-claim-gate.test.ts`
guards the source feature page and generated knowledge index against
shipped-sounding multi-entity claims.

Cover:

- no published copy says multi-entity consolidation is shipped.
- no published copy mentions a `Professional` plan.
- no published copy claims client-only access, roll-up reporting, inter-entity
  eliminations, or shared donor records until the claims ledger marks them
  supported.

- [x] **Step 2: Quarantine unsupported claims**

Completed in commit `9ce15ee6` and merge `2a859696`. The public feature page is
now planned-only copy with `status: planned`, contact/evaluate CTA mode, and
`noindex: true`. The site route passes `noindex` through to `ArticleLayout`, and
the sitemap config excludes `/features/multi-entity-consolidation/`.

Move the current feature page into draft/internal knowledge status, or rewrite
it as a clearly planned capability using only ledger-approved claims. Do not use
unsupported plan names.

- [x] **Step 3: Run copy gates**

Run `humanizer`, `third-grade-copy`, zero-lies review, and contextual fit review
for any buyer-facing replacement copy.

Evidence:

- `humanizer`/AI-copy contract: `pnpm --filter @grantpipe/site test -- src/feature-landing-pages-contract.test.ts`
- `third-grade-copy`: focused `evaluate_copy.py` pass; it warned only on a
  grade 4.2 estimate from required domain terms.
- zero-lies/contextual fit: sub-agent review found no remaining unsupported
  shipped claims for multi-entity, fiscal sponsors, roll-up/group reporting,
  client switching, client-only access, donor sharing, or lower-than-Enterprise
  plan access.
- live verification after deploy: the feature page returned `200`, included
  `noindex, follow`, said the feature is planned/not live, and was absent from
  the sitemap.

## Task 1: Schema Foundation

**Files:**

- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/schema/auth.test.ts`
- Modify: `packages/db/src/migrations.test.ts`
- Create: `packages/db/src/migrations/<next>_multi_entity_foundation.sql`

- [x] **Step 1: Write failing schema tests**

Completed in commit `e863e7ee` and merge `b4d84531`. The initial focused
run failed against the missing schema and migration surface before
implementation.

Add tests proving:

- `entities.orgId` references `organizations.id`.
- `entities.parentEntityId` is nullable and self-referential.
- `entities.kind`, `entities.status`, and `entities.fiscalSponsorModel` exist.
- `entityMembers.entityId` references `entities.id`.
- `entityMembers.orgMemberId` references `orgMembers.id`.
- `organizations.defaultEntityId` exists and references `entities.id`.
- `inviteLinks.entityId` is nullable and references `entities.id`.
- the migration backfills one `entityMembers` row for every active
  non-deleted `orgMembers` row on the organization's default entity.
- invite link rows can preserve the entity scope needed for client-only invite
  acceptance.

Run:

```bash
pnpm --filter @grantpipe/db test -- src/schema/auth.test.ts src/migrations.test.ts
```

Expected: fail because the tables/columns do not exist.

- [x] **Step 2: Implement schema and migration**

Completed in commit `e863e7ee` and merge `b4d84531`. Migration
`0072_multi_entity_foundation.sql` adds `entities`, `entity_members`,
`organizations.default_entity_id`, and nullable `invite_links.entity_id`;
backfills one active root entity per non-deleted organization; assigns that
entity as the organization default; and backfills one entity member per active
organization member. The migration also adds same-org composite guardrails for
parent entities, entity members, entity-scoped invites, and organization
default entities.

Add `entities`, `entityMembers`, and `organizations.defaultEntityId`.

Migration rules:

- Create one active root entity for every existing non-deleted organization.
- Set `organizations.default_entity_id` to that entity.
- Create one active `entity_members` row for every active non-deleted
  organization member on the default entity.
- Map current org roles to default entity roles so existing admins, editors,
  viewers, and auditors keep equivalent access after entity enforcement starts.
- Add nullable `invite_links.entity_id` for future entity-scoped invites. Leave
  existing org-wide invite links null.
- Do not drop or rename `org_id`.
- Keep the migration idempotent where possible for local reruns.

- [x] **Step 3: Verify schema tests pass**

Evidence:

- `pnpm --filter @grantpipe/db test -- src/schema/auth.test.ts src/migrations.test.ts`
  passed with 33 tests.
- `pnpm --filter @grantpipe/db typecheck` passed.
- Pre-commit affected-package gates passed for `@grantpipe/db` and
  `@grantpipe/api`, including DB coverage and API coverage.
- Review found the initial cross-org FK risk; the implementation was fixed with
  same-org composite constraints and re-reviewed clean.
- `pnpm run deploy:api` applied the production migration and deployed
  `grantpipe-api-production` version `ba75441a-e843-4833-a384-359c7600a7dd`.
- Post-deploy live check on 2026-06-25:
  `https://app.grantpipe.com/api/health` returned `200` with
  `{"status":"ok"}`.

Run:

```bash
pnpm --filter @grantpipe/db test -- src/schema/auth.test.ts src/migrations.test.ts
pnpm --filter @grantpipe/db typecheck
```

Expected: pass.

## Task 2: Shared Entity Types And Validators

**Files:**

- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/validators/org.ts`
- Modify: `packages/shared/src/validators/org.test.ts`
- Modify: `packages/shared/src/validators/index.ts`
- Modify: `packages/shared/src/constants/analytics.ts`
- Modify: `packages/shared/src/constants/analytics.test.ts`

- [x] **Step 1: Write failing shared tests**

Completed in commit `00e86bd2` and merge `d8f2c8a9`. The initial focused run
failed because the entity constants, validators, and analytics events did not
exist.

Add tests for:

- allowed entity kinds: `root`, `legal_entity`, `sponsored_project`,
  `agency_client`, `consolidation_group`.
- fiscal sponsor models: `none`, `model_a`, `model_c`.
- entity role labels and permission defaults.
- create/update entity validator rejects blank names, invalid kinds, and Model A
  on non-sponsored-project entities.
- analytics constants include entity create/update/archive, entity switch,
  denied entity switch, and roll-up report generated.

Run:

```bash
pnpm --filter @grantpipe/shared test -- src/validators/org.test.ts src/constants/analytics.test.ts
```

Expected: fail because constants and schemas do not exist.

- [x] **Step 2: Implement shared contracts**

Completed in commit `00e86bd2` and merge `d8f2c8a9`. Shared exports now define
entity kinds, statuses, fiscal sponsor models, entity roles, entity labels,
entity permission defaults, entity create/update/list/access validators, and
multi-entity analytics events. Review fixes preserved `undefined` on omitted
`parentEntityId` updates and require an explicit `fiscalSponsorModel: "none"`
when changing an entity away from `sponsored_project`.

Add exported constants/types:

- `ENTITY_KINDS`
- `FISCAL_SPONSOR_MODELS`
- `ENTITY_ROLES`
- `ENTITY_STATUSES`
- `EntityKind`
- `FiscalSponsorModel`
- `EntityRole`
- `EntityStatus`

Add org validators:

- `createEntitySchema`
- `updateEntitySchema`
- `entityListQuerySchema`
- `entityAccessSchema`

- [x] **Step 3: Verify shared tests pass**

Evidence:

- `pnpm --filter @grantpipe/shared test -- src/validators/org.test.ts src/constants/analytics.test.ts`
  passed with 34 tests.
- `pnpm --filter @grantpipe/shared typecheck` passed.
- `pnpm --filter @grantpipe/shared test:coverage` passed with 1,646 tests;
  touched shared files reported 100% coverage.
- Spec review and code-quality review were clean after fixes.
- `pnpm run deploy:changed` deployed API, web, and site because shared-package
  contracts feed all three apps.
- Post-deploy live checks on 2026-06-25 returned 200 for
  `https://app.grantpipe.com/api/health`, `https://app.grantpipe.com`, and
  `https://grantpipe.com`.

Run:

```bash
pnpm --filter @grantpipe/shared test -- src/validators/org.test.ts
pnpm --filter @grantpipe/shared typecheck
```

Expected: pass.

## Task 3: Central Org And Entity Context Resolver

**Files:**

- Create: `apps/api/src/middleware/org-entity-context.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/types.ts`
- Modify: `apps/api/src/middleware/org-context.test.ts`
- Create: `apps/api/src/middleware/org-entity-context.test.ts`
- Modify: `apps/api/src/domains/auth/routes.ts`
- Modify: `apps/api/src/domains/auth/routes.test.ts`

- [x] **Step 1: Write failing resolver tests**

Completed in commit `df0939fe` and merge `2fb32421`. The initial focused
resolver run failed against the missing `org-entity-context` middleware before
implementation. Regression tests now cover default-entity selection, explicit
org/entity switches, blank explicit header fail-closed behavior, missing default
entity configuration, inactive/default entity failures, soft-deleted entity
memberships, Sentry sanitization, and full context shape.

Cover:

- no `X-Org-Id` uses latest joined organization and its default entity.
- valid `X-Org-Id` keeps current behavior.
- invalid `X-Org-Id` returns 403.
- valid `X-Entity-Id` requires access to that entity in the active org.
- invalid `X-Entity-Id` returns 403 and does not fall back.
- request context includes `orgId`, `entityId`, `entityScope`, `memberRole`,
  `memberPermissions`, `entityRole`, `entityPermissions`, and
  `orgSubscription`.

Run:

```bash
pnpm --filter @grantpipe/api test -- src/middleware/org-entity-context.test.ts src/app.test.ts
```

Expected: fail because resolver/context fields do not exist.

- [x] **Step 2: Implement resolver**

Completed in commit `df0939fe` and merge `2fb32421`. `apps/api/src/app.ts`
now mounts `orgEntityContextMiddleware` after session-only auth routes. The
resolver keeps `X-Org-Id` as the account boundary, adds `X-Entity-Id` as the
data boundary, defaults to `organizations.default_entity_id`, validates active
entities and entity memberships inside the active org, sets org and entity
roles/permissions in Hono context, and fails closed without leaking entity
names. Denied entity switches and missing/default entity failures are captured
through Sentry with sanitized IDs only.

Review found two edge cases before merge: blank explicit org headers could have
fallen back, and the `plan_selected_at` compatibility SQL could still assume
`default_entity_id` existed. Both were fixed and re-reviewed clean; tests now
prove blank explicit `X-Org-Id`/`X-Entity-Id` fail closed and older fallback
metadata returns a null default entity so the resolver returns 403 instead of 500.

Move the inline `app.ts` org membership lookup into a tested resolver that also
loads default/active entity context. Keep public routes unchanged.

Rules:

- `X-Org-Id` selects the account boundary.
- `X-Entity-Id` selects the data boundary inside the active account.
- Missing `X-Entity-Id` selects the org default entity.
- Roll-up mode is not enabled by default.
- All errors use existing 403 patterns and avoid leaking entity names.
- Denied entity switches are captured in Sentry with sanitized org/entity ids,
  requested scope, and no entity names or EINs.
- Resolver failures for missing default entities are captured as configuration
  errors and fail closed.

- [x] **Step 3: Wire app and verify**

Evidence:

- `pnpm --filter @grantpipe/api test -- src/middleware/org-entity-context.test.ts src/app.test.ts src/domains/auth/routes.test.ts src/middleware/org-context.test.ts`
  passed with 109 tests.
- `pnpm --filter @grantpipe/api typecheck` passed.
- `pnpm --filter @grantpipe/api test:coverage` passed; touched API files met
  per-file coverage thresholds.
- Code review and follow-up verification review were clean after fixes.
- Pre-commit affected-package hooks reran API typecheck and API coverage.
- `pnpm run deploy:api` applied migrations and deployed
  `grantpipe-api-production` version `fe519c3e-13dc-4a59-85df-eb675c8fd128`.
- Post-deploy live check on 2026-06-24:
  `https://app.grantpipe.com/api/health` returned `200` with
  `{"status":"ok"}`.

Run:

```bash
pnpm --filter @grantpipe/api test -- src/middleware/org-entity-context.test.ts src/app.test.ts
pnpm --filter @grantpipe/api typecheck
```

Expected: pass.

## Task 4: Session And Membership Contract

**Files:**

- Modify: `apps/api/src/domains/auth/routes.ts`
- Modify: `apps/api/src/domains/auth/routes.test.ts`
- Modify: `apps/api/src/domains/org/routes.ts`
- Modify: `apps/api/src/domains/org/routes.test.ts`
- Modify: `apps/web/src/hooks/use-session.ts`
- Modify: `apps/web/src/hooks/use-session.test.ts`
- Modify: `apps/web/src/hooks/use-org-settings.ts`
- Modify: `apps/web/src/hooks/use-org-settings.test.ts`

- [x] **Step 1: Write failing API/web tests**

Completed in commit `d69b0734`. The initial Task 4 red run failed because
`/auth/session` did not return `activeEntity` or `availableEntities`,
`/org/memberships` did not include active-org entity summaries, and
`useSession` dropped the entity context fields.

Assert `/auth/session` returns:

- `activeEntity`
- `availableEntities`
- `entityScope`
- `entityRole`
- `entityPermissions`

Assert `/org/memberships` continues returning org memberships and also includes
entity access summaries for the active org.

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/auth/routes.test.ts src/domains/org/routes.test.ts
pnpm --filter @grantpipe/web test -- src/hooks/use-session.test.ts src/hooks/use-org-settings.test.ts
```

Expected: fail.

- [x] **Step 2: Implement API and hook contracts**

Completed in commit `d69b0734`. `apps/api/src/lib/entity-access.ts` centralizes
entity access serialization for the session and membership routes, preserves
the existing org/session fields, computes effective entity permissions, filters
inactive/deleted related entities, and limits `/org/memberships` entity access
to the active organization. The web `useSession` and `useUserMemberships`
hooks now expose the new fields with null/empty-array defaults.

Add response fields without removing existing fields. Existing UI should keep
working if it ignores the new fields.

- [x] **Step 3: Verify**

Evidence:

- Red tests before implementation:
  `pnpm --filter @grantpipe/api test -- src/domains/auth/routes.test.ts src/domains/org/routes.test.ts`
  failed with 3 expected contract failures; `pnpm --filter @grantpipe/web test -- src/hooks/use-session.test.ts src/hooks/use-org-settings.test.ts`
  failed because `useSession` did not expose `entityScope`.
- Green tests after implementation:
  `pnpm --filter @grantpipe/api test -- src/domains/auth/routes.test.ts src/domains/org/routes.test.ts src/lib/entity-access.test.ts`
  passed with 47 tests; `pnpm --filter @grantpipe/web test -- src/hooks/use-session.test.ts src/hooks/use-org-settings.test.ts`
  passed with 38 tests.
- Commit-hook coverage initially exposed app-level session tests that still
  mocked only `entityMembers.findFirst`; the fix now stores `orgMemberId` in
  request context and updates the app test harness for `entityMembers.findMany`.
  `pnpm --filter @grantpipe/api test -- src/domains/auth/routes.test.ts src/domains/org/routes.test.ts src/lib/entity-access.test.ts src/app.test.ts src/middleware/org-entity-context.test.ts`
  passed with 150 tests.
- Typechecks passed:
  `pnpm --filter @grantpipe/api typecheck` and
  `pnpm --filter @grantpipe/web typecheck`.
- Lint passed:
  `pnpm --filter @grantpipe/api lint` and
  `pnpm --filter @grantpipe/web lint`.
- Focused coverage passed for touched helper and hooks:
  `pnpm --filter @grantpipe/api exec vitest run --coverage src/lib/entity-access.test.ts --coverage.include=src/lib/entity-access.ts`
  reported 100% for `entity-access.ts`;
  `pnpm --filter @grantpipe/web exec vitest run --coverage --maxWorkers=1 --pool=forks --no-file-parallelism src/hooks/use-session.test.ts src/hooks/use-org-settings.test.ts --coverage.include=src/hooks/use-session.ts --coverage.include=src/hooks/use-org-settings.ts`
  reported 100% lines for both touched hook files.
- Full API coverage passed after adding branch coverage for the middleware
  `orgMemberId` path and the no-active-org membership path:
  `pnpm --filter @grantpipe/api test:coverage`.
- Review sub-agent found no correctness, tenant-isolation,
  backward-compatibility, TypeScript, or Task 5 scope issues.
- `git diff --check` passed. Repo-wide `pnpm format:check` still fails on
  pre-existing unrelated files; touched files were formatted directly with
  Prettier.
- `pnpm run deploy:api` deployed `grantpipe-api-production` version
  `43c6df38-e7cf-432e-bdd8-ac80076b0db6`; `pnpm run deploy:web` deployed
  `grantpipe-web` version `ec276f11-f161-4f2d-9706-c29755933fcc`.
- Post-deploy live checks on 2026-06-25 returned 200 for
  `https://app.grantpipe.com/api/health` with `{"status":"ok"}` and
  `https://app.grantpipe.com`.

Run the same API/web tests plus typecheck:

```bash
pnpm --filter @grantpipe/api typecheck
pnpm --filter @grantpipe/web typecheck
```

Expected: pass.

## Task 5: Admin Entity Settings Surface

**Files:**

- Create: `apps/web/src/routes/_authenticated/settings.entities.tsx`
- Create: `apps/web/src/routes/_authenticated/settings.entities.test.tsx`
- Modify: `apps/web/src/routeTree.gen.ts` only through the router generator.
- Modify: `apps/web/src/config/nav.ts`
- Modify: `apps/api/src/domains/org/routes.ts`
- Modify: `apps/api/src/domains/org/service.ts`
- Modify: `apps/api/src/domains/org/service.test.ts`
- Modify: `apps/api/src/domains/org/routes.expanded.test.ts`

- [x] **Step 1: Write failing API tests**

Cover list/create/update/archive entity routes:

- admin can create an entity.
- non-admin cannot create an entity.
- entity names are not sent to analytics.
- create/update/archive failures are captured in Sentry with sanitized ids and
  route/action tags.
- archive refuses the default entity.
- archive refuses the last active entity.

- [x] **Step 2: Write failing web tests**

Cover:

- settings navigation includes `Entities` only for admins.
- empty state explains that the current organization starts with one default
  entity.
- create form supports related legal entity, sponsored project, and agency
  client.
- Model A/Model C field appears only for sponsored project.

- [x] **Step 3: Implement API and UI**

Use pill buttons to match GrantPipe design canon. Keep the surface quiet and
operational, not marketing-heavy.

- [x] **Step 4: Verify**

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/org/service.test.ts src/domains/org/routes.expanded.test.ts
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.entities.test.tsx src/config/nav.test.ts
pnpm --filter @grantpipe/web typecheck
```

Expected: pass.

- Evidence: shipped in commit `f5a15133`. The admin entity settings surface
  added entity list/create/update/archive routes, a settings entities page,
  admin-only navigation, default/last-active archive protections, and
  privacy-safe analytics/Sentry capture. Local verification covered targeted
  API service/routes tests, web settings entities/navigation tests, and web
  typecheck.

## Task 6: Entity Membership And Client Access Management

**Files:**

- Modify: `apps/api/src/domains/org/routes.ts`
- Modify: `apps/api/src/domains/org/service.ts`
- Modify: `apps/api/src/domains/org/service.test.ts`
- Modify: `apps/api/src/domains/org/routes.expanded.test.ts`
- Modify: `apps/api/src/domains/auth/routes.ts`
- Modify: `apps/api/src/domains/auth/routes.test.ts`
- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/db/src/schema/auth.test.ts`
- Modify: `packages/db/src/migrations.test.ts`
- Modify: `packages/shared/src/validators/org.ts`
- Modify: `packages/shared/src/validators/org.test.ts`
- Modify: `apps/web/src/routes/_authenticated/settings.team.tsx`
- Modify: `apps/web/src/routes/_authenticated/settings.team.test.tsx`
- Modify: `apps/web/src/routes/_authenticated/settings.entities.tsx`
- Modify: `apps/web/src/routes/_authenticated/settings.entities.test.tsx`

- [x] **Step 1: Write failing API tests**

Cover:

- migration/backfill grants every active org member access to the default
  entity with a role that matches their current org role.
- org admin can assign, update, and revoke entity access for existing members.
- non-admin cannot manage entity access.
- entity admin can manage users only inside their entity when explicitly
  granted that permission.
- entity-scoped invite acceptance creates an org member and one entity member
  without granting sibling entity access.
- invite create/read/accept routes preserve nullable `inviteLinks.entityId` and
  reject entity ids outside the active org.
- client-only user session returns only the invited entity and does not leak
  sibling entity names.
- revoking the final entity admin is refused.
- archiving an entity without a remaining admin path is refused.

Run:

```bash
pnpm --filter @grantpipe/api test -- src/domains/org/service.test.ts src/domains/org/routes.expanded.test.ts src/domains/auth/routes.test.ts
pnpm --filter @grantpipe/shared test -- src/validators/org.test.ts
```

Expected: fail.

- [x] **Step 2: Write failing web tests**

Cover:

- team settings show an entity access matrix for admins.
- assigning entity access uses existing member rows and does not create a
  parallel team system.
- client-only users do not see organization-wide team controls.
- visible copy says "client" or "entity" only where the current plan supports
  the feature.

Run:

```bash
pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.team.test.tsx src/routes/_authenticated/settings.entities.test.tsx
```

Expected: fail.

- [x] **Step 3: Implement entity access management**

Rules:

- Keep organization membership as the account/team root.
- Use `entity_members` for entity/client access.
- Use `invite_links.entity_id` as the durable entity scope for client-only
  invites.
- Do not grant sibling entity access as a side effect of invite acceptance.
- Do not expose entity names in analytics or Sentry for denied access.
- Capture denied assignment, denied revoke, failed invite acceptance, and
  last-admin invariant failures in Sentry with sanitized ids.

- [x] **Step 4: Verify**

Run the API, shared, and web tests from Steps 1 and 2 plus:

```bash
pnpm --filter @grantpipe/api typecheck
pnpm --filter @grantpipe/web typecheck
```

Expected: pass.

- Evidence: branch `codex/roadmap-wave03-entity-access` added
  entity-scoped invites, invite acceptance that grants one entity membership
  without sibling access, org-admin entity access management, active-entity
  manager access limited by `entityTeam: manage`, full effective entity
  permission maps in API/client responses, final-admin protections, and
  sanitized PostHog/Sentry hooks. Local verification passed targeted shared,
  API, and web tests; API/web/shared typechecks; and API/web/shared lint.

## Task 7: Shell Entity Switcher

**Files:**

- Modify: `apps/web/src/lib/org-context.ts`
- Modify: `apps/web/src/lib/org-context.test.ts`
- Modify: `apps/web/src/lib/api-client.test.ts`
- Modify: `apps/web/src/components/shell/user-menu.tsx`
- Modify: `apps/web/src/components/shell/user-menu.test.tsx`
- Modify: `apps/web/src/lib/analytics.ts`
- Modify: `apps/web/src/lib/analytics.test.ts`
- Modify: `apps/web/src/lib/sentry.ts`
- Modify: `apps/web/src/lib/sentry.test.ts`

- [x] **Step 1: Write failing tests**

Completed on branch `codex/roadmap-wave03-shell-switcher`. The initial
focused run failed against the missing active entity header, stale entity clear,
entity switcher, entity analytics context, and sanitized entity switch failure
coverage before implementation.

Cover:

- `grantpipe.activeEntityId` is sent as `X-Entity-Id`.
- switching entities clears TanStack Query cache.
- switching org clears stale entity selection.
- analytics identify/group state includes active entity id only as an id, never
  entity name.
- denied or failed switches capture sanitized Sentry context and never include
  entity names.

- [x] **Step 2: Implement switcher**

Implemented on branch `codex/roadmap-wave03-shell-switcher`. The shell now
persists `grantpipe.activeEntityId`, sends `X-Entity-Id`, clears stale entity
selection on org switch, renders a visible entity section when multiple session
entities are available, clears TanStack Query cache on entity switch, tracks
entity switch analytics with IDs only, and captures denied/failed switch
failures through sanitized Sentry context without entity names.

Add a visible entity/client section when the session exposes more than one
available entity. Keep the existing organization switcher intact.

- [x] **Step 3: Verify**

Evidence:

- Red tests before implementation:
  `pnpm --filter @grantpipe/web test -- src/lib/org-context.test.ts src/lib/api-client.test.ts src/components/shell/user-menu.test.tsx src/lib/analytics.test.ts src/lib/sentry.test.ts`
  failed with the expected missing shell entity switcher contract.
- Green focused tests:
  `pnpm --filter @grantpipe/web test -- src/lib/org-context.test.ts src/lib/api-client.test.ts src/components/shell/user-menu.test.tsx src/lib/analytics.test.ts src/lib/sentry.test.ts`
  passed with 151 tests.
- `pnpm --filter @grantpipe/web typecheck` passed.
- `pnpm --filter @grantpipe/web lint` passed.
- `pnpm --filter @grantpipe/web build` passed and verified analytics build
  vars.
- `pnpm --filter @grantpipe/web test:coverage` passed the full web suite and
  per-file threshold verifier.

Run:

```bash
pnpm --filter @grantpipe/web test -- src/lib/org-context.test.ts src/lib/api-client.test.ts src/components/shell/user-menu.test.tsx src/lib/analytics.test.ts src/lib/sentry.test.ts
pnpm --filter @grantpipe/web typecheck
```

Expected: pass.

## Task 8: Grants Domain Graph Entity Isolation

**Files:**

- Modify: `packages/db/src/schema/grants.ts`
- Modify: `packages/db/src/schema/grants.test.ts`
- Create: `packages/db/src/migrations/<next>_grants_domain_entity_scope.sql`
- Modify: `apps/api/src/domains/grants/service.ts`
- Modify: `apps/api/src/domains/grants/service.test.ts`
- Modify: `apps/api/src/domains/grants/routes.ts`
- Modify: `apps/api/src/domains/grants/routes.test.ts`
- Modify: `apps/api/src/domains/funds` files if funds live in a separate domain;
  otherwise update the current grants/funds domain files.
- Modify: funder, allocation, expense, budget, impact metric, closeout, summary,
  and activity-log tests wherever those records are defined.

- [x] **Step 1: Write failing isolation tests**

Completed in commit `65f8cc44` and merge `7c5ceab7`. The initial focused
grants-domain runs failed against missing entity columns/scope checks before
implementation. Follow-up Task 9 hardening added the grants 4xx Sentry capture
path for denied reads and cross-entity not-found paths with entity id/scope
tags only.

Cover:

- grants, funds, funders, funder contacts, allocations, expenses, budgets,
  impact metrics, closeout records, and summaries created in active entity
  receive `entityId`.
- list/read/update/delete only return active entity records.
- sibling entity records are invisible.
- a grant cannot link to a funder, fund, allocation, expense, or child record
  from another entity.
- roll-up mode is not available through normal grants/funds routes.
- activity log includes entity id.
- cross-entity link attempts and denied reads are captured in Sentry with
  sanitized ids.

- [x] **Step 2: Implement entity scoping**

Completed in commit `65f8cc44` and merge `7c5ceab7`. The grants-domain graph
now carries `entity_id` across grants, funds, funders, funder contacts,
allocations, expenses, budget versions/periods/lines, planned expenses,
reporting requirements, closeout items, impact metrics, entries, and related
activity logs. Existing rows are backfilled to the organization default entity.

Add `entity_id` to the full grants-domain graph and service params. Backfill
existing rows to the org default entity.

- [x] **Step 3: Verify**

Evidence:

- `pnpm --filter @grantpipe/db test -- src/schema/grants.test.ts src/migrations.test.ts`
  passed.
- `pnpm --filter @grantpipe/api test -- src/domains/grants/grant.service.test.ts src/domains/grants/fund.service.test.ts src/domains/grants/funder.service.test.ts src/domains/grants/budget.service.test.ts src/domains/grants/budget-allocations.service.test.ts src/domains/grants/planned-expenses.service.test.ts src/domains/grants/reporting.service.test.ts src/domains/grants/routes.test.ts`
  passed in the Task 8 worktree.
- `pnpm --filter @grantpipe/api typecheck` passed.
- Migration `0073_grants_domain_entity_scope.sql` applied successfully.
- `pnpm run deploy:api` deployed Worker version
  `bef44c51-c9f6-41dc-a4e5-fc12728bfb44`.
- Live checks on 2026-06-25 returned 200 for
  `https://app.grantpipe.com/api/health` and `https://app.grantpipe.com`.
- Full API `test:coverage` completed the test suite but exited nonzero because
  touched large service files still missed per-file branch thresholds; this is
  recorded as a coverage-threshold gap, not a failing behavioral test.

Run:

```bash
pnpm --filter @grantpipe/db test -- src/schema/grants.test.ts src/migrations.test.ts
pnpm --filter @grantpipe/api test -- src/domains/grants/service.test.ts src/domains/grants/routes.test.ts
pnpm --filter @grantpipe/api typecheck
```

Expected: pass.

## Task 9: Observability And Security Review

**Files:**

- Modify: `packages/shared/src/constants/analytics.ts`
- Modify: `apps/api/src/lib/sentry.ts`
- Modify: affected tests from prior tasks.
- Create: `docs/offers/copy-gates/wave0-multi-entity-copy-gate.md`

- [x] **Step 1: Add analytics/Sentry tests**

Completed on branch `codex/roadmap-wave03-observability-copy-gate`.
`apps/api/src/lib/sentry.test.ts` now proves API exceptions include org id,
entity id, and entity scope tags only, and that background/queue tags redact
entity names, EINs, report text, and money-like fields. `error-handler.test.ts`
now proves entity-scoped `/grants` 403/404 AppErrors are captured to Sentry
with sanitized route/entity/scope tags while generic 4xx AppErrors remain
uncaptured.

Cover:

- entity create/update/archive analytics use ids and type/status only.
- denied entity switch is captured without entity names.
- Sentry context includes sanitized ids and scope mode.
- no donor names, entity names, EINs, report text, or financial details are sent.

- [x] **Step 2: Run customer-facing copy gates for any new visible copy**

Completed in `docs/offers/copy-gates/wave0-multi-entity-copy-gate.md`.
Settings entity setup copy now says "Managed entity" instead of "Agency
client"; public role-permissions copy now uses planned Enterprise language for
multi-entity role assignment and removes shipped entity-switcher/client-only
claims, unsupported time/support-ticket claims, and unverified statistic blocks.
The public claim gate now scans both the multi-entity and role-permissions
feature pages for unsupported shipped multi-entity claims.

Run `humanizer`, `third-grade-copy`, zero-lies review, and contextual fit review
for new UI text in Settings and shell.

- [x] **Step 3: Verify**

Focused evidence:

- `pnpm --filter @grantpipe/api test -- src/lib/sentry.test.ts` passed with
  25 tests.
- `pnpm --filter @grantpipe/api test -- src/middleware/error-handler.test.ts`
  passed with 13 tests.
- `pnpm --filter @grantpipe/shared test -- src/knowledge/marketing/__tests__/multi-entity-claim-gate.test.ts`
  passed with 2 tests.
- `pnpm --filter @grantpipe/web test -- src/routes/_authenticated/settings.entities.test.tsx`
  passed with 16 tests.
- `python <third-grade-copy>/scripts/scan_copy.py apps/web/src/routes/_authenticated/settings.entities.tsx --include-warnings --markdown`
  passed with 0 failures and 0 warnings.
- `python <third-grade-copy>/scripts/scan_copy.py packages/shared/src/knowledge/marketing/content/features/role-based-permissions.md --include-docs --include-warnings --markdown`
  passed with 0 failures and 8 reading-grade warnings for required product
  terms.

Run:

```bash
pnpm --filter @grantpipe/shared test
pnpm --filter @grantpipe/api test
pnpm --filter @grantpipe/web test
pnpm exec turbo typecheck --filter=@grantpipe/db --filter=@grantpipe/shared --filter=@grantpipe/api --filter=@grantpipe/web
```

Expected: pass, or record exact pre-existing failures with evidence.

## Completion Gate

Wave 0.3 is not complete until:

- schema and migration are merged.
- entity context is used by API and web.
- Settings entity setup ships.
- shell entity switcher ships.
- at least one operational slice proves entity isolation.
- public claims ledger is satisfied for each live claim.
- code review and UX/copy critique are clean.
- `master...origin/master` is `0 0`.
- affected apps are deployed through Wrangler.
- live checks prove app/API/site are healthy.
