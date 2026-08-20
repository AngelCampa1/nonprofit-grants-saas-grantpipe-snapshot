I have everything I need. All load-bearing claims are verified against code. Here is the adversarial red-team.

---

# ADVERSARIAL RED-TEAM — GrantPipe Productization System

Verified against code before writing. Key confirmations: prices in `pricing.ts` match the current catalog exactly (Starter $49 monthly / $39 annual-equivalent, Growth $99 monthly / $79 annual-equivalent, Audit-Ready $199 monthly / $159 annual-equivalent, with annual totals of $468, $948, and $1,908) [code]. `getEffectivePlanTier` uses the selected plan tier, and legacy or missing-plan trials fall back to `TRIAL_EFFECTIVE_PLAN_TIER` = `starter` [code: pricing.ts]. Enterprise-only capabilities stay behind a founder-contact upgrade. `hasGuidedOnboarding` is `true` only on `audit_ready`/`enterprise` [code: pricing.test.ts:101-103]. The high-ticket SKU price ($2,500/$3,500) exists **nowhere** in code [verified: grep returned only city-page nonprofit counts]. Existing guarantee copy in code says "first **month**," not "first paid month" [code: `GRANTPIPE_GUARANTEE_COPY`].

---

## BLOCKERS

### BL-1 — The First-Close Guarantee promises "until done," which a 4-slot-capacity solo founder cannot keep

**What's wrong:** The high-ticket offer's buyer-facing guarantee reads: _"we schedule a second session free, and we keep going until they are done."_ The internal terms section then contradicts this, capping remedy at "one additional 60-minute session." A burned, compliance-minded buyer reads the headline, not the internal terms. "Keep going until done" is an unbounded labor promise. At 4 sessions/month hard ceiling, even a 10% guarantee-trigger rate at scale eats the capacity that the _paid_ sessions depend on — the remedy sessions compete with revenue sessions for the same 10 hours. The guarantee can structurally consume the product.
**Fix:** Strike "keep going until they are done" from all buyer-facing copy. Use only the bounded version that already exists in the shipped offer doc: _"If we do not, your first paid month is free."_ (That doc already resolved this correctly — the high-ticket redesign reintroduced the unbounded language.) Pick ONE remedy — month free OR one extra session — never both, never "until done."

### BL-2 — Two guarantees contradict each other on the SAME deliverable

**What's wrong:** The shipped `founder-setup-offer.md` guarantee remedy is _"your first paid month is free"_ (a refund-equivalent). The high-ticket redesign's remedy is _"a second 60-minute session free… NOT a refund of the session fee."_ These are two different promises for the same setup session, live in two different docs. Whichever ships second silently breaks the buyer who read the first. This is also a literal re-creation of the double-sold problem in guarantee form.
**Fix:** The shipped offer doc is the source of truth (it cleared the copy gate). The high-ticket redesign must adopt its remedy verbatim or be discarded. Do not ship two guarantee remedies.

### BL-3 — The $3,500 price is invented, undermines the system's own "zero fabricated numbers" rule, and isn't in code

**What's wrong:** The high-ticket doc raises the SKU from $2,500 to $3,500 purely to make the per-month contribution math ($14k vs $10k) look better — explicitly a producer-side rationalization, not a buyer-value derivation. The whole system's binding rule is "every dollar figure tagged [code] and no invented numbers." A SKU price is a buyer-facing number. It is tagged [planning estimate] but the surfaces (pricing tier page, checkout, crossed-out "~~$3,500~~") present it as a real, anchorable price. Worse: the brief itself says Audit-Ready is "judged UNDERPRICED." Bolting a $3,500 one-time fee onto an underpriced anchor, then _gifting_ it, just re-prices the subscription opaquely instead of fixing the actual list price.
**Fix:** Either (a) don't ship a separate SKU at all — keep founder setup as the existing `hasGuidedOnboarding` tier inclusion and instead **raise Audit-Ready's list price** (the honest fix for "underpriced"), or (b) if a SKU ships, formalize the price in `pricing.ts` as a real constant and derive it from one defensible anchor (one fractional-controller month), not from founder-revenue targets. Do not show a crossed-out price for a number that never existed as a real sale.

### BL-4 — "Gifted on annual" is a discount wearing a costume — and the brief forbids discounting

**What's wrong:** The hard constraint is "DO NOT compete on price, no discounting as a strategy." The "gifted-on-annual" model gives a claimed $3,500 of value free to annual buyers and charges monthly buyers full price for the same thing. That is a quantified annual-vs-monthly price incentive of $3,500 — a larger discount-equivalent than most SaaS annual discounts. Presenting "~~$3,500~~ included" at checkout is textbook anchor-and-discount. The system flagged price-cutting as forbidden, then built a $3,500 price cut into the flagship offer.
**Fix:** If founder setup is included on annual tiers, present it as a **tier benefit** ("Audit-Ready annual includes founder setup"), never with a struck-through dollar value. The moment a crossed-out number appears, it is discounting. Remove the dollar tag from the gift entirely.

