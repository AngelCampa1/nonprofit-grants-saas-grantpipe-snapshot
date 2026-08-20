# P3 Publish Kit — How to Track Restricted Funds Correctly

_User-facing marketing copy → passed through stop-slop / humanizer / third-grade voice. Honest, builder tone. No fabricated proof. Concept-then-demo: scenes 0–2 are hand-built concept art; scenes 3–5 are the real running app (seeded demo fund "Title III-C Nutrition Fund"); scene 6 is the recap + CTA. Chapter timestamps locked from final audio with the 0.35s crossfade shift (`production/durations.json`, start − i×0.35): 00=0:00, 01=0:43, 02=1:21, 03=1:54, 04=2:23, 05=2:54, 06=3:29. Final render: `output/track-restricted-funds.mp4` (1920×1080, 30fps CFR, 4:07, 247.17s, −16.3 LUFS, −4.4 dBTP, faststart; `output/captions.srt` 72 cues, 0 overlaps). Production-ready: 5 consecutive clean whole-video reviews (7 dimensions each)._

## Title options (pick at upload)

1. **How to Track Restricted Funds Correctly** _(primary — names the job in plain words; matches search intent)_
2. Restricted Funds: How to Keep a Balance You Can Defend
3. Track Restricted Funds the Right Way (for Nonprofit Finance Teams)

## Description

A restriction is a promise: a funder gives you money for one thing, and from then on you have to prove how much is left. A normal activity report won't tell you that. This video shows you how to track restricted funds so you can answer the question any time.

I build GrantPipe, so I'll walk you through it the way I'd show a colleague. I'm not an auditor, and I won't talk like one.

What's in the video:
- What "restricted" really means, and the two groups nonprofit books use now (with donor restrictions, and without)
- The one trap to skip: money your board sets aside is not restricted
- The running balance every award needs: start, add, release as you spend, end
- Setting up a fund in the real app and picking its type
- Reading the three numbers on a fund: Allocated, Spent, and a Balance the app works out for you
- Proving the restriction in the Restrictions tab, with the app flagging a release that has no support attached

Still tracking this in a spreadsheet? We made a free one built for restricted funds: the Restricted Fund Tracking Spreadsheet. We'll send it to your inbox: [LINK TO restricted-fund-tracking lead magnet]

GrantPipe is donor management and grant compliance in one place, built for mid-sized nonprofits. Learn more: https://grantpipe.com

— Chapters —
0:00 The question a report can't answer
0:43 What restricted really means
1:21 What tracking it actually takes
1:54 Set up the fund
2:23 See the balance per award
2:54 Prove the restriction
3:29 One thing to remember

## Tags

grantpipe, restricted funds, restricted fund accounting, nonprofit fund accounting, fund accounting software, nonprofit grant compliance, net assets with donor restrictions, FASB ASC 958, grant tracking, restricted vs unrestricted funds, nonprofit finance, grant management software

## Thumbnail copy

- Primary text: **"PROVE IT'S LEFT"** (Sora bold, ink on warm paper)
- Sub-text / supporting: "a balance you can defend, per promise"
- Visual: real GrantPipe fund-detail screen showing the three summary cards — Allocated / Spent / Balance (from `production/assets/screens/`), GrantPipe mark in corner. No stock photos, no hands, no charity clichés. Warm paper + emerald accent. Pill-shaped chip on the supporting text.

## CTA / distribution notes

- Lead magnet: **Restricted Fund Tracking Spreadsheet** — email-gated. Description link points at the real lead-magnet route (slug `restricted-fund-tracking`; landing page `apps/site/src/pages/lp/restricted-fund-tracking.astro`, confirmed present). Say "we'll send it to your inbox."
- Home: embed near the funds / restricted-fund help section; third beat in the product onboarding sequence after P1 and P2.
- LinkedIn: cut a 30–60s vertical of the Restrictions-tab beat (2:54–3:29, the "the app flags a release with no support" trust moment) with a link to the full video.
- YouTube visibility: Public (can surface), but owned-distribution-first; no SEO keyword target (the S-series carries SEO).

## Pre-publish gate

- [ ] Run `node scripts/linkedin-post-review-gate.mjs content/social/linkedin` only if/when the LinkedIn clip copy is staged (not for the YouTube upload itself).
- [ ] Confirm the lead-magnet link resolves (`restricted-fund-tracking`) before publishing the description.
- [ ] Publishing to YouTube/Postiz requires explicit owner go-ahead (per repo policy, video publishing via the `postiz` CLI is not auto-authorized).
- [x] Set real chapter timestamps from final audio with crossfade shift (locked: 0:00 / 0:43 / 1:21 / 1:54 / 2:23 / 2:54 / 3:29).
