Now I have the complete picture. Here is the sign-up → pay conversion mechanics document.

---

# GrantPipe — Sign-Up → Pay Conversion Mechanics (Post-Promo, Full Price, Premium)

All product claims tagged ✅/🟡/⬜. All dollar figures tagged [code]/[external]/[planning estimate]. Lines marked "draft copy" must clear humanizer → third-grade-copy → zero-lies → fits-the-whole-place before any buyer-facing use.

---

## (a) Signup CTA Architecture — The Low-Friction Yes

### The binding principle

The signup CTA is not a purchase decision. It is a permission slip to see the product. Every word, every friction point, and every objection it raises must be evaluated against that standard alone. The purchase decision happens at day 25, not at the signup button.

### What already exists [code]

- Free trial on every plan: `UNIVERSAL_PLAN_INCLUSIONS` — "1-month free trial on every plan" ✅
- No credit card required: `UNIVERSAL_PLAN_INCLUSIONS` — "No credit card required to start" ✅
- No setup fee: `UNIVERSAL_PLAN_INCLUSIONS` — "No annual contract requirement" ✅
- Trial tier = selected-plan access: `getEffectivePlanTier` uses the plan selected at signup, and legacy or missing-plan trials fall back to `TRIAL_EFFECTIVE_PLAN_TIER` = `"starter"` ✅ (Enterprise-only capabilities stay behind a founder-contact upgrade)
- Unlimited users on every plan: `UNIVERSAL_PLAN_INCLUSIONS` ✅
- In-product onboarding after signup: `UNIVERSAL_PLAN_INCLUSIONS` ✅

The trial is structurally generous. The CTA copy is where friction lives and where the gains are.

### Current CTA language [code]

- Starter: "Start Starter"
- Growth: "Start Growth"
- Audit-Ready: "Start Audit-Ready"

These are functional but neutral. They do not acknowledge the buyer's fear or name the proof mechanism. The "Start [Tier]" label treats the CTA as a software-procurement step. It is not — it is the first step toward the board being able to answer the question.

### The correct CTA architecture (three surfaces, one message each)

**Surface 1: The primary hero CTA (homepage, landing pages)**

Every primary CTA leads to the free trial. No card. One step. The label should name the proof, not the plan tier.

Current (to evaluate): "Start your free trial" or equivalent — verify exact copy in the Astro page source against the CLAUDE.md guarantee that this goes through humanizer + third-grade-copy.

Target framing (draft copy): "See it free for a month — no card." Seven words. No software jargon. The word "see" is correct: the buyer is not committing to anything; she is looking.

Secondary option at the same button for lower-intent visitors (draft copy): "Try it free. No card, no contract."

The goal: remove the word "trial" from the primary button label if possible. "Trial" implies temporariness and suggests the default is that it will end. "Free month" implies a gift.

**Surface 2: The pricing-page tier CTAs [code: `ctaLabel`]**

The existing labels ("Start Starter", "Start Growth", "Start Audit-Ready") do functional work. They should stay tier-specific to preserve the plan differentiation signal. The upgrade is to add a sub-label under each button.

Sub-label (draft copy, under every self-serve CTA):
"Free for a month. No card."

This is not a new UI component — it is four words below the existing button. It removes the buyer's last object before clicking without requiring a redesign.

**Surface 3: The in-app trial banner (existing `TrialBanner` component)**

The current copy when trial ends: "Choose a plan to keep using GrantPipe." [code: `trial-banner.tsx` line 103]

This is accurate but cold. It frames the decision as a software-renewal task. The buyer's actual decision at this moment is whether she trusts GrantPipe with her compliance work going forward. The copy should name that.

Target framing (draft copy): "Your free month ends soon. Pick the plan that keeps your grants and funds running here."

This is a light edit to existing copy — one sentence, no structural change. It keeps the functional information while naming what she is actually deciding.

### The CTA funnel map

```
Site LP hero CTA → "See it free for a month — no card" → /signup
Pricing page tier CTA → "Start [Tier]" + sub-label "Free for a month. No card." → /signup
Email nurture Day 14 → plain-text founder email CTA → /signup
YouTube outro → builder voice: "Start for free at grantpipe.com" → /signup
```

