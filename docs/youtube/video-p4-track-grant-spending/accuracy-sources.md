# P4 — Accuracy Sources (no-lie backbone)

Every factual or product claim the script may make, mapped to its source. App-feature claims cite real source files in this repo (verified by code inspection). Compliance numbers cite CLAUDE.md "Verified Facts." If a sentence in the script can't point to a row here, it doesn't ship.

Conventions: paths are relative to repo root `/Users/angel/Code/grantpipe`. "Grant detail" = `apps/web/src/routes/_authenticated/grants/$grantId.tsx`. "Fund detail" = `apps/web/src/routes/_authenticated/funds/$fundId.tsx`. Summary math = `apps/api/src/domains/grants/summary.ts`.

## A. Product features the video shows (must be true on screen)

| # | Claim (as the script may phrase it) | Source / citation | Notes |
|---|---|---|---|
| A1 | The grant detail page shows four summary cards: **Grant Amount, Allocated, Unallocated, Remaining to Spend**. | Grant detail lines 1007–1062 (4-card grid). | Exact labels. No "Spent" card on the grant page. |
| A2 | **Remaining to Spend = Grant Amount − total expenses recorded against the grant.** | `summary.ts` line 57: `remainingBalanceCents = grantAmountCents - expenseTotalCents`. | Driven by expenses, NOT allocations. |
| A3 | **Unallocated = Grant Amount − Allocated** (sum of fund allocations). | `summary.ts` (unallocated = grantAmount − allocatedTotal); grant detail lines 1034–1047. | Separate from Remaining to Spend. |
| A4 | You record costs on the **Expenses** tab; the **Add expense** dialog has three fields: **Amount (USD), Date, Description**. | Grant detail Expenses tab (`value="expenses"` line 1072); Add-expense dialog lines 1553–1694 (Amount required, Date required, Description optional). | UI form exposes only these three. No category/vendor field in the form. |
| A5 | An expense is tied to the grant (and, in practice, its fund). | `packages/db/src/schema/grants.ts` `expenses` table lines 130–152 (`grant_id`, `fund_id` FKs); POST creates both. | |
| A6 | Recording an expense lowers Remaining to Spend. | A2 + A5 (expenseTotal feeds remaining). | Demonstrable by the running total. |
| A7 | The grant Overview shows a **burn rate** ("Burn rate: $X/mo"). | Grant detail lines 1269–1276 (`summary.burnRateCentsPerMonth`). | Real field on the summary. |
| A8 | There is a **Spend-Down** view that shows pace / burn rate. | Grant detail `value="spend-down"` tab (line 1087); spend-down burn rate line 2239–2240. | Growth+ gated — see C-list. |
| A9 | On the **fund** detail page, the same dollars appear as a **Spent** card; Balance = Allocated − Spent. | Fund detail lines 177–202 (Allocated / Spent / Balance); `summary.ts` lines 82–96 (`currentBalanceCents = allocatedTotalCents - expenseTotalCents`). | Cross-link to P3. |
| A10 | The fund detail has a read-only **Expense Ledger** list. | Fund detail lines 357–370; no "Add expense" button on the fund page. | Expenses are created from the grant page only. |

## B. Seeded demo data (Heartland Senior Services) — what's on screen

| # | Claim | Source / citation | Notes |
|---|---|---|---|
| B1 | Demo org: **Heartland Senior Services** (Growth plan). | `packages/db/src/seed-demo.ts`. | |
| B2 | **Title III-C Nutrition Services Grant**, funder U.S. Dept. of Health & Human Services, **$185,000**, active. | seed-demo.ts grants block. | The demo grant. |
| B3 | Title III-C has **11 seeded expenses** over six months (program supplies + personnel), totaling **$80,460**. | seed-demo.ts expenses block (supplies 9,420+9,610+9,200+9,750+9,380+9,100 = 56,460; personnel 4,800×5 = 24,000; total 80,460). | Confirm the exact on-screen total at capture. |
| B4 | After those expenses, **Remaining to Spend ≈ $104,540** (185,000 − 80,460). | B2 + B3 + A2. | Same number as the fund Balance (B5). Confirm at capture. |
| B5 | The **Title III-C Nutrition Fund** shows **Spent $80,460 / Balance $104,540** (Allocated $185,000). | seed-demo.ts allocation (Title III-C → fund $185,000) + A9. | Matches P3's demo figures. |

