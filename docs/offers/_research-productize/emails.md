Now I have a thorough picture of the existing infrastructure. Here is the complete email package system design.

---

# GrantPipe Email Package System — Post-Promo Conversion Sequences

All buyer-facing subject lines and body copy fragments are marked **draft copy** (copy gate pending: humanizer → third-grade-copy → zero-lies → fits-the-whole-place).

Build status per sequence is noted: **EXISTS** (wired in current infrastructure), **NEW BUILD** (requires new content + sequencer enrollment), or **PARTIAL** (infrastructure exists, content gap only).

Prices from `packages/shared/src/pricing.ts` [code]. Competitor anchors [planning estimate — verify before publishing]. Ship-status tags on all product claims.

---

## SEQUENCE 1: Lead-Magnet Nurture → Soft Trial Offer

**Status: PARTIAL** — delivery infrastructure (Resend + sequencer enrollment + `enrollmentSequenceSlug`) exists. `nurture-copy.ts` currently implements only step 0 (asset delivery). Steps 1–4 below are new content; they slot into the existing `grantpipe-lead-magnet-nurture` sequence slug. The `firstFollowUpAngle` field already encoded per family tells each email what angle to take.

**Applies to:** All 10 sequence families. Four family-specific variants noted below. Remaining families follow the same structure with swapped teaching angle.

**Voice:** First-person, builder. No nonprofit-sector authority claimed. Teach first. Product mentioned once per email, never before the lesson is done.

---

### Email 0 — Asset Delivery (EXISTS)

**Subject (draft copy):** `Your [Title] from GrantPipe`
**Purpose:** Deliver the download URL + one concrete action to take today.
**CTA:** Download link. Secondary: "Start your trial" button (already in `makeDeliveryStep`).
**Note:** Existing `makeDeliveryStep` function covers this. No change needed.

---

### Email 1 — The Lesson (Day 3)

**Timing:** Day 3 after opt-in.
**Purpose:** One teaching email. Directly connected to the family's `firstFollowUpAngle`. No CTA. Proves the sender understands the buyer's actual job — not just the topic she searched.

**Family-specific subjects (draft copy):**

| Family                       | Subject                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| `audit-readiness`            | `The thing auditors ask for first (and where most teams scramble)`    |
| `federal-grant-ops`          | `Why the SF-425 and your books don't agree — and who notices`         |
| `restricted-fund-accounting` | `The spreadsheet problem isn't the spreadsheet`                       |
| `grant-management`           | `What a controlled award workflow actually looks like`                |
| `crm-evaluation`             | `The migration question nobody asks until it's too late`              |
| `grant-compliance`           | `One compliance rhythm that catches most findings before they happen` |
| `fundraising-development`    | `How donor records and grant records end up in the same mess`         |
| `state-compliance`           | `How to turn 30 state deadlines into one annual calendar`             |
| `city-funder-research`       | `From funder map to managed pipeline in one step`                     |
| `interactive-assessment`     | `What your score actually means for your next audit`                  |

**Body pattern (draft copy — audit-readiness as example):**
"Most teams find out the auditor wants restriction evidence when the auditor is already on the phone. The ask is not a trick question — it is a very specific one: show me the journal entries behind this restricted fund, and show me the classification that came with the original gift. The teams that answer it in ten minutes have that classification attached to the record, not sitting in the email where the gift arrived. The teams that spend three days on it are reconstructing both from separate systems. The checklist you downloaded is for the latter situation. What I built GrantPipe around is not needing the checklist at all."

**CTA:** None. One sentence at the end: "Reply if something in this resonates — or doesn't."

---

### Email 2 — Second Free Asset (Day 7)

**Timing:** Day 7.
**Purpose:** Give a second related asset before asking for anything. This is the "give until they ask" step.

**Family-specific second assets:**

| Family                       | Second asset                                                     |
| ---------------------------- | ---------------------------------------------------------------- |
| `audit-readiness`            | `audit-prep-week-by-week-checklist`                              |
| `federal-grant-ops`          | `subrecipient-monitoring-checklist`                              |
| `restricted-fund-accounting` | `restricted-funds-release-calculator`                            |
| `grant-management`           | `grant-closeout-checklist`                                       |
| `crm-evaluation`             | `grant-software-roi-calculator`                                  |
| `grant-compliance`           | `grant-file-audit-checklist`                                     |
| `fundraising-development`    | `donor-retention-dashboard-template`                             |
| `state-compliance`           | `grant-reporting-calendar-template`                              |
| `city-funder-research`       | `grant-pipeline-forecasting-worksheet`                           |
| `interactive-assessment`     | `nonprofit-software-needs-assessment` (if not already delivered) |

