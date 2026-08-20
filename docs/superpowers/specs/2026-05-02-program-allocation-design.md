# Program Allocation Design Specification

**Date:** 2026-05-02
**Status:** Approved
**Source:** `docs/grant-operating-system/01-program-allocation-prd.md`
**Tier:** Audit-Ready for create/edit/export workflows; Growth receives read-only previews where useful

---

## 1. Product Thesis

Programs become a first-class operating dimension alongside grants, funds,
expenses, journal lines, compliance requirements, and outcomes.

GrantPipe already tracks restricted funding, grant deadlines, expenses,
documents, and audit evidence. Program Allocation closes the operating-system
loop: grants fund programs, programs spend money through expenses and journal
lines, and programs own outcomes that appear in grant and compliance reports.
Finance and grant teams should be able to answer which programs a grant funds,
which funds support a program, whether a program is on budget, and which
outcomes belong to the work without leaving GrantPipe for spreadsheets.

This is an Audit-Ready differentiator. The full allocation, budget, reporting,
and export workflow belongs to Audit-Ready. Growth users may see program
labels, summaries, and read-only allocation context where it makes the rest of
the product easier to understand, but Growth must not be marketed or implemented
as having full Program Allocation access.

---

## 2. Scope

### 2.1 In Scope

- Program list, create, edit, archive, and detail views.
- Program fields: name, code, description, owner, status, start date, end date,
  department, and default functional expense class.
- Program budgets by fiscal period, with budget lines by category.
- Grant-to-program allocations by amount or percent, with purpose and effective
  date range.
- Expense-to-program allocations by amount or percent.
- Program ownership for impact metrics and reporting requirements.
- Program budget-vs-actual reporting by period, grant, fund, and expense
  category.
- Program budget-vs-actual export.
- Program dimension in relevant journal and reporting queries without double
  counting fund, grant, or functional expense totals.
- Activity log entries for every program and allocation mutation.
- Audit-Ready mutation and export gating, with Growth read-only previews.
- Marketing and SEO rollout wherever GrantPipe capabilities and plan tiers are
  listed.

### 2.2 Out of Scope

- Full ERP project accounting replacement.
- A generic cost-center engine that models every nonprofit department/project
  taxonomy.
- Advanced indirect-cost allocation automation beyond explicit amount and
  percent splits.
- Casework, service delivery, or client management workflows.
- Program budget versioning. The first implementation stores active budgets and
  activity-log history; budget versioning can be specified separately.

---

## 3. UX Model

### 3.1 Navigation

Add **Programs** to the authenticated app navigation in the operating-work area,
near Compliance and Accounting/Funds. Programs are not a donor CRM concept; they
belong with the surfaces where finance, restricted funds, grants, and reporting
work meet.

### 3.2 Program List

The list view supports search and filters for status, owner, department, and
fiscal period. Rows show program name, code, owner, status, current-period
budget, actual expenses, remaining budget, funded grants, linked funds, and
upcoming reporting requirements. Growth users may view this summary when they
have Growth access, but create/edit controls are replaced by Audit-Ready upgrade
CTAs.

### 3.3 Program Detail

Program detail is a dense operational workspace with these tabs:

- **Overview:** budget, actuals, remaining budget, active grant funding, linked
  funds, open reporting requirements, and owned impact metrics.
- **Funding/Budget:** budget periods, budget lines, grant allocations, fund
  context, and funding mix.
- **Expenses:** expense allocation table and journal-line-backed actuals.
- **Requirements:** reporting requirements linked to the program.
- **Outcomes:** impact metrics owned by the program, optionally linked to
  grants.
- **Activity:** program and allocation activity log entries.

### 3.4 Grant Detail Integration

Grant detail gains a **Programs** tab showing allocations from the grant to one
or more programs. The tab shows allocated amount, percent, purpose, effective
dates, remaining unallocated award amount, and warnings if allocations exceed
available grant/fund availability.

Grant create/edit flows include a program picker and a launch point for the
grant allocation drawer. The picker is for simple association; the allocation
drawer is used when amounts, percentages, dates, or purposes are needed.

### 3.5 Expense Integration

Expense create/edit flows include a program allocation drawer. Users can split
an expense across programs in amount or percent mode. The drawer shows the total
expense amount, allocated amount, unallocated amount, and validation errors for
negative, zero, duplicate, or over-100-percent allocations.

Program allocation must not replace fund, grant, or functional expense coding.
The UI should make it clear that program is an additional dimension, not a
second expense total.

### 3.6 Compliance And Outcomes Integration