All four routes land on the same signup flow. The offer is always identical: selected-plan access, 30 days, no card, no setup fee.

---

## (b) The Activation Aha Moment — The Specific ✅ Events and the Time-to-Value Target

### The activation hypothesis

A trial user who does not reach one specific, named aha moment before day 14 will not convert to paid. The aha moment is not "set up the org" or "complete the onboarding checklist." Those are completion steps. The aha moment is the moment the product answers a question she could not answer before, from her actual data (or from sample data close enough to feel real).

There are three aha candidates. They are not equal. They are ranked by how quickly they are reachable and how clearly they demonstrate the schema moat.

### Aha Candidate #1 — Ask-Your-Ledger first answer with drill-down (PRIMARY)

**What it is:** The user types a natural-language question about a grant or fund, receives a grounded answer ✅ with a "confirmed from your records" label, and clicks through to the source journal entries behind the answer.

**Why it is the primary aha:** This is the moat made tangible. No competitor can do this because no competitor has the unified schema. "Where did the Smith Foundation grant money go?" answered in 10 seconds with a link to the journal entries is not a feature demo — it is proof that the product understands the question the board will ask. The emotional response is not "oh, that's convenient." It is "this is how it was supposed to work all along."

**How to reach it in the sample data path:** The onboarding wizard's "Show me how it works" option seeds sample data and routes to `/funds` (for grants goal) or `/reports` (for compliance goal) [code: `ahaRouteForGoal`]. Ask-Your-Ledger lives at `/reports`. A user who selects "compliance" as their goal and chooses sample data is already on the right page. The aha banner (tracked as `onboardingAhaBannerViewed` [code: `ANALYTICS_EVENTS`]) fires on arrival. The path to Ask-Your-Ledger from `/reports` is the question input box.

**Time-to-value target:** First Ask-Your-Ledger answer generated within **8 minutes of signup**. This is achievable if the onboarding wizard completes in under 3 minutes (it is 3 steps, no friction) and the sample data is pre-loaded with a grant that has journal entries attached. The `sampleDataSeeded` event [code: `ANALYTICS_EVENTS`] fires on seed completion; the `ledgerAssistantAnswered` event [code: `ANALYTICS_EVENTS`] fires on first answer. Measure the time delta between these two events per user. Target: p50 under 8 minutes.

**Where the path breaks today:** A user who selects "grants" as their goal is routed to `/funds`, not `/reports`. Ask-Your-Ledger is at `/reports`. She needs to navigate manually. This is a routing gap: the aha route for the "grants" goal should either include a cross-link to Ask-Your-Ledger or be updated to route to `/reports` instead. The current `ahaRouteForGoal` [code: `onboarding-goal.ts` line 11-14] routes "grants" to `/funds`. Consider adding a "See what's in this fund →" link from `/funds` to the fund's Ask-Your-Ledger view, or update the aha banner copy to name the ledger question path explicitly.

### Aha Candidate #2 — First restriction auto-classified at gift entry (SECONDARY)

**What it is:** The user enters a donation with a restriction type, the Restriction Auto-Classifier ✅ assigns it to the correct net-asset class, and the restricted fund balance updates in real time.

**Why it is secondary:** It is powerful but it requires the user to have entered at least one gift and one fund, which is a higher-effort path than sample data. Best reached via import (spreadsheet with donors → classifications applied on import). `first_contact_created` [code: `ANALYTICS_EVENTS`] and `firstFundCreated` are instrumented. The window from first contact created to first restriction classification applied is the time-to-value for this path. Target: within one session (same day as signup).

**Who reaches this aha first:** The Finance/Operations Director who imports a spreadsheet on day one. She is not the buyer who chooses "Show me how it works" — she chooses "Import a spreadsheet." The classification auto-trigger is the moment she realizes the system understands restrictions, not just budgets.

### Aha Candidate #3 — AI Award Document Intake on a real award letter (TERTIARY)

**What it is:** The user uploads an actual award letter, the AI extracts budget lines, deadlines, and restriction terms ✅ with source citations, and she confirms the result in one click.

