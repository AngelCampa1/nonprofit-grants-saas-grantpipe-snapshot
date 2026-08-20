# GrantPipe — The Grand Slam Offer

**Master strategy document. Internal. The key to charging premium prices.**

_Built from the Hormozi $100M Offers + $100M Leads frameworks, applied to GrantPipe's real codebase, real pricing, and real regulatory facts. Every number is sourced or flagged. Every buyer-facing line is draft until it clears the repo copy gates. Every product claim is marked by ship-status so the offer never promises what the product can't deliver._

Date assembled: 2026-06-23 · Source of truth for pricing: `packages/shared/src/pricing.ts` · Source of truth for promo mechanics: `packages/shared/src/promos.ts`

---

## How to read this document

Three honesty contracts govern everything below. They are not caveats. They are the reason a burned, risk-averse buyer will believe you.

1. **Ship-status legend.** Every product capability is tagged:
   - ✅ **ships today** — you can demo it right now. Only these may appear in buyer-facing offer copy.
   - 🟡 **partial** — the domain exists, the surface or polish is the gap. Roadmap, not offer.
   - ⬜ **genuine build** — not yet real. Never appears in an offer claim, a stack, or a price tier.
2. **Number provenance.** Money figures are one of: **[code]** (from `pricing.ts` / `promos.ts`), **[external]** (a cited competitor or market number), or **[planning estimate]** (our analysis, not a fact to publish as fact).
3. **Copy gate.** Any line marked _draft copy_ must pass `humanizer` → `third-grade-copy` → zero-lies → fits-the-whole-place before it ships to a single user-facing surface. The lines here are written to clear those gates but have not been run through them in final on-page context.

---

## Part 0 — The thesis in one page

**The number to beat is never "$299/mo Instrumentl."**

The avatar — an Executive or Development Director at a $500K–$10M nonprofit — does not assemble their current solution from one tool. They assemble it from a donor CRM, a separate grant tracker, QuickBooks, a pile of spreadsheets, and, when the audit comes, **a consultant or fractional controller billing $30,000–$80,000 a year** [planning estimate, anchored to fractional-CFO and nonprofit-audit-prep market rates — verify the exact range before publishing any figure]. That assembled stack is the real competitor. That is the price-to-value anchor.

GrantPipe's moat is not a feature. It is the **schema**: donors, grants, restricted funds, and a double-entry general ledger in **one system**, so the question that takes three disconnected tools fifteen minutes to answer is answered in ten seconds from one. Everything in this offer is a way to make one promise true and provable:

> **You are the one who answers.** When the board asks where a dollar went, when the auditor calls, when a deadline looms — you have the answer, and you can show the work. That is the dream outcome. Not the price.

The Hormozi Value Equation tells us where to push:

> **Value = (Dream Outcome × Perceived Likelihood of Achievement) ÷ (Time Delay × Effort & Sacrifice)**

The research converged on a single finding: **the binding constraint is Perceived Likelihood.** This buyer was burned once — by a year-long Salesforce or Blackbaud rollout that needed a consultant and still failed them. A solo founder cannot fabricate testimonials, user counts, or social proof (and is forbidden from doing so). So the entire offer strategy is: **make the product prove itself, and make guarantees a solo founder can actually keep.** Belief is built by demonstration, not by claims.

---

## Part 1 — The Avatars

One through-line unites all three: **they never want to be the person who can't answer the question.** That fear orders every name, headline, and guarantee in this document.

### Avatar 1 — The Executive / Development Director (primary)

- **Who:** Runs a $500K–$10M nonprofit. Time-poor, risk-averse, arrived after being burned by enterprise CRM or spreadsheet chaos.
- **Dream outcome:** Walk into every board meeting and every audit already ready. Never scramble. Never get caught not knowing.
- **Deepest fear:** Personal accountability with their name on it. "I answer when the auditor calls."
- **Emotional goal:** Confidence and control. Not delight, not excitement.
- **What opens the wallet:** Confidence and cash protection (fundraising, drawdowns) more than compliance — most of these orgs are not facing a federal single audit.

### Avatar 2 — The Finance / Operations Director (secondary)

- **Dream outcome:** Clean books, zero audit findings, no year-end reclassification dig through 2,000 transactions.
- **Deepest fear:** A misclassified restricted dollar the auditor finds first.
- **What opens the wallet:** "Audit-clean from the first gift, not reconstructed at year-end." Keep QuickBooks as a separate workflow.