**Subject (draft copy):** `One more tool — no form, no signup`
**Purpose:** Deliver a second asset with a single sentence framing why it pairs with the first.
**CTA:** Download link only. No trial CTA.

**Body pattern (draft copy):**
"You downloaded the [Title] a few days ago. Here is the one tool that pairs with it most often: [Second Asset Title]. [One sentence on why they work together.] No signup. No catch. Here: [download link]."

---

### Email 3 — Plain-Text Founder Outreach (Day 10)

**Timing:** Day 10.
**Purpose:** Human signal. Question only. No CTA. This is the warm-outreach step inside the sequence. Replies route to founder inbox for 1:1 conversation.

**Applies to MOFU and BOFU families only:** `audit-readiness`, `federal-grant-ops`, `restricted-fund-accounting`, `crm-evaluation`, `grant-compliance`, `grant-management`. Do NOT run for TOFU families (`fundraising-development`, `city-funder-research`, `state-compliance`, `interactive-assessment` with tofu buyerStage).

**Subject (draft copy):** `Quick question`
**Format:** Plain text only (no HTML template, no branding, no unsubscribe footer beyond the bare legal minimum). Sent from `angel@grantpipe.com` or `angel.campa@grantpipe.com`, not the marketing sender.

**Body pattern (draft copy — audit-readiness):**
"You downloaded the [asset title] last week. I'm curious — are you in the window of getting ready for an audit, or is one already scheduled? Either way I'm wondering what's making the prep harder than it should be. Just reply here."

**CTA:** None. One question. Stop.

---

### Email 4 — Soft Trial Offer (Day 14)

**Timing:** Day 14. Skip if subscriber replied to Email 3 (already in 1:1 flow).
**Purpose:** First explicit product offer. One sentence. Low pressure. Premium framing, not urgency or discount.

**Subject (draft copy — family-specific):**

| Family                       | Subject                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `audit-readiness`            | `If you want to see what this looks like in a system`          |
| `federal-grant-ops`          | `One system for the SF-425, the time logs, and the evidence`   |
| `restricted-fund-accounting` | `What happens when the restriction lives with the record`      |
| `grant-management`           | `What a live grant workflow looks like vs. a spreadsheet`      |
| `crm-evaluation`             | `What GrantPipe does that the tools you're comparing don't`    |
| `grant-compliance`           | `See a compliance calendar that watches itself`                |
| `fundraising-development`    | `Donors and grants in one system — what that actually changes` |
| `state-compliance`           | `All your state deadlines, one compliance calendar`            |
| `city-funder-research`       | `From funder list to managed pipeline`                         |
| `interactive-assessment`     | `See the gaps your score found — inside the system`            |

**Body pattern (draft copy):**
"If you want to see what this looks like in a real system rather than a spreadsheet, you can start a free month at grantpipe.com. No card, no commitment. Your free month uses the plan you chose. If no plan was selected, Starter is the fallback. If you stay on Audit-Ready, I set up the first grant with you in a 60-minute session. That is the offer. No countdown, no discount."

**CTA:** One pill button: "Start your free month" → `app.grantpipe.com/signup`. No secondary CTA.

---

## SEQUENCE 2: Trial Activation (1-Month No-Card Trial → Aha Moment → Card)

**Status: NEW BUILD** — no in-product or transactional email sequence currently drives trial users toward the aha moments. This is the highest-leverage new sequence to build.

**Trigger:** User completes signup (trial). The `recordSignupCompleted` function in `sequencer.ts` already fires this event. The sequence subscribes to `signup_completed`.

**Goal:** Get the user to one of three aha moments before day 28:

1. Ask-Your-Ledger answers a real question from their data ✅
2. AI Award Document Intake runs on a real award letter ✅
3. Spend-down alert fires on a real grant they entered ✅

**Voice:** Practical. One action per email. Never sells the product — demonstrates a specific capability.

---

### Trial Email 1 — Welcome + First Action (Day 0, sent within 1 hour of signup)