**Why it is tertiary:** It requires the user to have a real award letter accessible, which is not guaranteed in a first session. Best reached in the founder-setup call (Rung 5) where the call agenda explicitly requires "bring one real award letter." In the trial context, the sample data path includes a mock award document. The `awardIntakeCommitted` [code: `ANALYTICS_EVENTS`] event marks completion.

**Time-to-value:** If reached, it is instantaneous — the first intake result is the aha. The bottleneck is getting to the first upload. Target for users who reach the intake flow: first committed intake within 20 minutes of signup.

### The aha instrumentation that already exists [code]

- `ledgerAssistantAsked` (`ask_ledger_question_submitted`) → `ledgerAssistantAnswered` (`ask_ledger_answer_generated`) — the primary aha sequence ✅
- `awardIntakeStarted` → `awardIntakeCommitted` — the tertiary aha sequence ✅
- `activationFirstValueViewed` — fires when the first "first value" surface is reached ✅
- `activationCompleted` — marks the end of the activation window ✅
- `onboardingAhaBannerViewed` — fires when the post-onboarding aha banner renders ✅

**What is not yet instrumented:** a "first Ask-Your-Ledger answer for a user who arrived via compliance goal" funnel in PostHog. This is a cohort definition, not a new event — create a funnel from `onboarding_goal_selected {goal: 'compliance'}` → `ask_ledger_answer_generated` with a 14-day window. That funnel is the primary activation metric.

---

## (c) The Paywall / Trial-End Conversion — Objection by Objection

### The conversion moment

The trial-end conversion prompt fires at day 25 via the existing `trialEndingSoon` event [code: `ANALYTICS_EVENTS`]. The in-product surface is the `TrialUpgradeCard` component [code: `trial-upgrade-card.tsx`], which shows after onboarding is complete and activation signals are detected (`featureUsage.data?.tiersUsed.length > 0 || featureUsage.data?.highestTier !== null`). The current copy is:

"Pick the plan that fits" / "You are up and running. Choose the plan you want to keep when your trial ends."

This is honest and functional. It does not handle objections. The objections arrive here. Here is each one and the specific response.

---

### Objection 1: "The price is too high - $39-$159/mo billed annually is a lot for our budget."

**The accurate response:** The competitor is not a cheaper SaaS tool. It is the assembled stack she already pays for. The conversion moment is the only place to name this anchor explicitly, because it is the only moment where she is deciding whether to pay.

**The framing (draft copy):**
"Most teams at your stage are running a donor CRM, a grant tracker, QuickBooks, and a spreadsheet to tie them together. That stack, plus the person who reconciles it at year-end, costs $30,000 to $80,000 a year [planning estimate — verify range before publishing]. GrantPipe is one system. At $[tier annual price]/year [code], you are replacing most of that, not adding to it."

**Where this lives:** Not in the `TrialUpgradeCard` (too much text for a card). This anchor belongs on the `/settings#billing` upgrade page, between the tier comparison table and the CTA. It is one sentence with a clear citation note. It is not a comparison table with individual line items — that invites fact-checking on stale prices. It is a directional anchor framing the decision category.

**Implementation:** The `/settings#billing` page already exists (confirmed by `settings.billing.test.tsx`). Add one paragraph between the tier table and the plan selection CTA. No new component — one text block.

---

### Objection 2: "Switching cost — I already have data in QuickBooks and we can't rip that out."

**The accurate response:** GrantPipe has native accounting records, but it does not sync with QuickBooks right now. If the team still uses QuickBooks for payroll, bill pay, or legacy books, keep that workflow separate.

**The framing (draft copy):**
"GrantPipe includes native accounting records for grants, funds, journal context, and reporting. It does not sync with QuickBooks right now. If you keep QuickBooks for payroll or bill pay, treat that as a separate workflow."

**Where this lives:** On the Growth tier description and as Playbook C4 (the Accounting Handoff Playbook) linked at conversion. Do not use `hasAccountingIntegrations` as an upgrade trigger while external accounting sync is unavailable.

**Implementation:** Do not publish a QuickBooks integration paywall while external accounting sync is unavailable.

---

### Objection 3: "We use spreadsheets — they work fine and we know how they work."

