# GrantPipe — Feature Opportunity Research & Roadmap

_Created: 2026-06-15 · Sub-agent-driven market research + creative ideation, adversarially reviewed against the live codebase and for strategic/regulatory rigor (2 review/fix cycles)._

> Superseded on 2026-06-26 by `docs/offers/MASTER-BUILD-ROADMAP.md` and
> `docs/offers/roadmap-closeout-2026-06-26.md`, neither of which is included
> in this snapshot. See [`docs/offers/ROADMAP-EXECUTION-LEDGER.md`](offers/ROADMAP-EXECUTION-LEDGER.md)
> for the execution record that is present here.
> Status cells below are historical opportunity notes from 2026-06-15, not the
> current build ledger. Use the master roadmap and closeout report for shipped,
> deployed, and tested status.

This document is a **forward-looking opportunity map**, not a gap audit. The current product is deep
and production-capable: donor CRM, full double-entry GL, restricted-fund accounting, subrecipient
monitoring, AI award-document intake, auditor/funder portal, multi-program allocation. The stale
`feature-gaps.md` (2026-04-15) listed the auditor portal and multi-program allocation as "Not started"
— both now ship; treat that file as historical.

Thesis: **GrantPipe's unified ledger (donor → grant → fund → GL → report in one schema) lets it do
the donor-to-finance loop more reliably and with less reconciliation lag than a stitched
CRM-plus-QuickBooks stack.** That's a real, defensible edge — but it's a cost/latency/reliability
advantage, not a capability competitors "cannot match." Claims below are scoped accordingly.

> **Codebase-verified status legend:** ✅ ships today · 🟡 partial (primitive exists, proposed work
> extends it) · ⬜ genuine gap. Verified against `apps/api/src/domains/`, `apps/web/src/routes/`,
> `packages/db/` on 2026-06-15.

---

## 1. Market context (condensed)

**Where the real white space is:**

- **The unified ledger is the strongest defensible position.** No affordable mid-market tool unifies
  the donor → grant → fund → report loop in one schema; orgs stitch Bloomerang/DonorPerfect +
  QuickBooks + Instrumentl + a spreadsheet + their auditor, and every seam is manual reconciliation.
- **Compliance is productized — but not at this price point or without consultants.** SEFA /
  single-audit prep, grant budget-vs-actual, and fund accounting _do_ exist in **Sage Intacct
  Nonprofit, MIP Fund Accounting, Blackbaud Financial Edge, AmpliFund**, and auditor-side tools
  (**CaseWare, Thomson Reuters AdvanceFlow**). The wedge is **price + self-serve + integration**, not
  "nobody does this." For the $500K–$10M org that can't afford Intacct's price/implementation and is
  too complex for Aplos, this work is done in spreadsheets and outsourced to a CPA. That is the real,
  narrower opportunity.
- **"Audit-ready by default"** and **transparent, no-consultant** positioning are open lanes against
  Salesforce/Blackbaud TCO and the "contact sales" wall of Intacct/Financial Edge.
- Trend: **proactive tripwires** beat retrospective reports; AI grounded on a unified, _trustworthy_
  schema is more reliable than AI bolted onto a single silo (a design advantage, not a law).

**Top user pains (ranked), abbreviated Pn below:**

1. Fundraising/finance data silo — two sources of truth · 2. Grant budget-vs-actuals always stale ·
2. Net-asset classification / release of restrictions by hand · 4. Board reporting assembled manually ·
3. Grant deadline-calendar fragmentation · 6. Per-fund balance + overspend detection ·
4. Acknowledgment letters / IRS year-end statements · 8. Pledge tracking + revenue recognition ·
5. Single-audit threshold tracking + SEFA · 10. Cost allocation / personnel splits across funds ·
6. Donor retention / lapsed reactivation (no proactive trigger) · 12. Reimbursement-grant cash-flow
   visibility · 13. Uniform Guidance threshold accuracy · 14. Sustainer involuntary churn ·
7. Spreadsheet reconciliation as the system of record.

**Buyer reality (drives sequencing):** the buyer is the ED / Development Director. Their daily
urgency and reason for leaving spreadsheets is **fundraising, board reporting, and cash visibility** —
not audit prep, which is an annual, CPA-mediated event. Critically, **most $500K–$10M nonprofits are
not subject to a single audit** (it triggers only at $1M of federal awards _expended_). So
compliance is the **differentiator and moat**, but fundraising/cash/board is where the buyer's hand
is already on the wallet. **Lead with pull; differentiate with compliance.**

---

## 2. Prioritized roadmap

Scoring: **Build** = effort given current architecture (S/M/L). Status per the legend above.
Re-sequenced after review so Tier 1 leads with broadly-applicable pull plus the data-quality
foundations that everything else depends on.

