I'll build this roadmap directly from the value-inventory research. No file writes needed — this is analysis the parent agent reads from my output.

# GrantPipe — The Order-of-Magnitude Value Roadmap

**The bridge from offer copy to product reality.** Every premium claim the offer wants to make has to be _backed by a thing the product actually does_. This roadmap selects and sequences the technology investments that let GrantPipe credibly promise — and deliver — dramatically more value, so the premium price stays honest.

**The governing logic:** Value = (Dream Outcome × Perceived Likelihood) ÷ (Time Delay × Effort). The binding constraint identified across the research is **Perceived Likelihood** — a burned, risk-averse buyer who can't be sold with testimonials (solo founder, no fabrication allowed). So the highest-leverage builds are the ones that let the _product prove itself_ and let the _offer make a guarantee it can keep_. Each item below names the lever it moves and the **offer-claim it unlocks** — because a guarantee you can't deliver is a lie, and a guarantee you _can_ deliver is the whole moat.

Ship-status legend: **✅ ships today** · **🟡 partial (domain exists, gap is the surface)** · **⬜ genuine build**. Effort: **S / M / L**.

---

## GROUP 1 — SHIP TO MAKE THE OFFER REAL NOW

_These are mostly copy/UX/wiring on capabilities that already exist. They unlock real offer claims for near-zero build. Do these before raising a single price._

### 1A. Data Migration / Onboarding Studio ⬜ **(M–L)** — _the keystone_

- **Value lever:** Perceived Likelihood +++, Time Delay ++, Effort ↓++. This is the single build that makes every other value claim reachable — an org that can't get its history in cancels in week 3, and the dream never arrives.
- **Offer-claim unlocked:** **"Live in your first session — no consultant, no $5K–$25K implementation."** Directly converts the avatar's deepest scar (the year-long Salesforce/Blackbaud rollout) into a guarantee. Unlocks the _"No Consultant" Guarantee_.
- **Demo moment:** _"Drag in your DonorPerfect export. Watch it dedupe donors, map fields, and show you a reconciliation preview before anything commits."_
- **Why first:** The sample-data engine already proves the scaffolding. Extend it to accept real CSV + field-mapping + QBO opening-balance import. Without this, "live in your first session" is a lie and the whole premium collapses.

### 1B. Restriction Auto-Classifier — gift-entry pre-fill surface ✅ **(S–M)**

- **Value lever:** Perceived Likelihood +++. The data-quality floor: every downstream alert, evidence package, and rollforward is wrong until gifts are classified right at entry.
- **Offer-claim unlocked:** **"Your books are audit-clean from the first gift, not reconstructed at year-end."** Underwrites the _Audit-Ready Promise_.
- **Demo moment:** _"Enter a gift. GrantPipe pre-fills the net-asset class from the donor designation and warns you if it contradicts the fund's restriction — one click to confirm."_
- **Gap:** Classifier logic ships (`restriction-classifier.ts`); the gap is showing the suggestion + the fund's terms side-by-side in the gift form.

### 1C. Ask-Your-Ledger — drill-down links + command bar ✅ **(M)**

- **Value lever:** Time Delay +++, Effort ↓+++. This is _the demo of the entire one-schema thesis_ — the question three systems answer in 15 minutes, answered in 10 seconds from one.
- **Offer-claim unlocked:** **"Ask where any dollar went in plain English. Click the answer to see every transaction behind it. No black box."** Surfaces the human-confirmed, traceable-correctness trust pillar.
- **Demo moment:** _"Type 'how much restricted cash is unspent in the Smith Foundation grant?' — get the number, then click it to see the exact journal entries."_
- **Gap:** Answers must link to the underlying transaction list (not just a number), plus a persistent command bar and proactive suggested queries.

### 1D. Donor Lapse Early-Warning — surface + market ✅ **(S)**

- **Value lever:** Dream Outcome +, Perceived Likelihood ++. Built today, **invisible in marketing** — pure copy leverage, near-zero build.
- **Offer-claim unlocked:** **"We tell you a donor is slipping while the relationship is still warm."** A fast-clock _pull_ claim that opens the wallet (revenue protection, not compliance).
- **Demo moment:** _"This donor gives every 45 days. It's been 60. GrantPipe flagged it before you noticed."_

