// Generates compositions/chapter-XX.html for P3 "How to Track Restricted Funds
// Correctly" (concept-then-demo), timed to the recorded audio durations.
//
// Concept half (chapters 00-02) and the outro (06) are hand-built warm-paper art
// (the restriction = a promise; the two net-asset buckets; the beginning/additions/
// releases/ending running balance strip; the recap card + lead-magnet chip).
//
// Demo half (chapters 03-05) composites the REAL captured GrantPipe screenshots
// (assets/screens/*.png, captured from the running app via capture-p3.mjs) inside
// fixed browser-chrome frames with Ken-Burns + word-synced spotlights. Mirrors the
// P2 build (screenFrame + zoomTo + spot + frameSlot + caption + crossfades).
//
// Real-product integrity: scene 04 frames screen 05 on the three summary cards and,
// separately (via crossfade, never a pan across it), on Source Allocations + the
// Expense Ledger. It deliberately SKIPS the middle edit form, whose Type select shows
// a stale "Unrestricted" (a known $fundId.tsx bug being fixed in its own task) while
// the correct header badge says "Temporarily Restricted". We never frame that field.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doc, screenFrame, progress, zoomTo, FRAME_W, FRAME_TOP, FRAME_LEFT, IMG_K } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

const SCREENS = "../assets/screens";
const KICKER = "Restricted Funds";

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
// A centered concept stage; children are absolutely/flex placed by each scene.
function conceptStage(children) {
  return `<div class="stage" style="gap:0">${children}</div>`;
}

