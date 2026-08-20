Now I have the verified mechanics. Key facts confirmed:

- **Two promo codes**: M80OFF (monthly, cap 100) + Y80OFF (annual, cap 200) = **300 total redemptions**, not 100.
- **Deadline**: `2026-07-04T06:59:59Z` = end of **July 3, 2026** Pacific time. Reverts to full price automatically (`getActivePromo` returns null after window).
- Both at 80% off.

Here is the complete design.

---

# GrantPipe Scarcity + Urgency Engine

**Honest pressure for a buyer who distrusts pressure.** Every lever below maps to a real constraint already in the code (`packages/shared/src/promos.ts`) or a real external clock. Nothing here invents a number. The whole design is built around one fact about the avatar: they were _burned once already_, so a single fake countdown costs you more trust than it buys urgency. The rule-set in Section 5 is not a footnote — it is the product.

---

## 0. The avatar truth that governs every lever

The buyer is an Executive / Development Director whose deepest fear is **personal accountability with their name on it** — "I answer when the auditor calls, when the board asks where a dollar went, when a deadline slips." They are risk-averse, not price-sensitive.

That changes how scarcity works here. For most SaaS, urgency exploits FOMO (fear of missing a deal). For this avatar, **the most powerful urgency is the urgency they already feel** — the grant deadline, the fiscal year-end, the audit, the tool that just got shut off under them. The engine's job is not to manufacture pressure. It is to **stand next to the pressure the avatar already lives in and offer relief before the clock runs out.**

So the engine has two distinct lever classes:

| Class                      | Source of the clock                                  | Emotional job                                         |
| -------------------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| **Internal (offer-side)**  | Founder capacity + founding-cohort price deadline    | "Act now to get a better deal / a real human's help"  |
| **External (avatar-side)** | Grant deadlines, fiscal/audit cycle, GrantHub sunset | "Act now because your own calendar is already moving" |

The external levers are the ones that actually move a risk-averse buyer. Lead with those. The internal price deadline is the closer, not the opener.

---

## 1. SCARCITY LEVER A — Founder-Led Setup Slots (supply scarcity)

### The real constraint

