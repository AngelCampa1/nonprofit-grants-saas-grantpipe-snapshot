# Master Roadmap Execution Ledger

Date started: 2026-06-24

This ledger tracks execution of `docs/offers/MASTER-BUILD-ROADMAP.md`. It is
not a replacement for the roadmap. It records current branch choices, evidence,
open risks, and the order in which implementation plans should be executed.

## Branch State

- Main checkout: the repo root, branch `master`, clean at start of this
  ledger, locally ahead of `origin/master` by 4 commits after `git pull` reported
  `Already up to date`.
- Roadmap planning worktree: `.worktrees/roadmap-wave0-planning`,
  branch `codex/roadmap-wave0-planning`, created from local `master`.
- Wave 0.2 lifecycle worktree:
  `.worktrees/roadmap-wave0-lifecycle`, branch
  `codex/roadmap-wave0-lifecycle`, created from `305519b7`, merged to
  `master` in `3e071ec4`.
- Wave 0.2 release-evidence worktree:
  `.worktrees/roadmap-wave0-release-evidence`, branch
  `codex/roadmap-wave0-release-evidence`, created from `3e071ec4`.
- Wave 0.3 multi-entity worktree:
  `.worktrees/roadmap-wave0-multi-entity`, branch
  `codex/roadmap-wave0-multi-entity`, created from `b0e2c273`.
- Existing dirty worktree left untouched:
  `.worktrees/ai-cs-eval-harness`, branch
  `ai-cs-eval-harness`. It has staged work that predates the current
  `MASTER-BUILD-ROADMAP.md` and does not contain the roadmap file.
- Wave 1 shipped-surfaces worktree:
  `.worktrees/roadmap-wave1-shipped-surfaces`, branch
  `codex/roadmap-wave1-shipped-surfaces`, created from `c5fbb2d6`, merged to
  `master` in `61734aba`.
- Wave 1 guarantee closeout worktree:
  `.worktrees/roadmap-wave1-guarantee-closeout`, branch
  `codex/roadmap-wave1-guarantee-closeout`, created from `d48c5862`.

## External Dirty-Worktree Risks

Read-only sub-agent reviews found blockers in
`.worktrees/ai-cs-eval-harness`. These are not fixed in this worktree because
that staged branch is separate and should not be disturbed without an explicit
handoff.

1. `docs/superpowers/goals/tier-repackaging-comms-LEDGER.md` in the staged
   branch claims completion, merge, deploy, copy gates, and production
   verification while the branch still has staged uncommitted changes. Treat
   those claims as unproven for the staged branch.
2. The staged branch's promo rendering can ignore live promo state: pricing
   passes `activePromo`, but pricing cards and offer stack call promo helpers
   directly. This can show `80% off` after the backing state changes.
3. The staged branch's guided-import and full-portfolio copy appears broader
   than current plan entitlements and grant caps.
4. The staged branch's AI cap copy says `unlimited AI`; the safer claim is
   limited to the two metered tools: award intakes and ledger questions.

## Execution Order

The first implementation plan is:

- `docs/superpowers/plans/2026-06-24-wave0-trial-to-pay-funnel.md`
- `docs/superpowers/plans/2026-06-24-wave0-trial-lifecycle-states.md`

Reason: roadmap item 0.1 is the first technical dependency. The code already
had a trial clock, paywall state, Stripe Checkout integration, and a settings
billing panel, but the expired-trial wall and feature-gate conversion path were
not a coherent checkout path. Wave 0.1 is complete in merge `305519b7`.

Wave 0.2 follows because lifecycle emails, sequencer triggers, and pricing
reversion logic need a stable state contract before Wave 0.5 messaging and
inbound work can safely publish.

## Current Plan Coverage

- Wave 0.1 Trial-to-pay moment: completed in merge `305519b7` with local
  verification and API/web/site Wrangler deploy evidence.
- Wave 0.2 `trialEndsAt` and lifecycle states: completed in merge `3e071ec4`.
  The lifecycle worker persists `subscriptionStatus: "expired"` after emitting
  `trial_expired`, and API/web read paths expose `billingLifecycleState` as the
  canonical automation contract. API, web, and site deploy evidence is recorded
  below.
