# GrantPipe YouTube — Production Playbook (cross-session)

_Authoritative standard for producing the 15 videos in `2026-06-02-video-distribution-plan.md`. Every session and every sub-agent reads this first. Update the tracker at the bottom after each milestone._

## Mission

Produce 15 evergreen videos to a high bar: engaging, with real motion, with tight audio↔image connection. Not scrappy. One video is finished only when it is **production-ready** and has passed **≥5 whole-video reviews** (see Review Protocol). Then move to the next. This spans many sessions — never rush to "wrap up."

- **Voice:** Laomedeia (Gemini `gemini-3.1-flash-tts-preview`, via gcloud ADC).
- **Style:** varies per video, never monotonous, never generic-AI. Set a per-video `GOOGLE_TTS_STYLE` direction in the script header.
- **Founder framing:** Angel is a *builder*, not a former grants officer. Never fabricate sector experience, testimonials, user counts, or social proof.
- **Real product rule (product videos P1–P8):** every demo beat is the *actual running GrantPipe app* with the seeded demo org (Heartland Senior Services) — never a mockup, slide, or placeholder. If a feature isn't demo-ready, cut the beat or hold the video. See `_capture/RECIPE.md`.

## The 15 (sequence per the plan)

Sequencing: P1, P2 → S1, S4 → P3, P4, P5, P7 → P6, P8 → S2 → S3, S5, S6, S7.

| Slot | Title | Type | Real app? |
| --- | --- | --- | --- |
| P1 | Getting Started: Set Up Your Org & Import Your Data | product (screen-record) | yes |
| P2 | Add a Grant and Allocate It Across Funds | product | yes |
| P3 | How to Track Restricted Funds Correctly | concept-then-demo | yes |
| P4 | How to Track Grant Spending Without Losing Your Mind | concept-then-demo | yes |
| P5 | How to Manage Multiple Grants at Once | concept-then-demo | yes |
| P6 | Never Miss a Compliance Deadline (Deadlines + Evidence) | product | yes |
| P7 | Generate the Reports Funders & Auditors Actually Want | concept-then-demo | yes |
| P8 | Upload an Award Letter, Skip the Data Entry (AI Intake) | product | yes |
| S1 | What Is Fund Accounting? (Explained for Nonprofits) | SEO concept | no |
| S2 | Best Grant Management Software for Nonprofits (2026) | SEO | partial |
| S3 | Nonprofit Budget Template: How to Build One | SEO | no |
| S4 | Uniform Guidance (2 CFR 200) Explained in Plain English | SEO concept | no |
| S5 | Restricted vs Unrestricted Funds (With Real Examples) | SEO concept | no |
| S6 | What Is Grant Compliance? (And Where Nonprofits Slip Up) | SEO concept | no |
| S7 | How to Get Into Grant Management (Skills + Certification) | SEO | no |

## Folder standard (clone the proven exemplar `video-03-single-audit`)

```
video-NN-<slug>/
  research-brief.md        # facts, sources, angle, keyword
  accuracy-sources.md      # every claim → citation (no-lie backbone)
  script-draft.md          # first pass
  script-final.md          # chapters = "### " headings; narration paragraphs; [VISUAL: …] cues
  publish-kit.md           # title, description, tags, chapters, thumbnail copy, CTA
  audio/                   # chapter-NN.mp3 + manifest.json (from voiceover)
  production/
    voiceover.mjs          # thin wrapper → ../../_lib/voiceover-gemini.mjs
    lib.mjs                # shared CSS/helpers (brand tokens) for compositions
    build-compositions.mjs # emits compositions/chapter-NN.html from durations.json
    build-durations.mjs    # durations.json from audio
    durations.json
    compositions/chapter-NN.html
    assets/                # fonts/, gsap.min.js, grantpipe-mark.svg, captured screens
    render-all.sh          # render each composition → ../output/chapter-NN.silent.mp4
    assemble.sh            # mux narration + loudnorm + concat → final mp4
    gen-srt.mjs            # captions.srt
    hyperframes.json
  output/<slug>.mp4 + captions.srt
```