**Subject (draft copy):** `Your first month starts now — here's what to do today`
**Purpose:** Establish expectations (a free month on the selected plan, no card). Surface the single highest-value action for day one.
**Body pattern (draft copy):** "Your free month uses the plan you chose. If no plan was selected, Starter is the fallback. No card until you decide to keep it. The thing that makes the biggest difference in the first session: bring one real award letter and run it through AI Award Document Intake. In five minutes you'll have a structured grant record instead of a PDF in a folder. That's the fastest way to feel what the system is actually for. Here's how to find it: [link to AI Intake in-app]."
**CTA:** "Run AI Award Document Intake" → deep link into the feature.

---

### Trial Email 2 — The Compliance Calendar Setup (Day 2)

**Subject (draft copy):** `Five minutes to a calendar that watches your deadlines`
**Purpose:** Drive setup of the compliance calendar — the sticky daily-use feature that creates habit. If the calendar is set up, the user will return.
**Body pattern (draft copy):** "Once your first grant is in the system, the compliance calendar fills in automatically. Reporting windows, spend-down dates, performance period end — all of it. The system sends email reminders before anything slips. Here's how to see it: [link to compliance calendar in-app]. If you haven't added a grant yet, the award letter import from the first email is the fastest start."
**CTA:** "Open the compliance calendar" → in-app deep link.

---

### Trial Email 3 — Ask-Your-Ledger Demo (Day 5)

**Subject (draft copy):** `Ask your grants a question — get an answer with a source`
**Purpose:** Drive the Ask-Your-Ledger aha moment. This is the single-schema moat made tangible. Frame it as a specific question to try.
**Body pattern (draft copy):** "There's a feature called Ask-Your-Ledger. You type a question about your grants or funds and the system answers from your actual data — with the journal entries linked underneath so you can see exactly where the answer came from. The question that usually lands first: 'How much of the [grant name] has been spent, and what's left?' Try it. If your data is in yet, try it on the demo data in your account. Here's the link: [deep link]."
**CTA:** "Ask a question" → Ask-Your-Ledger in-app.

---

### Trial Email 4 — Native Accounting Checkpoint (Day 8, Growth/Audit-Ready users only)

**Subject (draft copy):** `Your accounting records are in one place`
**Purpose:** Show Growth and Audit-Ready users that GrantPipe has native accounting records while setting the boundary that QuickBooks sync is not available.
**Body pattern (draft copy):** "GrantPipe includes native accounting records for your grants, restricted funds, journal context, and reporting trail. It does not sync with QuickBooks right now. If you still use QuickBooks for payroll or bill pay, keep that workflow separate and use GrantPipe for the grant and fund record."
**CTA:** "Review accounting records" → in-app accounting workspace.
**Condition:** Only send to trial users on Growth or Audit-Ready plan tier.

---

### Trial Email 5 — Social Proof from the Builder (Day 12)

**Subject (draft copy):** `Why I built this instead of buying Salesforce`
**Purpose:** Build belief that the product is solid and the founder understands the problem. Not a features email. A perspective email.
**Body pattern (draft copy):** "I built GrantPipe because every grant-funded nonprofit I looked at was using the same combination: a donor CRM, a grant tracker, QuickBooks, and at least one spreadsheet trying to reconcile all three. The problem is not that those tools are bad. It's that none of them share the same schema, so the question 'where did that dollar go?' takes 15 minutes across three tabs instead of 10 seconds from one place. That question is the one the board asks. The one the auditor asks. The one that costs you a Friday afternoon. That's what GrantPipe is for."
**CTA:** Soft — "See how your grants look in the system" → in-app dashboard.

---

### Trial Email 6 — Restriction Setup Walkthrough (Day 16)

**Subject (draft copy):** `How restricted funds work in GrantPipe (and why it matters at year-end)`
**Purpose:** Drive restricted fund classification — the feature that creates the deepest schema lock-in. If a user has classified even one restricted gift, they have real organizational knowledge in the system.
**Body pattern (draft copy):** "When a restricted gift arrives, the restriction goes on the record — not in a separate spreadsheet. When you spend against that fund, the system tracks what's left. When you release the restriction at year-end, there's a linked journal entry. The whole lifecycle lives in one place. The Restriction Auto-Classifier tags the net-asset class automatically; you confirm it. Here's how to set up your first restricted fund: [deep link]."
**CTA:** "Set up a restricted fund" → in-app restricted fund creation.

---

### Trial Email 7 — Value Checkpoint (Day 20)

