This note is historical research, not current source of truth. Stripe Connect donor payment processing and the recurring gift engine were retired on 2026-07-03. Current entitlements live in `packages/shared/src/constants/index.ts`, and current marketed plan features live in `packages/shared/src/pricing.ts`.

---

# GrantPipe — Internal Value-Driver Inventory

_Grounded against `packages/shared/src/pricing.ts`, `packages/shared/src/constants/index.ts` (PLAN_ENTITLEMENTS), `apps/api/src/domains/`, and `docs/feature-opportunities-2026-06.md` as of 2026-06-23._

**Ship-status legend throughout:** ✅ ships today (domain + entitlement wired) · 🟡 partial (API domain exists, feature incomplete per roadmap doc) · ⬜ genuine gap (no domain, no entitlement wired in production)

---

## Part 1 — Capability Value-Equation Map

The Value Equation: **Value = (Dream Outcome × Perceived Likelihood) ÷ (Time Delay × Effort)**. Each lever is scored on which axis a capability primarily moves.

**DO** = Dream Outcome raised · **L** = Likelihood of achievement raised · **T↓** = Time delay compressed · **E↓** = Effort/sacrifice reduced

### Group A — Donor & Grant Operations

| Capability                                      | Ship | Primary Lever(s) | One-line value story for the avatar                                                                           |
| ----------------------------------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Donor CRM + pipeline (prospect → lapsed)        | ✅   | DO, E↓           | One place for every contact relationship; no spreadsheet toggle to find who's lapsing.                        |
| Grants.gov + multi-source opportunity search    | ✅   | T↓, E↓           | Federal and private opportunities surface in the same screen as your active grants — no second tool.          |
| Grant pipeline tracking (full status lifecycle) | ✅   | DO, E↓           | Every grant lives at a named status so nothing falls through between "submitted" and "awarded."               |
| Automated deadline + spend-down email alerts    | ✅   | L, T↓            | The deadline doesn't slip because a calendar reminder got buried — the system emails you before it matters.   |
| Compliance calendar                             | ✅   | L, E↓            | All dated grant obligations in one view; no annual calendar rebuild in Excel.                                 |
| Pledge & multi-year commitment tracker          | 🟡   | DO, L            | Multi-year pledges with ASC 958-605 discounting stop a CPA from finding a revenue recognition error at audit. |

### Group B — Fund Accounting & Compliance

| Capability                                              | Ship | Primary Lever(s) | One-line value story for the avatar                                                                                                   |
| ------------------------------------------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Restriction lifecycle (terms, additions, releases)      | ✅   | DO, L            | Every grant's restriction is tracked from receipt to release — no more "which fund can we spend this against?" in a spreadsheet.      |
| Grant budget lines + budget-vs-actual                   | ✅   | DO, L            | Live actuals vs. grant budget in one screen; the grant manager and the finance director see the same number.                          |
| Spend-down tracking                                     | ✅   | L, E↓            | Flags underutilized funds before the period closes so you don't return money or get a grant report exception.                         |
| Grant budget alerts (over-budget, underspend, deadline) | ✅   | L, T↓            | Alerts fire before you breach a budget line or let money lapse — catches the problem while there's still time.                        |
| Budget exports (PDF/CSV/JSON)                           | ✅   | E↓               | Funder-ready budget reports without exporting to Excel and reformatting.                                                              |
| Budget amendment history & audit views                  | ✅   | L                | Every amendment is timestamped; the auditor sees the full change log, not a reconstructed spreadsheet.                                |
| Indirect cost rate rules                                | ✅   | L, E↓            | Encodes the org's NICRA or 15% MTDC de minimis rule so indirect cost on every payment request is calculated consistently.             |
| Program allocation management                           | ✅   | DO, E↓           | Personnel and shared costs split across programs automatically — removes the biggest year-end Excel artifact.                         |
| Program budget-vs-actual exports                        | ✅   | E↓               | Board-ready and funder-ready program reports without manual column-summing.                                                           |
| Drawdowns & reimbursement requests                      | ✅   | DO, T↓           | Builds the reimbursement packet from posted actuals — cash arrives faster and with fewer revision cycles.                             |
| Reimbursement evidence packets                          | ✅   | L                | Attaches supporting documents to the request so the funder doesn't send it back for documentation.                                    |
| 990 export templates                                    | ✅   | E↓               | Pre-formatted schedules reduce prep time for the CPA who files the 990.                                                               |
| Compliance report pack                                  | ✅   | E↓               | Narrative + financial schedules generated from live data; no assembling Word + QuickBooks exports.                                    |
| Restriction evidence package output                     | ✅   | L                | One-click package of every transaction and document that proves a restriction was honored — the auditor asks, you deliver in minutes. |
| Subrecipient monitoring                                 | ✅   | L                | Tracks compliance milestones and document submissions for every subaward — stops a finding before it becomes a repeat audit item.     |
| Anomaly & misallocation detector                        | 🟡   | L                | Flags expenses charged to a fund whose restriction disallows the category before the auditor does.                                    |
| Functional expense allocation studio                    | 🟡   | DO, E↓           | Define once how shared costs split across program/management/fundraising; removes manual year-end worksheet.                          |