- Wave 0.3 multi-client/entity foundation: foundation implementation is
  complete in merge `26e2150c`. The safe claim remains narrow:
  `organizations` are still the account, billing, subscription, and team
  ownership boundary; `entity_id` is the client/data boundary beneath it.
  Broad fiscal-sponsor roll-up reporting and inter-entity elimination claims
  remain gated until later builds ship.
- Wave 0.4 Data Migration Studio: complete in merge `6967968a` after feature
  commit `9373a2aa`. The shipped scope includes guided mapping for contacts,
  funds, opening balances, and pledge schedules; reconciliation preview;
  import history; org/entity bootstrap; Sentry capture on commit failures;
  E2E coverage; API/web/site Wrangler deploys; and live checks for
  `https://app.grantpipe.com/import` and the public feature page.
- Wave 0.5 messaging foundation is complete in merge `c5fbb2d6` after feature
  commit `79165f0b`. It shipped the promo active-state fix, source map,
  claims ledger, promo-reversion runbook, and trial/paywall copy spec. The
  `$30K-$80K [planning estimate]` anchor remains internal until externally
  verified.
- Wave 1 shipped-surface hardening completed in merge `61734aba`, with a
  follow-up no-lies copy precision merge in `d48c5862`. The release tightened
  the restriction classifier contradiction warning, rendered Ask Ledger
  suggested follow-up questions, added privacy-safe donor-lapse analytics, and
  narrowed public Wave 1 copy to shipped surfaces.
- Wave 1 guarantee stack closeout is complete in merge `30d8d20e` after feature
  commit `13f21d30`. It publishes the named `Stand-Behind-It Stack` from shared
  pricing data and keeps the terms limited to the source-backed trial, no-card,
  no-setup-fee, and 30-day refund promises. Deployment evidence: `pnpm run
deploy:site` completed on 2026-06-25; live checks returned `200` for
  `https://grantpipe.com/pricing/` with the stack, no-setup-fee, and refund
  copy present, and `200` for `https://grantpipe.com/pricing.txt` with
  `Last updated: 2026-06-25` and `## Stand-Behind-It Stack`.

## Wave 0.5 Release Evidence

- Feature commit: `79165f0b feat(site): gate launch promo pricing copy`.
- Merged to `master` in `c5fbb2d6`; `master...origin/master` was pushed and
  clean before the Wave 1 worktree was created.
- Deploy: `pnpm run deploy:site` completed for the public site.
- Local verification: `pnpm --filter @grantpipe/site test:coverage`,
  `pnpm --filter @grantpipe/site typecheck`, `pnpm --filter @grantpipe/site lint`,
  site build with Turnstile bypass, and dist scans all passed.
- Live checks returned 200 for `https://grantpipe.com/`,
  `https://grantpipe.com/pricing/`, `https://grantpipe.com/AGENTS.md`,
  `https://grantpipe.com/pricing.txt`, and the best-tools page.
- Live price artifacts no longer exposed raw launch-promo tokens in static
  files: `/pricing.txt` omitted `$66`, `$108`, `$216`, `80% off`, `first year`,
  `limited offer`, and raw `{{grantpipe.price` tokens, while including the
  list prices `$329`, `$539`, and `$1,079`.

## Wave 1 Release Evidence

- Feature release merge: `61734aba Merge branch
'codex/roadmap-wave1-shipped-surfaces'`.
- Follow-up copy precision merge: `d48c5862 Merge branch
'codex/wave1-copy-precision'`.
- Web deploy for shipped surfaces: `grantpipe-web` version
  `5a57904d-ce03-481c-a7b6-e002c57a5e8d`.
- Site deploy for copy precision: release
  `d48c58629bd8f3adc19c30b1e340e8800d3f2ec0`.
- Live feature check after copy precision returned 200 for
  `https://grantpipe.com/features/restriction-aware-gl-classification/` and
  confirmed the page no longer contained the unsupported GL-finality and
  classifier-rule-storage claims.

## Wave 1 Local Evidence

- Sub-agent exploration found Wave 1 product surfaces mostly shipped but
  flagged missing Ask Ledger follow-up rendering, no donor-lapse analytics
  event, and public donor-retention copy that overclaimed pledge aging and
  thank-you tracking.