### 1E. Name + stack the existing guarantees ✅ **(S — copy only)**

- **Value lever:** Perceived Likelihood +++ at zero build. The entire competitor field has **no published guarantee** — naming yours is uncontested differentiation.
- **Offer-claim unlocked:** The named stack —
  - **"First Month, No Risk"** (the existing 30-day money-back, named)
  - **"No Consultant" Guarantee** (unlocked by 1A)
  - **"Audit-Ready Promise"** — _process/effort_ guarantee: your rollforward and evidence packet are export-ready when the auditor asks, or founder-guided support gets you there. **Never** a financial-outcome promise — keeps it true and legally clean.
- **Demo moment:** _"Three named guarantees on the pricing page. Nobody else in the category publishes even one."_

> **Group 1 makes the offer honest at current prices.** It converts "trust us" into "watch it work" and turns four already-built-but-invisible capabilities into headline claims.

---

## GROUP 2 — NEXT 90 DAYS

_Moderate builds on existing primitives. Each unlocks a new premium claim or a retention driver — the difference between "good tool" and "the system I open every morning."_

### 2A. Overspend / Underspend Sentinel ⬜ **(M)** — _the daily-use driver_

- **Value lever:** Time Delay +++, Perceived Likelihood ++. Moves the org from **retrospective** ("we noticed at quarterly close") to **proactive** ("flagged 30 days before period end"). Proactivity _is_ perceived likelihood.
- **Offer-claim unlocked:** **"We flag the budget problem 30 days before it becomes an audit finding — not after."** The reason the ED opens the app daily, which is the strongest retention mechanism on the list.
- **Demo moment:** _"Monday's digest: 3 grants projecting underspend in 60 days, 1 over its personnel line. Act now, not at close."_
- **Why high-ROI:** The `budget-sentinel.ts` validator already exists — this is wiring it to an alert surface + email digest, not building from scratch.

### 2B. Board Packet Composer — schedule + bundle 🟡 **(M)**

- **Value lever:** Effort ↓+++, Dream Outcome +. Kills the 4–6 hour monthly packet-assembly ritual — a recurring time-save that compounds into retention.
- **Offer-claim unlocked:** **"Board-ready in 10 minutes, not a lost weekend."** Maps straight to the avatar's board-meeting-scramble pain (the #1 ED frustration in the dossier).
- **Demo moment:** _"Pick your sections, set a monthly schedule, and the board packet PDF lands in their inboxes before the meeting — built from live numbers."_
- **Gap:** Single-report generation ships; bundling + scheduling is the build. Reuses every existing report primitive.

### 2C. Reimbursement Cash-Flow Radar ⬜ **(M)**

- **Value lever:** Dream Outcome ++, Time Delay ++. The loudest _day-to-day_ cash anxiety for reimbursement-basis grants — and it's unique to GrantPipe's schema (you need posted actuals tied to grants to compute it).
- **Offer-claim unlocked:** **"Always know what you've spent but haven't drawn down — and when to ask for it."** A _pull_ claim (cash, the open wallet) that only the unified ledger can make.
- **Demo moment:** _"$48,000 spent across 4 grants, not yet reimbursed. Here's your projected cash gap — click to build the drawdown request."_

### 2D. Audit-Readiness Score + Binder Starter ✅ **(M)** — _the proof artifact_

- **Value lever:** Perceived Likelihood +++, Dream Outcome +. No competitor sells _proof of readiness_. This productizes the moat into a single visible number + a tangible deliverable.
- **Offer-claim unlocked:** **"See your audit-readiness score today. Start the binder in one click."** This is what makes the _Audit-Ready Promise_ demonstrable instead of aspirational — and it's a clean premium-tier price-discriminator.
- **Demo moment:** _"Your org scores 86/100 audit-ready. Three items to fix. Click 'Create audit binder' to start the audit evidence package."_
- **Shipped slice:** Evidence packages + auditor portal + 990 export already shipped. The Evidence Bundles surface now adds a live readiness score and one-click audit-purpose binder preset with privacy-safe analytics and Sentry failure capture. Automated item selection and portal sharing can expand this later if needed.

