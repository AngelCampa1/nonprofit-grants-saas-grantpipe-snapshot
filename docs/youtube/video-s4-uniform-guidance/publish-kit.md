# S4 Publish Kit — Uniform Guidance (2 CFR 200) Explained in Plain English

_User-facing marketing copy → passed through stop-slop / humanizer / third-grade voice. Honest builder tone. No fabricated proof. This is a concept explainer (SEO/evergreen), not a product walkthrough — no real-app capture. Chapter timestamps locked from final audio with the 0.35s crossfade shift (`production/durations.json`, start − i×0.35): 00=0:00, 01=0:45, 02=1:31, 03=2:05, 04=2:55, 05=4:04, 06=4:53. Final render: `output/uniform-guidance.mp4` (1920×1080, 30fps CFR, 5:36, 335.77s, −16.4 LUFS, faststart; 107 SRT cues, 0 overlaps). Production-ready: 5 consecutive clean whole-video reviews (7 dimensions each)._

## Title options (pick at upload)

1. **Uniform Guidance (2 CFR 200) Explained in Plain English** _(primary — names the rule, promises no jargon)_
2. The Uniform Guidance for Nonprofits: 4 Numbers That Changed in 2024
3. 2 CFR 200 in 6 Minutes: Run It, Cost It, Prove It

## Description

If your nonprofit takes federal money, one rulebook covers all of it. It's called the Uniform Guidance — officially 2 CFR 200. Most people never read it. They just hear "compliance" and tense up. This video explains what's actually in it, in plain English, in about six minutes.

You really live in three parts of the rule: how you run the grant, what you can charge to it, and who checks your work. I walk through all three, then show you the four numbers that changed in 2024 — because a lot of advice online still uses the old ones.

I build grant compliance software, so I had to learn exactly what these rules require. I'm not an auditor, and I won't talk like one. You get the version a busy director actually needs.

What's in the video:
- What the Uniform Guidance is, and why eight old rulebooks became one
- Who it binds: the agency, the pass-through, you, and your subrecipients
- The three jobs: run it, cost it, prove it
- The cost test every charge has to pass: reasonable, allocable, allowable
- Direct vs. indirect costs, and the de minimis indirect rate
- The four 2024 changes: de minimis up to 15%, equipment $10,000, subaward base $50,000, single audit $1,000,000
- What a single audit is, and the spend trigger that decides if you need one

Want a simple place to start? We made a free Grant Compliance Checklist. It covers the basics so nothing slips. We'll send it to your inbox: [LINK TO grant-compliance-checklist lead magnet]

GrantPipe is donor management and grant compliance in one place, built for mid-sized nonprofits. Learn more: https://grantpipe.com

— Chapters —
0:00 One rulebook for federal money
0:45 What the Uniform Guidance is
1:31 One rulebook, three jobs
2:05 The cost test
2:55 The four numbers that changed in 2024
4:04 The single audit
4:53 What to remember

## Tags

uniform guidance, 2 CFR 200, federal grants, nonprofit compliance, grant compliance, single audit, single audit threshold, de minimis indirect rate, indirect cost rate, MTDC, equipment threshold, subaward, OMB super circular, 2024 uniform guidance changes, nonprofit federal funding, grants management, grantpipe

## Thumbnail copy

- Primary text: **"UNIFORM GUIDANCE"** (Sora bold, emerald on warm paper)
- Sub-text / supporting: "2 CFR 200, in plain English"
- Visual: hand-built concept art from the video — the four-row ledger with old values struck through and new values ticking up ($10K, $50K, $1M), or the eight worn booklets merging into one "2 CFR 200" book. No real-app screens (this is a concept video), no stock photos, no hands, no charity clichés. Warm paper + emerald accent, ochre highlight. Pill-shaped chip on the supporting text.

## CTA / distribution notes

- Lead magnet: **Grant Compliance Checklist** — email-gated. Description link must point at the real lead-magnet route (confirm slug `grant-compliance-checklist`; landing page under `apps/site/src/pages/lp/`). Say "we'll send it to your inbox."
- This pairs with S1 (fund accounting) and the single-audit piece as the top-of-funnel federal-compliance primer set. Link it from blog/SEO pages on Uniform Guidance and from the product videos (P-series) as the "what are the rules" explainer.
- LinkedIn: cut a 30–60s vertical of the four-numbers ledger beat (chapter 04, ~2:55–4:04) with the old→new ticks, or the "run it / cost it / prove it" beat (chapter 02), with a link to the full video.
- YouTube visibility: Public, SEO target ("uniform guidance explained", "2 CFR 200", "single audit threshold 2024"). The four-numbers beat is dated to the 2024 OMB revision and stated as current — revisit if OMB revises again.

## Accuracy note

Every claim traces to `accuracy-sources.md` (current eCFR 2 CFR Part 200, the 2024 OMB final rule 89 FR 30046 / 89 FR 30136, the Federal Audit Clearinghouse, and CLAUDE.md "Verified Facts"). The four core numbers match CLAUDE.md exactly: de minimis up to 15% of MTDC (was 10%), equipment $10,000 (was $5,000), subaward first $50,000 toward MTDC (was $25,000), single audit $1,000,000 expended (was $750,000). De minimis is stated as a ceiling ("up to"). The single-audit trigger is funds **expended**, organization-wide, and keys to fiscal years that begin on/after Oct 1, 2024 (equivalent to ending on/after Sept 30, 2025 for a 12-month year — sanctioned in `accuracy-sources.md` N4). FFATA and suspension/debarment thresholds are deliberately excluded to avoid contested off-spine numbers. The retired $750,000 figure appears only struck-through as history; the repo regression sweep (`apps/site/src/audit-threshold-amount.test.ts`) whitelists this video's path for that reason.

## Pre-publish gate

- [ ] Run `node scripts/linkedin-post-review-gate.mjs content/social/linkedin` only if/when the LinkedIn clip copy is staged (not for the YouTube upload itself).
- [ ] Confirm the lead-magnet link resolves (`grant-compliance-checklist`) before publishing the description.
- [ ] Publishing to YouTube/Postiz requires explicit owner go-ahead (per repo policy, video publishing via the `postiz` CLI is not auto-authorized).
- [x] Set real chapter timestamps from final audio with crossfade shift (locked: 0:00 / 0:45 / 1:31 / 2:05 / 2:55 / 4:04 / 4:53).
