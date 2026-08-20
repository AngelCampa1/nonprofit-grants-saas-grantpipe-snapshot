# P2 Research Brief — Add a Grant and Allocate It Across Funds

## Slot & role

- **Slot:** P2 (second in the production sequence; second video in the email onboarding sequence, "First grant").
- **Type:** Short screen-record, real running app. 2–3 min target.
- **Distribution:** in-app Help (`/help/grants`) + email #2 ("First grant") + LinkedIn 30–60s cut. SEO overlap is **weak** — no keyword target; owned distribution first.
- **Home truth:** the user just signed up and imported their donors (P1). Now an award letter is sitting in their inbox and they don't know where to put it. This video takes them from "I got the money" to "the grant is in GrantPipe and its dollars are split across the right funds, and the math checks out."

## Audience & emotional job

- Executive Director / Development Director at a $500K–$10M nonprofit. The same wary, time-poor person from P1.
- The fear here is specific: **restricted money.** A funder gave them money with strings, and they're afraid of spending it wrong and failing an audit. They've heard "fund accounting" and it sounds like something only a CPA can do.
- **Emotional target: confidence and control.** By the end: "I can record a grant and split its money across funds in two minutes, and the app won't let me allocate more than I actually have."
- The strongest trust beat: **the app blocks you from allocating more than the grant is worth** ("Allocation would exceed grant amount"). That's the moment they realize the software is watching their back, not just storing data.

## The one job this video shows

Take a real awarded grant from creation to fully allocated across two funds. Two acts:

1. **Add the grant** — the Create grant dialog (a 2-step form): name, funder, amount, status, then dates. Why funder and amount matter.
2. **Allocate it across funds** — open the grant, read the four money cards (Grant Amount / Allocated / Unallocated / Remaining to Spend), then add two allocations on the Allocations tab so the money lands in the right funds and Unallocated drops to $0. Show the guardrail when an allocation would exceed the grant.

## Angle / spine

"A grant isn't one number — it's money with rules attached. GrantPipe lets you record the award, then split it across the funds it's allowed to pay for, and it does the math so you can't over-commit." Builder-to-operator, plain, unhurried. The "Awarded" status in the app literally tells you the next step is to set up "award amount, dates, restrictions, and linked funds" — we follow the app's own guidance.

## What we show on screen (real app, demo org "Heartland Senior Services")

Every beat = the actual app, signed in as `demo@grantpipe.com` (Sarah Mitchell / Heartland Senior Services). Screens to capture (capture agent → `_capture/p2/`). The demo org already has 5 grants, 4 funds, 4 funders seeded; we **create a new grant live** because every seeded grant is already fully allocated to a single fund — to teach a real multi-fund *split* we make a fresh one. Creating a grant + two allocations is genuine product behavior on a disposable seeded org, not staged data.

The grant we create (realistic, fits a community-foundation award that funds both program and operations):

- **Name:** Healthy Aging Partnership Grant
- **Funder:** Greater Cincinnati Foundation _(existing seeded funder; the create form only lets you pick existing funders)_
- **Amount:** $60,000
- **Status:** Awarded
- **Start / End:** 2026-07-01 / 2027-06-30
- **Split:** Capacity Building Fund $40,000 + General Operating Fund $20,000 → Unallocated $0

Screens (single-page detail with tabs; the create form is a modal dialog):