**Subject (draft copy):** `Four things you can answer in 10 seconds now`
**Purpose:** Consolidate what the user has built. Frame it as capability gained, not features used.
**Body pattern (draft copy):** "If you've done any of the setup from the last two weeks, you can now answer these four questions in under 10 seconds from one screen: (1) Which grants are approaching their reporting deadline? (2) How much is left in each restricted fund? (3) Which donors haven't given in the last 12 months? (4) What journal entries back up the spend on [grant name]? Those four questions used to require three tabs and a spreadsheet. That's what the trial was for."
**CTA:** "Try the board report view" → in-app financial statements / board-ready outputs.

---

### Trial Email 8 — Plan Selection Prompt (Day 25)

**Subject (draft copy):** `Your free month ends in 5 days — here's how to pick the right plan`
**Purpose:** Drive plan selection before the trial expires. Surface tier logic based on usage signals. Premium framing only — no discount language.
**Body pattern (draft copy):**
"Your free month ends in 5 days. Here's how to think about the three plans:

- **Starter ($39/mo billed annually)** [code]: Up to 10 grants, compliance calendar, Program Allocation management, AI Award Intake (5/month), and budget-vs-actual exports. Best if you're getting out of spreadsheets.
- **Growth ($79/mo billed annually)** [code]: Everything in Starter plus spend-down alerts, restriction evidence alerts, indirect cost rules, reimbursement evidence packets, proposal and report drafting, unlimited AI Award Document Intake, and unlimited Ask-Your-Ledger reporting. Best if you run multiple grants and need stronger reporting support.
- **Audit-Ready ($159/mo billed annually)** [code]: Everything in Growth plus evidence packages, auditor portal, advanced fund accounting, and financial statements. Best if you're facing a single audit or funder monitoring visit. This plan includes a 60-minute setup session with me.

The assembled alternative — donor CRM, grant tracker, QuickBooks, and a fractional controller — typically costs $30,000–$80,000 a year [planning estimate — verify before publishing]. GrantPipe is one system. No consultants required."

**CTA:** "Choose a plan" → pricing page or in-app upgrade screen. Tier recommended by usage signals (grant count, feature usage, award size tracked).

---

### Trial Email 9 — Day-Before Expiry (Day 29)

**Subject (draft copy):** `Your trial ends tomorrow`
**Purpose:** Final activation. State the fact. Offer the setup call.
**Body pattern (draft copy):** "Your free month ends tomorrow. If you've added any real data — grants, donors, funds — that data stays in your account when you upgrade. If you start a paid plan today, nothing changes. If you'd like to talk through the right plan for your org before you decide, you can book a 30-minute call with me here: [discoveryCall URL from `FOUNDER_BOOKING_URLS`]. No pressure. The data will be here either way."
**CTA (primary):** "Keep my account" → in-app upgrade / plan selection.
**CTA (secondary):** "Book 30 min with Angel" → `FOUNDER_BOOKING_URLS.discoveryCall`.

---

## SEQUENCE 3: Paid Conversion / Trial-Ending (Premium Justification, No Discount)

**Status: NEW BUILD** — no post-trial paid-conversion sequence currently exists.

**Trigger:** Trial ended without conversion (subscription not active at day 30 + 1 day). Or: manual trigger when trial expires (hook off `subscriptionStatus` change from `trialing` to `past_due` / `canceled`).

**Goal:** Re-engage the lapsed trial user with the value anchor. Never offer a discount. Address the real objection (not price — it is belief that the product will hold up, or friction in the setup).

---

### Conversion Email 1 — The Honest Follow-Up (Day 1 post-expiry)

**Subject (draft copy):** `Your GrantPipe trial ended — what happened?`
**Purpose:** Diagnose the objection. Not a pitch — a question.
**Body pattern (draft copy):** "Your free month is up. If you didn't convert, something didn't land. I'd genuinely like to know what it was. Did the setup feel too heavy? Did you not get to the features that mattered? Did something come up? Reply directly. I read every response and I will answer."
**CTA:** Reply. No product link.

---

### Conversion Email 2 — The Stack Anchor (Day 4 post-expiry)

