Now I have everything I need. Here is the full value ladder.

---

# GrantPipe Productized Value Ladder (Post-Promo, Full Price)

All prices from `packages/shared/src/pricing.ts` [code]. Competitor-stack anchor [planning estimate — verify $30K–$80K range before publishing]. Ship-status tags applied throughout. Copy marked "draft copy" has not yet cleared the humanizer → third-grade-copy gate in final on-page context.

---

## The Ladder at a Glance

| #   | Rung                                      | Price                                  | Job               | Status                                              |
| --- | ----------------------------------------- | -------------------------------------- | ----------------- | --------------------------------------------------- |
| 1   | Free lead magnet / assessment             | $0                                     | Capture           | ✅ exists                                           |
| 2   | Free 5-day email course                   | $0                                     | Activate          | ⬜ needs build                                      |
| 3   | Free 1-month trial (no card)              | $0                                     | Monetize ready    | ✅ exists                                           |
| 4a  | Starter subscription                      | $49/mo or $39/mo annual-equiv [code]   | Monetize          | ✅ exists                                           |
| 4b  | Growth subscription                       | $99/mo or $79/mo annual-equiv [code]   | Monetize + Ascend | ✅ exists                                           |
| 4c  | Audit-Ready subscription                  | $199/mo or $159/mo annual-equiv [code] | Monetize + Retain | ✅ exists                                           |
| 5   | Founding Setup engagement (done-with-you) | $2,500 one-time [planning estimate]    | Ascend + Retain   | ✅ core deliverable exists; SKU needs formalization |
| 6   | Annual commitment + retention             | Year 2 renewal at list price           | Retain            | ✅ mechanics exist                                  |

---

## Rung 1 — Free Lead Magnet / Assessment

**Name:** "The Evidence Pack" (collective framing for the library)

**What the buyer gets:**
117 PDFs + 3 XLSX templates delivered via email → R2 signed link [code: `LEAD_MAGNET_SLUGS`], including:

- 5 interactive assessments: `nonprofit-audit-readiness-assessment`, `grant-compliance-readiness-quiz`, `nonprofit-software-needs-assessment`, `donor-management-maturity-assessment`, `nonprofit-financial-health-scorecard` ✅
- 30 state charitable-registration checklists ✅
- 17 city funder maps / deadline calendars ✅
- Compliance checklists, grant lifecycle templates, restricted-fund spreadsheets, ROI calculators, migration checklists (GrantHub, Salesforce NPSP) ✅
- Auditor/funder portal templates ✅

**Job in the ladder:** Capture. Pull the avatar in on their existing pain (missed deadline, audit stress, spreadsheet mess) before they know GrantPipe exists. Every magnet is gated by email, which feeds the nurture sequences.

**How the 117 magnets feed the top of the ladder:**
Each magnet family maps to a nurture sequence (`LEAD_MAGNET_FALLBACK_BY_FAMILY` [code]). The assessment magnets score the lead's readiness and self-qualify their tier fit. Someone who downloads the `nonprofit-audit-readiness-assessment` is nearly always an Audit-Ready / Enterprise prospect. Someone downloading a city funder map is likely a Grant or Starter prospect. The assessments are the sharpest top-of-ladder traffic sorters that already exist.

**Ship-status of everything in it:** ✅ all 117 delivered via email + R2; nurture sequences wired.

**Price:** $0

**Ascension trigger:** Email nurture delivers 3–5 educational touches. Trigger to Rung 2 (or directly to Rung 3 for hot prospects) is: clicked a nurture email, visited a pricing page, or completed an assessment that scored "ready to evaluate software."

---

## Rung 2 — Free 5-Day Email Course ("The Dollar Trail")

**Name:** "The Dollar Trail: 5 days to know where every restricted dollar went" _(draft copy)_

**What the buyer gets:** One email per day, each answering one question the board or auditor actually asks. Day 1: what restricted means and why it matters. Day 2: why QuickBooks alone can't track it. Day 3: what a restriction lifecycle looks like. Day 4: what an auditor actually wants to see. Day 5: what "one system" means in practice + soft CTA to the free trial.

