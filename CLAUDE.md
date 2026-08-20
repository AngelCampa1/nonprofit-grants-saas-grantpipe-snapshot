# CLAUDE.md - GrantPipe

## Design Canon

- **Buttons are pills.** Treat fully rounded button geometry as a standing product preference. Every button or button-styled CTA should use pill corners (`border-radius: 9999px`, `rounded-full`, or equivalent), including primary/secondary actions, link-buttons, toolbar buttons, segmented/toggle controls, and icon buttons (circular when square). Do not introduce square or mildly rounded button shapes unless the user explicitly asks for that exception.

## Verified Facts (do not get wrong)

The 2024 OMB revision to 2 CFR Part 200 (Uniform Guidance) updated four numbers that appear constantly in nonprofit / federal grant content. Use the post-revision values as the default. Only reference the prior values when the surrounding sentence is explicitly historical (e.g. "raised from", "previously", "prior to October 2024"). The prior values are listed by descriptive phrasing here (not by the exact retired literal) so the repo-wide regression sweep in `apps/site/src/audit-threshold-amount.test.ts` continues to catch stale uses.

| Item                               | Current value                                                                | Prior value                                   | Citation                           | Effective date                                  |
| ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| De minimis indirect cost rate      | **15% of MTDC**                                                              | 10% of MTDC                                   | 2 CFR 200.414(f)                   | Federal awards executed on or after Oct 1, 2024 |
| Single audit threshold             | **$1,000,000** in federal awards expended                                    | the prior three-quarter-million-dollar figure | 2 CFR 200.501                      | Fiscal years ending on or after Sept 30, 2025   |
| MTDC subaward exclusion cap        | **$50,000** per subaward (first $50K counts toward MTDC; remainder excluded) | $25,000                                       | 2 CFR 200.1 (MTDC definition)      | Federal awards executed on or after Oct 1, 2024 |
| Equipment capitalization threshold | **$10,000** per unit                                                         | $5,000                                        | 2 CFR 200.1 (Equipment definition) | Federal awards executed on or after Oct 1, 2024 |

Not changed by the 2024 revision (do not "fix" these):

- **FFATA subaward reporting threshold remains $25,000** per subaward (FFATA / SAM.gov / USAspending obligation). This is a reporting trigger, not the MTDC exclusion cap.
- **SAM.gov debarment check threshold remains $25,000** under 2 CFR 200.213.
- Foundation / private funder indirect cost caps (often 10%, 12%, 15%) are funder-specific restrictions, not the federal de minimis rate.
- State charitable solicitation registration thresholds ($25,000 of gross contributions in some states) are unrelated.

## LinkedIn/Postiz Review Gate

Before creating, uploading, or scheduling LinkedIn posts through Postiz, run `node scripts/linkedin-post-review-gate.mjs content/social/linkedin` from the repo root, or run the repo script that imports that gate. Do not publish posts that contain internal production labels such as "new lead magnet", image suggestions/descriptions without an actual attached image, TODO/TBD placeholders, generic AI phrasing, or claims that were not checked against repo source material.

## About This File

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Project Overview

**GrantPipe** (grantpipe.com) is a unified donor management and grant compliance platform for mid-sized nonprofits ($500K–$10M budgets). One system for donors, grants, restricted funds, and compliance reporting — no consultants required.

## Monorepo Structure

```
grantpipe/
├── apps/
│   ├── web/        # React + Vite SPA (Cloudflare Pages) — TanStack Router + Query — app.grantpipe.com
│   ├── api/        # Hono on Cloudflare Workers — RPC mode, domain-grouped — api.grantpipe.com
│   └── site/       # Astro 6 marketing site (Cloudflare Pages) — grantpipe.com
├── packages/
│   ├── db/         # Drizzle ORM schema + migrations (Postgres)
│   ├── ui/         # Shadcn/UI components + design tokens (Tailwind CSS 4)
│   └── shared/     # Types, constants, Zod validators (shared by API + client)
```

## Tech Stack