---

## MAJOR

### MA-1 — Trial activation funnel assumes "trialing" unlocks the trial tier, but the code requires `trialEndsAt` to be set

**What's wrong:** Multiple docs used to overpromise trial tier access as a clean ✅. That is wrong now: the trial uses the selected plan tier, and legacy or missing-plan trials fall back to Starter [code: pricing.ts]. If any signup path creates a trialing user without saving the selected `planTier`, that user gets Starter access. Every trial-activation email has to match the plan the buyer picked.
**Fix:** Before shipping any "Audit-Ready during trial" copy, verify the signup handler always sets `trialEndsAt`. Add a test asserting the trial-creation path stamps it. This is a one-line verification that gates the truth of ~9 emails. Also confirm no email or page claims the trial unlocks Enterprise-only capabilities.

### MA-2 — Capacity math doesn't close once the funnel works

**What's wrong:** The acquisition engine is designed to drive _volume_ (117 magnets, YouTube, LinkedIn daily, nurture → plain-text founder email → setup-call offer). The warm-outreach motion routes every qualified MOFU/BOFU lead to a "plain-text email from Angel personally" then a 1:1 conversation then a setup call. Simultaneously the founder is: producing 3 new YouTube videos, a 6-10 min builder demo, auditing the LinkedIn queue, writing 40 nurture-email variants, running ≤4 setup sessions/month, AND building 5 net-new email sequences + the Rung-2 course + SKU checkout code. This is not one person's month. It's a 4-person team's quarter. The "producible by ONE person" constraint is violated in aggregate even though each _item_ is individually small.
**Fix:** Sequence brutally. The plain-text founder email cannot scale past ~20-30 replies/week before it eats all session capacity. Cap the warm-outreach motion to ONE asset family at a time. Pick a single build per week. The system needs a WIP limit, not a backlog.

### MA-3 — Premium price vs the $30-80K anchor is not yet justified at Starter/Growth

**What's wrong:** The $30,000-$80,000/yr assembled-stack-plus-consultant anchor is honest **only for the Audit-Ready buyer who actually has a fractional controller**. The Starter buyer is explicitly defined as "sub-$500K federal, not facing an audit, getting out of spreadsheets." That buyer does NOT pay $30-80K today - she pays maybe $135/mo for a CRM + $35 QuickBooks, no consultant. Using the $30-80K anchor anywhere near Starter ($49/mo) is a fabricated comparison for that avatar, and a compliance-minded buyer will catch it. The Rung-4a "value anchor" section even sums Bloomerang + Instrumentl + QBO directionally - the exact stack-summing trick the system forbids elsewhere.
**Fix:** Restrict the $30-80K anchor to Audit-Ready surfaces only. For Starter, anchor against "the spreadsheet that breaks at year-end and the Friday afternoons you lose," not a consultant the buyer doesn't employ. Do not let any tier below Audit-Ready touch the $30-80K number.

### MA-4 — The $30-80K anchor itself is [planning estimate] and never verified — but appears as a load-bearing fact across 6 documents

**What's wrong:** Every document leans on $30,000-$80,000/yr, always tagged [planning estimate — verify before publishing], and it is **never verified**. It's the single most-repeated number in the entire system and it's a guess. If it's wrong on the high side (likely for a $500K-budget org), the premium positioning's only honest anchor collapses, and a CFO-brain buyer who prices her own stack at $12K/yr now distrusts everything.
**Fix:** Before ANY surface ships with this number, do the real bottoms-up: actual Bloomerang/Instrumentl/QBO list prices [external, re-confirm] + a defensible fractional-controller hours estimate for THIS org size. Publish a range you can defend line-by-line, or don't publish a number — say "what the assembled alternative costs" qualitatively.

### MA-5 — Sequence 1 plain-text founder email has no unsubscribe/CAN-SPAM footer "beyond bare legal minimum" — risky as written

**What's wrong:** The email package specifies the Day-10 founder email as "plain text only (no… unsubscribe footer beyond the bare legal minimum)" sent from a personal-looking address. Marketing/commercial email in the US still requires a functioning unsubscribe and physical postal address under CAN-SPAM, even plain-text founder notes that route to a sales conversation. "Bare legal minimum" is doing a lot of undefined work. A compliance-minded _recipient_ (the literal avatar) noticing a missing unsubscribe is a trust kill.
**Fix:** Define "bare legal minimum" explicitly: working unsubscribe + postal address, every send, no exceptions. Confirm the sequencer attaches them even to plain-text steps.

---

## MINOR

