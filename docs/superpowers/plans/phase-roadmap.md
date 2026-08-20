# GrantPipe V1 - Phase Roadmap

Each phase produces working, testable software on its own. Detailed plans are written right before execution - the V1 design spec (`docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md`) has all requirements.

## Dependency Graph

```
Phase 1 (Scaffolding)
  â””â”€â”€ Phase 2 (Database & Auth)
        â”œâ”€â”€ Phase 3 (Donor CRM)
        â”‚     â””â”€â”€ Phase 6 (Events & Volunteers)
        â”œâ”€â”€ Phase 4 (Grants & Funds)
        â”œâ”€â”€ Phase 7 (Infrastructure)
        â””â”€â”€ Phase 9 (Settings & Billing)
              â”‚
        Phase 3 + 4
        â”œâ”€â”€ Phase 5 (Compliance & Reporting)
        â””â”€â”€ Phase 8 (Dashboard & Calendar)
              â”‚
        All phases
        â””â”€â”€ Phase 10 (Polish & Integration)
```

Phases 3, 4, 6, 7, and 9 can run in parallel once Phase 2 is complete.

---

## Phase 1: Scaffolding [COMPLETE]

**Plan:** `2026-04-07-phase-1-scaffolding.md`

Monorepo setup, tooling, dev servers, quality infrastructure. pnpm workspaces, Turborepo, ESLint, Prettier, Husky, pre-commit hooks, Vitest. Packages: shared (types, constants, validators), db (Drizzle + Neon), ui (Shadcn + design tokens). Apps: api (Hono health route), web (React + Vite + TanStack Router). CLAUDE.md, AGENTS.md, .impeccable.md, .claude/settings.json, .agents/settings.json.

---

## Phase 2: Database & Auth [COMPLETE]

**Plan:** `2026-04-07-phase-2-database-auth.md`

Drizzle schema for all V1 tables (28+ tables across 6 domain files with full relations). Better Auth integration (email/password + Google SSO) with Drizzle adapter. Post-signup hook creates org + admin membership. Middleware chain: error handler â†’ CORS â†’ DB init â†’ session â†’ org context â†’ requireRole. Auth service (org creation, invite tokens, invite acceptance). Onboarding flow (API + frontend). Auth UI: login, signup, auth guard, onboarding, invite accept pages. 138 tests, 100% coverage.

**Deferred to Phase 9:** Invite link creation API route (POST /invite), invite acceptance API route (POST /invite/:token/accept), and wiring the invite accept frontend page to a real endpoint. The invite schema, service logic (`acceptInvite`), and frontend page exist - only the Hono route handlers and RPC client wiring are missing.

---

## Phase 3: Donor CRM [COMPLETE]

**Plan:** `2026-04-07-phase-3-donor-crm.md`

**Depends on:** Phase 2

Contact CRUD (individuals + organizations, self-referencing affiliation). Donation CRUD (one-time, recurring, pledge, restricted/unrestricted tagging, fund linkage). Tags and contact_tags (many-to-many). Development pipeline with kanban drag-and-drop. Communication log (notes, emails, calls, meetings). Saved segments (JSONB filter queries). Giving history and donor retention calculations with FY trend chart. List views with search, filters, sorting, pagination. Detail views with tabs (overview, donations, communications). 17 Shadcn UI components. 450 tests.

---

## Phase 4: Grants & Funds

**Depends on:** Phase 2

Funder CRUD (institutional profiles with program officer contacts). Grant CRUD with full lifecycle stages (discovery â†’ renewal/declined). Fund CRUD (restriction categories). Grant-fund allocations (many-to-many with amounts). Expense tracking against both grants and funds. Grant impact metrics (definitions + periodic actuals). Spend-down tracking (budget vs actual, burn rate). Spend-down alerts (80%/90%/100%). Grant reporting requirements (per-funder cadence + deadlines). Closeout checklists. Pipeline and list views.

---

