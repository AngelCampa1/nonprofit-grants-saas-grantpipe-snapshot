# P1 Fix Round 4 — legibility of demo screens + outro motion

Visual/timing only. **Do NOT touch audio, durations.json, or any chapter's total data-duration.** Edit `build-compositions.mjs` (+ `lib.mjs` only if a shared helper needs it). Chapter starts (global, fixed): 00=0, 01=27.76, 02=71.6, 03=110.0, 04=141.64, 05=190.08. Subtract chapter start for chapter-local time.

Two adversarial fresh-eyes reviewers (a skeptical nonprofit ED, a motion perfectionist) found that the demo chapters render the app too small to read, and the outro is frozen. The clean reference is **ch00/ch01** (frame f_005): the browser card fills ~70% of the canvas and the type is comfortably legible. The demo chapters (02/03/04) do NOT match that — the app sits small with dead warm-paper around it, and the exact regions the narration sells (preview table, result counts, Line-7 error, import history) are the smallest text in the video.

**Hard constraint / tension to respect:** earlier rounds pulled zooms OUT because zooming in cropped labels/buttons. The fix is NOT "zoom in on everything" — it is **sequential Ken-Burns that frames the SPECIFIC region the narration is talking about at a legible scale, while keeping that region's key content fully in-frame (not cropped) and a screenshot present at all times (no bare-paper gap)**. Legibility test: at the 960px-wide review downscale, the narrated text (column headers, the 2/3/1 counts, "Line 7, type…", import-history counts) must be readable. If it's readable at 960 it's very legible at 1920.

## MAJORS

### M1. ch02 — onboarding "import intro" card is tiny inside an empty browser window
At ch02 start (global ~t72–80, chapter-local ~0.4–8.4) the "Step 3 of 4 / Do you have a spreadsheet of donors or contacts? / Import a CSV" card is rendered small and centered with a large empty band around it — far smaller than the ch01 welcome card (f_005), which is the same kind of centered onboarding card.
**Fix:** Zoom/pan this onboarding screenshot so the card fills the frame box at the SAME visual scale as ch00/ch01 (browser card filling the upper ~65–70%, body text comfortably above the 20px-at-1920 floor). Reuse the same framing approach already used for 01-onboarding-welcome / 02-onboarding-org-setup. Verify ch02 frame at local ~4s: the "Do you have a spreadsheet" heading and "Import a CSV" pill are large and crisp like f_005.

### M2. ch03 — preview table (the "look before anything saves" trust beat) is too small to read
During "Then GrantPipe shows you a preview… It shows you the first five" (global ~120–138, chapter-local ~10–28) the PREVIEW panel — column headers (type / firstName / lastName / email), "6 rows detected", and the five rows (Dorothy Harmon, Robert Chen, Margaret Ellison, Helen Whitfield, Frank Delgado) — is small. A skeptical viewer literally cannot verify "the columns landed where you expected."
**Fix:** Ken-Burns into the PREVIEW panel so the header row + the five data rows are comfortably legible (region fills most of the frame width) during the "first five / look before anything" beats. Keep all four columns and all five rows in-frame (no column clipping — this was an earlier defect, don't reintroduce it). The existing "6 rows detected" and rows highlight rings must still frame their targets at the new scale. Don't leave a long small wide-shot of the whole page during this passage.

### M3. ch04 — result counts, Line-7 error, and Import History are small
The 2/3/1 result cards already pop large (good — keep). But the underlying "Import finished" banner, the "Line 7, type: Use one of: individual, organization." error row, and especially the IMPORT HISTORY card ("Contacts | Completed With Duplicates / Inserted 2, duplicates 3, failed 1 / Jun 2 2026") are small — the import-history card is the smallest text in the whole video, and the narration leans on it as the audit-trail proof.
**Fix:** Ensure each narrated region is legible in sequence: (a) the Line-7 error row legible while "line seven…" is spoken (global ~156.5–162, local ~14.9–20.7) — it already gets the ring, make sure the scale renders the row text readably; (b) Ken-Burns into the IMPORT HISTORY card while "GrantPipe logs every import you run right here" is spoken (find the line in captions.srt; ~global 178–186) so its type/status/counts line reads at 1080p. Keep the commit button and the rows in-frame where relevant; no cropping of the text being read.

## MINORS

### m1. ch05 — outro card is frozen ~16s (no Ken-Burns)
The "You're set up" / lead-magnet outro holds pixel-static from card entrance (~global 205) through the tail fade (~221) — the only stretch in the video with zero motion. 
**Fix:** Add a very slow Ken-Burns drift (e.g. scale 1.00→1.03 or a few-px vertical drift) on the outro group from after the elements finish entering through the start of the final fade, matching ch00's gentle title-card drift. Keep it subtle so the CTA stays readable. This is the FINAL scene, so the closing fade-out is allowed; do not add other exit anims.

## NON-ISSUES (do NOT change — documented so they aren't "fixed" by mistake)
- ch03 disabled "Preview import" / "Commit import" buttons render in a muted/desaturated emerald: that is the real app's genuine DISABLED state (no file selected). Showing the real product is required. Do NOT recolor them to full emerald — that would misrepresent the UI. Pill geometry is already correct.
- ch05 left-nav badge ("…12") is the real app navigation, not a donor-count claim. Reframing for legibility (general polish) is fine, but do not fabricate or alter the nav.
- Do NOT open/fabricate the ch02 preset dropdown to show Bloomerang/DonorPerfect/Salesforce — the real screenshot shows a collapsed "Generic CSV" control and the presets are named in narration only. Keep accurate.

## Process (mandatory)
1. Read `build-compositions.mjs` and `lib.mjs` (the `zoomTo()` / `spot()` / frame-box helpers). Read the relevant r4 frames: ch01 reference f_005; ch02 f_026; ch03 f_043/f_044; ch04 f_059/f_061/f_062. Note how ch00/ch01 achieve their larger framing and apply the equivalent to ch02-04 regions.
2. Edit. `node build-compositions.mjs`. `npx hyperframes@0.6.29 lint .` → MUST be 0/0.
3. Re-render EACH affected chapter (02, 03, 04, 05):
   npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-NN.html" -o "../output/chapter-NN.silent.mp4" -q standard -f 30 -w 2 --quiet
4. Self-verify by extracting frames at the named chapter-local timestamps and READING them at the review downscale. Confirm: M1 ch02 card large like f_005 (local ~4s); M2 ch03 preview header+5 rows legible, no column clip (local ~16/22/26s); M3 ch04 Line-7 row legible (local ~16/19s) and import-history card legible (local ~38/42s); m1 ch05 outro has subtle motion (compare local ~16s vs ~30s — not pixel-identical). Also confirm NO bare-paper gap and no re-introduced cropping of left labels / right buttons in any reframed shot.
5. Confirm no chapter duration changed (vs durations.json).
6. Report per item (M1, M2, M3, m1) what changed + the verification frame timestamps you read and what you saw. Keep HyperFrames rules: entrance anim on every element, NO exit anims except the ch05 final fade, pill buttons, deterministic timelines, gap-free transitions.

Do NOT re-assemble — the orchestrator re-renders all + assembles after.
