# P2 Publish Kit — Add a Grant and Allocate It Across Funds

_Copy here is user-facing marketing copy → passed through stop-slop / humanizer / third-grade voice. Honest, builder tone. No fabricated proof. Chapter timestamps locked from final audio with the 0.35s crossfade shift (`production/durations.json`, start − i×0.35): 00=0:00, 01=0:31, 02=1:09, 03=1:41, 04=2:24, 05=2:56. Final render: `output/add-grant-allocate.mp4` (1920×1080, 30fps CFR, 3:22, 201.8s). Production-ready: 5 consecutive clean whole-video reviews (7 dimensions each)._

## Title options (pick at upload)

1. **Add a Grant in GrantPipe and Split It Across Your Funds** _(primary — names the two jobs, plain language)_
2. How to Record a Restricted Grant and Allocate It (Step by Step)
3. Grant Allocation in GrantPipe: Split One Award Across Two Funds in 2 Minutes

## Description

Got a grant with strings attached? This video shows the two things you do first: record the grant, then split its money across the funds it's allowed to pay for.

I built GrantPipe, so I'll walk you through it the way I'd show a colleague.

What's in the video:
- Adding a grant with the short two-step form (name, funder, amount, status, then dates)
- The four numbers on every grant: Grant Amount, Allocated, Unallocated, and Remaining to Spend, and what each one means
- Splitting one $60,000 award across two funds and watching the totals update as you go
- The guardrail that stops you from allocating more than the grant is worth, with the exact message you'll see
- Why that one rule is the whole reason a tool beats a spreadsheet here

Still tracking this in a spreadsheet? We made a free one built for restricted funds: the Restricted Fund Tracking Spreadsheet. We'll send it to your inbox: [LINK TO restricted-fund-tracking lead magnet]

Next video: track what you actually spend against this grant, so you always know what's left.

GrantPipe is donor management and grant compliance in one place, built for mid-sized nonprofits. Learn more: https://grantpipe.com

— Chapters —
0:00 New money, new rules
0:31 Add the grant
1:09 The four numbers
1:41 Split it across funds
2:24 The guardrail
2:56 You're set

## Tags

grantpipe, nonprofit software, grant management, grant allocation, restricted funds, fund accounting software, nonprofit grant compliance, grant tracking, restricted grant, fund accounting, nonprofit finance, grant budgeting

## Thumbnail copy

- Primary text: **"SPLIT IT RIGHT"** (Sora bold, ink on warm paper)
- Sub-text / supporting: "one grant, two funds, math handled"
- Visual: real GrantPipe grant-detail screen showing the four money cards (from `production/assets/screens/`), GrantPipe mark in corner. No stock photos, no hands, no charity clichés. Warm paper + emerald accent. Pill-shaped chip on the supporting text.

## CTA / distribution notes

- Lead magnet: **Restricted Fund Tracking Spreadsheet** — email-gated. Description link must point at the real lead-magnet route (confirm slug `restricted-fund-tracking`; landing page `apps/site/src/pages/lp/restricted-fund-tracking.astro`). Say "we'll send it to your inbox."
- Home: embed near the grants/allocations help section; second beat in the product onboarding sequence after P1.
- LinkedIn: cut a 30–60s vertical of the guardrail beat (2:24–2:56, the "GrantPipe stops you" trust moment) with a link to the full video.
- YouTube visibility: Public (can surface), but owned-distribution-first; no SEO keyword target.

## Pre-publish gate

- [ ] Run `node scripts/linkedin-post-review-gate.mjs content/social/linkedin` only if/when the LinkedIn clip copy is staged (not for the YouTube upload itself).
- [ ] Confirm the lead-magnet link resolves (`restricted-fund-tracking`) before publishing the description.
- [ ] Publishing to YouTube/Postiz requires explicit owner go-ahead (per repo policy, video publishing via the `postiz` CLI is not auto-authorized).
- [x] Set real chapter timestamps from final audio with crossfade shift (locked: 0:00 / 0:31 / 1:09 / 1:41 / 2:24 / 2:56).