**The accurate response:** The spreadsheet is not the problem. The problem is that the restriction lives in the spreadsheet while the journal entry lives in QuickBooks and the deadline lives in a calendar. At year-end (or audit) you reconstruct across three systems. The schema is the answer, not the interface.

**The framing (draft copy):**
"Spreadsheets work until the auditor asks 'show me every expense coded to the Smith Foundation grant, with the journal entries.' Then you spend three days reconstructing something that should be one screen."

**Where this lives:** In the Day 3 nurture email for the `restricted-fund-accounting` family (already named as a plan), and as a callout on the pricing page under the Starter description. In the product, it is the empty-state copy on the funds list for a new user who has not linked a grant to a fund yet.

---

### Objection 4: "I don't trust a solo vendor — what if you shut down?"

**The accurate response:** This is the right question and it deserves a direct answer, not a deflection. The honest answer is: (1) your data exports any time, no hostage-taking; (2) the platform runs on Cloudflare Workers + Neon Postgres + R2 — infrastructure the solo founder does not control or could suddenly turn off; (3) the export guarantee is not a footnote — it is named and public.

**The framing (draft copy):**
"If GrantPipe ever shuts down, your data exports completely. Not 'ask us for a CSV.' Every grant, every fund, every journal entry, every document — yours on demand, any time, from Settings. We built on infrastructure we don't operate, precisely so that 'founder disappears' is not a data-loss risk."

**Where this lives:** In the guarantee section of the pricing page (already confirmed as shipping), as the "Your Data, Always" guarantee item. The existing `GRANTPIPE_GUARANTEE_COPY` [code] covers the 30-day money-back guarantee but does not yet name the export guarantee by name. Naming it explicitly — "Your Data, Always: export everything, any time, from Settings" — closes this objection before the buyer types it into the chat.

**Note:** Do not promise continuity of service or uptime guarantees a solo founder cannot keep. The promise is exit safety, not service permanence. Those are different.

---

### The trial-end conversion surface (current vs. target)

**Current `TrialUpgradeCard` [code]:**

- Triggers: trialing + onboarding complete + activation signals present + admin role + not dismissed
- Copy: "Pick the plan that fits" / "You are up and running. Choose the plan you want to keep when your trial ends."
- CTA: "See plans" → `/settings#billing`

**Target additions (no new component required):**

1. Add the tier recommendation signal to the card: "Based on what you've used, Growth fits your team" (pull from `highestTier` already present in `featureUsage.data`). This personalizes the push toward the right tier and reduces analysis paralysis at the pricing table.

2. Add the time anchor: "Your trial ends [date]." The `daysRemaining` is already in the paywall state. Naming the specific date rather than "in N days" is more concrete and more honest. "In 6 days" is abstract; "on June 29" is a deadline.

3. Add one risk-reversal line: "30-day refund if it's not the right fit." [code: `GRANTPIPE_GUARANTEE_COPY`] One sentence. It is already a published guarantee. Saying it at the conversion moment reduces the perceived cost of the yes.

These three additions require editing the `TrialUpgradeCard` text only — the layout, conditions, and analytics firing are correct.

---

## (d) Guarantees + Founder-Led Setup as the Risk-Reversal Close

### Why the guarantee suite is the conversion mechanism, not the bonus list

The buyer at the trial-end decision is not weighing features. She already knows the features — she spent 30 days using them. She is weighing risk. Specifically: "Am I going to be in a worse position than I am now if I pay and it doesn't work out?"

The guarantee suite removes every version of that risk. This is why zero competitors publish guarantees — they are not confident enough in the product to make the promise. GrantPipe is. The anti-guarantee is the most credible move in the category because it is the one thing no one else will say.

### The guarantee suite named in the conversion moment (draft copy)

List these explicitly on the `/settings#billing` upgrade page, not in a footnote:

**Free Look:** "Your first month is free. No card during the trial." ✅ (existing)

**First Month No Risk:** "If GrantPipe is not the right fit in your first paid month, contact us for a refund." ✅ [code: `GRANTPIPE_GUARANTEE_COPY`] This is already written. Name it with a heading, not just a line of text.

**Your Data, Always:** "Export everything — every grant, fund, journal entry, and document — any time, from Settings. No request required." ✅ (capability exists; copy needs naming)

