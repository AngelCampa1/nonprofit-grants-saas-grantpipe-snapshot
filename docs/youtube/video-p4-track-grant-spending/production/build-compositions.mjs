// Generates compositions/chapter-XX.html for P4 "How to Track Grant Spending
// Without Losing Your Mind" (concept-then-demo), timed to the recorded audio
// durations and silence maps.
//
// Concept half (chapters 00-02) and the outro (06) are hand-built warm-paper art
// (the bank-balance question; the Award − Spent = Left equation with the two
// overspend/underspend risks; the three things tracking takes; the recap card +
// lead-magnet chip).
//
// Demo half (chapters 03-05) composites the REAL captured GrantPipe screenshots
// (assets/screens/*.png, captured from the running app via capture-p4.mjs) inside
// fixed browser-chrome frames with Ken-Burns + word-synced spotlights. Mirrors the
// P3 build (screenFrame + zoomTo + spot + frameSlot + caption + crossfades).
//
// Real-product integrity (verified against the captured screens):
//   03 — screen 01: the four header cards Grant Amount / Allocated / Unallocated /
//        Remaining to Spend (columns x=403/741/1079/1417, w=322; band y=120, h=112).
//   04 — screen 03 (Expenses ledger: description + amount per row, NO date column —
//        narration says "a short note and what it cost", never claims a date column)
//        crossfading to screen 04 (Add-expense dialog: Amount / Date / Description).
//   05 — screen 02 (Overview "Burn rate: $9,829.45/mo" line) crossfading to screen 05
//        (Spend-Down: Burn Rate card + By Month breakdown). Spend-Down is plan-gated;
//        narration says so.
// No dollar figures are spoken, so narration can never drift from the screen numbers.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doc, screenFrame, progress, zoomTo, FRAME_W, FRAME_TOP, FRAME_LEFT, IMG_K } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

const SCREENS = "../assets/screens";
const KICKER = "Grant Spending";

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

// Spotlight ring over a screenshot region (lives INSIDE .shotzoom — coords are css px
// relative to the image origin, native px * IMG_K — so it pans/zooms with the image).
function spot({ id, nx, ny, nw, nh, pad = 10 }) {
  const left = Math.round((nx - pad) * IMG_K);
  const top = Math.round((ny - pad) * IMG_K);
  const w = Math.round((nw + pad * 2) * IMG_K);
  const h = Math.round((nh + pad * 2) * IMG_K);
  return `<div id="${id}" class="spot" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;opacity:0"></div>`;
}

// A fixed-position holder for one screen frame inside the constant box (so chapters can
// cross-fade between screens without the card moving). `open:true` paints it at t=0.
function frameSlot({ id, extraStyle = "", children, open = false }) {
  return `<div id="${id}" style="position:absolute;left:${FRAME_LEFT}px;top:${FRAME_TOP}px;width:${FRAME_W}px;opacity:${open ? 1 : 0};${extraStyle}">${children}</div>`;
}

// ---- Concept-art helpers (warm paper, emerald + ochre, Sora/Plex) ----------------
function conceptStage(children) {
  return `<div class="stage" style="gap:0">${children}</div>`;
}