- **Frontend:** React 19, Vite, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4
- **API:** Hono (RPC mode) on Cloudflare Workers
- **Database:** Supabase Postgres, Drizzle ORM, row-level multi-tenancy (org_id on every table)
- **Auth:** Better Auth (email/password + Google SSO), cookie-based sessions
- **Payments:** Stripe subscriptions
- **File storage:** Cloudflare R2
- **Email:** Resend (transactional)
- **Analytics:** PostHog
- **Error tracking:** Sentry

## Local Dev Ports

| Surface | Port |
| ------- | ---- |
| Web app | 3050 |
| API     | 5050 |
| Site    | 4321 |

Start GrantPipe with `GRANTPIPE_WEB_PORT=3050 GRANTPIPE_API_PORT=5050`.

## Common Commands

```bash
# Dev
pnpm --filter @grantpipe/web dev         # Vite dev server (localhost:3050)
pnpm --filter @grantpipe/api dev         # Wrangler dev server (localhost:5050)
pnpm --filter @grantpipe/site dev        # Astro dev server (localhost:4321)

# Build
turbo build                               # All packages
turbo build --filter=@grantpipe/web       # Web + dependencies

# Deploy
pnpm run deploy:api                       # Deploy Worker to grantpipe-api
pnpm run deploy:web                       # Build + deploy grantpipe-web Pages
pnpm run deploy:site                      # Build site, sync/verify lead magnets in R2, deploy Pages
pnpm run deploy:changed                   # Deploy only apps affected by the last commit range
pnpm run deploy:changed:dry-run           # Show affected deploy commands without running them

# Typecheck
turbo typecheck

# Test
pnpm --filter @grantpipe/api test         # API tests
pnpm --filter @grantpipe/shared test      # Shared package tests
turbo test                                # All tests
turbo test:coverage                       # All tests with coverage

# DB
pnpm --filter @grantpipe/db generate      # Generate migration from schema changes
pnpm --filter @grantpipe/db migrate       # Apply migrations
pnpm --filter @grantpipe/db studio        # Visual DB browser

# Lint & Format
turbo lint
pnpm format                               # Prettier write
pnpm format:check                         # Prettier check
```

## Architecture Decisions

- **Hono RPC** — type-safe client calls without codegen. `apps/api` exports `AppType`, `apps/web` imports it via `hc<AppType>()`. Full end-to-end type inference.
- **Domain-grouped API** — each domain (donors, grants, funds, compliance, etc.) has its own folder under `apps/api/src/domains/` with `routes.ts` and `service.ts`.
- **Row-level multi-tenancy** — `org_id` on every table. Middleware attaches org context from session. All queries scoped automatically.
- **Soft delete** — `deleted_at` column on all main entities. No hard deletes in application code.
- **Money as cents** — all monetary values stored and transmitted as integers (cents). Formatted on the client.
- **Grants and funds are separate entities** — many-to-many via `grant_fund_allocations`. Matches FASB ASC 958 and how Sage Intacct / Blackbaud model it.
- **Shared Zod validators** — `packages/shared/src/validators/` holds schemas used by both API (request validation) and client (form validation).
- **Activity log** — polymorphic `activity_log` table tracks all entity changes with JSONB diffs. Serves as the audit trail.
- **Custom fields** — EAV pattern: `custom_field_definitions` + `custom_field_values`. Per-org, on contacts/donations/grants.

## Canonical Domains

| App       | Production URL                      | Local dev               |
| --------- | ----------------------------------- | ----------------------- |
| Site      | `https://grantpipe.com`             | `http://localhost:4321` |
| Web (app) | `https://app.grantpipe.com`         | `http://localhost:3050` |
| API       | Worker on `app.grantpipe.com/api/*` | `http://localhost:5050` |

## Environment Variables

### `apps/api` — `wrangler.toml [vars]`

