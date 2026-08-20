# P4 — How to Track Grant Spending Without Losing Your Mind — Research Brief

**Slot:** P4 (product video — **concept-then-demo**; real-app capture REQUIRED for the demo half)
**Target keyword:** `how to track grant spending` / `track grant expenses` (operations-pillar, problem-aware intent)
**Secondary terms it should also satisfy:** "tracking grant expenses nonprofit", "grant spend down tracking", "how much grant money is left", "grant burn rate nonprofit", "grant expense tracking spreadsheet alternative"
**Audience:** Executive Directors / Development Directors / program & finance staff at mid-sized nonprofits ($500K–$10M). Not accountants. They have the grant; now they have to spend it down on the right things, on time, and be able to show it. Time-poor, deadline-anxious, afraid of finding out they overspent (or underspent) at report time.
**Length target:** ~4–6 minutes.
**Voice:** Laomedeia (Gemini `gemini-3.1-flash-tts-preview`). Builder framing — Angel builds grant-compliance software, is not a former CPA/controller/grants officer and never claims to be.
**Help target:** none promised in-app (do not tell viewers to visit a help route that may not resolve).

## The one idea

Tracking grant spending means you can answer one question at any moment: **how much of this grant is left to spend, and can you show, line by line, where the rest went?** A single checking-account balance can't answer it — it mixes every grant and every dollar of your own money together. You need a per-grant running number: the award amount, minus everything you've spent against *that* grant, equals what's left. Pair that with an itemized list of each cost and a sense of pace (how fast you're burning it), and the grant deadline stops being a surprise.

The reframing — "your bank balance is not your grant balance" — is the hook and the bridge into the demo.

Two ways grant spending goes wrong, and both cost you:
- **Overspend / wrong spend** — you pay for something the grant doesn't cover, or blow past the award, and you eat the cost (or have to give it back as a disallowed cost).
- **Underspend** — the period ends with money unspent; the funder claws it back, and your next award shrinks.

A per-grant remaining number plus a burn rate catches both early, while you can still steer.

## Why this video is different from the slop

Most "track grant spending" content is a QuickBooks classes tutorial or a software ad that hand-waves the mechanics. Two things keep ours honest and useful:

1. **It teaches the mental model first, then shows one real way to do it.** Every dollar belongs to a grant; the number that matters is *remaining*; pace tells you if you'll land on zero by the close date. We earn trust on the concept before touching the product.
2. **Builder honesty + real product.** The demo is the actual running GrantPipe app, captured from real screens with the seeded demo org (Heartland Senior Services) — never a mockup. If a screen can't be shown truthfully, the beat is cut. No claim that the tool does anything it doesn't.

## Structure (chapters)

**Concept half (no app):**

0. **Cold open / hook** — the question your bank balance can't answer: "how much is left on *this* grant, and where did it go?" One account, five grants, your own money — the balance tells you nothing per-grant.
1. **What tracking grant spending really means** — every dollar you spend belongs to one grant. The number that matters is *remaining*: award amount minus what you've spent against it. Two failure directions (overspend → you eat it; underspend → clawed back).
2. **What it actually takes** — three things: a per-grant running total you can trust, an itemized list you can hand a funder, and a sense of pace so the deadline doesn't ambush you. The failure mode: one checking account and a shoebox of receipts, no per-grant view, and you find out in month eleven.

**Demo half (real GrantPipe app — captured screens only; grant = "Title III-C Nutrition Services Grant," $185,000):**

3. **The grant's four numbers** — open the grant detail (`/grants/:id`, Overview): the four cards — **Grant Amount**, **Allocated**, **Unallocated**, **Remaining to Spend**. Remaining to Spend is the live answer to "how much is left," and it's driven by recorded expenses, not by allocations. (Expected: $185,000 amount; ~$104,540 remaining after ~$80,460 of expenses — confirm exact figures at capture.)
4. **Record what you spend** — the **Expenses** tab: the itemized ledger (six months of real seeded entries — program supplies and personnel), and the **Add expense** dialog. The dialog has exactly three fields: **Amount (USD)**, **Date**, **Description**. Recording an expense ties it to the grant (and its fund) and ticks Remaining to Spend down. This is the "list you can hand someone."
5. **Know your pace** — the **burn rate** line on the Overview ("Burn rate: $X/mo") and the **Spend-Down** view. Pace answers the second anxiety: at this rate, do you land near zero by the close date, or are you about to overspend / leave money on the table? This is the "without losing your mind" payoff — you see drift early. (Spend-Down is a Growth-plan capability; state that honestly. The demo org is on Growth, so it renders.)
6. **Outro + soft plug** — recap the one idea (a per-grant remaining number plus an itemized list and a pace). Soft GrantPipe mention; email-gated lead magnet ("we'll send it to your inbox"). Cross-link P3 (restricted funds) and tee up P5 (managing multiple grants at once).