- Sub-agent UX/copy critique approved the current Ask Ledger page framing and
  guarantee copy, and flagged the same donor-retention and restriction-copy
  risks for narrowing.
- Targeted TDD and verification now passing:
  `pnpm --filter @grantpipe/web test -- src/components/donors/donation-form.test.tsx src/routes/_authenticated/reports/ask-ledger.test.tsx src/routes/_authenticated/donors/at-risk.test.tsx`,
  `pnpm --filter @grantpipe/shared test -- src/constants/analytics.test.ts`,
  `pnpm --filter @grantpipe/site test -- src/paid-landing-pages-contract.test.ts`,
  and `pnpm --filter @grantpipe/site test -- src/feature-landing-pages-contract.test.ts`.
- Copy-gate review narrowed donor-retention copy to the shipped at-risk donor
  view, removed unverified classifier override-log claims, and softened
  absolute GL reconciliation claims to verified revenue-account routing.
- Delegated review found one no-lies blocker in the restriction classifier
  feature copy: it still claimed accepted suggestions saved rule,
  confidence, and timestamp metadata. The fix narrowed that section to the
  proven saved final restriction and linked restriction-term behavior. Follow-up
  checks passed: `pnpm --filter @grantpipe/shared run knowledge:check`,
  `pnpm --filter @grantpipe/site test -- src/feature-landing-pages-contract.test.ts`,
  and `git diff --check HEAD`.
- Guarantee stack TDD closeout added failing tests first for shared pricing,
  the public pricing offer stack, and `pricing.txt`, then implemented
  `GRANTPIPE_GUARANTEE_STACK` as the single source of truth. Focused tests now
  pass: `pnpm --filter @grantpipe/shared test -- pricing.test.ts` and
  `pnpm --filter @grantpipe/site test -- pricing-page-seo-contract.test.ts
lib/pricing-txt.test.ts`.

## Wave 0.2 Implementation Evidence

- `createOrgForUser` already sets `subscriptionStatus: "trialing"`,
  `trialStartedAt`, and `trialEndsAt` for new orgs.
- Shared `billingLifecycleState` returns only `trialing`, `expired`, `active`,
  or `past_due`; elapsed or missing trial dates resolve to `expired`.
- The trial-expiry worker emits privacy-safe analytics transition fields, then
  persists `subscriptionStatus: "expired"` and `trialExpiredEventAt`.
- `/auth/session`, org billing summary, and the web `useSession` hook now carry
  `billingLifecycleState`.

## Wave 0.2 Release Evidence

- Merged to `master` in `3e071ec4` after code review and follow-up fix to avoid
  claiming completion before merge/deploy.
- API deploy completed for `grantpipe-api-production`, current version
  `331bbff7-7143-4386-a1c7-57e4faf11da2`.
- Web deploy completed for `grantpipe-web` on `app.grantpipe.com`, current
  version `0f0bffe6-c185-4e45-93ef-6967a12221fe`.
- Site deploy completed for `grantpipe-site` on `grantpipe.com` and
  `www.grantpipe.com`, current version
  `7caf764b-29f9-4292-b5e1-34ac2db5bf46`.
- Post-deploy live checks on 2026-06-25: `https://grantpipe.com` returned 200,
  `https://www.grantpipe.com` redirected to a 200 on `grantpipe.com`,
  `https://app.grantpipe.com` returned 200, and
  `https://app.grantpipe.com/api/health` returned 200.

## Wave 0.5 Messaging Risks To Resolve Before Publication

These came from the Wave 0.5 read-only critique and are blockers for the next
messaging plan, not for the lifecycle implementation.

1. Narrow "guided import" copy to the shipped Migration Studio paths: contacts,
   funds, opening balances, pledge schedules, and supported tracker imports.
   Do not turn it into a blanket "no consultant" promise.
2. Avoid "full grant portfolio" trial wording unless the active plan caps and
   import reality support it.
3. Replace broad "unlimited AI" wording with metered tool language for award
   intakes and ledger questions.
