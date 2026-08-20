# P1 Fix Round 1 — visual/timing defects from whole-video review

All fixes are VISUAL/TIMING only. **Do NOT touch the audio (`../audio/*.mp3`), `durations.json`, or chapter `data-duration` totals.** Each chapter's total duration is fixed by its narration. You only move/retime elements WITHIN each chapter and reframe the screenshots.

Files you will edit: `build-compositions.mjs` and `lib.mjs` (and the generated `compositions/chapter-*.html` are rebuilt by `node build-compositions.mjs`). Brand tokens, frame-box constants (FRAME_W=1190, FRAME_TOP=120, FRAME_LEFT=365, BAR_H=54, SHOT_H=616), the `zoomTo()` Ken-Burns helper, `caption()`, `spot()`, `progress()`, `doc()` already exist — reuse them.

Chapter starts (do not change): 00=0, 01=27.76, 02=71.6, 03=110.0, 04=141.64, 05=190.08. Times below are GLOBAL video time; subtract the chapter start for chapter-local timeline position.

## BLOCKERS / MAJORS (must fix)

### A. ch02 — caption/pill collision + ghost duplicate caption
At ~t99–105s (chapter-local ~27–33s) the per-word highlight pills for "contacts / donations / grants / grant opportunities" render ON TOP of the bottom caption headline, and a faint ghost/duplicate caption row bleeds through, so the line is garbled. Three reviewers (brand, motion, av-sync) flagged this.
**Fix (preferred, simplest-robust):** Render ONE clean caption line that names the four record types, with the per-word emphasis (pill/highlight) constrained to its target words and NOT overlapping neighbors. Kill any residual/duplicate caption layer underneath. If the emphasis treatment can't be made collision-free, drop the pill emphasis entirely and keep a single clean caption — the words alone are enough. Verify layout-before-animation: the highlighted line is a single non-overlapping text run.

### B. ch02 — record-type emphasis is ~15–21s late (a-v sync)
The "four kinds of records: contacts, donations, grants, and grant opportunities" line is SPOKEN at global t≈77.7–84.0s (chapter-local ≈6.1–12.4s). The emphasis animation currently fires at t≈99–105s. **Retime** the record-type caption/emphasis so it appears/animates during chapter-local ≈6–12.4s, landing on the spoken words.

### C. ch02 — Ken-Burns crops the import form's left column AND right button
Throughout ch02 the zoom slices off left-column labels mid-word ("Source"→"ource", "CSV FILE"→"ILE", "record type"→"cord type", "Generic CSV" preset control partly cut) and clips the right-side primary button ("Comm…"). The narration names these exact controls (record type, preset, Generic CSV, download a template) while they're off-frame.
**Fix:** Reframe the ch02 `zoomTo()` pan/zoom so the import form's left edge (record-type / "CSV file" label / the **Generic CSV preset control**) stays inside the frame box AND the right-side primary button stays fully visible. Zoom less and/or center the form. The preset control showing "Generic CSV" must be legible when the preset names are spoken (global t≈82–85s) — this also satisfies the a-v "named presets have no on-screen referent" minor.

### D. ch03 — "Nothing saves during preview." callout floats into the caption clear zone
The callout pill comes to rest at bottom-center, overlapping the app screenshot's bottom edge AND sitting in the persistent-caption clear zone (y≈800–985), crowding the caption. Reviewers also noted the frame appears to re-letterbox wider here.
**Fix:** Place this callout so it never overlaps the app frame edge or the persistent caption band. Put it in the app's interior whitespace (over an empty region of the /import preview area) or in a band above the caption zone. Keep the caption clear zone IDENTICAL to ch01 (the clean reference chapter). Ensure the frame box geometry (FRAME_* constants) is identical to ch01 — no per-chapter widening.

### E. ch04 — stat cards (2 inserted / 3 duplicates / 1 failed) float into the caption clear zone
Same defect as D: the three stat cards sit at bottom-center over the app's lower edge and touch/overlap the persistent caption. **Fix:** relocate the stat cards to a clear zone that does NOT overlap the app frame or the caption band (interior whitespace overlay, or a dedicated upper band). Match ch01 clear-zone geometry. The cards are emphasis annotations of the real on-screen result — keep them on-brand (emerald/ochre/red tokens), keep entrance anims.

### F. ch04 — Commit button right-edge crop + Import History illegible
The "Commit" primary button is clipped ("Comm…") and the "Import history / Track what has already been imported…" row is cut off while narration introduces import history. **Fix:** reframe so the Commit button is fully in-frame, and pan to the Import History section so it's legible when narrated ("GrantPipe logs every import you run right here").

### G. donors-list reveal trails the line (ch04→05 boundary)
"And there they are. Your donors, in GrantPipe" is spoken at global t≈187.4–190.6s but the donors list doesn't appear until t≈192s — it lands on a blank crossfade. **Fix:** pull the donors-list reveal earlier so the table (Helen Whitfield, Frank Delgado visible) is on screen by t≈187s. NOTE: respect chapter boundaries — the donors-list screen (09) belongs to whichever chapter currently shows it; adjust timing within that chapter so the reveal precedes/coincides with the spoken line.

## MINORS (fix these too)

### H. ch00 kicker text inconsistent
The intro/title card's top-right kicker reads "GRANTPIPE · YOUTUBE" while every other chapter reads "GETTING STARTED". Change ch00 to "GETTING STARTED" for consistency.

### I. ch00–ch01 onboarding screenshots are small/centered in empty chrome
The welcome card and org form occupy only the middle third of the browser chrome, so body text is near the legibility floor and the Ken-Burns feels static. **Fix:** zoom/pan the onboarding screenshots (01-onboarding-welcome, 02-onboarding-org-setup) so the actual content fills the frame box and narrated text sits comfortably above the 20px-body floor at 1920. Keep the org-name → fiscal → timezone field highlights landing on the right words (that sync is currently correct — preserve it).

## Process (mandatory)
1. Read `build-compositions.mjs`, `lib.mjs`, and the relevant `compositions/chapter-0{0,2,3,4,5}.html`. Read 2–3 frames per affected chapter from `../output/_review/r1/` to see each defect (frame N = t=(N-1)*3s).
2. Make the edits. Run `node build-compositions.mjs`.
3. `npx hyperframes@0.6.29 lint .` MUST be 0 errors / 0 warnings.
4. Re-render EACH affected chapter you changed: `npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-NN.html" -o "../output/chapter-NN.silent.mp4" -q standard -f 30 -w 2 --quiet`
5. Self-verify: extract frames from each re-rendered silent mp4 with ffmpeg at the timestamps where the defect was, Read them, and confirm (a) the defect is gone and (b) the clean chapters' patterns (caption clear zone, frame box) are matched. Example: `ffmpeg -y -i ../output/chapter-02.silent.mp4 -vf fps=1/3 /tmp/c02_%02d.png` then Read the relevant frames.
6. Confirm you did NOT change any chapter's total duration (compare against `production/durations.json`).
7. Report: per-item (A–I) what you changed, the verification frame you checked, and confirmation. Keep entrance-anim-on-every-element and no-premature-exit rules. Buttons stay pill-shaped.

Do NOT re-assemble the final mp4 — the orchestrator will re-render all + assemble after your fixes.
