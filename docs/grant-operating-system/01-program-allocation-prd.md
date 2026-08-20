# PRD: Program Allocation

## Status

Draft

## Strategic Thesis

Program allocation is the biggest missing primitive in the operating-system
vision. Grants fund programs, programs produce outcomes, and finance teams need
to show how money moved through both. GrantPipe should make programs first-class
objects with budgets, allocations, expenses, outcome ownership, and
budget-vs-actual visibility.

## Problem

GrantPipe currently has grants, funds, expenses, impact metrics, and functional
expense classes. Program support is not yet a real product primitive. Without
programs, users can track restricted funds but cannot easily answer:

- Which programs are funded by this grant?
- Which grants and funds support this program?
- How much of a shared expense belongs to each program?
- Is the program on budget across all funding sources?
- Which program owns each outcome or reporting metric?

That leaves users falling back to spreadsheets for program budgets, allocation
schedules, outcome tracking, and board-ready program reporting.

## Target Users

- Finance directors who need program budget-vs-actual views.
- Grant managers who need to map awards to funded activities.
- Program directors who own execution and outcomes.
- Executive directors who need cross-program visibility.
- Auditors and funders who need evidence that restricted funds supported the
  intended program work.

## Current GrantPipe Baseline

GrantPipe already has grants, funds, grant-fund allocations, expenses, journal
lines, functional expense reporting, impact metrics, reporting requirements,
documents, and an activity log. Those are strong ingredients, but there is no
first-class program entity with allocation rules, program budgets, or program
ownership.

## Market Signal

Sage Intacct and Blackbaud both emphasize program and grant accounting because
nonprofit finance teams need to report by fund, grant, and program. Instrumentl
is strong on grant-team workflow, but GrantPipe can differentiate by connecting
restricted funds to program operations and accounting truth.

## Goals

- Create a first-class program object.
- Connect grants, funds, expenses, journal lines, reporting requirements, and
  impact metrics to programs.
- Support program budgets by fiscal period.
- Support grant-to-program allocations and expense-to-program allocations.
- Provide program budget-vs-actual reporting across grants and funds.
- Make program ownership visible across finance, grant, and compliance views.

## Non-Goals

- Replacing full ERP project accounting in the first release.
- Building advanced cost allocation engines for every indirect cost scenario.
- Creating a standalone program management tool for casework or service
  delivery.

## MVP Scope

- Program list, detail, create, edit, archive.
- Program fields: name, code, description, owner, status, start date, end date,
  department, default functional expense class.
- Program budget lines by fiscal year or budget period.
- Grant-to-program allocation records with amount, percentage, purpose, and
  effective date range.
- Expense allocation to one or more programs.
- Impact metric ownership by program.
- Program dashboard showing total budget, actual expenses, encumbered or
  planned expenses when available, remaining budget, funding mix, and upcoming
  reporting requirements.

## Functional Requirements

- Users can create and manage programs per organization.
- Users can allocate a grant to one or more programs.
- Users can allocate an expense to one or more programs by amount or percent.
- Users can see when program allocations exceed available grant or fund
  balances.
- Users can view program budget-vs-actual by period, grant, fund, and expense
  category.
- Users can link outcome metrics to a program and optionally to a grant.
- Users can export a program budget-vs-actual report.
- All program allocation changes create activity log entries.

## Data Model Implications

- `programs`
- `program_budgets`
- `program_budget_lines`
- `grant_program_allocations`
- `expense_program_allocations`
- Optional `program_impact_metric_links` if impact metrics cannot directly
  reference programs.

All tables need `org_id`, soft delete where appropriate, timestamps, and audit
coverage. Money should remain in cents.

## UX Surfaces

- Programs in the main navigation.
- Program picker on grants, expenses, impact metrics, and reporting
  requirements.
- Program tab on grant detail.
- Funding tab on program detail.
- Budget-vs-actual table with period filters.
- Allocation drawer for splitting a grant or expense across programs.

## Permissions And Audit

- Admin and editor can create and edit programs and allocations.
- Viewer can read program data.
- Auditor can read scoped program allocation, expense, document, compliance,
  and accounting evidence when the portal PRD is implemented.
- Every allocation mutation should include before and after values in the
  activity log.

## Success Metrics

- Percentage of active grants linked to at least one program.
- Percentage of expenses assigned to programs.
- Number of exported program budget-vs-actual reports.
- Reduction in customer-reported spreadsheet work for program budgets.
- Expansion conversations where program reporting is a cited reason to stay.

## Risks And Open Questions

- Some nonprofits use programs, departments, projects, and cost centers
  differently. The model needs enough flexibility without becoming generic mush.
- Expense allocation needs to avoid double counting across functional expense,
  fund, grant, and program dimensions.
- Program budgets may need versioning, but that may belong in a later release.

## Launch Slice

Ship programs, grant-to-program allocations, expense-to-program allocations,
and a program budget-vs-actual report first. Add outcome ownership and richer
allocation rules second.