### Group C — Auditor, Funder & Board Outputs

| Capability                                 | Ship | Primary Lever(s) | One-line value story for the avatar                                                                           |
| ------------------------------------------ | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Auditor & Funder Portal (read-only)        | ✅   | L, E↓            | Give auditors and funders a login instead of a PDF dump — fewer back-and-forth email chains, faster close.    |
| Financial statements + board-ready outputs | ✅   | E↓               | FASB ASC 958-compliant statements generated from the live ledger — not assembled from three exports.          |
| Cross-entity report builder                | 🟡   | DO, E↓           | Build once, reuse across reporting periods; no recurring "export to Excel and reformat" for the board packet. |

### Group D — AI & Automation

| Capability                                 | Ship | Primary Lever(s) | One-line value story for the avatar                                                                                            |
| ------------------------------------------ | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| AI Award Document Intake (human-confirmed) | ✅   | T↓, E↓           | Extracts award terms from the PDF; you confirm each result instead of reading the whole document and typing it in.             |
| AI grant budget extraction                 | ✅   | T↓, E↓           | Reads the approved budget out of the award document; you verify and lock it — skips the manual line-by-line entry.             |
| Ask-Your-Ledger grounded NL reporting      | ✅   | T↓, E↓           | Ask "how much restricted cash is unspent in the Smith Foundation grant?" and get the answer from the real ledger, not a guess. |
| Proposal & report drafting assistant       | 🟡   | T↓, E↓           | Drafts narrative sections grounded in your actual metrics, budgets, and outcomes — human edits and submits.                    |
| Restriction auto-classifier                | ✅   | L, E↓            | Infers net-asset class at gift entry from the donor designation + fund terms so misclassification doesn't compound downstream. |
| Donor lapse early-warning                  | ✅   | DO, L            | Surfaces at-risk donors before the cadence breaks — the Development Director acts while the relationship is still warm.        |

### Group E — QuickBooks Integration

| Capability                | Ship | Primary Lever(s) | One-line value story for the avatar                                                                                            |
| ------------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Native accounting records | ✅   | DO, E↓           | Grant, fund, donor, ledger context, and compliance records live together. External accounting sync is not available right now. |

### Group F — Onboarding & Adoption

| Capability                                         | Ship | Primary Lever(s) | One-line value story for the avatar                                                                                |
| -------------------------------------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1-month free trial, no card                        | ✅   | L, T↓            | Zero commitment to find out if it works for your org — lowers the "what if it doesn't stick?" risk.                |
| In-product onboarding + guided setup (Audit-Ready) | ✅   | T↓, E↓           | Goal-branching wizard gets data in on day one; guided setup (Audit-Ready+) means a founder call, not a consultant. |
| Sample data engine                                 | ✅   | L, T↓            | Explore a real-looking org before entering a single record — confidence before commitment.                         |
| Foundation prospect context (public filings)       | ✅   | T↓, E↓           | Surfaces publicly available funder context without leaving the grant pipeline.                                     |

