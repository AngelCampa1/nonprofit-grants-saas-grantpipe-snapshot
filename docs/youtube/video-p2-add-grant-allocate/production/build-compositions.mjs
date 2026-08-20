// Generates compositions/chapter-XX.html for P2 "Add a Grant and Allocate It
// Across Funds", timed to the recorded audio durations. Composites the REAL
// captured app screenshots in browser-chrome frames with motion. Mirrors the P1
// build (screenFrame + zoomTo + spot + frameSlot + caption + crossfades +
// Ken-Burns drift + word-synced exclusive spotlights). Exact spotlight/zoom
// regions come from _capture/p2-regions.json (measured live via boundingBox()).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doc, screenFrame, progress, zoomTo, FRAME_W, FRAME_TOP, FRAME_LEFT, IMG_K } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

const SCREENS = "../assets/screens";
const KICKER = "Grants & Allocations";

// caption block (animatable: #cap is faded/slid in via capIn)
function caption({ idx, chip, num, line }) {
  const numHtml = num != null ? `<span class="num">${num}</span>` : "";
  return `<div id="cap" class="caption clip" data-start="0" data-duration="DUR" data-track-index="8" style="opacity:0">
    <div class="chip">${numHtml}${chip}</div>
    <div class="line">${line}</div>
  </div>
  <div id="chrome-progress" class="clip" data-start="0" data-duration="DUR" data-track-index="7">${progress(N, idx)}</div>`;
}
const capIn = `tl.fromTo("#cap",{opacity:0,y:28},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.25);`;

// Spotlight ring over a screenshot region. Lives INSIDE .shotzoom, so coords are
// css px relative to the image origin (native px * IMG_K). It pans/zooms with the
// image, so it always lands on the right region regardless of the wrapper transform.
// `pad` (native px, default 10) grows the ring outward on every side before the
// IMG_K scale. The .spot border is drawn INSIDE the box (global box-sizing:border-box),
// so without padding the 3px ring clips the leading glyph of tight text targets.
function spot({ id, nx, ny, nw, nh, pad = 10 }) {
  const left = Math.round((nx - pad) * IMG_K);
  const top = Math.round((ny - pad) * IMG_K);
  const w = Math.round((nw + pad * 2) * IMG_K);
  const h = Math.round((nh + pad * 2) * IMG_K);
  return `<div id="${id}" class="spot" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;opacity:0"></div>`;
}

// A fixed-position holder for one screen frame inside the constant box. Multiple of
// these stack at the same coordinates so chapters can cross-fade between screens
// without the card moving. `id` is the wrapper that gets faded/scaled as a unit.
// `open:true` makes this slot visible at t=0. Each chapter is rendered as its own
// MP4 and hard-concatenated (no xfade), so a chapter whose opener fades in from
// opacity:0 shows a blank flash at the seam. The first frame the viewer sees of a
// chapter must already be painted — so chapter-opening slots use open:true and skip
// their opacity entrance. (ch00 is the exception: its true open is the hero card.)
function frameSlot({ id, extraStyle = "", children, open = false }) {
  return `<div id="${id}" style="position:absolute;left:${FRAME_LEFT}px;top:${FRAME_TOP}px;width:${FRAME_W}px;opacity:${open ? 1 : 0};${extraStyle}">${children}</div>`;
}

