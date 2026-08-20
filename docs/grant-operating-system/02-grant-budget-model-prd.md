# PRD: Grant Budget Model

## Status

Draft

## Strategic Thesis

Restricted fund tracking gets users in the door, but funder-approved budget
control is what makes GrantPipe operationally sticky. A grant operating system
needs to know what the funder approved, which budget period applies, what has
been spent, what is planned, what is allowable, and what changed through
amendments.

## Problem

GrantPipe currently supports grant amounts, grant-to-fund allocations,
expenses, reporting requirements, closeout items, impact metrics, and spenddown
views. The market expects a deeper grant budget model:

- Approved budget lines and categories.
- Budget periods.
- Planned expenses.
- Allowable and unallowable cost categories.
- Amendments and budget revisions.
- Budget-vs-actual by reporting period.
- Alerts when spending is under budget, over budget, late, or miscategorized.

Without this model, users can see total spenddown but still need spreadsheets
to manage the official funder-approved budget.

## Target Users

- Grant managers who own award compliance.
- Finance directors who need budget controls and reimbursement support.
- Program directors who need spend visibility.
- Executive directors who need risk visibility before reports are due.

## Current GrantPipe Baseline

GrantPipe has grant amount, status, periods, funds, allocations, expenses,
reporting requirements, and accounting dimensions. It does not yet model the
approved budget as structured budget lines with versions, categories, periods,
and amendment history.

## Market Signal

Instrumentl Spenddown includes budget planning, expenses, over/under budget
alerts, and payment tracking. Sage Intacct and Blackbaud emphasize budget
comparison, grant billing, indirect costs, and funder reporting. This confirms
that a budget model is table stakes for post-award grant operations.

## Goals

- Represent the funder-approved grant budget as structured data.
- Support budget periods and reporting-period views.
- Track actual and planned expenses against approved categories.
- Support amendment history and revised approved budgets.
- Enable alerts for overages, underspending, unallowable categories, and
  upcoming period deadlines.
- Feed reimbursement, reporting, restriction, and program allocation workflows.

## Non-Goals

- Building a full procurement or encumbrance system in the first release.
- Automating funder-specific amendment submission portals.
- Replacing accounting general ledger budgets.

## MVP Scope

- Grant budget versions with status: draft, approved, superseded.
- Budget periods with start date, end date, and reporting period label.
- Budget lines with category, description, approved amount, allowable flag,
  indirect/direct classification, optional program, optional fund, and optional
  notes.
- Planned expense records linked to budget lines.
- Actual expense rollup by budget line.
- Budget-vs-actual report by grant, budget period, program, and category.
- Amendment workflow that creates a new budget version while preserving the
  original approval history.

## Functional Requirements

- Users can create budget lines manually or from document intake.
- Users can assign expenses to budget lines.
- Users can split one expense across multiple budget lines.
- Users can compare original budget, current approved budget, actual spend,
  planned spend, remaining budget, and variance.
- Users can create budget amendments with reason, effective date, and
  supporting document.
- Users can lock an approved budget version from direct edits.
- Users can receive warnings when an expense exceeds a line budget or uses an
  unallowable category.
- Users can export budget-vs-actual views for a reporting period.

## Data Model Implications

- `grant_budget_versions`
- `grant_budget_periods`
- `grant_budget_lines`
- `grant_budget_line_allocations`
- `planned_expenses`
- `grant_budget_amendments`

Existing expenses and journal lines should reference budget lines where
possible. Amendment records should preserve prior values rather than mutating
history invisibly.

## UX Surfaces

- Budget tab on grant detail.
- Budget import or create flow during award setup.
- Budget-vs-actual table with period, category, program, and fund filters.
- Amendment modal or drawer.
- Expense classification field for budget line.
- Alerts panel on grant dashboard.

## Permissions And Audit

- Admin and editor can draft budgets and amendments.
- Approved budget locking may require admin permission depending on org
  settings.
- Viewer can read budgets.
- Auditor can read approved budgets, amendments, support documents, and actuals.
- Every budget approval, amendment, and line change must create activity log
  entries.

## Success Metrics

- Percentage of active grants with an approved structured budget.
- Percentage of grant expenses assigned to a budget line.
- Number of budget-vs-actual exports.
- Reduction in manual spreadsheet budget trackers.
- Number of alerts resolved before reporting deadlines.

## Risks And Open Questions

- Budget categories vary by funder. The MVP should support custom categories
  per grant while allowing reusable org defaults.
- Planned expenses could become procurement if allowed to sprawl.
- Budget versioning must be simple enough for small teams but strong enough for
  audit review.

## Launch Slice

Start with approved budget lines, expense assignment, and budget-vs-actual by
period. Add amendment workflow and planned expenses after the core model is
trusted.