### Avatar 3 — The Grant Consultant / Small Agency (tertiary, strategic)

- **Dream outcome:** Run every client from one screen, never miss a client deadline, look like a firm three times the size.
- **What opens the wallet:** Per-client isolation, a client-facing portal, multi-entity consolidation.
- **Status caution:** Multi-entity consolidation is ⬜ a genuine architectural build (`org_id` is single-org by design). **This avatar is a bet to validate, not an offer to sell today.**

---

## Part 2 — The Value Equation, enhanced with technology

This is the heart of "deliver the most value possible with technology." Each lever below names the technology that moves it and the ship-status, so we only ever sell what's real.

### Lever ↑ Dream Outcome (make the result bigger)

- ✅ **Ask-Your-Ledger** — ask where any dollar went in plain English, get a real answer you confirm. The single-schema moat, made tangible.
- ✅ **Donor Lapse early-warning** — "this donor gives every 45 days; it's been 60." Revenue protection, the open wallet.
- ✅ **Auditor / funder read-only portal** — send a link, not a panic.

### Lever ↑ Perceived Likelihood (the binding constraint — invest most here)

- ✅ **Human-confirmed AI** — the AI never acts alone; you confirm every entry. Belief lift for a burned buyer. This is the trust pillar, not a feature footnote.
- ✅ **Restriction Auto-Classifier** — pre-fills net-asset class at gift entry, warns on contradiction. Audit-clean from the first gift.
- ✅ **Drill-down traceability** — every answer links to the exact journal entries behind it. No black box.
- ⬜ **Audit-Readiness Score + one-click binder** — a visible number that productizes the moat into proof. _Roadmap — do not sell yet._
- ⬜ **Data Migration Studio** — live in your first session, no consultant. _The keystone build. The single most important investment, because it converts the avatar's deepest scar into a deliverable guarantee. Until it ships, "live in your first session" is a line we cannot say._

### Lever ↓ Time Delay (shrink time-to-value)

- ✅ **Founder-led guided setup** — leave the first call with grants live (Audit-Ready / Enterprise).
- ⬜ **Self-serve migration** — the build that makes "live in a session" true for self-serve buyers.

### Lever ↓ Effort & Sacrifice (make it easier)

- **QuickBooks sync:** Not available. Keep QuickBooks separate. Revisit sync only after demand is proven.
- ✅ **Compliance calendar + deadline/spend-down alerts** — nothing slips; the system watches so you don't have to.
- 🟡 **Board Packet Composer** — kills the 4–6 hour monthly assembly ritual. _Bundling + scheduling is the gap._

**Strategic read:** The fastest premium-justifying wins are ✅ capabilities that are **invisible in current marketing** — Donor Lapse, Ask-Your-Ledger drill-down, Restriction Auto-Classifier, human-confirmed AI. Pure copy leverage, near-zero build. The keystone investment is the ⬜ Migration Studio, because it is the precondition for the strongest guarantee.

---

## Part 3 — The Value Stack (offer assembly)

**Red-team correction applied:** _No summed "stack value" headline._ We do **not** add up imaginary line-item prices to a "$45,000+/yr value" number — that is the exact fabricated-math move a burned buyer distrusts. The single honest anchor is the sourced **$30,000–$80,000/yr** the avatar already spends on the assembled-stack-plus-consultant floor [planning estimate — verify before publishing].

**Red-team correction applied:** _Stack leads with fast-clock pull; compliance is the capstone, not the opener._ Most of these orgs are not facing a single audit. The wallet opens for cash and confidence first; compliance is the lock that holds them.

Only ✅ ships-today capabilities appear in the sellable stack. Everything else is labeled and lives in the roadmap (Part 8).

| #   | Stack element                   | What the buyer gets                                                                                             | Status |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | **Ask Your Ledger**             | Ask where any dollar went in plain English; click the answer to see every transaction behind it.                | ✅     |
| 2   | **Donor Lapse Watch**           | A warning when a reliable donor goes quiet, while the relationship is still warm.                               | ✅     |
| 3   | **The Deadline Watch**          | Every grant report and spend-down date, watched; emailed before it slips.                                       | ✅     |
| 4   | **Restriction Auto-Classifier** | Net-asset class pre-filled at gift entry, with a warning when it contradicts the fund.                          | ✅     |
| 5   | **The Award Reader**            | AI reads a grant award document and drafts the setup; you confirm every line.                                   | ✅     |
| 6   | **The Board-Meeting Packet**    | Board-ready financials and fund balances, built from live numbers.                                              | ✅     |
| 7   | **The Auditor Packet + portal** | Restriction evidence assembled; hand the auditor a read-only link.                                              | ✅     |
| 8   | **Founder-led Day-One Setup**   | A setup call with the person who built it. Leave with grants live. (Audit-Ready / Enterprise; bonus on annual.) | ✅     |

