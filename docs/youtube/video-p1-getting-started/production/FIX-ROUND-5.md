# P1 Fix Round 5 — kill frozen holds (continuous Ken-Burns) + one a-v retiming

Visual/timing only. **Do NOT touch audio, durations.json, or any chapter's total data-duration.** Edit `build-compositions.mjs` only (lib.mjs already has every helper you need: `zoomTo()`, `screenFrame()`, `spot()`). Chapter starts (global, fixed): 00=0, 01=27.76, 02=71.6, 03=110.0, 04=141.64, 05=190.08. Subtract chapter start for chapter-local time. `D` inside each timeline = that chapter's duration.

A motion-perfectionist whole-video review found the dominant remaining defect: **most demo screenshots are pixel-static for 9–17s at a time** (only the spot rings pop; the screenshot transform is set once via `zoomTo()` and never animated). This reads as frozen/boring, which violates the brief's "with motion, never monotonous" mandate. ch00 already drifts correctly (`#scr` z0→z1) — copy that pattern everywhere a screenshot is held.

**Motion technique (already in the codebase):** the inner `.shotzoom` wrapper (the `id` you pass to `screenFrame`) is transform-only animatable. To add a slow Ken-Burns, define a SECOND `zoomTo()` target a little tighter/shifted than the first and tween between them:
```
tl.set("#SCRID",{transformOrigin:"0 0"},0);
tl.fromTo("#SCRID",{transform:"${zA}"},{transform:"${zB}",duration:<hold length>,ease:"sine.inOut"},<start>);
```
Spots live INSIDE `.shotzoom`, so they travel with the drift automatically — no need to retime rings. Keep every drift SMALL (Δz ≈ 0.05–0.09, a few native px of pan) so no ringed/narrated region leaves frame and `zoomTo`'s edge clamp never reveals blank paper. Where a screenshot already gets a programmed pan (ch02 zStep→zControls, ch04 zRes→zErr→zRes), add the idle drift only on the STATIC stretches between/after those moves, tweening from the transform that's current at that moment so the motion stays continuous (no snap).

## TASKS

### T1. ch01 — form holds static ~33s (MAJOR)
`#scr-f` is set to `zF` (z=1.95) at the crossfade (~5.2s) and never moves; the three field rings fire at 6.7/15.6/27.0 but after ~27.5s the shot is dead-static to 43.84s. Reviewer cited f_019–f_024 (local ~26–41s) pixel-identical.
**Fix:** Add a continuous slow drift on `#scr-f` spanning the whole form display. Add `const zF2 = zoomTo({ nx: 756, ny: 352, nw: 404, nh: 384, z: 2.04 });` and tween `#scr-f` from `zF` to `zF2` from ~6.0s to ~42.8s, `ease:"sine.inOut"`. Confirm all three field rings (org ny438 / fiscal ny533 / timezone ny627) stay fully in-frame across the drift. Optional: a tiny `#scr-w` drift (zW→a slightly tighter zW2) during its short 0.3–5.6s show for consistency — low priority, only if it stays clean.

### T2. ch02 — import controls hold static ~29s (MINOR→fix)
`#scr-imp` pans zStep→`zControls` ending ~9.3s, then static to 38.4s. Reviewer cited f_034–f_037.
**Fix:** Add `const zControls2 = zoomTo({ nx: 410, ny: 402, nw: 1320, nh: 250, z: 1.46 });` and, AFTER the existing pan settles, tween `#scr-imp` from `zControls` to `zControls2` from ~9.6s to ~37.8s, `ease:"sine.inOut"`. The existing `tl.to("#scr-imp",{transform:zControls},...,8.4)` must finish before this starts — start the drift at 9.6s so it picks up from `zControls`. Keep the `sp-pre` Generic-CSV ring (native ~660,456) in frame. Do NOT change the preset/ring logic. (The ask card already drifts — leave it.)

### T3. ch03 — upload + preview both static; AND "Nothing saves" card is ~15s late (MAJOR)
(a) `#scr-up` static at `zUp` (0.3→~12.7 crossfade); `#scr-pv` static at `zPv` (12.7→31.64).
**Fix (motion):** Add `const zUp2 = zoomTo({ nx: 410, ny: 548, nw: 1320, nh: 196, z: 1.46 });` and drift `#scr-up` zUp→zUp2 from ~1.0s to ~12.0s. Add `const zPv2 = zoomTo({ nx: 430, ny: 862, nw: 950, nh: 220, z: 2.02 });` and drift `#scr-pv` zPv→zPv2 from ~13.6s to ~31.0s, `ease:"sine.inOut"`. The `sp-rows`/`sp-table` rings travel with it — confirm the header + five rows stay fully in-frame (no column clip) across the drift.
(b) **A-V retiming:** the `#trust` "Nothing saves during preview." card currently enters at `D*0.80` (≈25.3s local ≈ global 135.3s), but "Nothing saves." is spoken at **global 120.02–121.02s = chapter-local 10.0–11.0s** (captions cue 40, verified). The card lands ~15s after its own words.
**Fix:** Move the `#trust` entrance from `D*0.80` to **10.2s** so it pops on the spoken "Nothing saves." It then holds (no exit; the chapter transition handles it). It sits at top:300px interior, clear of the table framing — confirm it does not overlap the caption band (y≥823) or the preview rings.