Each email teaches first, builder-voice plug in the final paragraph, just like the YouTube convention already in use.

**Job in the ladder:** Activate. Converts passive subscribers (who downloaded a checklist and went quiet) into warm prospects. Builds belief that GrantPipe's schema is the answer — without ever making a claim the buyer hasn't yet accepted.

**Ship-status:** ⬜ needs build. The infrastructure (Resend, nurture sequences) is ✅ live. The 5-day sequence content and automation trigger are the build. Medium effort, high leverage — this is the single biggest gap in the current funnel.

**Price:** $0

**Ascension trigger:** Day 5 email CTA: "See it live, free for a month, no card." Triggers Rung 3. Secondary trigger: reply to any email in the sequence (direct founder contact signal → schedule a discovery call).

---

## Rung 3 — Free 1-Month Trial (No Card)

**Name:** "Free Look" _(already named in the guarantee suite [code: `UNIVERSAL_PLAN_INCLUSIONS`])_

**What the buyer gets:** Access to the plan selected at signup for 30 days [code: `getEffectivePlanTier` uses the selected plan tier; legacy or missing-plan trials fall back to `TRIAL_EFFECTIVE_PLAN_TIER` = `starter`; Enterprise-only capabilities such as the Cross-Entity Report Builder stay behind a founder-contact upgrade]. No card required. In-product onboarding wizard. AI help on every plan, human-confirmed. Unlimited users.

**Job in the ladder:** Monetize ready. The trial is the proof mechanism. For a buyer burned by a previous rollout, this removes the "bet on a year's contract before I know it works" objection entirely. The demo is the argument.

**Ship-status:** ✅ live. Trial mechanics, onboarding wizard, and goal-branched first-session flow all exist.

**Price:** $0 (1 month)

**What makes someone convert from trial to paid:** The moment they get a real answer from Ask-Your-Ledger ✅, or receive their first spend-down alert ✅, or use AI Award Document Intake on a real award letter ✅. These are the "aha" moments the onboarding wizard is designed to reach. Conversion trigger = one of those moments before day 28.

**Ascension trigger to paid:** Day 25 in-app prompt + email: "Your free month ends in 5 days. Which plan fits your work?" → tier comparison with Starter vs Growth vs Audit-Ready. High-audit-risk signals (has uploaded award documents, has multiple grants, has used restriction lifecycle) → surface Audit-Ready first.

---

## Rung 4a — Starter Subscription

**Name:** Starter

**What the buyer gets (ships-today features only):**
Up to 10 active grants ✅, donor CRM ✅, grant pipeline tracking ✅, grant budget lines + budget-vs-actual ✅, budget-vs-actual exports ✅, basic restricted fund visibility ✅, compliance calendar ✅, spend-down tracking ✅, 990 export templates ✅, automated deadline reminder emails ✅, restriction lifecycle (terms, additions, releases) ✅, grant budget alerts ✅, AI Award Document Intake (5/month) ✅, email support ✅. Ask-Your-Ledger starts on Growth.

**Who buys it:** Avatar 1 (Executive/Development Director) who manages a handful of grants, is not yet facing a single audit, and primarily needs to stop missing deadlines and get out of spreadsheets. Budget: sub-$500K in federal awards, so single-audit threshold [$1,000,000, 2 CFR 200.501] is not yet a live concern.

**Job in the ladder:** Monetize. First paid conversion. Gets the org into the schema.

**Ship-status:** ✅ all Starter features ship today.

**Price:** $49/mo month-to-month, or $39/mo annual-equivalent ($468/yr billed annually) [code]. Default billing cycle = annual [code: `DEFAULT_BILLING_CYCLE`].

**Value anchor:** The assembled alternative — donor CRM ($100–200/mo [external, Bloomerang entry tier]), separate grant tracker ($299+/mo [external, Instrumentl entry]), QuickBooks ($35/mo [external]) — already exceeds Starter before any consultant time. The anchor is directional, not a published number. _(Do not sum these to a headline figure without citing each source.)_

