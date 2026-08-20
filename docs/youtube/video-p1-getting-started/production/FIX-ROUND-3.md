# P1 Fix Round 3 — highlight anchoring + a-v sync of emphasis rings

Visual/timing only. **Do NOT touch audio, durations.json, or any chapter's total data-duration.** Edit `build-compositions.mjs` (+ `lib.mjs` only if a helper needs it). Chapter starts (global, fixed): 00=0, 01=27.76, 02=71.6, 03=110.0, 04=141.64, 05=190.08. Subtract the chapter start to get chapter-local time.

Round-3 whole-video panel: brand / accuracy / copy / technical all CLEAN. The two MAJORs below are from the av-sync lens and are real — the emphasis rings either land on the wrong on-screen element or arrive many seconds after the words are spoken. Root issue: rings are anchored/timed to the PRE-scroll screenshot layout, so after a Ken-Burns/scroll they sit over empty space or stale rows.

## MAJORS

### M1. ch04 — "line seven" ring lags the spoken words by ~9–12s (and lands on the wrong row first)
Spoken (caption 55): "Here, line seven used a contact type GrantPipe doesn't know, so it tells you the two it accepts" at global t≈156.6–162.3 (chapter-local ≈14.96–20.66). During that whole line the emphasis ring stays on the green "Import finished: 2 inserted, 3 duplicates, 1 failed" summary line. The ring only moves onto the "Rows needing attention / Line 7, type: Use one of: individual, organization." error row at ~global t171–174 (chapter-local ≈29–32) — during the import-history scroll, long after the words.
**Fix:** Move the emphasis ring onto the **Line 7 / "Rows needing attention"** error row at chapter-local ≈14.9–15.2s (global ≈156.5), and keep it there through ≈20.7s while that line is read. The summary-line highlight (2/3/1) belongs to the earlier enumeration (~global 150–154); it should clear before the Line-7 ring. Do not let the Line-7 ring wait for the import-history scroll. Verify by extracting ch04 frames at chapter-local 15/17/19s: the ring frames the Line-7 error row (legible: "Line 7, type: Use one of: individual, organization.") on the app screenshot, not the summary line, not empty space.

### M2. ch03 — preview rings mis-anchored after the panel scrolls
Spoken (caption 42): "It shows you the first five" at global t≈125.5–131.5 (chapter-local ≈15.5–21.5). At ch03 frames t129/t132 a small pill ring floats in empty space to the LEFT of the word "detected" (anchored to nothing), and the large preview-rows ring is offset/clipped — its left edge sits in the blank gutter and its right edge cuts through the middle of the columns. The five rows (Dorothy, Robert, Margaret, Helen, Frank) are the correct content but the rings don't frame them.
**Fix:** Re-anchor BOTH highlight boxes to the POST-scroll/post-zoom positions of (a) the "6 rows detected" chip and (b) the five preview rows, so each ring cleanly frames its target while "the first five" is spoken. If the rings are positioned in pre-scroll screenshot coordinates, recompute them against the same transform the screenshot has at that timestamp (or pin them to the zoomed `.shotzoom` frame so they travel with the image). Verify ch03 frames at chapter-local 16/19/21s: the "6 rows detected" ring hugs that chip, the rows ring frames all five rows without clipping columns or floating in the gutter.

## MINORS (fix if low-risk)

### m1. ch02 — preset ring contradicts "pick that preset"
"Came out of Bloomerang, DonorPerfect, or Salesforce's nonprofit pack? Pick that preset" is spoken at global t≈82.7–88.6 (chapter-local ≈11.1–17.0) while the ring sits on a control reading "Generic CSV". The named presets have no on-screen referent and the ring visually contradicts the words.
**Fix:** During t82.7–88.6, do NOT ring the "Generic CSV" control. Either (a) move the ring onto the format/preset selector label generically (without showing an invented expanded list — keep it accurate), or (b) hold the ring off until "choose Generic CSV and match the columns yourself" is actually spoken (global ≈97–100, chapter-local ≈25.4–28.4) and ring "Generic CSV" then. Do not fabricate preset dropdown contents not present in the real app screenshot.

### m2. ch03 — "Nothing saves during preview." callout overlaps the PREVIEW heading (motion lens)
The callout pill rests over the screenshot's "PREVIEW" section heading and the Ken-Burns scale clips the browser chrome top edge.
**Fix:** Nudge the callout pill up/down ~24px so it clears the "PREVIEW" label, and/or relax the ch03 zoom slightly so the browser chrome top stays in frame. Keep it out of the persistent caption clear zone (y≈800–985) and not overlapping the app frame edge.

### m3. ch02 — four-record-types referent (OPTIONAL, skip if risky)
"GrantPipe imports four kinds of records: contacts, donations, grants, and grant opportunities" (global ≈77.7–84) coincides with a highlight on the 4-step stepper, not the record types. The lower-third names them, which is acceptable. Only address if you can do so accurately without fabricating UI. If the real screenshot has a record-type selector, ring it; otherwise SKIP — do not invent UI.

## Process (mandatory)
1. Read `build-compositions.mjs` (and `lib.mjs` if needed for the `spot()`/`zoomTo()` anchoring helpers). Read 2–3 r3 frames per affected chapter from `../output/_review/r3/` (ch02 f_027/028/032/034; ch03 f_040/044/045/046; ch04 f_053/054/055/058/059).
2. Edit. `node build-compositions.mjs`. `npx hyperframes@0.6.29 lint .` → MUST be 0/0.
3. Re-render EACH affected chapter (02, 03, 04): `npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-NN.html" -o "../output/chapter-NN.silent.mp4" -q standard -f 30 -w 2 --quiet`
4. Self-verify: extract frames from each re-rendered silent mp4 at the EXACT chapter-local timestamps named above and READ them. Confirm M1 ring on Line-7 row at local 15/17/19s; M2 rings hug the chip + five rows at local 16/19/21s; m1 ring not on "Generic CSV" during local 11–17s; m2 callout clears PREVIEW.
5. Confirm no chapter duration changed (vs durations.json).
6. Report per item (M1, M2, m1, m2, m3) what changed + the verification frame you read. Keep HyperFrames rules: entrance anim on every element, NO exit anims except ch05 final scene, pill buttons, deterministic timelines.

Do NOT re-assemble — the orchestrator re-renders all + assembles after.