Brand tokens (from `video-03/production/lib.mjs`): emerald `#065f46` + archival ochre `#b9842b` on warm paper `#faf7f0`, ink `#17211c`. Fonts: Sora (display), IBM Plex Sans (body), IBM Plex Mono (data/labels). Pill geometry on all button-like shapes. **No grid-texture backgrounds** (radial glows + solid warm paper only).

## Pipeline (commands)

```bash
# 1. TTS — from the video's production/ folder. Voice defaults to Laomedeia.
#    Always pass explicit paths so audio lands in ../audio (sibling of production/, where build-durations reads it).
node ../../_lib/voiceover-gemini.mjs --script ../script-final.md --out ../audio --dry-run   # char counts, no spend
node ../../_lib/voiceover-gemini.mjs --script ../script-final.md --out ../audio            # writes ../audio/chapter-NN.mp3 + manifest.json
#    (ADC: `gcloud auth application-default print-access-token` must succeed)
#    Do NOT use an ElevenLabs voiceover.mjs wrapper — the channel voice is Laomedeia via the shared Gemini lib only.

# 2. Durations from audio
node build-durations.mjs                           # writes durations.json

# 3. Compositions (one HyperFrames HTML per chapter, sized to that chapter's audio)
node build-compositions.mjs                        # writes compositions/chapter-NN.html

# 4. Lint/validate/inspect every composition (HyperFrames quality gates)
npx hyperframes lint && npx hyperframes validate   # contrast + structure
npx hyperframes inspect                            # layout/overflow

# 5. Render each composition to silent mp4
./render-all.sh standard

# 6. Mux narration + loudnorm + concat → final mp4
./assemble.sh

# 7. Captions
node gen-srt.mjs
```

TTS auth note: the repo gcloud *core* login is dead; the lib mints an ADC token via `gcloud auth application-default print-access-token` (authed as whichever Google account ran `gcloud auth application-default login` for this project). ADC tokens last ~1h.

## Script + writing-pass protocol (mandatory, in order)

1. **research-brief.md + accuracy-sources.md first.** Every factual claim gets a citation. Compliance numbers MUST match `CLAUDE.md` "Verified Facts" (single audit $1M, de minimis 15% MTDC, MTDC subaward cap $50k, equipment cap $10k; FFATA/SAM debarment stay $25k).
2. Draft the script in the `### ` chapter + `[VISUAL: …]` format. Narration = plain paragraphs only (the TTS parser extracts those).
3. **`stop-slop`** pass — kill AI tells.
4. **`humanizer`** pass — natural, human cadence (multiple passes).
5. **`third-grade-copy`** pass — plain language. Skill available directly; helper scripts at `<sibling repo>/packages/third-grade-copy-skill/skill/third-grade-copy/scripts/` (`evaluate_copy.py`, `scan_copy.py`). Keep exact facts/numbers/CTAs.
6. **no-lie pass** — re-read every sentence against `accuracy-sources.md`; no claim broader than its source; no fabricated experience/proof.
7. Tune for **spoken delivery**: spell tricky numbers ("one million", "two C F R two hundred"), short breathable sentences.

These passes apply to all narration and all on-screen marketing copy. Not to exact legal/citation text.

## Audio↔image connection (the bar)

- Every `[VISUAL]` beat is timed to the narration moment it illustrates. The chapter composition duration = that chapter's audio duration (set by `build-durations.mjs`).
- Motion is purposeful: entrances on every element, transitions between scenes (no jump cuts), no exit anims except final scene (HyperFrames rule). Vary eases. Numbers tick/reveal as the voice says them.
- Product videos: real captured screens (from `_capture/`) composited with motion overlays — cursor moves, zoom-to-region, highlight chips synced to the spoken step.
- Run the HyperFrames `animation-map.mjs` to verify choreography per composition.

