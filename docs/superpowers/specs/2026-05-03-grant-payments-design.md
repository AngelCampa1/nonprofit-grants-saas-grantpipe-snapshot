# Grant Payments Design Spec

> Status: Draft → In implementation
> Authored: 2026-05-03
> Source PRD: `docs/grant-operating-system/04-drawdowns-reimbursements-payments-prd.md`
> Plan: `~/.claude/plans/take-this-prd-use-vast-garden.md` (executable)
> Related specs: `2026-05-02-restriction-lifecycle-design.md`, `2026-05-02-grant-budget-model-design.md`, `2026-05-02-program-allocation-design.md`

## Strategic thesis

Grant-funded nonprofits care deeply about cash timing. Tracking spend without tracking cash leaves a gap large enough to keep finance staff in spreadsheets and ASAP/HHS PMS portals. GrantPipe must answer: what can be drawn, what was submitted, what was approved, what was paid, what is outstanding — per grant and across the org.

This is the fourth pillar of the grant operating system after restriction lifecycle, grant budget model, and program allocation. It is the first feature that closes the loop between expenses and the GL on the cash-in side.

## Goals (from PRD)

- Identify reimbursable or drawable expenses.
- Create drawdown, reimbursement, invoice, or payment-request records.
- Track submitted, approved, rejected, paid, and outstanding amounts.
- Connect requests to expenses, budget lines, restrictions, and accounting entries.
- Show cash lag and reimbursement risk by grant.

## Non-goals (V1)

- Direct submission to every funder portal.
- Replacing accounting-system invoicing modules.
- Automating complex indirect-cost negotiation.
- Two-way accounting sync (one-way GL post is in scope).

## Glossary

| Term                | Meaning                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawdown            | Request from a federal payment system (ASAP, HHS PMS) for cash against an active award. Modeled as `type = 'drawdown'`.                                       |
| Reimbursement       | Request to a non-federal funder (foundation, state agency) for cash against incurred expenses. `type = 'reimbursement'`.                                      |
| Invoice             | Funder-payable invoice; modeled identically to a reimbursement, distinguished only by funder workflow. `type = 'invoice'`.                                    |
| Advance liquidation | Reconciliation of a previously received advance against actual expenses. `type = 'advance_liquidation'`.                                                      |
| Eligible expense    | An expense whose `reimbursable = true`, falls within the request period, belongs to the grant, and is not currently claimed in any non-rejected request line. |
| Indirect cost rule  | A per-grant or org-default rule defining a base, rate (basis points), and effective window. Audit-Ready+.                                                     |
| Evidence packet     | A bundled in-app print page + PDF showing request, lines, linked documents, payments, and activity history. Audit-Ready+.                                     |

## Personas

- **Finance director** — manages grant cash flow, reconciles to GL.
- **Grant accountant** — preps reimbursement requests, exports packets.
- **Grant manager** — monitors funder payments, chases approvals.
- **Executive director** — watches receivables and cash risk.
- **Auditor** — read-only access to requests, evidence, and accounting links.

## Tier entitlements

| Capability                                            | Starter | Growth | Audit-Ready | Enterprise |
| ----------------------------------------------------- | ------- | ------ | ----------- | ---------- |
| `hasPaymentRequests` (lifecycle, dashboard, payments) | —       | ✓      | ✓           | ✓          |
| `hasIndirectCostRules`                                | —       | —      | ✓           | ✓          |
| `hasPaymentEvidencePackage`                           | —       | —      | ✓           | ✓          |

Starter sees an upsell card in place of the grant-detail Payments tab and the top-level Cash workspace.

## Permissions (FeatureArea: `payments`)

| Role    | Default level |
| ------- | ------------- |
| admin   | manage        |
| editor  | edit          |
| viewer  | view          |
| auditor | view          |

Auditor read access matches CLAUDE.md role table — auditor has read on grants, funds, documents, compliance, accounting, reports, and now payments.

## Data model

```
grant_payment_requests
  id, org_id, grant_id, request_number (per-org sequential),
  type, status, period_start, period_end,
  submitted_at, approved_at, rejected_at, closed_at,
  requested_amount_cents, approved_amount_cents,
  funder_reference, notes, auto_post_journal_entry (bool),
  created_by, created_at, updated_at, deleted_at

grant_payment_request_lines
  id, org_id, request_id, expense_id?, budget_line_id?,
  category, description, amount_cents,
  approved_amount_cents, rejection_reason,
  sort_order, created_at, deleted_at

grant_payment_request_adjustments
  id, org_id, request_id, kind, amount_cents?, reason,
  created_by, created_at, deleted_at

grant_payments
  id, org_id, request_id, grant_id, received_date,
  amount_cents, reference_number, method,
  journal_entry_id?, bank_transaction_id?, notes,
  created_at, deleted_at

grant_indirect_cost_rules           -- Audit-Ready+
  id, org_id, grant_id?, base, rate_basis_points,
  effective_from, effective_to, created_at, deleted_at
```

Money: `bigint` cents. Indexes: `(org_id, grant_id, status)` on requests; `(org_id, request_id)` on lines/adjustments; `(org_id, grant_id, received_date)` on payments; unique `(org_id, request_number)` on requests; partial unique on `request_lines (expense_id) WHERE deleted_at IS NULL` to prevent the same expense being claimed twice in active requests.