**Subject (draft copy):** `What the alternative actually costs`
**Purpose:** Anchor to the assembled-stack alternative. Not a features list — an economic argument.
**Body pattern (draft copy):** "The alternative to GrantPipe is usually some combination of a donor CRM, a grant tracker, QuickBooks, and a spreadsheet or a consultant trying to reconcile all three. That combination typically costs $30,000-$80,000 a year in tools and fractional time [planning estimate - verify before publishing]. GrantPipe is one system at $49-$199 a month, or $39-$159 a month when billed annually [code], depending on how many grants you run. That is not a discounting argument. It's just what the alternative costs. If the trial didn't give you enough time to test it on real data, I'll set up the first grant with you in a 60-minute session on Audit-Ready. That offer is real."
**CTA:** "Restart your account" → in-app or signup page. Secondary: "Book a setup session" → `FOUNDER_BOOKING_URLS.onboardingCall`.

---

### Conversion Email 3 — The Anti-Guarantee (Day 10 post-expiry)

**Subject (draft copy):** `The one thing I won't promise — and what I will`
**Purpose:** Address the risk. The anti-guarantee is the most honest and differentiated trust move available. Burned buyers respond to it because it is real.
**Body pattern (draft copy):** "I won't promise GrantPipe will make you pass your audit. No software can promise that. What I will promise: when the auditor asks for evidence, it is export-ready. Journal entries are linked to restrictions. Classifications are on the record. The evidence file is two clicks. That's the Confirmed-Number Promise. Your data is traceable. What happens with the data is your auditor's call, not mine. If that's the kind of system you want, the 30-day money-back guarantee covers the first month if it's not right."
**CTA:** "Restart with a 30-day money-back guarantee" → plan selection. No discount.

---

### Conversion Email 4 — The Last Honest Ask (Day 20 post-expiry)

**Subject (draft copy):** `One last message from me`
**Purpose:** Clean close. Honest. No desperation, no fake urgency.
**Body pattern (draft copy):** "This is the last email in this series. If GrantPipe isn't the right fit for your org right now, I'm not going to keep pitching it. If something changes — you get a new federal award, you're heading into an audit, you need to replace a tool that broke — the door is always open at grantpipe.com. The free trial is always there. No card, no pressure. If you want to pick up the conversation first, reply here."
**CTA:** None required. Optional soft link: `grantpipe.com`.

---

## SEQUENCE 4: Onboarding → First Value for New Payers

**Status: PARTIAL** — in-product onboarding wizard ✅ exists. Transactional email layer outside the app is new.

**Trigger:** Subscription confirmed (status changes from `trialing` to `active`). Distinct from the trial activation sequence — this is for paying users.

**Goal:** Get the user to the specific "you can answer the board question now" moment within 7 days. Drive toward the Day-One Data Session booking for Audit-Ready annual users.

---

### Onboarding Email 1 — Welcome to Paid (Day 0)

**Subject (draft copy):** `You're in — here's what to do on day one`
**Purpose:** Immediate confirmation + highest-value first action.
**Body pattern (draft copy):** "Thank you. Your [Plan Name] plan is active. The one thing worth doing today: if you haven't already, run one real award letter through AI Award Document Intake. That turns a PDF into a live grant record — deadlines on your calendar, budget lines entered, fund linked. That first grant is where GrantPipe starts paying off. Here's the link: [deep link]. If you're on Audit-Ready annual, you have a 60-minute setup session included. Book it here: [onboardingCall URL]."
**CTA (primary):** "Run AI Award Document Intake" → in-app feature.
**CTA (secondary, Audit-Ready annual only):** "Book your setup session" → `FOUNDER_BOOKING_URLS.onboardingCall`.

---

### Onboarding Email 2 — The Four Questions (Day 3)

**Subject (draft copy):** `The four questions your board will ask — and where the answers live`
**Purpose:** Give the user a concrete usage map tied to real board meeting questions.
**Body pattern (draft copy):** "Four questions come up at every board meeting for grant-funded nonprofits. Here's where each answer lives in GrantPipe: (1) 'Where do we stand on the [grant name] budget?' → Grant budget-vs-actual view, updated from your transactions. (2) 'Which restricted funds are at risk of expiring?' → Compliance calendar + spend-down tracker. (3) 'What happened to the major donor who gave last spring?' → Donor CRM + donor lapse watch. (4) 'What will the auditor want to see?' → Restriction evidence package + auditor portal. Each of these is one click from the dashboard. The answers are your data — not a consultant's summary."
**CTA:** "Open your dashboard" → in-app.

---

### Onboarding Email 3 — The Sticky Feature (Day 7)

