# GrantPipe V1 - Design Specification

**Date:** 2026-04-07
**Status:** Draft - pending review

---

## 1. Product Overview

GrantPipe is a unified donor CRM and grant compliance platform for mid-sized nonprofits ($500K-$10M budgets). It manages donors and grants in one system with restricted fund tracking, audit-ready compliance reporting, and self-serve onboarding - no consultants required.

**Positioning:** Anti-Salesforce. 80-90% less than Salesforce total cost of ownership. Flat pricing at $20/$49/$99 per month. No per-contact pricing, no setup fees.

**Target users:**

- Executive Directors (budget authority, board accountability)
- Development Directors (daily users, grant compliance, donor management)
- Finance/Operations Staff (restricted fund integrity, audit trails)

**Roles:** Admin, Editor, Viewer.

---

## 2. Tech Stack

| Layer              | Choice                                    |
| ------------------ | ----------------------------------------- |
| Monorepo           | pnpm workspaces + Turborepo               |
| SaaS app           | React 19 + Vite on Cloudflare Pages       |
| API                | Hono on Cloudflare Workers (RPC mode)     |
| Database           | Neon (Postgres), row-level multi-tenancy  |
| Auth               | Better Auth (email/password + Google SSO) |
| ORM                | Drizzle (Neon adapter)                    |
| Connection pooling | Cloudflare Hyperdrive                     |
| UI                 | Shadcn/UI + Tailwind CSS 4                |
| Routing            | TanStack Router (file-based)              |
| Data fetching      | TanStack Query + Hono RPC client          |
| File storage       | Cloudflare R2                             |
| Email              | Resend (transactional)                    |
| Payments           | Stripe (subscriptions)                    |
| Analytics          | PostHog                                   |
| Error tracking     | Sentry                                    |
| Hosting            | Cloudflare Pages + Workers                |
| Repo               | GitHub                                    |

---

## 3. Monorepo Structure

```
grantpipe/
├── apps/
│   ├── web/                    # React + Vite SPA (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── routes/         # TanStack Router file-based routes
│   │   │   ├── components/     # App-specific components
│   │   │   ├── hooks/          # App-specific hooks
│   │   │   ├── lib/            # Client utilities (api client, formatters)
│   │   │   └── main.tsx        # Entry point
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── api/                    # Hono on Cloudflare Workers
│       ├── src/
│       │   ├── domains/        # Domain-grouped route modules
│       │   │   ├── auth/       # login, signup, session, invite
│       │   │   ├── donors/     # contacts, donations, pipeline, tags
│       │   │   ├── grants/     # grants, applications, lifecycle
│       │   │   ├── funds/      # fund balances, allocations, expenses
│       │   │   ├── compliance/ # reports, exports, 990, board reports
│       │   │   ├── events/     # event CRUD, attendees
│       │   │   ├── volunteers/ # hours, assignments
│       │   │   ├── documents/  # file upload/download (R2)
│       │   │   ├── notifications/ # in-app + email preferences
│       │   │   ├── import/     # CSV import, column mapping
│       │   │   └── org/        # org settings, team, billing, custom fields
│       │   ├── middleware/     # auth, org-context, rate-limit, error-handler
│       │   ├── services/      # cross-domain business logic
│       │   ├── lib/           # shared API utilities
│       │   └── app.ts         # Hono app composition, type export
│       ├── wrangler.toml
│       └── package.json
│
├── packages/
│   ├── db/                    # Drizzle schema + migrations
│   │   ├── src/
│   │   │   ├── schema/        # One file per domain
│   │   │   ├── migrations/    # Drizzle-generated SQL
│   │   │   └── index.ts       # Re-exports
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── ui/                    # Shared Shadcn/UI component library + design tokens
│   │   ├── src/
│   │   │   ├── components/    # Shadcn base components
│   │   │   ├── globals.css    # Design tokens as CSS variables
│   │   │   ├── lib/           # cn() utility
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── shared/                # Types, constants, Zod validators
│       ├── src/
│       │   ├── types/         # Shared TypeScript types
│       │   ├── validators/    # Zod schemas (API + client)
│       │   ├── constants/     # Enums, stage names, role definitions
│       │   └── index.ts
│       └── package.json
│
├── package.json               # pnpm workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── eslint.config.js
├── .prettierrc.json
├── .lintstagedrc.json
├── .husky/pre-commit
├── .impeccable.md             # Design system context
├── .gitignore
├── CLAUDE.md
└── AGENTS.md
```