---

## Part 2 — Under-Marketed Capabilities (Value vs. Visibility Gap)

These capabilities carry significant value-equation leverage but are either buried in plan comparison tables, named generically, or not present in above-the-fold marketing copy.

### 1. Restriction Auto-Classifier (✅)

**Why it's under-marketed:** "Restriction lifecycle" and "automated classification" appear as feature-row items but the avatar doesn't hear the real fear it addresses: "I assigned this gift to the wrong fund at entry and didn't catch it until the auditor did, three years later." The classifier is the data-quality floor that makes every downstream alert trustworthy. It should appear in the hero or value-prop section, not buried in a features table.

### 2. Reimbursement Evidence Packets + Drawdown Requests (✅)

**Why:** Cash-flow anxiety from reimbursement-basis grants is acute and almost universal at the $500K–$10M tier. The feature turns "email the program officer asking what supporting docs they need, wait, reformat, resubmit" into a built workflow. It's not mentioned on the homepage or in the hero — only in plan comparison tables.

### 3. Auditor & Funder Portal (✅)

**Why:** "Give your auditor a login" is a very strong, concrete anxiety-reliever. The fear isn't an abstract compliance failure — it's an ED getting a call at 7pm asking for seventeen documents by morning. The portal makes that call a non-event. The current copy treats it as one feature line among many rather than its own named moment.

### 4. AI Award Document Intake — the "you confirm each result" framing (✅)

**Why:** The human-in-the-loop framing is simultaneously a trust builder and an objection handler ("AI errors could get us in trouble with the funder") but it reads defensively in current copy. Reframe it as: "It reads the 40-page award document and pre-fills every term. You spend five minutes confirming instead of forty-five minutes transcribing." The reduction of time delay is the story; the "you confirm" adds credibility.

### 5. Ask-Your-Ledger on Growth+ (✅)

**Why:** Every other NL reporting tool is Growth-and-above. GrantPipe now matches that expectation and keeps Starter focused on award intake and budgets. Growth+ includes unlimited Ask-Your-Ledger.

### 6. Indirect Cost Rate Rules (✅)

**Why:** Indirect cost under 2 CFR 200.414(f) is a common compliance trap — the 15% MTDC de minimis is elective and many orgs misclaim it, or set it wrong and get flagged. A tool that encodes the rule correctly is a liability-removal story. Current copy says "indirect cost rate rules" — that's the what; the why is "never miscalculate indirect cost on a federal award again."

### 7. Anomaly & Misallocation Detector (🟡 — partially shipped)

**Why:** This is an audit-finding preventer, which maps directly to the ED's personal-accountability fear. It should be a hero-level claim once fully shipped. Currently only mentioned in plan comparison. Story: "GrantPipe flags the expense before the auditor does."

### 8. Unlimited Users on Every Plan (✅)

**Why:** Salesforce and some Blackbaud products price per seat. "Unlimited users" removes a hidden cost that buyers discover mid-sales-cycle. It is listed in the universal inclusions but doesn't appear as a selling argument in the hero or pricing copy.

---

## Part 3 — Technology Enhancements Ranked by Value-Equation Impact vs. Build Effort

Ranked by `(Value-equation impact score) ÷ (build effort)`. Impact score = sum of levers moved × severity. Build effort from roadmap doc: S/M/L.

### Tier 1 — Maximum impact per build dollar

---

**#1 — Data Migration / Onboarding Studio** ⬜ **[Tier 1, #1 in roadmap]**

- **Value levers:** L+++, T↓++, E↓++ — Perceived likelihood of success is the single largest predictor of SaaS trial conversion for risk-averse buyers. An org that can't get their history in within 30 days cancels. Nothing else on this list matters if migration fails.
- **Value-equation translation:** "Likelihood of Achievement" collapses to near-zero if the org stares at 8 years of DonorPerfect CSV exports and can't map them to GrantPipe's schema without a consultant. This is the adoption cliff.
- **Build effort:** M–L
- **Specific tech opportunity:** Entity-aware importers (donor deduplication, opening GL balance import from QBO export, pledge schedule import, fund balance carry-forward). The sample-data engine already proves the scaffolding. Extend to accept real CSV with field-mapping UI and reconciliation preview before commit.
- **Why above everything else:** Competitors charge for consultants to do this ($5K–$25K implementations at Blackbaud/Intacct). Self-serve migration at this fidelity is a genuine moat.

