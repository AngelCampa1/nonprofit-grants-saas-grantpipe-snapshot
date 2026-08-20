Now I have the verified facts. The promo caps, deadline, prices, and entitlements all check out as the components describe. Let me write the red-team.

---

# ADVERSARIAL RED-TEAM — GrantPipe Grand Slam Offer

I read the offer as three hostile parties at once: a burned ED who smells salesmanship, a CPA who will fail you on one wrong threshold, and a Hormozi purist who wants the Value Equation maxed. I verified every load-bearing claim against `pricing.ts`, `promos.ts`, and the entitlement catalog. Findings below are ranked, each with severity and a concrete fix.

---

## 1. LIES, UNVERIFIABLE CLAIMS, AND OVER-PROMISES

### 1.1 — `[BLOCKER]` The "$45,000+ per year" stack total is a fabricated headline number

The Value Stack sums nine value-anchors into **"~$45,000+ per year"** and prints it as the hero figure. Every line is individually labeled `[planning estimate]` in the source research — but the moment you **add them and drop the qualifier into a headline**, you have manufactured a precise-looking number that no nonprofit's actual spend will match. A CPA buyer will do the arithmetic in 30 seconds: you're double-counting. "The Unified Ledger = $18,000/yr (outsourced fund accounting)" and "Board-Ready Outputs = $3,600/yr (finance hours on the board packet)" and "Restricted-Fund Command = $3,000 pre-audit cleanup" are **the same staff doing overlapping work**. You cannot bill the controller's hours under three separate line items.

- **Why it breaks:** It violates the offer's own honesty rule ("value anchors use the LOW end, defensible, not inflated"). Stacking non-additive estimates into one number is the textbook inflated-stack move Hormozi warns _against_ when the buyer is sophisticated.
- **Fix:** Never print a summed dollar total. Anchor against **one** real, sourced alternative the buyer recognizes: "Most $500K–$10M orgs already spend $30,000–$80,000/yr on the consultants, outsourced accounting, and audit prep this touches" — and keep that as a _range citation_, not a per-feature sum. Drop the "if you bought this separately = $45,000" framing entirely.

### 1.2 — `[BLOCKER]` "The Two-Week Setup Guarantee" promises founder labor that does not scale and is not entitled where it's sold

The guarantee says: _"within 14 days you'll have your real data in GrantPipe and your first compliance report — or the founder keeps working with you, free, until you do."_ Two fatal problems:

1. **Self-serve migration does not exist.** The Value Roadmap itself flags Data Migration / Onboarding Studio as **⬜ genuine gap (M–L build)**. `hasGuidedOnboarding` is entitled to **audit_ready and enterprise only** (verified in the catalog). So for Starter/Growth — the volume the guarantee is meant to reassure — there is no import tooling AND no founder call entitlement. The guarantee is written for tiers that can't receive it.
2. **"Until you do" is unbounded liability for a solo founder.** One messy DonorPerfect export from one customer can consume Angel for weeks. Sell 20 of these and the product stops getting built.

- **Fix:** Do not publish this guarantee until the Migration Studio ships. In the interim, scope it to what exists: a _founder-led First-Close Setup session_ on Audit-Ready/Enterprise only, with a defined deliverable (one fund linked, one report run) and a **bounded** remedy ("a second session free"), never "until you do."

### 1.3 — `[MAJOR]` "Compliance Command" tier sells unshipped features

The Price Architecture proposes a $1,995/mo tier whose justification list is SEFA Builder, UG cost-rule guardrails, and the anomaly detector. Per the entitlement catalog, `hasAccountingAnomalyDetector` exists as a flag but the roadmap marks it **🟡 partial**; SEFA and UG guardrails are **⬜ gaps**. The architecture doc _does_ flag this ("do not ship the tier on roadmap features") — but the offer assembly still lists the tier as a recommended addition. That's a landmine.

- **Fix:** Keep Compliance Command out of any buyer-facing surface until its differentiating features are production-wired. The doc's own guard must be promoted from footnote to blocker.

### 1.4 — `[MAJOR]` "Federal Edition / SEFA tripwire" appears as a named Bonus 5 in the stack