---

## 4. Data Model

### 4.1 Auth & Organization

**organizations**
`id` - `name` - `slug` - `ein` - `fiscal_year_start_month` - `timezone` - `logo_url` - `address` - `stripe_customer_id` - `stripe_subscription_id` - `plan_tier` - `created_at` - `updated_at` - `deleted_at`

**users** - managed by Better Auth
`id` - `email` - `name` - `avatar_url` - `email_verified` - `created_at` - `updated_at`

Better Auth also manages: `sessions`, `accounts`, `verifications`.

**org_members**
`id` - `org_id` → organizations - `user_id` → users - `role` (admin | editor | viewer) - `invited_by` → users - `joined_at` - `deleted_at`

**invite_links**
`id` - `org_id` → organizations - `token` - `role` - `created_by` → users - `expires_at` - `used_by` → users - `used_at`

### 4.2 Donor CRM

**contacts** - individuals and organizations
`id` - `org_id` - `type` (individual | organization) - `first_name` - `last_name` - `organization_name` - `email` - `phone` - `address` - `pipeline_stage` (prospect | cultivation | solicitation | stewardship) - `affiliated_org_id` → contacts (self-ref: person → org they work for) - `is_volunteer` - `notes` - `created_at` - `updated_at` - `deleted_at`

**donations**
`id` - `org_id` - `contact_id` → contacts - `amount_cents` - `currency` - `date` - `type` (one_time | recurring | pledge) - `restriction` (unrestricted | restricted) - `fund_id` → funds - `grant_id` → grants - `payment_method` - `receipt_sent` - `notes` - `created_at` - `deleted_at`

**tags**
`id` - `org_id` - `name` - `color`

**contact_tags** - many-to-many
`contact_id` → contacts - `tag_id` → tags

### 4.3 Grants & Funds

**funders** - institutional funder profiles
`id` - `org_id` - `name` - `type` (foundation | corporate | government | other) - `website` - `priorities` - `notes` - `created_at` - `updated_at` - `deleted_at`

**funder_contacts** - program officers at funders
`id` - `org_id` - `funder_id` → funders - `name` - `title` - `email` - `phone` - `notes` - `deleted_at`

**grants**
`id` - `org_id` - `funder_id` → funders - `name` - `status` (discovery | application | submitted | awarded | active | reporting | closeout | renewal | declined) - `amount_cents` - `start_date` - `end_date` - `application_deadline` - `description` - `notes` - `created_at` - `updated_at` - `deleted_at`

**funds** - restriction categories
`id` - `org_id` - `name` - `type` (temporarily_restricted | permanently_restricted | unrestricted) - `description` - `created_at` - `deleted_at`

Grants and funds are separate entities. Multiple grants can feed the same fund. One grant can allocate to multiple funds. This matches FASB ASC 958 and how Sage Intacct / Blackbaud model it.

**grant_fund_allocations** - grant ↔ fund mapping
`id` - `grant_id` → grants - `fund_id` → funds - `allocated_amount_cents`

**expenses** - tracked against both grants and funds
`id` - `org_id` - `grant_id` → grants - `fund_id` → funds - `amount_cents` - `date` - `description` - `category` - `vendor` - `created_at` - `deleted_at`

**grant_impact_metrics** - outcome definitions per grant
`id` - `org_id` - `grant_id` → grants - `name` (e.g., "families served") - `target_value` - `unit` - `created_at`

### 4.4 Compliance & Reporting

**grant_reporting_requirements**
`id` - `org_id` - `grant_id` → grants - `report_type` (quarterly | annual | final | custom) - `due_date` - `status` (upcoming | in_progress | submitted | overdue) - `submitted_at` - `notes`

**impact_metric_entries** - periodic actuals
`id` - `metric_id` → grant_impact_metrics - `value` - `period_start` - `period_end` - `notes` - `created_at`

**grant_closeout_items**
`id` - `org_id` - `grant_id` → grants - `label` - `completed` - `completed_at` - `completed_by` → users