---

**#2 — Overspend / Underspend Sentinel** ⬜ **[Tier 1, #3 in roadmap]**

- **Value levers:** L++, T↓+++ — This is the "reason the ED opens the app every morning" feature. Daily active use drives retention better than any other mechanism.
- **Value-equation translation:** Reduces time-delay on detecting a problem from "we noticed at the quarterly close" to "flagged 30 days before period end." Raises likelihood of staying in compliance.
- **Build effort:** M (validators in `packages/shared/src/validators/budget-sentinel.ts` already exist — this is wiring them to a proactive alert surface, not building from scratch)
- **Specific tech opportunity:** A "sentinel" dashboard widget + proactive email digest: "3 grants are projecting underspend in the next 60 days / 1 grant has exceeded the personnel budget line." Reuse the existing budget alert + notification infrastructure.
- **Why now:** The `budget-sentinel` validator already ships; the display layer and email digest are the remaining gap. High impact, low incremental build.

---

**#3 — Donor Lapse Early-Warning Triggers** ✅ **[Tier 1, #5 in roadmap — already ships]**

- **Value levers:** DO+, L++ — Donor retention is cheaper than acquisition. A proactive trigger at "60 days since last gift, historically gives every 45 days" is a concrete revenue-protection mechanism the Development Director values immediately.
- **Build effort:** S (retention stats exist, `donor-lapse` validator exists)
- **Under-marketing opportunity:** The feature ships but isn't called out in any hero copy or the pricing page description. This is the one Tier 1 capability that is fully built but essentially invisible in marketing.

---

**#4 — Ask-Your-Ledger — expanding grounded query surface** ✅ **[Tier 3, #17 in roadmap — ships on Growth+]**

- **Value levers:** T↓+++, E↓+++ — This is the fastest possible route from question to answer. The avatar's most common information need is "how much of this fund is left?" or "what is our fundraising vs. goal this quarter?" — questions that today require opening three screens or pulling a report.
- **Build effort:** M (infra ships; deepening is about query coverage, grounding fidelity, and drill-down links from answers)
- **Specific tech opportunity:** (a) Ensure answers link to the underlying transaction list (not just a number). (b) Add proactive suggested queries based on what's due or at-risk in the org's data. (c) Make it accessible from a persistent command bar, not buried in a submenu.
- **Why high-priority:** It is the clearest demo moment for the "unified ledger" thesis — the same question answered by three systems in 15 minutes vs. answered in 10 seconds from one.

---

**#5 — Restriction Auto-Classifier (complete the pipeline)** ✅ **[Tier 1, #4 in roadmap]**

- **Value levers:** L+++ — Every downstream alert, evidence package, and compliance output depends on gifts being classified correctly at entry. A mis-classified gift silently corrupts seven other features.
- **Build effort:** S–M (classification logic in `packages/shared/src/classification/restriction-classifier.ts` exists; the gap is surfacing the pre-fill in the gift entry form and letting the user confirm or override)
- **Specific tech opportunity:** At gift entry, surface the classifier's suggested net-asset class + the linked fund's restriction terms side-by-side. One confirm click vs. manual selection. Show a warning if the gift designation contradicts the fund's restriction type.

---

### Tier 2 — High value, moderate build

---

**#6 — Board Packet Composer (scheduling + bundling)** 🟡 **[Tier 3, #11 in roadmap]**

- **Value levers:** DO+, E↓+++ — The ED spends 4–6 hours per board meeting assembling the packet from disconnected exports. Automating this is a monthly recurring time-save that drives retention.
- **Build effort:** M (single-report generation ships; bundling + scheduling is the gap)
- **Specific tech opportunity:** A "board packet" template: select sections (fund balances, fundraising vs. goal, grant pipeline, compliance calendar, financial statements), set a monthly schedule, auto-send PDF to board members. Reuses all existing report primitives.