// ---- Scene builders. Each returns {kicker, body, timeline}. DUR placeholder replaced per chapter. ----
const scenes = {
  // 00 (32s) — hook. Wordmark on warm paper -> the real /grants Portfolio list.
  // "New money, new rules." A funder said yes; now you have to record it and split
  // it before you spend. Establish on the grants list with a gentle Ken-Burns push.
  "00": () => {
    // 01-grants-list (full-scale app). Wide establishing frame (heading + table)
    // that drifts down into the Portfolio table so it isn't pixel-static.
    const z0 = zoomTo({ nx: 380, ny: 122, nw: 1480, nh: 560, z: 1.2 });
    const z1 = zoomTo({ nx: 404, ny: 378, nw: 1336, nh: 300, z: 1.4 });
    const body = `
      <div class="stage" style="gap:0">
        <div id="hero" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:24px;z-index:4">
          <div id="hero-mark" role="img" aria-label="GrantPipe" style="width:120px;height:120px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat"></div>
          <div id="hero-name" style="font-family:'Sora';font-weight:700;font-size:108px;letter-spacing:-2px;color:var(--ink)">GrantPipe</div>
          <div id="hero-sub" style="opacity:0;font-family:'Sora';font-weight:600;font-size:38px;color:var(--muted)">New money, new rules</div>
        </div>
        ${frameSlot({
          id: "frame-wrap",
          children: screenFrame({
            src: `${SCREENS}/01-grants-list.png`,
            id: "scr",
            route: "app.grantpipe.com/grants",
            zoom: z0,
            alt: "GrantPipe grants portfolio list",
          }),
        })}
      </div>
      ${caption({ idx: 0, chip: "New money, new rules", num: "P2", line: "Record a grant, then split it across the funds it can pay for." })}`;
    const timeline = `
      tl.fromTo("#hero",{opacity:0,y:24},{opacity:1,y:0,duration:0.9,ease:"power3.out"},0.3);
      tl.fromTo("#hero-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},1.1);
      // Gentle continuous scale so the title card breathes instead of sitting pixel-static
      // through its ~5s hold. Touches only scale; the y/opacity exit below is unaffected.
      tl.fromTo("#hero",{scale:1},{scale:1.05,duration:5.4,ease:"sine.inOut"},1.3);
      // "A funder said yes..." (~7s) — hand off the title card to the real grants list.
      tl.to("#hero",{opacity:0,y:-26,duration:0.7,ease:"power2.in"},6.7);
      tl.fromTo("#frame-wrap",{opacity:0,y:30},{opacity:1,y:0,duration:1.0,ease:"power3.out"},7.3);
      ${capIn}
      // gentle Ken-Burns push that drifts down into the Portfolio table.
      tl.set("#scr",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr",{transform:"${z0}"},{transform:"${z1}",duration:D-9.5,ease:"sine.inOut"},9.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 01 (38s) — add the grant. Grants list -> Add grant -> Create dialog step 1
  // (name/funder/amount/status), then step 2 (dates). Sequential field spotlights.
  "01": () => {
    const rAdd = { nx: 1637, ny: 137, nw: 103, nh: 36 }; // "Add grant" button
    // 02-create-step1 dialog fields (native px).
    const fName = { nx: 729, ny: 431, nw: 462, nh: 36 };
    const fFunder = { nx: 729, ny: 501, nw: 246, nh: 36 };
    const fAmount = { nx: 729, ny: 571, nw: 462, nh: 36 };
    const fStatus = { nx: 729, ny: 655, nw: 114, nh: 36 };
    const fMeaning = { nx: 729, ny: 695, nw: 462, nh: 20 }; // stage-meaning line under status
    // 03-create-step2 date fields.
    const fStart = { nx: 729, ny: 387, nw: 462, nh: 36 };
    const fEnd = { nx: 729, ny: 457, nw: 462, nh: 36 };
    // Establishing frame on the grants list (matches ch00 end), tight enough to read
    // the "Add grant" button top-right.
    const zList = zoomTo({ nx: 404, ny: 122, nw: 1380, nh: 320, z: 1.34 });
    // Opening Ken-Burns target: push down + in so the establishing frame drifts from the
    // heading into the Portfolio table instead of holding pixel-static (fixed a frozen
    // ~33-36s global hold). A lower target region escapes zoomTo's top-edge ty clamp.
    const zListb = zoomTo({ nx: 404, ny: 240, nw: 1380, nh: 320, z: 1.36 });
    // Step-1 dialog (center 960,540). z=1.9 fits the whole 512x504 dialog with margin;
    // all five field rings (ny431..715) stay in-frame.
    const zStep1 = zoomTo({ nx: 700, ny: 284, nw: 520, nh: 512, z: 1.9 });
    const zStep1b = zoomTo({ nx: 706, ny: 290, nw: 508, nh: 500, z: 1.96 }); // idle drift
    // Step-2 dialog is taller (592px); z=1.65 fits it; both date rings in-frame.
    const zStep2 = zoomTo({ nx: 700, ny: 240, nw: 520, nh: 600, z: 1.65 });
    const listInner = `${spot({ id: "sp-add", ...rAdd })}`;
    const step1Inner = `
      ${spot({ id: "sp-name", ...fName })}
      ${spot({ id: "sp-funder", ...fFunder })}
      ${spot({ id: "sp-amount", ...fAmount })}
      ${spot({ id: "sp-status", ...fStatus })}
      ${spot({ id: "sp-meaning", ...fMeaning })}`;
    const step2Inner = `
      ${spot({ id: "sp-start", ...fStart })}
      ${spot({ id: "sp-end", ...fEnd })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "list-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/01-grants-list.png`,
            id: "scr-list",
            route: "app.grantpipe.com/grants",
            zoom: zList,
            inner: listInner,
            alt: "Grants list with Add grant button",
          }),
        })}
        ${frameSlot({
          id: "s1-wrap",
          children: screenFrame({
            src: `${SCREENS}/02-create-step1.png`,
            id: "scr-s1",
            route: "app.grantpipe.com/grants",
            zoom: zStep1,
            inner: step1Inner,
            alt: "Create grant form: name, funder, amount, status",
          }),
        })}
        ${frameSlot({
          id: "s2-wrap",
          children: screenFrame({
            src: `${SCREENS}/03-create-step2.png`,
            id: "scr-s2",
            route: "app.grantpipe.com/grants",
            zoom: zStep2,
            inner: step2Inner,
            alt: "Create grant form step two: start and end dates",
          }),
        })}
      </div>
      ${caption({ idx: 1, chip: "Add the grant", num: "01", line: "A short two-step form: name, funder, amount, status, then dates." })}`;
    // Narration (chapter-local): "This is where your grants live. To add one, you click
    // Add grant." (~0-3.5) -> "short form, two steps. First, the name." (~3.5-6.5) ->
    // "Then the funder..." (~9-13) -> "The amount: sixty thousand." (~19-21) -> "And the
    // status... Awarded... next move: set up the award details." (~22-31) -> "Step two is
    // the dates..." (~33-38).
    // Timings below are tuned to the chapter MP3 silence map (ffmpeg silencedetect):
    //   "Add grant" 2.45-4.43 | "short form" 4.77 | "First, the name." 6.68-7.73 |
    //   "Call it what your funder calls it" -10.84 | "Then the funder..." 11.17-13.98 |
    //   "You pick from funders" 14.38-16.23 | "Greater Cincinnati Foundation" 16.65-18.97 |
    //   "The amount: sixty thousand" 19.32-21.78 | "And the status." 22.16-22.92 |
    //   "...set up the award details before you spend" -32.12 | "Step two is the dates,
    //   when the grant starts and ends" 32.51-36.22 | "Then you create it." 36.62.
    const timeline = `
      // list-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      ${capIn}
      // Gentle Ken-Burns push that drifts down into the Portfolio table so the opening
      // establishing frame never holds static (the list has no drift of its own before
      // the dialog crossfade at 5.1). Ends before the crossfade; not near render-end.
      tl.set("#scr-list",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-list",{transform:"${zList}"},{transform:"${zListb}",duration:5.0,ease:"sine.inOut"},0);
      // ring the Add grant button as it's named (~2.6s), then hand off to the dialog.
      tl.fromTo("#sp-add",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},2.6);
      tl.to("#sp-add",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},4.4);
      // "It's a short form, two steps." (4.77) — crossfade list -> step-1 dialog.
      tl.fromTo("#s1-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},4.5);
      tl.to("#list-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},5.1);
      // EXCLUSIVE sequential field spotlights on the leading word of each field's narration.
      tl.fromTo("#sp-name",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},6.7);
      tl.to("#sp-name",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},10.7);
      tl.fromTo("#sp-funder",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},11.2);
      tl.to("#sp-funder",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},18.9);
      tl.fromTo("#sp-amount",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},19.4);
      tl.to("#sp-amount",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},21.8);
      tl.fromTo("#sp-status",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},22.6);
      // the stage-meaning line ("set up the award details before you spend") is spoken
      // ~28-32; ring it with the status, hold both through that line.
      tl.fromTo("#sp-meaning",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},28.0);
      tl.to(["#sp-status","#sp-meaning"],{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},32.2);
      // continuous slow Ken-Burns on the step-1 dialog so it isn't static across its long hold.
      tl.set("#scr-s1",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-s1",{transform:"${zStep1}"},{transform:"${zStep1b}",duration:27.0,ease:"sine.inOut"},5.0);
      // "Step two is the dates" (32.51) — FAST morph to step-2 (no slow double-exposure).
      // s2 sits on top of s1 in the DOM, so a 0.18s ramp reads as the form advancing.
      tl.fromTo("#s2-wrap",{opacity:0},{opacity:1,duration:0.18,ease:"power1.out"},32.5);
      tl.to("#s1-wrap",{opacity:0,duration:0.14,ease:"power1.in",overwrite:"auto"},32.54);
      // "...when the grant starts and ends." — ring the date fields as they're named.
      tl.fromTo("#sp-start",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},33.8);
      tl.fromTo("#sp-end",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},35.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 02 (29.28s) — open the grant: the four numbers. Crossfade to the detail page,
  // frame the four money cards, spotlight each as it's named.
  "02": () => {
    const cGrant = { nx: 404, ny: 298, nw: 322, nh: 134 };
    const cAlloc = { nx: 742, ny: 298, nw: 322, nh: 134 };
    const cUnalloc = { nx: 1080, ny: 298, nw: 322, nh: 134 };
    const cRemain = { nx: 1418, ny: 298, nw: 322, nh: 134 };
    // Full money-card row spans native x404-1740 (1336px). z=1.4 is the tightest that
    // keeps the whole row in-frame (z>~1.43 clips it), so a push-in can't carry the
    // motion. The row has ~250px of vertical headroom, so the opening drift is a
    // downward vertical PAN — strong enough that the open never reads as frozen.
    const zRow = zoomTo({ nx: 404, ny: 298, nw: 1336, nh: 134, z: 1.4 });
    const zRowOpen = zoomTo({ nx: 404, ny: 338, nw: 1336, nh: 134, z: 1.4 }); // ~35px pan over the open
    const zRowEnd = zoomTo({ nx: 404, ny: 348, nw: 1336, nh: 134, z: 1.4 }); // slow continue past render-end
    const inner = `
      ${spot({ id: "sp-grant", ...cGrant })}
      ${spot({ id: "sp-alloc", ...cAlloc })}
      ${spot({ id: "sp-unalloc", ...cUnalloc })}
      ${spot({ id: "sp-remain", ...cRemain })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "det-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/04-detail-unallocated.png`,
            id: "scr-det",
            route: "app.grantpipe.com/grants",
            zoom: zRow,
            inner,
            alt: "Grant detail: grant amount, allocated, unallocated, remaining",
          }),
        })}
      </div>
      ${caption({ idx: 2, chip: "The four numbers", num: "02", line: "Grant amount, allocated, unallocated, and what's left to spend." })}`;
    // Narration (chapter-local): "Here's the grant... right at the top." (~0-5) ->
    // "Grant Amount... sixty thousand." (~5-9) -> "Allocated... Right now, zero." (~9-15)
    // -> "Unallocated... full sixty thousand." (~15-21) -> "And Remaining to Spend." (~21-24).
    // Silence map: "Here's the grant... right at the top." 0.32-4.76 | "Grant Amount is the
    // whole award: sixty thousand." 5.47-7.43 | "Allocated is how much you've assigned...
    // Right now, zero." 7.77-13.67 | "Unallocated is what's still loose, the full sixty
    // thousand." 14.02-19.28 | "And Remaining to Spend." 19.75-21.38 | "Right now it's all
    // unallocated. The money is in... Let's fix that." 21.91-28.87.
    const timeline = `
      // det-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      ${capIn}
      // EXCLUSIVE spotlights, one card at a time, on the spoken name.
      tl.fromTo("#sp-grant",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},5.2);
      tl.to("#sp-grant",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},7.7);
      tl.fromTo("#sp-alloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},7.9);
      tl.to("#sp-alloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},12.9);
      tl.fromTo("#sp-unalloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},13.0);
      tl.to("#sp-unalloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},19.1);
      // Remaining to Spend now gets its own two-sentence explanation (19.3-26.8s), so the ring holds across it.
      tl.fromTo("#sp-remain",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},19.4);
      // fade the last ring so the closing line ("So the money is in...") plays on clean cards.
      tl.to("#sp-remain",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},27.3);
      tl.set("#scr-det",{transformOrigin:"0 0"},0);
      // Opening vertical pan so the four-card row visibly drifts as the chapter opens
      // (fixes a near-frozen ~71-75s global hold; the prior z-only drift was too small
      // because z is capped before the row clips). ~35px over 5.5s reads as a calm pan.
      tl.fromTo("#scr-det",{transform:"${zRow}"},{transform:"${zRowOpen}",duration:5.5,ease:"sine.inOut"},0.4);
      // Continue a very slow drift through the spotlight sequence and PAST the rendered
      // tail (ends ~D+0.6): if a transform tween finishes a few frames before
      // data-duration, the renderer leaves the remaining frames blank (the ~0.4s empty
      // paper flash that surfaced at the ch02->ch03 seam). Keeping the drift active
      // through the final frame holds the panel painted. Adjacent to the open pan (no overlap).
      tl.to("#scr-det",{transform:"${zRowEnd}",duration:(D+1.0)-5.9,ease:"sine.inOut"},5.9);`;
    return { kicker: KICKER, body, timeline };
  },

  // 03 (42.88s) — split it across funds. Alloc-1 dialog -> detail (Allocated 40k,
  // Unallocated 20k, Capacity row) -> Alloc-2 dialog -> detail fully allocated
  // (Unallocated 0, both fund rows). The numbers move as the voice names them.
  "03": () => {
    // 05-alloc1-dialog / 07-alloc2-dialog fields.
    const a1Fund = { nx: 729, ny: 511, nw: 202, nh: 36 };
    const a1Amount = { nx: 729, ny: 581, nw: 462, nh: 36 };
    const a1Desc = { nx: 729, ny: 437, nw: 462, nh: 40 };
    const a2Fund = { nx: 729, ny: 511, nw: 208, nh: 36 };
    const a2Amount = { nx: 729, ny: 581, nw: 462, nh: 36 };
    // 06 / 08 detail cards + fund rows.
    const cAlloc = { nx: 742, ny: 298, nw: 322, nh: 134 };
    const cUnalloc = { nx: 1080, ny: 298, nw: 322, nh: 134 };
    const rCapacity = { nx: 404, ny: 578, nw: 1336, nh: 114 };
    const rGeneral = { nx: 404, ny: 700, nw: 1336, nh: 114 };
    // Alloc dialogs (512x308, center 960,540). z=2.4 fills the dialog with margin.
    const zDlg = zoomTo({ nx: 704, ny: 386, nw: 512, nh: 308, z: 2.4 });
    const zDlg2 = zoomTo({ nx: 708, ny: 390, nw: 504, nh: 300, z: 2.46 }); // idle drift
    // Detail framed to show BOTH the money cards (ny298-432) and the fund rows
    // (ny578-814). z=1.4 keeps the 1336-wide row fully in-frame; centered on ny556 the
    // visible band (~201-911) covers cards and both fund rows.
    const zDet = zoomTo({ nx: 404, ny: 298, nw: 1336, nh: 520, z: 1.4 });
    const zDet2 = zoomTo({ nx: 404, ny: 300, nw: 1336, nh: 516, z: 1.42 });
    const a1Inner = `
      ${spot({ id: "sp-a1desc", ...a1Desc })}
      ${spot({ id: "sp-a1fund", ...a1Fund })}
      ${spot({ id: "sp-a1amount", ...a1Amount })}`;
    const d1Inner = `
      ${spot({ id: "sp-d1alloc", ...cAlloc })}
      ${spot({ id: "sp-d1unalloc", ...cUnalloc })}
      ${spot({ id: "sp-d1cap", ...rCapacity })}`;
    const a2Inner = `
      ${spot({ id: "sp-a2fund", ...a2Fund })}
      ${spot({ id: "sp-a2amount", ...a2Amount })}`;
    const d2Inner = `
      ${spot({ id: "sp-d2unalloc", ...cUnalloc })}
      ${spot({ id: "sp-d2cap", ...rCapacity })}
      ${spot({ id: "sp-d2gen", ...rGeneral })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "a1-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/05-alloc1-dialog.png`,
            id: "scr-a1",
            route: "app.grantpipe.com/grants",
            zoom: zDlg,
            inner: a1Inner,
            alt: "Add allocation: Capacity Building Fund, 40,000",
          }),
        })}
        ${frameSlot({
          id: "d1-wrap",
          children: screenFrame({
            src: `${SCREENS}/06-detail-after-alloc1.png`,
            id: "scr-d1",
            route: "app.grantpipe.com/grants",
            zoom: zDet,
            inner: d1Inner,
            alt: "Grant detail: allocated 40,000, unallocated 20,000",
          }),
        })}
        ${frameSlot({
          id: "a2-wrap",
          children: screenFrame({
            src: `${SCREENS}/07-alloc2-dialog.png`,
            id: "scr-a2",
            route: "app.grantpipe.com/grants",
            zoom: zDlg,
            inner: a2Inner,
            alt: "Add allocation: General Operating Fund, 20,000",
          }),
        })}
        ${frameSlot({
          id: "d2-wrap",
          children: screenFrame({
            src: `${SCREENS}/08-detail-fully-allocated.png`,
            id: "scr-d2",
            route: "app.grantpipe.com/grants",
            zoom: zDet,
            inner: d2Inner,
            alt: "Grant detail fully allocated: unallocated 0, two fund rows",
          }),
        })}
      </div>
      ${caption({ idx: 3, chip: "Split it across funds", num: "03", line: "Assign each dollar to a fund. The totals update as you go." })}`;
    // Narration (chapter-local): intro + "Allocations tab" (~0-8) -> "First fund: Capacity
    // Building, forty thousand." (~8-12) -> "Save it... Allocated is now forty thousand.
    // Unallocated dropped to twenty." (~16-24) -> "Second fund: General Operating, the last
    // twenty thousand." (~26-30) -> "And Unallocated hits zero. Every dollar... a home." (~31-42).
    // Retuned to the chapter MP3 silence map. The previous cut revealed each result
    // ~3-5s AHEAD of the voice; every beat below now lands on the spoken phrase:
    //   desc/setup (~1.2-8.8) | "Capacity Building Fund" fund ring 10.3, "forty thousand"
    //   amount 11.6 | save -> detail#1 at 18.1 | "Allocated is now forty" 21.1,
    //   "Unallocated dropped to twenty" 23.6, Capacity row 25.9 | "Second fund: General
    //   Operating" -> alloc#2 at 28.6, fund 29.9, "twenty thousand" 31.3 | "Unallocated
    //   hits zero" -> fully-allocated at 32.8, unalloc 33.5, both rows 36.1/36.9.
    const timeline = `
      // a1-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      ${capIn}
      tl.set("#scr-a1",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-a1",{transform:"${zDlg}"},{transform:"${zDlg2}",duration:18.0,ease:"sine.inOut"},0.4);
      // intro/description, then ring fund and amount as they're named.
      tl.fromTo("#sp-a1desc",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},1.2);
      tl.to("#sp-a1desc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},8.8);
      tl.fromTo("#sp-a1fund",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},10.3);
      tl.fromTo("#sp-a1amount",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},11.6);
      tl.to(["#sp-a1fund","#sp-a1amount"],{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},17.6);
      // "Save it, and watch the numbers move" — crossfade to detail #1.
      tl.fromTo("#d1-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},18.1);
      tl.to("#a1-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},18.7);
      tl.set("#scr-d1",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-d1",{transform:"${zDet}"},{transform:"${zDet2}",duration:10.5,ease:"sine.inOut"},18.9);
      // "Allocated is now forty thousand." -> "Unallocated dropped to twenty." -> Capacity row.
      tl.fromTo("#sp-d1alloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},21.1);
      tl.to("#sp-d1alloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},23.4);
      tl.fromTo("#sp-d1unalloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},23.6);
      tl.to("#sp-d1unalloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},25.7);
      tl.fromTo("#sp-d1cap",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},25.9);
      tl.to("#sp-d1cap",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},28.4);
      // "Second fund: General Operating..." — crossfade to alloc-2 dialog.
      tl.fromTo("#a2-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},28.6);
      tl.to("#d1-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},29.2);
      tl.fromTo("#sp-a2fund",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},29.9);
      tl.fromTo("#sp-a2amount",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},31.3);
      tl.to(["#sp-a2fund","#sp-a2amount"],{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},32.7);
      // "And Unallocated hits zero." — crossfade to fully-allocated detail.
      tl.fromTo("#d2-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},32.8);
      tl.to("#a2-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},33.4);
      tl.set("#scr-d2",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-d2",{transform:"${zDet}"},{transform:"${zDet2}",duration:D-33.2,ease:"sine.inOut"},33.2);
      tl.fromTo("#sp-d2unalloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},33.5);
      tl.to("#sp-d2unalloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},35.8);
      // "Every dollar of this grant now has a home." — ring both fund rows together.
      tl.fromTo("#sp-d2cap",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},36.1);
      tl.fromTo("#sp-d2gen",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},36.9);
      tl.to(["#sp-d2cap","#sp-d2gen"],{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},39.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 04 (32.36s) — the guardrail. Fully-allocated detail -> over-allocation attempt ->
  // inline error "Allocation would exceed grant amount." A small punch-in on the error.
  "04": () => {
    const dAlert = { nx: 729, ny: 615, nw: 462, nh: 20 };
    const dAmount = { nx: 729, ny: 563, nw: 462, nh: 36 };
    const rGeneral = { nx: 404, ny: 700, nw: 1336, nh: 114 };
    // Fully-allocated detail (continuity from ch03) framed on the card+row band.
    const zDet = zoomTo({ nx: 404, ny: 298, nw: 1336, nh: 520, z: 1.4 });
    const zDet2 = zoomTo({ nx: 404, ny: 300, nw: 1336, nh: 516, z: 1.42 });
    // 09-guardrail-error dialog (512x344, center 960,540). z=2.2 fits it; the punch
    // tightens to z=2.35 as the error lights, then settles.
    const zErr = zoomTo({ nx: 704, ny: 368, nw: 512, nh: 344, z: 2.2 });
    const zErr2 = zoomTo({ nx: 706, ny: 370, nw: 512, nh: 342, z: 2.24 }); // tail idle drift
    const zErrPunch = zoomTo({ nx: 712, ny: 408, nw: 470, nh: 300, z: 2.5 }); // tight on the alert
    const zErrPunch2 = zoomTo({ nx: 714, ny: 410, nw: 470, nh: 298, z: 2.52 }); // idle drift while held tight
    const detInner = `${spot({ id: "sp-full", ...rGeneral })}`;
    const errInner = `
      ${spot({ id: "sp-amount", ...dAmount })}
      ${spot({ id: "sp-alert", ...dAlert })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "det-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/08-detail-fully-allocated.png`,
            id: "scr-det",
            route: "app.grantpipe.com/grants",
            zoom: zDet,
            inner: detInner,
            alt: "Grant detail fully allocated",
          }),
        })}
        ${frameSlot({
          id: "err-wrap",
          children: screenFrame({
            src: `${SCREENS}/09-guardrail-error.png`,
            id: "scr-err",
            route: "app.grantpipe.com/grants",
            zoom: zErr,
            inner: errInner,
            alt: "Allocation would exceed grant amount error",
          }),
        })}
      </div>
      ${caption({ idx: 4, chip: "The guardrail", num: "04", line: "Try to over-allocate and GrantPipe stops you cold." })}`;
    // Narration (chapter-local): "Now the part I'm proud of. Say you try to assign more
    // than the grant is worth. A typo, or one fund too many." (~0-8) -> "GrantPipe stops
    // you. 'Allocation would exceed grant amount.'" (~8-13) -> "...the whole reason a tool
    // helps... can't promise sixty-five thousand... auditor... won't let you go over." (~13-32).
    // Silence map: "Now the part I'm proud of." 0-2.04 | "Say you try to assign more than
    // the grant is worth." 2.37-5.80 | "A typo, or one fund too many." 6.17-8.52 |
    // "GrantPipe stops you." 9.08-10.76 | "Allocation would exceed grant amount." 11.44-13.95
    // | "...the whole reason a tool helps." -19.60 | "You can't promise sixty-five thousand
    // dollars of a sixty-thousand-dollar grant." 20.00-24.39 | auditor line -32.
    const timeline = `
      // det-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      ${capIn}
      tl.set("#scr-det",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-det",{transform:"${zDet}"},{transform:"${zDet2}",duration:8.5,ease:"sine.inOut"},0.6);
      tl.fromTo("#sp-full",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},1.4);
      tl.to("#sp-full",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},8.3);
      // "...one fund too many." ends 8.52 — crossfade to the over-allocation attempt; show the too-big amount.
      tl.fromTo("#err-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.6,ease:"power3.out"},8.5);
      tl.to("#det-wrap",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},9.1);
      tl.fromTo("#sp-amount",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},9.0);
      tl.to("#sp-amount",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},11.2);
      // "Allocation would exceed grant amount." (11.44) — punch in on the inline alert and
      // ring it; hold the ring through the auditor line.
      tl.set("#scr-err",{transformOrigin:"0 0"},0);
      tl.to("#scr-err",{transform:"${zErrPunch}",duration:0.9,ease:"power3.inOut"},11.2);
      tl.fromTo("#sp-alert",{opacity:0,scale:0.94},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.5)"},11.6);
      // Keep the tight alert framing alive with a slow drift instead of freezing on it
      // through the "whole reason a tool helps" line (adjacent to the ease-back, no overlap).
      tl.to("#scr-err",{transform:"${zErrPunch2}",duration:7.9,ease:"sine.inOut"},12.1);
      // gentle ease back out so the rest of the dialog is visible during the auditor line.
      tl.to("#scr-err",{transform:"${zErr}",duration:1.4,ease:"sine.inOut"},20.0);
      // Continuous drift through the chapter tail so the guardrail beat never freezes.
      // Runs PAST the rendered end (like ch02's drift) so the final frames stay painted.
      tl.to("#scr-err",{transform:"${zErr2}",duration:(D+1.0)-21.4,ease:"sine.inOut"},21.4);`;
    return { kicker: KICKER, body, timeline };
  },

  // 05 (25.4s) — you're set. Calm fully-allocated detail -> end card with the
  // lead-magnet title and "in your inbox", GrantPipe mark, gentle final fade.
  "05": () => {
    const cUnalloc = { nx: 1080, ny: 298, nw: 322, nh: 134 };
    const zDet = zoomTo({ nx: 404, ny: 298, nw: 1336, nh: 520, z: 1.4 });
    const zDet2 = zoomTo({ nx: 404, ny: 300, nw: 1336, nh: 516, z: 1.45 });
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "det-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/08-detail-fully-allocated.png`,
            id: "scr-det",
            route: "app.grantpipe.com/grants",
            zoom: zDet,
            inner: spot({ id: "sp-zero", ...cUnalloc }),
            alt: "Grant detail fully allocated, unallocated zero",
          }),
        })}
        <div id="end" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:30px;z-index:6">
          <div id="end-mark" role="img" aria-label="GrantPipe" style="width:96px;height:96px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat"></div>
          <div id="end-head" style="font-family:'Sora';font-weight:700;font-size:74px;letter-spacing:-1.5px;color:var(--ink);text-align:center">You're set.</div>
          <div id="end-card" style="background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:18px;box-shadow:var(--shadow);padding:26px 38px;max-width:1020px;text-align:center">
            <div style="font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">Free template</div>
            <div style="font-family:'Sora';font-weight:600;font-size:40px;margin-top:10px;color:var(--ink)">Restricted Fund Tracking Spreadsheet</div>
            <div style="font-family:'Plex';font-weight:500;font-size:28px;margin-top:10px;color:var(--muted)">Built for restricted money. It's in your inbox.</div>
          </div>
        </div>
      </div>
      ${caption({ idx: 5, chip: "You're set", num: "05", line: "A grant recorded and split, with the math handled for you." })}`;
    // Final scene: exit animations ALLOWED here only (gentle fade).
    // Narration (chapter-local): "That's a grant recorded and split... no second-guessing."
    // (~0-8) -> "Not in GrantPipe yet?... We made a free one... the Restricted Fund Tracking
    // Spreadsheet. Want it? We'll send it to your inbox." (~9-20) -> "Next, we'll track what
    // you actually spend..." (~20-25).
    // Silence map: "That's a grant recorded and split across its funds, with the math
    // handled for you." 0-5.24 | "Two minutes, no spreadsheet, no second-guessing." 5.80-8.79
    // | "Not in GrantPipe yet?" 9.41 | "Maybe you're tracking this in a spreadsheet." 11.02
    // | "...the Restricted Fund Tracking Spreadsheet." 13.07-17.94 | "Want it? We'll send it
    // to your inbox." 18.43-20.18 | "Next, we'll track what you actually spend..." 20.79-25.09.
    const timeline = `
      // det-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      ${capIn}
      // ring Unallocated $0 during "...with the math handled for you." (ends 5.24).
      tl.fromTo("#sp-zero",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},1.2);
      tl.to("#sp-zero",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},5.2);
      // slow Ken-Burns on the detail across its hold before the fade-out.
      tl.set("#scr-det",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-det",{transform:"${zDet}"},{transform:"${zDet2}",duration:8.4,ease:"sine.inOut"},0.6);
      // fade detail out, bring up the calm end card. The "Restricted Fund Tracking
      // Spreadsheet" name is spoken ~14-16s, so the card must be fully revealed by then.
      tl.to("#det-wrap",{opacity:0,duration:0.8,ease:"power2.inOut",overwrite:"auto"},9.0);
      tl.fromTo("#end",{opacity:0,y:26},{opacity:1,y:0,duration:0.9,ease:"power3.out"},9.6);
      tl.fromTo("#end-card",{opacity:0,y:20,scale:0.96},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.4)"},11.0);
      // very slow drift on the outro group so it isn't motionless until the fade.
      tl.fromTo("#end",{transformOrigin:"50% 50%",y:0,scale:1},{y:-16,scale:1.045,duration:(D-1.1)-11.6,ease:"sine.inOut"},11.6);
      // final gentle fade-out (final scene only).
      tl.to(["#end","#cap","#chrome-wordmark","#chrome-kicker","#chrome-progress"],{opacity:0,duration:0.9,ease:"power2.in"},D-1.1);`;
    return { kicker: KICKER, body, timeline };
  },
};

const COMP_DIR = resolve(__dirname, "compositions");
if (!existsSync(COMP_DIR)) mkdirSync(COMP_DIR, { recursive: true });

let count = 0;
for (const ch of durations.chapters) {
  const make = scenes[ch.id];
  if (!make) {
    console.warn("no scene for", ch.id);
    continue;
  }
  const scene = make();
  const dur = ch.duration;
  const body = scene.body.replaceAll("DUR", String(dur));
  const html = doc({
    id: `chapter-${ch.id}`,
    duration: dur,
    body,
    timeline: scene.timeline,
    kicker: scene.kicker,
  });
  const out = resolve(COMP_DIR, `chapter-${ch.id}.html`);
  writeFileSync(out, html);
  count++;
  console.log(`wrote compositions/chapter-${ch.id}.html  (${dur}s)`);
}
console.log(`\n${count} compositions generated.`);
