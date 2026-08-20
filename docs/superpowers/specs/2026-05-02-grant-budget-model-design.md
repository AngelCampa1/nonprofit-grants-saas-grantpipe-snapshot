# Grant Budget Model - Design Specification

**Date:** 2026-05-02
**Status:** Implemented foundation, API, and first UI read surface on 2026-05-05
**Source PRD:** `docs/grant-operating-system/02-grant-budget-model-prd.md`

---

## 1. Scope

Build a structured grant budget model that makes GrantPipe aware of the
funder-approved budget, reporting periods, planned expenses, actual spend,
amendments, and budget-vs-actual controls.

This is a grants-domain capability, not a standalone module. The primary UI is a
first-class `Budget` tab inside grant detail, beside Overview, Allocations,
Expenses, Reporting, Spend-Down, Activity, and Documents. Award setup should also
include a budget step so the approved budget is captured while the grant record
is created.

The first implementation slice adds the durable schema, shared validators,
tier helpers, grant-scoped API routes, budget variance hook, grant detail Budget
tab, and shared pricing copy. Follow-on slices should deepen the write UI,
document extraction workflow, amendment drawer, and bulk SEO page templates.

**Included:**

- Budget versions with draft, approved, and superseded states.
- Budget periods and reporting-period labels.
- Budget lines with categories, allowable flags, direct or indirect
  classification, optional program, optional fund, and notes.
- Budget line creation from manual entry and document intake.
- Actual expense assignment to one or more budget lines.
- Split expense allocation by cents.
- Planned expenses linked to budget lines.
- Amendment workflow that creates a new budget version and preserves history.
- Budget-vs-actual reporting by grant, period, category, program, and fund.
- Alerts for over budget, under budget, unallowable categories, and upcoming
  reporting-period deadlines.
- Exports for funder reporting.
- Activity log entries for approvals, amendments, and budget line changes.
- Tier-aware UX and marketing rollout.

**Not included:**

- Procurement, purchase orders, or full encumbrance accounting.
- Funder-specific amendment submission portals.
- Replacing general ledger budgets in the accounting system.

---

## 2. Product Positioning

GrantPipe should describe this feature as funder-approved grant budget tracking
and budget-vs-actual controls, tightly connected to restricted fund tracking and
grant compliance.

Marketing copy must avoid fabricated social proof, user counts, testimonials, or
claims that the founder has nonprofit-operator experience. Write from the
builder perspective.

Tiering:

| Capability                        | Starter | Growth | Audit-Ready |
| --------------------------------- | ------- | ------ | ----------- |
| Manual budget setup               | Yes     | Yes    | Yes         |
| Budget-vs-actual visibility       | Yes     | Yes    | Yes         |
| Budget alerts                     | No      | Yes    | Yes         |
| Budget-vs-actual exports          | No      | Yes    | Yes         |
| Planned expenses                  | No      | Yes    | Yes         |
| Reporting-period workflow         | No      | Yes    | Yes         |
| Amendment history                 | No      | No     | Yes         |
| Baseline approval locking         | Yes     | Yes    | Yes         |
| Configurable approval controls    | No      | No     | Yes         |
| Supporting documents              | No      | No     | Yes         |
| Auditor-readable history          | No      | No     | Yes         |
| Advanced variance and audit views | No      | No     | Yes         |

---

## 3. Data Model

All new tables must include `org_id`, timestamps, and soft-delete columns where
the record can be removed from active use. All queries must be scoped by
`org_id`.

### 3.1 `grant_budget_versions`

Represents one version of an approved or draft budget for a grant.

Fields:

- `id`
- `org_id`
- `grant_id`
- `version_number`
- `status`: `draft`, `approved`, `superseded`
- `source`: `manual`, `document_intake`, `amendment`
- `approved_at`
- `approved_by_user_id`
- `superseded_at`
- `superseded_by_version_id`
- `notes`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- One grant can have many versions.
- At most one version per grant can be `approved` and current.
- Draft versions are editable.
- Approved versions are locked from direct edits.
- Superseded versions remain readable.
- Approval must create an activity log entry.

### 3.2 `grant_budget_periods`

Represents reporting periods inside a budget version.

Fields:

- `id`
- `org_id`
- `budget_version_id`
- `label`
- `start_date`
- `end_date`
- `due_date`
- `sort_order`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- Periods belong to one budget version.
- Period date ranges should be non-empty.
- Overlapping periods are allowed only if the user intentionally creates them;
  the API should warn but not block because funder periods can vary.

### 3.3 `grant_budget_lines`

Represents approved funder budget categories and amounts.

Fields:

- `id`
- `org_id`
- `budget_version_id`
- `budget_period_id`
- `category`
- `description`
- `approved_amount_cents`
- `allowable`
- `cost_type`: `direct`, `indirect`
- `program_id`
- `fund_id`
- `accounting_dimension_code`
- `notes`
- `sort_order`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- Amounts are stored as cents.
- Categories are grant-specific text values in MVP, with future support for org
  defaults.