---

**#7 — Pledge Tracker with ASC 958-605 PV discounting** 🟡 **[Tier 2, #6 in roadmap]**

- **Value levers:** DO+, L++ — Multi-year pledges are common in major gifts and capital campaigns. Without PV discounting and an installment schedule, the revenue recognition entry will fail a CPA review.
- **Build effort:** M–L (schema and GL posting exist; the pledge-specific tables and discounting math are the gap)
- **Specific tech opportunity:** Pledge installment schedule builder with PV discount rate input, uncollectible allowance estimate, and auto-generated receivable JE. Surfaces pledge aging (overdue installments) in donor pipeline.

---

**#8 — Reimbursement Cash-Flow Radar** ⬜ **[Tier 2, #9 in roadmap]**

- **Value levers:** DO++, T↓++ — Cash anxiety from reimbursement-basis grants is the loudest day-to-day pain for development directors. "How much have we spent that we haven't drawn down yet, and when should I submit the next request?"
- **Build effort:** M (payment-request + accounting data exists; projection model + worklist UI is the gap)
- **Specific tech opportunity:** A "pending drawdowns" dashboard — expenses incurred but not yet requested for reimbursement, grouped by grant, with a projected cash-gap timeline and a one-click "create drawdown request."

---

**#9 — Acknowledgment & Year-End Statement Batch Run** 🟡 **[Tier 3, #14 in roadmap]**

- **Value levers:** E↓++, T↓+ — January IRS acknowledgment crunch is a dated obligation that catches small shops in a manual mail-merge nightmare. Automating it is a concrete deadline-relief story.
- **Build effort:** M (single-letter generation ships; batch + quid-pro-quo math + delivery tracking is the gap)
- **Specific tech opportunity:** Year-end statement run: select date range, apply quid-pro-quo deduction rules, generate per-donor PDFs, deliver via email or portal. Tracks which donors have been sent their statement.

---

**#10 — SEFA Builder + Single-Audit Tripwire (Federal Edition)** ⬜ **[Tier 4, #22 in roadmap]**

- **Value levers:** L+++, DO+ — For orgs at or approaching $1M federal expenditures, a SEFA with a running threshold counter is the difference between a surprise single audit and an anticipated one with prep time.
- **Build effort:** M (accounting + grant-source data exists; SEFA aggregation logic + ALN field + threshold counter is the gap)
- **Specific tech opportunity:** A "federal expenditures" view that sums awards expended by ALN/program cluster with a live counter against the $1,000,000 threshold (2 CFR 200.501) and a projected crossing date. Export as SEFA draft. This is a compelling premium add-on that price-discriminates cleanly (only relevant to federally-funded orgs).

---

### Tier 3 — Strategic bets, validate demand first

---

**#11 — Uniform Guidance Cost-Rule Guardrails (live checks at expense entry)** 🟡 **[Tier 4, #23 in roadmap]**

- **Value levers:** L++ — Catches UG violations at entry: expense charged to a federal fund with disallowed category, indirect rate mismatching the org's NICRA or elected de minimis, MTDC subaward exclusion cap breach.
- **Build effort:** S–M (indirect cost engine ships in `payments/indirect.service.ts`; guard-rail extension to disallowability check is the gap)
- **Important constraint:** Must encode: de minimis 15% is elective (not a cap for NICRA orgs); MTDC subaward exclusion is $50K per subaward; equipment capitalization is the lower of $10K federal floor and the org's own policy.

---

**#12 — Outbound Donor Email / Mail-Merge** 🟡 **[Tier 3, #13 in roadmap]**

- **Value levers:** DO+, E↓+ — Removes the reason orgs keep Mailchimp alongside GrantPipe; eliminates one integration seam.
- **Build effort:** M (communication_log + Resend exist; batch sending / merge-tags are the gap)

---

**#13 — Multi-Entity / Fiscal-Sponsor Consolidation** ⬜ **[Tier 4, #21 in roadmap]**