// ---- Scene builders. Each returns {kicker, body, timeline}. DUR replaced per chapter. ----
const scenes = {
  // 00 — hook (concept). "A restriction is a promise." The promise line, then the
  // question a normal report can't answer, then a soft builder note.
  "00": () => {
    const body = `
      ${conceptStage(`
        <div id="hook" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:38px;z-index:4;width:1500px">
          <div id="hk-tag" style="opacity:0;font-family:'Mono';font-weight:500;font-size:22px;letter-spacing:4px;text-transform:uppercase;color:var(--ochre)">Tracking restricted funds</div>
          <div id="hk-promise" style="opacity:0;font-family:'Plex';font-weight:500;font-size:50px;line-height:1.25;color:var(--muted);text-align:center;max-width:1320px">&ldquo;This money is only for the after-school program.&rdquo;</div>
          <div id="hk-q" style="opacity:0;font-family:'Sora';font-weight:700;font-size:74px;line-height:1.15;letter-spacing:-1px;color:var(--emerald);text-align:center;max-width:1380px">How much is left, and can you prove it?</div>
        </div>
      `)}
      ${caption({ idx: 0, chip: "A promise, not just a payment", num: "P3", line: "A restriction means the money is tied to one purpose. Can you prove where it went?" })}`;
    const timeline = `
      tl.fromTo("#hook",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},0.3);
      tl.fromTo("#hk-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.5);
      tl.fromTo("#hk-promise",{opacity:0,y:24},{opacity:1,y:0,duration:0.9,ease:"power3.out"},1.2);
      // the question lands when it's actually asked (~12.5s: "how much of that money is
      // left, and can you prove where the rest went?").
      tl.fromTo("#hk-q",{opacity:0,y:30,scale:0.97},{opacity:1,y:0,scale:1,duration:1.0,ease:"power3.out"},12.5);
      ${capIn}
      // gentle continuous swell so the card breathes through its long hold (anti-freeze).
      tl.fromTo("#hook",{scale:1},{scale:1.035,duration:(D-1.0),yoyo:true,repeat:1,ease:"sine.inOut"},2.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 01 — what restricted means (concept). Two buckets: without donor restrictions
  // (free, emerald) and with donor restrictions (promised, ochre). Old 3-group rule
  // struck through underneath.
  "01": () => {
    const bucket = (id, accent, kicker, label, sub) => `
      <div id="${id}" style="opacity:0;width:560px;background:var(--white);border:1px solid var(--line);border-top:6px solid ${accent};border-radius:20px;box-shadow:var(--shadow);padding:40px 44px;display:flex;flex-direction:column;gap:14px">
        <div style="font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:${accent}">${kicker}</div>
        <div style="font-family:'Sora';font-weight:700;font-size:46px;letter-spacing:-0.5px;color:var(--ink);line-height:1.1">${label}</div>
        <div style="font-family:'Plex';font-weight:500;font-size:30px;color:var(--muted)">${sub}</div>
      </div>`;
    const body = `
      ${conceptStage(`
        <div style="position:absolute;display:flex;flex-direction:column;align-items:center;gap:40px;z-index:4;width:1500px">
          <div id="bk-rule" style="opacity:0;font-family:'Sora';font-weight:700;font-size:48px;line-height:1.18;letter-spacing:-0.5px;color:var(--ink);text-align:center;max-width:1280px">Only the funder who set the limit can lift it.</div>
          <div style="display:flex;gap:48px;align-items:stretch">
            ${bucket("bk-promised", "var(--ochre)", "With donor restrictions", "Promised money", "Tied to a purpose or a time")}
            ${bucket("bk-free", "var(--emerald)", "Without donor restrictions", "Free money", "Use it where it's needed")}
          </div>
          <div id="bk-old" style="opacity:0;font-family:'Plex';font-weight:500;font-size:28px;color:var(--muted);text-decoration:line-through;text-decoration-color:var(--red)">Old rule: three groups. Out of date.</div>
        </div>
      `)}
      ${caption({ idx: 1, chip: "What “restricted” really means", num: "01", line: "Two groups today: money with donor restrictions, and money without." })}`;
    const timeline = `
      // Cues synced to chapter-01: rule headline carries the open ("only they can lift
      // that limit" ~9.3); two groups enter on "sort money into two groups / with donor
      // restrictions, and without" ~12.0-17.6; struck line on "three groups, out of date" ~21.
      tl.fromTo("#bk-rule",{opacity:0,y:22},{opacity:1,y:0,duration:0.9,ease:"power3.out"},0.6);
      tl.fromTo("#bk-promised",{opacity:0,x:-40,y:10},{opacity:1,x:0,y:0,duration:0.8,ease:"power3.out"},12.3);
      tl.fromTo("#bk-free",{opacity:0,x:40,y:10},{opacity:1,x:0,y:0,duration:0.8,ease:"back.out(1.3)"},15.7);
      tl.fromTo("#bk-old",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power2.out"},21.5);
      ${capIn}
      // slow breath on the rule headline through the long open (anti-freeze, 0.6-12.3).
      tl.fromTo("#bk-rule",{scale:1},{scale:1.03,duration:6.0,yoyo:true,repeat:1,ease:"sine.inOut"},1.6);
      // alternating breath on the two buckets once both are up (covers 16-38 holds).
      tl.fromTo("#bk-promised",{scale:1},{scale:1.025,duration:(D-17.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},17.0);
      tl.fromTo("#bk-free",{scale:1},{scale:1.025,duration:(D-17.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},17.0+(D-17.0)/4);`;
    return { kicker: KICKER, body, timeline };
  },

  // 02 — what tracking it takes (concept). The running-balance strip builds left to
  // right: Beginning -> + Additions -> - Releases -> Ending. A class report sits beside
  // it with a red "shows activity, not the balance" tag.
  "02": () => {
    const step = (id, label, val, accent) => `
      <div id="${id}" style="opacity:0;min-width:240px;background:var(--white);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:24px 28px;text-align:center">
        <div style="font-family:'Mono';font-weight:500;font-size:18px;letter-spacing:2px;text-transform:uppercase;color:${accent}">${label}</div>
        <div style="font-family:'Sora';font-weight:700;font-size:40px;letter-spacing:-0.5px;color:var(--ink);margin-top:8px">${val}</div>
      </div>`;
    const op = (id, ch) => `<div id="${id}" style="opacity:0;font-family:'Sora';font-weight:700;font-size:52px;color:var(--muted)">${ch}</div>`;
    const body = `
      ${conceptStage(`
        <div style="position:absolute;display:flex;flex-direction:column;align-items:center;gap:54px;z-index:4">
          <div id="strip" style="display:flex;align-items:center;gap:22px">
            ${step("st-beg", "Beginning", "Award", "var(--muted)")}
            ${op("op-add", "+")}
            ${step("st-add", "Additions", "New gifts", "var(--emerald)")}
            ${op("op-rel", "−")}
            ${step("st-rel", "Releases", "As you spend", "var(--ochre)")}
            ${op("op-eq", "=")}
            ${step("st-end", "Ending", "Defensible", "var(--emerald)")}
          </div>
          <div id="cl-report" style="opacity:0;display:flex;align-items:center;gap:20px;background:var(--red-50);border:1px solid var(--red);border-radius:14px;padding:18px 26px">
            <div style="font-family:'Plex';font-weight:600;font-size:30px;color:var(--ink)">One checking account + a class memo</div>
            <div style="font-family:'Mono';font-weight:500;font-size:19px;letter-spacing:1px;text-transform:uppercase;color:var(--red);background:var(--white);border:1px solid var(--red);border-radius:999px;padding:6px 16px">Shows activity, not the balance</div>
          </div>
        </div>
      `)}
      ${caption({ idx: 2, chip: "What tracking it takes", num: "02", line: "A running balance per award: beginning, additions, releases, ending." })}`;
    const timeline = `
      // build the strip on cue, synced to chapter-02: "running balance for each award"
      // ~3.2 (Beginning), "you add anything new" ~9.5, "you subtract what you spend"
      // ~12.0, "you end with a number you can defend" ~21.0, "one big checking account
      // and a memo" ~23.9.
      tl.fromTo("#st-beg",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power3.out"},3.2);
      tl.fromTo("#op-add",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.35,ease:"back.out(2)"},9.4);
      tl.fromTo("#st-add",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power3.out"},9.7);
      tl.fromTo("#op-rel",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.35,ease:"back.out(2)"},11.9);
      tl.fromTo("#st-rel",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power3.out"},12.2);
      tl.fromTo("#op-eq",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.35,ease:"back.out(2)"},20.9);
      tl.fromTo("#st-end",{opacity:0,y:22,scale:0.95},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.4)"},21.2);
      ${capIn}
      // the failure mode card slides in for "one big checking account and a memo".
      tl.fromTo("#cl-report",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},23.9);
      // continuous slow breath on the whole strip so the long inter-reveal gaps never freeze.
      tl.fromTo("#strip",{scale:1},{scale:1.03,duration:(D-4.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},4.0);`;
    return { kicker: KICKER, body, timeline };
  },

  // 03 — set up the fund (demo). Funds list (cards) -> Add fund button -> Create fund
  // dialog (name + the three real types) -> filter the list by type (ledger filtered).
  "03": () => {
    // screen 01 regions (native px).
    const rAdd = { nx: 1638, ny: 137, nw: 104, nh: 40 };
    // screen 02 dialog regions.
    const fName = { nx: 731, ny: 455, nw: 458, nh: 34 };
    const fTypes = { nx: 731, ny: 524, nw: 200, nh: 96 }; // the three open options
    // screen 04 filtered-ledger regions.
    const fFilter = { nx: 404, ny: 250, nw: 202, nh: 36 };
    const fRows = { nx: 404, ny: 418, nw: 1336, nh: 138 };
    // Establishing frame on the funds list: heading + the card grid.
    const zList = zoomTo({ nx: 404, ny: 118, nw: 1380, nh: 380, z: 1.3 });
    const zListb = zoomTo({ nx: 404, ny: 230, nw: 1380, nh: 380, z: 1.32 });
    // Create-fund dialog (centered ~960,540; ~512x380). z=1.85 fits it with margin.
    const zDlg = zoomTo({ nx: 700, ny: 350, nw: 520, nh: 400, z: 1.85 });
    const zDlg2 = zoomTo({ nx: 704, ny: 354, nw: 512, nh: 392, z: 1.9 });
    // Filtered ledger: filter chip + the three rows.
    const zFilt = zoomTo({ nx: 404, ny: 230, nw: 1380, nh: 340, z: 1.3 });
    const zFilt2 = zoomTo({ nx: 404, ny: 250, nw: 1380, nh: 340, z: 1.32 });
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "list-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/01-funds-list-cards.png`,
            id: "scr-list",
            route: "app.grantpipe.com/funds",
            zoom: zList,
            inner: spot({ id: "sp-add", ...rAdd }),
            alt: "Funds list, card view, with Add fund button",
          }),
        })}
        ${frameSlot({
          id: "dlg-wrap",
          children: screenFrame({
            src: `${SCREENS}/02-add-fund-dialog.png`,
            id: "scr-dlg",
            route: "app.grantpipe.com/funds",
            zoom: zDlg,
            inner: `${spot({ id: "sp-name", ...fName })}${spot({ id: "sp-types", ...fTypes })}`,
            alt: "Create fund dialog: name and the three fund types",
          }),
        })}
        ${frameSlot({
          id: "filt-wrap",
          children: screenFrame({
            src: `${SCREENS}/04-funds-list-filtered.png`,
            id: "scr-filt",
            route: "app.grantpipe.com/funds",
            zoom: zFilt,
            inner: `${spot({ id: "sp-filter", ...fFilter })}${spot({ id: "sp-rows", ...fRows })}`,
            alt: "Funds list filtered to Temporarily Restricted",
          }),
        })}
      </div>
      ${caption({ idx: 3, chip: "Set up the fund", num: "03", line: "Each fund is one promise. Name it, pick its type, filter to find it." })}`;
    const timeline = `
      // list-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      // Cues synced to the (re-recorded) chapter-03 silence map: "you add a fund" ~10.1,
      // "give it a name" ~12.2, type options ~14.9-19.1, conceptual tail "Both restricted
      // types... free money" ~20.0-25.3, "You can filter the list by type" begins ~26.2.
      ${capIn}
      tl.set("#scr-list",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-list",{transform:"${zList}"},{transform:"${zListb}",duration:11.7,ease:"sine.inOut"},0);
      // ring the Add fund button as "you add a fund" is spoken, then hand off to the dialog.
      tl.fromTo("#sp-add",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},10.3);
      tl.to("#sp-add",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},11.5);
      // "give it a name" — crossfade to the Create fund dialog.
      tl.fromTo("#dlg-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},11.7);
      tl.to("#list-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},12.2);
      tl.set("#scr-dlg",{transformOrigin:"0 0"},0);
      // dialog holds from ~11.7 to the filter crossfade (~25.5); slow drift over the whole
      // hold prevents a static-hold defect while the type concept is explained in voiceover.
      tl.fromTo("#scr-dlg",{transform:"${zDlg}"},{transform:"${zDlg2}",duration:13.8,ease:"sine.inOut"},11.7);
      tl.fromTo("#sp-name",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},12.4);
      tl.to("#sp-name",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},13.6);
      // "unrestricted, temporarily restricted, or permanently restricted" — ring the options.
      // After they're named the ring releases; the dialog keeps drifting through the
      // "Both restricted types / Unrestricted is the free money" concept beat (no freeze).
      tl.fromTo("#sp-types",{opacity:0,scale:0.94},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.5)"},14.9);
      tl.to("#sp-types",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},19.3);
      // "You can filter the list by type" — crossfade to the filtered ledger.
      tl.fromTo("#filt-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},25.5);
      tl.to("#dlg-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},26.0);
      tl.set("#scr-filt",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-filt",{transform:"${zFilt}"},{transform:"${zFilt2}",duration:(D+1.0)-25.5,ease:"sine.inOut"},25.5);
      tl.fromTo("#sp-filter",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},26.4);
      tl.fromTo("#sp-rows",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},28.0);
      tl.to(["#sp-filter","#sp-rows"],{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},D-0.5);`;
    return { kicker: KICKER, body, timeline };
  },

  // 04 — see the balance per award (demo). Screen 05: the three summary cards
  // (Allocated / Spent / Balance), then a CROSSFADE (not a pan — deliberately skips the
  // edit form whose Type select shows a stale value) to Source Allocations + Expense
  // Ledger at the bottom of the same screen.
  "04": () => {
    const cAlloc = { nx: 404, ny: 205, nw: 432, nh: 132 };
    const cSpent = { nx: 852, ny: 205, nw: 438, nh: 132 };
    const cBal = { nx: 1306, ny: 205, nw: 434, nh: 132 };
    const rSrc = { nx: 404, ny: 850, nw: 640, nh: 210 };
    const rLedger = { nx: 1078, ny: 850, nw: 662, nh: 210 };
    // The fund-detail page stacks vertically: the three summary cards (top, y205-337), an
    // edit form whose Type select shows a stale "Unrestricted" (a known $fundId.tsx bug,
    // fixed in its own task; the header badge correctly reads "Temporarily Restricted"),
    // then Source Allocations + Expense Ledger (bottom, y845+). We NEVER frame that form.
    // The card row is too wide to fit at a zoom tall enough to crop the form, so instead of
    // one wide shot we PAN horizontally at a tight zoom whose visible band sits entirely
    // above the form (cards phase) or entirely below it (rows phase).
    // Cards phase: z=2.5 -> visible native band ~y70-470 (form heading ~480 is out of
    // frame); pan left to right Allocated -> Spent -> Balance.
    const zAlloc = zoomTo({ ...cAlloc, z: 2.5 });
    const zSpent = zoomTo({ ...cSpent, z: 2.5 });
    const zBal = zoomTo({ ...cBal, z: 2.5 });
    const zBalB = zoomTo({ ...cBal, z: 2.55 }); // pure zoom-in breath (stays above form)
    // Rows phase: z=2.8 clamps to the page bottom -> visible native band ~y725-1080, so the
    // form (y~480-670) is above the frame; pan Source Allocations -> Expense Ledger.
    const zSrc = zoomTo({ ...rSrc, z: 2.8 });
    const zLedger = zoomTo({ ...rLedger, z: 2.8 });
    const zLedgerB = zoomTo({ ...rLedger, z: 2.86 }); // pure zoom-in breath (stays below form)
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "cards-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/05-fund-detail-overview.png`,
            id: "scr-cards",
            route: "app.grantpipe.com/funds",
            zoom: zAlloc,
            inner: `${spot({ id: "sp-alloc", ...cAlloc })}${spot({ id: "sp-spent", ...cSpent })}${spot({ id: "sp-bal", ...cBal })}`,
            alt: "Fund detail: Allocated, Spent, Balance summary cards",
          }),
        })}
        ${frameSlot({
          id: "rows-wrap",
          children: screenFrame({
            src: `${SCREENS}/05b-fund-detail-rows.png`,
            id: "scr-rows",
            route: "app.grantpipe.com/funds",
            zoom: zSrc,
            inner: `${spot({ id: "sp-src", ...rSrc })}${spot({ id: "sp-ledger", ...rLedger })}`,
            alt: "Fund detail: Source Allocations and Expense Ledger",
          }),
        })}
      </div>
      ${caption({ idx: 4, chip: "See the balance per award", num: "04", line: "Allocated, spent, and what's left — computed from grants and expenses." })}`;
    const timeline = `
      // cards-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      // Cues synced to the chapter-04 silence map: "Allocated..." ~4.9, "Spent..." ~8.0,
      // "Balance, what's left" ~9.0, "Underneath, which grants... every expense" ~15.7-20.5.
      // The cards phase pans across the three cards; the edit form below them is cropped out.
      ${capIn}
      // IMPORTANT: scr-cards and scr-rows each take MULTIPLE sequential transform tweens.
      // gsap.fromTo defaults to immediateRender:true, so chaining fromTo on one element
      // makes the last-built fromTo apply its "from" at t=0 — which would pin the cards to
      // Balance and the rows to the Ledger from the first frame. Use tl.set for the base
      // transform once, then tl.to() for every pan/breath (to animates from the live value).
      tl.set("#scr-cards",{transformOrigin:"0 0",transform:"${zAlloc}"},0);
      // hold on Allocated, ring it as it's named.
      tl.fromTo("#sp-alloc",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},4.9);
      tl.to("#sp-alloc",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},7.0);
      // pan to Spent.
      tl.to("#scr-cards",{transform:"${zSpent}",duration:1.2,ease:"sine.inOut"},6.9);
      tl.fromTo("#sp-spent",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},8.0);
      tl.to("#sp-spent",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},8.9);
      // pan to Balance.
      tl.to("#scr-cards",{transform:"${zBal}",duration:1.1,ease:"sine.inOut"},8.7);
      tl.fromTo("#sp-bal",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},9.1);
      tl.to("#sp-bal",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},10.5);
      // slow zoom-in breath on the held Balance view so the 10.0-15.0 stretch never freezes.
      tl.to("#scr-cards",{transform:"${zBalB}",duration:2.4,yoyo:true,repeat:1,ease:"sine.inOut"},10.0);
      // "Underneath, which grants fund this, and every expense" — crossfade to the bottom
      // band (Source Allocations + Expense Ledger), skipping the edit form entirely.
      tl.fromTo("#rows-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power3.out"},15.0);
      tl.to("#cards-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},15.5);
      tl.set("#scr-rows",{transformOrigin:"0 0",transform:"${zSrc}"},0);
      // ring Source Allocations, then pan right to the Expense Ledger.
      tl.fromTo("#sp-src",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},16.2);
      tl.to("#sp-src",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},18.3);
      tl.to("#scr-rows",{transform:"${zLedger}",duration:1.3,ease:"sine.inOut"},18.0);
      tl.fromTo("#sp-ledger",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},19.6);
      // gentle zoom-in breath on the Ledger view through the closing hold (anti-freeze).
      tl.to("#scr-rows",{transform:"${zLedgerB}",duration:(D-0.8-21.0)/2,yoyo:true,repeat:1,ease:"sine.inOut"},21.0);
      tl.to("#sp-ledger",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},D-0.8);`;
    return { kicker: KICKER, body, timeline };
  },

  // 05 — prove the restriction (demo). Screen 07: the Restricted balance card
  // (Beginning/Additions/Releases/Ending = the running balance from the concept half),
  // the Restriction alerts card (flags a release with no support), and the per-term
  // card naming the restriction and its purpose. One image, panned between the three
  // regions with sequential spotlights.
  "05": () => {
    const cBalance = { nx: 404, ny: 518, nw: 1336, nh: 108 };
    const cAlert = { nx: 404, ny: 645, nw: 1336, nh: 100 };
    const cTerm = { nx: 404, ny: 738, nw: 668, nh: 200 };
    // Restricted balance card band (y518-626).
    const zBal = zoomTo({ nx: 404, ny: 455, nw: 1336, nh: 230, z: 1.35 });
    const zBalB = zoomTo({ nx: 404, ny: 460, nw: 1336, nh: 230, z: 1.37 });
    // Alerts card band (y645-745).
    const zAlert = zoomTo({ nx: 404, ny: 632, nw: 1336, nh: 130, z: 1.45 });
    const zAlertB = zoomTo({ nx: 404, ny: 636, nw: 1336, nh: 128, z: 1.47 });
    // Per-term card band (y738-940), left half.
    const zTerm = zoomTo({ nx: 404, ny: 730, nw: 720, nh: 220, z: 1.5 });
    const zTermB = zoomTo({ nx: 404, ny: 734, nw: 720, nh: 216, z: 1.52 });
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "bal-wrap",
          open: true,
          children: screenFrame({
            src: `${SCREENS}/07-restrictions-tab.png`,
            id: "scr-bal",
            route: "app.grantpipe.com/funds",
            zoom: zBal,
            inner: spot({ id: "sp-balance", ...cBalance }),
            alt: "Restrictions tab: Restricted balance (Beginning, Additions, Releases, Ending)",
          }),
        })}
        ${frameSlot({
          id: "alert-wrap",
          children: screenFrame({
            src: `${SCREENS}/07c-restrictions-alert.png`,
            id: "scr-alert",
            route: "app.grantpipe.com/funds",
            zoom: zAlert,
            inner: spot({ id: "sp-alert", ...cAlert }),
            alt: "Restrictions tab: Restriction alerts — release is missing evidence",
          }),
        })}
        ${frameSlot({
          id: "term-wrap",
          children: screenFrame({
            src: `${SCREENS}/07b-restrictions-term.png`,
            id: "scr-term",
            route: "app.grantpipe.com/funds",
            zoom: zTerm,
            inner: spot({ id: "sp-term", ...cTerm }),
            alt: "Restrictions tab: the restriction term and its purpose",
          }),
        })}
      </div>
      ${caption({ idx: 5, chip: "Prove the restriction", num: "05", line: "The same running balance, plus an alert when a release has no support." })}`;
    const timeline = `
      // bal-wrap is the chapter opener (visible at t=0; no entrance — see frameSlot open).
      // Cues synced to the chapter-05 silence map: "beginning, additions, releases,
      // ending" ~8.3-12.9; "below it... each restriction and what it's for" ~13.7-17.6;
      // "if you release money... the panel flags it right there" ~20.8-25.2.
      ${capIn}
      tl.set("#scr-bal",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-bal",{transform:"${zBal}"},{transform:"${zBalB}",duration:13.0,ease:"sine.inOut"},0.3);
      // "the same running balance... beginning, additions, releases, ending."
      tl.fromTo("#sp-balance",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.6,ease:"power2.out"},8.3);
      tl.to("#sp-balance",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},12.7);
      // "below it, the app lists each restriction and what it's for" — pan to the term card.
      tl.fromTo("#term-wrap",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"power3.out"},13.0);
      tl.to("#bal-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},13.5);
      tl.set("#scr-term",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-term",{transform:"${zTerm}"},{transform:"${zTermB}",duration:7.1,ease:"sine.inOut"},13.0);
      tl.fromTo("#sp-term",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.6,ease:"power2.out"},14.0);
      tl.to("#sp-term",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},17.4);
      // "if you release money and nothing backs it up, the panel flags it right there."
      tl.fromTo("#alert-wrap",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"power3.out"},20.1);
      tl.to("#term-wrap",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},20.6);
      tl.set("#scr-alert",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-alert",{transform:"${zAlert}"},{transform:"${zAlertB}",duration:(D+1.0)-20.1,ease:"sine.inOut"},20.1);
      tl.fromTo("#sp-alert",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.4)"},21.5);
      tl.to("#sp-alert",{opacity:0,duration:0.5,ease:"power2.in",overwrite:"auto"},D-0.8);`;
    return { kicker: KICKER, body, timeline };
  },

  // 06 — one thing to remember (concept, final scene). Recap line + three chips, then
  // the GrantPipe wordmark and a soft lead-magnet chip. Final fade allowed here only.
  "06": () => {
    const chip = (id, text) => `
      <div id="${id}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-left:5px solid var(--emerald);border-radius:14px;box-shadow:var(--shadow);padding:18px 28px;font-family:'Plex';font-weight:600;font-size:30px;color:var(--ink)">${text}</div>`;
    const body = `
      ${conceptStage(`
        <div id="end" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:34px;z-index:5;width:1500px">
          <div id="end-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:64px;line-height:1.12;letter-spacing:-1px;color:var(--ink);text-align:center;max-width:1300px">A balance you can defend, for every promise.</div>
          <div style="display:flex;gap:22px;flex-wrap:wrap;justify-content:center">
            ${chip("ch-1", "Start, add, release, end")}
            ${chip("ch-2", "The app does the math")}
            ${chip("ch-3", "Evidence next to the number")}
          </div>
          <div id="end-mag" style="opacity:0;display:flex;flex-direction:column;align-items:center;gap:18px;margin-top:14px">
            <div id="end-mark" role="img" aria-label="GrantPipe" style="width:84px;height:84px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat"></div>
            <div style="background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:18px;box-shadow:var(--shadow);padding:24px 38px;text-align:center;max-width:980px">
              <div style="font-family:'Mono';font-weight:500;font-size:19px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)">Free template</div>
              <div style="font-family:'Sora';font-weight:600;font-size:36px;margin-top:10px;color:var(--ink)">Restricted Fund Tracking Spreadsheet</div>
              <div style="font-family:'Plex';font-weight:500;font-size:26px;margin-top:8px;color:var(--muted)">It sets up the columns for you. We'll send it to your inbox.</div>
            </div>
          </div>
        </div>
      `)}
      ${caption({ idx: 6, chip: "One thing to remember", num: "06", line: "Track each promise with a balance you can defend." })}`;
    const timeline = `
      // Cues synced to chapter-06: "comes down to one thing / a balance you can defend"
      // ~3.5; recap chips on "start it, add to it, release as you spend, end on a number
      // with the evidence attached" ~8-15; lead magnet on "we made a free... spreadsheet"
      // ~27.5; final fade at the close.
      tl.fromTo("#end",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},0.3);
      tl.fromTo("#end-head",{opacity:0,y:26},{opacity:1,y:0,duration:0.9,ease:"power3.out"},3.5);
      tl.fromTo("#ch-1",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},8.5);
      tl.fromTo("#ch-2",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},11.0);
      tl.fromTo("#ch-3",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)"},13.5);
      ${capIn}
      // lead-magnet card revealed as it's named (~27.5s).
      tl.fromTo("#end-mag",{opacity:0,y:24},{opacity:1,y:0,duration:0.9,ease:"power3.out"},27.5);
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