Bonus 5 ("The Single-Audit Tripwire") is labeled `⬜ proposed` inside the doc — but it sits in the bonus stack with a **"$2,000+ value tag"** contributing to a **"$14,000+ bonus stack value."** A buyer reading the offer page does not see your internal `⬜`. If it's in the stack with a price tag, you've promised it.

- **Fix:** Remove all `⬜ proposed` items from any value-tagged stack. A bonus that doesn't ship is not a bonus; it's a roadmap promise, and roadmap-as-bonus is the fastest way to a refund request.

### 1.5 — `[MAJOR]` "The First-Close Setup … $2,500, included free on annual" implies a productized service that may not be staffed

The price architecture both **sells** First-Close Setup as a $2,500 add-on to Starter/Growth _and_ **gifts** it on annual Audit-Ready. If a Starter buyer pays $2,500 for a founder migration session, that's a contractual obligation on a solo founder with no migration tooling. You're selling the same scarce founder hours twice (here and in the Two-Week guarantee).

- **Fix:** Pick one. Either it's a gifted bonus on top tiers (capacity-limited, honestly scarce) or a paid service — not both, and not on Starter until tooling exists. Cap monthly slots at a real number (the scarcity doc's `FOUNDER_SETUP_SLOTS_PER_MONTH = 4` is the honest ceiling).

### 1.6 — `[MINOR]` "Live in days, not a year" / "live in your first session"

Repeated across naming and roadmap. For a buyer with _their_ 8 years of data, this is unproven (the migration tooling is the gap). It's true for the _sample-data demo_, not their real org.

- **Fix:** Qualify: "Explore a working org in minutes with sample data. Get your own grants in with guided setup." Don't conflate demo-speed with migration-speed.

### Regulatory facts — checked against the Verified Table

Good news for the CPA pass: the offer's regulatory claims are **correct**. Single-audit threshold stated as **$1,000,000 expended** ✓; de minimis **15% MTDC, elective for non-NICRA** ✓; MTDC subaward exclusion **$50,000** ✓; equipment **$10,000** ✓. The scarcity doc even correctly catches that FFATA stays $25,000. **One watch item** `[MINOR]`: the UG-guardrail demo line _"You charged $60K of a subaward to MTDC. GrantPipe stopped at $50K — the exclusion cap"_ is correct in number but describes an **unshipped** feature (1.3). Keep the number, don't ship the claim yet.

---

## 2. WEAKEST GUARANTEE / SCARCITY / PRICE CLAIM AND HOW IT BREAKS

### 2.1 — Weakest guarantee: **The Confirmed-Number Guarantee** `[MAJOR]`

It reads strong but has a soft middle. _"If our math is ever wrong on confirmed data, we fix it free and refund that month."_ The break: **"confirmed data" is doing impossible work.** The whole premise is that the human confirms inputs — so almost any wrong number can be attributed to "you confirmed a bad input," and almost no error lands cleanly as "our arithmetic." The buyer can't tell which side of the line an error falls on, and the founder always has an out. A sophisticated buyer will read it as _unfalsifiable_, which for a trust-led guarantee is worse than no guarantee — it signals the founder pre-built an escape hatch.

- **Fix:** Make the covered half _demonstrable_: "Click any number to see the journal entries behind it — every figure traces to its source." Sell **traceability** (a real, testable product property) as the trust pillar, and drop the month-refund-on-arithmetic-error clause, which is a remedy almost no one can ever invoke and therefore reads as hollow.

### 2.2 — Weakest scarcity: **"Founding cohort" seat math** `[MAJOR]`

The scarcity doc correctly catches the trap (caps are **M80OFF = 100 + Y80OFF = 200 = ~300**, verified in `promos.ts`, _not_ "Founding 100"). But the residual risk: any seat counter is **two separate pools with separate caps**, and the monthly pool (100) can exhaust while annual (200) is wide open — or vice versa. A blended "X seats left" is a lie by construction. Worse, there is **no code that surfaces a live remaining count** today — `pickActiveLaunchPhase` picks a phase but nothing renders "N left." So any seat number on a page is hand-typed, i.e., the exact "cheap software lying" tell that bounces this avatar.

- **Fix:** Do not show any seat count. Lead with the **deadline** (code-enforced, self-reverting via `getActivePromo` → null after `2026-07-04T06:59:59Z`) and let "founding cohort" carry identity, not a number. This is the doc's own recommendation; promote it to a hard rule.