## CTA

Soft, teach-first. **Primary lead magnet: the Restricted Fund Tracking Spreadsheet** (slug `restricted-fund-tracking`; LP `apps/site/src/pages/lp/restricted-fund-tracking.astro`, confirmed present; email-gated), the same magnet P2/P3/S1 use, so the operations videos cross-link cleanly. A **Grant Budget Template** (`apps/site/lead-magnets/grant-budget-template.xlsx`) exists and is a closer topical match; if a live email-gated landing route for it is confirmed at publish time, prefer it — otherwise use restricted-fund-tracking. No hard pitch.

## Real-app capture plan (demo half)

Follow `docs/youtube/_capture/RECIPE.md` exactly. New script `capture-p4.mjs`, output `_capture/p4/`. CDP `Page.captureScreenshot` (never `page.screenshot()`), repo Playwright via `createRequire`, demo org on localhost:3050, login `demo@grantpipe.com` / `Demo2026!`. **Re-seed before capture** (`pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts`) so balances are deterministic. Target the seeded **Title III-C Nutrition Services Grant** ($185,000, ~$80,460 in expenses across 11 rows / six months — the richest spend data in the seed). Read-only capture; if showing the Add-expense dialog, capture the open empty form (do not submit, or submit then re-seed).

Candidate screens:
- Grant detail **Overview** — the four cards (Grant Amount / Allocated / Unallocated / Remaining to Spend) + the burn-rate line.
- A tight crop of the **Remaining to Spend** card.
- **Expenses** tab — the itemized ledger (six months of entries).
- **Add expense** dialog open, showing the three fields (Amount / Date / Description) and nothing else.
- **Spend-Down** view — burn rate / pace.
- (Cross-link) Fund detail **Spent** card on the Title III-C Nutrition Fund, to show the same dollars from the fund side (Balance $104,540 matches P3). Optional.

Capture against an app built from master.

## Out of scope / do-not-claim (real-product integrity — verified against source)

- **The Budget tab is EMPTY for the demo org.** No budget versions / lines / line-allocations are seeded, so budget-vs-actual (Category / Approved / Actual / Planned / Remaining / Variance) renders with no data. **Do NOT show the Budget tab and do NOT claim category-level variance tracking in this video.** (The feature exists in code; it is not demo-ready with seeded data. Per the real-product rule, the beat is cut.)
- **GrantPipe posts no journal entries when you add an expense, and does not sync to QuickBooks or any external GL.** It tracks balances and an expense list; the books live in your accounting system. Never imply it books or syncs accounting entries.
- **No bank-feed import / transaction matching.** You record expenses; the app does not pull a bank feed and auto-tag transactions to grants.
- **`expenses.category` is free text, not 2 CFR cost categories.** Do not claim the app auto-classifies spend by Uniform Guidance cost category. (And the Add-expense UI form doesn't even expose a category field — only Amount, Date, Description.)
- **No receipt / document attachment on an individual expense row.** Documents attach at the grant or fund level, not per expense line. Don't narrate "attach the receipt to the expense."
- **There is no "Spent" card on the grant detail page** — the grant shows **Remaining to Spend**. "Spent" appears on the **fund** detail page. Keep the labels exact.
- **No one-click "grant spending report" export for plain expenses.** The Spend-Down report is a separate Growth+ compliance feature; don't conflate it with a generic expense export.
- **Spend-Down is plan-gated (Growth+).** State honestly; the demo org is on Growth so it renders. Don't present it as universally available.
- **Only Editors/Admins can record expenses** (`grants:edit` + `funds:edit`); Viewers and Auditors are read-only. Fine to skip, don't misstate.
- **Managing multiple grants at once is P5.** Keep P4 to a single grant's spend-down. One honest line teeing up P5 is fine.
- **Federal thresholds aren't needed here.** If any appear, they MUST match CLAUDE.md verified facts (single audit $1,000,000; de minimis 15% MTDC; MTDC subaward cap $50,000; equipment cap $10,000; FFATA/SAM debarment stay $25,000). Default: don't introduce them.
- Do not claim GrantPipe user counts, testimonials, or that Angel was a nonprofit finance professional.