**Ascension trigger to Growth:** Hits the 10-grant cap, wants higher AI caps, needs proposal/report drafting, or a funder asks for a compliance report pack. In-app paywall surfaces these triggers naturally [code: `utils/paywall.ts`].

---

## Rung 4b — Growth Subscription

**Name:** Growth

**What the buyer gets (adds to Starter):**
Up to 50 active grants ✅, spend-down threshold alerts ✅, restriction evidence links + alerts ✅, restricted rollforward reports ✅, budget exports + planned expenses ✅, compliance report pack ✅, read-only Program Allocation previews ✅, drawdowns + reimbursement requests ✅, indirect cost rules ✅, reimbursement evidence packets ✅, native accounting records ✅, proposal + report drafting assistant ✅, unlimited AI Award Document Intake ✅, unlimited Ask-Your-Ledger reporting ✅. External accounting sync is not available right now.

**Who buys it:** Avatar 1 managing multiple grants at once; Avatar 2 (Finance/Operations Director) who needs native accounting records beside donor and grant compliance work.

**Job in the ladder:** Monetize + Ascend. The tier where most orgs will live for their first 12–24 months. Higher AI limits, drafting, alerts, and compliance reports are the Growth unlocks.

**Ship-status:** ✅ all Growth features ship today.

**Price:** $99/mo month-to-month, or $79/mo annual-equivalent ($948/yr billed annually) [code].

**Value anchor:** A part-time fractional grant accountant runs $1,500–$3,000/mo [planning estimate — verify before publishing]. Growth replaces much of what that person does for alerts and compliance output, at $79/mo billed annually.

**Ascension trigger to Audit-Ready:** Approaching a single audit, facing a funder monitoring visit, grant count approaching 50, needs auditor portal, or Finance Director wants restriction evidence package output. Trigger: in-app nudge when restriction evidence package output is accessed on Growth (paywall), or when org crosses $800K in federal awards tracked (audit-threshold proximity warning).

---

## Rung 4c — Audit-Ready Subscription

**Name:** Audit-Ready

**What the buyer gets (adds to Growth):**
Up to 100 active grants ✅, Program Allocation management + budget-vs-actual exports ✅, advanced fund accounting ✅, budget amendment history + audit views ✅, restriction evidence package output ✅, financial statements + board-ready outputs ✅, Auditor & Funder Portal ✅, subrecipient monitoring ✅, guided onboarding + import + setup (founder-led) ✅.

**Who buys it:** Avatar 1 or 2 facing a real single audit, a major federal award, or a funder monitoring visit. Also the buyer who has been burned before and wants the confidence anchor from day one, regardless of audit proximity. The emotional purchase: "I will never be the person who can't answer."

**Job in the ladder:** Monetize + Retain. This is where the deepest fear is addressed and where the Founding Setup engagement (Rung 5) attaches.

**Ship-status:** ✅ all Audit-Ready features ship today.

**Price:** $199/mo month-to-month, or $159/mo annual-equivalent ($1,908/yr billed annually) [code].

**Value anchor:** This is the rung to price against the $30,000–$80,000/yr assembled stack floor [planning estimate]. $1,908/yr is less than the cost of one pre-audit consultant engagement, and the founder sets it up with you. Enterprise audit-prep consulting can bill $5,000–$15,000 for a single engagement [planning estimate — verify range]. Audit-Ready replaces the recurring overhead, not a one-time cost.

**The Anti-guarantee lives here:** "We won't promise you'll pass your audit. No software can. We promise your evidence is export-ready when the auditor asks." ✅ This is the most credible thing a solo founder can say in this category, and it's uncontested.

**Ascension trigger to Founding Setup (Rung 5):** Buyer has signed up for Audit-Ready annual (highest intent signal), or has booked a discovery call, or is within 90 days of a known audit/monitoring visit. Surface the Founding Setup as an add-on at checkout and in the post-signup onboarding flow.

---

## Rung 5 — Founding Setup Engagement (Done-With-You)