- Unallowable lines can exist so expenses can be flagged against them.
- Line changes on approved budgets must go through amendments.

### 3.4 `grant_budget_line_allocations`

Links actual expenses or accounting lines to one or more budget lines.

Fields:

- `id`
- `org_id`
- `expense_id`
- `journal_line_id`
- `budget_line_id`
- `amount_cents`
- `notes`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- An allocation references either an expense or a journal line.
- Single-line expenses should stay simple by creating one allocation equal to
  the expense amount.
- Split expenses can allocate across multiple budget lines.
- Split allocation totals must equal the source expense or journal line amount.
- Budget line, expense, journal line, grant, and org context must agree.

### 3.5 `planned_expenses`

Represents planned spend that has not yet become an actual expense.

Fields:

- `id`
- `org_id`
- `grant_id`
- `budget_line_id`
- `budget_period_id`
- `description`
- `amount_cents`
- `expected_date`
- `status`: `planned`, `committed`, `cancelled`, `converted`
- `converted_expense_id`
- `notes`
- `created_by_user_id`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- Planned expenses are lightweight planning records, not procurement.
- Converted planned expenses keep the original record for history and link to
  the resulting actual expense.

### 3.6 `grant_budget_amendments`

Captures amendment metadata and links old and new budget versions.

Fields:

- `id`
- `org_id`
- `grant_id`
- `previous_budget_version_id`
- `new_budget_version_id`
- `reason`
- `effective_date`
- `supporting_document_id`
- `requested_by_user_id`
- `approved_by_user_id`
- `approved_at`
- `created_at`
- `updated_at`
- `deleted_at`

Rules:

- Amendments create a new draft version copied from the current approved
  version.
- Approving an amendment supersedes the previous approved version.
- Amendment records remain readable to viewers and auditors with access.
- Amendment approval creates an activity log entry.

---

## 4. Shared Contracts

Add shared constants and validators for:

- Budget version statuses.
- Budget version sources.
- Budget line cost types.
- Planned expense statuses.
- Create and update budget version inputs.
- Create and update budget period inputs.
- Create and update budget line inputs.
- Create and update planned expense inputs.
- Create amendment input.
- Approve budget input.
- Expense budget allocation input.
- Budget-vs-actual query input.
- Budget export query input.

Add shared result types for budget detail, budget line rollups, variance rows,
alerts, and export metadata.

Validation rules:

- Cents fields must be integers and cannot be negative unless a future credit
  adjustment explicitly allows it.
- Date strings must be ISO dates.
- Split allocation totals must be validated server-side even if the client
  pre-validates them.
- Approved budget edits must be rejected outside the amendment workflow.

---

## 5. API Design

Budget routes live under the grants domain so callers keep grant context:
`apps/api/src/domains/grants/budget.routes.ts` and
`apps/api/src/domains/grants/budget.service.ts`.

Routes:

| Method   | Path                                                         | Role               | Description                             |
| -------- | ------------------------------------------------------------ | ------------------ | --------------------------------------- |
| `GET`    | `/grants/:grantId/budget`                                    | viewer             | Read current budget detail with rollups |
| `GET`    | `/grants/:grantId/budget/versions`                           | viewer             | List all versions                       |
| `POST`   | `/grants/:grantId/budget/versions`                           | editor             | Create a draft budget version           |
| `PATCH`  | `/grants/:grantId/budget/versions/:versionId`                | editor             | Update draft metadata                   |
| `POST`   | `/grants/:grantId/budget/versions/:versionId/approve`        | admin              | Approve and lock a version              |
| `GET`    | `/grants/:grantId/budget/versions/:versionId`                | viewer             | Read a specific version                 |
| `POST`   | `/grants/:grantId/budget/versions/:versionId/periods`        | editor             | Create period                           |
| `PATCH`  | `/grants/:grantId/budget/periods/:periodId`                  | editor             | Update draft period                     |
| `POST`   | `/grants/:grantId/budget/versions/:versionId/lines`          | editor             | Create line                             |
| `PATCH`  | `/grants/:grantId/budget/lines/:lineId`                      | editor             | Update draft line                       |
| `DELETE` | `/grants/:grantId/budget/lines/:lineId`                      | admin              | Soft-delete draft line                  |
| `POST`   | `/grants/:grantId/budget/expenses/:expenseId/allocations`    | editor             | Assign or split an expense              |
| `POST`   | `/grants/:grantId/budget/planned-expenses`                   | Growth+ editor     | Create planned expense                  |
| `PATCH`  | `/grants/:grantId/budget/planned-expenses/:plannedExpenseId` | Growth+ editor     | Update planned expense                  |
| `POST`   | `/grants/:grantId/budget/amendments`                         | Audit-Ready editor | Start amendment                         |
| `POST`   | `/grants/:grantId/budget/amendments/:amendmentId/approve`    | Audit-Ready admin  | Approve amendment                       |
| `GET`    | `/grants/:grantId/budget/variance`                           | viewer             | Budget-vs-actual rows                   |
| `GET`    | `/grants/:grantId/budget/alerts`                             | Growth+ viewer     | Budget alert list                       |
| `POST`   | `/grants/:grantId/budget/export`                             | Growth+ viewer     | Generate export                         |