### MI-1 — "fractional controller" / fractional-CFO benchmarks risk implying sector experience

**What's wrong:** Several anchors cite "k38 Consulting benchmark" and fractional-CFO rates as if sourced. The founder constraint is "never claim nonprofit-sector experience" and "no fabricated proof." Citing a named consultancy benchmark you haven't verified is borrowed authority that reads as sector expertise.
**Fix:** Either cite a real, linkable source for the fractional-CFO range or frame it as "publicly advertised rates I found," not a benchmark you own.

### MI-2 — Copy-gate sequencing gap: 40 nurture variants + 21 sequence emails marked "draft copy" with no gate-pass plan

**What's wrong:** The system correctly marks everything "draft copy" but the build-priority lists schedule _writing_ the emails without scheduling the mandatory humanizer → third-grade-copy → zero-lies → fits-the-whole-place pass. At ~60 email bodies, the gate is a real time cost that's invisible in the plan.
**Fix:** Add the copy-gate pass as an explicit line item per sequence in the build order. It is not free.

### MI-3 — "990 export templates" and "Confirmed-Number Promise" naming may over-imply

**What's wrong:** "Confirmed-Number Promise" guarantees "you always see where the number came from" (traceability) — fine. But adjacent copy says "Trust through precision… Numbers are exact." Pairing a traceability promise with "numbers are exact" risks the buyer hearing "correctness guarantee," which the anti-guarantee explicitly disclaims.
**Fix:** Keep traceability and correctness rigorously separate in copy. The promise is "you can see the source," never "the number is right."

### MI-4 — Scarcity counter spec is honest but the ≤3 trigger needs a real data source confirmed

**What's wrong:** "Show slot counter only when ≤3 and wired to live booking data" is the right rule. But Cal.com availability ≠ a clean "slots remaining this month" integer without a real query. If it's hand-approximated, it becomes the fake counter the system forbids.
**Fix:** Confirm a real Cal.com API query backs the count before any counter renders. Until then, show only "limited slots / next available month" — never a number.

---

## Double-sold setup: PARTIALLY RESOLVED, then RE-BROKEN

The high-ticket doc's "gifted-on-annual, visible price" model **does** resolve the original ambiguity (same time sold as both free inclusion and $2,500 add-on). But it resolves it by introducing BL-3 (invented price) and BL-4 (the gift is a disguised discount), and it contradicts the already-shipped offer doc's guarantee (BL-2). Net: the _structural_ double-sell is fixed; the _pricing-integrity_ problem it created is worse than what it replaced. The cleanest resolution is the simplest: keep setup as a tier inclusion (as code already models via `hasGuidedOnboarding`), raise the Audit-Ready list price if it's underpriced, and never attach a standalone dollar figure to founder time.

---

## PRIORITIZED FIX-BEFORE-LAUNCH LIST

1. **BL-1 / BL-2** — Kill "until done" and unify on the single shipped guarantee remedy ("first paid month free"). One guarantee, bounded, matching the doc that already cleared the gate. _(Highest risk: unkeepable promise + contradiction.)_
2. **BL-3 / BL-4** — Drop the invented $3,500 SKU and the crossed-out "gift" framing. Decide: tier-inclusion + raise Audit-Ready list price, OR a real `pricing.ts` constant with a defensible anchor. No struck-through phantom prices.
3. **MA-4** — Verify the $30-80K anchor with a real bottoms-up before it touches any surface. It's the system's only premium anchor and it's currently a guess.
4. **MA-1** — Confirm signup always sets `trialEndsAt`; add a test. Gates the truth of every "Audit-Ready trial" email, and confirm none claim Enterprise-only capabilities.
5. **MA-3** — Quarantine the $30-80K anchor to Audit-Ready only; re-anchor Starter against time/spreadsheet pain.
6. **MA-2** — Impose a WIP limit on the founder's build + outreach load; cap the plain-text email motion to one asset family.
7. **MA-5 / MI-1 / MI-2** — CAN-SPAM footer on plain-text sends; source or reframe the consultant benchmarks; schedule the copy-gate pass as real work.

## THE SINGLE HIGHEST-LEVERAGE MOVE FIRST

**Verify the $30,000-$80,000/yr anchor with a real, line-by-line bottoms-up estimate - before anything else ships.** Every premium claim, every "what the alternative costs" line, every objection-1 rebuttal, the entire no-discount/value-anchor strategy, and the justification for an underpriced-but-still-$1,908 Audit-Ready tier all rest on this one number. If it's a guess at launch, the most sophisticated, most skeptical buyer in the funnel - the compliance-minded Finance Director the product is built for - prices her own stack, sees the gap, and concludes the premium software is inflating numbers like the last vendor that burned her. That single unverified number is load-bearing for the whole system, and it is the one thing currently held up by [planning estimate] tape.