### Tier 1 — Build next (universal pull, demo-strong, or adoption-critical)

| #   | Feature                                 | Status | Serves        | Build | Why Tier 1                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------- | ------ | ------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Data Migration / Onboarding Studio**  | ⬜     | adoption, P15 | M–L   | Importers for donor history, fund balances, **opening GL balances**, and pledge schedules from Bloomerang/DonorPerfect/QuickBooks/CSV. The "no consultants required" promise _dies at migration_ without this — it's the #1 adoption blocker and a moat (Blackbaud/Intacct migrations are consultant-driven). CSV import exists but not entity-aware, balance-aware migration. |
| 2   | **Compliance Deadline Radar (unified)** | ✅     | P5, P4        | S–M   | One proactive feed of every dated obligation — reporting requirements, closeout items, restriction-release dates, period closes, audit windows. Automated deadline alerts exist (per old gap audit); this _unifies_ the fragmented sources only GrantPipe owns. Applies to every org. Calendar view + notifications already host it.                                           |
| 3   | **Overspend / Underspend Sentinel**     | ⬜     | P2, P6        | M     | Watches every budget line and fund balance against posted actuals; flags projected overspend _and_ end-of-period underspend (fund lapse) before they happen. The reason an ED opens the app daily. **Depends on trustworthy posted actuals — pair with #4/#5.**                                                                                                                |
| 4   | **Restriction Auto-Classifier**         | ✅     | P3, P6        | S–M   | At gift entry, infer net-asset class from donor designation + linked fund's restriction terms + campaign; pre-fill restriction and release schedule. Data-quality foundation: without it, downstream alerts/scores fire on mis-classified data. Reads existing structured fund/restriction fields.                                                                             |
| 5   | **Donor Lapse Early-Warning Triggers**  | ✅     | P11           | S     | Retention metrics exist (`getRetentionStats`); this adds lapse _detection_ (cadence break, declining recency) surfaced in an At-Risk Donors view plus proactive in-app/email alert triggers (`donor_lapse_alert`). Auto-task/auto-segment deferred (no task entity yet; segment DSL unmapped). Cheapest revenue-protection win; broad appeal to the Development Director.      |

### Tier 2 — Close the donor↔finance loop & complete partial features

| #   | Feature                                         | Status | Serves      | Build | Notes                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------- | ------ | ----------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | **Pledge & Multi-Year Commitment Tracker**      | ✅     | P8          | M–L   | Ships with pledge tables, installment schedules, aging, ASC 958-605 present-value discounting, receivable/accretion/payment/allowance/write-off posting, pledge alerts, telemetry, and accounting-manager-only posting controls.                                                                                                                                        |
| 7   | **Restriction-aware gift-to-GL classification** | ✅     | P1, P3      | S–M   | Auto-posting of donations to the GL **already ships** (`accounting/postingEngine.ts → postDonation`, debit cash / credit unrestricted-or-restricted revenue, auto-reversal). The remaining work is feeding it the **correct net-asset class** from #4 so the posted entry is right the first time. Re-scoped from "build the posting" to "complete the classification." |
| 8   | **Functional Expense Allocation Studio**        | ⬜     | P10, P4     | M–L   | Define/apply allocation bases (FTE %, sq ft, time studies) splitting shared/personnel costs across programs + supporting services, feeding the existing ASC 958 functional-expense statement. Removes the biggest year-end Excel artifact.                                                                                                                              |
| 9   | **Reimbursement Cash-Flow Radar**               | ✅     | P12         | M     | Shipped as a Growth-gated Cash workspace panel and `GET /payments/cash-flow-radar`: computes cash gaps from existing expenses, grants, payment requests, request lines, and payments; no new table required. Adds privacy-safe success/failure analytics without sending grant names or raw financial detail.                                                           |
| 10  | **Anomaly & Misallocation Detector**            | ⬜     | P3, P6, P13 | M     | Watches posted activity for outliers — expense charged to a fund whose restriction disallows the category, release exceeding a balance, duplicate gift, indirect rate mismatching the rule — and queues for review. Catches errors that become audit findings.                                                                                                          |

### Tier 3 — Reporting, donor lifecycle, AI leverage