**Name:** The Founding Nonprofit Setup _(offer name confirmed in `docs/offers/founder-setup-offer.md`)_

**What the buyer gets:**
A live 60-minute work session with the founder [code: `FOUNDER_BOOKING_URLS.onboardingCall`]. Buyer brings one real award letter. They leave with: their first grant set up in the system ✅, its deadlines on the compliance calendar ✅, its fund linked ✅, AI Award Document Intake run on their real document ✅. The session runs on Audit-Ready or Enterprise. The guarantee attached: "Book your session. Bring one real award letter. In that session, we get your first grant live. If we don't, your first paid month is free." ✅

**Job in the ladder:** Ascend + Retain. This is the high-ticket engagement that sits above the subscription and collapses time-to-value from "weeks of solo setup" to "one hour with the person who built it." It also dramatically increases Year 1 retention because the buyer has real data in the system from session one — they cannot easily leave.

**Ship-status:** ✅ The core deliverable (founder-led setup session) is real today. Angel runs these. The SKU formalization (dedicated pricing page, standalone checkout or invoice, post-session follow-up sequence) is a light build.

**Positioning vs. subscription:** The engagement is priced ABOVE the subscription but sold as an add-on to Audit-Ready annual, not as a standalone. This avoids the double-dipping problem flagged in the grand-slam offer doc: it is not also a free tier-inclusion while simultaneously being a paid SKU. On Audit-Ready annual, the guided setup is included as the tier benefit. The Founding Setup SKU is the version for buyers who want a faster, more intensive hand-held experience and are willing to pay for the founder's direct time above the subscription.

**Recommended price:** $2,500 one-time [planning estimate — this is a suggested price, not from `pricing.ts`; do not publish until a price is formalized in code]. Rationale: $2,500 is well below a single pre-audit consultant session ($5,000–$15,000 [planning estimate]), creates a meaningful psychological anchor that the subscription is a bargain by comparison, and is keepable by a solo founder running ~4 sessions per month.

**Scarcity:** Real and honest. Angel can run approximately 4 setup sessions per month. Show the session-slot counter only when ≤3 slots remain and the count is wired to real booking data. When full, show the next available month — never lock out the buyer. _(Per grand-slam offer honesty contract: no fake countdown, no fabricated seat count.)_

**Who buys it:** Avatar 1 who just committed to Audit-Ready annual and wants to be live in a single session. Avatar 2 (Finance Director) who has a hard audit date approaching. The buyer who was burned before and wants a human they can hold accountable, not just a tool.

**Ascension trigger:** None above this rung currently. Year 2 renewal (Rung 6) is the next move.

---

## Rung 6 — Annual Commitment + Retention (Year 2+)

**Name:** Annual renewal at list price

**What the buyer gets:** Continued full-plan access at the annual equivalent rate. No new discount — premium positioning, no discounting as strategy. The renewal is the product proving itself over 12 months.

**Job in the ladder:** Retain. The entire ladder above is designed to ensure the buyer has real data in the system, real answers from Ask-Your-Ledger, and real evidence packages they have handed to reviewers — before the renewal date. A buyer who has used the Auditor Portal to answer a funder question is not leaving.

**Retention mechanics:**

- Compliance calendar + spend-down alerts keep daily/weekly touchpoints ✅
- Automated deadline reminder emails keep the product visible ✅
- Board-ready financial outputs are used at every board meeting ✅ — each use is a retention touchpoint
- Ask-Your-Ledger grounded answers accumulate organizational knowledge in the system; leaving means that knowledge leaves too ✅ (the schema lock-in is benign and real)

**The export guarantee as retention enabler, not churn enabler:** "Your Data, Always" ✅ — export everything, any time — sounds like a churn risk but is a trust amplifier. Burned buyers need to know they can leave. Knowing they can leave makes them more likely to stay. The org that trusts the export guarantee is the org that commits to the annual plan.

**Price:** List price at renewal. No discount. The annual rate ($468 / $948 / $1,908 [code]) is the product's earned price. If the product has done its job in Year 1, the renewal conversation is short.

