# GrantPipe - Feature Gap Audit

_Last updated: 2026-04-15_

This document tracks the delta between what [grantpipe.com](https://grantpipe.com) markets and what is actually implemented. It is the authoritative reference for prioritizing remaining build work before public launch.

---

## Summary

The core product (Donor CRM, Grant Pipeline, Fund Management, Compliance Reporting, Billing) is implemented and production-capable. Two Audit-Ready-tier differentiators are completely absent. Gaps 3-5 (Growth and Starter tier features) were closed on 2026-04-15.

| Gap                                   | Tier        | Severity | Status        |
| ------------------------------------- | ----------- | -------- | ------------- |
| External Auditor Portal               | Audit-Ready | Critical | Not started   |
| Multi-Program Allocation              | Audit-Ready | Critical | Not started   |
| Automated Deadline Alerts             | Growth+     | High     | **Done**      |
| Platform-specific migration templates | All tiers   | Medium   | **Done**      |
| Spend-Down Reports                    | All tiers   | Medium   | **Done**      |
| Custom/Advanced Report Builder        | Growth+     | Low      | Deferred V1.1 |

---

## Critical Gaps

### 1. External Auditor Portal

**Marketed as:** An Audit-Ready-tier feature allowing organizations to share documentation with third-party auditors.

**Current reality:** Does not exist anywhere in the codebase. There is no auditor role, no guest/read-only access path, no shareable document portal, and no auditor-specific UI routes.

**What exists:**

- Three internal roles: `viewer`, `editor`, `admin` (`apps/api/src/domains/org/routes.ts`)
- Document upload/download via R2 (`apps/api/src/domains/documents/`)

**What is missing:**

- A fourth role (`auditor` or `guest`) with scoped read-only access
- Shareable, token-authenticated portal URLs (no session required)
- Auditor-facing UI: filtered document view, compliance reports, fund activity - no editing
- Expiry / revocation logic for portal access tokens
- Audit trail of what the external auditor viewed and when

**Build scope:** Medium. Schema change (new role type or separate `auditor_invitations` table with token + expiry), new middleware guard, new read-only route group, new frontend route under `/auditor/:token`.

---

### 2. Multi-Program Allocation

**Marketed as:** An Audit-Ready-tier feature for distributing resources across programs.

**Current reality:** No "program" entity exists anywhere in the codebase - no table, no schema type, no service, no UI. The only place the word "program" appears is in volunteer hour tracking (unrelated).

**What exists:**

- Grant-to-fund allocations (many-to-many via `grant_fund_allocations`)
- Expense tracking against grants and funds

**What is missing:**

- `programs` table (name, description, org_id, fiscal_year, budget)
- `program_grant_allocations` junction (programs â†” grants with amounts)
- `program_expense_allocations` (expenses split across programs)
- Program CRUD API and service layer
- Program-level budget vs. actual reporting
- Program view in web app

**Build scope:** Large. New schema domain, full CRUD stack, reporting integration.

---

## High-Priority Gaps

### 3. Automated Compliance Deadline Alerts

**Marketed as:** "Automated compliance deadlines - calendar alerts for reporting obligations" (Growth+ plan).

**Current reality:** The infrastructure exists but the trigger logic does not fire.

**What exists:**

- `notifications` table and service (`apps/api/src/domains/notifications/`)
- `grant_reporting_requirements` with `due_date` column
- Calendar UI (`apps/web/src/routes/_authenticated/calendar.tsx`)
- Cron trigger entry in `wrangler.toml` (`0 * * * *`) referencing `sendScheduledGrantDeadlineReminders`
- Email template infrastructure via Resend

**Status: Done (2026-04-15)**

- `sendScheduledGrantDeadlineReminders` fires on exact threshold days (0, 1, 7) for application deadlines, reporting requirements, and closeout items
- Email gated on `growth`/`audit_ready` tier; in-app notifications sent to all tiers
- Real Resend email provider wired when `RESEND_API_KEY` is set; mock provider used in dev
- `requirePlanTier(minimum)` middleware added to `paywall.ts`
- `reporting_deadline`, `closeout_deadline`, and `spend_down_threshold` added to `NOTIFICATION_TYPES`
- Sidebar and header Notifications links show an unread count badge
- Note: the original claim that `sendScheduledGrantDeadlineReminders` was a stub was inaccurate - the function was fully implemented for application deadlines; this work extended it to reporting requirements and closeout items and added tier gating.

---

## Medium-Priority Gaps

### 4. Platform-Specific Migration Templates

**Marketed as:** "Guided migration from Bloomerang, DonorPerfect, Salesforce, or spreadsheets."

**Current reality:** A generic CSV import wizard exists with column mapping, preview, validation, and import history. There are no pre-built column map templates for any named platform.

**What exists:**

- `apps/api/src/domains/import/service.ts` - generic CSV import with field mapping
- `apps/api/src/domains/import/csv.ts` - CSV parsing
- `apps/web/src/routes/_authenticated/import.tsx` - import UI with column mapper
- `importHistory` table in schema

**Status: Done (2026-04-15)**

- `IMPORT_PRESETS` for Bloomerang, DonorPerfect, and Salesforce NPSP in `packages/shared/src/constants/import-presets.ts`
- "Coming from" selector in import UI auto-maps column headers per platform
- `buildResolvedImportMapping` accepts `presetId`; preset aliases take precedence over generic aliases
- Preview signature includes `presetId` so changing the platform invalidates stale previews

---

### 5. Explicit Spend-Down Reports

**Marketed as:** "Tag donations to specific grants and generate spend-down reports."

**Current reality (2026-04-13):** The math layer existed (`buildGrantSummary`, `calculateGrantBurnRate`, threshold derivation) but no service endpoint, compliance generator, or cron alert existed. The "Phase 4 not yet implemented" claim in older versions of this doc was inaccurate - expenses, allocations, burn rate, and thresholds already shipped; only report generation and alerts were missing.

**Status: Done (2026-04-15)**

- `getGrantSpendDown` service: budget vs. actual, burn rate, projected exhaustion date, byCategory / byFund / byMonth breakdowns
- `GET /grants/:grantId/spend-down` with optional `from` / `to` date range filtering
- `generateSpendDownReport` compliance generator produces a PDF stored in R2
- `POST /compliance/reports/spend-down` route
- `checkGrantSpendDownThresholds` cron function with per-user dedupe and `growth`/`audit_ready` email gating
- `SpendDownResult` type in `@grantpipe/shared`
- Spend-Down tab on grant detail page with stat cards, category/fund/month breakdowns, and report download button

---

## Low-Priority Gaps

### 6. Custom / Advanced Report Builder

**Marketed as:** "Advanced Reporting - custom compliance and financial views" (Growth+ plan).

**Current reality:** Five pre-built report types exist: grant compliance, audit documentation, 990 data export, board report, acknowledgment letters. There is no ad-hoc query or filter builder.

**What exists:**

- `apps/api/src/domains/compliance/service.ts` - `generateReport` with 5 hard-coded report types
- `reportTemplates` table for saving generated outputs
- Custom fields per entity type (per-org field definitions)

**What is missing:**

- Ad-hoc filter/grouping UI (date range, fund, grant, program, donor segment)
- Saved report configurations (name, filters, schedule)
- Drill-down from summary to underlying records
- Scheduled report delivery via email

**Build scope:** Large. Low priority for V1 launch - the five pre-built reports cover the core compliance use cases. Consider as a V1.1 feature.

---

## Phases Not Yet Executed

The following phases from `docs/superpowers/plans/phase-roadmap.md` are planned but not built. Their absence accounts for most of the gaps above.

| Phase                           | Key features                                                                                                       | Gaps it closes                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Phase 4: Grants & Funds         | Funder CRUD, grant lifecycle, fund CRUD, expense tracking, spend-down, reporting requirements, closeout checklists | Gap 5 (Spend-Down)                       |
| Phase 5: Compliance & Reporting | PDF generation, audit export, 990 export, board report, acknowledgment letters                                     | Gaps 5, 6                                |
| Phase 6: Events & Volunteers    | Event/attendee/revenue/volunteer tracking                                                                          | Not marketed - low priority              |
| Phase 7: Infrastructure         | Document attachments, CSV import wizard, notifications, custom fields, activity log                                | Gap 3 (alerts), Gap 4 (import templates) |
| Phase 8: Dashboard & Calendar   | Home dashboard, grant health, deadline calendar                                                                    | Gap 3 (calendar)                         |
| Phase 9: Settings & Billing     | Team invites, Stripe live mode, plan gating, data export                                                           | Already implemented via the billing work |
| Phase 10: Polish & Integration  | Design audit, E2E tests, Sentry, PostHog                                                                           | -                                        |

New phases needed (not in roadmap):

| New Phase      | Key features                                                         | Gaps it closes | Tier        |
| -------------- | -------------------------------------------------------------------- | -------------- | ----------- |
| Auditor Portal | Auditor role, token-authenticated read-only portal, document sharing | Gap 1          | Audit-Ready |
| Programs       | Program entity, allocations, budget vs. actual                       | Gap 2          | Audit-Ready |

---

## Recommended Priority Order

For launch, address in this order:

1. **Gap 3 - Automated deadline alerts** - small lift, directly gated on a Growth+ upsell, cron infrastructure already wired.
2. **Gap 4 - Platform-specific import templates** - small lift, removes a friction point for every new signup, import UI already works.
3. **Gap 5 - Spend-down reports** - requires completing Phase 4 (grants/funds), which is a core product area.
4. **Gap 1 - External Auditor Portal** - required to honestly market Audit-Ready tier; medium scope.
5. **Gap 2 - Multi-Program Allocation** - required to honestly market Audit-Ready tier; large scope.
6. **Gap 6 - Custom report builder** - defer to V1.1.