## Review Protocol — ≥5 WHOLE-video reviews per video

A "review" is a full pass over the *entire* finished video (script + audio + every composition + final render), not a slice. Each whole review runs these **sub-reviews**; log findings, fix all, then re-review:

1. **Accuracy / no-lie** — every claim vs `accuracy-sources.md` + CLAUDE.md verified facts. Zero fabrication.
2. **Writing & voice** — stop-slop/humanizer/third-grade gates hold; builder framing; not generic-AI; not monotonous.
3. **Audio↔image sync** — each VISUAL lands on its narration beat; pacing breathes; no dead zones.
4. **Motion & design quality** — entrances/transitions present, eases varied, brand tokens correct, pill geometry, no grid textures, contrast ≥ AA (hyperframes validate), no overflow (hyperframes inspect).
5. **Real-product integrity** (product videos) — every demo frame is the real app with realistic seeded data; nothing fake/placeholder.
6. **Brand / CTA / compliance** — soft email-gated CTA ("we'll send it to your inbox"), real logo mark, LinkedIn review gate rules respected where reused.
7. **Technical render** — final mp4: correct duration, loudness normalized (-16 LUFS), 1080p, faststart, captions accurate and in sync.

Run reviews via sub-agents with fresh eyes (different agent per review where possible). A video is production-ready only after 5 consecutive whole reviews each end with **zero** unresolved findings — i.e. keep reviewing+fixing until a clean review, and bank at least 5 clean whole-video reviews total.

### Model tiering (standing directive)

Leverage smaller/cheaper models on sub-agents whenever possible. Default sub-agent model is **haiku**; escalate to **sonnet** only when a task genuinely needs deeper reasoning. Concretely:

- **haiku** — mechanical/observational sub-agents: frame inspection, render-log scanning, SRT/duration checks, grep-style fact lookups, single-dimension review passes against an explicit checklist, asset/file verification.
- **sonnet** — judgment-heavy sub-agents: ambiguous accuracy/no-lie adjudication, whole-video synthesis where many findings must be weighed, writing-voice rewrites, resolving a disputed/contested finding.
- The orchestrator stays on the resolved session model for coordination and final judgment only; delegate execution down.

When in doubt, start a review at haiku; if it returns low-confidence or conflicting findings, re-run that one dimension at sonnet to adjudicate. Pass `model` explicitly on every sub-agent/Workflow `agent()` call so the tier is intentional, not inherited.

## Real-app capture workflow

See `_capture/RECIPE.md` (written by the standup probe). Summary: local docker postgres (`pnpm db:local:start`) → migrate → `pnpm --filter @grantpipe/db exec tsx src/seed-demo.ts` → run web :3050 / api :5050 → log in `demo@grantpipe.com` / `Demo2026!` → drive browser at 1920×1080 via playwright MCP → save PNGs/recordings under `docs/youtube/_capture/<slot>/`. Never kill broad process classes; stop only your own PIDs.

## Tracker