- **Value levers:** DO+++ for the right ICP — fiscal sponsors and chapter orgs currently cannot use GrantPipe. A meaningful slice of the $500K–$10M band.
- **Build effort:** L (architectural; row-level org_id is single-org by design)
- **Sequencing note:** Decide whether this is V1.x ICP before any schema work — it shapes decisions made now.

---

## Summary Prioritization Matrix

| Rank | Enhancement                                       | Status | Build | Primary Value Lever | Why Now                                                                        |
| ---- | ------------------------------------------------- | ------ | ----- | ------------------- | ------------------------------------------------------------------------------ |
| 1    | Data Migration / Onboarding Studio                | ⬜     | M–L   | Likelihood+++       | #1 adoption blocker; "no consultants" promise dies without it                  |
| 2    | Overspend / Underspend Sentinel                   | ⬜     | M     | Time-delay+++       | `budget-sentinel` validator exists; display layer is the gap; drives daily use |
| 3    | Donor Lapse Early-Warning (surface + market)      | ✅     | S     | Likelihood++        | Fully built; zero marketing visibility; pure copy/UX work                      |
| 4    | Ask-Your-Ledger — drill-down + command bar        | ✅     | M     | Time-delay+++       | Best demo of the unified ledger thesis; needs UX depth, not new infra          |
| 5    | Restriction Auto-Classifier — gift entry pre-fill | ✅     | S–M   | Likelihood+++       | Data-quality floor; every downstream alert is wrong until this is right        |
| 6    | Board Packet Composer (schedule + bundle)         | 🟡     | M     | Effort↓+++          | Monthly ritual; drives retention; primitives exist                             |
| 7    | Pledge Tracker + PV discounting                   | 🟡     | M–L   | Likelihood++        | CPA-credibility trap; required for major gifts / capital campaigns             |
| 8    | Reimbursement Cash-Flow Radar                     | ⬜     | M     | Dream Outcome++     | Loudest day-to-day pain; acute cash anxiety; unique to GrantPipe's schema      |
| 9    | Acknowledgment & Year-End Statement Batch         | 🟡     | M     | Effort↓++           | Hard January deadline; removes manual mail-merge nightmare                     |
| 10   | SEFA Builder + Threshold Tripwire                 | ⬜     | M     | Likelihood+++       | Strong premium add-on; price-discriminates against federally-funded orgs       |
| 11   | UG Cost-Rule Guardrails (live at entry)           | 🟡     | S–M   | Likelihood++        | Catches UG violations before they become audit findings                        |
| 12   | Outbound Donor Email / Mail-Merge                 | 🟡     | M     | Effort↓+            | Removes Mailchimp dependency; enables year-end statement run                   |
| 13   | Multi-Entity / Fiscal-Sponsor                     | ⬜     | L     | Dream Outcome+++    | Strategic bet; validate ICP fit before architectural commitment                |

---

**Key strategic reads from this inventory:**

1. **Three capabilities are fully built but essentially invisible in marketing:** Donor Lapse Early-Warning (#3), Ask-Your-Ledger on Growth+ (#4 angle), and "unlimited users" as an active selling point. Zero build cost, pure copy leverage.

2. **Migration is the only blocker that makes all other value irrelevant.** If an org can't get their data in cleanly, the unified ledger delivers no value. It is the highest-ROI build on this list despite being M–L effort.

3. **The unified ledger is the story, Ask-Your-Ledger is the demo.** "Ask how much restricted cash is unspent in any grant and get a sourced answer in 10 seconds" is the fastest way to make the thesis tangible in a sales call. Deepening the query surface (drill-down links, proactive suggestions, command-bar placement) has outsized marketing value relative to the incremental build.

4. **Compliance is the moat, fundraising/cash is the front door.** Overspend Sentinel, Reimbursement Cash-Flow Radar, and Donor Lapse map directly to the avatar's daily urgency — they open the door. Restriction Evidence Packages, Auditor Portal, and SEFA are what close the annual audit without a consultant — they are the lock-in.
