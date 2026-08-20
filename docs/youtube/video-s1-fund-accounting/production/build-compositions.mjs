// Generates compositions/chapter-XX.html for S1 "What Is Fund Accounting?
// (Explained for Nonprofits)", timed to the recorded audio durations.
//
// S1 is an SEO CONCEPT video — there is NO real-app capture. Every scene is a
// hand-built concept visual (question cards, a bank-vs-envelopes diagram, buckets,
// jars, a Business/Nonprofit contrast table, recap chips, a lead-magnet end card).
// It reuses the P1/P2 chrome (doc + progress + caption + capIn) and the warm
// emerald/ochre paper brand, but adds a CONCEPT_CSS block instead of screenFrame.
//
// Motion model (mirrors P2): chapters are rendered as separate MP4s and joined with
// a 0.35s cross-dissolve. So every chapter OPENS with its first frame already painted
// (open:true on the opening slot) and only the FINAL chapter (06) fades out. Each
// chapter's last visible frame keeps a gentle drift running PAST data-duration so the
// seam never lands on a frozen/blank frame. Within a chapter, sub-frames cross-fade.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doc, progress } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

const KICKER = "Fund Accounting";

// ---- Concept CSS (added per-composition via a <style> in the body) ----
// Everything here renders on solid warm paper — NO grid textures (brand rule).
const CONCEPT_CSS = `
/* full-bleed centred holder for one concept frame; padding keeps content clear of the
   caption (bottom:96) and progress bar. Multiple .cslot stack so frames cross-fade
   without the layout shifting. */
.cslot{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:42px;padding:170px 130px 300px;text-align:center}
.cslot .grp{display:flex;flex-direction:column;align-items:center;gap:42px;width:100%}

/* Big spoken-idea line */
.bigline{font-family:'Sora';font-weight:700;font-size:74px;line-height:1.08;letter-spacing:-1.5px;
  color:var(--ink);max-width:1500px}
.bigline .em{color:var(--emerald)}
.sub{font-family:'Plex';font-weight:500;font-size:34px;color:var(--muted);max-width:1200px;line-height:1.3}

/* Pill tag */
.ptag{display:inline-block;font-family:'Mono';font-weight:500;font-size:24px;letter-spacing:1px;
  background:var(--ochre-50);color:#7a5410;border:1px solid var(--ochre-line);border-radius:999px;padding:11px 26px}

/* Question cards (ch00) */
.qcard{background:var(--white);border-radius:24px;box-shadow:var(--shadow);border:1px solid var(--line);
  padding:38px 60px;max-width:1280px}
.qcard .qlabel{font-family:'Mono';font-weight:500;font-size:21px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
.qcard .qtext{font-family:'Sora';font-weight:700;font-size:54px;letter-spacing:-1px;margin-top:12px;line-height:1.06}
.qcard.q1{border-top:6px solid var(--line2)}
.qcard.q1 .qtext{color:var(--muted)}
.qcard.q2{border-top:6px solid var(--emerald)}
.qcard.q2 .qtext{color:var(--emerald)}
.gapmark{font-family:'Sora';font-weight:700;font-size:40px;color:var(--ochre);
  background:var(--ochre-50);border:1px solid var(--ochre-line);border-radius:999px;padding:10px 30px}

/* Jargon chips (ch00) */
.chiprow{display:flex;gap:24px;flex-wrap:wrap;justify-content:center;max-width:1300px}
.jchip{font-family:'Mono';font-weight:500;font-size:34px;color:var(--ink);background:var(--white);
  border:1px solid var(--line2);border-radius:14px;padding:18px 34px;box-shadow:var(--shadow)}

/* Builder note (ch00) */
.notecard{background:var(--white);border:1px solid var(--line);border-left:6px solid var(--emerald);
  border-radius:18px;box-shadow:var(--shadow);padding:34px 44px;max-width:1180px;text-align:left}
.notecard .nk{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)}
.notecard .nt{font-family:'Sora';font-weight:600;font-size:40px;margin-top:12px;line-height:1.18;color:var(--ink)}

/* Bank vs envelopes (ch01) */
.bankrow{display:flex;align-items:center;justify-content:center;gap:56px;width:100%}
.bankcol{display:flex;flex-direction:column;align-items:center;gap:20px;width:480px}
.colcap{font-family:'Plex';font-weight:600;font-size:28px;color:var(--muted);max-width:440px;line-height:1.25}
.vrule{width:5px;height:300px;background:#c3b48f;border-radius:999px}
.vlabel{font-family:'Mono';font-weight:500;font-size:24px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)}
.envrow{display:flex;gap:30px;justify-content:center}
.env{width:262px;height:196px;position:relative;filter:drop-shadow(0 18px 30px rgba(20,40,30,.16))}
.env .pocket{position:absolute;inset:0;background:var(--white);border:2px solid var(--line2);border-radius:14px}
.env .flap{position:absolute;top:0;left:0;right:0;height:120px;background:var(--emerald-50);
  border:2px solid var(--line2);border-radius:14px 14px 0 0;clip-path:polygon(0 0,100% 0,50% 100%)}
.env.k-ochre .flap{background:var(--ochre-50)}
.env.k-paper .flap{background:var(--paper2)}
.env .name{position:absolute;left:0;right:0;bottom:24px;text-align:center;font-family:'Sora';
  font-weight:600;font-size:26px;color:var(--ink);padding:0 14px;line-height:1.1}
.envcol{display:flex;flex-direction:column;align-items:center;gap:26px}

/* Document / statement / award (ch02) */
.doccard{background:var(--white);border-radius:16px;box-shadow:var(--shadow);border:1px solid var(--line);
  padding:32px 38px;width:560px;text-align:left;position:relative}
.doccard h4{font-family:'Sora';font-weight:700;font-size:32px;margin-bottom:8px;color:var(--ink)}
.doccard .meta{font-family:'Mono';font-weight:400;font-size:20px;color:var(--muted);margin-bottom:18px}
.doccard .ln{height:14px;background:var(--line);border-radius:6px;margin:16px 0}
.doccard .ln.s{width:58%}
.doccard .ln.m{width:78%}
.doccard .row{display:flex;justify-content:space-between;font-family:'Mono';font-weight:500;
  font-size:26px;color:var(--ink);padding:12px 0;border-bottom:1px solid var(--line)}
.doccard .row .v{color:var(--emerald)}
.doccard .row.tot{border-bottom:0;font-weight:600}
.stringtag{display:inline-block;font-family:'Mono';font-weight:500;font-size:22px;background:var(--ochre);
  color:#3a2a07;border-radius:999px;padding:9px 20px;box-shadow:var(--shadow)}
.stamp{position:absolute;left:100%;margin-left:28px;top:50%;white-space:nowrap;
  font-family:'Sora';font-weight:700;font-size:30px;color:var(--red);border:4px solid var(--red);
  border-radius:12px;padding:10px 22px;transform:rotate(-9deg);letter-spacing:.5px;background:rgba(251,233,231,.55)}
.tworow{position:relative;display:flex;align-items:center;justify-content:center}

/* Buckets (ch03) */
.bucketrow{display:flex;gap:90px;justify-content:center;align-items:flex-end}
.bcol{display:flex;flex-direction:column;align-items:center;gap:22px}
.bucket{width:360px;height:280px;border:3px solid;border-radius:20px 20px 36px 36px;position:relative;
  background:var(--white);box-shadow:var(--shadow);overflow:hidden}
.bucket.flex{border-color:var(--emerald)}
.bucket.promised{border-color:var(--ochre)}
.bucket .fill{position:absolute;left:0;right:0;bottom:0;height:58%;transform-origin:50% 100%}
.bucket.flex .fill{background:var(--emerald-50)}
.bucket.promised .fill{background:var(--ochre-50)}
.bucket .blabel{position:absolute;left:0;right:0;top:40px;text-align:center;font-family:'Sora';
  font-weight:700;font-size:40px;z-index:2}
.bucket.flex .blabel{color:var(--emerald)}
.bucket.promised .blabel{color:#7a5410}
.bcap{font-family:'Plex';font-weight:600;font-size:30px;color:var(--ink);max-width:380px;line-height:1.2}
.bcap .mut{display:block;font-weight:400;font-size:24px;color:var(--muted);margin-top:6px}

/* Three -> two collapse (ch03) */
.oldrow{display:flex;gap:24px;justify-content:center;flex-wrap:wrap}
.oldchip{font-family:'Plex';font-weight:600;font-size:30px;color:var(--muted);background:var(--white);
  border:1px solid var(--line2);border-radius:14px;padding:18px 30px;box-shadow:var(--shadow);position:relative}
.oldchip .strike{position:absolute;left:14px;right:14px;top:50%;height:4px;background:var(--red);
  border-radius:3px;transform:scaleX(0);transform-origin:0 50%}

/* Board-reserve trap (ch03) */
.trapcard{background:var(--white);border:1px solid var(--line);border-top:6px solid var(--ochre);
  border-radius:18px;box-shadow:var(--shadow);padding:34px 46px;max-width:1180px;text-align:left}
.trapcard .tk{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)}
.trapcard .tt{font-family:'Sora';font-weight:600;font-size:42px;margin-top:12px;line-height:1.16;color:var(--ink)}
.trapcard .tx{font-family:'Plex';font-weight:500;font-size:30px;margin-top:16px;color:var(--muted);line-height:1.3}

/* Jars worked example (ch04) */
.orgnode{font-family:'Sora';font-weight:600;font-size:30px;color:var(--ink);background:var(--white);
  border:2px solid var(--line2);border-radius:14px;box-shadow:var(--shadow);padding:16px 32px}
.jarrow{display:flex;gap:120px;justify-content:center;align-items:flex-end;margin-top:14px}
.jar{width:290px;height:300px;position:relative}
.jar .glass{position:absolute;left:0;right:0;top:30px;bottom:0;border:3px solid var(--line2);
  border-radius:18px 18px 26px 26px;background:var(--white);overflow:hidden;box-shadow:var(--shadow)}
.jar .lid{position:absolute;top:0;left:34px;right:34px;height:32px;border-radius:9px;
  background:var(--paper2);border:3px solid var(--line2)}
.jar .fill{position:absolute;left:0;right:0;bottom:0;transform-origin:50% 100%;transform:scaleY(0)}
.jar.promised .fill{background:var(--ochre-50)}
.jar.flex .fill{background:var(--emerald-50)}
.jar .amt{position:absolute;left:0;right:0;top:120px;text-align:center;font-family:'Mono';
  font-weight:500;font-size:40px;color:var(--ink);z-index:2}
.jar .jname{position:absolute;left:0;right:0;bottom:-50px;text-align:center;font-family:'Sora';
  font-weight:600;font-size:27px;color:var(--ink)}
.jar .jkind{position:absolute;left:0;right:0;bottom:-82px;text-align:center;font-family:'Mono';
  font-weight:400;font-size:21px}
.jar.promised .jkind{color:#7a5410}
.jar.flex .jkind{color:var(--emerald)}

/* Blocked borrow (ch04) */
.borrowrow{display:flex;align-items:center;justify-content:center;gap:40px;position:relative}
.node{background:var(--white);border:2px solid var(--line2);border-radius:14px;box-shadow:var(--shadow);
  padding:20px 34px;font-family:'Sora';font-weight:600;font-size:32px;color:var(--ink)}
.node.k-ochre{border-color:var(--ochre);color:#7a5410}
.node.k-red{border-color:var(--red);color:var(--red)}
.dashwrap{position:relative;width:300px;height:60px;display:flex;align-items:center;justify-content:center}
.dash{width:100%;height:0;border-top:4px dashed var(--ochre)}
.redbar{position:absolute;left:50%;top:50%;margin-left:-60px;margin-top:-3px;width:120px;height:6px;background:var(--red);border-radius:4px;transform:rotate(34deg)}
.noband{display:inline-block;font-family:'Mono';font-weight:600;font-size:24px;color:#fff;background:var(--red);
  border-radius:999px;padding:9px 22px;box-shadow:var(--shadow)}

/* Promise kept (ch04) */
.keptcard{background:var(--white);border:1px solid var(--line);border-top:6px solid var(--emerald);
  border-radius:18px;box-shadow:var(--shadow);padding:34px 48px;max-width:1120px}
.keptcard .kt{font-family:'Sora';font-weight:700;font-size:50px;color:var(--emerald)}
.keptcard .kx{font-family:'Plex';font-weight:500;font-size:30px;color:var(--muted);margin-top:14px;line-height:1.3}

/* Contrast table (ch05) */
.ctable{background:var(--white);border-radius:20px;box-shadow:var(--shadow);border:1px solid var(--line);
  overflow:hidden;width:1300px}
.ctable .crow{display:grid;grid-template-columns:1fr 96px 1fr;align-items:center}
.ctable .crow.hrow{background:var(--paper2)}
.ctable .crow+.crow{border-top:1px solid var(--line)}
.ctable .hcell{font-family:'Mono';font-weight:500;font-size:23px;letter-spacing:2px;text-transform:uppercase;
  padding:22px 36px;background:var(--paper2);text-align:left}
.ctable .hcell.npo{color:var(--emerald)}
.ctable .hcell.biz{color:var(--muted)}
.ctable .cell{padding:28px 36px;font-family:'Plex';font-size:34px;text-align:left}
.ctable .cell.biz{color:var(--muted);font-weight:500}
.ctable .cell.npo{color:var(--emerald);font-weight:600}
.ctable .arrow{text-align:center;color:var(--ochre);font-family:'Mono';font-weight:500;font-size:34px}

/* GASB aside (ch05) */
.asidecard{background:var(--white);border:1px solid var(--line);border-left:6px solid var(--ochre);
  border-radius:18px;box-shadow:var(--shadow);padding:34px 46px;max-width:1160px;text-align:left}
.asidecard .ak{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)}
.asidecard .at{font-family:'Sora';font-weight:600;font-size:40px;margin-top:12px;line-height:1.18;color:var(--ink)}

/* Recap + end card (ch06) */
.recapline{font-family:'Sora';font-weight:700;font-size:66px;line-height:1.1;letter-spacing:-1.2px;
  color:var(--ink);max-width:1400px}
.recapline .em{color:var(--emerald)}
.recaprow{display:flex;flex-direction:column;gap:20px;align-items:center}
.rchip{display:inline-flex;align-items:center;gap:16px;background:var(--white);border:1px solid var(--line);
  border-left:5px solid var(--emerald);border-radius:14px;box-shadow:var(--shadow);padding:18px 30px;
  font-family:'Plex';font-weight:500;font-size:32px;color:var(--ink)}
.rchip .dot{width:14px;height:14px;border-radius:999px;background:var(--ochre);flex:0 0 auto}
.endmark{width:96px;height:96px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat}
.endhead{font-family:'Sora';font-weight:700;font-size:64px;letter-spacing:-1.2px;color:var(--ink)}
.endcard{background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);
  border-radius:18px;box-shadow:var(--shadow);padding:28px 44px;max-width:1060px}
.endcard .ek{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)}
.endcard .en{font-family:'Sora';font-weight:600;font-size:42px;margin-top:10px;color:var(--ink)}
.endcard .es{font-family:'Plex';font-weight:500;font-size:28px;margin-top:12px;color:var(--muted)}
`;