1. **Grants list** (`/grants`) — the seeded grants table (Name / Funder / Status / Amount / Deadline) + "Add grant" action (top-right). Establishes "this is where grants live, here are the ones we have."
2. **Create grant — step 1** — Grant name, Funder (Greater Cincinnati Foundation), Amount ($60,000), Status (Awarded) with the stage-meaning line visible.
3. **Create grant — step 2** — Start Date, End Date, Application Deadline, Description, Notes; "Create grant" button.
4. **Grant detail — just created** — the four money cards: Grant Amount $60,000 / Allocated $0 / Unallocated $60,000 / Remaining to Spend $60,000. (A brand-new grant shows Allocated **$0**, not "No allocations" — that placeholder only appears when the allocated total is null.) Default tab is Overview, which shows the inline grant-details form + a Linked context panel (Funder, Start/End dates); switch to Allocations to add money.
5. **Add allocation dialog (1st)** — Fund = Capacity Building Fund, Amount (USD) = 40000; dialog copy "Document which fund is supporting this grant and how much has been committed."
6. **Detail after 1st allocation** — Allocated $40,000 / Unallocated $20,000; the allocation row in the Allocations tab.
7. **Add allocation dialog (2nd)** — Fund = General Operating Fund, Amount = 20000.
8. **Detail after 2nd allocation** — Allocated $60,000 / Unallocated $0; both allocation rows listed.
9. **Guardrail (trust beat)** — attempt an allocation that pushes the total over $60,000 → the real error "Allocation would exceed grant amount." (If this can't be captured cleanly, the beat is cut, not faked.)

If any screen can't be captured cleanly from the real app, the beat is cut, not faked (real-product rule).

## Hard accuracy guardrails (see `accuracy-sources.md` for citations)

- The Create grant form is a **2-step modal dialog**. Step 1 = Grant name, Funder, Amount, Status. Step 2 = Start Date, End Date, Application Deadline, Description, Notes. Only **name + funder are required** to advance. Do not say it asks for fund allocation on the create form — it does not.
- **Funder must already exist** — the create dialog picks from existing funders; there is no "create funder" inside it. Greater Cincinnati Foundation is a real seeded funder.
- **Allocation happens on the grant detail page, on the Allocations tab**, via an "Add allocation" dialog (Fund select + Amount in USD). It is a separate step from creating the grant. Do not imply you allocate during creation.
- **Grants and funds are separate entities, many-to-many via `grant_fund_allocations`.** One grant can be split across multiple funds; the same fund can back many grants. Funds are created elsewhere (Funds section), not inside the grant flow — the demo org already has four.
- **The app blocks over-allocation:** the server rejects an allocation when existing allocations + the new amount would exceed the grant amount, with the message "Allocation would exceed grant amount." This guard only applies when the grant has an amount set. Use this as the emotional trust anchor — it is genuine behavior.
- **Money is stored as cents**, entered and shown as dollars. The amount field accepts dollars (e.g. 60000 or 60000.00).
- **Creating/editing grants and allocations requires Admin or Editor** (the "Add allocation" button is hidden for viewers). Don't tell a viewer they can do this.
- **Status options** are exactly: Discovery, Application, Submitted, Awarded, Active, Reporting, plus later stages — use **Awarded** for this scenario (its in-app meaning is "The funder approved it; now set up the award details before spending" and its next action is "enter award amount, dates, restrictions, and linked funds").
- No compliance dollar thresholds are needed in P2. If any appear, they must match CLAUDE.md verified facts (single audit $1M, de minimis 15% MTDC, MTDC subaward cap $50k, equipment cap $10k; FFATA/SAM debarment stay $25k). The demo Title III-C grant's notes mention an 8% indirect cap — that is a funder-specific cap, not the federal de minimis rate; we do not narrate it.

## Tone & style direction (for the TTS style header)

- Register: the builder showing a colleague how he files an award letter. Warm, exact, a little dry. Never "in this video we will."
- Pace: unhurried on the *why* (restricted money, the guardrail), brisk on the obvious mechanics (typing a name, picking a date).
- Variation: open by naming the small dread of a new award ("New money should feel good. Mostly it feels like paperwork you're scared to get wrong."), land on quiet competence.
- `GOOGLE_TTS_STYLE`: calm, precise, lightly wry builder voice; slower and reassuring on the money-split and guardrail beats, matter-of-fact on the form mechanics. Never hype.

## Structure (chapters — refine against captured timing)

1. **Cold open / new money, new rules** — an award letter arrives; the money has strings; you need it recorded and split before you spend a cent.
2. **Add the grant** — open Grants, Add grant, the 2-step form; why funder + amount matter; pick Awarded.
3. **Open the grant: the four numbers** — Grant Amount, Allocated, Unallocated, Remaining to Spend; "right now it's all unallocated — let's fix that."
4. **Split it across funds** — Allocations tab → Add allocation → Capacity Building Fund $40k (watch Unallocated drop), then General Operating Fund $20k (Unallocated → $0).
5. **The guardrail** — try to allocate more than the grant; the app stops you. Why that matters for restricted money and audits.
6. **You're set — soft CTA** — where this lives in Help; offer the email-gated **Restricted Fund Tracking Spreadsheet**; tease P4 (tracking spending against the grant).

## CTA (LOCKED)

Soft, email-gated. Offer the **Restricted Fund Tracking Spreadsheet** — a real, published lead magnet (slug `restricted-fund-tracking-spreadsheet`, `.xlsx`, email-gated; landing page `/lp/restricted-fund-tracking`; asset present at `apps/site/src/assets/lead-magnets/restricted-fund-tracking-spreadsheet.xlsx`). It's the exact companion to this video: a spreadsheet for tracking restricted-fund balances, for anyone not yet in GrantPipe. Say "we'll send it to your inbox," never "no email." Then tease P4 ("next, track what you spend against this grant"). No hard pitch — they already signed up.

Title to speak: "the Restricted Fund Tracking Spreadsheet." Frame: "not in GrantPipe yet and tracking this in a spreadsheet? We made a free one built for restricted funds — we'll send it to your inbox."

## Open dependencies

- [x] Capture agent delivers the 9 screens + updates `_capture/RECIPE.md` with a P2 row. The new grant + 2 allocations are created live during capture (real writes to the demo org). **Done 2026-06-02:** `_capture/p2/01..09`. Surfacing the dates on the create form required first fixing a real product bug — the grant date validators rejected date-only `<input type="date">` values; fixed in `packages/shared/src/validators/grants.ts` (merged to master).
- [x] CTA lead magnet locked: **Restricted Fund Tracking Spreadsheet** (real, published, email-gated).
- [x] Real-app ground truth verified: create-grant dialog fields, allocation dialog, four money cards, over-allocation guard, seeded funders/funds/grants. (See `accuracy-sources.md`.)
- [ ] Lock chapter timing to captured screen availability before writing `[VISUAL:]` cues.