4. Centralize promo active-state copy so `PricingPlanCards`, `OfferStack`, CTA
   promo codes, and pricing schema use one fetched promo state at static build
   time. Because the site is static, redeploy around `LAUNCH_PROMO_DEADLINE_ISO`
   so the baked HTML cannot keep showing launch-promo language or prices.
5. The expired wall should explain why a plan is selected by default and expose
   a clear secondary path to see all plans.

## Wave 0.3 Architecture Evidence

- `docs/offers/wave0-multi-entity-architecture.md` records the design decision:
  keep `organizations` as account, billing, subscription, and team ownership
  boundary; add `entity_id` as the client/data boundary.
- `docs/offers/copy-gates/wave0-multi-entity-claims-ledger.md` gates public
  claims for entity switching, client-only access, roll-up reporting,
  inter-entity eliminations, and plan availability.
- `docs/superpowers/plans/2026-06-25-wave0-multi-entity-foundation.md` breaks
  the build into an existing marketing-claim quarantine preflight, schema,
  shared contracts, context resolver, session contract, settings entities,
  entity membership/client access, shell switcher, grants domain graph
  isolation, and observability/security gates.
- Existing public multi-entity claims were quarantined in merge `2a859696`:
  the public feature page is planned-only, uses contact/evaluate CTAs, has
  `noindex`, and is absent from the sitemap.
- Task 1 schema foundation shipped in merge `b4d84531`. It added
  `entities`, `entity_members`, `organizations.default_entity_id`, and nullable
  `invite_links.entity_id`; backfilled default entities and default entity
  memberships; and added same-org composite database guardrails for parent
  entities, entity memberships, entity-scoped invites, and organization default
  entities. `pnpm run deploy:api` applied the production migration and deployed
  `grantpipe-api-production` version `ba75441a-e843-4833-a384-359c7600a7dd`.
- Task 2 shared contracts shipped in merge `d8f2c8a9`. It added shared entity
  kinds, statuses, fiscal sponsor models, role labels, permission defaults,
  create/update/list/access validators, and privacy-safe analytics event names
  for entity setup, entity switching, denied switches, and roll-up report
  generation. `pnpm run deploy:changed` deployed API, web, and site; post-deploy
  checks returned 200 for API health, app, and site.
- Task 3 central org/entity context resolver shipped in merge `2fb32421`. It
  replaced the inline API org resolver with `orgEntityContextMiddleware`, keeps
  `X-Org-Id` as the account boundary, adds `X-Entity-Id` as the data boundary,
  defaults to the active org default entity, validates active entity membership,
  and sets org/entity roles and permissions in request context. Review fixes
  added fail-closed blank explicit header handling and a legacy
  `default_entity_id` compatibility fallback that returns 403 instead of 500
  when older metadata cannot provide a default entity. `pnpm run deploy:api`
  deployed `grantpipe-api-production` version
  `fe519c3e-13dc-4a59-85df-eb675c8fd128`; post-deploy API health returned
  200 with `{"status":"ok"}`.
- Task 4 session and membership contract shipped in commit `d69b0734`. It keeps
  existing `/auth/session` fields while adding `activeEntity`,
  `availableEntities`, `entityScope`, `entityRole`, and `entityPermissions`;
  adds active-org-only entity summaries to `/org/memberships`; and exposes the
  new contract through `useSession` and `useUserMemberships`. Review found no
  tenant-isolation, backward-compatibility, or Task 5 scope issues. Local gates
  passed for targeted API/web tests, API/web typechecks, API/web lint, and
  focused coverage on the new helper and touched hooks. `pnpm run deploy:api`
  deployed `grantpipe-api-production` version
  `43c6df38-e7cf-432e-bdd8-ac80076b0db6`; `pnpm run deploy:web` deployed
  `grantpipe-web` version `ec276f11-f161-4f2d-9706-c29755933fcc`. Post-deploy
  live checks returned 200 for `https://app.grantpipe.com/api/health` with
  `{"status":"ok"}` and for `https://app.grantpipe.com`.
- Task 5 admin entity settings shipped in commit `f5a15133`. It added the
  admin-only settings entities surface, entity list/create/update/archive API
  routes, default and last-active archive protections, admin navigation, and
  privacy-safe analytics/Sentry capture for entity settings mutations. Local
  gates passed for targeted API service/routes tests, web settings
  entities/navigation tests, API/web typechecks, API/web/shared lint, and
  focused coverage on touched Task 5 files.