### T4. ch04 — static gap before the line-7 push, and history holds static (MINOR→fix)
`#scr-res` is static at `zRes` from stat-cards-done (~12.5s) until the zErr push at 23.0s (~10s gap); `#scr-hist` is static at `zHist` from 34.9s to 48.44s (~13s).
**Fix:** (a) Add `const zRes2 = zoomTo({ nx: 420, ny: 778, nw: 1286, nh: 186, z: 1.54 });` and drift `#scr-res` zRes→zRes2 from ~13.0s to ~22.5s (must FINISH before the existing `tl.to("#scr-res",{transform:zErr},...,23.0)`; that push then starts from zRes2 — fine). Do NOT alter the zErr push, the back-to-zRes at 31.2, the sp-res/sp-err ring timing, or the history crossfade. (b) Add `const zHist2 = zoomTo({ nx: 426, ny: 826, nw: 648, nh: 197, z: 2.48 });` and drift `#scr-hist` zHist→zHist2 from ~35.6s to ~47.6s. Confirm the `sp-hist` ring and the type/status/counts/date line stay in-frame.

### T5. ch05 — outro drift is imperceptible; donors shot static (MAJOR)
The `#end` drift exists (scale 1.00→1.03, y→-10 over ~18.9s) but is too subtle — reviewer read f_069–f_073 as pixel-identical.
**Fix:** (a) Make the `#end` drift perceptible-but-calm: change the target to `scale:1.045, y:-16` (keep the same start at 15.2s, same end-of-drift before the D-1.1 fade, same `transformOrigin:"50% 50%"`, same `sine.inOut`). CTA text must stay readable — do not exceed scale 1.05. (b) `#scr-don` is static at `zDon` (0→12.6). Add `const zDon2 = zoomTo({ nx: 212, ny: 666, nw: 686, nh: 414, z: 1.48 });` and drift `#scr-don` zDon→zDon2 from ~0.6s to ~12.0s; keep the Frank/Helen rings in frame. Do NOT touch the donors→end-card transition timing, the final fade, or the end-card content. The bare-warm-paper end card is INTENTIONAL (it bookends the ch00 paper title card) — do NOT add a dashboard behind it.

## NON-ISSUES (do NOT change)
- Do NOT open/fabricate the ch02 preset dropdown to show Bloomerang/DonorPerfect/Salesforce NPSP — the real screenshot has a collapsed "Generic CSV" control; presets are named in narration only. Opening it fabricates UI.
- Do NOT add a screenshot behind the ch05 end card — the paper end card is the intended final scene.
- Do NOT rename the ch05 "CRM Migration Data Map" card — it matches the locked narration (which does not say "Template").
- Do NOT retime any spot ring except as a side effect of the screenshot drift they live inside (they auto-travel). The Line-7 ring timing (sp-err at 24.3–31.0 local) is correct — leave it.

## Process (mandatory)
1. Read `build-compositions.mjs` + `lib.mjs`. Make the edits above.
2. `node build-compositions.mjs`. `npx hyperframes@0.6.29 lint .` → MUST be 0 errors / 0 warnings.
3. Re-render EACH affected chapter (01, 02, 03, 04, 05):
   `npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-NN.html" -o "../output/chapter-NN.silent.mp4" -q standard -f 30 -w 2 --quiet`
4. Self-verify: for each chapter, extract two frames a few seconds apart WITHIN a held stretch (e.g. ch01 local 30s & 40s; ch02 local 28s & 36s; ch03 local 4s & 11s, then 16s & 28s; ch04 local 16s & 21s, then 40s & 46s; ch05 local 18s & 30s) and confirm they are NOT pixel-identical (the framing has visibly drifted) while the ringed/narrated content stays fully in-frame and uncropped. Also extract ch03 local ~10.5s and confirm the "Nothing saves during preview." card is visible there (on the spoken line).
5. Confirm no chapter duration changed vs `durations.json`.
6. Report per task (T1–T5) what changed + the verification frame timestamps you read and what you saw. Keep HyperFrames rules: entrance anim on every element, NO exit anims except the ch05 final fade, pill buttons, deterministic timelines (no Math.random/Date.now), gap-free transitions.

Do NOT re-assemble — the orchestrator re-renders all + assembles + re-reviews after.