- `APP_URL` — web app URL (`http://localhost:3050` in dev; `https://app.grantpipe.com` in prod)
- `MARKETING_URL` — marketing site URL (`http://localhost:4321` in dev; `https://grantpipe.com` in prod)
- `INTEGRATION_MODE` — `"mock"` in dev, `"production"` in prod
- `FEEDBACK_RECIPIENT_EMAIL` — feedback delivery address; defaults to `angel.campa@grantpipe.com` in dev and prod; change to update where submissions are sent

### `apps/api` — secrets (`wrangler secret put`)

- `DATABASE_URL` — managed Postgres connection string
- `BETTER_AUTH_SECRET` — session signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Stripe
- `RESEND_API_KEY` — transactional email
- `LEAD_UNSUBSCRIBE_SECRET` — HMAC key for signed unsubscribe tokens in lead nurture emails; falls back to `BETTER_AUTH_SECRET` if unset, but setting it explicitly is recommended to prevent cross-context token reuse
- `DOWNLOAD_LINK_SECRET` — HMAC key for signed time-limited download URLs delivered in lead magnet emails; used by the `leads` domain to generate and verify download tokens
- `OPENROUTER_API_KEY` — AI award document intake extraction; configured locally in `.env` and in the production Worker secret store
- `SENTRY_DSN` — error tracking DSN for the Worker. If unset, Sentry is disabled (`createSentryOptions` returns `undefined` and the app runs without error reporting). Set it in production to capture API, queue-consumer, scheduled-job, auth, and best-effort background failures (`captureBackgroundException`). Companion `[vars]` (not secrets): `SENTRY_ENVIRONMENT` (tags events; defaults to `development`) and `SENTRY_RELEASE` (release tag; the Cloudflare version-metadata id takes precedence when bound).

### Marketing / Content Production — local `.env`

- `ELEVENLABS_API_KEY` — ElevenLabs text-to-speech key for YouTube video voiceovers (see `docs/youtube/`). Stored only in the gitignored root `.env`; never commit or print it.

### Lead Magnet PDF Delivery — R2

Lead magnet PDFs are built at Astro build time, synced to Cloudflare R2, verified as remote PDFs, and then the site is deployed.

- **R2 bucket:** `grantpipe-documents`
- **Key format:** `lead-magnets/{slug}.pdf` (e.g. `lead-magnets/grant-compliance-checklist.pdf`)
- **Build PDFs** (runs automatically during `pnpm --filter @grantpipe/site build`):
  ```bash
  pnpm tsx apps/site/scripts/run-build-lead-magnet-pdfs.ts
  ```
- **Sync PDFs to R2** (normally handled by `pnpm run deploy:site`; run manually after build if needed):
  ```bash
  wrangler login   # one-time auth; skip if already authenticated
  pnpm tsx apps/api/src/scripts/sync-lead-magnets-to-r2.ts
  ```
- **Verify PDFs in R2** (normally handled by `pnpm run deploy:site`; run manually after sync if needed):
  ```bash
  pnpm tsx apps/api/src/scripts/sync-lead-magnets-to-r2.ts --verify
  ```
  Uses `wrangler r2 object put` for sync and `wrangler r2 object get --remote` for verification — no API token env vars required.
  Optional env var:
  - `CLOUDFLARE_R2_BUCKET` — bucket name (default: `grantpipe-documents`)

### `apps/site` — `wrangler.toml [vars]` / `.env`

- `PUBLIC_APP_URL` — app URL for signup CTAs; defaults to `https://app.grantpipe.com` if unset

### `apps/site` — optional analytics (`.env` / Cloudflare Pages dashboard)

- `PUBLIC_POSTHOG_KEY` — PostHog project key; falls back to the bundled default key if unset
- `PUBLIC_POSTHOG_HOST` — PostHog ingest host; defaults to `https://us.i.posthog.com`
- `PUBLIC_SENTRY_DSN` — browser Sentry DSN for the marketing site. If unset (or outside a PROD build), client Sentry stays uninitialized (`initSentry` no-ops). Companion build-time vars for source-map upload: `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT_SITE` (all three required, else the Sentry vite plugin is skipped). Optional runtime tags: `PUBLIC_SENTRY_ENVIRONMENT`, `PUBLIC_SENTRY_RELEASE`.