**Subject (draft copy):** `The one thing that keeps teams coming back every week`
**Purpose:** Drive habit formation around the compliance calendar and spend-down alerts — the features with the highest weekly return rate.
**Body pattern (draft copy):** "The teams that get the most out of GrantPipe are the ones that stop checking deadlines manually because the system is checking for them. The compliance calendar sends email reminders before reporting windows open. Spend-down alerts fire when a fund is running low before the period ends. Those two features require no ongoing work once the grants are in. They just watch. Here's how to make sure your alerts are configured: [deep link to notification settings]."
**CTA:** "Set up your alerts" → in-app notification settings.

---

### Onboarding Email 4 — Native Accounting Checkpoint (Day 10, Growth/Audit-Ready only)

**Subject (draft copy):** `Your accounting records are ready to review`
**Purpose:** Identical purpose to Trial Email 4 but for newly converted Growth or Audit-Ready users. Reinforces native accounting records and the boundary that QuickBooks sync is unavailable.
**CTA:** "Review accounting records" ? in-app accounting workspace.
**Condition:** Only send to Growth or Audit-Ready users who have not yet reviewed accounting records.

---

### Onboarding Email 5 — The Handoff Document (Day 14)

**Subject (draft copy):** `What to give your board — and what to give your auditor`
**Purpose:** Surface the board-ready output and auditor portal as concrete named deliverables now that the user is a week into paid access.
**Body pattern (draft copy):** "At your next board meeting, you can hand them a financial statement generated from your actual grant and fund data. At your next audit, you can send the auditor a portal link and a restriction evidence package. Both are built from your data — no reconstruction, no spreadsheet. Here's how to generate the board report: [link]. Here's how to invite an auditor to the portal: [link]. If you're on Audit-Ready and haven't booked your setup session yet, it's included: [onboardingCall URL]."
**CTA:** "Generate a board report" → in-app. Secondary (Audit-Ready only): "Book setup session" → `FOUNDER_BOOKING_URLS.onboardingCall`.

---

## SEQUENCE 5: Win-Back / Lapsed Trial

**Status: NEW BUILD** — no win-back sequence exists.

**Trigger:** Distinction from Sequence 3 (post-trial no-convert): this sequence fires when a user created an account, entered the trial, and then went inactive (no login for 14+ days) before trial expiry. Different problem: they signed up and then stopped engaging, rather than reached the end of the trial without converting.

**Goal:** Re-engage before the trial expires. The objection here is almost always setup friction or distraction — not price, not belief. The fix is a single concrete offer to remove the friction.

---

### Win-Back Email 1 — The Re-Engagement Offer (fires on Day 14 of inactivity, if trial has ≥ 7 days left)

**Subject (draft copy):** `You signed up — haven't heard from you since`
**Purpose:** Honest re-engagement. Acknowledge inactivity. One concrete offer to reduce setup friction.
**Body pattern (draft copy):** "You signed up for GrantPipe about two weeks ago and haven't logged in since. That's okay. These things slip. I'm not writing to sell you anything. I'm writing because the most common reason people stop after signing up is that the blank account feels like a project, and the project doesn't start. Bring one award letter and try AI Award Document Intake. It turns the blank account problem into a five-minute task. Audit-Ready and Enterprise customers can also book guided setup if they want closer help."
**CTA (primary):** "Run AI Award Document Intake" → `app.grantpipe.com`.
**CTA (secondary):** "Log back in" → `app.grantpipe.com`.

---

### Win-Back Email 2 — The Specific Help Offer (Day 7 after Win-Back Email 1, if still inactive)

**Subject (draft copy):** `One more thing before your trial ends`
**Purpose:** Last re-engagement before expiry. Move to a direct question, not a pitch.
**Body pattern (draft copy):** "Your free month is ending soon. Before it does: is there something specific about the setup that felt wrong, or something the system couldn't do that you needed? Reply here. I read every response. If GrantPipe is not the right fit, I'd genuinely rather know that now than have you sit on a tool that doesn't work for you."
**CTA:** Reply. No product link.

---

### Win-Back Email 3 — The Invite Back (30 days post-trial-expiry, if no conversion)