### 2.3 — Weakest price claim: **"less than one month of a consultant per year on Starter"** `[MAJOR — promo-dependent]`

The line: _"Starter $3,228/yr vs. consultant retainer floor $1,500/mo."_ The arithmetic is fine at **list price**. But the offer simultaneously leads with **80% off first year**, making Starter **~$54/mo (~$646/yr)** in year one. So the buyer's actual year-one comparison is even more lopsided — fine — **but the renewal cliff is brutal and under-disclosed.** Year 2 jumps 5×. For a trust-sensitive, churn-prone buyer, an 80%-off-first-year that reverts to full price is the single most chargeback-prone structure you can ship. The offer mentions renewal clarity once; it needs to be load-bearing.

- **Fix:** Every promo price must show the renewal rate inline (`renewalPrice` already exists in the pricing types — use it everywhere). Copy: "$X for year one, then $Y/yr." Make the cliff impossible to miss at checkout, or you trade a signup today for a refund-rage cancellation in 12 months.

---

## 3. WHERE THE OFFER FAILS THE VALUE EQUATION

The research correctly names **Perceived Likelihood** as the binding constraint. The assembled offer **does not actually fix it** — it _describes_ the fix and ships the description.

- **Likelihood is still the weak lever** `[BLOCKER]`. The three things that would raise belief — (a) self-serve migration that proves "live in a session," (b) click-to-journal-entry traceability that proves "the numbers are real," (c) an honest outcome guarantee — are all **either unbuilt (a), asserted-not-demonstrated (b), or unfalsifiable (c, see 2.1)**. The offer raises _claimed_ likelihood while real likelihood is flat. For a burned buyer, a bigger promise with no proof _lowers_ belief.
  - **Fix:** Sequence honestly. Ship 1B (restriction classifier surface, ✅ exists), 1C (Ask-Your-Ledger drill-down, ✅ exists), and 1D (donor-lapse surface, ✅ exists) first — these are _real and demonstrable_. Build belief on what works, then raise prices. Don't lead the offer with the guarantee built on the unbuilt migration.

- **Time Delay is overstated** `[MAJOR]`. "First-session value" is true only for sample data. Real time-to-value is gated by migration, which doesn't exist. The denominator is bigger than the offer admits.

- **Effort is understated for the avatar** `[MINOR]`. A double-entry GL + fund accounting is genuinely hard for a non-technical ED. The offer leans on "self-evident UI" but the guarantee suite and onboarding don't absorb the _learning-curve_ sacrifice. The Effort term is real and partly unaddressed.

- **Dream Outcome is fine** — the "you are the one who answers" core is the strongest, honest asset and is used well.

Net: the equation's numerator term that's capped (belief) is the one the offer papers over instead of moving.

---

## 4. WHERE IT DRIFTS FROM THE AVATAR'S REAL DREAM

- **`[MAJOR]` It still over-indexes on compliance in the stack spine.** The research is explicit: most $500K–$10M orgs are **not** subject to a single audit; the wallet is open for **fundraising/cash/board confidence**, and compliance is the _moat, not the lead_. Yet the Value Stack's first two elements ("Unified Ledger," "Restricted-Fund Command") and three of five bonuses (Auditor Packet, Single-Audit Tripwire, evidence) are compliance-first. The offer says "lead with pull" then stacks compliance on top. A buyer who isn't audit-bound reads the first screen and thinks "this isn't for me."
  - **Fix:** Re-order the spine so the **fast-clock pull** leads: donor-lapse early-warning, board-ready-in-10-minutes, reimbursement cash radar, "ask where a dollar went." Let the auditor packet and tripwire be the "and you're covered when it counts" capstone, not the opener.

- **`[MINOR]` The consultant/agency avatar (Avatar 3) is sold a capability that doesn't exist.** Multi-entity / fiscal-sponsor consolidation is **Enterprise-only and an ⬜ architectural gap** (row-level `org_id` is single-org by design, per the roadmap). The naming doc writes consultant headlines ("Run every client from one screen," "each client sees only their own data") for a feature that isn't built.
  - **Fix:** Do not run consultant/agency copy until multi-entity ships. It's a clean lie-by-implication right now.

---