Founder-led guided setup ships on Audit-Ready and Enterprise. One person — Angel — runs them. That is a genuine, physical supply limit: a solo founder can only personally onboard so many orgs in a month. This is the _most honest scarcity GrantPipe has_, because it is literally true and self-evidently true (the buyer already knows a one-person company can't do twenty white-glove setups a week).

### Concrete mechanics

1. **Set a real monthly capacity number and track it.** Pick a number Angel can actually deliver — e.g. **4 guided setups per month** (one a week is honest for a solo founder also building the product). Store it as config, not hardcoded prose:
   ```
   FOUNDER_SETUP_SLOTS_PER_MONTH = 4
   ```
2. **Count real bookings.** A guided-setup booking writes a row. The "slots remaining this month" number is `capacity − booked_this_month`, computed live. Never a hand-typed number on a page.
3. **Degrade gracefully when full.** When the month is full, the page does **not** say "0 left, you're locked out." It says the next available month and lets them hold a spot. Scarcity that punishes the buyer breaks trust; scarcity that _schedules_ them keeps it.
4. **Show the number only when it's low and true.** Display the counter only when `remaining ≤ 3`. If 4 of 4 are open, showing "4 left" reads as desperate and undersells. Reveal scarcity only when scarcity is real.
5. **Kill switch.** A single config flag hides every slot-counter surface instantly if Angel's capacity changes. (Same pattern the promo engine already uses with `getActivePromo` returning null.)

### Exact copy lines

> **Eyebrow:** Founder-led setup
> **Headline:** I set this up with you myself.
> **Body:** Guided setup is a call with me, the person who built GrantPipe — not a consultant, not a chatbot. I can only run a few each month, so spots are limited.
> **Live counter (only when ≤ 3):** **2 setup spots left this month.**
> **When full:** This month is booked. Hold a spot for [Month] — I'll set up your grants with you then.

Honest-builder voice, matching the existing offer doc. No "ACT NOW." The scarcity is stated as a plain fact about a one-person company.

### Psychology tie to the avatar

The avatar's last system _needed a consultant and still failed them_. "A real person, the builder, sets it up with you" attacks that scar directly — and the scarcity makes the help feel valuable rather than desperate. A risk-averse buyer reads "limited slots run by the founder" as **proof the help is real**, not as a sales tactic. It raises Perceived Likelihood (the binding constraint from the Hormozi analysis) while the limit does the urgency work — without a single fake number.

---

## 2. SCARCITY LEVER B — Founding-Cohort Membership (membership scarcity)

### The real constraint

The promo codes have **hard redemption caps in code**: `M80OFF` = 100 monthly redemptions, `Y80OFF` = 200 annual redemptions. That is **up to ~300 founding members total**, not 100. This is the single most important reconciliation in this whole task: **do not say "Founding 100."** The code does not back it.

### Concrete mechanics

1. **Anchor the cohort to the real cap.** The honest framing is **"the first 300 nonprofits"** (100 monthly + 200 annual seats), OR — cleaner and safer — drop the integer entirely and use **"the founding cohort"** with the _deadline_ as the boundary, not a seat count. The deadline (July 3) is unambiguous and code-enforced; the seat math (two pools, two caps) is easy to misstate. **Recommended: lead with the deadline, treat the seat cap as a secondary, only-when-true limiter.**
2. **If you show a seat count, compute it from real redemptions.** `pickActiveLaunchPhase` already reads `redemptionsByCode`. A "seats left" number must be `(100 − M80OFF_redeemed) + (200 − Y80OFF_redeemed)` pulled live from Stripe redemption data — never a static "97 left" that doesn't move.
3. **Founding member = a real, permanent status, or don't call it one.** Only use "founding member" language if founding members actually keep something after July 3 (locked rate for a defined term, a badge, early access, direct founder line). If the only thing they get is the discount, call it "the founding offer," not "founding membership." Don't imply permanence the system doesn't deliver.
4. **Two-pool honesty.** Because monthly and annual are separate caps, never show one blended "spots left" bar that implies a single pool. If you surface counts, the annual pool (200) is the bigger, longer-value one — steer there, which also aligns with the "annual as default" pricing recommendation.

### Exact copy lines

> **Badge (already in code):** 80% off first year
> **Headline:** Be a founding GrantPipe nonprofit.
> **Body:** The first nonprofits to join lock in 80% off their first year. This is the founding price. It ends July 3, then it's gone.
> **If showing real seat count (annual pool):** Founding annual seats are limited. [N] left.
> **Safe version with no integer:** Founding pricing is open until July 3, 2026.

### Psychology tie to the avatar

"Founding member" appeals to the avatar's desire for **status and control** — they're early to something, not a late follower cleaning up a failed rollout. But this avatar punishes hype. The safest, strongest move is to let the **deadline carry the urgency** and let membership carry the **identity** ("you were one of the first to back this"). Keep the seat-count claim out unless it's wired to live redemption data, because a stalled counter is the exact "cheap software lying to me" signal that makes a burned buyer bounce.

---

## 3. URGENCY LEVER A — The Founding Price Deadline (internal, time-bound)

### The real constraint

`LAUNCH_PROMO_DEADLINE_ISO = "2026-07-04T06:59:59.000Z"` = **end of Friday, July 3, 2026, Pacific.** After that, `getActivePromo()` returns `null` and pricing reverts to full automatically. This is the cleanest urgency lever GrantPipe has: it is real, code-enforced, and self-reverting. You cannot accidentally lie about it because the system makes it true.

### Concrete mechanics

1. **Single source of truth.** Every deadline surface — banner, pricing page, checkout, emails — reads `getPromoDeadlineLabel()` / `LAUNCH_PROMO_DEADLINE_ISO`. No hand-typed dates anywhere. (Memory already notes the static site needs a redeploy to drop the promo — fold that into the deploy checklist so the site can't show a dead promo after July 3.)
2. **Countdown is allowed because it's real — but show days, not fake seconds.** A ticking second-by-second timer reads as manipulative to this avatar. Show **"Founding pricing ends in 9 days"** computed from the real ISO date. Drop to "ends Friday" / "ends today" in the final week. The clock is honest, so it can be shown; the _style_ should stay calm, matching the brand's "source of calm" principle.
3. **Auto-death, verified.** Build a test (the repo already has `audit-threshold-amount.test.ts`-style sweeps) asserting that for `now > deadline`, every promo surface renders the full price and zero countdown. Urgency that doesn't clean itself up becomes a lie the next day.
4. **Renewal clarity at the point of decision.** Next to the discounted price, always state what renews: "80% off your first year. Renews at the regular price after." Honesty here _increases_ conversion for a trust-sensitive buyer and protects against chargebacks/churn-rage.

### Exact copy lines

> **Banner (calm, day-based):** Founding pricing — 80% off your first year — ends Friday, July 3.
> **Final week:** Founding pricing ends in 3 days. After that it's the regular price.
> **Checkout reassurance:** You're getting 80% off your first year. It renews at the regular price — no surprise, no auto-jump mid-term.
> **After deadline (auto):** [no promo shown — full price only]

### Psychology tie to the avatar

A real, fixed deadline gives a chronically-deferring, time-poor buyer **permission to act now** without feeling pressured — "the price genuinely changes Friday" is a fact, not a tactic. Because it self-reverts, it never becomes the recurring fake "sale ends today (every day)" that this avatar has learned to ignore. The renewal-clarity line is itself a trust lever: it tells the buyer you won't be the vendor that surprises them — which is the whole emotional sale.

---

## 4. URGENCY LEVER B — External Cycle Triggers (the avatar's own clock)

This is the highest-leverage and most under-used lever. The avatar already lives under three external deadlines GrantPipe does not control and therefore cannot fake.

### 4a. Grant deadlines & spend-down clocks

**The constraint:** Every active grant has report dates and spend-down windows. The product _already_ tracks and emails alerts on these.
**Mechanic:** In-product, urgency is the deadline itself — "Report due in 12 days." For marketing, the urgency is generic-but-true: "A missed grant report is the single most common audit finding." (Cited, real.)

> **Copy:** The deadline doesn't wait for your spreadsheet. GrantPipe watches every grant report and spend-down date and emails you before it slips.

### 4b. Fiscal year-end & audit season

**The constraint:** Most nonprofits run on a June 30 or Dec 31 fiscal year; audit prep follows. These dates are externally fixed.
**Mechanic:** Seasonal campaign timing, not a fake countdown. Run the audit-readiness message _into_ the months before common fiscal year-ends. The single-audit threshold ($1,000,000 federal expended, 2 CFR 200.501) is the real tripwire — only invoke it for orgs near it; most aren't subject, so don't imply they are.

> **Copy:** Your fiscal year ends whether your funds reconcile or not. Get audit-ready before the close — not the weekend the auditor calls.

### 4c. GrantHub sunset — the displacement window

**The constraint:** Foundant sunset GrantHub / GrantHub Pro on **January 31, 2026.** That is a real, dated, externally-imposed migration moment for a specific cohort. _(Note: today's date in context is 2026-06-23 — this sunset has already passed, so frame it as "your tool already went away," not "is going away." Verify current status before publishing.)_
**Mechanic:** A targeted landing surface for displaced GrantHub users, not a sitewide banner. Pair it with founder-led migration help (ties to Scarcity Lever A).

> **Copy (post-sunset framing):** GrantHub is gone. Move your grant pipeline somewhere built to keep it — and the compliance and the books with it. I'll help you make the move myself.

### Psychology tie to the avatar

These work because **the avatar cannot accuse you of inventing the deadline** — it's on their own calendar or in their own inbox. For a buyer whose entire fear is "a deadline slips and I answer for it," the most persuasive urgency is _naming the deadline they're already afraid of and offering to watch it for them._ This is urgency as relief, not pressure — exactly the "confidence and control" emotional goal.

---

## 5. THE RULE-SET — Keeping It True (the non-negotiable core)

These are binding. A scarcity/urgency engine that drifts from truth is worse than none for this avatar.

| #       | Rule                                                                                                                                                                  | Why                                                                                                                           | Enforcement                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **R1**  | **Every number traces to code or a live count.** No hand-typed "97 seats left," no static countdown.                                                                  | A stalled counter is the #1 "cheap software is lying to me" tell.                                                             | Counters read from `redemptionsByCode` / booking rows; date from `LAUNCH_PROMO_DEADLINE_ISO`. |
| **R2**  | **Never claim "Founding 100."** Caps are 100 monthly + 200 annual = up to ~300. Use "founding cohort" + the deadline, or compute a real two-pool count.               | The caps in `promos.ts` don't back a 100-seat claim.                                                                          | Add a test asserting no surface renders a seat-count smaller than the live remaining total.   |
| **R3**  | **Deadlines self-revert and are tested.** After July 3, every surface shows full price, zero countdown — automatically.                                               | Urgency that outlives its deadline becomes a standing lie.                                                                    | `getActivePromo()` null-path test; site redeploy is on the deploy checklist.                  |
| **R4**  | **Scarcity reveals only when real.** Show slot/seat counters only when genuinely low (`≤3`). Hide otherwise.                                                          | "8 left" on day one undersells; "2 left" forever is fake.                                                                     | Conditional render gated on the live remaining value.                                         |
| **R5**  | **No fake ticking seconds.** Day-granularity countdowns only.                                                                                                         | Second-timers read as manipulative; brand voice is "calm."                                                                    | Design token: countdown displays days/“today,” never HH:MM:SS.                                |
| **R6**  | **External deadlines must be the buyer's real ones.** Don't impose the single-audit threshold on orgs not subject to it; don't say a fiscal date applies to everyone. | Most $500K–$10M orgs aren't subject to a single audit. Overclaiming kills credibility.                                        | Segment audit-threshold messaging; never sitewide.                                            |
| **R7**  | **Renewal terms always sit next to the discounted price.**                                                                                                            | Trust-sensitive buyer; prevents surprise-renewal churn/chargebacks.                                                           | Checkout + pricing copy includes the renews-at-regular line.                                  |
| **R8**  | **Graceful, not punishing.** "Full" routes to a held spot / next month, never a dead end.                                                                             | Scarcity that blocks the buyer breaks the relationship.                                                                       | When-full state schedules rather than refuses.                                                |
| **R9**  | **One kill switch per lever.** Any lever can be disabled instantly if reality changes.                                                                                | Reality (Angel's capacity, cap status) can shift; copy must follow within minutes.                                            | Config flags, same pattern as `getActivePromo`.                                               |
| **R10** | **All public copy passes `humanizer` → `third-grade-copy` → zero-lies check.**                                                                                        | Repo-mandated for all marketing copy; the deadline/seat claims are exactly the kind that must be fact-checked against source. | CLAUDE.md gate before publish.                                                                |

---

## 6. Sequencing — how the levers fire together

Order matters. Lead with the avatar's own clock (believable), close with the offer deadline (sweetener).

1. **Open with external pull (4a/4b/4c):** the deadline they already feel — grant report, fiscal close, the tool that vanished.
2. **Differentiate with the moat:** one ledger, audit-ready, no consultant.
3. **Raise belief with founder-led setup scarcity (Lever A):** a real person, the builder, limited slots — the help is scarce _because_ it's real.
4. **Close with the founding price deadline (Urgency A) + cohort identity (Scarcity B):** 80% off your first year, ends July 3, you're one of the first to back it.

This sequence puts the _honest, external_ urgency first and the _offer-side_ urgency last — the opposite of typical SaaS, and exactly right for a buyer who bounces off hype but acts on their own calendar.

---

## Key reconciliations made (so downstream copy doesn't break a rule)

- **Seat cap is ~300, not 100** (M80OFF 100 + Y80OFF 200). "Founding 100" is forbidden. Source: `packages/shared/src/promos.ts` lines 50, 62, 104.
- **Deadline is end of July 3, 2026 Pacific** (`2026-07-04T06:59:59Z`), auto-reverting via `getActivePromo()` → null. Source: lines 86, 127–129.
- **GrantHub sunset (Jan 31, 2026) is already past** as of the 2026-06-23 context date — frame as "already gone," verify before publishing.
- **Founder-setup scarcity is the only fully physical, self-evident limit** — lean on it hardest for the belief lift the Hormozi analysis flagged as the binding constraint.
- Relevant file for any implementation: `packages\shared\src\promos.ts` (promo caps, deadline, window logic, kill-switch pattern).
