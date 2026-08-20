# S1 Publish Kit — What Is Fund Accounting (Nonprofit Basics)

_Copy here is user-facing marketing copy → passed through stop-slop / humanizer / third-grade voice. Honest, builder tone. No fabricated proof. This is a concept explainer (SEO/evergreen), not a product walkthrough — no real-app capture. Chapter timestamps locked from final audio with the 0.35s crossfade shift (`production/durations.json`, start − i×0.35): 00=0:00, 01=0:56, 02=1:54, 03=2:49, 04=4:06, 05=5:10, 06=6:01. Final render: `output/fund-accounting.mp4` (1920×1080, 30fps CFR, 6:48, 408.27s). Production-ready: 5 consecutive clean whole-video reviews (7 dimensions each)._

## Title options (pick at upload)

1. **What Is Fund Accounting? A Plain-English Guide for Nonprofits** _(primary — names the topic, promises no jargon)_
2. Restricted vs. Unrestricted Funds, Explained in 7 Minutes
3. Fund Accounting for Nonprofits: Why a Profit-and-Loss Report Isn't Enough

## Description

Your bookkeeper hands you a report full of words like restricted, unrestricted, and net assets. Most people nod and move on. This video explains what those words mean, in plain English, in about seven minutes.

A business asks one question at year-end: did we make a profit? A nonprofit has to answer a different one: did we use each dollar the way we promised? Fund accounting is how you answer it. I walk through what it is, why nonprofits need it, and how the reports differ from a regular business — no jargon for its own sake, and no pitch to go hire a big firm.

I build grant compliance software, so I had to learn exactly how this money is supposed to move. I'm not an auditor, and I won't talk like one. You get the version a busy director actually needs.

What's in the video:
- The one question fund accounting is built to answer
- Restricted vs. unrestricted money, in plain words: promised money and free money
- Why a normal income statement can't prove you kept a funder's restriction
- The two groups the rules now use (not the old three) and why old guides are out of date
- A worked example: a $50,000 restricted grant and $30,000 in general donations, kept apart
- The report names that change for nonprofits: statement of financial position, statement of activities, net assets

Want a head start? We made a free Restricted Fund Tracking Spreadsheet. It sets up the envelopes for you. We'll send it to your inbox: [LINK TO restricted-fund-tracking lead magnet]

GrantPipe is donor management and grant compliance in one place, built for mid-sized nonprofits. Learn more: https://grantpipe.com

— Chapters —
0:00 Two different questions
0:56 What fund accounting is
1:54 Why nonprofits need it
2:49 The building blocks
4:06 A worked example
5:10 How it differs from regular accounting
6:01 One idea to remember

## Tags

fund accounting, nonprofit accounting, restricted funds, unrestricted funds, net assets, nonprofit finance, fund accounting explained, nonprofit bookkeeping, statement of activities, statement of financial position, grant compliance, nonprofit basics, restricted vs unrestricted, donor restrictions, grantpipe

## Thumbnail copy

- Primary text: **"FUND ACCOUNTING"** (Sora bold, ink on warm paper)
- Sub-text / supporting: "restricted vs. free money, explained"
- Visual: hand-built concept art from the video — the row of labeled envelopes (after-school, building, general) next to one bank account. No real-app screens (this is a concept video), no stock photos, no hands, no charity clichés. Warm paper + emerald accent, ochre highlight. Pill-shaped chip on the supporting text.

## CTA / distribution notes

- Lead magnet: **Restricted Fund Tracking Spreadsheet** — email-gated. Description link must point at the real lead-magnet route (confirm slug `restricted-fund-tracking`; landing page `apps/site/src/pages/lp/restricted-fund-tracking.astro`). Say "we'll send it to your inbox."
- This is the top-of-funnel concept piece: link it from blog/SEO pages on fund accounting and from the product videos (P-series) as the "what is this" primer.
- LinkedIn: cut a 30–60s vertical of the envelopes-vs-one-account beat (chapter 01, ~1:09–1:36) or the two-groups-not-three correction (chapter 03), with a link to the full video.
- YouTube visibility: Public, SEO target ("what is fund accounting", "restricted vs unrestricted funds"). Evergreen — no dated claims beyond the ASU 2016-14 two-group rule, which is stated as a standing fact.

## Accuracy note

Every claim traces to `accuracy-sources.md` (FASB ASC 958 / ASU 2016-14). The two-group classification (net assets with/without donor restrictions, replacing the old three) applies to fiscal years beginning after December 15, 2017 — stated in the video as "financial years that start after late twenty seventeen." Governments use a different model (GASB), called out as a separate world. No federal Uniform Guidance thresholds appear in S1.

## Pre-publish gate

- [ ] Run `node scripts/linkedin-post-review-gate.mjs content/social/linkedin` only if/when the LinkedIn clip copy is staged (not for the YouTube upload itself).
- [ ] Confirm the lead-magnet link resolves (`restricted-fund-tracking`) before publishing the description.
- [ ] Publishing to YouTube/Postiz requires explicit owner go-ahead (per repo policy, video publishing via the `postiz` CLI is not auto-authorized).
- [x] Set real chapter timestamps from final audio with crossfade shift (locked: 0:00 / 0:56 / 1:54 / 2:49 / 4:06 / 5:10 / 6:01).