Reporting requirements and impact metrics gain program pickers. A requirement
may be linked to a grant, a program, or both when the underlying work is
program-owned. Impact metrics may be linked to a program and optionally a grant,
so outcome ownership is visible from both the program and grant views.

### 3.7 Allocation Warnings

Before saving grant or expense allocations, show warnings when:

- Grant-program allocations exceed the remaining award amount.
- Allocations conflict with linked fund availability.
- Expense allocation percentages do not total 100 percent.
- Expense allocation amounts do not total the expense amount.
- A selected program is archived or outside the allocation effective date range.

Warnings that indicate invalid math block save. Warnings about availability or
date fit should require explicit confirmation when the business rule allows the
record to exist for planning purposes.

### 3.8 Growth Preview

Growth users can view program labels and summaries in places where hiding them
would make grant, fund, expense, or reporting context confusing. Growth users
cannot create programs, edit budgets, mutate allocations, or export program
reports. Upgrade CTAs must be precise:

- "Program allocation editing is available on Audit-Ready."
- "Upgrade to Audit-Ready to export program budget-vs-actual reports."
- "Growth includes read-only program context, not allocation management."

---

## 4. Data Model

### 4.1 New Tables

**programs**

`id` | `org_id` | `name` | `code` | `description` | `owner_user_id` | `status`
| `start_date` | `end_date` | `department` | `default_functional_class` |
`created_at` | `updated_at` | `deleted_at`

**program_budgets**

`id` | `org_id` | `program_id` | `name` | `period_start` | `period_end` |
`status` | `created_at` | `updated_at` | `deleted_at`

**program_budget_lines**

`id` | `org_id` | `program_budget_id` | `category` | `description` |
`amount_cents` | `created_at` | `updated_at` | `deleted_at`

**grant_program_allocations**

`id` | `org_id` | `grant_id` | `program_id` | `mode` | `amount_cents` |
`percent_bps` | `purpose` | `effective_start_date` | `effective_end_date` |
`created_at` | `updated_at` | `deleted_at`

**expense_program_allocations**

`id` | `org_id` | `expense_id` | `program_id` | `mode` | `amount_cents` |
`percent_bps` | `created_at` | `updated_at` | `deleted_at`

### 4.2 Link Tables And Extensions

Use link tables where direct foreign keys would force disruptive changes to
existing domains:

- `program_impact_metric_links`: `org_id`, `program_id`, `impact_metric_id`,
  optional `grant_id`, timestamps, soft delete.
- `program_reporting_requirement_links`: `org_id`, `program_id`,
  `reporting_requirement_id`, optional `grant_id`, timestamps, soft delete.

Journal/reporting queries should derive program actuals from expense-program
allocations and linked expense or journal data. Do not duplicate the journal
line amount into a program table in a way that creates competing accounting
truth.

### 4.3 Constraints And Indexes

- Every table includes `org_id` and every query scopes by organization.
- Mutable entities use `deleted_at` for soft delete.
- Money uses integer cents.
- Percent allocations use basis points (`percent_bps`) to avoid floating-point
  math.
- Program codes are unique per org among non-deleted programs.
- Indexes support program list, budget period lookup, grant allocation lookup,
  expense allocation lookup, and reporting aggregation.
- Allocation rows cannot set both amount and percent for the same row.
- Allocation rows cannot set neither amount nor percent.

---

## 5. API Model

### 5.1 Domain

Add `apps/api/src/domains/programs/` and mount it at `/api/programs`.

Services should stay focused:

- `program.service.ts`: CRUD, archive, list filters.
- `budget.service.ts`: program budgets and budget lines.
- `allocation.service.ts`: grant and expense allocations, validation, warnings.
- `report.service.ts`: budget-vs-actual aggregation and export payloads.
- `program-activity.service.ts`: activity-log helpers if existing activity
  helpers do not already cover the needed polymorphic entries.

### 5.2 Routes

