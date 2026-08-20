# P4 Whole-Video Review Brief — "How to Track Grant Spending Without Losing Your Mind"

> [!NOTE]
> `review/frames` (raw extracted frames) and `review/sheets` (the contact sheets listed under
> Evidence below) were deleted during the docs/ 19 MB portfolio prune — bulky QA capture
> artifacts, not source. The paths below no longer resolve. This brief is kept as a record of
> the review criteria and methodology used during production, not as an active reviewer prompt
> you can run against this snapshot.

You are a fresh-eyes reviewer of a finished, assembled marketing/education video. Judge the
ACTUAL rendered output, not intentions. Ground every finding in the evidence files below.
Do NOT reason about source code — look at the frames and read the timed transcript.

## Evidence (read all of these)

- Per-chapter contact sheets (timestamped frames from the FINAL assembled track, in order):
  - `docs/youtube/video-p4-track-grant-spending/review/sheets/chapter-00.jpg`
  - `.../sheets/chapter-01.jpg`
  - `.../sheets/chapter-02.jpg`
  - `.../sheets/chapter-03.jpg`
  - `.../sheets/chapter-04.jpg`
  - `.../sheets/chapter-05.jpg`
  - `.../sheets/chapter-06.jpg`
  Each thumbnail is labeled with its timestamp (yellow, top-left) in the final track.
- Timed transcript (what is SPOKEN and when): `docs/youtube/video-p4-track-grant-spending/output/captions.srt`
- Intended script + accuracy notes + [VISUAL] cues: `docs/youtube/video-p4-track-grant-spending/script-final.md`
- The 5 REAL captured app screens the demo uses (ground truth for product claims):
  `docs/youtube/video-p4-track-grant-spending/assets/screens/01-grant-overview-cards.png`,
  `02-grant-overview-burnrate.png`, `03-expenses-ledger.png`, `04-add-expense-dialog.png`,
  `05-spend-down.png`.

## Chapter map (final-track timestamps)
- 00  0.0–39.25s   Concept hook: bank balance can't answer "how much is left on THIS grant?"
- 01  39.25–82.62s Concept: equation Award amount − What you've spent = What's left; two red risk tags
- 02  82.62–113.63s Concept: three chips (running total / list of every cost / sense of pace) + receipts-drawer fail tag
- 03  113.63–149.84s DEMO screen 01: four header cards (Grant Amount / Allocated / Unallocated / Remaining to Spend); Ken-Burns + spotlight each, hold Remaining
- 04  149.84–187.01s DEMO: Expenses ledger → Add-expense dialog (Amount/Date/Description) → back to ledger
- 05  187.01–218.06s DEMO: Overview burn-rate line → Spend-Down view (Burn Rate card + By Month)
- 06  218.06–265.2s Concept outro: recap line + 3 chips + GrantPipe wordmark + lead-magnet chip

## The 7 review dimensions — score each PASS or FAIL with specifics

1. **Accuracy / no-lie.** Every spoken/visible claim must be true of the real product and true in
   general. Federal-grant facts (if any appear) must be current. The video must NOT claim features
   the app lacks. KEY accuracy facts for THIS video:
   - The grant page shows exactly: Grant Amount, Allocated, Unallocated, Remaining to Spend.
   - Remaining to Spend = award − every expense (auto-computed, not typed).
   - The Expenses ledger rows show a short note + the amount. The ledger has NO date column.
     (Narration must say "a short note and what it cost" — it must NOT claim a date column in the ledger.)
   - The Add-expense FORM has exactly three fields: Amount, Date, Description. (Date in the FORM is correct.)
   - Burn rate appears on the Overview; the Spend-Down view exists and is PLAN-GATED (narration must say so).
   - No false claims: no GL/journal sync, no bank-feed import, no auto cost-category classification,
     no receipt attachment, no budget-vs-actual demo, no generic export.
   - No specific dollar figures are spoken (so narration can't contradict the screen numbers).
2. **Writing / voice.** Natural, human, builder's voice (Angel builds compliance software; he is NOT
   an accountant/grants officer and must not claim to be). No AI-slop, no hype, third-grade reading level.
   Caption text must match/and support the narration.
3. **Audio ↔ image sync.** At each spoken line (use the SRT timestamps), the on-screen content/animation
   should match. E.g. when "Grant Amount" is named, the Grant Amount card should be highlighted; when the
   equation terms are spoken, they should appear; when the dialog/fields are described, they should be shown.
   Flag any place where the visual lags, leads, or contradicts the words.
4. **Motion / design.** Brand = warm paper, emerald + ochre, Sora/Plex. Buttons are pills. NO grid-line/paper
   textures. Entrances feel intentional; no frozen dead air on long holds; no broken/overlapping layout;
   text legible at video scale; no element bleeding off-frame.
5. **Real-product integrity.** Demo beats (chapters 03–05) must be REAL captured app screens (browser-chrome
   frame), not HTML mockups. Compare the demo frames against the 5 PNGs. The screens shown must be the actual
   Title III-C grant screens.
6. **Brand / CTA / compliance.** GrantPipe wordmark present. CTA is a SOFT, email-gated lead magnet
   ("free grant spending spreadsheet, we'll send it to your inbox") — not a hard sell. No fabricated
   testimonials/user counts. Outro recap is honest.
7. **Technical render.** No black/blank frames mid-scene, no corruption, no cut-off captions, no stuck
   spotlight rings left on screen after their beat, consistent framing (the browser-chrome box must not jump).

## Output format (return EXACTLY this, as JSON via the StructuredOutput tool if available, else plain)

For each of the 7 dimensions: verdict (PASS/FAIL) + findings. A finding = {dimension, severity
(blocker/major/minor), timestamp_or_chapter, what_you_see, why_it_is_wrong, suggested_fix}.
Then an overall verdict: CLEAN (zero blocker/major findings) or NOT-CLEAN.
Be specific and cite frame timestamps. Do not invent problems; if a dimension is clean, say so plainly.
Minor/nit findings do NOT make the video NOT-CLEAN, but list them anyway.