Service responsibilities:

- Enforce org scoping and role checks.
- Enforce tier gates without hiding Starter visibility.
- Reject direct edits to approved versions.
- Copy approved budget versions into amendment drafts.
- Aggregate actual spend from `grant_budget_line_allocations`.
- Aggregate planned spend from `planned_expenses`.
- Calculate remaining budget and variance.
- Create activity log records for approvals, amendments, and line changes.

---

## 6. Reporting And Alerts

Budget-vs-actual rows compare:

- Original approved budget.
- Current approved budget.
- Actual spend.
- Planned spend.
- Remaining budget.
- Variance in cents and percent.

Filters:

- Budget period.
- Category.
- Program.
- Fund.
- Allowable flag.
- Cost type.

Alerts:

- Over budget: actual plus planned exceeds approved amount.
- Underspend: current period spend is materially below expected pace.
- Unallowable category: actual expense assigned to an unallowable line.
- Upcoming period deadline: reporting period due date is near and variance rows
  are unresolved.

Exports:

- Budget-vs-actual CSV.
- Reporting-period export for reimbursement or funder reporting.
- Export metadata should record user, grant, filters, and generated timestamp.

---

## 7. Web UX

### 7.1 Grant Detail Budget Tab

The tab shows:

- Current budget version status and approval metadata.
- Version selector for original, current, superseded, and draft versions.
- Budget-vs-actual table with period, category, program, and fund filters.
- Line editing controls for draft versions.
- Approval action for admins.
- Amendment drawer for Audit-Ready.
- Planned expense list for Growth and Audit-Ready.
- Export action for Growth and Audit-Ready.
- Alerts panel for Growth and Audit-Ready.

### 7.2 Award Setup Budget Step

Award setup includes an optional budget step where users can:

- Create manual budget lines.
- Create budget lines from document intake when an award letter or funder budget
  document has already been uploaded.
- Add periods.
- Mark allowable and unallowable categories.
- Connect lines to funds or programs.
- Save as draft and return later.

### 7.3 Expense Classification

Expense creation and edit flows include:

- Budget line selector when the expense is linked to a grant.
- Split allocation mode for multi-line expenses.
- Remaining amount feedback.
- Warnings for over-budget and unallowable categories.

### 7.4 Amendment Drawer

Audit-Ready users can:

- Enter reason and effective date.
- Attach a supporting document.
- Review copied line values.
- Save amendment as draft.
- Submit for admin approval.

### 7.5 Document Intake Mapping

Budget document intake is a guided import path, not a fully automated promise.
Users can upload or select an award document, review extracted candidate rows,
map each row to category, period, amount, allowable flag, direct or indirect
cost type, optional fund, and optional program, then create draft budget lines.
The system must preserve the source document link and require user confirmation
before imported rows become budget lines.

### 7.6 Upgrade States

Starter users can create manual budgets and see budget-vs-actual visibility.
Growth and Audit-Ready-only controls should show concise upgrade states where
appropriate, but the base budget table should remain available.

---

## 8. Permissions And Audit

Role rules:

- Admin can create, edit draft, approve, amend, lock, export, and delete draft
  budget lines.
- Editor can create and edit drafts, assign expenses, create planned expenses
  when entitled, and start amendments when entitled.
- Viewer can read budgets and budget-vs-actual data.
- Auditor can read approved budgets, amendments, supporting documents, actuals,
  variance views, and exports. Auditor cannot access donor, event, import,
  settings, billing, or team surfaces.

Activity log events:

- Budget version created.
- Budget version approved.
- Budget version superseded.
- Budget line created, changed, or removed.
- Expense allocation changed.
- Planned expense created, changed, cancelled, or converted.
- Amendment created and approved.
- Budget export generated.

---

## 9. Site And SEO

Add or update public site content for:

- Grant budget tracking feature page.
- Pricing capability lists.
- Product proof sections that mention budget-vs-actual controls.
- Related SEO pages that reference grant compliance, restricted funds,
  spend-down, budgeting, reimbursement, and funder reporting.

The public narrative should connect structured grant budgets to restricted fund
tracking and compliance reporting without implying that GrantPipe replaces an
accounting system.

---

## 10. Success Metrics

- Percentage of active grants with an approved structured budget.
- Percentage of grant expenses assigned to a budget line.
- Budget-vs-actual export count.
- Planned expense adoption on Growth and Audit-Ready plans.
- Alerts resolved before reporting deadlines.
- Reduction in manual spreadsheet budget trackers, measured through onboarding
  and customer-research prompts rather than fabricated claims.

---

## 11. Open Questions

- Should org-level default budget categories ship with the MVP or follow after
  grant-specific categories prove sufficient?
- Should admins be able to delegate budget approval to editors through org
  settings?
- How should document intake map line items when funder PDFs contain nested
  categories?
- What variance threshold should trigger underspend alerts by default?