---

## Ascension Trigger Map (Summary)

| From                         | To                      | Trigger                                                                                         |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| SEO / YouTube / LinkedIn     | Rung 1 (lead magnet)    | Download a checklist, calculator, or assessment; enter email                                    |
| Rung 1 (cold subscriber)     | Rung 2 (email course)   | Nurture email: "5 days to know where every dollar went" opt-in CTA                              |
| Rung 2 (email course, day 5) | Rung 3 (free trial)     | Day 5 CTA: "See it live, free for a month, no card"                                             |
| Rung 1 (hot assessment lead) | Rung 3 (free trial)     | Skip Rung 2: assessment score = "ready to evaluate software" → direct trial CTA                 |
| Rung 3 (trial)               | Rung 4a/4b/4c           | Day 25 prompt: "Your free month ends in 5 days. Pick your plan." Tier surfaced by usage signals |
| Rung 4a (Starter)            | Rung 4b (Growth)        | Grant cap hit (in-app paywall), higher AI limits needed, funder asks for compliance pack        |
| Rung 4b (Growth)             | Rung 4c (Audit-Ready)   | Approaching single audit, org crosses $800K federal awards tracked, needs auditor portal        |
| Rung 4c (Audit-Ready)        | Rung 5 (Founding Setup) | Audit-Ready annual checkout → Founding Setup add-on offer; or discovery call → setup upsell     |
| Rung 5 (Founding Setup)      | Rung 6 (Year 2 renewal) | Data is live, grants are tracked, evidence packages have been used; renewal is proof of value   |

---

## What Exists Today vs. Needs Building

**Exists today (✅):**

- All 117 lead magnets built and delivered via email + R2 signed link
- Email nurture sequences per lead-magnet family
- 5 interactive assessments (the highest-quality top-of-ladder sorters)
- Free 1-month trial mechanics (no card, selected-plan access, in-product onboarding wizard)
- All three subscription tiers with full feature sets
- Founder-led setup sessions (booking via cal.com [code: `FOUNDER_BOOKING_URLS.onboardingCall`])
- Annual billing default, all guarantee copy, export mechanics
- YouTube engine (~10 produced videos, 20-video strategy), LinkedIn cadence

**Needs building (⬜):**

- **Rung 2: The 5-day email course.** Biggest funnel gap. Infrastructure is there (Resend). The sequence content and automation trigger are the build. Medium effort, highest leverage per dollar of funnel investment.
- **Rung 5 SKU formalization:** dedicated pricing page / landing page for the Founding Setup as an add-on offer; price formalized in `pricing.ts` or equivalent; post-session follow-up sequence; session-slot counter wired to real booking data.
- **Assessment → trial direct path:** When an assessment scores "ready to evaluate," the CTA should skip Rung 2 and go straight to trial signup. This routing logic may need a light build in the nurture flow.

**Exists but undersold / invisible in current marketing (copy leverage, near-zero build):**

- Donor Lapse early-warning ✅ — not prominently named in any rung copy
- Ask-Your-Ledger drill-down to journal entries ✅ — the single-schema moat made tangible; not the hero in any existing surface
- Restriction Auto-Classifier at gift entry ✅ — "audit-clean from the first gift" is unwritten
- The full guarantee suite ✅ — zero competitors publish guarantees; naming them is uncontested white space
- Human-confirmed AI ✅ — the trust pillar for a burned buyer; currently a footnote

---

## Anchor Note (Required Before Publishing Any Dollar Figure)

The $30,000–$80,000/yr assembled-stack-plus-consultant floor is a [planning estimate] anchored to fractional-CFO and nonprofit-audit-prep market rates. Verify the current range against real market data before publishing any specific figure in buyer-facing copy. Do not publish the range as a fact; frame it as what "the assembled alternative typically costs" with a citation path. The individual tool prices (Bloomerang, Instrumentl, QuickBooks) used in Rung 4a framing are [external] and should be re-confirmed before any comparison table ships.