| Slot | Status | Clean whole-reviews | Notes |
| --- | --- | --- | --- |
| P1 | production-ready, committed to master (`e05305303`) | ≥5/5 | 6 fix rounds; final `output/getting-started.mp4` (3:45, 1080p). Publishing via postiz pending explicit user OK. |
| P2 | production-ready, committed to master | 5/5 | "Add a Grant and Allocate It Across Funds"; final `output/add-grant-allocate.mp4` (3:22, 201.8s, 1080p, -16.5 LUFS, faststart). 5 consecutive clean whole-video reviews (35 fresh-eyes sub-reviews); recurring SRT-end-as-start and SSIM-spacing reviewer artifacts ground-truthed and disproven (no content change). publish-kit.md written. Publishing via postiz pending explicit user OK. |
| S1 | production-ready, committed to master | 5/5 | "What Is Fund Accounting? (Explained for Nonprofits)"; SEO concept video — no real-app capture (hand-built concept compositions). Final `output/fund-accounting.mp4` (6:48, 408.27s, 1080p, -16.2 LUFS, faststart; 123 SRT cues, 0 overlaps). 5 consecutive clean whole-video reviews; eliminated the entire static-hold ("freeze") defect class via an exhaustive per-chapter timeline audit (all ≥3.5s gaps given swell-and-return breathing tweens); ch04 red-slash "off-center" finding ground-truthed by pixel measurement and disproven (no content change). publish-kit.md written. No app deploy (concept video). Publishing via postiz pending explicit user OK. |
| S4 | production-ready, committed to master | 5/5 | "Uniform Guidance (2 CFR 200) Explained in Plain English"; SEO concept video — no real-app capture (hand-built concept compositions). Final `output/uniform-guidance.mp4` (5:36, 335.77s, 1080p, -16.4 LUFS, -3.6 dBTP, faststart; 107 SRT cues, 0 overlaps). 5 consecutive clean whole-video reviews; one real defect fixed (ch02 "three jobs" dead zone — breathing yoyo extended to span the full 1.5→29.0 hold). Recurring reviewer artifacts ground-truthed and disproven (no content change): ledger card "zoom/clip/cite-cut" (≈280px margins, cite fully visible), `.sub` footnote "low contrast" (measured 4.6:1, passes WCAG AA), teaser "3 chips" (4 pills, mid-stagger capture), fiscal-year "begins Oct 1 2024" vs "ends Sept 30 2025" (sanctioned-equivalent per N4), equipment "missing up to" (CLAUDE.md states $10,000 flatly). The retired single-audit figure appears only struck-through as history; `apps/site/src/audit-threshold-amount.test.ts` whitelists this video's path so the regression sweep does not trip on it. publish-kit.md written. No app deploy (concept video). Publishing via postiz pending explicit user OK. |
| P3 | production-ready, committed to master | 5/5 | "How to Track Restricted Funds Correctly"; concept-then-demo (scenes 0–2 hand-built concept art; scenes 3–5 real running app, seeded "Title III-C Nutrition Fund"; scene 6 recap + CTA). Final `output/track-restricted-funds.mp4` (4:07, 247.17s, 1080p, 30fps CFR, −16.3 LUFS, −4.4 dBTP, faststart; 72 SRT cues, 0 overlaps). 5 consecutive clean whole-video reviews (15 fresh-eyes sonnet sub-reviews + 1 FASB adjudication). Real defect fixed pre-streak: scene-4 redesigned to two high-zoom horizontal pans so the fund-detail edit form's stale "Type: Unrestricted" select is never framed (header badge "Temporarily Restricted" is correct); also fixed a GSAP `immediateRender` clobber on the multi-pan element (tl.set base + tl.to per motion). Reviewer findings ground-truthed and disproven (no content change): "three-label picker contradicts the two-class lesson" (adjudicated DISPROVEN per ASC 958-205-50-1B — picker tags restriction *nature*; scene-3 narration already maps it to the two presentation classes), Source-Allocations spotlight "leads its cue by ~4–5s" (aligns with cue 48 "the grants feeding the fund", not the later cue 49), "Threshold --" header (real unset optional field, not stale data), edit-mode buttons peeking (real app UI, no stale data). publish-kit.md written. No app deploy (docs-only change; the `$fundId.tsx` Type-select bug is a separately-flagged app session). Publishing via postiz pending explicit user OK. |
| P4–P8, S2–S3, S5–S7 | not started | 0/5 | |

_Last updated: 2026-06-03. Exemplars: video-01, video-02, video-03 shipped; video-p1-getting-started and video-p2-add-grant-allocate are the current full-pipeline exemplars; video-p3-track-restricted-funds is the current concept-then-demo exemplar; video-s1-fund-accounting and video-s4-uniform-guidance are the current SEO-concept exemplars. Next per sequence: P4/P5/P7._