- Task 6 entity membership and client access management shipped from branch
  `codex/roadmap-wave03-entity-access`. It keeps organization membership as
  the account/team root, uses `entity_members` for client/entity access,
  persists `invite_links.entity_id` for entity-scoped invites, accepts scoped
  invites into one entity without sibling access, hydrates `/org/team` with
  normalized entity access summaries, and lets org admins or active-entity
  managers with `entityTeam: manage` assign, update, and revoke access only for
  the permitted entity. Review fixes removed internal `orgMemberId` leakage,
  returned full effective `EntityPermissionMap` values, rejected empty access
  patches, captured denied entity access mutations with sanitized ids, and
  preserved final entity-admin paths during revoke/archive. Local gates passed
  for targeted shared/API/web tests, API/web/shared typechecks, and
  API/web/shared lint; the final delegated contract verifier reported no
  blocking findings.

## Wave 3 Federal Compliance Evidence

- Wave 3.1 SEFA Builder + Single-Audit Tripwire shipped before this ledger
  update in merge `8ad512bc` after feature commit `82448770`. Release evidence:
  API deploy `7b4ad74d-3b6e-460f-b89c-1e5d825556bd`, web deploy
  `5c9b74d0-fa7a-4dcf-af51-ff49a0506292`, site deploy
  `8d5dc316-9126-49e7-84fd-153ed20a88c3`, and live checks for `/api/health`,
  app shell, and `/features/sefa-builder-single-audit-tripwire`.
- Wave 3.2 Uniform Guidance cost-rule guardrails shipped in merge `35a4adcb`
  after feature commit `0204a551`. It added shared guardrail contracts,
  payment request preview and save enforcement, Add Line cost-review UI,
  privacy-safe analytics, Sentry capture for unexpected preview failures, and
  PRD `docs/grant-operating-system/29-uniform-guidance-cost-rule-guardrails-prd.md`.
  Delegated review found four issues; fixes aligned preview access with add-line
  access, removed mutation-object effect looping risk, enforced guardrails on
  update-line saves, and changed equipment handling to conservative policy
  review until an org equipment-policy field exists.
- Wave 3.2 local gates passed: targeted shared/API/web tests, shared/API/web
  typechecks, API/web/shared lint, focused per-file coverage above 95% for
  touched shared/API/web files, and `git diff --check`. Full repo
  `pnpm format:check` still reports pre-existing formatting drift in unrelated
  files, so Prettier was run only on touched files.
- Wave 3.2 production deploys completed through Wrangler scripts: API Worker
  version `81ae9282-dc47-4e7e-b9ac-88b3694c7f4b` and web version
  `5a99c504-e45f-49e7-b871-f3e7671917b0`. Live checks returned 200 for
  `https://app.grantpipe.com/api/health`, 200 for `https://app.grantpipe.com`,
  and 401 for unauthenticated
  `/api/payments/req-live-probe/ug-guardrails/preview`, confirming the new route
  is deployed behind auth.

## Early Questions For Angel

These are not blockers for the first Wave 0.1 implementation plan, but they
should be answered before the broader roadmap reaches live pricing and
messaging deploys.

1. Should an expired-trial admin start Stripe Checkout directly from the wall
   using the last selected plan, or should the wall always send them through
   the full billing panel first?
2. For expired real trial orgs that are already past `trialEndsAt`, should the
   first deploy immediately enforce the wall in production, or should there be
   a short founder-led grace window with direct outreach?
3. Is guided import a universal founder-support promise during the current
   founding window, or only an Audit-Ready / Enterprise promise until the Data
   Migration Studio ships?

## Required Gates Before Any Roadmap Item Is Called Complete

- Worktree isolation.
- Failing test first for behavior changes.
- Observability for success and failure paths.
- Copy gate for customer-facing lines: `humanizer`, `third-grade-copy`,
  zero-lies review, fit-context review.
- Sub-agent spec review and UX/copy critique.
- Merge to `master`.
- Deploy affected apps through the repo Wrangler scripts.
- Local and post-deploy verification, with live evidence for app behavior.