// caption block (animatable: #cap is faded/slid in via capIn). Mirrors P2.
function caption({ idx, chip, num, line }) {
  const numHtml = num != null ? `<span class="num">${num}</span>` : "";
  return `<div id="cap" class="caption clip" data-start="0" data-duration="DUR" data-track-index="8" style="opacity:0">
    <div class="chip">${numHtml}${chip}</div>
    <div class="line">${line}</div>
  </div>
  <div id="chrome-progress" class="clip" data-start="0" data-duration="DUR" data-track-index="7">${progress(N, idx)}</div>`;
}
const capIn = `tl.fromTo("#cap",{opacity:0,y:28},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.25);`;

// A stacked concept frame holder. open:true paints it at t=0 (chapter opener).
function slot({ id, open = false, z = 3, children }) {
  return `<div id="${id}" class="cslot" style="opacity:${open ? 1 : 0};z-index:${z}">${children}</div>`;
}

function bankSVG() {
  return `<svg width="210" height="190" viewBox="0 0 120 108" fill="none" stroke="#065f46" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" role="img" aria-label="Bank">
    <polygon points="60,8 110,38 10,38" fill="#e7f3ee"/>
    <line x1="6" y1="38" x2="114" y2="38"/>
    <line x1="22" y1="44" x2="22" y2="86"/>
    <line x1="44" y1="44" x2="44" y2="86"/>
    <line x1="76" y1="44" x2="76" y2="86"/>
    <line x1="98" y1="44" x2="98" y2="86"/>
    <rect x="8" y="90" width="104" height="12" rx="3" fill="#e7f3ee"/>
  </svg>`;
}