**Confirmed-Number Promise:** "Every Ask-Your-Ledger answer shows you the source. You always see where the number came from." ✅ This is the product's core trust mechanism made explicit.

**The Anti-guarantee (Audit-Ready only):** "We will not promise you will pass your audit. No software can. We promise your evidence is export-ready when the auditor asks." ✅ This lives at the bottom of the Audit-Ready tier description. It is the one guarantee that converts the highest-fear buyer because it is the only honest thing in the category. Every other vendor implies their software guarantees audit success. GrantPipe refuses to make that claim and that refusal is the trust signal.

### The founder-led setup as the close

The founder setup call (`FOUNDER_BOOKING_URLS.onboardingCall` [code]) is not a bonus. It is the risk-reversal for the buyer who cannot trust that a blank account will turn into working compliance infrastructure without help.

The close moment is Audit-Ready annual checkout. Surface the setup call offer here, not as an upsell, but as a reduction of the "what if I pay and then can't get it set up" risk.

**The single sentence that does the work (draft copy):**
"Book a setup session with me. Bring one award letter. We get your first grant live in that session. If we don't, your first paid month is free."

This is the Founding Setup guarantee. It names the deliverable (one live grant), the input (one award letter), the time (one session), and the safety net (refund). Four things in four sentences. A burned buyer can rehearse this before she clicks.

**Where it surfaces:**

- On the Audit-Ready annual checkout confirmation page, below the billing summary
- In the post-signup welcome email for Audit-Ready annual subscribers
- In the Day 25 in-product upgrade prompt for trial users who have used Audit-Ready-tier features (restriction evidence, auditor portal, or advanced fund accounting)

The `TrialUpgradeCard` already filters by `highestTier` [code: `trial-upgrade-card.tsx` line 47-48]. When `highestTier === "audit_ready"`, surface the setup call offer instead of (or below) the generic "See plans" CTA.

---

## (e) The 2-3 Metrics to Instrument (PostHog)

Three metrics. Not a dashboard of forty. These three are the ones that tell you whether the conversion engine is working, lagging, or broken.

### Metric 1: Activation Rate — "% of trial signups who reach the primary aha moment within 14 days"

**Definition:** `signupCompleted` → `ask_ledger_answer_generated` within 14 days, per cohort of trial users.

**Why this one:** The aha moment is the hinge between "person who signed up" and "person who understands the value." If this rate is low, the problem is either in the onboarding path (users are not reaching Ask-Your-Ledger) or in the sample data (the questions the tool suggests do not resonate). Both are fixable. Neither is a pricing problem.

**PostHog implementation:** Create a funnel: `signup_completed` → `onboarding_completed` → `ask_ledger_answer_generated`. Add a `conversion_window_days: 14` filter. Add `goal` as a breakdown dimension (from `onboarding_goal_selected`). This tells you whether "compliance" goal users convert at a higher rate than "donors" goal users — they should, because Ask-Your-Ledger is closer to their stated first goal.

**Target baseline:** Establish the actual rate for the first 30 trial users before setting a target. Do not anchor to an industry benchmark for SaaS activation rates — this buyer is risk-averse and the activation path is longer than a consumer product. Expect 30-45% in month 1, improving toward 60%+ as the onboarding routing is tightened.

**Events already wired:** `signup_completed`, `onboarding_completed`, `ask_ledger_answer_generated` (`ledgerAssistantAnswered`) — all in `ANALYTICS_EVENTS` [code].

---

### Metric 2: Trial-to-Paid Conversion Rate — "% of trial signups who start a paid subscription within 35 days"

**Definition:** `trial_started` → `subscription_started` within 35 days (30-day trial + 5-day grace window).

**Why this one:** This is the single north-star metric for whether the trial-end conversion mechanics are working. If activation rate is good but this rate is low, the problem is in the conversion moment — the pricing page, the guarantee copy, or the tier-recommendation signal. If both are low, the problem is upstream in the aha moment.