| #   | Feature                                     | Status | Serves         | Build | Notes                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------- | ------ | -------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | **Board Packet Composer**                   | ✅     | P4             | M     | Shipped against `docs/grant-operating-system/18-board-packet-composer-prd.md`: staff choose fiscal year, meeting date, cadence, and packet sections; the generated PDF pulls live fundraising totals, grant pipeline totals, fund balances, and compliance deadlines into the shared report library. Automatic email delivery remains outside this PRD slice.                                 |
| 12  | **Board Member Portal (read-only)**         | ⬜     | P4, governance | S–M   | Board members increasingly expect a login, not a PDF. The auditor/funder portal already proves the scoped read-only pattern — extend it to a governance view. Low-build, high-retention, reinforces "confidence and control."                                                                                                                                                                 |
| 13  | **Outbound Donor Email / Mail-Merge**       | 🟡     | gap            | M     | `communication_log` table + Resend integration exist; **donor batch sending / mail-merge does not**. Removes the reason orgs keep Mailchimp; foundation for #14.                                                                                                                                                                                                                              |
| 14  | **Acknowledgment & Year-End Statement Run** | ✅     | P7             | M     | Shipped against `docs/grant-operating-system/21-acknowledgment-year-end-statement-run-prd.md`: acknowledgment letters, calendar-year statement bundle, quid-pro-quo deductible math, generated PDF artifact, receipt markers, donor timeline tracking through `communication_log`, Reports page controls, telemetry, and Growth+ gating. Automated email delivery remains outside this slice. |
| 15  | **Configurable Dashboard / Role Home**      | done   | gap            | M     | Adds per-user, per-org saved dashboard widget preferences, role-based defaults, and auditor-safe widget filtering. Surfacing only, not new computation.                                                                                                                                                                                                                                       |
| 16  | **Cross-Entity Report Builder**             | ⬜     | gap, P4        | L     | Guided builder across donors/grants/funds/expenses/GL with saved, shareable definitions; custom fields as dimensions. Reduces "export to Excel" escape hatches. (Deferred to V1.1 in the old gap audit.)                                                                                                                                                                                      |
| 17  | **Ask-Your-Ledger (grounded NL reporting)** | ⬜     | P2, P4, P6     | M–L   | Chat that answers grounded questions by querying the real ledger and returning numbers with drill-down links (not prose guesses). Reuses existing AI infra. Most reliable _after_ the data-quality foundations (#4, #7) are in — grounded answers need trustworthy inputs.                                                                                                                    |

### Tier 4 — Larger bets / new revenue surfaces (validate demand first)

| #   | Feature                                                     | Status | Serves           | Build | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------------------------------------------------------- | ------ | ---------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18  | **Recurring Gift Engine + Dunning (donor-side)**            | 🟡     | P14, gap         | L     | Recurring _journal-entry_ templates exist (`accounting/recurringService.ts`) and Stripe handles GrantPipe's _own SaaS billing_ — **neither is donor card-on-file gift processing**. Proposed: donor recurring charges, failed-payment retry/dunning, update-card flows, post to GL. Heavy PCI surface — decide build-vs-partner before scoping.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 19  | **Grant Proposal & Report Drafting Assistant**              | 🟡     | gap, P4          | L     | Drafts application narratives + interim/final reports grounded in real impact metrics (`grant_impact_metrics`, `impact_metric_entries` exist), budgets, and actuals — closing the lifecycle with existing opportunity discovery. High liability bar: **editable draft only, human submits, never auto-submit.** Deepen outcome capture (below) to ground it well.                                                                                                                                                                                                                                                                                                                                                                                                        |
| 20  | **Outcome / Impact Measurement layer**                      | 🟡     | funder demand    | M     | Impact-metric tables exist but outcome _measurement_ (outputs → outcomes tied to grant logic models, funder-defined indicators) is thin. Funders increasingly require outcomes, not just financials. Also the grounding data #19 needs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 21  | **Multi-Entity / Fiscal-Sponsor support**                   | ⬜     | market expansion | L     | Schema is single-org (row-level `org_id`). A meaningful slice of the band are fiscal sponsors or chapter/affiliate orgs needing consolidated + per-entity reporting — a known Intacct strength and a frequent reason orgs churn _up_. Large architectural lift; caps addressable market if omitted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 22  | **SEFA Builder + Single-Audit Tripwire (Federal Edition)**  | ⬜     | P9, P13          | M     | Aggregates federal awards **expended** (not awarded/obligated) into a draft Schedule of Expenditures of Federal Awards with a running counter toward the **$1,000,000** threshold (2 CFR 200.501) and a projected crossing date. Must capture **Assistance Listing Number (ALN), pass-through identifying numbers, totals by program/cluster**, and the special inclusion rules for loans/noncash assistance (2 CFR 200.502). **Scoped as a "Federal Edition" track for the federally-funded subset + the auditor relationship — not a universal first build, since most of the segment never triggers a single audit.** Pairs with an Audit-Readiness Score and one-click Audit Binder export (composes existing evidence-bundle + document + activity-log primitives). |
| 23  | **Uniform Guidance Cost-Rule Guardrails (Federal Edition)** | 🟡     | P10, P13         | S–M   | Live checks at expense entry reusing the existing indirect-cost-rule engine (`payments/indirect.service.ts`). Must encode the rules _correctly_: de minimis **15% MTDC is elective for orgs without a NICRA**, not a universal cap; **$50K** per-subaward MTDC exclusion cap; equipment capitalization is the **lower of the federal $10K and the org's own policy** — read the org's policy, don't hard-code $10K. Pairs with #22.                                                                                                                                                                                                                                                                                                                                      |

---

## 3. Sequencing rationale

1. **Lead Tier 1 with universal pull + adoption-critical foundations.** Migration (#1) unblocks
   adoption for a stack-stitched market; Deadline Radar (#2), Overspend Sentinel (#3), and Donor
   Lapse (#5) apply to every org and demo strongly; Restriction Auto-Classifier (#4) is the
   data-quality floor everything downstream sits on. This serves the buyer's actual urgency
   (fundraising, cash, board) rather than the annual auditor event.
2. **Then close the donor↔finance loop (Tier 2).** Complete gift-to-GL classification (#7, posting
   already ships), add pledges with PV discounting (#6), allocation studio (#8), cash-flow radar
   (#9), anomaly detection (#10). This is the structural moat — reliability and reconciliation
   savings, not lock-in for its own sake.
3. **Reporting, donor lifecycle, AI (Tier 3).** Board packet/portal, outbound email → statement run,
   dashboards, report builder, and grounded NL — the last most reliable _after_ the ledger is fed
   cleanly.
4. **Run compliance as a differentiated "Federal Edition" track (Tier 4 #22–#23)** sold to the
   federally-funded subset and the auditor relationship. It's the moat and the sharpest demo, but
   targeting it as the universal first build mismatches where willingness-to-pay sits.
5. **Interop is not optional.** Native accounting records, clean auditor-format GL export, and a public
   API/Zapier surface (not yet broken out as a numbered item — see open decisions) are table stakes
   for the transition period; the "replace the stitch" thesis still needs a bridge while orgs migrate.

---

## 4. Open decisions for the founder

- **Interop / API surface** — QuickBooks sync is unavailable. The
  `accounting-integrations` routes are retirement tombstones. Decide whether to invest in a public
  REST/Zapier surface and a clean auditor-format GL export now (adoption bridge) or defer.
  Recommend at least the export early.
- **#18 payments strategy** — donor-side gift processing is a revenue surface but a real PCI +
  reconciliation commitment. Build-vs-partner before scoping.
- **#19 AI liability posture** — confirm "editable draft only, human submits" is the public stance.
- **#21 multi-entity** — large lift; decide whether fiscal-sponsor/chapter orgs are in the V1.x ICP
  or a later expansion, as it shapes schema decisions made now.
- **Federal Edition packaging** — should #22/#23 be a paid add-on tier? It concentrates value in a
  subset and could price-discriminate cleanly.

---

## 5. Provenance & caveats

- Competitor pricing/feature claims are from model knowledge (~early 2026) and must be re-verified
  before any public "vs" page — most enterprise vendors are quote-only. Named comparables include
  Sage Intacct Nonprofit, MIP Fund Accounting, Blackbaud Financial Edge, AmpliFund, Aplos, Bloomerang,
  DonorPerfect, Instrumentl, and auditor-side CaseWare / Thomson Reuters AdvanceFlow.
- **Regulatory facts (match CLAUDE.md verified-facts table):** single audit at **$1,000,000 federal
  awards expended** (2 CFR 200.501, FYs ending on/after Sept 30, 2025); de minimis **15% of MTDC**
  (2 CFR 200.414(f), elective for non-NICRA entities); MTDC subaward exclusion cap **$50,000**;
  equipment capitalization **$10,000** federal floor (org policy may be lower and the lower governs);
  FFATA subaward reporting and SAM.gov debarment remain at **$25,000** (unchanged). Get
  _expended-vs-awarded_, _elective-vs-mandatory de minimis_, _federal-vs-org equipment threshold_, and
  _pledge PV discounting_ exactly right in every PRD and user-facing string — these are the CPA-
  credibility traps, not the headline numbers.
- The single-audit threshold regression test is `apps/site/src/audit-threshold-amount.test.ts`
  (guards against the retired three-quarter-million-dollar figure) — it is **not** an indirect-cost-rule test. Indirect cost
  rules live in `apps/api/src/domains/payments/indirect.service.ts`.
- This roadmap is opportunity research, not a commitment. Each Tier 1 item warrants its own PRD in
  `docs/grant-operating-system/` before implementation, following the existing PRD pattern.