// ---- Scene builders. Each returns {kicker, body, timeline}. DUR replaced per chapter. ----
const scenes = {
  // 00 — hook (concept). The bank balance can't answer "how much is left on THIS
  // grant?". A muted "one big number" line, then the emerald question, then a soft
  // builder note via the caption. (39.6s)
  "00": () => {
    const body = `
      ${conceptStage(`
        <div id="hook" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:40px;z-index:4;width:1500px">
          <div id="hk-tag" style="opacity:0;font-family:'Mono';font-weight:500;font-size:22px;letter-spacing:4px;text-transform:uppercase;color:var(--ochre)">Tracking grant spending</div>
          <div id="hk-bank" style="opacity:0;display:flex;align-items:baseline;gap:18px;font-family:'Plex';font-weight:500;font-size:46px;color:var(--muted)">
            <span>Checking</span><span style="font-family:'Mono';font-weight:500;color:var(--ink)">one big number</span>
          </div>
          <div id="hk-q" style="opacity:0;font-family:'Sora';font-weight:700;font-size:74px;line-height:1.14;letter-spacing:-1px;color:var(--emerald);text-align:center;max-width:1380px">How much is left on this grant?</div>
        </div>
      `)}
      ${caption({ idx: 0, chip: "Your bank balance can't answer this", num: "P4", line: "One account holds every grant and your own money. Mixed together." })}`;
    const timeline = `
      tl.fromTo("#hook",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},0.3);
      tl.fromTo("#hk-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.5);
      // the bank-balance line on "Now you have to spend it" (~1.8).
      tl.fromTo("#hk-bank",{opacity:0,y:22},{opacity:1,y:0,duration:0.8,ease:"power3.out"},2.0);
      // the question lands as it's asked: "How much of this grant is left..." (~7.8).
      tl.fromTo("#hk-q",{opacity:0,y:30,scale:0.97},{opacity:1,y:0,scale:1,duration:1.0,ease:"power3.out"},7.8);
      ${capIn}
      // gentle continuous swell so the card breathes through its long hold (anti-freeze).
      tl.fromTo("#hook",{scale:1},{scale:1.035,duration:(D-1.0),yoyo:true,repeat:1,ease:"sine.inOut"},2.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 01 — what tracking means (concept). The equation builds: Award amount − What you've
  // spent = What's left. Then two red risk tags fade in: overspend → you eat it,
  // underspend → clawed back. (43.72s)
  "01": () => {
    const term = (id, label, accent) => `
      <div id="${id}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:6px solid ${accent};border-radius:18px;box-shadow:var(--shadow);padding:30px 36px;text-align:center;min-width:300px">
        <div style="font-family:'Sora';font-weight:700;font-size:40px;letter-spacing:-0.5px;color:var(--ink);line-height:1.1">${label}</div>
      </div>`;
    const op = (id, ch) => `<div id="${id}" style="opacity:0;font-family:'Sora';font-weight:700;font-size:60px;color:var(--muted)">${ch}</div>`;
    const risk = (id, head, tail) => `
      <div id="${id}" style="opacity:0;display:flex;align-items:center;gap:18px;background:var(--red-50);border:1px solid var(--red);border-radius:14px;padding:16px 24px">
        <div style="font-family:'Plex';font-weight:600;font-size:28px;color:var(--ink)">${head}</div>
        <div style="font-family:'Mono';font-weight:500;font-size:18px;letter-spacing:1px;text-transform:uppercase;color:var(--red);background:var(--white);border:1px solid var(--red);border-radius:999px;padding:6px 16px">${tail}</div>
      </div>`;
    const body = `
      ${conceptStage(`
        <div style="position:absolute;display:flex;flex-direction:column;align-items:center;gap:52px;z-index:4;width:1640px">
          <div id="eq" style="display:flex;align-items:center;gap:26px">
            ${term("eq-award", "Award amount", "var(--muted)")}
            ${op("eq-minus", "−")}
            ${term("eq-spent", "What you've spent", "var(--ochre)")}
            ${op("eq-eq", "=")}
            ${term("eq-left", "What's left", "var(--emerald)")}
          </div>
          <div style="display:flex;flex-direction:column;gap:22px;align-items:center">
            ${risk("rk-over", "Spend on what it doesn't cover", "you eat it")}
            ${risk("rk-slow", "Spend too slowly", "funder claws it back")}
          </div>
        </div>
      `)}
      ${caption({ idx: 1, chip: "What tracking spending means", num: "01", line: "Take the award, subtract what you spent. What's left is your balance." })}`;
    const timeline = `
      // Equation builds on cue: "Take the award amount" ~10.8; "Subtract what you've
      // spent" ~12.2; "What's left is your remaining balance" ~14.4. Risk tags on
      // "you eat the cost" ~26.5 and "funder takes the rest back" ~33.8.
      tl.fromTo("#eq-award",{opacity:0,y:22},{opacity:1,y:0,duration:0.7,ease:"power3.out"},10.8);
      tl.fromTo("#eq-minus",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.35,ease:"back.out(2)"},12.0);
      tl.fromTo("#eq-spent",{opacity:0,y:22},{opacity:1,y:0,duration:0.7,ease:"power3.out"},12.3);
      tl.fromTo("#eq-eq",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.35,ease:"back.out(2)"},14.2);
      tl.fromTo("#eq-left",{opacity:0,y:22,scale:0.95},{opacity:1,y:0,scale:1,duration:0.8,ease:"back.out(1.4)"},14.5);
      ${capIn}
      tl.fromTo("#rk-over",{opacity:0,x:-30},{opacity:1,x:0,duration:0.7,ease:"power3.out"},26.5);
      tl.fromTo("#rk-slow",{opacity:0,x:30},{opacity:1,x:0,duration:0.7,ease:"power3.out"},33.8);
      // slow breath on the equation through the long holds (anti-freeze).
      tl.fromTo("#eq",{scale:1},{scale:1.03,duration:(D-16.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},16.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 02 — what it takes (concept). Three chips build in turn: a running total you trust,
  // a list of every cost, a sense of pace. Then a faded receipts drawer with a red
  // "no per-grant view" tag (the familiar failure mode). (31.36s)
  "02": () => {
    const chip = (id, label, sub, accent) => `
      <div id="${id}" style="opacity:0;width:420px;background:var(--white);border:1px solid var(--line);border-left:6px solid ${accent};border-radius:16px;box-shadow:var(--shadow);padding:26px 30px;text-align:left">
        <div style="font-family:'Sora';font-weight:700;font-size:34px;letter-spacing:-0.4px;color:var(--ink);line-height:1.15">${label}</div>
        <div style="font-family:'Plex';font-weight:500;font-size:24px;color:var(--muted);margin-top:8px">${sub}</div>
      </div>`;
    const body = `
      ${conceptStage(`
        <div style="position:absolute;display:flex;flex-direction:column;align-items:center;gap:46px;z-index:4">
          <div id="chips" style="display:flex;gap:30px;align-items:stretch">
            ${chip("ch-total", "A running total", "for each grant, that you trust", "var(--emerald)")}
            ${chip("ch-list", "A list of every cost", "so you can show your work", "var(--ochre)")}
            ${chip("ch-pace", "A sense of pace", "so the deadline can't sneak up", "var(--emerald)")}
          </div>
          <div id="fail" style="opacity:0;display:flex;align-items:center;gap:20px;background:var(--red-50);border:1px solid var(--red);border-radius:14px;padding:18px 28px">
            <div style="font-family:'Plex';font-weight:600;font-size:30px;color:var(--ink)">One account, receipts in a drawer</div>
            <div style="font-family:'Mono';font-weight:500;font-size:19px;letter-spacing:1px;text-transform:uppercase;color:var(--red);background:var(--white);border:1px solid var(--red);border-radius:999px;padding:6px 16px">No per-grant view</div>
          </div>
        </div>
      `)}
      ${caption({ idx: 2, chip: "What it actually takes", num: "02", line: "A running total, a list of every cost, and a sense of pace." })}`;
    const timeline = `
      // Chips on cue: "A running total..." ~2.1; "A list of every cost..." ~5.4;
      // "And a sense of pace" ~8.8. Failure card on "Receipts in a drawer / No
      // per-grant view" ~17.0.
      tl.fromTo("#ch-total",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},2.1);
      tl.fromTo("#ch-list",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},5.4);
      tl.fromTo("#ch-pace",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"back.out(1.3)"},8.8);
      ${capIn}
      tl.fromTo("#fail",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},17.0);
      // continuous slow breath on the chip row so the inter-reveal gaps never freeze.
      tl.fromTo("#chips",{scale:1},{scale:1.03,duration:(D-10.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},10.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 03 — the grant's four numbers (demo). Screen 01: the four header cards. Slow
  // Ken-Burns push-in; ring Grant Amount, Allocated, Unallocated in turn, then hold on
  // Remaining to Spend. (36.56s)
  "03": () => {
    const cGrant = { nx: 403, ny: 120, nw: 322, nh: 112 };
    const cAlloc = { nx: 741, ny: 120, nw: 322, nh: 112 };
    const cUnalloc = { nx: 1079, ny: 120, nw: 322, nh: 112 };
    const cRemain = { nx: 1417, ny: 120, nw: 322, nh: 112 };
    // Establishing frame on the whole four-card row, then a slow push-in.
    const zRow = zoomTo({ nx: 403, ny: 110, nw: 1336, nh: 140, z: 1.3 });
    const zGrant = zoomTo({ ...cGrant, z: 2.2 });
    const zAlloc = zoomTo({ ...cAlloc, z: 2.2 });
    const zUnalloc = zoomTo({ ...cUnalloc, z: 2.2 });
    const zRemain = zoomTo({ ...cRemain, z: 2.2 });
    const zRemainB = zoomTo({ ...cRemain, z: 2.28 }); // closing breath
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "cards-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/01-grant-overview-cards.png`,
            id: "scr-cards",
            route: "app.grantpipe.com/grants/title-iii-c",
            zoom: zRow,
            inner: `${spot({ id: "sp-grant", ...cGrant })}${spot({ id: "sp-alloc", ...cAlloc })}${spot({ id: "sp-unalloc", ...cUnalloc })}${spot({ id: "sp-remain", ...cRemain })}`,
            alt: "Grant overview: Grant Amount, Allocated, Unallocated, Remaining to Spend",
          }),
        })}
      </div>
      ${caption({ idx: 3, chip: "The grant's four numbers", num: "03", line: "Remaining to Spend is the live answer: award minus every expense." })}`;
    const timeline = `
      // cards-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      // Cues: "Grant Amount" ~8.2; "Allocated" ~10.9; "Unallocated" ~14.3; "Remaining to
      // Spend" ~18.5, then hold through "the live answer" ~20.5 and "ticks down" ~30.7.
      ${capIn}
      // tl.set base transform once, then tl.to() for each pan (avoids immediateRender pinning).
      tl.set("#scr-cards",{transformOrigin:"0 0",transform:"${zRow}"},0);
      // slow establishing push-in over the row before the first card is named.
      tl.to("#scr-cards",{transform:"${zGrant}",duration:1.6,ease:"sine.inOut"},6.6);
      tl.fromTo("#sp-grant",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},8.2);
      tl.to("#sp-grant",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},10.2);
      // pan to Allocated.
      tl.to("#scr-cards",{transform:"${zAlloc}",duration:1.1,ease:"sine.inOut"},10.0);
      tl.fromTo("#sp-alloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},10.9);
      tl.to("#sp-alloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},13.6);
      // pan to Unallocated.
      tl.to("#scr-cards",{transform:"${zUnalloc}",duration:1.1,ease:"sine.inOut"},13.4);
      tl.fromTo("#sp-unalloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},14.3);
      tl.to("#sp-unalloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},16.2);
      // pan to Remaining to Spend and hold there for the rest of the chapter.
      tl.to("#scr-cards",{transform:"${zRemain}",duration:1.3,ease:"sine.inOut"},16.6);
      tl.fromTo("#sp-remain",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.5)"},18.5);
      // slow zoom-in breath on the held Remaining view so the long tail never freezes.
      tl.to("#scr-cards",{transform:"${zRemainB}",duration:(D-0.8-22.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},22.0);
      tl.to("#sp-remain",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},D-0.8);`;
    return { kicker: KICKER, body, timeline };
  },

  // 04 — record what you spend (demo). Screen 03 (ledger): spotlight the list and one
  // row (note + amount, NO date column). Ring "Add expense", crossfade to screen 04
  // (the dialog), ring Amount / Date / Description in turn, then crossfade back to the
  // ledger. (37.52s)
  "04": () => {
    const rAdd = { nx: 404, ny: 338, nw: 124, nh: 42 };
    const rRow1 = { nx: 404, ny: 393, nw: 1336, nh: 110 };
    const rAmount = { nx: 1560, ny: 393, nw: 180, nh: 110 }; // amount + Delete column, row 1
    // screen 04 dialog regions (dialog bbox x705-1212, y363-717).
    const fAmount = { nx: 731, ny: 388, nw: 456, nh: 82 };
    const fDate = { nx: 731, ny: 476, nw: 456, nh: 64 };
    const fDesc = { nx: 731, ny: 545, nw: 456, nh: 108 };
    // Ledger establishing frame: the list below the Add-expense button.
    const zList = zoomTo({ nx: 404, ny: 330, nw: 1336, nh: 460, z: 1.32 });
    const zListB = zoomTo({ nx: 404, ny: 345, nw: 1336, nh: 460, z: 1.34 });
    const zRow = zoomTo({ nx: 404, ny: 393, nw: 1336, nh: 230, z: 1.55 });
    // Dialog (centered ~958,540; ~510x356). z=1.85 fits it with margin.
    const zDlg = zoomTo({ nx: 700, ny: 355, nw: 520, nh: 372, z: 1.85 });
    const zDlgB = zoomTo({ nx: 704, ny: 359, nw: 512, nh: 364, z: 1.9 });
    // Closing ledger frame (after save).
    const zBack = zoomTo({ nx: 404, ny: 345, nw: 1336, nh: 460, z: 1.32 });
    const zBackB = zoomTo({ nx: 404, ny: 360, nw: 1336, nh: 460, z: 1.34 });
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "list-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/03-expenses-ledger.png`,
            id: "scr-list",
            route: "app.grantpipe.com/grants/title-iii-c",
            zoom: zList,
            inner: `${spot({ id: "sp-add", ...rAdd })}${spot({ id: "sp-row", ...rRow1 })}${spot({ id: "sp-amount", ...rAmount })}`,
            alt: "Expenses ledger: each line shows a note and an amount",
          }),
        })}
        ${frameSlot({
          id: "dlg-wrap",
          children: screenFrame({
            src: `${SCREENS}/04-add-expense-dialog.png`,
            id: "scr-dlg",
            route: "app.grantpipe.com/grants/title-iii-c",
            zoom: zDlg,
            inner: `${spot({ id: "sp-fa", ...fAmount })}${spot({ id: "sp-fd", ...fDate })}${spot({ id: "sp-fde", ...fDesc })}`,
            alt: "Add expense dialog: Amount, Date, Description",
          }),
        })}
        ${frameSlot({
          id: "back-wrap",
          children: screenFrame({
            src: `${SCREENS}/03-expenses-ledger.png`,
            id: "scr-back",
            route: "app.grantpipe.com/grants/title-iii-c",
            zoom: zBack,
            inner: spot({ id: "sp-back", ...rRow1 }),
            alt: "Expenses ledger after saving: the cost joins the list",
          }),
        })}
      </div>
      ${caption({ idx: 4, chip: "Record what you spend", num: "04", line: "Add a cost, and Remaining to Spend drops by that much on its own." })}`;
    const timeline = `
      // list-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      // Cues: "on the Expenses tab" ~3.7; "every cost on the grant" ~5.4; "Each line
      // shows a short note and what it cost" ~8.0; "To add one, you open a small form"
      // ~11.2; "Amount, date, a quick description" ~15.4-17.4; "Save it" ~18.3; "The
      // cost joins the list..." ~22.4; "That list is what you hand a funder" ~29.9.
      ${capIn}
      tl.set("#scr-list",{transformOrigin:"0 0",transform:"${zList}"},0);
      tl.to("#scr-list",{transform:"${zListB}",duration:8.0,ease:"sine.inOut"},0.3);
      // spotlight one row as "Each line shows a short note and what it cost" is spoken.
      tl.to("#scr-list",{transform:"${zRow}",duration:1.0,ease:"sine.inOut"},7.6);
      tl.fromTo("#sp-row",{opacity:0,scale:0.97},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},8.2);
      tl.fromTo("#sp-amount",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},9.4);
      tl.to(["#sp-row","#sp-amount"],{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},10.8);
      // "To add one, you open a small form" — pull back, ring Add expense, then hand off.
      tl.to("#scr-list",{transform:"${zList}",duration:0.9,ease:"sine.inOut"},10.9);
      tl.fromTo("#sp-add",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},11.3);
      tl.to("#sp-add",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},12.6);
      // crossfade to the Add-expense dialog.
      tl.fromTo("#dlg-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},12.8);
      tl.to("#list-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},13.3);
      tl.set("#scr-dlg",{transformOrigin:"0 0",transform:"${zDlg}"},0);
      tl.to("#scr-dlg",{transform:"${zDlgB}",duration:8.0,ease:"sine.inOut"},13.0);
      // "Amount, date, a quick description" — ring each field in turn.
      tl.fromTo("#sp-fa",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.6)"},15.4);
      tl.to("#sp-fa",{opacity:0,duration:0.35,ease:"power2.in",overwrite:"auto"},16.3);
      tl.fromTo("#sp-fd",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.6)"},16.4);
      tl.to("#sp-fd",{opacity:0,duration:0.35,ease:"power2.in",overwrite:"auto"},17.1);
      tl.fromTo("#sp-fde",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.45,ease:"back.out(1.6)"},17.1);
      tl.to("#sp-fde",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},19.6);
      // "The cost joins the list, and Remaining to Spend drops" — crossfade back to ledger.
      tl.fromTo("#back-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},21.8);
      tl.to("#dlg-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},22.3);
      tl.set("#scr-back",{transformOrigin:"0 0",transform:"${zBack}"},0);
      tl.to("#scr-back",{transform:"${zBackB}",duration:(D+1.0)-21.8,ease:"sine.inOut"},21.8);
      tl.fromTo("#sp-back",{opacity:0,scale:0.97},{opacity:1,scale:1,duration:0.6,ease:"power2.out"},23.0);
      tl.to("#sp-back",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},D-0.8);`;
    return { kicker: KICKER, body, timeline };
  },

  // 05 — know your pace (demo). Screen 02: spotlight the "Burn rate: $X/mo" line on the
  // Overview, then crossfade to screen 05 (Spend-Down) — ring the Burn Rate card, then
  // pan down to the By Month breakdown (the drift toward the close date). (31.4s)
  "05": () => {
    const rBurn = { nx: 425, ny: 944, nw: 230, nh: 32 }; // "Burn rate: $9,829.45/mo" line on Overview
    const cBurnRate = { nx: 1417, ny: 350, nw: 322, nh: 128 }; // Spend-Down Burn Rate card
    const sMonth = { nx: 404, ny: 880, nw: 1336, nh: 196 }; // By Month breakdown
    // Screen 02 establishing frame on the bottom of the Grant details form (burn rate).
    const zOv = zoomTo({ nx: 404, ny: 855, nw: 760, nh: 200, z: 2.0 });
    const zOvB = zoomTo({ nx: 404, ny: 860, nw: 760, nh: 200, z: 2.06 });
    // Spend-Down cards band.
    const zCards = zoomTo({ nx: 404, ny: 338, nw: 1336, nh: 150, z: 1.3 });
    const zBurn = zoomTo({ ...cBurnRate, z: 2.1 });
    // By Month band.
    const zMonth = zoomTo({ nx: 404, ny: 870, nw: 1336, nh: 210, z: 1.4 });
    const zMonthB = zoomTo({ nx: 404, ny: 875, nw: 1336, nh: 210, z: 1.43 });
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "ov-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/02-grant-overview-burnrate.png`,
            id: "scr-ov",
            route: "app.grantpipe.com/grants/title-iii-c",
            zoom: zOv,
            inner: spot({ id: "sp-burn", ...rBurn }),
            alt: "Grant overview: the burn rate line",
          }),
        })}
        ${frameSlot({
          id: "sd-wrap",
          children: screenFrame({
            src: `${SCREENS}/05-spend-down.png`,
            id: "scr-sd",
            route: "app.grantpipe.com/grants/title-iii-c",
            zoom: zCards,
            inner: `${spot({ id: "sp-rate", ...cBurnRate })}${spot({ id: "sp-month", ...sMonth })}`,
            alt: "Spend-Down: Burn Rate card and the By Month breakdown",
          }),
        })}
      </div>
      ${caption({ idx: 5, chip: "Know your pace", num: "05", line: "Burn rate shows the drift early — while you can still steer." })}`;
    const timeline = `
      // ov-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      // Cues: "The grant shows your burn rate" ~3.95, hold through "how much you spend
      // each month" ~6.0; "At this rate, will you land near zero by the close date?"
      // ~11.9; "The Spend-Down view lays it out" ~19.9. Spend-Down is plan-gated.
      ${capIn}
      tl.set("#scr-ov",{transformOrigin:"0 0",transform:"${zOv}"},0);
      tl.to("#scr-ov",{transform:"${zOvB}",duration:10.0,ease:"sine.inOut"},0.3);
      tl.fromTo("#sp-burn",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.5)"},3.95);
      tl.to("#sp-burn",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},10.8);
      // "At this rate, will you land near zero..." — crossfade to the Spend-Down view.
      tl.fromTo("#sd-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},11.4);
      tl.to("#ov-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},11.9);
      tl.set("#scr-sd",{transformOrigin:"0 0",transform:"${zCards}"},0);
      // ring the Burn Rate card, then pan down to By Month as the projection is described.
      tl.to("#scr-sd",{transform:"${zBurn}",duration:1.0,ease:"sine.inOut"},11.6);
      tl.fromTo("#sp-rate",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},12.0);
      tl.to("#sp-rate",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},14.8);
      tl.to("#scr-sd",{transform:"${zMonth}",duration:1.4,ease:"sine.inOut"},14.8);
      tl.fromTo("#sp-month",{opacity:0,scale:0.97},{opacity:1,scale:1,duration:0.6,ease:"power2.out"},16.0);
      // gentle zoom-in breath on the By Month view through the closing hold (anti-freeze).
      tl.to("#scr-sd",{transform:"${zMonthB}",duration:(D-0.8-19.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},19.0);
      tl.to("#sp-month",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},D-0.8);`;
    return { kicker: KICKER, body, timeline };
  },

  // 06 — one thing to remember (concept, final scene). Recap line + three chips, then
  // the GrantPipe wordmark and a soft lead-magnet chip. Final fade allowed here only.
  // (47.04s)
  "06": () => {
    const chip = (id, text) => `
      <div id="${id}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-left:5px solid var(--emerald);border-radius:14px;box-shadow:var(--shadow);padding:18px 28px;font-family:'Plex';font-weight:600;font-size:30px;color:var(--ink)">${text}</div>`;
    const body = `
      ${conceptStage(`
        <div id="end" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:34px;z-index:5;width:1500px">
          <div id="end-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:64px;line-height:1.12;letter-spacing:-1px;color:var(--ink);text-align:center;max-width:1300px">One number you can trust: what's left.</div>
          <div style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center">
            ${chip("ch-1", "Tie every cost to its grant")}
            ${chip("ch-2", "Keep the list")}
            ${chip("ch-3", "Watch your pace")}
          </div>
          <div id="end-mag" style="opacity:0;display:flex;flex-direction:column;align-items:center;gap:18px;margin-top:14px">
            <div id="end-mark" role="img" aria-label="GrantPipe" style="width:84px;height:84px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat"></div>
            <div style="background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:18px;box-shadow:var(--shadow);padding:24px 38px;text-align:center;max-width:980px">
              <div style="font-family:'Mono';font-weight:500;font-size:19px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)">Free template</div>
              <div style="font-family:'Sora';font-weight:600;font-size:36px;margin-top:10px;color:var(--ink)">Grant Spending Spreadsheet</div>
              <div style="font-family:'Plex';font-weight:500;font-size:26px;margin-top:8px;color:var(--muted)">It sets up the columns for you. We'll send it to your inbox.</div>
            </div>
          </div>
        </div>
      `)}
      ${caption({ idx: 6, chip: "One thing to remember", num: "06", line: "Track the one number that matters: what's left on this grant." })}`;
    const timeline = `
      // Cues: "comes down to one number you can trust / what's left on this grant"
      // ~2.84-7.44; recap chips on "Tie every cost to its grant, keep the list, and
      // watch your pace" ~9.9-14.6; lead magnet on "We made a free spreadsheet" ~35.7;
      // final fade at the close.
      tl.fromTo("#end",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},0.3);
      tl.fromTo("#end-head",{opacity:0,y:26},{opacity:1,y:0,duration:0.9,ease:"power3.out"},2.84);
      tl.fromTo("#ch-1",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},9.9);
      tl.fromTo("#ch-2",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},12.0);
      tl.fromTo("#ch-3",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},14.6);
      ${capIn}
      // lead-magnet card revealed as it's named (~35.7s).
      tl.fromTo("#end-mag",{opacity:0,y:24},{opacity:1,y:0,duration:0.9,ease:"power3.out"},35.7);
      // very slow drift on the whole group so the long closing holds aren't motionless.
      tl.fromTo("#end",{transformOrigin:"50% 50%",scale:1},{scale:1.03,duration:(D-1.1)-4.0,ease:"sine.inOut"},4.0);
      // final gentle fade-out (final scene only).
      tl.to(["#end","#cap","#chrome-wordmark","#chrome-kicker","#chrome-progress"],{opacity:0,duration:0.9,ease:"power2.in"},D-1.0);`;
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