## 5. HONESTY / ETHICS FLAGS FOR A PRE-REVENUE SOLO FOUNDER

1. `[BLOCKER]` **Guarantees that obligate unbounded or non-existent founder labor** (Two-Week "until you do," double-sold First-Close Setup). A solo, pre-revenue founder who writes a check his time can't cash will either burn out or break the promise — both worse than a smaller honest guarantee.
2. `[MAJOR]` **Roadmap-as-offer.** Multiple value-tagged stack/bonus items (SEFA, Compliance Command features, self-serve migration) are unbuilt. Selling them — even with internal `⬜` labels the buyer never sees — is selling vapor. The internal honesty markers do not transfer to the page.
3. `[MAJOR]` **Renewal-cliff exposure.** 80%-off-first-year with weak renewal disclosure, sold to an explicitly trust-sensitive buyer, is the structure most likely to produce "I was tricked" churn. Ethically and commercially it must be over-disclosed, not under.
4. `[MINOR]` **No fabricated testimonials/user counts** — correctly avoided everywhere. Good. The "category-motion proof" (GrantHub sunset) is honest, but **note the date**: it's 2026-06-23; the Jan 31 2026 sunset has _passed_. Frame as "GrantHub is gone," not "is going away," or it reads as careless. `[MINOR]`
5. `[MINOR]` **Implied-permanence "founding member" language.** Only call it "membership" if founding members keep something after July 3 (locked rate, badge, founder line). If the only benefit is the first-year discount, it's a "founding offer," not a "membership." Don't imply durability the system doesn't deliver.

---

## PRIORITIZED "FIX BEFORE PUBLISHING" LIST

**Blockers — do not publish until resolved:**

1. **Kill the summed "$45,000/yr stack value" headline.** Replace with the single sourced "$30K–$80K/yr already-spent" range, no per-feature addition. (1.1)
2. **Pull the Two-Week Setup Guarantee** until self-serve migration ships; replace with a bounded founder-session promise on top tiers only. (1.2)
3. **Remove every `⬜`/`🟡` unbuilt feature from value-tagged stacks and tiers** — SEFA/Tripwire bonus, Compliance Command tier, self-serve migration claims. Roadmap is not offer. (1.3, 1.4, 3)
4. **Stop leading belief with unbuilt proof.** Re-sequence the offer to demonstrate the three _shipped_ likelihood levers (classifier surface, Ask-Your-Ledger drill-down, donor-lapse) before raising price. (3)

**Majors — fix before publishing:** 5. **Rewrite the Confirmed-Number Guarantee** around demonstrable traceability; drop the unfalsifiable "wrong on confirmed data" refund clause. (2.1) 6. **Show no seat count. Lead with the code-enforced deadline.** Ban any hand-typed "N left." (2.2) 7. **Over-disclose the renewal cliff** inline at every promo price using existing `renewalPrice`. (2.3, 5.3) 8. **Re-order the stack spine to lead with fast-clock pull,** compliance as capstone. (4) 9. **Resolve the double-sold First-Close Setup** — gifted OR paid, capped at real founder capacity, not on Starter. (1.5) 10. **Cut consultant/agency multi-entity copy** until the feature exists. (4)

**Minors — clean up:** 11. Qualify "live in days/first session" as sample-data vs. real migration. (1.6) 12. Fix GrantHub-sunset tense (past, not future). (5.4) 13. Drop "membership" unless a durable benefit exists; use "founding offer." (5.5) 14. Acknowledge and absorb the GL/fund-accounting learning-curve effort in onboarding copy. (3)

**The one-sentence verdict:** The offer's _story_ is excellent and its _regulatory facts are clean_, but it repeatedly sells the roadmap as if it were the product and writes guarantees a solo founder cannot keep — so it inflates the one lever (belief) it most needs to protect. Ship only what's wired today, anchor on one honest cost range, over-disclose the renewal, and lead with the fundraising pull the wallet is actually open for.

Relevant verified source files: `packages\shared\src\promos.ts` (caps 100+200, deadline `2026-07-04T06:59:59Z`, self-reverting), `packages\shared\src\pricing.ts` (prices, `hasGuidedOnboarding` entitled to audit_ready/enterprise only, `renewalPrice` field exists, no live seat-count surface).