**generated_reports** - saved PDF/exports
`id` - `org_id` - `type` (compliance | board | audit | 990) - `grant_id` → grants (nullable) - `file_key` → R2 - `generated_by` → users - `created_at`

### 4.5 Events & Volunteers

**events**
`id` - `org_id` - `name` - `type` (gala | fundraiser | campaign | meeting | other) - `date` - `location` - `description` - `revenue_goal_cents` - `created_at` - `deleted_at`

**event_attendees**
`id` - `event_id` → events - `contact_id` → contacts - `rsvp_status` (invited | confirmed | attended | declined) - `donation_id` → donations (if donated at event)

**volunteer_hours**
`id` - `org_id` - `contact_id` → contacts - `event_id` → events (nullable) - `program` - `hours` - `date` - `notes` - `created_at`

### 4.6 Shared Infrastructure

**communication_log**
`id` - `org_id` - `contact_id` → contacts - `type` (note | email | call | meeting) - `subject` - `body` - `logged_by` → users - `created_at`

**documents** - R2 file references, polymorphic
`id` - `org_id` - `file_key` - `filename` - `mime_type` - `size_bytes` - `entity_type` (contact | grant | donation | funder) - `entity_id` - `uploaded_by` → users - `created_at` - `deleted_at`

**activity_log** - audit trail on all entities
`id` - `org_id` - `actor_id` → users - `action` (created | updated | deleted | exported | ...) - `entity_type` - `entity_id` - `changes` (JSONB diff) - `created_at`

**custom_field_definitions**
`id` - `org_id` - `entity_type` (contact | donation | grant) - `name` - `field_type` (text | number | date | single_select | multi_select) - `options` (JSONB, for select types) - `sort_order`

**custom_field_values** - EAV pattern
`id` - `field_id` → custom_field_definitions - `entity_id` - `value` (text, coerced by field_type)

**notifications**
`id` - `org_id` - `user_id` → users - `type` (grant_deadline | report_due | import_complete | ...) - `title` - `body` - `entity_type` - `entity_id` - `read_at` - `created_at`

**notification_preferences** - per-user, per-notification-type settings
`id` - `user_id` → users - `org_id` → organizations - `notification_type` (grant_deadline | report_due | import_complete | ...) - `email_enabled` - `in_app_enabled`

**saved_segments** - saved filter queries for donor lists
`id` - `org_id` - `name` - `entity_type` (contact) - `filters` (JSONB - serialized filter criteria) - `created_by` → users - `created_at` - `updated_at`

### 4.7 Key Data Model Decisions

- **`org_id` on every table** - row-level multi-tenancy
- **Soft delete** via `deleted_at` on all main entities
- **Money as cents** (integer) - no floating point, formatted on the client
- **Polymorphic references** for `documents` and `activity_log` via `entity_type` + `entity_id`
- **EAV pattern** for custom fields - `custom_field_definitions` + `custom_field_values`
- **Grants and funds are separate entities** with a many-to-many join (`grant_fund_allocations`)
- **Expenses track against both grant and fund** for dual reporting views
- **Better Auth manages its own tables** - we don't define `users`, `sessions`, `accounts`, `verifications` in our schema

---

## 5. API Design

### 5.1 Architecture

Single Hono app on one Cloudflare Worker. All domain modules are route groups within one app. Hono RPC exports one type for the client - full end-to-end type safety.

### 5.2 Domain Modules

Each domain folder contains:

```
domains/<name>/
├── routes.ts      # Hono route definitions
├── service.ts     # Business logic
└── types.ts       # Domain-specific types (if needed)
```

Route composition in `app.ts`:

```typescript
const app = new Hono()
  .basePath("/api")
  .route("/auth", authRoutes)
  .route("/donors", donorRoutes)
  .route("/grants", grantRoutes)
  .route("/funds", fundRoutes)
  .route("/compliance", complianceRoutes)
  .route("/events", eventRoutes)
  .route("/volunteers", volunteerRoutes)
  .route("/documents", documentRoutes)
  .route("/notifications", notificationRoutes)
  .route("/import", importRoutes)
  .route("/org", orgRoutes);

export type AppType = typeof app;
```