**PostHog implementation:** Funnel: `trial_started` → `checkout_completed`. Add tier as a dimension (`plan_tier` property on `checkout_completed`). Add `highest_tier_used` as a breakdown (from `upgrade_prompt_shown.plan_tier_used` [code: `trial-upgrade-card.tsx` line 59]). This tells you whether the tier recommendation is accurate — users who converted to the tier that `highestTier` recommended vs. users who picked a different tier.

**Target:** No fabricated benchmark. Track the actual number. A conversion rate of 15-25% for a no-card trial is healthy at this stage and price point. Below 10% means the aha moment is not landing. Above 30% means you may be under-pricing (rare problem, but worth noting).

**Events already wired:** `trial_started`, `checkout_completed` — both in `ANALYTICS_EVENTS` [code].

---

### Metric 3: Time-to-First-Value — "Median minutes from signup to first Ask-Your-Ledger answer"

**Definition:** `signup_completed` timestamp → `ask_ledger_answer_generated` timestamp, per user, p50.

**Why this one:** This is the operational diagnostic for onboarding path speed. The target is under 8 minutes. If p50 is above 20 minutes, the onboarding steps are too long, the sample data is not surfacing the right entry point, or the navigation from the onboarding completion page to Ask-Your-Ledger requires too many clicks.

**PostHog implementation:** Create a person-level property `first_ledger_answer_minutes` computed as `(ask_ledger_answer_generated.timestamp - signup_completed.timestamp) / 60000`. This requires a PostHog computed property or a Trends chart using event property `$time` with a formula. Alternatively, create a funnel and use the "time to convert" chart built into PostHog's funnel analysis — it shows p50 and p90 natively without custom computed properties.

**Target:** p50 under 8 minutes. p90 under 20 minutes. If p90 is above 20 minutes, identify the step where users drop off in the funnel and fix that navigation path first.

**Events already wired:** `signup_completed`, `ask_ledger_answer_generated` — both in `ANALYTICS_EVENTS` [code]. The funnel already exists in the data.

---

## Execution Sequence (Priority Order)

These are the specific changes, in the order that unblocks the most conversion at the least build cost.

1. **Edit `TrialUpgradeCard` copy** — add tier recommendation ("Based on what you've used, [tier] fits"), specific end date, and the 30-day refund line. Three text changes, no new component. Affects every trial user who reaches the activation threshold. [apps/web/src/components/trial-upgrade-card.tsx]

2. **Build the PostHog activation funnel** — `signup_completed` → `onboarding_completed` → `ask_ledger_answer_generated`, 14-day window, `goal` breakdown. Zero code change. 30 minutes of PostHog configuration. Required to know if anything else is working.

3. **Fix the aha routing gap for "grants" goal** — `ahaRouteForGoal("grants")` currently returns `/funds` [code: onboarding-goal.ts line 13]. Add a prominent cross-link from `/funds` to the Ask-Your-Ledger view of the first fund, or add a banner on `/funds` pointing to `/reports` with the text "Ask a question about this fund →". This is a one-line route change or a one-component banner addition in the funds page. [apps/web/src/lib/onboarding-goal.ts] [apps/web/src/routes/_authenticated/funds/]

4. **Add the setup call offer to Audit-Ready checkout** — in `TrialUpgradeCard` when `highestTier === "audit_ready"`, replace the generic "See plans" CTA with "See plans + book your setup session" linking to `FOUNDER_BOOKING_URLS.onboardingCall` [code: pricing.ts line 119]. This is the highest-intent conversion surface in the product.

5. **Add the assembled-stack anchor to `/settings#billing`** — one paragraph between the tier table and the plan CTA. The $30,000–$80,000/yr anchor [planning estimate — verify before publishing] framed as "what the assembled alternative costs" with a note that individual tool prices are external estimates. No new component. One text block.

6. **Add the guarantee list to `/settings#billing`** — below the plan selection, name each guarantee with a heading. "Free Look," "First Month No Risk," "Your Data, Always," "Confirmed-Number Promise," and the Anti-guarantee for Audit-Ready. Copy exists in `GRANTPIPE_GUARANTEE_COPY` [code] for the refund guarantee; the others need one sentence each.

---

_All buyer-facing lines above are draft copy. Run through humanizer → third-grade-copy → zero-lies → fits-the-whole-place in their final on-page context before shipping._