### `apps/web` — Vite env (`.env` / Cloudflare Pages dashboard)

- `VITE_POSTHOG_KEY` — PostHog project key; falls back to the bundled default key if unset
- `VITE_POSTHOG_HOST` — PostHog ingest host; defaults to `https://us.i.posthog.com`
- `VITE_SENTRY_DSN` — browser Sentry DSN for the web app. If unset, client Sentry stays uninitialized (`initSentry` no-ops). Optional runtime tags: `VITE_SENTRY_ENVIRONMENT` (defaults to the Vite `MODE`), `VITE_SENTRY_RELEASE`.

## Observability Requirements

Every new feature, feature slice, or user-facing capability written in this
repository must wire both product analytics and error tracking before it is
considered complete. This is a required part of implementation, not a follow-up
cleanup item.

- **PostHog:** Track the key user actions and state changes the feature adds,
  using existing analytics helpers and privacy-safe event names. Do not send
  donor names, funder names, free-form user content, raw document text, email
  addresses, auth tokens, or financial details that are not already approved for
  analytics.
- **Sentry:** Capture actionable failures at the boundary where the feature can
  fail: API service errors, background jobs, storage/report generation failures,
  and client-side mutation or render failures. Use existing Sentry helpers and
  tags so events identify the feature without logging secrets or sensitive
  nonprofit data.
- **Tests:** Add or update tests that prove analytics and Sentry hooks are
  called for the feature's important success and failure paths, or document why
  the existing shared wrapper already covers that path.
- **Review gate:** Reviewers must flag any new feature that ships without
  PostHog and Sentry coverage as incomplete. Do not merge or deploy a feature
  until this coverage exists or the existing shared wrapper coverage has been
  verified against the feature's success and failure paths.

## Process Safety

Never kill all Codex, Node, pnpm, Wrangler, or shell processes as a cleanup shortcut. Other Codex agents may be running in parallel worktrees. If a specific local server or build process must be stopped, identify the exact process and confirm it belongs to the current task before terminating it.

## Founder Context

**Angel Campa** — Principal SDET, building GrantPipe as a validated vertical SaaS product.

- Do not claim nonprofit sector experience — write from the builder perspective
- Never fabricate testimonials, user counts, or social proof
- Use `stop-slop` then `humanizer` when writing user-facing copy

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Do not stop after completing a batch to ask "ready for feedback?" or "should I continue?". Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

Keep iterating until the app is production ready, feels like a polished SaaS, everything works reliably, and the UX/UI looks intentional and high quality.

When working on a phase, task, bug, or any other scoped unit of work, execute the workflow end-to-end unless a concrete blocker prevents safe completion. Do not stop at planning or partial implementation. Finish the full plan, satisfy every quality gate, obtain review using the active Codex runtime's permitted review path, fix every issue the review flags, and merge the completed work to `master`.

### Required Workflow

- **Worktree isolation.** All feature/fix work MUST happen in a git worktree created inside the GrantPipe repo folder, preferably under `.worktrees/`. Do not create GrantPipe worktrees in sibling directories outside `grantpipe/`. Use the `using-git-worktrees` skill.
- **Sub-agent driven development.** Use the `subagent-driven-development` skill when the active Codex runtime permits sub-agent spawning and the work can be cleanly delegated. Treat this as an execution requirement, not an optional review preference: every scoped feature must include delegated sub-agent work for at least one concrete exploration, implementation, verification, observability, UX critique, or code-review task unless a higher-priority runtime instruction blocks sub-agent use. If runtime instructions restrict sub-agent usage, record that blocker and perform the exploration, implementation, verification, and review locally.
- **Completion sequence is mandatory.** Work is not complete until all code in the worktree has been reviewed through the active Codex runtime's permitted review path, every issue found has been fixed, the branch has been merged to `master`, the worktree has been removed, and the affected production apps have been deployed.
- **Review before merge.** When implementation is complete: (1) get a review for all work in the current worktree using the active Codex runtime's permitted review path, (2) fix every issue the review flags, (3) merge to `master`, (4) remove the worktree, and (5) deploy the affected apps with the Wrangler deploy scripts.
- **Wrangler is the production deploy path.** Do not add or rely on GitHub Actions or Cloudflare git auto-deploy for production release flow. Production deploys must go through the repo's Wrangler scripts and target `grantpipe-api`, `grantpipe-web`, and `grantpipe-site`.

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No `any` type in TypeScript.** Use proper types or `unknown` with narrowing.
- **No `eslint-disable` without explanation.** Fix the lint error instead.
- **No feature without observability.** Every new feature must ship with
  privacy-safe PostHog events and Sentry failure capture wired into its core
  success and failure paths, with tests or verified shared-wrapper coverage.