| Method   | Path                                  | Access              | Description                           |
| -------- | ------------------------------------- | ------------------- | ------------------------------------- |
| `GET`    | `/`                                   | Growth+ read        | List programs and read-only summaries |
| `POST`   | `/`                                   | Audit-Ready editor+ | Create program                        |
| `GET`    | `/:programId`                         | Growth+ read        | Program detail                        |
| `PATCH`  | `/:programId`                         | Audit-Ready editor+ | Update program                        |
| `DELETE` | `/:programId`                         | Audit-Ready admin   | Archive program                       |
| `GET`    | `/:programId/budgets`                 | Growth+ read        | List program budgets                  |
| `POST`   | `/:programId/budgets`                 | Audit-Ready editor+ | Create budget                         |
| `PATCH`  | `/:programId/budgets/:budgetId`       | Audit-Ready editor+ | Update budget                         |
| `DELETE` | `/:programId/budgets/:budgetId`       | Audit-Ready admin   | Archive budget                        |
| `POST`   | `/grant-allocations`                  | Audit-Ready editor+ | Create or replace grant allocations   |
| `POST`   | `/expense-allocations`                | Audit-Ready editor+ | Create or replace expense allocations |
| `GET`    | `/:programId/budget-vs-actual`        | Growth+ read        | Report data                           |
| `GET`    | `/:programId/budget-vs-actual/export` | Audit-Ready viewer+ | Export report                         |

### 5.3 Existing Domain Extensions

- Grant detail responses include program allocations and computed unallocated
  award amount.
- Expense detail and mutation flows include program allocations.
- Reporting requirement services expose program links.
- Impact metric services expose program ownership.
- Reporting services accept a program filter where the report semantics support
  it.

### 5.4 Permissions And Tier Gates

Add `programs` as a `FeatureArea` unless implementation proves an existing
feature area already models this cleanly. The preferred model is explicit:
programs deserve independent RBAC because auditors may need program evidence
without donor access.

Access rules:

- Admin and editor can create/edit programs and allocations when the org is on
  Audit-Ready.
- Viewer can read program data.
- Auditor can read scoped program allocation, expense, document, compliance,
  accounting, and report evidence.
- Growth can read preview-safe program context but cannot mutate or export.
- Mutation and export endpoints use `requirePlanTier("audit_ready")`.

### 5.5 Activity Log

Every mutation records before/after values:

- Program create, update, archive.
- Budget create, update, archive.
- Budget line create, update, archive.
- Grant-program allocation create, update, delete, replace.
- Expense-program allocation create, update, delete, replace.
- Impact metric and reporting requirement program link changes.

---

## 6. Reporting And Export Model

Budget-vs-actual reports show:

- Budget period.
- Budget category.
- Budget amount.
- Actual expense amount allocated to the program.
- Encumbered or planned amount when the source data exists.
- Remaining budget.
- Funding mix by grant and fund.
- Drill-through rows for expenses, grant allocations, fund context, and linked
  reporting requirements.

Report aggregation must avoid double counting. Program is a reporting dimension
applied to allocated shares of expenses; totals should reconcile back to the
source expense or journal line exactly once.

Exports should use the existing export pattern in the repo. Export endpoints are
Audit-Ready gated even when the report data itself is visible as a Growth
preview.

---

## 7. Marketing Model

Program Allocation must be marketed as Audit-Ready. Growth copy may mention
read-only program context only if it is explicit that allocation management and
exports require Audit-Ready.

Update:

- Centralized marketed capability config.
- Homepage capability highlights.
- Product and feature pages.
- Pricing page and tier cards.
- `pricing.txt`.
- Existing SEO markdown pages where GrantPipe feature lists, tier summaries, or
  Audit-Ready capability claims appear.

Add content regression tests that require:

- Audit-Ready includes Program Allocation.
- Growth does not imply full Program Allocation access.
- `pricing.txt`, pricing-page content, and centralized tier config stay
  consistent.
- SEO/content pages with feature-list claims do not contain stale tier claims.

---

## 8. Success Metrics

- Percentage of active grants linked to at least one program.
- Percentage of expenses assigned to programs.
- Number of exported program budget-vs-actual reports.
- Reduction in customer-reported spreadsheet work for program budgets.
- Expansion or retention conversations where program reporting is cited as a
  reason to stay.

---

## 9. Risks

- Nonprofits use "program," "department," "project," and "cost center" in
  inconsistent ways. The model must be clear enough to support program
  reporting without becoming a generic dimension builder.
- Expense allocation can double count if program, fund, grant, and functional
  expense dimensions are aggregated incorrectly.
- Budget versioning may become necessary once customers revise budgets during a
  fiscal year.
- Growth previews must not create a support burden by appearing editable.
- Marketing rollout has a high stale-claim risk because capabilities are listed
  across config, public pages, `pricing.txt`, and SEO markdown.

---

## 10. Approval Notes

The PRD launch slice proposed shipping programs, grant-to-program allocations,
expense-to-program allocations, and budget-vs-actual first, with outcome
ownership and richer allocation rules second. This approved spec expands the
implementation target to the full PRD now: first-class programs, budgets,
allocations, reporting, outcome ownership, reporting requirement links, exports,
activity log coverage, tier gating, and marketing rollout.