### 5.3 Middleware Chain

Applied globally, in order:

1. **Error handler** - catches all errors, returns consistent JSON error format
2. **CORS** - configured for the web app origin
3. **Rate limiter** - per-IP, basic protection
4. **Auth** - validates Better Auth session, attaches `user` to context
5. **Org context** - loads org from session, attaches `org` to context, enforces `org_id` scoping

Routes under `/auth` (login, signup, invite accept) skip middleware 4-5.

### 5.4 Request Validation

Zod schemas from `packages/shared` validate all inputs via Hono's `zValidator` middleware. Same schemas used on the client for form validation.

### 5.5 API Conventions

- All list endpoints return `{ data: T[], total: number, page: number, pageSize: number }`
- All money values stored and transmitted as cents (integers)
- All dates as ISO 8601 strings
- Soft delete via `DELETE` sets `deleted_at`, returns 204
- Activity log entries created via a service helper, not manually in each route

### 5.6 Client Usage

```typescript
import { hc } from "hono/client";
import type { AppType } from "@grantpipe/api";

const client = hc<AppType>("/api");

// Type-safe, autocomplete on routes, inferred request/response types
const donors = await client.donors.$get({ query: { page: "1" } });
const grant = await client.grants[":id"].$get({ param: { id: "123" } });
```

---

## 6. Auth & Permissions

### 6.1 Auth Providers

- Email/password via Better Auth
- Google OAuth via Better Auth
- Session strategy: cookie-based (secure, httpOnly, sameSite)

### 6.2 Signup Flow

1. User signs up (email/password or Google SSO)
2. Better Auth creates user record
3. Post-signup hook creates `organizations` row + `org_members` row (role: admin)
4. User lands on onboarding screen (org name, fiscal year, timezone)
5. Onboarding PATCH updates the org record

### 6.3 Invite Flow

1. Admin creates invite link (selects role)
2. System generates token, stores in `invite_links` (7-day expiry)
3. Invited user clicks link → signup/login with invite token in URL
4. After auth, system validates token → creates `org_members` row
5. Token marked as used

### 6.4 Permission Matrix

| Action                                          | Admin | Editor | Viewer |
| ----------------------------------------------- | ----- | ------ | ------ |
| View all data                                   | Yes   | Yes    | Yes    |
| Create/edit contacts, donations, grants, events | Yes   | Yes    | No     |
| Log communications, volunteer hours             | Yes   | Yes    | No     |
| Upload/delete documents                         | Yes   | Yes    | No     |
| Generate reports & exports                      | Yes   | Yes    | Yes    |
| Import CSV data                                 | Yes   | Yes    | No     |
| Manage custom fields                            | Yes   | No     | No     |
| Manage team (invite, roles, deactivate)         | Yes   | No     | No     |
| Org settings (name, fiscal year, billing)       | Yes   | No     | No     |
| Delete records (soft delete)                    | Yes   | No     | No     |

Implementation: `requireRole('viewer' | 'editor' | 'admin')` middleware. Hierarchical: admin > editor > viewer.

---

## 7. Frontend Architecture

### 7.1 Route Structure

```
apps/web/src/routes/
├── __root.tsx                    # Root layout (sidebar + main area)
├── _authenticated.tsx            # Auth guard (redirects to login if no session)
├── _authenticated/
│   ├── dashboard.tsx             # Home overview
│   ├── donors/
│   │   ├── index.tsx             # Donor list
│   │   └── $contactId.tsx        # Contact detail (tabs: overview, donations, comms, docs, activity)
│   ├── grants/
│   │   ├── index.tsx             # Grant list + pipeline view
│   │   └── $grantId.tsx          # Grant detail (tabs: overview, budget, reporting, metrics, docs, activity)
│   ├── funds/
│   │   ├── index.tsx             # Fund balances overview
│   │   └── $fundId.tsx           # Fund ledger
│   ├── funders/
│   │   ├── index.tsx             # Funder list
│   │   └── $funderId.tsx         # Funder profile
│   ├── calendar.tsx              # Unified deadline calendar
│   ├── events/
│   │   ├── index.tsx             # Event list
│   │   └── $eventId.tsx          # Event detail
│   ├── reports/
│   │   ├── index.tsx             # Report hub
│   │   └── $reportId.tsx         # Generated report view
│   ├── import.tsx                # CSV import wizard
│   ├── notifications.tsx         # Notification center
│   └── settings/
│       ├── index.tsx             # Org profile
│       ├── team.tsx              # Team management
│       ├── custom-fields.tsx     # Custom field definitions
│       ├── billing.tsx           # Stripe portal
│       └── export.tsx            # Full data export
├── login.tsx
├── signup.tsx
└── invite.$token.tsx
```

