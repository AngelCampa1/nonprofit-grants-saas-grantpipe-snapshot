# P3 — How to Track Restricted Funds Correctly — Research Brief

**Slot:** P3 (product video — **concept-then-demo**; real-app capture REQUIRED for the demo half)
**Target keyword:** `how to track restricted funds` / `restricted funds` (operations-pillar, problem-aware intent)
**Secondary terms it should also satisfy:** "tracking restricted funds nonprofit", "how to track restricted grants", "restricted fund accounting nonprofit", "restricted vs unrestricted funds tracking"
**Audience:** Executive Directors / Development Directors / finance staff at mid-sized nonprofits ($500K–$10M). Not accountants. They already know what restricted money is — they're losing sleep over *proving* they spent it right. Time-poor, audit-anxious.
**Length target:** ~5–7 minutes.
**Voice:** Laomedeia (Gemini `gemini-3.1-flash-tts-preview`). Builder framing — Angel builds grant-compliance software, is not a former CPA/controller/auditor and never claims to be.
**Help target:** `/help/funds` (a planned route — do not imply it exists yet in-app).

## The one idea

A restriction is a promise: "this money is only for X." Tracking it correctly means you can answer one question at any moment — **how much of each restricted pot is left, and can you prove where the rest went?** A class memo in your books tells you what *moved*. It does not answer the restriction question. You need a per-award balance that starts at the award, adds anything new, subtracts what you released as you spent it, and ends at a number you can defend. That running balance — beginning, additions, releases, ending — is the whole job.

That reframing ("a class report shows activity; it doesn't answer the restriction question") is the hook and the bridge into the demo.

## Why this video is different from the slop

Most "track restricted funds" content is either a bookkeeper explaining QuickBooks classes, or a software ad that hand-waves the actual mechanics. Two things make ours honest and useful:

1. **It teaches the FASB model correctly first, then shows one real way to do it.** Restricted vs unrestricted, the two current net-asset classes (with / without donor restrictions — not the retired three), and "release from restriction" as a *reclassification* when the purpose is met. We earn trust on the concept before touching the product.
2. **Builder honesty + real product.** The demo is the actual running GrantPipe app, captured from the real screens — never a mockup. If a screen can't be shown truthfully, the beat is cut. No claim that the tool does anything it doesn't.

## Structure (chapters)

**Concept half (no app):**

0. **Cold open / hook** — the restriction is a promise. The question that matters: "how much is left, and can you prove it?" Set up that a normal activity report can't answer it.
1. **What "restricted" really means** — donor/grantor limits money to a purpose or a time. Two current net-asset classes: with donor restrictions, without donor restrictions. (Note the old three-class model is retired — ASU 2016-14 — so old guides don't confuse viewers.) Board-designated ≠ restricted.
2. **What tracking restricted funds actually requires** — a per-award running balance: beginning balance → additions → releases (as you spend on the purpose) → ending balance. "Release" is a reclassification, not new money. The failure mode: one big checking account + a class memo, and no per-promise balance you can hand an auditor.

**Demo half (real GrantPipe app — captured screens only):**

3. **Set up the fund** — `/funds`: the funds list (card + ledger views), "Add fund" dialog, the three real fund types (unrestricted / temporarily restricted / permanently restricted). Filter the list by type.
4. **See the balance per award** — open a fund detail (`/funds/:id`): the Allocated / Spent / Balance summary cards; Source Allocations (grants feeding the fund) and the Expense Ledger. This is the "how much is left" answer, live.
5. **Prove the restriction** — the Restrictions tab ("Restriction lifecycle" panel): the "Restricted balance" card (Beginning / Additions / Releases / Ending — the same running balance from the concept half), the "Restriction alerts" list (which flags a release with no supporting evidence), and the per-term summary card naming the restriction and its purpose. This is the "can you prove it" answer: the balance plus the system catching the gap. (Restrictions tab is plan-gated — note honestly that it's part of the restriction-lifecycle capability, not every plan. The panel does NOT show a per-release evidence-link row — do not narrate one.)
6. **Outro + soft plug** — recap the one idea (a defensible per-award balance). Soft GrantPipe mention; email-gated **Restricted Fund Tracking Spreadsheet** lead magnet ("we'll send it to your inbox"). The spreadsheet is the free starting point; the app is the upgrade when the spreadsheet stops scaling.

## CTA

Soft, teach-first. Lead magnet = the existing **Restricted Fund Tracking Spreadsheet** (slug `restricted-fund-tracking-spreadsheet`; LP `apps/site/src/pages/lp/restricted-fund-tracking.astro`, vanity `grantpipe.com/restricted-fund-tracking`), email-gated. No hard pitch. Same lead magnet S1 uses, so the two videos cross-link cleanly.

## Real-app capture plan (demo half)

Follow `docs/youtube/_capture/RECIPE.md` exactly. New script `capture-p3.mjs`, output `_capture/p3/`. CDP `Page.captureScreenshot` (never `page.screenshot()`), repo Playwright via `createRequire`, demo org on localhost:3050. Re-seed before capture if the run makes any writes. Target the seeded **Title III-C Nutrition Fund** (temporarily_restricted; the only demo fund with restriction-lifecycle data — one evidenced release + one un-evidenced release that raises an alert). Demo org is seeded on the `growth` plan (`hasRestrictionLifecycle` true), so the Restrictions tab renders the real panel, not the upsell. Candidate screens: funds list (card view), funds list with the type filter set to Temporarily Restricted (or ledger view), Add-fund dialog with the type select open showing the three types, the fund detail Overview with Allocated/Spent/Balance cards + Source Allocations + Expense Ledger, and the Restrictions tab showing the "Restricted balance" card (Beginning/Additions/Releases/Ending) + the "Restriction alerts" list + the per-term card. Capture against an app built from master. Read-only — no writes, no re-seed required (but a re-seed makes balances deterministic).

## Out of scope / do-not-claim (real-product integrity — features the app does NOT have)

- **No "restricted fund report" export button.** Do not show or imply a one-click restricted-fund export/schedule. It doesn't exist. Reports come from the per-fund balances on screen.
- **GrantPipe posts no journal entries and does not write to QuickBooks/your GL.** Never imply it books or syncs accounting entries. It tracks balances and evidence; the books live in your accounting system.
- **No per-allocation note/purpose field.** A grant→fund allocation has an amount, not a free-text purpose line. Don't narrate one.
- **Releases are recorded inside a fund's Restrictions tab** (`RestrictionReleaseForm`), not from the funds list. Don't show releasing from the list.
- **Restrictions tab is plan-gated** (`hasRestrictionLifecycle`). State this honestly; do not present it as universally available.
- **`/help/funds` is a target, not a live route.** Don't tell viewers to "go to the help page at…" as if it resolves today.
- **Allocations cannot exceed the grant amount** (server guard "Allocation would exceed grant amount") — true and fine to mention as a guardrail, but P3's spine is funds, not the allocation flow (that's P2).
- Federal thresholds aren't needed here. If any appear, they MUST match CLAUDE.md verified facts ($1M single audit; de minimis 15% MTDC; MTDC subaward cap $50k; equipment cap $10k; FFATA/SAM debarment stay $25k). Default: don't introduce them.
- Do not claim GrantPipe user counts, testimonials, or that Angel was a nonprofit finance professional.
- Governmental fund accounting (GASB) is a separate world; one honest line at most. This video is nonprofit FASB ASC 958.