## Phase 5: Compliance & Reporting

**Depends on:** Phase 3 + Phase 4

Funder compliance report generation (per-grant: award, expenditures, balance, outcomes narrative). PDF generation + on-screen view. Audit documentation export (bulk restricted fund activity for a fiscal year). 990 data export (structured format for accountants). Board report generator (grant portfolio, donor metrics, fund balances, pipeline - PDF + shareable link). Donor acknowledgment letter generation (tax receipt PDFs with org template). Generated reports storage (R2 + `generated_reports` table).

---

## Phase 6: Events & Volunteers

**Depends on:** Phase 3

Event CRUD (name, type, date, location, revenue goal). Event attendees linked to contacts (RSVP tracking). Event revenue tracking (link donations to events via attendees). Volunteer hours logging (per contact, per program/event). Volunteer flag on contacts. Volunteer history on contact detail view.

---

## Phase 7: Infrastructure

**Depends on:** Phase 2

Document attachments - file upload/download via R2, polymorphic `documents` table (attach to contacts, grants, donations, funders). CSV import wizard - guided column mapping for donors, donations, grants; duplicate detection; import history log. Notifications - in-app notification center, email reminders for grant deadlines (7 days, 1 day), per-user notification preferences. Custom fields - definitions (per org, per entity type), values (EAV), rendered in detail views and forms. Activity log - automatic change tracking on all entities with JSONB diffs, displayed as timeline on detail views.

---

## Phase 8: Dashboard & Calendar

**Depends on:** Phase 3 + Phase 4

Home dashboard - upcoming deadlines (next 30 days), grants at risk (spend-down or reporting), recent activity feed. Grant health traffic lights (on track / at risk / overdue). Donor metrics - retention rate, total giving this FY vs last, new donor count. Pipeline summary - prospects by stage, applications in progress. Fund balances overview. Unified deadline calendar - all grant deadlines (applications, reports, closeouts) in a calendar view.

---

## Phase 9: Settings & Billing

**Depends on:** Phase 2

Org profile and branding (name, EIN, logo, address). Team management (invite links, change roles, deactivate members) - **includes invite link creation/acceptance API routes and wiring the invite accept frontend page deferred from Phase 2**. Fiscal year configuration. Stripe integration - Checkout Session for subscription, Customer Portal for changes/cancellation, webhook handling (checkout.session.completed, subscription.updated, subscription.deleted, invoice.payment_failed). Plan tier stored on org, middleware checks for feature gating. Full data export (CSV).

---

## Phase 10: Polish & Integration [COMPLETE]

**Depends on:** All phases

Design system audit (`audit` skill - accessibility, performance, responsive). Typography pass (`typeset` skill). Spacing and alignment pass (`polish` skill). E2E tests (Playwright). Error states and empty states for all views. Loading skeletons for all async views. Mobile responsive verification. Sentry integration (API + web). PostHog integration (key product events). Performance optimization (`optimize` skill).

**Delivered:**

- Design system audit - PageShell/PageHeader primitives, Shadcn component alignment, Skeleton system (all async views)
- Multiple polish passes - spacing, typography, color token consistency across all domains
- E2E tests - 7+ Playwright spec files covering auth, donor CRM, grants, funds, compliance, settings
- Error boundaries - domain-scoped React error boundaries wired to Sentry
- Empty states - TeachAndActEmptyState on all list views (donors, grants, funds, funders, journal, pipeline, calendar, etc.)
- Loading skeletons - Skeleton components on all async views including journal (replaced hand-rolled animate-pulse divs)
- Mobile responsive - MobileNav shell, card/table dual layouts for narrow viewports
- Sentry integration - @sentry/cloudflare on API, @sentry/react on web with source maps
- PostHog integration - 20+ product events, capturePageview wired to TanStack Router onResolved subscription
- RBAC - per-member permission overrides for granular access control on invite links and org members
- CSV import - guided column-mapping wizard for donors, donations, grants with duplicate detection