### Test-Driven Development (TDD) — MANDATORY

Every task follows this cycle. No exceptions:

1. Write the failing test first
2. Run the test. Confirm it fails
3. Write the minimal implementation to make the test pass
4. Run the test. Confirm it passes
5. Refactor if needed, re-run tests

### Coverage Requirements

**95% code coverage minimum on every file you touch.** Not the repo average — each individual file.

- `packages/shared` — validators and utilities, 95% per file
- `packages/db` — schema declarations excluded; any utility functions must meet 95%
- `apps/api` — every route, service, and middleware file, 95% per file
- `apps/web` — component and hook logic, 95% per file
- `packages/ui` — component logic, 95% per file

### Pre-Commit Hooks

Two-layer system:

1. **lint-staged** — ESLint `--fix` + Prettier `--write` on staged files
2. **affected-packages** — detects which workspace packages have staged changes, runs `turbo typecheck test:coverage` only for those

## Key Docs

| Doc                                                        | What it covers                      |
| ---------------------------------------------------------- | ----------------------------------- |
| `docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md` | Full V1 design specification        |
| `docs/superpowers/plans/`                                  | Phase-by-phase implementation plans |

## Roles & Permissions

| Action                     | Admin | Editor | Viewer | Auditor |
| -------------------------- | ----- | ------ | ------ | ------- |
| View operational data      | Yes   | Yes    | Yes    | Limited |
| Create/edit records        | Yes   | Yes    | No     | No      |
| Generate reports & exports | Yes   | Yes    | Yes    | Yes     |
| Import CSV data            | Yes   | Yes    | No     | No      |
| Manage custom fields       | Yes   | No     | No     | No      |
| Manage team & org settings | Yes   | No     | No     | No      |
| Delete records             | Yes   | No     | No     | No      |

Auditor access is read-only and intentionally limited to grants, funds, documents,
compliance, accounting, and reports. Auditors do not have donor, event, import,
settings, billing, or team access.

## Codex Runtime Policy

Repository guidance cannot override higher-priority Codex runtime, developer, system, tool, or sandbox instructions. If those instructions restrict sub-agent usage, process management, deploys, secrets, or filesystem operations, follow the runtime policy and use the safest local equivalent workflow.

- Do not claim this file grants permission to bypass active Codex runtime restrictions.
- If sub-agents are unavailable or restricted, complete exploration, implementation, verification, and review locally.
- Never terminate broad process classes such as all Codex, Node, pnpm, Wrangler, or shell processes. Stop only an exact process that belongs to the current task.

## Design Context

> Full detail in `.impeccable.md`. This summary is for quick reference.

### Users

Executive Directors and Development Directors at mid-sized nonprofits ($500K–$10M budgets). Time-poor, risk-averse, arrived after being burned by Salesforce/Blackbaud or spreadsheet chaos. Use the app at a desk during business hours. **Emotional goal: confidence and control**, not delight or excitement.

### Brand Personality

**Three words: Rigorous, humane, earned.**

Closest analogy: a university bursar's office redesigned by someone who actually cares. Rigorous because the work demands it. Humane because the users are mission-driven, not bureaucrats. Earned because every design choice must justify its existence.

