# PRD: Restriction Lifecycle

## Status

Draft

## Strategic Thesis

Restricted funds are the wedge. The operating-system version of GrantPipe must
own the entire restriction lifecycle: what is restricted, why it is restricted,
how much was added, what was released, what evidence supports release, and what
the ending restricted balance is.

## Problem

GrantPipe already has funds and restriction-related accounting dimensions, but
the system does not yet model restriction terms as a lifecycle. A nonprofit
needs more than a restricted fund label. It needs to answer:

- What is the purpose or time restriction?
- What document created the restriction?
- What beginning restricted balance carried into this period?
- What additions increased the restricted balance?
- What expenses or events released the restriction?
- What is the ending balance?
- What evidence would satisfy the board, funder, or auditor?

Without this, the user still needs a restricted net asset rollforward
spreadsheet.

## Target Users

- Finance directors responsible for restricted net assets.
- Grant managers responsible for award terms.
- Executive directors and boards reviewing restricted balances.
- Auditors reviewing support for releases.

## Current GrantPipe Baseline

GrantPipe has funds, grants, donations, grant-fund allocations, accounting
journal lines, documents, activity log, and reporting. It also has accounting
restriction classifications. The missing layer is the explicit lifecycle of
restriction terms, releases, evidence, and rollforward reporting.

## Market Signal

Blackbaud and Sage emphasize restricted fund accounting because it is central
to nonprofit finance. GrantPipe can compete by making restriction management
more usable than an ERP and more finance-native than grant discovery tools.

## Goals

- Represent restriction terms as structured records.
- Track purpose and time restrictions.
- Track beginning balance, additions, releases, and ending balance.
- Link releases to expenses, journal entries, reporting milestones, and
  supporting evidence.
- Produce board-ready and audit-ready restricted fund rollforwards.
- Make restricted balance risk visible inside grants and funds.

## Non-Goals

- Providing accounting or legal advice about FASB rules.
- Replacing external CPA judgment.
- Rebuilding every possible net asset reporting format in the first release.

## MVP Scope

- Restriction records linked to funds, grants, donations, documents, and
  accounting lines.
- Restriction type: purpose, time, purpose and time, board-designated,
  unrestricted.
- Restriction terms: source, start date, end date, purpose statement, release
  rule, allowed programs, allowed categories, evidence requirements.
- Release records with amount, date, reason, linked expenses or journal lines,
  and supporting documents.
- Restricted rollforward report by fund, grant, donor, program, and fiscal
  period.
- Exception alerts for negative restricted balance, missing evidence, expired
  time restriction with unreleased balance, and release without support.

## Functional Requirements

- Users can create restriction terms from a fund, donation, grant, or document
  intake review.
- Users can record additions to a restriction.
- Users can release restricted amounts manually or from eligible expenses.
- Users can attach evidence to a release.
- Users can view beginning balance, additions, releases, and ending balance for
  a selected period.
- Users can export a restricted fund rollforward.
- Users receive warnings when an expense or release conflicts with terms.
- The system stores an auditable history of restriction changes and releases.

## Data Model Implications

- `restriction_terms`
- `restriction_balances`
- `restriction_additions`
- `restriction_releases`
- `restriction_evidence_links`
- Optional `restriction_allowed_programs`
- Optional `restriction_allowed_categories`

The model should reuse existing funds, grants, donations, documents, journal
entries, journal lines, and activity log wherever possible.

## UX Surfaces

- Restrictions tab on fund detail.
- Restrictions tab or panel on grant detail.
- Restricted balance card on dashboard.
- Release workflow from expense, journal line, or fund detail.
- Rollforward report under reports.
- Evidence checklist for release support.

## Permissions And Audit

- Admin and editor can manage restriction terms and releases.
- Viewer can read restrictions and rollforwards.
- Auditor can read restriction terms, evidence, releases, and rollforwards.
- Every term change, addition, release, and evidence attachment should be
  logged.

## Success Metrics

- Percentage of restricted funds with structured restriction terms.
- Percentage of releases linked to evidence.
- Number of rollforward exports.
- Reduction in manual restricted balance spreadsheets.
- Audit requests resolved through GrantPipe evidence links.

## Risks And Open Questions

- Carryforward beginning balances may require import tooling.
- Some organizations will have messy historical restrictions. The MVP needs a
  pragmatic setup path.
- Release rules can become complex. Start with clear manual control plus
  warnings.

## Launch Slice

Build restriction terms, manual additions, manual releases with evidence, and a
rollforward report. Add automated release suggestions from eligible expenses
after budget and program allocation models are in place.
