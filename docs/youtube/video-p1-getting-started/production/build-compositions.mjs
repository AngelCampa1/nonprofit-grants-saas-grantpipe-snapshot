// Generates compositions/chapter-XX.html for P1 "Getting Started", timed to audio durations.
// Composites the REAL captured app screenshots in browser-chrome frames with motion.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  doc,
  screenFrame,
  progress,
  zoomTo,
  FRAME_W,
  FRAME_TOP,
  FRAME_LEFT,
  IMG_K,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

const SCREENS = "../assets/screens";

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
function spot({ id, nx, ny, nw, nh }) {
  const left = Math.round(nx * IMG_K);
  const top = Math.round(ny * IMG_K);
  const w = Math.round(nw * IMG_K);
  const h = Math.round(nh * IMG_K);
  return `<div id="${id}" class="spot" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px;opacity:0"></div>`;
}

// A fixed-position holder for one screen frame inside the constant box. Multiple of
// these stack at the same coordinates so chapters can cross-fade between screens
// without the card moving. `id` is the wrapper that gets faded/scaled as a unit.
function frameSlot({ id, extraStyle = "", children }) {
  return `<div id="${id}" style="position:absolute;left:${FRAME_LEFT}px;top:${FRAME_TOP}px;width:${FRAME_W}px;opacity:0;${extraStyle}">${children}</div>`;
}