### 7.2 App Shell

Linear-style sidebar navigation:

- Sidebar with nav items: Dashboard, Donors, Grants, Funds, Funders, Calendar, Events, Reports, Import, Settings
- Sidebar collapses to icons on narrow screens, becomes hamburger drawer on mobile (<768px)
- Top bar: notification bell (unread count), user avatar dropdown (profile, logout)
- Main content area fills remaining space

### 7.3 Data Fetching

TanStack Query with Hono RPC client. Queries colocated with routes.

Mutations use `useMutation` + `queryClient.invalidateQueries`. Optimistic updates for simple operations (toggling checkboxes, marking notifications read).

### 7.4 UI Patterns

- **List views** - Shadcn DataTable with column sorting, search, filters, pagination
- **Detail views** - tabbed layout with activity timeline
- **Forms** - Shadcn form components + React Hook Form + Zod validation (shared schemas)
- **Modals** - quick-create actions without leaving context
- **Toast notifications** - mutation success/error feedback

### 7.5 Design System

Design tokens defined as CSS variables in `packages/ui/globals.css`, consumed by Tailwind CSS 4.

- **Color palette:** Primary green (#065f46), accent terracotta (#e07a5f), neutral scale, semantic colors
- **Typography:** Sora (headings), IBM Plex Sans (body), IBM Plex Mono (data/labels)
- **Aesthetic:** Stripe/Linear-inspired - precision, whitespace, subtle depth, quiet confidence
- **Light mode only** for V1
- **Mobile responsive** - sidebar drawer, responsive tables, touch targets

`.impeccable.md` generated via `teach-impeccable` skill during scaffolding.

---

## 8. Infrastructure & Deployment

### 8.1 Local Development

```bash
pnpm --filter api dev          # Wrangler dev server
pnpm --filter web dev          # Vite dev server (proxies /api to Wrangler)
pnpm --filter db migrate       # Apply migrations
pnpm --filter db generate      # Generate migration from schema changes
pnpm --filter db studio        # Visual DB browser
```

### 8.2 Database Strategy

- **Production:** Neon main branch via Cloudflare Hyperdrive
- **Local dev:** Neon dev branch (Docker as fallback)
- **Migrations:** Drizzle Kit generates SQL, applied via `drizzle-kit migrate`

### 8.3 Production Deployment

| Component | Hosting            | Deploy                  |
| --------- | ------------------ | ----------------------- |
| Web app   | Cloudflare Pages   | `wrangler pages deploy` |
| API       | Cloudflare Workers | `wrangler deploy`       |
| Files     | Cloudflare R2      | Accessed via API        |
| Database  | Neon               | Managed                 |

### 8.4 Environment Variables

Non-secret (wrangler.toml `[vars]`):

- `APP_URL`
- `STRIPE_PUBLISHABLE_KEY`

Secrets (wrangler secret):

- `DATABASE_URL` - Neon connection string
- `BETTER_AUTH_SECRET` - session signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google OAuth
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` - Stripe
- `RESEND_API_KEY` - transactional email
- `R2_BUCKET_NAME` - document storage

### 8.5 Stripe Integration

- Checkout Session for subscription creation
- Customer Portal for plan changes / cancellation / payment methods
- Webhook at `/api/org/billing/webhook` handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- `organizations` stores `stripe_customer_id`, `stripe_subscription_id`, `plan_tier`
- Middleware checks `plan_tier` for feature gating

### 8.6 R2 Document Storage

- Key pattern: `{org_id}/{entity_type}/{entity_id}/{uuid}-{filename}`
- Upload: client → API (multipart) → R2 put → save to `documents` table
- Download: client → API (auth check) → R2 get → stream
- All access through API - no presigned URLs in V1
- Max file size: 10MB per upload

### 8.7 Monitoring

- **Sentry** - error tracking on API (Worker) and Web (React), source maps uploaded during build
- **PostHog** - product analytics. Key events: signup, onboarding complete, first donor/grant created, report generated, CSV imported

---

## 9. V1 Feature Scope

### Core

1. **Auth & Organization** - email/password + Google SSO, org creation, invite links, roles (admin/editor/viewer), org settings, user profile
2. **Donor CRM** - contacts (individuals + orgs), donations (one-time/recurring/pledges, restricted/unrestricted tagging), tags & segments, development pipeline, communication log, giving history, donor retention dashboard
3. **Grant Lifecycle** - grant records, pipeline stages (discovery → application → submitted → awarded → active → reporting → closeout → renewal), application tracking, award management, spend-down tracking, reporting requirements, closeout checklist, deadline calendar
4. **Restricted Fund Tracking** - donation-to-fund tagging, fund balance dashboard, per-fund ledger, expense entry against funds, spend-down alerts (80%/90%/100%)
5. **Compliance & Reporting** - funder compliance report (PDF + on-screen), audit documentation export, 990 data export, board report generator (PDF + shareable link)

### Differentiators

6. **Impact Metrics** - custom outcome metrics per grant, periodic actuals, included in compliance reports
7. **Funder Relationship Profiles** - funder records with program officer contacts, giving history, application history, notes
8. **Activity Timeline** - timestamped feed on every contact, grant, and funder record (audit trail made visible)
9. **Document Attachments** - file upload on contacts, grants, donations, funders (R2 storage)
10. **Donor Acknowledgment Letters** - auto-generated tax receipt PDFs, org-customizable template
11. **Board Report Generator** - one-click summary: grant portfolio, donor metrics, fund balances, pipeline status

### Additional Modules

12. **Event Management** - create events, track attendees (linked to contacts), log event revenue. No ticketing/payment/registration
13. **Volunteer Tracking** - volunteer flag on contacts, log hours per program/event, volunteer history. No shift scheduling
14. **Custom Fields** - on contacts, donations, grants. Types: text, number, date, single_select, multi_select. Per-org definitions

### Infrastructure

15. **Data Import** - CSV import with guided column mapping for donors, donations, grants. Duplicate detection. Import history log
16. **Notifications** - email reminders for grant deadlines (7 days, 1 day), in-app notification center, per-user preferences
17. **Dashboard** - home overview (upcoming deadlines, at-risk grants, recent activity), grant health traffic lights, donor metrics, pipeline summary
18. **Settings** - org profile/branding, team management, fiscal year config, data export (CSV), Stripe billing portal

### Explicitly NOT in V1

- Fund accounting / double-entry bookkeeping
- Payment processing / online donation forms
- Email marketing / bulk sending / drip campaigns
- Grant discovery / Candid API integration
- Wealth screening
- Multi-year pledge tracking with reminders
- Email integration (Gmail/Outlook auto-logging)
- Multi-org per user
- Native mobile app
- Staging environment

---

## 10. Quality Standards

### Quality Gates

- No placeholder code - every function fully implemented
- No TODO/FIXME/HACK comments
- No `any` type in TypeScript - use proper types or `unknown` with narrowing
- No `eslint-disable` without explanation

### Test-Driven Development - Mandatory

1. Write the failing test first
2. Run it, confirm it fails
3. Write minimal implementation to pass
4. Run it, confirm it passes
5. Refactor, re-run

**95% code coverage per file** - not the repo average, each individual file. Vitest for all packages.

### Pre-Commit Hooks

Two-layer system:

1. **lint-staged** - ESLint `--fix` + Prettier `--write` on staged files
2. **affected-packages** - detects which workspace packages have staged changes, runs `turbo typecheck test:coverage` only for those

### Workflow

- **Worktree isolation** - all feature work in a git worktree, never directly on main
- **Sub-agent driven development** - parallelize independent tasks
- **Review before merge** - code review agent, fix all issues, then merge

### Content Integrity

- Never fabricate metrics, testimonials, or social proof
- Use `stop-slop` then `humanizer` for any user-facing copy
