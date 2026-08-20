# P1 Fix Round 6 — ch01 form drift too slow (still reads frozen) + ch02 import controls illegible

Visual/timing only. **Do NOT touch audio, durations.json, or any chapter's total data-duration.** Edit `build-compositions.mjs` only (`lib.mjs` has every helper). Chapter starts (global, fixed): 00=0, 01=27.76, 02=71.6, 03=110.0, 04=141.64, 05=190.08. Subtract chapter start for chapter-local time. `D` inside each timeline = that chapter's duration.

A fresh diverse-persona whole-video review (4 reviewers) cleared everything from Fix Round 5 EXCEPT two items, both confirmed by the orchestrator's own frame reads + a PSNR check. Only these two tasks. Do not touch ch00, ch03, ch04, ch05 — their motion/legibility passed.

## Geometry recap (so you can compute, not guess)
`zoomTo({nx,ny,nw,nh,z})` returns a static `translate(tx,ty) scale(z)` (transform-origin 0 0), centering the native region center `(nx+nw/2, ny+nh/2)` inside the `FRAME_W=1190 × SHOT_H=616` viewport, edge-clamped so blank paper never shows. `IMG_K = 1190/1920 ≈ 0.6198`. Visible native width at scale z = `1190/(z*IMG_K)`; visible native height = `616/(z*IMG_K)`. Only the region CENTER and `z` affect the transform — `nw/nh` exist only to compute the center. Drift = a second `zoomTo` target + `tl.fromTo("#id",{transform:zA},{transform:zB,duration,ease},start)` with `tl.set("#id",{transformOrigin:"0 0"},0)` first.

---

## T1. ch01 — form Ken-Burns is present but FAR too slow; the timezone hold reads frozen (MAJOR)

The Fix-5 drift `zF (z1.95) -> zF2 (z2.04)` is tiny (Δz 0.09, ~35px total vertical pan) AND uses `ease:"sine.inOut"`, so it DECELERATES to ~0 velocity exactly across the timezone hold (chapter-local ~27–43s, frames g_019–g_024). Reviewer measured ~2px of movement over that 15s stretch — the longest single hold in the video, right where narration teaches most slowly. Orchestrator PSNR confirms: ch01 frame pair = 29.3 dB (least motion in the video) vs ch03 preview 22.4 dB / ch05 outro 19.5 dB.

**Fix:** Make the form drift a continuous, clearly perceptible slow push-in with CONSTANT velocity (so the late timezone hold moves as much as the early part). Two changes:
1. Bigger magnitude. Replace `zF2` with a meaningfully tighter target that keeps all three field rings in-frame. Suggested starting value (verify, then adjust UP if still subtle):
   `const zF2 = zoomTo({ nx: 768, ny: 376, nw: 380, nh: 360, z: 2.20 });`
   (center native ≈ (958, 556), a 13% zoom-in with a slight downward drift toward the timezone field; at z=2.20 the visible native window is ~451px tall centered ~556 → shows ny≈330–781, so org ny438 / fiscal ny533 / timezone ny627(+52) all stay in-frame with margin; visible width ~872px centered ~958 → form column nx760–1168 stays in-frame).
2. Change the ease from `sine.inOut` to **`none`** (linear) on the `#scr-f` drift so velocity is constant and the timezone-hold tail is no longer dead. Keep `duration:36.8, start 6.0` (ends 42.8, before D=43.84).

**Acceptance gate (quantitative, mandatory):** after re-render, extract ch01 frames at chapter-local 28s and 38s (= silent-mp4 `-ss 28` and `-ss 38` on chapter-01) and run `ffmpeg -i a.png -i b.png -lavfi psnr -f null -`. The average PSNR MUST be **≤ 25 dB** (clearly more motion than the old 29.3 dB; ch03 preview is 22.4 dB for reference). If it's still above 25 dB, increase `zF2`'s `z` (e.g. 2.30, 2.40) and/or push the center down a touch and re-render until the gate passes. Also visually confirm at local 28/35/42s that the three field rings (org/fiscal/timezone) are all still fully in-frame and uncropped, and no blank paper shows at any edge.

---

## T2. ch02 — the /import "choose source" controls are too small to read (MAJOR, from the target-user ED lens)

At `zStep`/`zControls`/`zControls2` (all z≈1.4–1.46) the /import page (`04-import-choose-source.png`) renders nearly full-width, so the 4-step bar labels, the SOURCE FILE labels, the record-type select ("Contacts"), the "Generic CSV" preset control, "Download contacts template", and "Required template columns: type" are tiny — unreadable at the 960px review downscale while the narration sells exactly those controls (records types, "pick that preset", "choose Generic CSV", "download a template"). z=1.4 was chosen to keep the far-right "Preview import" button in-frame, but that button is NOT narrated — it's fine to push it fully out of frame to gain legibility.