## C. Honesty / do-not-claim guardrails (things that are NOT true — keep them out)

| # | Guardrail (must NOT be claimed) | Source / citation |
|---|---|---|
| C1 | **Budget-vs-actual is NOT demoable** — no budget versions/lines/line-allocations are seeded for the demo org; the Budget tab renders empty. Do not show it or claim category-level variance. | seed-demo.ts contains 0 references to `grantBudgetVersions` / `grantBudgetLines` / `grantBudgetPeriods` / budget-line allocations (grep count 0). Budget tab UI: grant detail lines 632–732. |
| C2 | Adding an expense does **not** post a journal entry or sync to QuickBooks/any GL. | Add-expense path (routes.ts lines 505–520) writes the `expenses` row only; no GL posting. Auto-post journal entries exist only for grant payments *received* (`packages/db/src/schema/payments.ts` line 51), not expenses. |
| C3 | No **bank-feed import / transaction matching** to grants. | No such UI/route in the grants domain; bank transactions are a separate accounting concept with no grant-tagging feature. |
| C4 | `expenses.category` is **free text**, not 2 CFR / Uniform Guidance cost categories; the Add-expense form doesn't expose category at all. | schema/grants.ts `expenses.category` is plain `text`, no enum; Add-expense dialog (A4) shows only Amount/Date/Description. |
| C5 | No **receipt/document attachment on an individual expense row**. | `expenses` table has no `document_id` FK; documents attach at grant/fund level (`EntityDocumentsSection`). |
| C6 | There is **no "Spent" card on the grant page** (it's "Remaining to Spend"); "Spent" is the **fund** page. | A1, A9. |
| C7 | No one-click "grant spending report" export for plain expenses. Spend-Down report is a distinct Growth+ feature. | `useGenerateSpendDownReport` (grant detail line 52) is the spend-down compliance report, not a generic expense export. |
| C8 | **Spend-Down is plan-gated (Growth+).** Demo org is Growth so it renders; do not present as universal. | Plan gating on the spend-down feature; demo org plan = Growth (B1). |
| C9 | Only **Editors/Admins** can record/delete expenses; Viewers/Auditors are read-only. | POST `/:grantId/expenses` requires `grants:edit` + `funds:edit` (routes.ts 505–520); DELETE requires `*:manage` (540–554); roles table in CLAUDE.md. |

## D. Compliance numbers (only if the script introduces them — default: don't)

| # | Fact | Value | Citation |
|---|---|---|---|
| D1 | Single audit threshold | **$1,000,000** federal awards expended | CLAUDE.md Verified Facts; 2 CFR 200.501 (FY ending on/after Sept 30, 2025). |
| D2 | De minimis indirect cost rate | **15% of MTDC** | CLAUDE.md; 2 CFR 200.414(f) (awards on/after Oct 1, 2024). |
| D3 | MTDC subaward exclusion cap | **$50,000** per subaward | CLAUDE.md; 2 CFR 200.1. |
| D4 | Equipment capitalization threshold | **$10,000** per unit | CLAUDE.md; 2 CFR 200.1. |
| D5 | FFATA subaward reporting / SAM debarment | **remain $25,000** | CLAUDE.md (unchanged by 2024 revision). |

_Default for P4: introduce no federal thresholds. The video is about per-grant spend-down mechanics, not Uniform Guidance limits. If any number appears, it must match the row above verbatim in value._

## E. Founder / brand framing

| # | Guardrail | Source |
|---|---|---|
| E1 | Angel is a **builder**, not a former grants officer/CPA/auditor. No fabricated sector experience. | CLAUDE.md Founder Context. |
| E2 | No fabricated testimonials, user counts, or social proof. | CLAUDE.md. |
| E3 | CTA is a **soft, email-gated** lead magnet ("we'll send it to your inbox"). | CLAUDE.md marketing rules; P2/P3 precedent. |