### Aesthetic Direction

- **Warm & purposeful** — emerald green + archival ochre palette does the work; no gradient overlays or decorative illustrations needed
- **Light-only** — GrantPipe ships a single light theme; dark mode has been removed
- **Anti-reference #1: Salesforce/enterprise** — heavy, intimidating, consultant-dependent. The opposite of GrantPipe.
- **Anti-reference #2: nonprofit charity aesthetic** — stock photos of hands, excessive warmth, looks underpowered

### Design Principles

1. **Rigorous without intimidation** — Dense information is fine; hierarchy through typography, color, and spacing — not nested boxes and cards everywhere.
2. **Warmth is functional** — Color communicates status and priority, not just brand. The palette earns its place.
3. **The consultant is the competitor** — Every UI must be self-evident. If it needs explanation, the design failed.
4. **Earned space** — Generous whitespace where decisions happen; density where data demands it. No padding that exists to look modern.
5. **Trust through precision** — Numbers are exact, states are unambiguous, actions have clear outcomes. This is compliance software.

## AI Agent Orchestration

AI agent instances operating in this repository are orchestrators. They must delegate exploration, implementation, verification, and other execution work to sub-agents whenever the work can be cleanly scoped, preserving the orchestrator's context window for coordination, integration, and final judgment.

Sub-agent driven development is the default required workflow when the active Codex runtime exposes usable sub-agents. The orchestrator should keep coordination, integration, and final judgment local, but should not personally perform cleanly delegable exploration, implementation, verification, or review work unless runtime policy or a concrete blocker prevents delegation.

**Use the smallest capable model for sub-agents whenever possible.** Default spawned agents to a small/cheap model (e.g. Haiku, or the agent definition's lightest tier) and only escalate to a larger model (Sonnet, then Opus) when the task genuinely needs deeper reasoning — gnarly multi-system debugging, hard architectural judgment, or nuanced review. Routine exploration, file search, "where is X", straightforward edits, and mechanical verification should run on the smallest model that can do the job. Bias toward small; escalate only on demonstrated need.

## Required marketing copy pass

For this repo, all marketing copy must pass through both writing checks before completion:

1. Use the `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Use the `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level.

This applies to landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social copy, SEO pages, and user-facing UI text that sells, explains, persuades, activates, or reassures.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.

<!-- BEGIN: User-Facing Copy Guardrails -->

## User-Facing Copy Guardrails

For any user-facing copy in this repo, run the copy through these guardrails before you call the work done. This applies to product UI text, landing pages, hero copy, CTAs, pricing copy, onboarding copy, emails, ads, popups, social posts, SEO pages, help text, empty states, reassurance text, and any copy that sells, explains, persuades, activates, or reassures.

Required order:

1. Run the globally installed `humanizer` skill to remove AI-sounding, bloated, or generic copy.
2. Run the globally installed `third-grade-copy` skill to rewrite and audit the result for a third-grade reading level. The source package for this skill lives in `<sibling repo>`; if the global skill is missing or stale, reinstall or sync it from there before finalizing copy.
3. Verify there are zero lies: no made-up numbers, claims, proof, testimonials, guarantees, rankings, integrations, prices, timelines, or capabilities. Check claims against the product source of truth before publishing.
4. Verify the message fits the whole place it appears: the page, flow, audience, offer, brand voice, surrounding copy, and user intent. Do not approve a line just because it is clear in isolation.

Do not apply this rule to code identifiers, logs, API docs, technical docs for developers, exact legal text, database values, or user-generated content unless the user asks.

<!-- END: User-Facing Copy Guardrails -->

## Working autonomously

- **Poll, don't idle.** When a task, build, test run, or hook is running, actively poll its status and output until it finishes. Don't just sit and wait passively for it to return.
- **Keep going.** When working toward a goal, finishing one chunk of work means moving straight to the next chunk. Don't stop and wait for further input mid-goal — continue until the goal is done or you are genuinely blocked.
