# Grant Operating System PRDs

These PRDs translate the eight largest product gaps into buildable product
surfaces for making GrantPipe the compliance-first grant management system.

The strategic thesis is simple: restricted funds are why nonprofits come to
GrantPipe; connected grant management depth is why they stay. Instrumentl is
moving toward an operating system for grant teams. GrantPipe should become the
compliance-first grant management system by owning the full path from award
terms to restricted fund accounting, program execution, reimbursement, audit
evidence, and reporting.

## PRDs

1. [Program Allocation](./01-program-allocation-prd.md)
2. [Grant Budget Model](./02-grant-budget-model-prd.md)
3. [Restriction Lifecycle](./03-restriction-lifecycle-prd.md)
4. [Drawdowns, Reimbursements, and Payments](./04-drawdowns-reimbursements-payments-prd.md)
5. [Subrecipient Monitoring](./05-subrecipient-monitoring-prd.md)
6. [Auditor and Funder Portal](./06-auditor-funder-portal-prd.md)
7. [AI Award Document Intake](./07-ai-award-document-intake-prd.md)
8. [Accounting Integrations](./08-accounting-integrations-prd.md)
9. [Data Migration and Onboarding Studio](./17-data-migration-onboarding-studio-prd.md)
10. [Board Packet Composer](./18-board-packet-composer-prd.md)
11. [Board Member Portal](./19-board-member-portal-prd.md)
12. [Outbound Donor Email / Mail-Merge](./20-outbound-donor-email-mail-merge-prd.md)
13. [Acknowledgment and Year-End Statement Run](./21-acknowledgment-year-end-statement-run-prd.md)
14. [Configurable Dashboard and Role Home](./22-configurable-dashboard-role-home-prd.md)

## Parallelization Plan

The PRDs can be worked in parallel, but not as eight totally independent
projects. The main risk is letting each workstream invent its own version of
shared concepts like budget category, eligible expense, evidence, external
reviewer, restriction, or program.

Recommended waves:

1. Wave 1: Program Allocation, Grant Budget Model, and Restriction Lifecycle.
   These are the foundation primitives. They should be designed together
   because programs, budgets, expenses, restrictions, releases, and allocations
   will share data model and reporting decisions.
2. Wave 2: Drawdowns/Reimbursements/Payments, AI Award Document Intake, and
   Auditor/Funder Portal. These can move in parallel once the foundation
   concepts are stable enough. Payments depends on budget lines and eligible
   expenses. AI intake should write into the budget, restriction, contact, and
   reporting schemas. The portal can start with existing documents, grants,
   funds, reports, accounting, and compliance records.
3. Wave 3: Subrecipient Monitoring and Accounting Integrations. Subrecipient
   Monitoring is fairly parallel because it mostly extends grants, contacts,
   documents, compliance tasks, and evidence. Accounting Integrations can be
   built in parallel technically, but should follow the foundation model so
   imports map cleanly to grants, funds, programs, budget lines, and
   restrictions.

If speed matters, run four workstreams at once:

- Core data model: programs, budgets, restrictions.
- Cash workflow: reimbursements, drawdowns, payments, eligible expenses.
- Trust surface: portal access, evidence bundles, scoped review.
- Intake pipeline: AI extraction, human review, record creation.

Guardrail: shared primitives must be named and owned early. Budget categories,
eligible expenses, evidence bundles, restriction terms, external reviewers,
programs, and accounting dimensions should be reusable platform concepts, not
feature-local one-offs.

## Research Signals

- Instrumentl now uses grant operating system language and has Spenddown,
  budget-vs-actual, planned expenses, payments, alerts, and award intake
  surfaces: https://www.instrumentl.com/blog/spring-launch-instrumentl-spenddown-and-your-new-grant-operating-system
- Instrumentl Spenddown supports budget planning, expense tracking, over/under
  budget alerts, and payment tracking:
  https://help.instrumentl.com/en/articles/9114092-budget-spenddown-tracking
- Sage Intacct positions grant tracking, billing, indirect costs, budget
  comparison, and reimbursement workflows as core nonprofit finance needs:
  https://www.sage.com/en-us/sage-business-cloud/intacct/product-capabilities/extended-capabilities/grants-tracking-billing/
- Blackbaud Financial Edge NXT emphasizes grant and program accounting,
  budget controls, reimbursements, reporting, and fund restrictions:
  https://www.blackbaud.com/products/blackbaud-financial-edge-nxt/grant-and-program-accounting
- AwardTrace is using compliance automation, Notice of Award extraction,
  SF-425 support, and subrecipient monitoring as a wedge:
  https://www.awardtrace.com/
- OJP frames grant administration across pre-award, post-award, monitoring,
  reporting, subrecipient management, record retention, and closeout under 2
  CFR Part 200: https://www.ojp.gov/funding/part200uniformrequirements
- The National Council of Nonprofits highlights recurring pain in government
  grant and contract reporting, payment delays, and compliance burden:
  https://www.councilofnonprofits.org/trends-and-policy-issues/state-policy-tax-law/common-problems-government-nonprofit-grants-and
- Federal Single Audit requirements apply when an organization expends enough
  federal funds in its fiscal year, making audit-ready evidence and restricted
  fund rollforwards more than nice-to-have:
  https://www.councilofnonprofits.org/running-nonprofit/nonprofit-audit-guidec/federal-law-audit-requirements

## Current GrantPipe Baseline

GrantPipe already has important primitives that make this roadmap plausible:
donors, funders, grants, funds, grant-to-fund allocations, expenses, documents,
reporting requirements, closeout items, impact metrics, notifications, custom
fields, activity logs, auditor role permissions, and a real accounting module
with chart of accounts, journal entries, journal lines, fiscal periods, trial
balance, general ledger, financial statements, functional expenses, year-end
close, bank import, matching, and reconciliation.

The gap is not "build a nonprofit app from zero." The gap is turning those
primitives into an opinionated operating layer that answers the questions
grant-funded teams actually live inside:

- What is restricted, why, and when can it be released?
- Which programs own the money, work, and outcomes?
- What did the funder approve, what changed, and what is still allowable?
- What can we draw or invoice today?
- What evidence proves compliance?
- What can finance, program staff, leadership, auditors, and funders each see
  without making another spreadsheet?