Status state machine: `draft → submitted → (partially_approved | approved | rejected) → paid → closed`. Lines mutable only while parent is `draft`. Admin override path on the dedup constraint logs an `adjustment` row.

## API surface (Hono RPC, mounted at `/payments`)

```
GET    /payments                                     list requests (org)
GET    /payments/outstanding-summary                 dashboard tile data
POST   /payments                                     create draft (grant, type, period)
GET    /payments/:id                                 detail w/ totals
PATCH  /payments/:id                                 update meta (draft only)
DELETE /payments/:id                                 soft delete
POST   /payments/:id/transitions                     status change
POST   /payments/:id/lines                           add line
PATCH  /payments/:id/lines/:lineId                   update line
DELETE /payments/:id/lines/:lineId                   remove line
GET    /payments/:id/eligible-expenses              eligible-expense lookup
POST   /payments/:id/adjustments                     adjustment / override
POST   /payments/:id/payments                        record payment
DELETE /payments/:id/payments/:paymentId             remove payment
POST   /payments/:id/indirect/recompute             (audit-ready+)
GET    /payments/:id/packet                         evidence manifest
POST   /payments/:id/packet/export                  (audit-ready+) PDF generation
GET    /payments/grants/:grantId/summary             per-grant outstanding
GET    /payments/indirect-rules                     (audit-ready+)
POST   /payments/indirect-rules
PATCH  /payments/indirect-rules/:id
DELETE /payments/indirect-rules/:id
```

Tier gates: all `/payments/*` require `growth+`. Indirect rules + packet export require `audit_ready+`.

## UX surfaces

- Grant detail tab "Payments" between Reporting and Closeout.
- Top-level Cash workspace at `/payments`.
- Request detail at `/payments/:id` with status stepper, lines, adjustments, payments, evidence button, embedded activity + documents.
- Create-request wizard: meta → eligible-expense picker → optional indirect (Audit-Ready) → review.
- Dashboard "Outstanding reimbursements" tile.
- Evidence packet print-ready page at `/payments/:id/packet` + PDF download (Audit-Ready+).
- Bank-transaction matching: suggest unmatched deposits to outstanding payments.

## Activity & audit

Each of these writes to `activity_log` with the existing `recordActivityLog` helper:

- Request: created, updated, transitioned, deleted.
- Line: added, updated, removed.
- Adjustment: created.
- Payment: recorded, removed, journal posted.
- Indirect rule: created, updated, removed.

`changes` JSON captures the diff. `entityType` uses new `ACTIVITY_ENTITY_TYPES`: `payment_request`, `payment_request_line`, `payment`. (Adjustments and indirect rules log under `payment_request`.)

## Accounting integration

Auto-post default ON for Audit-Ready, opt-in (`auto_post_journal_entry` flag per request) for Growth.

`postGrantPayment(payment)` adds to `apps/api/src/domains/accounting/postingEngine.ts`:

- On `paid` status: debit cash GL (per bank account or default cash account); credit grant revenue (`type = revenue`, `subtype = grant`, restriction lookup from grant). Reversal on payment delete.
- On `submitted` (only when org adopts AR): debit AR; credit grant revenue. On `paid`: clear AR, debit cash. (Growth orgs default to cash-basis posting; AR mode is org-level setting added to org settings later.)
- Source enum extended with `"grant_payment"`.

## Marketing & SEO strategy

- New feature page `/features/grant-drawdowns-reimbursements/` is canonical (BoFu, SoftwareApplication schema).
- Pricing page reflects new Growth and Audit-Ready bullets.
- Glossary `drawdown.md` cross-links to feature page.
- Mass-edit pass over the ~1,170 content files via `apps/site/scripts/inject-payments-mention.ts`. Coherence rules in the script gate which entries get a paragraph vs. only a `relatedPages` link. Donor-only-tagged entries are skipped.
- Hand-edited highest-impact pages get a custom paragraph and FAQ entry.
- `llms.txt` and `llms-full.txt` regenerate with the new feature.

## Risks

- **Vocabulary divergence across funders** — drawdown vs. reimbursement vs. invoice. Mitigation: `type` enum covers both, UI labels switch on type.
- **Eligibility complexity** — mitigation: V1 surfaces clear warnings rather than auto-rejecting; admin override path always present.
- **Accounting sync idempotency** — mitigation: `journal_entry_id` is set-on-post and FK-tracked; reversal logic in posting engine.
- **SEO content drift from mass edit** — mitigation: script is idempotent, JSON manifest committed for review, anti-cannibalization tests must continue to pass, commits chunked per collection.
- **PDF rendering at audit-ready scale** — mitigation: reuse existing Compliance Report Pack pipeline that already produces PDFs to R2.

## Open questions (resolved)

1. Tier placement: **Growth + Audit-Ready** (resolved 2026-05-03).
2. SEO sweep depth: **mass edit every content file** (resolved 2026-05-03).
3. Evidence packet format: **both in-app page + PDF in V1** (resolved 2026-05-03).
4. Auto-post behavior: **Audit-Ready ON, Growth opt-in** (resolved 2026-05-03).

## Launch slice

Per PRD: ship request creation, eligible expense selection, status lifecycle, payment recording, outstanding dashboard, indirect cost rules, evidence packet (page + PDF), accounting auto-post, marketing + SEO. Single release.