**Fix — sequential Ken-Burns that frames the narrated region at ~ch01 scale (visible native width ≈ 800–900px), keeping each beat's target fully in-frame and never half-cropping an element:**
1. **4-step bar beat (local ~6.4–8.2s, `sp-step`):** enlarge `zStep` so the step labels ("1 Choose source / 2 Upload CSV / 3 Preview / 4 Commit") are readable. The bar spans the full width (native nx≈410–1750), so it can't be as tight as the controls without losing steps — frame it as a brief, wider establishing beat but zoomed enough that the labels read (aim z≈1.6–1.75, all four steps still in-frame; if all-four-steps and legibility truly conflict, keep all four steps visible — this beat is only ~1.8s).
2. **Controls beat (the meat: record-type ring `sp-ent` at 9.6s, then preset ring `sp-pre` at 25.4s):** pan/zoom `#scr-imp` into the SOURCE FILE controls so the record-type select, the "Generic CSV" preset, "Download contacts template", the CSV-file row, and "Required template columns: type" are comfortably legible (visible native width ≈ 800–900px, i.e. z≈2.1–2.3). Center on the controls cluster (native center roughly nx≈760, ny≈470–520). It is FINE for the far-right "Preview import" primary button to be fully out of frame here; do NOT leave it half-clipped. Re-confirm `sp-ent` (nx426 ny456) and `sp-pre` (nx660 ny456) rings still hug their targets at the new transform (they live inside `.shotzoom`, so they travel with it — just confirm they're framed, not in a gutter or clipped).
3. **Keep continuous motion:** retain a gentle idle drift across the controls hold (replace the old `zControls`→`zControls2` pair with the new tighter framing + a slightly-tighter second target so it keeps drifting, `ease:"sine.inOut"` is fine here since there's no single extra-long static tail like ch01). Do not reintroduce a pixel-static stretch.
4. The `ask-wrap` onboarding card beat (0.3–5.6s, `zAsk`/`zAsk2`) already reads at the right scale — leave it.

**Acceptance gate (mandatory):** extract ch02 frames at chapter-local ~7s (bar beat), ~12s and ~27s (controls/preset beats) and READ them at the review downscale. Confirm: the 4-step labels are readable at ~7s; the record-type select + "Generic CSV" + "Download contacts template" + "Required template columns: type" are clearly readable at ~12s and ~27s; the `sp-ent`/`sp-pre` rings frame their controls without clipping or floating in a gutter; NO element is half-cropped (each is either fully in or fully out); NO bare-paper gap; the controls beat is not pixel-static between frames a few seconds apart.

---

## NON-ISSUES (do NOT change — adjudicated this round)
- **ch04 stat chips (2 inserted / 3 duplicates / 1 failed) are rounded rectangles, not pills.** The design canon scopes "buttons are pills" to buttons/CTAs/toggles/segmented/icon controls — these are stat cards, not buttons. Forcing 9999px stadium geometry on a multi-line stat card looks worse. Leave as-is.
- **ch05 lower-third "No consultant needed."** It is scoped by its own first clause ("Your org is set, your donors are in.") and the kicker "YOU'RE SET UP" — a viewer reads it as "this setup needed no consultant," not "never need one." Not a material overpromise. Locked narration line. Leave.
- **ch05 outro motion.** Orchestrator PSNR g_208 vs g_220 = 19.5 dB — it IS drifting (Fix-5 bumped it to scale 1.045). Reviewer rated it non-blocking and it's the intentional warm-paper bookend of the ch00 title card. Leave.
- **10 MB cap narrated but not shown on screen (ch03).** Narration-only and accurate per the ledger; the real UI doesn't surface it prominently. Do NOT fabricate or zoom to invent an on-screen "10 MB" hint. Leave.
- Do NOT open/fabricate the ch02 preset dropdown (presets named in narration only; collapsed "Generic CSV" is the real UI). Do NOT recolor the ch03 disabled Preview/Commit buttons (genuine disabled state). Do NOT retime spot rings except as a side effect of the screenshot drift they live inside.

## Process (mandatory)
1. Read `build-compositions.mjs` (ch01 lines ~93–156, ch02 lines ~159–243) + `lib.mjs` (`zoomTo`, frame constants). Make ONLY the T1 + T2 edits.
2. `node build-compositions.mjs`. `npx hyperframes@0.6.29 lint .` → MUST be 0 errors / 0 warnings.
3. Re-render ONLY chapters 01 and 02:
   `npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-NN.html" -o "../output/chapter-NN.silent.mp4" -q standard -f 30 -w 2 --quiet`
4. Run BOTH acceptance gates above (the ch01 PSNR ≤25 dB gate, and the ch02 legibility reads). Iterate on the constants and re-render until both pass. Report the exact PSNR number you measured for ch01 and what you read at each ch02 timestamp.
5. Confirm no chapter duration changed vs `durations.json`.
6. Report per task (T1, T2): exact constants used, verification frame timestamps, and what you measured/saw. Keep HyperFrames rules: entrance anim on every element, NO exit anims except the ch05 final fade, pill buttons, deterministic timelines (no Math.random/Date.now), gap-free transitions.

Do NOT re-assemble — the orchestrator re-renders all + assembles + re-reviews after.
