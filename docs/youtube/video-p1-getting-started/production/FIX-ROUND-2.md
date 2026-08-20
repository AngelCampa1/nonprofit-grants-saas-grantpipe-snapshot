# P1 Fix Round 2 — transition gaps + overlay timing

Visual/timing only. **Do NOT touch audio, durations.json, or any chapter's total data-duration.** Same files as before: `build-compositions.mjs` (+ `lib.mjs` if needed). Chapter starts (global, fixed): 00=0, 01=27.76, 02=71.6, 03=110.0, 04=141.64, 05=190.08. Subtract the chapter start to get chapter-local time.

Two root causes this round:
- (Transitions) When a chapter swaps between two app screenshots, the outgoing screenshot fades out BEFORE the incoming one is up, leaving a bare warm-paper gap (sometimes with overlays floating over emptiness). A screenshot layer must be present at all times — crossfade the two states so they overlap, or hold the prior frame until the next is in. Never a blank product window longer than a tight crossfade, and NEVER an overlay (callout/stat card) sitting over empty background.
- (Overlay timing) Several highlight/card reveals lag the spoken words by 5–9s. Pull them earlier to land on the narration.

## BLOCKERS / MAJORS

### M1. ch03 — blank product window ~global t123.3–124.5s (chapter-local ~13.3–14.5s)
During the scroll/transition from the upload state to the preview state, the import-page screenshot disappears entirely for ~1.2s — only warm paper + the lower-third show, while narration is mid-sentence ("Then GrantPipe shows you a preview"). 
**Fix:** Keep an app screenshot on screen throughout ch03. Crossfade the upload→preview screen states so both overlap during the swap (incoming fades in as outgoing fades out, no bare gap), OR pan within a single screenshot. Verify by extracting frames at chapter-local 12.5/13/13.5/14/14.5s — none may be bare background.

### M2. ch04 — empty/half-built frame ~global t177s (chapter-local ~35.4s)
The app screenshot fades out from under the three floating stat cards (2/3/1), leaving them on bare warm paper with the bottom two-thirds empty (frames before and after show the full app behind the cards — so this is the result→history screen swap leaving a gap).
**Fix:** Keep the app screenshot present beneath the stat cards for the ENTIRE time the cards are on screen. Crossfade the commit-result → import-history screen states directly (both present during the swap), or fade the cards out together with the screenshot during the swap so the cards are never over emptiness. Verify frames at chapter-local ~34/35/36s have the app visible behind the cards.

### M3. ch01 — field-highlight regression: rings lag + are additive
The three org-field rings (org-name, fiscal-year, timezone) now appear ~5–8s LATE and never clear — by the timezone passage all three are lit at once, and each ring fires roughly when the NEXT field's narration starts.
**Fix:** Re-time so each ring appears on the LEADING word of its field and clears/dims before the next (exclusive highlight, not cumulative):
- org-name ring ON at global ~34.5s ("Your nonprofit's name"), OFF before fiscal.
- fiscal-year ring ON at global ~43.4s ("The month your fiscal year starts"), OFF before timezone.
- timezone ring ON at global ~54.8s ("And your timezone").
(Chapter-local = global − 27.76, i.e. ~6.7s / ~15.6s / ~27.0s.) Verify by extracting frames at those three timestamps: exactly one field ringed at each, on the field being spoken.

## MINORS (fix these too)

### m1. ch03 — Ken-Burns edge crops
The zoomed SOURCE FILE / CSV-file shot crops both edges (chapter-local ~1–13s): the FOCAL highlighted filename "donor-contacts.csv (294 B)" is cut to "acts.csv", left labels cut ("SOURCE FILE"→"ILE", "Required template columns: type"→"template columns: type"), and the "Preview import" / "Commit import" buttons are half-clipped ("Commi"). **Fix:** pull the ch03 zoom out / recenter so the full highlighted filename and left labels are in-frame; buttons either fully shown or fully out of frame, not half-cropped.

### m2. ch04 — stat cards overlap the "Import finished" banner
After the scroll to Import History, the stat-card band partially covers the green "Import finished: 2 inserted, 3 duplicates, 1 failed" banner (visible peeking behind the cards). **Fix:** nudge the card band up into the browser-chrome dead zone (or down) so it clears that banner text.

### m3. ch04 — stat cards trail the spoken enumeration ~5–9s
"Three numbers. Two added. Three skipped as duplicates… one failed" is spoken ~global 150–156s, but the cards don't all land until ~162–165s. **Fix:** advance the card reveal so each card pops near its spoken number — "2 inserted" ~151s, "3 duplicates" ~151.5s, "1 failed" ~153.5–154s (or start the sequence ~6s earlier). The inline banner is already on time; just align the big cards.

### m4. ch05 — lead-magnet card ~8s late
"We made a free template for that: the CRM Migration Data Map" is spoken ~global 204.9s, but the "FREE TEMPLATE / CRM Migration Data Map" card doesn't render until ~213s. **Fix:** bring the card in at ~205s on the spoken name (chapter-local ~14.9s). It should still be up through the "Want it? We'll send it to your inbox" CTA.

### m5. ch02 — lower-third caption goes stale (OPTIONAL, only if low-risk)
The caption stays on "GrantPipe imports contacts, donations, grants, and grant opportunities. Start with contacts." from ~78s through ~105s while narration has moved to presets/Generic CSV/templates. The on-screen control highlights are correctly synced, so this is pacing only. If easy, advance the caption to a preset/template line around global ~88s. If it risks destabilizing the (now-correct) control highlights, SKIP it.

## Process (mandatory)
1. Read `build-compositions.mjs` (and `lib.mjs` if a transition/crossfade helper is needed), the round-2 findings above, and 2–3 frames per affected chapter from `../output/_review/r2/`.
2. Edit. `node build-compositions.mjs`. `npx hyperframes@0.6.29 lint .` → MUST be 0/0.
3. Re-render EACH affected chapter (01, 03, 04, 05): `npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-NN.html" -o "../output/chapter-NN.silent.mp4" -q standard -f 30 -w 2 --quiet`
4. Self-verify by extracting frames with ffmpeg at the EXACT timestamps named above (use chapter-local time against each silent mp4) and READING them: confirm M1/M2 have no bare-background gap, M3 has exclusive on-time rings, and each minor is resolved. 
5. Confirm no chapter duration changed (vs durations.json).
6. Report per-item (M1–M3, m1–m5) what changed + the verification frame you read. Keep HyperFrames rules: entrance anim on every element, no exit anims except ch05 final scene, pill buttons, deterministic timelines.

Do NOT re-assemble — the orchestrator re-renders all + assembles after.