// ---- Scene builders. Each returns {kicker?, body, timeline}. DUR placeholder replaced per chapter. ----
const scenes = {
  // 00 (27.76s) — hook. Wordmark on warm paper -> real onboarding welcome screen.
  // 01-onboarding-welcome.png is a centered card on whitespace; a gentle 1.12x
  // push that drifts toward the welcome card keeps it legible inside the box.
  "00": () => {
    // Fill the frame with the actual welcome-card content (native ~760,378 ~400x340)
    // so body text clears the 20px legibility floor at 1920 and the push has presence.
    const z0 = zoomTo({ nx: 752, ny: 372, nw: 416, nh: 352, z: 1.92 });
    const z1 = zoomTo({ nx: 760, ny: 384, nw: 400, nh: 336, z: 2.08 });
    const body = `
      <div class="stage" style="gap:0">
        <div id="hero" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:24px;z-index:4">
          <div id="hero-mark" role="img" aria-label="GrantPipe" style="width:120px;height:120px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat"></div>
          <div id="hero-name" style="font-family:'Sora';font-weight:700;font-size:108px;letter-spacing:-2px;color:var(--ink)">GrantPipe</div>
          <div id="hero-sub" style="opacity:0;font-family:'Sora';font-weight:600;font-size:38px;color:var(--muted)">Getting started</div>
        </div>
        ${frameSlot({
          id: "frame-wrap",
          children: screenFrame({
            src: `${SCREENS}/01-onboarding-welcome.png`,
            id: "scr",
            route: "app.grantpipe.com/onboarding",
            zoom: z0,
            alt: "Welcome to GrantPipe onboarding",
          }),
        })}
      </div>
      ${caption({ idx: 0, chip: "Getting started", num: "P1", line: "Three fields, one file. You set up your org and bring your donors in." })}`;
    const timeline = `
      tl.fromTo("#hero",{opacity:0,y:24},{opacity:1,y:0,duration:0.9,ease:"power3.out"},0.3);
      tl.fromTo("#hero-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},1.1);
      tl.to("#hero",{opacity:0,y:-26,duration:0.7,ease:"power2.in"},6.0);
      tl.fromTo("#frame-wrap",{opacity:0,y:30},{opacity:1,y:0,duration:1.0,ease:"power3.out"},6.6);
      ${capIn}
      // gentle Ken-Burns push toward the welcome card (transform on the inner wrapper)
      tl.fromTo("#scr",{transformOrigin:"0 0",transform:"${z0}"},{transform:"${z1}",duration:D-9.0,ease:"sine.inOut"},8.5);`;
    return { kicker: "Getting Started", body, timeline };
  },

  // 01 (43.84s) — three fields. Welcome -> org setup, sequential field callouts.
  "01": () => {
    // Native field-box regions on 02-onboarding-org-setup.png (form column ~768-1152).
    const fOrg = { nx: 760, ny: 438, nw: 408, nh: 52 }; // Organization name input
    const fFy = { nx: 760, ny: 533, nw: 96, nh: 52 }; //  Fiscal year (July) dropdown
    const fTz = { nx: 760, ny: 627, nw: 192, nh: 52 }; //  Timezone dropdown
    // Welcome card fills the frame (match ch00); form fills the three-field block so
    // labels/values clear the 20px legibility floor. Field spotlights stay in view.
    const zW = zoomTo({ nx: 752, ny: 372, nw: 416, nh: 352, z: 1.92 });
    const zF = zoomTo({ nx: 752, ny: 340, nw: 420, nh: 400, z: 1.95 });
    // Continuous slow Ken-Burns drift on the form so it isn't pixel-static for ~33s.
    // Tighter/shifted target; all three field rings (org ny438/fiscal ny533/tz ny627)
    // stay in-frame. Tweens zF->zF2 across the whole form display.
    const zF2 = zoomTo({ nx: 768, ny: 376, nw: 380, nh: 360, z: 2.3 });
    const spots = `
      ${spot({ id: "sp-org", ...fOrg })}
      ${spot({ id: "sp-fy", ...fFy })}
      ${spot({ id: "sp-tz", ...fTz })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "welcome-wrap",
          children: screenFrame({
            src: `${SCREENS}/01-onboarding-welcome.png`,
            id: "scr-w",
            route: "app.grantpipe.com/onboarding",
            zoom: zW,
            alt: "Welcome screen value lines",
          }),
        })}
        ${frameSlot({
          id: "form-wrap",
          children: screenFrame({
            src: `${SCREENS}/02-onboarding-org-setup.png`,
            id: "scr-f",
            route: "app.grantpipe.com/onboarding/org",
            zoom: zF,
            inner: spots,
            alt: "Org setup form: name, fiscal year, timezone",
          }),
        })}
      </div>
      ${caption({ idx: 1, chip: "Set up your org", num: "01", line: "Three fields: your name, your fiscal year, your timezone." })}`;
    const timeline = `
      tl.fromTo("#welcome-wrap",{opacity:0,y:24},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.3);
      ${capIn}
      // transition welcome -> form: crossfade so a screenshot is always present
      // (form fades IN before welcome fades OUT — no bare-paper gap).
      tl.fromTo("#form-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.8,ease:"power3.out"},5.2);
      tl.to("#welcome-wrap",{opacity:0,duration:0.7,ease:"power2.in"},5.6);
      // EXCLUSIVE sequential field spotlights, on the leading word of each field's
      // narration (chapter-local = global - 27.76): org-name ~6.7s, fiscal ~15.6s,
      // timezone ~27.0s. Each ring clears before the next is lit (not cumulative).
      tl.fromTo("#sp-org",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},6.7);
      tl.to("#sp-org",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},14.6);
      tl.fromTo("#sp-fy",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},15.6);
      tl.to("#sp-fy",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},26.0);
      tl.fromTo("#sp-tz",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},27.0);
      // continuous slow Ken-Burns on the form (kills the ~33s static hold). Tween from
      // the transform that is current after the crossfade (zF) to the tighter zF2 across
      // the whole form display so the framing keeps drifting (rings stay in-frame).
      tl.set("#scr-f",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-f",{transform:"${zF}"},{transform:"${zF2}",duration:36.8,ease:"none"},6.0);`;
    return { kicker: "Getting Started", body, timeline };
  },

  // 02 (38.4s) — pick what you're importing. onboarding import -> /import choose-source.
  "02": () => {
    // 04-import-choose-source.png native regions (full-scale app).
    const rStep = { nx: 410, ny: 210, nw: 1340, nh: 56 }; // 4-step bar
    const rEntity = { nx: 426, ny: 456, nw: 122, nh: 46 }; // Contacts entity select
    const rPreset = { nx: 660, ny: 456, nw: 138, nh: 46 }; // Generic CSV preset select
    // Pan A: 4-step establishing beat. Pan B: drop into the SOURCE FILE controls cluster.
    // T2: zStep is enlarged (z=1.7) so the four step labels read at the review downscale
    // while all four steps stay in-frame (the bar spans native ~410-1750). The controls
    // beat is zoomed to ~ch01 scale (z=2.2, visible native width ~872px) centered on the
    // controls cluster (record-type select sp-ent nx426, preset sp-pre nx660, plus the
    // "Download contacts template" + "Required template columns: type" text below) so they
    // are comfortably legible. The far-right "Preview import" button is pushed fully out of
    // frame (not narrated) to gain legibility — never half-clipped.
    // 4-step bar spans native x~410-1830 (1420px wide) — too wide to zoom past ~1.35
    // without dropping a step. Per spec, when all-four-steps vs legibility conflict, keep
    // all four steps visible (this beat is only ~1.8s). z=1.34 fits the full bar; framed
    // tight on the bar+intro band (y~200-330) so the step labels are as large as possible
    // while "1 Choose source ... 4 Commit" all stay in-frame.
    const zStep = zoomTo({ nx: 405, ny: 205, nw: 1425, nh: 150, z: 1.34 });
    // Controls cluster spans native x~428-1342 (record-type select, Generic CSV preset,
    // "Download contacts template", CSV-file row, "Required template columns: type"),
    // y~400-660. Center ~(885,530); z=2.1 gives visible native width ~914px so the whole
    // cluster reads without half-cropping the Download-template button. The far-right
    // "Preview import" button (x~1352-1715, not narrated) is pushed fully out of frame.
    const zControls = zoomTo({ nx: 685, ny: 310, nw: 400, nh: 440, z: 2.1 });
    // Idle drift on the controls cluster after the zStep->zControls pan settles, so the
    // shot isn't pixel-static across its long hold. Slightly tighter; rings sp-ent/sp-pre
    // and all narrated controls stay framed (not in a gutter, not clipped).
    const zControls2 = zoomTo({ nx: 691, ny: 322, nw: 392, nh: 432, z: 2.16 });
    // M1: frame the onboarding "import intro" card at the SAME visual scale as the
    // ch00/ch01 welcome card (which used nw~400-416 @ z~1.92-2.08), so "Do you have a
    // spreadsheet" + the "Import a CSV" pill are large and crisp instead of a tiny card
    // floating in an empty browser window. The card content sits at native x~767-1152
    // (centered ~960), step bar y~388 down through "Back" ~685. A gentle drift gives it
    // presence to match ch00's title-card motion.
    const zAsk = zoomTo({ nx: 760, ny: 380, nw: 400, nh: 330, z: 1.95 });
    const zAsk2 = zoomTo({ nx: 752, ny: 372, nw: 416, nh: 346, z: 2.06 });
    const impInner = `
      ${spot({ id: "sp-step", ...rStep })}
      ${spot({ id: "sp-ent", ...rEntity })}
      ${spot({ id: "sp-pre", ...rPreset })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "ask-wrap",
          children: screenFrame({
            src: `${SCREENS}/03-onboarding-import.png`,
            id: "scr-ask",
            route: "app.grantpipe.com/onboarding/import",
            zoom: zAsk,
            alt: "Do you have a spreadsheet of donors prompt",
          }),
        })}
        ${frameSlot({
          id: "imp-wrap",
          children: screenFrame({
            src: `${SCREENS}/04-import-choose-source.png`,
            id: "scr-imp",
            route: "app.grantpipe.com/import",
            zoom: zStep,
            inner: impInner,
            alt: "Import workspace choose source",
          }),
        })}
      </div>
      ${caption({ idx: 2, chip: "Bring your data in", num: "02", line: "GrantPipe imports contacts, donations, grants, and grant opportunities. Start with contacts." })}`;
    // Narration (chapter-local): 0-6.1s "Now your data..." (ask screen);
    // 6.1-12.4s "GrantPipe imports contacts, donations, grants, and grant opportunities.
    // Start with contacts." (record types -> entity); 12.4s+ "Bloomerang/DonorPerfect/
    // ...choose Generic CSV...download a template" (preset). Emphasis lands on the words.
    const timeline = `
      tl.fromTo("#ask-wrap",{opacity:0,y:22},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.3);
      ${capIn}
      // gentle Ken-Burns push on the (now large) ask card, matching ch00's title-card drift
      tl.set("#scr-ask",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-ask",{transform:"${zAsk}"},{transform:"${zAsk2}",duration:5.0,ease:"sine.inOut"},0.5);
      // transition to the import screen as the record-types line begins (~6.1s)
      tl.to("#ask-wrap",{opacity:0,duration:0.6,ease:"power2.in"},5.0);
      tl.fromTo("#imp-wrap",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},5.6);
      // brief 4-step legend callout as the import workspace lands
      tl.fromTo("#sp-step",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},6.4);
      // pan down to the SOURCE FILE controls and call out the record type ("contacts")
      tl.to("#sp-step",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},8.2);
      tl.set("#scr-imp",{transformOrigin:"0 0"},0);
      tl.to("#scr-imp",{transform:"${zControls}",duration:0.9,ease:"power2.inOut"},8.4);
      tl.fromTo("#sp-ent",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},9.6);
      // m1: the named presets ("Bloomerang/DonorPerfect/Salesforce... pick that preset",
      // global ~82.7-88.6 = local ~11.1-17.0) have NO on-screen referent, so do NOT ring
      // the "Generic CSV" control during that line. Clear the Contacts ring before it so
      // the screen isn't cluttered with a stale ring while presets are named.
      tl.to("#sp-ent",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},11.0);
      // Hold the Generic CSV ring until "choose Generic CSV and match the columns
      // yourself" is actually spoken (global ~97-100 = local ~25.4-28.4); ring it then so
      // the emphasis matches the words instead of contradicting them.
      tl.fromTo("#sp-pre",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},25.4);
      // idle Ken-Burns on the controls row AFTER the zControls pan settles (ends ~9.3s).
      // Picks up from zControls at 9.6s and drifts to zControls2 through ~37.8s so the
      // ~29s static hold becomes continuous, gentle motion (preset control stays in-frame).
      tl.fromTo("#scr-imp",{transform:"${zControls}"},{transform:"${zControls2}",duration:28.2,ease:"sine.inOut",immediateRender:false},9.6);`;
    return { kicker: "Getting Started", body, timeline };
  },

  // 03 (31.64s) — upload & preview. upload-selected -> preview. Trust beat: nothing saved.
  "03": () => {
    // 05-import-upload-selected.png native regions (full-scale app).
    const rCsv = { nx: 426, ny: 562, nw: 1290, nh: 48 }; // Choose File row
    const rFile = { nx: 426, ny: 638, nw: 232, nh: 40 }; // donor-contacts.csv (294 B)
    // 06-import-preview.png native regions (full app at native 1920x1080). The PREVIEW
    // block sits low: "6 rows detected" chip and the five mapped rows. Coordinates
    // re-measured against the real screenshot so the rings hug their targets once the
    // preview zoom (zPv) is applied — the previous values were pre-scroll/half-scale and
    // floated in the left gutter / clipped columns.
    const rRows = { nx: 434, ny: 828, nw: 118, nh: 26 }; // "6 rows detected" chip
    const rTable = { nx: 426, ny: 864, nw: 1288, nh: 214 }; // header + five mapped rows
    // Zoom regions: upload -> the CSV-file card; preview -> the rows+table block.
    // z=1.4 (matches ch02 controls) keeps the full row in-frame: the left "SOURCE FILE"
    // label, the focal "donor-contacts.csv (294 B)" filename, and the right
    // "Preview import" button are all unclipped (was 1.7 and panned right, which cut
    // both edges to "ILE" / "acts.csv" / "Commi…").
    const zUp = zoomTo({ nx: 400, ny: 540, nw: 1340, nh: 200, z: 1.4 });
    // Idle drift on the upload CSV-file row so it isn't static across its ~12s show.
    const zUp2 = zoomTo({ nx: 410, ny: 548, nw: 1320, nh: 196, z: 1.46 });
    // M2: frame the table block tight — header (type / firstName / lastName / email)
    // through the five mapped rows (Dorothy..Frank). The table CELL borders run to
    // native ~1714, but the actual column CONTENT (incl. the longest email,
    // "hwhitfield@example.org") ends ~native 1370. Framing to nw=970 (x 420->1390) keeps
    // every column header and every cell value fully in-frame — only the trailing EMPTY
    // email-cell whitespace is trimmed, which is not column clipping — and lets z climb to
    // ~1.95, the SAME visual scale as the ch00/ch01 reference card, so the rows read
    // clearly at 1080p instead of sitting tiny at the frame bottom. Rings live inside
    // .shotzoom so they track this transform onto their real targets.
    const zPv = zoomTo({ nx: 420, ny: 858, nw: 970, nh: 224, z: 1.95 });
    // Idle drift on the preview table block so it isn't static for ~18s (header + five
    // rows stay fully in-frame; rings live inside .shotzoom and travel with the drift).
    const zPv2 = zoomTo({ nx: 430, ny: 862, nw: 950, nh: 220, z: 2.02 });
    const upInner = `
      ${spot({ id: "sp-csv", ...rCsv })}
      ${spot({ id: "sp-file", ...rFile })}`;
    const pvInner = `
      ${spot({ id: "sp-rows", ...rRows })}
      ${spot({ id: "sp-table", ...rTable })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "up-wrap",
          children: screenFrame({
            src: `${SCREENS}/05-import-upload-selected.png`,
            id: "scr-up",
            route: "app.grantpipe.com/import",
            zoom: zUp,
            inner: upInner,
            alt: "CSV file donor-contacts.csv attached",
          }),
        })}
        ${frameSlot({
          id: "pv-wrap",
          children: screenFrame({
            src: `${SCREENS}/06-import-preview.png`,
            id: "scr-pv",
            route: "app.grantpipe.com/import",
            zoom: zPv,
            inner: pvInner,
            alt: "Preview: 6 rows detected with mapped table",
          }),
        })}
        <!-- Trust callout sits INSIDE the frame interior (clear of the frame bottom edge
             at y=790 and the persistent-caption band at y>=823), so it never crowds the
             caption clear zone — which matches ch01's clean reference geometry. -->
        <div id="trust" style="opacity:0;position:absolute;left:50%;top:300px;transform:translateX(-50%);z-index:8;background:var(--emerald);color:var(--white);font-family:'Sora';font-weight:600;font-size:38px;padding:16px 36px;border-radius:999px;box-shadow:var(--shadow)">Nothing saves during preview.</div>
      </div>
      ${caption({ idx: 3, chip: "Upload and preview", num: "03", line: "Any CSV up to ten megabytes. You look before anything happens." })}`;
    const timeline = `
      tl.fromTo("#up-wrap",{opacity:0,y:24},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.3);
      ${capIn}
      tl.fromTo("#sp-csv",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},1.0);
      tl.fromTo("#sp-file",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},1.7);
      // transition upload -> preview: TRUE crossfade — preview fades IN first and the
      // upload screen holds until it has fully overlapped, so a screenshot is on screen
      // at all times (no bare warm-paper gap mid-sentence). Clear the upload-only spots
      // before the swap so they don't sit over the incoming preview.
      tl.to(["#sp-csv","#sp-file"],{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},D*0.36);
      tl.fromTo("#pv-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.9,ease:"power3.out"},D*0.40);
      tl.to("#up-wrap",{opacity:0,duration:0.7,ease:"power2.in",overwrite:"auto"},D*0.50);
      // "It shows you the first five" is spoken at global ~125.5-131.5 (chapter-local
      // ~15.5-21.5). Light the chip ring and the five-row ring WITH those words (right
      // after the preview crossfade completes at D*0.50≈15.8s) so both frame their real
      // targets while the line is read — not several seconds after.
      tl.fromTo("#sp-rows",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},16.0);
      tl.fromTo("#sp-table",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},16.8);
      // continuous slow Ken-Burns on both held screenshots (no more pixel-static holds).
      // upload drifts across its ~12s show; preview drifts after the crossfade settles.
      tl.set("#scr-up",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-up",{transform:"${zUp}"},{transform:"${zUp2}",duration:11.0,ease:"sine.inOut"},1.0);
      tl.set("#scr-pv",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-pv",{transform:"${zPv}"},{transform:"${zPv2}",duration:17.4,ease:"sine.inOut"},13.6);
      // A-V retiming: the "Nothing saves during preview." card must pop ON the spoken
      // "Nothing saves." (global 120.02-121.02 = chapter-local 10.0-11.0). Enter at 10.2s
      // (was D*0.80 ~25.3s, ~15s late). Holds, no exit — the chapter transition handles it.
      tl.fromTo("#trust",{opacity:0,y:20,scale:0.92},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)"},10.2);`;
    return { kicker: "Getting Started", body, timeline };
  },

  // 04 (48.44s) — commit & read result. commit-result, three numbers, row error, history.
  "04": () => {
    // 07-import-commit-result.png native regions (full-scale; PREVIEW section).
    const rResult = { nx: 440, ny: 840, nw: 340, nh: 28 }; // "Import finished: 2 inserted, 3 duplicates, 1 failed"
    const rErr = { nx: 436, ny: 880, nw: 1284, nh: 70 }; // "Rows needing attention / Line 7, type..."
    // 08-import-history.png native: IMPORT HISTORY entry card sits at y~828-1010, x~430-1060.
    const rHist = { nx: 426, ny: 842, nw: 642, nh: 96 }; // donor-contacts.csv: type/status/counts/date
    // Three stat chips that pop in sequence, echoing the spoken numbers.
    const stats = [
      { n: "2", l: "inserted", c: "var(--emerald)", bg: "var(--emerald-50)" },
      { n: "3", l: "duplicates", c: "#7a5410", bg: "var(--ochre-50)" },
      { n: "1", l: "failed", c: "var(--red)", bg: "var(--red-50)" },
    ]
      .map(
        (s, i) =>
          `<div id="st-${i}" style="opacity:0;display:flex;flex-direction:column;align-items:center;gap:4px;background:${s.bg};border:2px solid ${s.c};border-radius:16px;padding:16px 30px;min-width:190px">
            <div style="font-family:'Mono';font-weight:500;font-size:58px;line-height:1;color:${s.c}">${s.n}</div>
            <div style="font-family:'Plex';font-weight:600;font-size:24px;color:${s.c}">${s.l}</div>
          </div>`,
      )
      .join("");
    // Zoom regions: result -> the PREVIEW result+error block. z=1.42 widens the view so
    // the right-side primary "Commit import" button (right edge ~native 1717) is fully
    // in-frame (was clipped to "Comm…"); history -> entry.
    const zRes = zoomTo({ nx: 414, ny: 772, nw: 1300, nh: 188, z: 1.49 });
    // Idle drift on the result banner during the ~10s static gap before the zErr push.
    // Must FINISH before the zErr push at 23.0 (push then starts from zRes2 — fine).
    const zRes2 = zoomTo({ nx: 420, ny: 778, nw: 1286, nh: 186, z: 1.54 });
    // M3(a): during "Here, line seven used a contact type..." push into the result banner
    // + "Rows needing attention / Line 7, type: Use one of: individual, organization."
    // rows. The boxes' left borders and ALL text content (which ends ~native 745) stay in
    // frame; only the empty right portion of the full-width boxes leaves frame — not the
    // text being read — letting z climb to 2.2 so the error row reads at 1080p.
    const zErr = zoomTo({ nx: 424, ny: 832, nw: 832, nh: 128, z: 2.2 });
    // M3: frame the IMPORT HISTORY entry card tight so its type/status/counts line
    // ("Contacts | Completed With Duplicates", "Inserted 2, duplicates 3, failed 1",
    // "Jun 2, 2026") reads at 1080p. The entry card sits at native x~426-1068, y~828-1010;
    // z=2.4 fills the ~640px-wide card across the frame without revealing blank gutter.
    const zHist = zoomTo({ nx: 420, ny: 822, nw: 660, nh: 200, z: 2.4 });
    // Idle drift on the history entry card so it isn't static for ~13s. The sp-hist ring
    // and the type/status/counts/date line stay in-frame.
    const zHist2 = zoomTo({ nx: 426, ny: 826, nw: 648, nh: 197, z: 2.48 });
    const resInner = `
      ${spot({ id: "sp-res", ...rResult })}
      ${spot({ id: "sp-err", ...rErr })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "res-wrap",
          children: screenFrame({
            src: `${SCREENS}/07-import-commit-result.png`,
            id: "scr-res",
            route: "app.grantpipe.com/import",
            zoom: zRes,
            inner: resInner,
            alt: "Import finished: 2 inserted, 3 duplicates, 1 failed",
          }),
        })}
        ${frameSlot({
          id: "hist-wrap",
          children: screenFrame({
            src: `${SCREENS}/08-import-history.png`,
            id: "scr-hist",
            route: "app.grantpipe.com/import",
            zoom: zHist,
            inner: spot({ id: "sp-hist", ...rHist }),
            alt: "Import history with donor-contacts.csv entry",
          }),
        })}
        <!-- Stat cards sit INSIDE the frame interior (upper band, clear of the frame
             bottom edge at y=790 and the persistent-caption band at y>=823), so they no
             longer crowd the caption clear zone — matches ch01's clean reference. -->
        <div id="stats" style="opacity:0;position:absolute;left:50%;top:188px;transform:translateX(-50%);display:flex;gap:24px;z-index:8">
          ${stats}
        </div>
      </div>
      ${caption({ idx: 4, chip: "Commit and read the result", num: "04", line: "Two added. Three skipped as duplicates. One failed, with the line and field to fix." })}`;
    const timeline = `
      tl.fromTo("#res-wrap",{opacity:0,y:24},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.3);
      ${capIn}
      tl.fromTo("#sp-res",{opacity:0,scale:0.92},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.5)"},D*0.16);
      // Three numbers pop in sequence ON the spoken enumeration (chapter-local; global
      // minus 141.64): "2 inserted" ~9.4s, "3 duplicates" ~9.9s, "1 failed" ~12.0s.
      // Pulled ~6s earlier than before so the big cards land with the words, not after.
      tl.fromTo("#stats",{opacity:0},{opacity:1,duration:0.3},9.0);
      tl.fromTo("#st-0",{opacity:0,y:18,scale:0.9},{opacity:1,y:0,scale:1,duration:0.45,ease:"back.out(1.6)"},9.4);
      tl.fromTo("#st-1",{opacity:0,y:18,scale:0.9},{opacity:1,y:0,scale:1,duration:0.45,ease:"back.out(1.6)"},9.9);
      tl.fromTo("#st-2",{opacity:0,y:18,scale:0.9},{opacity:1,y:0,scale:1,duration:0.45,ease:"back.out(1.6)"},12.0);
      // The summary-line ring (2/3/1) belongs to the earlier enumeration (~global
      // 150-154, local ~8.4-12.4); clear it before the Line-7 ring lights so the two
      // never overlap.
      tl.to("#sp-res",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},13.4);
      // M3: the row error ("Line 7, type: Use one of: individual, organization.") is
      // spoken at "Here, line seven used a contact type..." — captions.srt cue 55,
      // global 165.93-172.31 = chapter-local 24.29-30.67. Light the Line-7 ring WITH
      // those words and hold it through the line. zRes frames the banner + error rows at
      // z=1.46 so the row text reads at 1080p. (Prior code lit it ~10s early at 14.9s.)
      // Push the result screen in from the wide width-fit (zRes) to the tight error-row
      // framing (zErr) just before "line seven" is spoken, hold through the line, then
      // ease back out before the history crossfade so the row text is large while read.
      tl.set("#scr-res",{transformOrigin:"0 0"},0);
      // idle drift on the result banner during the ~10s gap before the line-7 push.
      // Finishes at 22.5 (before the 23.0 zErr push, which then starts from zRes2).
      tl.fromTo("#scr-res",{transform:"${zRes}"},{transform:"${zRes2}",duration:9.5,ease:"sine.inOut"},13.0);
      tl.to("#scr-res",{transform:"${zErr}",duration:1.2,ease:"power2.inOut"},23.0);
      tl.fromTo("#sp-err",{opacity:0,scale:0.95},{opacity:1,scale:1,duration:0.5,ease:"power2.out"},24.3);
      tl.to("#sp-err",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},31.0);
      tl.to("#scr-res",{transform:"${zRes}",duration:1.0,ease:"power2.inOut"},31.2);
      // transition result -> history: TRUE crossfade so the app screenshot is present
      // beneath the stat cards at ALL times (history fades IN before result fades OUT).
      // Fade the cards out together WITH the result screen during the swap so they are
      // never left floating over bare warm paper.
      // History must be fully framed BEFORE "GrantPipe logs every import you run right
      // here" finishes (captions cue 58, global 179.7-183.89 = local 38.06-42.25). Bring
      // the history screen in at ~34.9s and fade the result+cards out at ~37.8s so the
      // import-history card is settled and legible across the whole line, then ring its
      // type/status/counts entry at ~38.6s while the words are spoken.
      tl.fromTo("#hist-wrap",{opacity:0,y:18},{opacity:1,y:0,duration:0.9,ease:"power3.out"},34.9);
      tl.to("#res-wrap",{opacity:0,duration:0.7,ease:"power2.in",overwrite:"auto"},37.8);
      tl.to("#stats",{opacity:0,duration:0.6,ease:"power2.in",overwrite:"auto"},37.8);
      tl.fromTo("#sp-hist",{opacity:0,scale:0.96},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.4)"},38.6);
      // idle Ken-Burns on the history entry card so it isn't static for ~13s. Drifts
      // zHist->zHist2 from after it settles through near chapter end (ring + line in-frame).
      tl.set("#scr-hist",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-hist",{transform:"${zHist}"},{transform:"${zHist2}",duration:12.0,ease:"sine.inOut"},35.6);`;
    return { kicker: "Getting Started", body, timeline };
  },

  // 05 (35.16s) — you're set up. donors list (settle on imported two) -> calm end card with template, fade.
  "05": () => {
    // 09-donors-list.png is HALF-scale: donors table sits low (rows y~700-1070).
    const rFrank = { nx: 212, ny: 746, nw: 678, nh: 38 }; // Frank Delgado row
    const rHelen = { nx: 212, ny: 1042, nw: 678, nh: 36 }; // Helen Whitfield row
    // Zoom into the donors table so the imported names read clearly (Frank..Helen).
    const zDon = zoomTo({ nx: 205, ny: 660, nw: 700, nh: 420, z: 1.42 });
    // Idle drift on the donors table so it isn't static across its ~12s show
    // (Frank/Helen rings live inside .shotzoom and travel with it).
    const zDon2 = zoomTo({ nx: 212, ny: 666, nw: 686, nh: 414, z: 1.48 });
    const donInner = `
      ${spot({ id: "sp-frank", ...rFrank })}
      ${spot({ id: "sp-helen", ...rHelen })}`;
    const body = `
      <div class="stage" style="gap:0">
        ${frameSlot({
          id: "don-wrap",
          children: screenFrame({
            src: `${SCREENS}/09-donors-list.png`,
            id: "scr-don",
            route: "app.grantpipe.com/donors",
            zoom: zDon,
            inner: donInner,
            alt: "Donors list with imported contacts",
          }),
        })}
        <div id="end" style="opacity:0;position:absolute;display:flex;flex-direction:column;align-items:center;gap:30px;z-index:6">
          <div id="end-mark" role="img" aria-label="GrantPipe" style="width:96px;height:96px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat"></div>
          <div id="end-head" style="font-family:'Sora';font-weight:700;font-size:74px;letter-spacing:-1.5px;color:var(--ink);text-align:center">You're set up.</div>
          <div id="end-card" style="background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:18px;box-shadow:var(--shadow);padding:26px 38px;max-width:980px;text-align:center">
            <div style="font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">Free template</div>
            <div style="font-family:'Sora';font-weight:600;font-size:40px;margin-top:10px;color:var(--ink)">CRM Migration Data Map</div>
            <div style="font-family:'Plex';font-weight:500;font-size:28px;margin-top:10px;color:var(--muted)">Which column goes where. It's in your inbox.</div>
          </div>
        </div>
      </div>
      ${caption({ idx: 5, chip: "You're set up", num: "05", line: "Your org is set, your donors are in. No consultant needed." })}`;
    // Final scene: exit animations ALLOWED here only (gentle fade).
    const timeline = `
      // "And there they are. Your donors, in GrantPipe" is spoken across the ch04->ch05
      // boundary (global ~187.4-190.6s). Reveal the donors table at the very start of this
      // chapter (local 0, quick fade) so the table lands with the tail of that line instead
      // of on a blank crossfade.
      tl.fromTo("#don-wrap",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power3.out"},0.0);
      ${capIn}
      tl.fromTo("#sp-frank",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},D*0.12);
      tl.fromTo("#sp-helen",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},D*0.22);
      // continuous slow Ken-Burns on the donors table (no more pixel-static hold) across
      // its ~12s show, before the fade-out at 12.6. Frank/Helen rings travel with it.
      tl.set("#scr-don",{transformOrigin:"0 0"},0);
      tl.fromTo("#scr-don",{transform:"${zDon}"},{transform:"${zDon2}",duration:11.4,ease:"sine.inOut"},0.6);
      // Fade donors out, bring up the calm end card. The "CRM Migration Data Map" name is
      // spoken at global ~204.9s (chapter-local ~14.9s), so the FREE TEMPLATE card must be
      // fully revealed by ~14.9s (was ~23s, ~8s late). Final scene: exit anims allowed.
      tl.to("#don-wrap",{opacity:0,duration:0.8,ease:"power2.inOut",overwrite:"auto"},12.6);
      tl.set("#cap",{},12.6);
      tl.fromTo("#end",{opacity:0,y:26},{opacity:1,y:0,duration:0.9,ease:"power3.out"},13.2);
      tl.fromTo("#end-card",{opacity:0,y:20,scale:0.96},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.4)"},14.4);
      // m1: the outro previously held pixel-static from card entrance (~15s) until the
      // tail fade (~34s) — the only motionless stretch in the video. Add a very slow
      // Ken-Burns drift on the outro group (scale 1.00->1.03, a few px up) from after the
      // elements finish entering through the start of the closing fade, matching ch00's
      // gentle title-card drift. Subtle so the CTA stays readable. This is a transform
      // tween, NOT an opacity exit — the only allowed exit here is the final fade below.
      tl.fromTo("#end",{transformOrigin:"50% 50%",y:0,scale:1},{y:-16,scale:1.045,duration:(D-1.1)-15.2,ease:"sine.inOut"},15.2);
      // final gentle fade-out (final scene only)
      tl.to(["#end","#cap","#chrome-wordmark","#chrome-kicker","#chrome-progress"],{opacity:0,duration:0.9,ease:"power2.in"},D-1.1);`;
    return { kicker: "Getting Started", body, timeline };
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
