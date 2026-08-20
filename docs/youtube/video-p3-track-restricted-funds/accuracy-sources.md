# P3 — Accuracy Sources (no-lie backbone)

Every factual claim the narration can make → its citation. Two kinds of claim here: **concept claims** (FASB ASC 958 restricted-fund accounting) and **product claims** (what the real GrantPipe app actually does). A product claim is only allowed if it matches verified app behavior in the table below. If a sentence in `script-final.md` is not supported here, cut or soften it. Re-run the no-lie pass against this file before locking the script, and again after the real-app capture (the demo narration must match the captured screens).

## Concept claims (FASB ASC 958)

| # | Claim (as it may appear in narration) | Citation / source | Notes |
| --- | --- | --- | --- |
| C1 | A donor/grantor restriction limits money to a specific purpose or time; that limit is external and only the donor can lift it. | FASB ASC 958; ASU 2016-14. | Restriction = externally imposed, not internal. |
| C2 | Current U.S. nonprofit reporting uses **two** net-asset classes: "net assets with donor restrictions" and "net assets without donor restrictions." | FASB ASU 2016-14 (Topic 958). | Two is current. THE credibility fact. |
| C3 | The prior model used three classes (unrestricted, temporarily restricted, permanently restricted); that's history, effective change for fiscal years beginning after **December 15, 2017**. | FASB ASU 2016-14 effective date; pre-2016 SFAS 117. | Mention only as history. |
| C4 | Board-designated funds are NOT donor-restricted — the board can reverse its own designation, so they sit in "without donor restrictions." | FASB ASC 958; AICPA NFP guidance. | Common confusion; keep accurate if mentioned. |
| C5 | When a restriction is satisfied (purpose met or time elapsed), the amount is reclassified from "with donor restrictions" to "without donor restrictions" — shown as "net assets released from restrictions." A release is a reclassification, **not** new revenue. | FASB ASC 958-225 / ASU 2016-14 presentation. | The mechanic the demo's "release" mirrors. |
| C6 | Tracking a restriction well means maintaining a per-award running balance: beginning balance, additions, releases, ending balance. | Standard fund-accounting / grant-compliance practice; mirrors required net-asset roll-forward disclosure logic. | This is teaching convention applied to one award, not a verbatim standard quote. |
| C7 | A standard activity/class report shows what money moved; it does not, by itself, show how much of a specific restricted award remains. | General GAAP/NFP reporting; FASB ASC 958 disclosure rationale. | The hook. Conceptual, safe. |
| C8 | Funders and auditors expect a nonprofit to demonstrate restricted money was spent on its restricted purpose. | General grant-compliance expectations (2 CFR 200); standard auditor practice. | Do not attach a specific threshold number. |
| C9 | Governments use a separate framework (GASB) for fund accounting; this video is about nonprofit FASB ASC 958. | GASB standards. | One honest "different world" line max. |

## Product claims (verified GrantPipe app behavior)

| # | Claim (as it may appear in narration) | Verified against | Notes / guardrail |
| --- | --- | --- | --- |
| P-1 | Funds live at `/funds`, shown as a list with a card view and a ledger view, with an "Add fund" action. | `apps/web/src/routes/_authenticated/funds/index.tsx` (FundsListPage). | Action label is "Add fund." |
| P-2 | A fund has one of three types: unrestricted, temporarily restricted, permanently restricted. | `packages/db/src/schema/grants.ts` funds.type enum. | Exactly these three values. No others. |
| P-3 | A fund detail page (`/funds/:id`) shows Allocated, Spent, and Balance summary cards, with tabs Overview / Restrictions / Activity / Documents. | `$fundId.tsx` (FundDetailPage). | Balance is computed (allocations + expenses), not a stored column. |
| P-4 | A fund's balance is computed from its allocations and expenses — there is no stored balance column. | `funds` table has no balance columns; `buildFundSummary()` in `apps/api/src/domains/grants/summary.ts`. | Never imply a manually entered balance. |
| P-5 | Grants feed funds through allocations; the sum of allocations to a grant cannot exceed the grant amount (server rejects with "Allocation would exceed grant amount"). | `grantFundAllocations` schema + grants service guard. | Fine as a guardrail mention; not P3's spine. |
| P-6 | The fund Restrictions tab ("Restriction lifecycle" panel) shows a "Restricted balance" card with Beginning / Additions / Releases / Ending, a "Restriction alerts" list, and per-term summary cards (term title, restriction type, purpose, opening balance). Releases can carry an attached evidence link, and the panel raises an alert when a release has no supporting evidence. | `apps/web/src/components/restrictions/restriction-lifecycle-panel.tsx`, `restriction-balance-card.tsx` (labels Beginning/Additions/Releases/Ending), `restriction-alert-list.tsx`; `packages/db/src/schema/restrictions.ts` (restriction_evidence_links); demo seed (Title III-C Nutrition Fund: one evidenced release, one un-evidenced release that triggers an alert). | DEMO TRUTH: this panel does NOT render a per-release evidence-link row. The on-screen proof is the balance card + the alert for an unsupported release + per-term cards. Narrate only those. Evidence attaches to a release via the release form; it is not shown as a row on this tab. Re-verify the exact alert label against the captured screen. |
| P-7 | The Restrictions tab / restriction lifecycle is plan-gated. | `hasRestrictionLifecycle` flag. | Say so honestly. Demo org must be on a qualifying plan to capture it. |

## Claims that are FALSE for the app — never narrate (real-product integrity)

1. **No restricted-fund report export button / one-click schedule.** Doesn't exist. Don't show or imply it.
2. **GrantPipe creates zero journal entries and does not post to or sync with QuickBooks / a general ledger.** It tracks balances and evidence; books live in the accounting system.
3. **No per-allocation note or purpose field.** An allocation carries an amount, not free text.
4. **You cannot record a release from the funds list** — only inside a fund's Restrictions tab.
5. **`/help/funds` is not a live route yet.** Don't tell viewers to visit it as if it resolves.
6. **Don't claim every nonprofit must run legally separate funds or special software.** Restriction tracking is a classification + reporting discipline; a tool helps, it isn't legally mandatory. Keeps the plug soft.

## Builder-voice guardrails (no-lie)
- Angel **builds grant-compliance software**; he is NOT a CPA, auditor, or former nonprofit controller. The only authority claim: "to make software follow these rules, I had to learn exactly how the money moves."
- No GrantPipe user counts, testimonials, or social proof.
- Lead magnet (Restricted Fund Tracking Spreadsheet, slug `restricted-fund-tracking-spreadsheet`) is **email-gated** — "we'll send it to your inbox," never "no email needed."

## Numbers discipline
- Introduce **no federal threshold figures**. If one is unavoidable, it must match CLAUDE.md "Verified Facts": single audit **$1,000,000**; de minimis **15% MTDC**; MTDC subaward cap **$50,000**; equipment cap **$10,000**; FFATA/SAM debarment stay **$25,000**. Prior values only in explicitly historical phrasing.
- Any worked/demo dollar amounts must be internally consistent (beginning − releases = ending; allocations sum within the grant amount) and must match the actual captured screens once the demo is shot.

## Verification status
Concept claims C1–C9 fact-checked against FASB ASU 2016-14 / ASC 958 / GASB (same primary sources confirmed for S1 on 2026-06-02). Product claims P-1–P-7 grounded against the live repo (routes, schema, services) on 2026-06-03. Product narration must be re-verified against the actual captured screens before the script locks — if a screen can't be captured truthfully, the beat is cut, not faked.