### 2E. Pledge Tracker + ASC 958-605 PV Discounting ✅ **(M–L)**

- **Value lever:** Perceived Likelihood ++, Dream Outcome +. A **CPA-credibility trap** — multi-year pledges without PV discounting fail audit review. Required to credibly serve major-gift / capital-campaign orgs.
- **Offer-claim unlocked:** **"Multi-year pledges discounted to present value automatically — the entry your CPA won't flag."** A finance-avatar trust claim that signals "this was built by someone who knows ASC 958."
- **Demo moment:** _"Enter a 3-year $150K pledge. GrantPipe builds the installment schedule, the PV discount, and the receivable journal entry — correctly."_
- **Shipped slice:** Pledge entities, installment schedules, PV discounting, receivable/accretion/payment/allowance/write-off posting, aging, alerts, telemetry, and accounting-manager-only posting controls now ship.

### 2F. Acknowledgment & Year-End Statement Batch Run ✅

- **Value lever:** Effort ↓++, Time Delay +. Removes the January IRS-acknowledgment mail-merge nightmare — a hard, dated, universal deadline.
- **Offer-claim unlocked:** **"Every donor statement in one run. Quid-pro-quo math included."** Removes the last reason to build statements in a separate mail-merge tool.
- **Demo moment:** _"Pick the year. Apply deduction rules. Build the PDF bundle. Log it on each donor timeline."_
- **Shipped slice:** Acknowledgment letters, calendar-year donor statement runs, goods/services math, downloadable PDF artifacts, receipt markers, donor communication-log tracking, Reports page controls, telemetry, and Growth+ gating now ship. Automated email delivery remains outside this slice.

> **Group 2 turns the offer from "honest" into "premium-justified."** The Sentinel and Cash-Flow Radar open the wallet (pull); the Audit-Readiness Score makes the moat _visible and provable_.

---

## GROUP 3 — THE MOAT

*Larger or strategic builds. These are what no competitor can match overnight, what justifies a tier *above* Audit-Ready, and what locks the org in once their data lives in one schema.*

### 3A. SEFA Builder + Single-Audit Tripwire (Federal Edition) ⬜ **(M)** — _clean price-discriminator_

- **Value lever:** Perceived Likelihood +++, Dream Outcome +. For orgs at/approaching $1M federal expended, this is the difference between a _surprise_ single audit and an _anticipated_ one with prep time.
- **Offer-claim unlocked:** **"A live counter to the $1,000,000 single-audit threshold — know the day you'll cross it, before you do."** Anchors a premium "Compliance Command" tier (~$1,800–$2,500/mo) that's _still_ less than half a fractional-CFO line.
- **Demo moment:** _"Federal expenditures: $912,400 of $1,000,000. Projected crossing: March. Here's your SEFA draft."_
- **Honest-fact guardrail:** counter pinned to $1,000,000 expended (2 CFR 200.501) — only relevant to federally-funded orgs, which is exactly why it price-discriminates cleanly.

### 3B. Uniform Guidance Cost-Rule Guardrails — live at expense entry 🟡 **(S–M)**

- **Value lever:** Perceived Likelihood ++. Catches UG violations _at entry_: disallowed category on a federal fund, indirect-rate mismatch, MTDC subaward cap breach.
- **Offer-claim unlocked:** **"GrantPipe catches the disallowed cost before the auditor does."** A downside-avoidance claim — the category that justifies fear-pricing.
- **Demo moment:** _"You charged $60K of a subaward to MTDC. GrantPipe stopped at $50K — the exclusion cap — before it became a finding."_
- **Honest-fact guardrail (binding):** de minimis **15% MTDC is elective**, not a cap for NICRA orgs; MTDC subaward exclusion **$50K**; equipment capitalization lower of **$10K** federal floor and org policy. The indirect-cost engine already ships (`payments/indirect.service.ts`); the disallowability check is the extension.

### 3C. Anomaly & Misallocation Detector — complete + promote 🟡 **(M)**

- **Value lever:** Perceived Likelihood +. An audit-finding _preventer_ — maps directly to the ED's personal-accountability fear.
- **Offer-claim unlocked:** **"An expense hits a fund whose restriction disallows it — flagged the moment it lands."** Promote to a hero-level claim once complete.
- **Demo moment:** _"This expense was charged to a fund restricted to programs, not admin. Flagged before close."_