**Status note:** This email fires after the trial has expired and the user has churned. It is the long-term win-back email — not a desperation pitch.
**Timing:** 30 days post-trial expiry.
**Subject (draft copy):** `The door is still open`
**Purpose:** Low-pressure re-invite. Acknowledge that the timing may not have been right. Leave a clean open door.
**Body pattern (draft copy):** "Thirty days since your trial ended. If the timing wasn't right then — a grant fell through, a staff change happened, a board decision got delayed — that's fine. The free trial is still available any time. No card, no deadline. If something has changed and you want to look again, you can start at grantpipe.com/pricing or reply here and we can talk through whether Audit-Ready with the setup session makes sense for where your org is now."
**CTA:** "Take another look" → `grantpipe.com/pricing`.

---

## Sequence Mapping — What Exists vs. Needs Building

| Sequence                                  | Status    | Infrastructure                                                                          | Content gap                                                                                                                      |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Lead magnet nurture (Email 0)         | EXISTS    | `nurture-copy.ts` + Resend + `grantpipe-lead-magnet-nurture` slug                       | None                                                                                                                             |
| 1 — Lead magnet nurture (Emails 1–4)      | PARTIAL   | Sequencer enrollment + family metadata exist                                            | New email content per family (4 templates × 10 families = 40 variants; Emails 1/3/4 are ~60% shared, Email 2 is family-specific) |
| 2 — Trial activation (Emails 1–9)         | NEW BUILD | `recordSignupCompleted` event in `sequencer.ts` exists; no sequence subscribed          | 9 emails; trigger: `signup_completed` event                                                                                      |
| 3 — Paid conversion (Emails 1–4)          | NEW BUILD | No trigger exists; needs: expired-trial detection + `subscriptionStatus` watch          | 4 emails; trigger: trial → no conversion                                                                                         |
| 4 — Onboarding → first value (Emails 1–5) | NEW BUILD | No transactional onboarding email sequence exists (in-product wizard exists separately) | 5 emails; trigger: subscription activated                                                                                        |
| 5 — Win-back / lapsed trial (Emails 1–3)  | NEW BUILD | No lapsed-trial detection exists                                                        | 3 emails + inactivity trigger logic                                                                                              |

---

## Build Priority Order

1. **Sequence 2 (Trial activation), Emails 1–3 + Email 8.** Highest conversion leverage. The trial is already live and users are entering it with no email support after day 0. These four emails alone cover the most critical days (day 0, day 5, day 20, day 25).

2. **Sequence 1, Emails 1–2 (The Lesson + Second Asset).** Already half-built. The family metadata and follow-up angles are already encoded in `firstFollowUpAngle`. Writing 10 lesson emails and pairing the second assets is a focused content session with no infrastructure build.

3. **Sequence 4 (Onboarding), Email 1 + Email 5.** Day-0 paid confirmation and Day-14 board report + auditor portal surface. These are the highest-ROI onboarding touches.

4. **Sequence 3 (Paid conversion), Emails 1–2.** Cover the most common lapse patterns (setup friction, stack-anchor objection).

5. **Sequence 1, Emails 3–4 (Founder plain-text + Soft trial offer).** The plain-text email is highest 1:1 conversion leverage but requires founder time to handle replies. Build after the infrastructure for 1–2 is stable.

6. **Sequence 5 (Win-back).** Lowest volume by definition. Build last.

---

## Implementation Notes for the Sequencer

- The existing `grantpipe-lead-magnet-nurture` sequence slug covers Sequence 1. Emails 1–4 are new steps in that sequence — they are currently unpopulated in the sequencer.
- Sequences 2–5 each require a new sequence slug in the sequencer (`grantpipe-trial-activation`, `grantpipe-paid-conversion`, `grantpipe-onboarding`, `grantpipe-win-back`). Each maps to a new `enrollmentSequenceSlug` constant in `LEAD_MAGNET_SEQUENCE_SLUGS` or a parallel constants file.
- Trigger for Sequence 2: `signup_completed` event already fired from `recordSignupCompleted` in `sequencer.ts`. The sequencer needs a rule: on `signup_completed` for product `grantpipe`, enroll in `grantpipe-trial-activation`.
- Trigger for Sequence 4: `subscription_activated` event — not yet fired. Needs a new `recordSubscriptionActivated` call in the billing webhook handler (payments/webhook domain).
- Trigger for Sequence 5 (Win-back Email 1): inactivity detection — needs a scheduled job or a sequencer-side rule checking last-login timestamp against trial expiry date.
- The `FOUNDER_BOOKING_URLS` object [code: `packages/shared/src/pricing.ts`] already has `discoveryCall` and `onboardingCall` URLs. Use these as the single source of truth in all email templates.