**Bonuses** (each a named mini-offer; all ✅ — the red-team killed the ⬜ SEFA/Tripwire bonus from this list because it isn't built):

- **The Move-In Setup** — guided import of your existing data (✅ assisted today via founder setup; self-serve is ⬜ roadmap — sell only the assisted version).
- **The Plain-English Answer Bar** — Ask Your Ledger on every plan, not just premium.
- **Human-in-the-loop guarantee** — the AI never posts without your confirmation.

---

## Part 4 — The Guarantee Suite: "The Stand-Behind-It Stack"

**The uncontested differentiator:** the entire competitive category publishes **zero** guarantees [external — verified across the competitor set; re-confirm before making the "nobody else does" claim publicly]. Naming even one is white space. The discipline: **a solo founder must be able to keep every promise.** No financial-outcome guarantees. Process and access guarantees only.

| Guarantee                    | Promise                                                                                                                     | Why it's keepable                                                                                                                  | Status           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **Free Look**                | Start free for one month, no card.                                                                                          | Already the product term [code: `UNIVERSAL_PLAN_INCLUSIONS`].                                                                      | ✅ ship          |
| **First Month, No Risk**     | Not right? Full refund in the first 30 days.                                                                                | The existing 30-day money-back, named.                                                                                             | ✅ ship          |
| **Your Data, Always**        | Export everything, any time. It's yours.                                                                                    | A capability promise, fully in our control.                                                                                        | ✅ ship          |
| **Day-One Setup**            | Leave your founder setup call with grants live.                                                                             | Keepable **for guided setup today**. _Red-team: do NOT promise self-serve "two-week setup" until the Migration Studio (⬜) ships._ | ✅ (guided only) |
| **Confirmed-Number Promise** | Every number traces to the journal entries behind it. You can always show the work.                                         | A traceability promise the double-entry schema delivers. _Red-team: framed around traceability, NOT a guarantee of correctness._   | ✅ ship          |
| **Anti-guarantee (honesty)** | "We won't promise you'll pass your audit. No software can. We promise your evidence is export-ready when the auditor asks." | Turns the one promise we can't make into a trust signal.                                                                           | ✅ ship          |

**Red-team correction applied:** the "No Consultant" / "live in your first session" guarantee is **gated** on the Migration Studio shipping. Until then, the keepable version is "founder-led setup, no consultant required" — true today, because Angel runs the call.

---

## Part 5 — Scarcity & Urgency (honest pressure for a buyer who distrusts pressure)

Every lever maps to a real constraint in code or a real external clock. The governing rule: **a single fake countdown costs more trust than it buys urgency.** Lead with the avatar's own clock; close with the offer deadline.

### Real internal levers

- **Founder-led setup slots (supply scarcity).** A solo founder can only run so many guided setups a month. Pick a real number (e.g. ~4/month), count real bookings, show the counter **only when ≤ 3 and true**, and when full, **schedule the next month — never lock the buyer out.** This is the most honest scarcity GrantPipe has, and it doubles as belief lift (the help is scarce _because it's real_).
- **Founding-cohort price deadline (urgency).** [code: `LAUNCH_PROMO_DEADLINE_ISO = 2026-07-04T06:59:59Z`] = end of **Friday, July 3, 2026, Pacific.** After it, `getActivePromo()` returns null and price reverts automatically. Show **days, not fake ticking seconds.** Self-reverting, so it can never become the "sale ends today (every day)" lie.

### **Critical reconciliation — do not get this wrong**

**Never say "Founding 100."** The promo caps in code are **100 monthly redemptions (`M80OFF`) + 200 annual (`Y80OFF`) ≈ up to 300 founding seats** [code: `promos.ts`]. Lead with the **deadline** as the boundary (unambiguous, code-enforced); treat any seat count as secondary and only show it if wired to live redemption data. A stalled "97 left" counter is the #1 "cheap software is lying to me" tell.

### Real external levers (highest leverage — the avatar's own calendar)

- **Grant deadlines & spend-down clocks** — "the deadline doesn't wait for your spreadsheet." The product already tracks and emails these.
- **Fiscal year-end & audit season** — seasonal campaign timing, not a fake countdown. Invoke the **$1,000,000 single-audit threshold** [2 CFR 200.501] **only** for orgs near it — most are not subject, so don't imply they are.
- **GrantHub sunset** — Foundant sunset GrantHub on **Jan 31, 2026**, which is **already past** as of today (2026-06-23). Frame as "your tool already went away," pair with founder-led migration help. _Verify current status before publishing._

### The 10 binding rules (the non-negotiable core)

Every number traces to code or a live count · never claim "Founding 100" · deadlines self-revert and are tested · scarcity reveals only when real (≤3) · no fake ticking seconds · external deadlines must be the buyer's real ones · renewal terms always sit next to the discounted price · graceful-not-punishing when full · one kill switch per lever · all public copy clears the copy gate.

---

## Part 6 — Naming & Headlines (MAGIC formula)

**Recommended offer name: "The Founding Nonprofit Setup."**
Magnetic reason-why = founding (real, finite, deadline-backed). Avatar = nonprofit. Goal = setup (you leave set up and running). Interval = the founding window to July 3. Container = "Setup" (signals low effort, fast start, and quietly answers the year-long-rollout objection). One caution: "Setup" undersells depth on its own — carry the depth in the headline.

**Recommended primary headline: "Always know where every dollar went."** _(draft copy)_
Speaks straight to the deepest fear across all three avatars. Leads with pull (confidence/cash), not the compliance moat. Six words, one idea, active voice, no fabricated absolute — "always know" is a capability claim the double-entry ledger supports.

**The recommended pairing, as it would appear** _(draft copy — pending final gate pass in on-page context):_

> # Always know where every dollar went.
>
> GrantPipe puts donors, grants, restricted funds, and its ledger in one system. Ask where a dollar went and check the answer. Keep QuickBooks as a separate workflow.
>
> **Join the Founding Nonprofit Setup.** Founding price runs 80% off your first year. It ends July 3, 2026.
>
> [Start free for one month] · no card needed

**Bench of headlines by avatar** (all ≤ 8 words, draft copy): "Walk into the board meeting ready." · "When the auditor calls, send a link." · "Every restricted dollar, tracked to its rule." (Finance) · "Keep QuickBooks separate." (Finance) · "Run every client from one screen." (Consultant) · "The AI never acts alone. You confirm." (trust-led, cross-avatar).

---

## Part 7 — Price Architecture

**Source of truth: `packages/shared/src/pricing.ts`. Do not invent prices.**

Current tiers [code, monthly / annual-equivalent]:

| Tier        | Monthly | Annual-equiv | Read                                                                  |
| ----------- | ------- | ------------ | --------------------------------------------------------------------- |
| Starter     | $49     | $39          | The floor. Fine as-is.                                                |
| Growth      | $99     | $79          | Mid.                                                                  |
| Audit-Ready | $199    | $159         | The current ceiling. **Underpriced** vs the $30K-$80K services floor. |
| Enterprise  | custom  | custom       | Multi-entity / consolidation.                                         |

**Red-team corrections applied:**

1. **Keep all four current prices.** The floor is correct for accessibility; the ceiling is the one with room.
2. **Re-anchor against the $30K–$80K/yr assembled-stack-plus-consultant floor** [planning estimate], **not** against "$299 Instrumentl." The whole premium argument dies if we anchor to a single cheaper point tool.
3. **Do NOT ship new tiers or SKUs built on ⬜ roadmap features.** The proposed "Compliance Command" (~$1,995/mo) tier and "Federal Edition" SKU depend on the SEFA Tripwire and UG Guardrails, which are ⬜/🟡. **Hold them until the features ship.** Selling a tier on an unbuilt feature is the lie this whole document exists to prevent.
4. **Resolve the double-sold setup.** Founder-led setup is currently both a tier inclusion (Audit-Ready) and a candidate paid SKU. Pick one: keep it as the Audit-Ready inclusion and the annual-plan bonus. Do not also sell it as a standalone "First-Close Setup $2,500" line while it's bundled — that reads as double-dipping.
5. **Annual is the default billing cycle** [code: `DEFAULT_BILLING_CYCLE = "annual"`]. Annual is shown as a monthly-equivalent price billed annually and saves 20%.
6. **Renewal clarity at the point of decision** - annual prices bill at $468/$948/$1,908 per year and monthly list prices are $49/$99/$199 per month. For a trust-sensitive buyer this _increases_ conversion and prevents surprise-renewal churn.

**The ceiling move (when the features are real):** the path to a premium tier above Audit-Ready runs through the ⬜ Federal/compliance builds (SEFA Tripwire, UG Guardrails, Audit-Readiness Score). That tier can price on **downside-avoidance** — the fear-priced category — and still sit below half a fractional-CFO line. **Ship the features, then ship the tier.**

---

## Part 8 — The Value Roadmap (offer claims → builds → status)

The bridge from offer copy to product reality. **Roadmap is not offer.** These items unlock _future_ claims; none may appear in buyer-facing copy until they flip to ✅.

**Group 1 — make the offer real now (mostly copy/UX on shipped capabilities; do before raising any price):**

- ⬜ **Data Migration Studio** (M–L) — _the keystone._ Unlocks "live in your first session, no consultant."
- ✅ Restriction Auto-Classifier gift-entry surface (S–M) — "audit-clean from the first gift."
- ✅ Ask-Your-Ledger drill-down + command bar (M) — "ask any dollar, click to the proof."
- ✅ Donor Lapse surface + marketing (S) — "we tell you a donor's slipping while it's warm."
- ✅ Name + stack the existing guarantees (S, copy only) — the field has zero.

**Group 2 — next 90 days (premium-justifying):**

- ⬜ Overspend/Underspend Sentinel (M) — "flagged 30 days before close." The daily-use retention driver (`budget-sentinel.ts` exists).
- 🟡 Board Packet Composer (M) — "board-ready in 10 minutes."
- ⬜ Reimbursement Cash-Flow Radar (M) — "know what to draw down, and when." Pull claim, unique to the schema.
- 🟡→⬜ Audit-Readiness Score + one-click binder (M) — the visible proof artifact.
- 🟡 Pledge Tracker + ASC 958-605 PV discounting (M–L) — "the entry your CPA won't flag."

**Group 3 — the moat (no competitor matches overnight):**

- ⬜ SEFA Builder + single-audit tripwire / Federal Edition (M) — live counter to the $1M threshold. Anchors the future premium tier.
- 🟡 Uniform Guidance cost-rule guardrails at expense entry (S–M) — "catches the disallowed cost before the auditor." Honest-fact guardrails binding: 15% de minimis is **elective**, MTDC subaward cap **$50K**, equipment floor **$10K**.
- 🟡 Anomaly/misallocation detector (M).
- ⬜ Multi-entity / fiscal-sponsor consolidation (L) — _validate ICP demand before any schema work._

**The honesty contract:** every claim in this roadmap clears the copy gate before any user sees it, and every regulatory number matches the Verified Facts table ($1M single-audit / 15% elective de minimis / $50K MTDC cap / $10K equipment).

---

## Part 9 — The execution sequence (what to actually do)

1. **Ship Group 1 copy/UX first.** Four of five items are surface work on already-built capabilities. This makes _today's_ prices honest and the next raise defensible — before touching a single number.
2. **Build the Migration Studio.** It is the keystone: it converts the avatar's deepest scar into the strongest keepable guarantee. Until it ships, gate the "live in a session / no consultant" line.
3. **Name and publish the guarantee suite.** Zero build, uncontested differentiation, biggest belief-per-dollar move on the board.
4. **Wire scarcity/urgency to code, not prose.** Counters from live redemption data; deadline from `LAUNCH_PROMO_DEADLINE_ISO`; test that everything self-reverts after July 3.
5. **Hold the new premium tier and SKUs until their features are ✅.** Then price the ceiling on downside-avoidance against the $30K–$80K floor.
6. **Run every buyer-facing line through the gate** (`humanizer` → `third-grade-copy` → zero-lies → fits-the-whole-place) in final on-page context before deploy.

---

## Appendix — Provenance

The full per-discipline research (avatar dossier, Hormozi engine, competitor analysis, value inventory, pricing economics, value stack, guarantees, scarcity engine, naming, roadmap, price architecture, and the adversarial red-team) lives under `docs/offers/_research/`. This master document is the synthesis with all red-team corrections applied. The buyer-facing offer copy that already passed the gates lives in `docs/offers/founder-setup-offer.md`.

**The single sharpest line to build the whole offer around** remains the product's own gate-cleared copy:

> _"You are the one who answers… That is the real fear. Not the price."_

Every element above is, ultimately, a way to make that answer always available — and provable.