### 3D. Multi-Entity / Fiscal-Sponsor Consolidation ⬜ **(L)** — _strategic ICP bet_

- **Value lever:** Dream Outcome +++ for the right ICP (fiscal sponsors, chapter orgs, the multi-client consultant avatar). A meaningful, currently-excluded slice of the $500K–$10M band.
- **Offer-claim unlocked:** **"Every entity, one console — each sees only their own data."** Unlocks the consultant/agency SKU (Avatar 3) and the Enterprise consolidation tier.
- **Demo moment:** _"Switch between 8 client orgs from one login; consolidated roll-up across all of them, isolated per client."_
- **Sequencing note:** Architectural — row-level `org_id` is single-org by design. **Decide ICP fit before any schema work**; it shapes decisions made now. This is the one item to validate demand on before committing.

> **Group 3 is what you can't copy in a quarter.** SEFA + UG guardrails let GrantPipe price on _downside-avoidance_ (fear-priced, premium-justified); multi-entity opens a whole new ICP.

---

## The claim-to-build ledger (the honesty contract)

| Offer claim the premium price needs              | Backed by                                   | Status | Effort |
| ------------------------------------------------ | ------------------------------------------- | ------ | ------ |
| "Live in your first session, no consultant"      | Migration Studio (1A)                       | ⬜     | M–L    |
| "Audit-clean from the first gift"                | Restriction Auto-Classifier surface (1B)    | ✅     | S–M    |
| "Ask any dollar in English, click to the proof"  | Ask-Your-Ledger drill-down (1C)             | ✅     | M      |
| "We flag the slipping donor while it's warm"     | Donor Lapse surface (1D)                    | ✅     | S      |
| Three named guarantees (field has zero)          | Copy on existing 30-day + 1A + 1B           | ✅     | S      |
| "Problem flagged 30 days before close"           | Overspend Sentinel (2A)                     | ⬜     | M      |
| "Board-ready in 10 minutes"                      | Board Packet Composer (2B)                  | 🟡     | M      |
| "Know what to draw down, and when"               | Cash-Flow Radar (2C)                        | ⬜     | M      |
| "See your readiness score, start the binder"     | Audit-Readiness Score + Binder Starter (2D) | ✅     | M      |
| "Pledges your CPA won't flag"                    | Pledge PV discounting (2E)                  | ✅     | M–L    |
| "Know the day you cross the single-audit line"   | SEFA Tripwire (3A)                          | ⬜     | M      |
| "Catches the disallowed cost before the auditor" | UG Guardrails (3B)                          | 🟡     | S–M    |

---

## Three strategic reads

1. **Group 1 unlocks more premium-claim than it costs to build.** Four of its five items are surface/copy work on shipped capabilities. Do all of Group 1 _before_ raising prices — it makes today's price honest and the next raise defensible.

2. **The binding constraint is belief, and the fix is "make the product prove itself."** Migration Studio (live-in-a-session), Audit-Readiness Score (visible proof), Ask-Your-Ledger drill-down (click to the journal entries), and human-confirmed AI are all _proof mechanisms_ that replace the testimonials a solo founder honestly can't have.

3. **Lead with pull, lock in with compliance.** Sentinel, Cash-Flow Radar, and Donor Lapse are the _front door_ (cash/fundraising — the open wallet, the daily-use drivers). SEFA, UG Guardrails, Audit Binder, and the auditor portal are the _lock_ (the annual audit closed without a consultant). Build both, sequence the pull first.

**One binding constraint on everything above:** every offer claim listed here must clear the repo's mandatory copy gate (`humanizer` → `third-grade-copy` → zero-lies → fits-the-whole-place) before it ships to any user-facing surface, and every regulatory number must match the Verified Facts table ($1M single-audit / 15% elective de minimis / $50K MTDC cap / $10K equipment).

The sharpest line to build the whole offer around remains the product's own gate-cleared copy: _"You are the one who answers… That is the real fear. Not the price."_ Every item in this roadmap is, ultimately, a way to make that answer always available.