function env({ id, kind = "", name }) {
  return `<div id="${id}" class="env ${kind}"><div class="pocket"></div><div class="flap"></div><div class="name">${name}</div></div>`;
}

// ---- Scene builders. Each returns {body, timeline}. DUR placeholder replaced per chapter. ----
const scenes = {
  // 00 (56.8s) — Two different questions. Tag "What is fund accounting?" persists;
  // the two questions stack in, a gap marker lands, then jargon chips, then the
  // builder note. Three sub-frames cross-fade.
  "00": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-q",
          open: true,
          children: `<div class="grp">
            <div id="q-tag" class="ptag">What is fund accounting?</div>
            <div id="q1" class="qcard q1" style="opacity:0"><div class="qlabel">Every business asks</div><div class="qtext">Did we make a profit?</div></div>
            <div id="qgap" class="gapmark" style="opacity:0">Not the same question</div>
            <div id="q2" class="qcard q2" style="opacity:0"><div class="qlabel">A nonprofit must ask</div><div class="qtext">Did we use each dollar the way we promised?</div></div>
          </div>`,
        })}
        ${slot({
          id: "f-jargon",
          children: `<div class="grp">
            <div class="sub" id="j-sub" style="opacity:0">Words you've seen on every nonprofit report:</div>
            <div class="chiprow">
              <div class="jchip" id="j1" style="opacity:0">restricted</div>
              <div class="jchip" id="j2" style="opacity:0">unrestricted</div>
              <div class="jchip" id="j3" style="opacity:0">net assets</div>
            </div>
            <div class="ptag" id="j-tag" style="opacity:0">In plain English, in about seven minutes</div>
          </div>`,
        })}
        ${slot({
          id: "f-builder",
          children: `<div class="grp">
            <div id="note" class="notecard" style="opacity:0">
              <div class="nk">Where I'm coming from</div>
              <div class="nt">I build grant compliance software. To make a computer follow these rules, I had to learn how the money is meant to move. Not an auditor. Just the version a busy director needs.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 0, chip: "Two different questions", num: "00", line: "Profit isn't the question. Keeping each promise is." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-q .grp",{transformOrigin:"50% 50%"},0);
      // "Every business... Did we make a profit?" (~0-7)
      tl.fromTo("#q1",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},1.0);
      // opening hold (~1.8-8.0): q-tag + first question sit alone until the second question
      // arrives at 8.0. Early swell-and-return so the frame never freezes; returns to scale 1
      // at 8.0 and the one-way breathing at 10.5 starts from scale 1 (no pop). 2.0->8.0 = 6.0s.
      tl.to("#f-q .grp",{scale:1.025,duration:3.0,yoyo:true,repeat:1,ease:"sine.inOut"},2.0);
      // "A nonprofit has to answer a different one..." (~7-15)
      tl.fromTo("#q2",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},8.0);
      // "Those are not the same question. And that gap..." cues 5-6 (11.5-17.6)
      tl.fromTo("#qgap",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.6)"},12.2);
      // gentle breathing so the question card never sits pixel-static
      tl.fromTo("#f-q .grp",{scale:1},{scale:1.03,duration:6.0,ease:"sine.inOut"},10.5);
      // "...a report full of words like restricted (17.6), unrestricted, and net assets (23.3-25.3)." cues 7-8
      // The chips land ON the spoken words (no blank gap, nothing lands after the word is said).
      tl.to("#f-q",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},16.8);
      tl.fromTo("#f-jargon",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},17.2);
      tl.fromTo("#j-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},17.4);
      tl.fromTo("#j1",{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:"back.out(1.5)"},18.0);
      // hold (~18.5-23.4): j-sub + first chip alone until the next chip at 23.4. Early
      // swell-and-return; returns to scale 1 at 23.4 (chips/yoyo below start from scale 1).
      // 18.7->23.4 = 4.7s = 2 half-cycles of 2.35s.
      tl.to("#f-jargon .grp",{scale:1.025,duration:2.35,yoyo:true,repeat:1,ease:"sine.inOut"},18.7);
      tl.fromTo("#j2",{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:"back.out(1.5)"},23.4);
      tl.fromTo("#j3",{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:"back.out(1.5)"},24.4);
      // "Today I'll explain what those actually mean, in plain English..." (~32-44)
      tl.fromTo("#j-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},32.5);
      tl.set("#f-jargon .grp",{transformOrigin:"50% 50%"},0);
      // swell-and-return (yoyo) across the whole hold so the breathing returns to scale 1 right
      // at the 43.6 fade instead of a one-way ramp leaving a static tail (25.0->43.6 = 18.6s).
      tl.to("#f-jargon .grp",{scale:1.03,duration:9.3,yoyo:true,repeat:1,ease:"sine.inOut"},25.0);
      // "Quick note on where I'm coming from. I build grant compliance software..." (~44-56.8)
      tl.to("#f-jargon",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},43.6);
      tl.fromTo("#f-builder",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},44.0);
      tl.fromTo("#note",{opacity:0,y:24,scale:0.97},{opacity:1,y:0,scale:1,duration:0.8,ease:"back.out(1.3)"},44.4);
      // drift the note past render-end so the seam frame stays painted.
      tl.set("#f-builder .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-builder .grp",{scale:1},{scale:1.035,duration:(D+1.0)-45.4,ease:"sine.inOut"},45.4);`;
    return { body, timeline };
  },

  // 01 (58.88s) — What fund accounting is. One bank account vs a row of labeled
  // envelopes; cash knows which envelope it belongs to. Then the accountability line.
  "01": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-bank",
          open: true,
          children: `<div class="grp">
            <div id="b-tag" class="ptag">Track money by purpose, not profit</div>
            <div class="bankrow">
              <div class="bankcol" id="bank-col">
                ${bankSVG()}
                <div class="colcap">A business runs <b>one account</b> and watches the balance.</div>
              </div>
              <div class="vrule" id="b-rule"></div>
              <div class="bankcol" style="width:auto">
                <div class="vlabel" id="b-vl">A nonprofit runs envelopes</div>
                <div class="envrow">
                  ${env({ id: "env1", kind: "k-emerald", name: "After-school" })}
                  ${env({ id: "env2", kind: "k-ochre", name: "Building" })}
                  ${env({ id: "env3", kind: "k-paper", name: "Use for anything" })}
                </div>
              </div>
            </div>
          </div>`,
        })}
        ${slot({
          id: "f-acct",
          children: `<div class="grp">
            <div id="a-tag" class="ptag" style="opacity:0">The point is accountability</div>
            <div id="a-line" class="bigline" style="opacity:0">Can you prove <span class="em">every dollar</span> did the job you gave it?</div>
            <div id="a-sub" class="sub" style="opacity:0">Accountability just means showing what you did with the money.</div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 1, chip: "What fund accounting is", num: "01", line: "Split money into labeled funds, one set of books each." })}`;
    const timeline = `
      ${capIn}
      // "Fund accounting is a way of tracking money by purpose..." (~0-6): tag already painted, gentle settle.
      tl.fromTo("#b-tag",{scale:0.96},{scale:1,duration:0.6,ease:"power2.out"},0.4);
      // During the intro (~2-18) the bank sits CENTERED under the tag (x:480 ≈ canvas center),
      // so the right half isn't empty while the narration talks about splitting into funds.
      tl.fromTo("#bank-col",{opacity:0,x:450},{opacity:1,x:480,duration:0.8,ease:"power3.out"},2.0);
      // "...versus a row of labeled envelopes. A nonprofit runs the envelopes." (~18-21):
      // bank slides left to its comparison spot, the divider and envelopes form the pairing.
      tl.to("#bank-col",{x:0,duration:0.9,ease:"power2.inOut"},18.0);
      tl.fromTo("#b-rule",{opacity:0,scaleY:0},{opacity:1,scaleY:1,duration:0.6,ease:"power2.out"},18.4);
      tl.fromTo("#b-vl",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},18.8);
      // envelopes enter together right as "A nonprofit runs the envelopes" lands (~20-22) — no empty panel.
      tl.fromTo("#env1",{opacity:0,y:30},{opacity:1,y:0,duration:0.6,ease:"back.out(1.5)"},20.0);
      tl.fromTo("#env2",{opacity:0,y:30},{opacity:1,y:0,duration:0.6,ease:"back.out(1.5)"},20.9);
      tl.fromTo("#env3",{opacity:0,y:30},{opacity:1,y:0,duration:0.6,ease:"back.out(1.5)"},21.8);
      // hold (~22.4-28.4): the full bank+envelopes diagram sits assembled before the naming
      // pulses begin at 28.4. Early swell-and-return on the group so it never freezes; returns
      // to scale 1 at 28.4 (pulses are on the envelope children; the 36.0 one-way breathing
      // starts from scale 1). 22.6->28.4 = 5.8s = 2 half-cycles of 2.9s.
      tl.to("#f-bank .grp",{scale:1.018,duration:2.9,yoyo:true,repeat:1,ease:"sine.inOut"},22.6);
      // "This one is the after-school program. This one is the building. This one is anything." (~28-37):
      // a gentle emphasis pulse on each envelope as it's named (finite yoyo, not repeat:-1).
      tl.to("#env1",{scale:1.07,duration:0.28,yoyo:true,repeat:1,ease:"sine.inOut"},28.4);
      tl.to("#env2",{scale:1.07,duration:0.28,yoyo:true,repeat:1,ease:"sine.inOut"},31.4);
      tl.to("#env3",{scale:1.07,duration:0.28,yoyo:true,repeat:1,ease:"sine.inOut"},34.4);
      // breathing so the diagram isn't static across its long holds
      tl.set("#f-bank .grp",{transformOrigin:"50% 50%"},0);
      // intro hold (~3.6-17.6): the centered bank sits alone until the slide at 18, so give it a
      // slow swell-and-return so the frame is never truly frozen. Returns to scale 1 before the
      // slide and before the 36.0 breathing (which starts from scale 1), so neither pops.
      tl.to("#f-bank .grp",{scale:1.02,duration:7.0,yoyo:true,repeat:1,ease:"sine.inOut"},3.6);
      tl.fromTo("#f-bank .grp",{scale:1},{scale:1.022,duration:8.0,ease:"sine.inOut"},36.0);
      // "The point isn't to make accounting harder. The point is accountability..." (~44-52)
      tl.to("#f-bank",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},44.0);
      tl.fromTo("#f-acct",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},44.4);
      tl.fromTo("#a-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},45.0);
      tl.fromTo("#a-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},46.0);
      // hold (~46.6-52.0): a-tag + a-sub sit alone before the closing line + breathing at 52.0.
      // Early swell-and-return; returns to scale 1 at 52.0 where the one-way ramp starts from
      // scale 1 (no pop). 46.8->52.0 = 5.2s = 2 half-cycles of 2.6s.
      tl.to("#f-acct .grp",{scale:1.025,duration:2.6,yoyo:true,repeat:1,ease:"sine.inOut"},46.8);
      // "Fund accounting is built to answer one thing. Can you prove every dollar..." (~52-58.88)
      tl.fromTo("#a-line",{opacity:0,y:22},{opacity:1,y:0,duration:0.8,ease:"power3.out"},52.0);
      tl.set("#f-acct .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-acct .grp",{scale:1},{scale:1.03,duration:(D+1.0)-52.0,ease:"sine.inOut"},52.0);`;
    return { body, timeline };
  },

  // 02 (54.6s) — Why nonprofits need it. A grant award tied with an "after-school
  // only" string, then a plain income statement stamped "Can't show this", then the
  // auditor's one question.
  "02": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-grant",
          open: true,
          children: `<div class="grp">
            <div id="g-tag" class="ptag">Most of the money comes with strings</div>
            <div class="doccard" id="award">
              <h4>Grant award</h4>
              <div class="meta">Funder gift: $50,000</div>
              <div class="ln m"></div><div class="ln"></div><div class="ln s"></div>
            </div>
            <div id="g-string" class="stringtag" style="opacity:0">restricted: after-school only</div>
          </div>`,
        })}
        ${slot({
          id: "f-pl",
          children: `<div class="grp">
            <div class="tworow">
              <div class="doccard" id="pl">
                <h4>Income statement</h4>
                <div class="row"><span>Money in</span><span class="v">$50,000</span></div>
                <div class="row"><span>Money out</span><span class="v">$50,000</span></div>
                <div class="row tot"><span>Net</span><span class="v">$0</span></div>
              </div>
              <div id="pl-stamp" class="stamp" style="opacity:0">Can't show the promise</div>
            </div>
            <div id="pl-sub" class="sub" style="opacity:0">A plain report shows money in and out, not whether you kept your word.</div>
          </div>`,
        })}
        ${slot({
          id: "f-audit",
          children: `<div class="grp">
            <div id="au-tag" class="ptag" style="opacity:0">What a funder or auditor checks</div>
            <div id="au-line" class="bigline" style="opacity:0">Did the restricted money pay for its <span class="em">restricted purpose?</span></div>
            <div id="au-sub" class="sub" style="opacity:0">Fund accounting is what makes that provable.</div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 2, chip: "Why nonprofits need it", num: "02", line: "Restricted money can only pay for the thing it was given for." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-grant .grp",{transformOrigin:"50% 50%"},0);
      // "Most of the money comes with strings. A funder gives you fifty thousand..." (~0-9)
      tl.fromTo("#award",{opacity:0,y:24},{opacity:1,y:0,duration:0.8,ease:"power3.out"},1.0);
      // pre-string hold (~1.8-9.0): the award card + g-tag sit alone until the string tag
      // arrives at 9.0, so give the group a slow swell-and-return so the frame never freezes.
      // Returns to scale 1 exactly at 10.0, where the one-way ramp below picks up from scale 1
      // (no pop). Span 2.0->10.0 = 8.0s = 2 half-cycles of 4.0s.
      tl.to("#f-grant .grp",{scale:1.025,duration:4.0,yoyo:true,repeat:1,ease:"sine.inOut"},2.0);
      // "...but only for the after-school program. That's called restricted money." (~9-15)
      tl.fromTo("#g-string",{opacity:0,y:-14,rotation:-3},{opacity:1,y:0,rotation:0,duration:0.6,ease:"back.out(1.6)"},9.0);
      tl.fromTo("#f-grant .grp",{scale:1},{scale:1.03,duration:9.0,ease:"sine.inOut"},10.0);
      // "A regular income statement... It can't show whether you kept those promises." (~19-29)
      tl.to("#f-grant",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},19.0);
      tl.fromTo("#f-pl",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},19.4);
      tl.fromTo("#pl",{opacity:0,y:22},{opacity:1,y:0,duration:0.7,ease:"power3.out"},20.0);
      tl.fromTo("#pl-stamp",{opacity:0,scale:1.3,rotation:-18,yPercent:-50},{opacity:1,scale:1,rotation:-9,yPercent:-50,duration:0.6,ease:"back.out(1.7)"},25.0);
      tl.fromTo("#pl-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},26.0);
      tl.set("#f-pl .grp",{transformOrigin:"50% 50%"},0);
      // ONE continuous swell-and-return across the entire f-pl visible span so neither the
      // pre-stamp hold (20.7->25.0) nor the post-stamp stretch freezes. Starts from scale 1 at
      // 20.7 (right after #pl settles) and returns to scale 1 exactly at the 40.2 fade.
      // Span 20.7->40.2 = 19.5s = 4 half-cycles of 4.875s. The stamp/sub entrances (25.0/26.0)
      // ride on top on their own transform channels.
      tl.to("#f-pl .grp",{scale:1.025,duration:4.875,yoyo:true,repeat:3,ease:"sine.inOut"},20.7);
      // "When a funder or an auditor reviews you, they look for one thing..." (~38-54.6)
      // Hold the income statement through the transitional "And that question does get asked"
      // (cue 47, ~local 38.5-40.7) so the body never sits sparse; hand off only when the
      // auditor setup line begins.
      tl.to("#f-pl",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},40.2);
      tl.fromTo("#f-audit",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},40.0);
      // Pill enters exactly as "...they look for one thing" is spoken (cue 48, ~local 40.7),
      // landing CENTERED (y:140) so it fills the vertical middle of the frame rather than
      // floating high above the space the hidden bigline reserves below it.
      tl.fromTo("#au-tag",{opacity:0,y:158},{opacity:1,y:140,duration:0.7,ease:"power3.out"},40.5);
      // As the question lands, the pill rises to its layout slot — one continuous motion that
      // ties the setup pill to the answer beneath it (no exit; it stays visible). The chip-only
      // window is ~3.7s (40.5->44.2), matched to the spoken setup, not a dead hold.
      tl.to("#au-tag",{y:0,duration:0.8,ease:"power2.inOut"},44.0);
      // "Did the restricted money pay for its restricted purpose?" cue 49 (local ~45.0)
      tl.fromTo("#au-line",{opacity:0,y:22},{opacity:1,y:0,duration:0.8,ease:"power3.out"},44.2);
      // "Fund accounting is what makes it provable." cue 51 (local ~51.8)
      tl.fromTo("#au-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},50.0);
      tl.set("#f-audit .grp",{transformOrigin:"50% 50%"},0);
      // breathing starts with the pill so the setup window has gentle life, not a static hold
      tl.fromTo("#f-audit .grp",{scale:1},{scale:1.03,duration:(D+1.0)-40.5,ease:"sine.inOut"},40.5);`;
    return { body, timeline };
  },

  // 03 (77.72s) — The building blocks. Two buckets (flexible / promised), then the
  // three->two collapse (old rule struck through), then the board-reserve trap.
  "03": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-buckets",
          open: true,
          children: `<div class="grp">
            <div id="bk-tag" class="ptag">Money sorts into two groups</div>
            <div class="bucketrow">
              <div class="bcol" id="bk-flex">
                <div class="bucket flex"><div class="fill"></div><div class="blabel">Free</div></div>
                <div class="bcap">Without donor restrictions<span class="mut">Flexible money: salaries, rent, the lights</span></div>
              </div>
              <div class="bcol" id="bk-prom">
                <div class="bucket promised"><div class="fill"></div><div class="blabel">Promised</div></div>
                <div class="bcap">With donor restrictions<span class="mut">Tied to a purpose or a time, like an endowment</span></div>
              </div>
            </div>
          </div>`,
        })}
        ${slot({
          id: "f-three",
          children: `<div class="grp">
            <div id="th-tag" class="ptag" style="opacity:0">Older guides list three. They're out of date.</div>
            <div class="oldrow">
              <div class="oldchip" id="o1" style="opacity:0">Unrestricted<div class="strike"></div></div>
              <div class="oldchip" id="o2" style="opacity:0">Temporarily restricted<div class="strike"></div></div>
              <div class="oldchip" id="o3" style="opacity:0">Permanently restricted<div class="strike"></div></div>
            </div>
            <div id="th-now" class="bigline" style="opacity:0;font-size:58px">Now there are <span class="em">two groups</span>, not three.</div>
            <div id="th-sub" class="sub" style="opacity:0">The rule changed for financial years starting after late 2017.</div>
          </div>`,
        })}
        ${slot({
          id: "f-trap",
          children: `<div class="grp">
            <div id="trap" class="trapcard" style="opacity:0">
              <div class="tk">One more trap</div>
              <div class="tt">Board "rainy day" savings is still flexible money, not restricted.</div>
              <div class="tx">The board can change its own mind later. Only an outside donor can truly restrict a gift.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 3, chip: "The building blocks", num: "03", line: "Free money and promised money. Two groups, not three." })}`;
    const timeline = `
      ${capIn}
      // "Money in a nonprofit gets sorted into two groups... free money and promised money." (~0-15)
      tl.fromTo("#bk-flex",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},2.0);
      tl.fromTo("#bk-flex .fill",{scaleY:0},{scaleY:1,duration:1.0,ease:"power2.out"},2.6);
      tl.fromTo("#bk-prom",{opacity:0,y:26},{opacity:1,y:0,duration:0.8,ease:"power3.out"},4.0);
      tl.fromTo("#bk-prom .fill",{scaleY:0},{scaleY:1,duration:1.0,ease:"power2.out"},4.6);
      // gentle breathing across the long bucket hold. The buckets settle by local ~5.6 and
      // don't fade until 40.0, so run a continuous swell-and-return (yoyo) across the whole
      // window instead of a one-way ramp that left the frame static on both ends (5.6-14 and
      // 32-40). 4 half-cycles of 8.5s = 34s span local 6.0->40.0, returning to scale 1 exactly
      // as the fade-out begins (no pop).
      tl.set("#f-buckets .grp",{transformOrigin:"50% 50%"},0);
      tl.to("#f-buckets .grp",{scale:1.025,duration:8.5,yoyo:true,repeat:3,ease:"sine.inOut"},6.0);
      // "If you've read older articles, you might have seen three groups..." (~40-62)
      tl.to("#f-buckets",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},40.0);
      tl.fromTo("#f-three",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},40.4);
      tl.fromTo("#th-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},41.0);
      tl.fromTo("#o1",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},42.0);
      tl.fromTo("#o2",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},42.7);
      tl.fromTo("#o3",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},43.4);
      // hold (~43.9-49.5): th-tag + the three old chips sit before the strikes begin at 49.5.
      // Early swell-and-return; returns to scale 1 at 49.5 (strikes/th-now/breathing below start
      // from scale 1). 44.1->49.5 = 5.4s = 2 half-cycles of 2.7s.
      tl.to("#f-three .grp",{scale:1.02,duration:2.7,yoyo:true,repeat:1,ease:"sine.inOut"},44.1);
      // "That was the old rule. The standards changed it to just two groups..." — strike the three.
      tl.fromTo("#o1 .strike",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},49.5);
      tl.fromTo("#o2 .strike",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},49.9);
      tl.fromTo("#o3 .strike",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},50.3);
      tl.fromTo("#th-now",{opacity:0,y:20},{opacity:1,y:0,duration:0.7,ease:"power3.out"},51.0);
      // "...for financial years that start after late twenty seventeen." (~53-58)
      tl.fromTo("#th-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},53.5);
      tl.set("#f-three .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-three .grp",{scale:1},{scale:1.02,duration:9.0,ease:"sine.inOut"},52.0);
      // "One more trap. Say your board sets aside money for a rainy day..." (~62-77.72)
      tl.to("#f-three",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},61.6);
      tl.fromTo("#f-trap",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},62.0);
      tl.fromTo("#trap",{opacity:0,y:24,scale:0.97},{opacity:1,y:0,scale:1,duration:0.8,ease:"back.out(1.3)"},62.4);
      tl.set("#f-trap .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-trap .grp",{scale:1},{scale:1.03,duration:(D+1.0)-63.4,ease:"sine.inOut"},63.4);`;
    return { body, timeline };
  },

  // 04 (63.84s) — A worked example. Two jars fill ($50k after-school / $30k general),
  // then a blocked borrow attempt (after-school -> rent, red line), then promise kept.
  "04": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-jars",
          open: true,
          children: `<div class="grp">
            <div id="org" class="orgnode">Your nonprofit: two pots this month</div>
            <div class="jarrow">
              <div class="jar promised" id="jar-as">
                <div class="glass"><div class="fill" style="height:65%"></div></div>
                <div class="lid"></div>
                <div class="amt" style="opacity:0" id="amt-as">$50,000</div>
                <div class="jname">After-school fund</div>
                <div class="jkind">restricted</div>
              </div>
              <div class="jar flex" id="jar-gen">
                <div class="glass"><div class="fill" style="height:39%"></div></div>
                <div class="lid"></div>
                <div class="amt" style="opacity:0" id="amt-gen">$30,000</div>
                <div class="jname">General fund</div>
                <div class="jkind">flexible</div>
              </div>
            </div>
          </div>`,
        })}
        ${slot({
          id: "f-borrow",
          children: `<div class="grp">
            <div id="bo-tag" class="ptag" style="opacity:0">Short on rent. Borrow from the grant?</div>
            <div class="borrowrow">
              <div class="node k-ochre" id="bo-as">After-school grant</div>
              <div class="dashwrap"><div class="dash" id="bo-dash" style="opacity:0"></div><div class="redbar" id="bo-bar" style="opacity:0"></div></div>
              <div class="node" id="bo-rent">Rent</div>
            </div>
            <div id="bo-no" class="noband" style="opacity:0">No. That money is promised</div>
          </div>`,
        })}
        ${slot({
          id: "f-kept",
          children: `<div class="grp">
            <div id="kept" class="keptcard" style="opacity:0">
              <div class="kt">A promise kept</div>
              <div class="kx">When the grant pays for the after-school program, that money is free and clear. Accountants call it "released from restriction."</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 4, chip: "A worked example", num: "04", line: "Two funds, two sets of rules, and a line you can't cross." })}`;
    const timeline = `
      ${capIn}
      // "Say a nonprofit gets two pots of money this month..." (~0-13)
      tl.fromTo("#org",{opacity:0,y:-16},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.6);
      // "A fifty-thousand-dollar grant, restricted to the after-school program." (~4-8)
      tl.fromTo("#jar-as",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},3.0);
      tl.fromTo("#jar-as .fill",{scaleY:0},{scaleY:1,duration:1.1,ease:"power2.out"},3.5);
      tl.fromTo("#amt-as",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},4.6);
      // "And thirty thousand in general donations, with no strings." (~8-13)
      tl.fromTo("#jar-gen",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},7.5);
      tl.fromTo("#jar-gen .fill",{scaleY:0},{scaleY:1,duration:1.1,ease:"power2.out"},8.0);
      tl.fromTo("#amt-gen",{opacity:0},{opacity:1,duration:0.5,ease:"power2.out"},9.0);
      tl.set("#f-jars .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-jars .grp",{scale:1},{scale:1.025,duration:14.0,ease:"sine.inOut"},12.0);
      // "Now say the office is short on rent. Can you borrow from the after-school grant?" (~26-34)
      tl.to("#f-jars",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},26.0);
      tl.fromTo("#f-borrow",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},26.4);
      tl.fromTo("#bo-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},27.0);
      tl.fromTo("#bo-as",{opacity:0,x:-20},{opacity:1,x:0,duration:0.6,ease:"power2.out"},28.0);
      tl.fromTo("#bo-rent",{opacity:0,x:20},{opacity:1,x:0,duration:0.6,ease:"power2.out"},28.5);
      tl.fromTo("#bo-dash",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.6,ease:"power2.out"},29.5);
      // "No. That money is promised. Spending it on rent would break the restriction." (~34-40)
      tl.fromTo("#bo-bar",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.7)"},34.0);
      tl.fromTo("#bo-no",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"back.out(1.5)"},34.6);
      tl.set("#f-borrow .grp",{transformOrigin:"50% 50%"},0);
      // swell-and-return (yoyo) so the breathing returns to scale 1 right at the 48.0 fade
      // instead of a one-way ramp ending at local 42 and freezing until 48.0 (30.0->48.0 = 18s).
      tl.to("#f-borrow .grp",{scale:1.025,duration:9.0,yoyo:true,repeat:1,ease:"sine.inOut"},30.0);
      // "Later, the after-school program spends its grant on the program. The promise is kept..." (~48-63.84)
      tl.to("#f-borrow",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},48.0);
      tl.fromTo("#f-kept",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},48.4);
      tl.fromTo("#kept",{opacity:0,y:24,scale:0.97},{opacity:1,y:0,scale:1,duration:0.8,ease:"back.out(1.3)"},48.8);
      tl.set("#f-kept .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-kept .grp",{scale:1},{scale:1.03,duration:(D+1.0)-49.8,ease:"sine.inOut"},49.8);`;
    return { body, timeline };
  },

  // 05 (51.32s) — How it differs from regular accounting. Business/Nonprofit contrast
  // table reveals row by row, then the GASB aside.
  "05": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-table",
          open: true,
          children: `<div class="grp">
            <div class="ctable">
              <div class="crow hrow">
                <div class="hcell biz">Business</div>
                <div class="arrow"></div>
                <div class="hcell npo">Nonprofit</div>
              </div>
              <div class="crow" id="row1">
                <div class="cell biz">Balance sheet</div>
                <div class="arrow" id="a1" style="opacity:0">&rarr;</div>
                <div class="cell npo" id="n1" style="opacity:0">Statement of financial position</div>
              </div>
              <div class="crow" id="row2">
                <div class="cell biz">Income statement</div>
                <div class="arrow" id="a2" style="opacity:0">&rarr;</div>
                <div class="cell npo" id="n2" style="opacity:0">Statement of activities</div>
              </div>
              <div class="crow" id="row3">
                <div class="cell biz">Owner's equity / profit</div>
                <div class="arrow" id="a3" style="opacity:0">&rarr;</div>
                <div class="cell npo" id="n3" style="opacity:0">Net assets</div>
              </div>
            </div>
            <div id="t-sub" class="sub" style="opacity:0">No owners to pay, so there's no profit line. Just net assets carried forward.</div>
          </div>`,
        })}
        ${slot({
          id: "f-gasb",
          children: `<div class="grp">
            <div id="gasb" class="asidecard" style="opacity:0">
              <div class="ak">One quick aside</div>
              <div class="at">Governments use fund accounting too, under a different rulebook, with their own kinds of funds. That's a separate world. This is about nonprofits.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 5, chip: "How it differs", num: "05", line: "Same ideas, new names, and net assets instead of profit." })}`;
    const timeline = `
      ${capIn}
      // Opener (cue 94 "Because the goal is different, the reports look different too.", local 0-4.4):
      // the full Business column + header build in, so the card is populated from the seam — no empty box.
      tl.fromTo("#f-table .hcell, #f-table .cell.biz",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out",stagger:0.12},0.3);
      // Each Nonprofit name + arrow reveals on its spoken counterpart (the audio<->image beat).
      // "A business has a balance sheet. A nonprofit has a statement of financial position." cues 95-96 (local 4.4-6.6)
      tl.fromTo("#a1, #n1",{opacity:0,x:18},{opacity:1,x:0,duration:0.6,ease:"power2.out",stagger:0.1},4.6);
      // "A business has an income statement. A nonprofit has a statement of activities..." cues 98-99 (local 11.5-14)
      tl.fromTo("#a2, #n2",{opacity:0,x:18},{opacity:1,x:0,duration:0.6,ease:"power2.out",stagger:0.1},11.7);
      // "And a business has owner's equity, or profit. A nonprofit has net assets." cues 100-101 (local 20.9-24)
      tl.fromTo("#a3, #n3",{opacity:0,x:18},{opacity:1,x:0,duration:0.6,ease:"power2.out",stagger:0.1},21.0);
      // "There are no owners to pay, so there is no profit line..." cue 102 (local ~26)
      tl.fromTo("#t-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},26.2);
      tl.set("#f-table .grp",{transformOrigin:"50% 50%"},0);
      // swell-and-return (yoyo) across the whole hold so the breathing returns to scale 1 right
      // at the 34.0 fade instead of a one-way ramp ending at local 20 (rows/sub keep building to
      // ~26.8, then it would freeze until 34.0). 4 half-cycles of 6.75s = 27s span local 7.0->34.0.
      tl.to("#f-table .grp",{scale:1.02,duration:6.75,yoyo:true,repeat:3,ease:"sine.inOut"},7.0);
      // "One quick aside... Governments use a version of fund accounting too..." (~34-51.32)
      tl.to("#f-table",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},34.0);
      tl.fromTo("#f-gasb",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},34.4);
      tl.fromTo("#gasb",{opacity:0,y:24,scale:0.97},{opacity:1,y:0,scale:1,duration:0.8,ease:"back.out(1.3)"},34.8);
      tl.set("#f-gasb .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-gasb .grp",{scale:1},{scale:1.03,duration:(D+1.0)-35.8,ease:"sine.inOut"},35.8);`;
    return { body, timeline };
  },

  // 06 (47.12s) — One idea to remember. Big recap line + three chips, then the
  // GrantPipe end card with the lead-magnet. FINAL chapter: fades out at the end.
  "06": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-recap",
          open: true,
          children: `<div class="grp">
            <div id="r-line" class="recapline">Track money by the <span class="em">promise</span> attached to it.</div>
            <div class="recaprow">
              <div class="rchip" id="rc1" style="opacity:0"><span class="dot"></span>Promised money in its own envelope</div>
              <div class="rchip" id="rc2" style="opacity:0"><span class="dot"></span>Flexible money where the mission needs it</div>
              <div class="rchip" id="rc3" style="opacity:0"><span class="dot"></span>Two groups, not three</div>
            </div>
          </div>`,
        })}
        ${slot({
          id: "f-end",
          children: `<div class="grp">
            <div id="end-mark" class="endmark" role="img" aria-label="GrantPipe" style="opacity:0"></div>
            <div id="end-head" class="endhead" style="opacity:0">Keep your promises.</div>
            <div id="end-card" class="endcard" style="opacity:0">
              <div class="ek">Free template</div>
              <div class="en">Restricted Fund Tracking Spreadsheet</div>
              <div class="es">It sets up the envelopes for you. We'll send it to your inbox.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 6, chip: "One idea to remember", num: "06", line: "Track money by the promise attached to it." })}`;
    // FINAL scene: exit animations ALLOWED here only (the closing fade).
    const timeline = `
      ${capIn}
      // "One idea sits under all the terms. Track money by the promise attached to it..." (~0-9)
      // The chips below stay hidden until their words (~9.7s), so the line opens vertically
      // CENTERED (y:150 cancels the empty chip-row space beneath it) instead of floating high
      // over a blank lower frame, then lifts to its layout slot as the chips arrive.
      tl.fromTo("#r-line",{scale:0.97,y:150},{scale:1,y:150,duration:0.7,ease:"power2.out"},0.4);
      // intro hold (~1.1-8.5): the recap line sits centered alone (chips still hidden) until
      // the lift at 8.5, so give it a slow swell-and-return so the frame is never frozen.
      // scale and the held y:150 are independent transform channels, so the line stays centered
      // while it breathes. Returns to scale 1 before the 8.5 lift (y only) and before the 14.0
      // .grp breathing (both start from scale 1), so neither pops.
      tl.to("#r-line",{scale:1.03,duration:3.7,yoyo:true,repeat:1,ease:"sine.inOut"},1.1);
      tl.to("#r-line",{y:0,duration:0.7,ease:"power2.inOut"},8.5);
      // "Promised money in its own envelope. Flexible money where the mission needs it. Two groups, not three." (~9-16)
      tl.fromTo("#rc1",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power2.out"},9.0);
      tl.fromTo("#rc2",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power2.out"},11.0);
      tl.fromTo("#rc3",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power2.out"},13.0);
      tl.set("#f-recap .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-recap .grp",{scale:1},{scale:1.025,duration:10.0,ease:"sine.inOut"},14.0);
      // "You don't need an army of accountants... we built GrantPipe to handle..." (~24-33)
      tl.to("#f-recap",{opacity:0,duration:0.8,ease:"power2.inOut",overwrite:"auto"},24.0);
      tl.fromTo("#f-end",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},24.6);
      tl.fromTo("#end-mark",{opacity:0,y:-14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},25.0);
      tl.fromTo("#end-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"power3.out"},25.6);
      tl.set("#f-end .grp",{transformOrigin:"50% 50%"},0);
      // mark+headline hold (~26.3-33.0): end-mark + "Keep your promises." sit alone until the
      // lead-magnet card arrives at 33.0, so breathe the group through that gap. Returns to
      // scale 1 exactly at 33.0 — where end-card enters and the one-way ramp below starts from
      // scale 1 (no pop). Span 26.3->33.0 = 6.7s = 2 half-cycles of 3.35s.
      tl.to("#f-end .grp",{scale:1.025,duration:3.35,yoyo:true,repeat:1,ease:"sine.inOut"},26.3);
      // "...the Restricted Fund Tracking Spreadsheet... We'll send it to your inbox." (~33-44)
      tl.fromTo("#end-card",{opacity:0,y:20,scale:0.96},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.4)"},33.0);
      tl.fromTo("#f-end .grp",{scale:1},{scale:1.03,duration:(D-1.1)-34.0,ease:"sine.inOut"},34.0);
      // final gentle fade-out (final scene only).
      tl.to(["#f-end","#cap","#chrome-wordmark","#chrome-kicker","#chrome-progress"],{opacity:0,duration:0.9,ease:"power2.in"},D-1.1);`;
    return { body, timeline };
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
  const html = doc({ id: `chapter-${ch.id}`, duration: dur, body, timeline: scene.timeline, kicker: KICKER });
  const out = resolve(COMP_DIR, `chapter-${ch.id}.html`);
  writeFileSync(out, html);
  count++;
  console.log(`wrote compositions/chapter-${ch.id}.html  (${dur}s)`);
}
console.log(`\n${count} compositions generated.`);
