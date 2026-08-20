// Generates compositions/chapter-XX.html for S4 "Uniform Guidance (2 CFR 200)
// Explained in Plain English", timed to the recorded audio durations.
//
// S4 is an SEO CONCEPT video — NO real-app capture. Every scene is a hand-built
// concept visual (title card, eight-circulars-into-one merge, a four-party chain,
// three-jobs panels, the reasonable/allocable/allowable cost gates, a direct-vs-
// indirect split, the four-number ledger ticking old -> new, the single-audit
// threshold line, recap + lead-magnet end card). Reuses the P/S chrome (doc +
// progress + caption + capIn) and the warm emerald/ochre paper brand.
//
// Motion model (mirrors S1/P2): chapters render as separate MP4s joined with a
// 0.35s cross-dissolve, so each chapter OPENS with its first frame already painted
// (open:true on the opening slot) and only the FINAL chapter (06) fades out. Each
// chapter's last visible frame keeps a gentle drift PAST data-duration so the seam
// never lands on a frozen/blank frame. Within a chapter, sub-frames cross-fade.
//
// Anti-freeze rule: any hold >= ~3.5s with no ongoing tween gets a swell-and-return
// yoyo that returns to scale 1 exactly at the next event (even half-cycle count).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doc, progress } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

const KICKER = "Uniform Guidance";

// ---- Concept CSS (added per-composition via a <style> in the body) ----
// Everything renders on solid warm paper — NO grid textures (brand rule).
const CONCEPT_CSS = `
.cslot{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:42px;padding:170px 130px 300px;text-align:center}
.cslot .grp{display:flex;flex-direction:column;align-items:center;gap:40px;width:100%}

.bigline{font-family:'Sora';font-weight:700;font-size:72px;line-height:1.08;letter-spacing:-1.4px;
  color:var(--ink);max-width:1480px}
.bigline .em{color:var(--emerald)}
.sub{font-family:'Plex';font-weight:500;font-size:34px;color:var(--muted);max-width:1200px;line-height:1.3}
.ptag{display:inline-block;font-family:'Mono';font-weight:500;font-size:24px;letter-spacing:1px;
  background:var(--ochre-50);color:#7a5410;border:1px solid var(--ochre-line);border-radius:999px;padding:11px 26px}

/* Title (ch00) */
.hero{font-family:'Sora';font-weight:700;font-size:120px;letter-spacing:-2.5px;color:var(--emerald);line-height:0.98}
.herosub{font-family:'Mono';font-weight:500;font-size:44px;letter-spacing:6px;color:var(--ink)}

/* Four-number teaser pills (ch00) */
.teaserhead{font-family:'Sora';font-weight:700;font-size:60px;letter-spacing:-1px;color:var(--ink)}
.tpillrow{display:flex;gap:28px;justify-content:center}
.tpill{width:170px;height:78px;border-radius:999px;background:var(--ochre-50);border:2px dashed var(--ochre-line);
  display:flex;align-items:center;justify-content:center;font-family:'Mono';font-weight:600;font-size:42px;color:#7a5410;
  box-shadow:var(--shadow)}
.year-stamp{font-family:'Sora';font-weight:700;font-size:30px;color:var(--ochre);
  background:var(--ochre-50);border:1px solid var(--ochre-line);border-radius:999px;padding:10px 28px}

/* Builder / generic note cards */
.notecard{background:var(--white);border:1px solid var(--line);border-left:6px solid var(--emerald);
  border-radius:18px;box-shadow:var(--shadow);padding:34px 44px;max-width:1180px;text-align:left}
.notecard .nk{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)}
.notecard .nt{font-family:'Sora';font-weight:600;font-size:40px;margin-top:12px;line-height:1.18;color:var(--ink)}
.asidecard{background:var(--white);border:1px solid var(--line);border-left:6px solid var(--ochre);
  border-radius:18px;box-shadow:var(--shadow);padding:34px 46px;max-width:1180px;text-align:left}
.asidecard .ak{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)}
.asidecard .at{font-family:'Sora';font-weight:600;font-size:40px;margin-top:12px;line-height:1.18;color:var(--ink)}

/* Eight circulars -> one book (ch01) */
.mergewrap{position:relative;width:1300px;height:300px;display:flex;align-items:center;justify-content:center}
.booklets{display:flex;gap:18px;flex-wrap:wrap;justify-content:center;max-width:760px}
.booklet{width:120px;height:96px;background:var(--white);border:2px solid var(--line2);border-left:8px solid var(--ochre);
  border-radius:8px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:center;
  font-family:'Mono';font-weight:500;font-size:22px;color:var(--muted)}
.bigbook{position:absolute;width:300px;height:230px;background:var(--white);border:3px solid var(--emerald);
  border-left:16px solid var(--emerald);border-radius:14px;box-shadow:var(--shadow);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.bigbook .bt{font-family:'Mono';font-weight:600;font-size:34px;color:var(--emerald)}
.bigbook .bn{font-family:'Sora';font-weight:700;font-size:28px;color:var(--ink)}

/* Four-party chain (ch01) */
.chain{display:flex;flex-direction:column;align-items:center;gap:0}
.cnode{background:var(--white);border:2px solid var(--line2);border-radius:14px;box-shadow:var(--shadow);
  padding:18px 34px;font-family:'Sora';font-weight:600;font-size:34px;color:var(--ink);min-width:560px}
.cnode .ck{display:block;font-family:'Mono';font-weight:500;font-size:19px;letter-spacing:2px;
  text-transform:uppercase;color:var(--ochre);margin-bottom:4px}
.cnode.you{border-color:var(--emerald);color:var(--emerald)}
.clink{width:4px;height:30px;background:var(--line2);border-radius:3px}

/* Three jobs (ch02) */
.jobrow{display:flex;gap:34px;justify-content:center;align-items:stretch}
.jobcard{width:380px;background:var(--white);border:1px solid var(--line);border-top:6px solid var(--emerald);
  border-radius:18px;box-shadow:var(--shadow);padding:32px 30px;text-align:left}
.jobcard .jn{font-family:'Mono';font-weight:500;font-size:22px;color:var(--ochre);letter-spacing:2px}
.jobcard .jt{font-family:'Sora';font-weight:700;font-size:46px;color:var(--ink);margin-top:8px;line-height:1.05}
.jobcard .jd{font-family:'Plex';font-weight:500;font-size:26px;color:var(--muted);margin-top:16px;line-height:1.3}
.recapchips{display:flex;gap:22px;justify-content:center}
.minichip{font-family:'Mono';font-weight:600;font-size:30px;color:var(--emerald);background:var(--emerald-50);
  border:1px solid #bfe0d2;border-radius:999px;padding:12px 28px}

/* Cost gates (ch03) */
.gaterow{display:flex;gap:30px;justify-content:center;align-items:stretch}
.gate{width:360px;background:var(--white);border:2px solid var(--line2);border-radius:18px;box-shadow:var(--shadow);
  padding:28px 26px;position:relative;text-align:left}
.gate .gname{font-family:'Sora';font-weight:700;font-size:42px;color:var(--muted)}
.gate .gdef{font-family:'Plex';font-weight:500;font-size:25px;color:var(--muted);margin-top:14px;line-height:1.28;min-height:108px}
.gate .gcheck{position:absolute;top:-20px;right:-16px;width:48px;height:48px;border-radius:999px;background:var(--emerald);
  color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Sora';font-weight:700;font-size:28px;
  box-shadow:var(--shadow)}
.redchip{display:inline-block;font-family:'Mono';font-weight:600;font-size:28px;color:#fff;background:var(--red);
  border-radius:999px;padding:12px 28px;box-shadow:var(--shadow)}

/* Direct vs indirect (ch03) */
.costrow{display:flex;gap:48px;justify-content:center;align-items:stretch}
.costcol{width:480px;background:var(--white);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);
  padding:30px 32px;text-align:left}
.costcol.direct{border-top:6px solid var(--emerald)}
.costcol.indirect{border-top:6px solid var(--ochre)}
.costcol .cct{font-family:'Sora';font-weight:700;font-size:40px;color:var(--ink)}
.costcol.direct .cct{color:var(--emerald)}
.costcol.indirect .cct{color:#7a5410}
.costcol .ccd{font-family:'Plex';font-weight:500;font-size:27px;color:var(--muted);margin-top:14px;line-height:1.3}
.ratepill{display:inline-block;font-family:'Mono';font-weight:600;font-size:30px;color:#7a5410;background:var(--ochre-50);
  border:1px solid var(--ochre-line);border-radius:999px;padding:12px 28px;box-shadow:var(--shadow)}

/* Four-number ledger (ch04) */
.ledger{width:1420px;background:var(--white);border-radius:20px;box-shadow:var(--shadow);border:1px solid var(--line);
  overflow:hidden}
.ledger .lhead{display:flex;align-items:center;justify-content:space-between;padding:24px 40px;
  background:var(--emerald-50);border-bottom:1px solid var(--line)}
.ledger .lhead .lt{font-family:'Sora';font-weight:700;font-size:42px;color:var(--emerald-d)}
.ledger .lhead .lcite{font-family:'Mono';font-weight:500;font-size:22px;color:var(--emerald)}
.nrow{display:grid;grid-template-columns:1fr auto;align-items:center;gap:30px;padding:26px 40px}
.nrow+.nrow{border-top:1px solid var(--line)}
.nlabel{font-family:'Plex';font-weight:600;font-size:36px;color:var(--ink);text-align:left}
.vals{display:flex;align-items:center;gap:24px;justify-content:flex-end}
.old{position:relative;font-family:'Mono';font-weight:500;font-size:38px;color:var(--muted)}
.old .strike{position:absolute;left:-4px;right:-4px;top:52%;height:4px;background:var(--red);border-radius:3px;
  transform:scaleX(0);transform-origin:0 50%}
.arr{font-family:'Mono';font-weight:500;font-size:34px;color:var(--ochre)}
.newv{font-family:'Mono';font-weight:600;font-size:44px;color:var(--emerald);white-space:nowrap}

/* Single audit (ch05) */
.grantcluster{display:flex;gap:20px;justify-content:center;flex-wrap:wrap;max-width:900px}
.gchip{font-family:'Mono';font-weight:500;font-size:28px;color:var(--ink);background:var(--white);
  border:2px solid var(--line2);border-radius:12px;padding:16px 26px;box-shadow:var(--shadow)}
.oneband{display:inline-flex;align-items:center;gap:14px;font-family:'Sora';font-weight:700;font-size:46px;color:#fff;
  background:var(--emerald);border-radius:999px;padding:16px 40px;box-shadow:var(--shadow)}
.strikeline{font-family:'Mono';font-weight:500;font-size:28px;color:var(--muted);position:relative}
.strikeline .strike{position:absolute;left:-6px;right:-6px;top:52%;height:4px;background:var(--red);border-radius:3px;
  transform:scaleX(0);transform-origin:0 50%}
.threshold{position:relative;width:1180px;height:430px}
.tline{position:absolute;left:0;right:0;top:150px;height:0;border-top:5px dashed var(--ochre)}
.tline .tlbl{position:absolute;left:0;top:-58px;z-index:6;font-family:'Mono';font-weight:600;font-size:30px;color:#7a5410;
  background:var(--ochre-50);border:1px solid var(--ochre-line);border-radius:999px;padding:8px 22px}
.tbar{position:absolute;bottom:60px;width:230px;border-radius:14px 14px 0 0;transform-origin:50% 100%}
.tbar .blab{position:absolute;left:0;right:0;bottom:-52px;text-align:center;font-family:'Plex';font-weight:600;
  font-size:26px;color:var(--ink)}
.tbar.small{left:300px;height:120px;background:var(--emerald-50);border:3px solid var(--emerald)}
.tbar.big{right:300px;height:330px;background:var(--red-50);border:3px solid var(--red)}
.tbar .redtag{position:absolute;top:-58px;left:50%;transform:translateX(-50%);font-family:'Mono';font-weight:600;
  font-size:26px;color:#fff;background:var(--red);border-radius:999px;padding:8px 22px;white-space:nowrap;box-shadow:var(--shadow)}
.auditchips{display:flex;flex-direction:column;gap:20px;align-items:center}
.achip{display:inline-flex;align-items:center;gap:18px;background:var(--white);border:1px solid var(--line);
  border-left:5px solid var(--emerald);border-radius:14px;box-shadow:var(--shadow);padding:20px 34px;
  font-family:'Plex';font-weight:600;font-size:34px;color:var(--ink);min-width:760px;text-align:left}
.achip .adot{width:14px;height:14px;border-radius:999px;background:var(--ochre);flex:0 0 auto}

/* Recap + end card (ch06) */
.recapline{font-family:'Sora';font-weight:700;font-size:66px;line-height:1.1;letter-spacing:-1.2px;
  color:var(--ink);max-width:1420px}
.recapline .em{color:var(--emerald)}
.recaprow{display:flex;flex-direction:column;gap:20px;align-items:center}
.rchip{display:inline-flex;align-items:center;gap:16px;background:var(--white);border:1px solid var(--line);
  border-left:5px solid var(--emerald);border-radius:14px;box-shadow:var(--shadow);padding:18px 30px;
  font-family:'Plex';font-weight:500;font-size:32px;color:var(--ink)}
.rchip .dot{width:14px;height:14px;border-radius:999px;background:var(--ochre);flex:0 0 auto}
.endmark{width:96px;height:96px;background:url('../assets/grantpipe-mark.svg') center/contain no-repeat}
.endhead{font-family:'Sora';font-weight:700;font-size:62px;letter-spacing:-1.2px;color:var(--ink)}
.endcard{background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);
  border-radius:18px;box-shadow:var(--shadow);padding:28px 44px;max-width:1060px}
.endcard .ek{font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)}
.endcard .en{font-family:'Sora';font-weight:600;font-size:42px;margin-top:10px;color:var(--ink)}
.endcard .es{font-family:'Plex';font-weight:500;font-size:28px;margin-top:12px;color:var(--muted)}
`;

// caption block (animatable: #cap is faded/slid in via capIn). Mirrors S1/P2.
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

// ---- Scene builders. Each returns {body, timeline}. DUR replaced per chapter. ----
const scenes = {
  // 00 (46.32s) — One rulebook for federal money. Title card, then a "four numbers
  // changed in 2024" teaser, then the builder note. Three sub-frames cross-fade.
  "00": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-title",
          open: true,
          children: `<div class="grp">
            <div id="t-hero" class="hero">Uniform Guidance</div>
            <div id="t-cfr" class="herosub" style="opacity:0">2 CFR 200</div>
            <div id="t-pill" class="ptag" style="opacity:0">Plain English &middot; about 7 minutes</div>
            <div id="t-sub" class="sub" style="opacity:0">Most people just hear the word "compliance" and tense up. It's calmer than it sounds.</div>
          </div>`,
        })}
        ${slot({
          id: "f-tease",
          children: `<div class="grp">
            <div id="te-head" class="teaserhead" style="opacity:0">Four numbers changed in 2024</div>
            <div class="tpillrow">
              <div class="tpill" id="tp1" style="opacity:0">?</div>
              <div class="tpill" id="tp2" style="opacity:0">?</div>
              <div class="tpill" id="tp3" style="opacity:0">?</div>
              <div class="tpill" id="tp4" style="opacity:0">?</div>
            </div>
            <div id="te-note" class="sub" style="opacity:0">A lot of advice online still uses the old ones. We'll use the new ones.</div>
          </div>`,
        })}
        ${slot({
          id: "f-builder",
          children: `<div class="grp">
            <div id="note" class="notecard" style="opacity:0">
              <div class="nk">Where I'm coming from</div>
              <div class="nt">I build grant compliance software. To build it, I had to learn exactly what these rules require. Not an auditor. Just the version a busy director needs.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 0, chip: "One rulebook", num: "00", line: "Take federal money and one rulebook covers all of it." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-title .grp",{transformOrigin:"50% 50%"},0);
      // "...one rulebook covers all of it. It's called the Uniform Guidance. The official name is 2 CFR 200." (0-10)
      tl.fromTo("#t-hero",{opacity:0,y:24,scale:0.97},{opacity:1,y:0,scale:1,duration:0.9,ease:"power3.out"},0.5);
      tl.fromTo("#t-cfr",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"power2.out"},7.1);
      // "Most people never read it. They just hear the word compliance and tense up." (10.1-15.3)
      tl.fromTo("#t-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.7,ease:"power2.out"},10.6);
      // "Plain English, about seven minutes, no lawyer-speak." (18.1-21.8)
      tl.fromTo("#t-pill",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"back.out(1.4)"},18.1);
      // breathing across the title hold; returns to scale 1 at the 22.8 fade (1.5->22.8 = 21.3s,
      // 6 half-cycles of 3.55s).
      tl.to("#f-title .grp",{scale:1.02,duration:3.55,yoyo:true,repeat:5,ease:"sine.inOut"},1.5);
      // "And I'll show you the four numbers that changed in 2024..." (21.8-29.9)
      tl.to("#f-title",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},22.8);
      tl.fromTo("#f-tease",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},23.2);
      tl.fromTo("#te-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power3.out"},23.4);
      tl.fromTo("#tp1",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.6)"},24.0);
      tl.fromTo("#tp2",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.6)"},24.4);
      tl.fromTo("#tp3",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.6)"},24.8);
      tl.fromTo("#tp4",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.6)"},25.2);
      // "A lot of advice online still uses the old ones." (26.6-29.9)
      tl.fromTo("#te-note",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},26.6);
      tl.set("#f-tease .grp",{transformOrigin:"50% 50%"},0);
      // hold 25.6->29.4 (3.8s): swell-and-return, returns to scale 1 at the 29.4 fade.
      tl.to("#f-tease .grp",{scale:1.022,duration:1.9,yoyo:true,repeat:1,ease:"sine.inOut"},25.6);
      // "Quick note on where I'm coming from. I build grant compliance software..." (29.9-46.3)
      tl.to("#f-tease",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},29.4);
      tl.fromTo("#f-builder",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},29.8);
      tl.fromTo("#note",{opacity:0,y:24,scale:0.97},{opacity:1,y:0,scale:1,duration:0.8,ease:"back.out(1.3)"},30.2);
      tl.set("#f-builder .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-builder .grp",{scale:1},{scale:1.03,duration:(D+1.0)-31.2,ease:"sine.inOut"},31.2);`;
    return { body, timeline };
  },

  // 01 (45.88s) — What the Uniform Guidance is. One-rulebook line, then eight
  // circulars merge into one book, then the four-party chain.
  "01": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-what",
          open: true,
          children: `<div class="grp">
            <div id="w-line" class="bigline">One rulebook for <span class="em">federal grants</span>.</div>
            <div id="w-pill" class="ptag" style="opacity:0">Written by the federal budget office (OMB)</div>
            <div id="w-sub" class="sub" style="opacity:0">It covers grants and the agreements that come with them.</div>
          </div>`,
        })}
        ${slot({
          id: "f-merge",
          children: `<div class="grp">
            <div id="m-tag" class="ptag" style="opacity:0">Back in 2013, the rules were a mess</div>
            <div class="mergewrap">
              <div class="booklets" id="m-booklets">
                <div class="booklet">A-21</div><div class="booklet">A-87</div>
                <div class="booklet">A-110</div><div class="booklet">A-122</div>
                <div class="booklet">A-89</div><div class="booklet">A-102</div>
                <div class="booklet">A-133</div><div class="booklet">A-50</div>
              </div>
              <div class="bigbook" id="m-book" style="opacity:0">
                <div class="bt">2 CFR 200</div><div class="bn">The "Super Circular"</div>
              </div>
            </div>
            <div id="m-sub" class="sub" style="opacity:0">Eight separate rulebooks, pulled into one. It took effect in 2014.</div>
          </div>`,
        })}
        ${slot({
          id: "f-binds",
          children: `<div class="grp">
            <div id="bd-tag" class="ptag" style="opacity:0">Same rulebook, top to bottom</div>
            <div class="chain">
              <div class="cnode" id="cn1" style="opacity:0"><span class="ck">Gives the money</span>Federal agency</div>
              <div class="clink" id="cl1" style="opacity:0"></div>
              <div class="cnode" id="cn2" style="opacity:0"><span class="ck">Passes it down</span>A state or other pass-through</div>
              <div class="clink" id="cl2" style="opacity:0"></div>
              <div class="cnode you" id="cn3" style="opacity:0"><span class="ck">Receives it</span>You, the nonprofit</div>
              <div class="clink" id="cl3" style="opacity:0"></div>
              <div class="cnode" id="cn4" style="opacity:0"><span class="ck">Gets it next</span>Anyone you subaward to</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 1, chip: "What it is", num: "01", line: "Eight old circulars, pulled into one Super Circular." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-what .grp",{transformOrigin:"50% 50%"},0);
      // "So what is it? The Uniform Guidance is one rulebook for federal grants." (0-4.7)
      tl.fromTo("#w-line",{opacity:0,y:22},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.6);
      // "The federal budget office, called OMB, wrote it." (4.7-8.1)
      tl.fromTo("#w-pill",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"back.out(1.4)"},4.9);
      // "It covers grants and the agreements that come with them." (8.1-11.9)
      tl.fromTo("#w-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},8.3);
      // hold 9.0->11.9 (2.9s) before the fade — short swell-and-return.
      tl.to("#f-what .grp",{scale:1.02,duration:1.45,yoyo:true,repeat:1,ease:"sine.inOut"},9.0);
      // "Back in 2013, the rules were a mess. There were eight separate rulebooks." (11.9-17.5)
      tl.to("#f-what",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},11.9);
      tl.fromTo("#f-merge",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},12.3);
      tl.fromTo("#m-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},12.5);
      tl.fromTo("#m-booklets .booklet",{opacity:0,y:18,scale:0.85},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.4)",stagger:0.12},14.0);
      // booklets settle ~15.3s, collapse at 22.0s — gentle breath keeps the 8-booklet hold alive; returns to scale 1 by 21.92.
      tl.set("#m-booklets",{transformOrigin:"50% 50%"},14.0);
      tl.to("#m-booklets",{scale:1.018,duration:1.58,yoyo:true,repeat:3,overwrite:"auto",ease:"sine.inOut"},15.6);
      // "The Uniform Guidance pulled all eight into one." (22.4-25.6): booklets collapse to center,
      // the one big book appears.
      tl.to("#m-booklets",{opacity:0,scale:0.5,duration:0.8,ease:"power2.in"},22.0);
      tl.fromTo("#m-book",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:0.8,ease:"back.out(1.5)"},22.6);
      // "People nicknamed it the Super Circular. It took effect in 2014." (25.6-30.5)
      tl.fromTo("#m-sub",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},28.2);
      tl.set("#f-merge .grp",{transformOrigin:"50% 50%"},0);
      // hold around the settled book 23.4->30.5 (7.1s) — swell-and-return, returns to 1 at 30.5.
      tl.to("#m-book",{scale:1.04,duration:1.775,yoyo:true,repeat:3,overwrite:"auto",ease:"sine.inOut"},23.4);
      // "And it doesn't just bind you. It binds the federal agency..." (30.5-45.9)
      tl.to("#f-merge",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},30.5);
      tl.fromTo("#f-binds",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},30.9);
      tl.fromTo("#bd-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},31.0);
      // chain reveals top->bottom on the spoken parties.
      tl.fromTo("#cn1",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},32.5);
      tl.fromTo("#cl1",{opacity:0,scaleY:0},{opacity:1,scaleY:1,duration:0.3,ease:"power2.out"},33.2);
      tl.fromTo("#cn2",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},35.8);
      tl.fromTo("#cl2",{opacity:0,scaleY:0},{opacity:1,scaleY:1,duration:0.3,ease:"power2.out"},36.5);
      tl.fromTo("#cn3",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.3)"},40.0);
      tl.fromTo("#cl3",{opacity:0,scaleY:0},{opacity:1,scaleY:1,duration:0.3,ease:"power2.out"},40.7);
      tl.fromTo("#cn4",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},42.0);
      tl.set("#f-binds .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#f-binds .grp",{scale:1},{scale:1.02,duration:(D+1.0)-43.0,ease:"sine.inOut"},43.0);`;
    return { body, timeline };
  },

  // 02 (34.52s) — One rulebook, three jobs. Three panels reveal on their beats, then
  // the "run it, cost it, prove it" recap chips.
  "02": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-jobs",
          open: true,
          children: `<div class="grp">
            <div id="j-tag" class="ptag">The rulebook is long. You live in three parts.</div>
            <div class="jobrow">
              <div class="jobcard" id="job1" style="opacity:0"><div class="jn">PART ONE</div><div class="jt">Run it</div><div class="jd">How you buy things, keep records, and report.</div></div>
              <div class="jobcard" id="job2" style="opacity:0"><div class="jn">PART TWO</div><div class="jt">Cost it</div><div class="jd">What you're allowed to charge to the grant.</div></div>
              <div class="jobcard" id="job3" style="opacity:0"><div class="jn">PART THREE</div><div class="jt">Prove it</div><div class="jd">Who checks your work. That's the audit.</div></div>
            </div>
            <div class="recapchips" id="j-recap" style="opacity:0">
              <div class="minichip">Run it</div><div class="minichip">Cost it</div><div class="minichip">Prove it</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 2, chip: "Three jobs", num: "02", line: "Run the grant, charge it right, prove it in an audit." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-jobs .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#j-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.5);
      // "The first part is how you run the grant..." (4.5-12.6)
      tl.fromTo("#job1",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},4.8);
      // "The second part is what you're allowed to charge..." (12.6-20.9)
      tl.fromTo("#job2",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},12.8);
      // "The third part is who checks your work. That's the audit." (20.9-26.9)
      tl.fromTo("#job3",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power3.out"},21.0);
      // gentle group breathing across the staged reveals (continuous motion, returns to 1 at 26.9).
      // breathing spans the FULL hold 1.5->29.0 (27.5s, 8 even half-cycles x 3.4375s) so the
      // ~7s gap between job2 (12.8) and job3 (21.0) and the gap before j-recap (26.9) never freeze;
      // returns to scale 1 exactly at the 29.0 trailing-drift handoff.
      tl.to("#f-jobs .grp",{scale:1.012,duration:3.4375,yoyo:true,repeat:7,overwrite:"auto",ease:"sine.inOut"},1.5);
      // "Run it, cost it, prove it." (26.9-28.8)
      tl.fromTo("#j-recap",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"back.out(1.3)"},26.9);
      // emphasis pulse per chip as the three words land.
      tl.to("#j-recap .minichip:nth-child(1)",{scale:1.08,duration:0.2,yoyo:true,repeat:1,ease:"sine.inOut"},27.0);
      tl.to("#j-recap .minichip:nth-child(2)",{scale:1.08,duration:0.2,yoyo:true,repeat:1,ease:"sine.inOut"},27.5);
      tl.to("#j-recap .minichip:nth-child(3)",{scale:1.08,duration:0.2,yoyo:true,repeat:1,ease:"sine.inOut"},28.0);
      tl.fromTo("#f-jobs .grp",{scale:1},{scale:1.02,duration:(D+1.0)-29.0,ease:"sine.inOut"},29.0);`;
    return { body, timeline };
  },

  // 03 (50.64s) — The cost test. Three gates (reasonable/allocable/allowable) light up
  // and define themselves, then a direct-vs-indirect split with the indirect-rate tease.
  "03": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-gates",
          open: true,
          children: `<div class="grp">
            <div id="ga-tag" class="ptag">Every dollar has to pass three words</div>
            <div class="gaterow">
              <div class="gate" id="g1"><div class="gname">Reasonable</div><div class="gdef" id="gd1" style="opacity:0">A careful person would spend about that much.</div><div class="gcheck" id="gc1" style="opacity:0">&check;</div></div>
              <div class="gate" id="g2"><div class="gname">Allocable</div><div class="gdef" id="gd2" style="opacity:0">It really belongs to this grant, not some other program.</div><div class="gcheck" id="gc2" style="opacity:0">&check;</div></div>
              <div class="gate" id="g3"><div class="gname">Allowable</div><div class="gdef" id="gd3" style="opacity:0">The rules don't forbid it. Alcohol and lobbying are out.</div><div class="gcheck" id="gc3" style="opacity:0">&check;</div></div>
            </div>
            <div id="ga-red" class="redchip" style="opacity:0">Off-limits: alcohol, lobbying</div>
          </div>`,
        })}
        ${slot({
          id: "f-cost",
          children: `<div class="grp">
            <div id="co-tag" class="ptag" style="opacity:0">Two kinds of cost</div>
            <div class="costrow">
              <div class="costcol direct" id="co-d" style="opacity:0"><div class="cct">Direct</div><div class="ccd">Tied to one project. Like a program staffer's pay.</div></div>
              <div class="costcol indirect" id="co-i" style="opacity:0"><div class="cct">Indirect</div><div class="ccd">Keeps the whole place running. Like rent and bookkeeping.</div></div>
            </div>
            <div id="co-rate" class="ratepill" style="opacity:0">You recover indirect costs with an indirect rate, and that rate just changed</div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 3, chip: "The cost test", num: "03", line: "Every dollar must be reasonable, allocable, and allowable." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-gates .grp",{transformOrigin:"50% 50%"},0);
      tl.fromTo("#ga-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.5);
      // gates appear during the "has to pass three words" setup (4.6-9.6)
      tl.fromTo("#g1",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power3.out"},4.8);
      tl.fromTo("#g2",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power3.out"},5.4);
      tl.fromTo("#g3",{opacity:0,y:22},{opacity:1,y:0,duration:0.6,ease:"power3.out"},6.0);
      // "Reasonable. Allocable. Allowable." (9.6-11.8): light each gate as it's named.
      tl.to("#g1",{borderColor:"#065f46",duration:0.3},9.6);
      tl.to("#g1 .gname",{color:"#065f46",duration:0.3},9.6);
      tl.fromTo("#gc1",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.7)"},9.7);
      tl.to("#g2",{borderColor:"#065f46",duration:0.3},10.4);
      tl.to("#g2 .gname",{color:"#065f46",duration:0.3},10.4);
      tl.fromTo("#gc2",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.7)"},10.5);
      tl.to("#g3",{borderColor:"#065f46",duration:0.3},11.1);
      tl.to("#g3 .gname",{color:"#065f46",duration:0.3},11.1);
      tl.fromTo("#gc3",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.7)"},11.2);
      // definitions reveal under each gate as spoken (11.8 / 16.1 / 21.6)
      tl.fromTo("#gd1",{opacity:0,y:10},{opacity:1,y:0,duration:0.5,ease:"power2.out"},11.9);
      tl.fromTo("#gd2",{opacity:0,y:10},{opacity:1,y:0,duration:0.5,ease:"power2.out"},16.1);
      tl.fromTo("#gd3",{opacity:0,y:10},{opacity:1,y:0,duration:0.5,ease:"power2.out"},21.6);
      // "Some things, like alcohol or lobbying, are simply out." (24.5-28.3)
      tl.fromTo("#ga-red",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},24.6);
      // breathing across the definition holds; returns to 1 at the 28.3 handoff (12.5->28.3 = 15.8s).
      tl.to("#f-gates .grp",{scale:1.014,duration:3.95,yoyo:true,repeat:3,ease:"sine.inOut"},12.5);
      // "There are two kinds of cost. Direct... Indirect..." (28.3-40.1)
      tl.to("#f-gates",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},28.3);
      tl.fromTo("#f-cost",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},28.7);
      tl.fromTo("#co-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},28.9);
      tl.fromTo("#co-d",{opacity:0,x:-22},{opacity:1,x:0,duration:0.7,ease:"power3.out"},30.2);
      tl.fromTo("#co-i",{opacity:0,x:22},{opacity:1,x:0,duration:0.7,ease:"power3.out"},35.1);
      // "...recover them with an indirect rate. Hold that thought. ...just changed." (42.4-50.6)
      tl.fromTo("#co-rate",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"back.out(1.3)"},42.4);
      tl.set("#f-cost .grp",{transformOrigin:"50% 50%"},0);
      // hold 31.2->42.4 between the two columns and the rate pill — swell-and-return (11.2s, 4 half-cycles 2.8s).
      tl.to("#f-cost .grp",{scale:1.016,duration:2.8,yoyo:true,repeat:3,ease:"sine.inOut"},31.2);
      tl.fromTo("#f-cost .grp",{scale:1},{scale:1.025,duration:(D+1.0)-43.4,ease:"sine.inOut"},43.4);`;
    return { body, timeline };
  },

  // 04 (68.52s) — The four numbers that changed in 2024. A ledger fills its four row
  // labels (with old values) during the intro, then each row ticks old -> new on its beat.
  "04": () => {
    const row = (i, label, oldv, newv) =>
      `<div class="nrow" id="nr${i}" style="opacity:0">
        <span class="nlabel">${label}</span>
        <span class="vals"><span class="old" id="o${i}">${oldv}<span class="strike" id="s${i}"></span></span><span class="arr">&rarr;</span><span class="newv" id="nw${i}" style="opacity:0">${newv}</span></span>
      </div>`;
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-led",
          open: true,
          children: `<div class="grp">
            <div class="ledger">
              <div class="lhead"><div class="lt" id="l-head" style="opacity:0">What changed in 2024</div><div class="lcite" id="l-cite" style="opacity:0">2 CFR 200 &middot; 2024 OMB revision</div></div>
              ${row(1, "De minimis indirect rate", "10%", "up to 15%")}
              ${row(2, "Equipment threshold", "$5,000", "$10,000")}
              ${row(3, "Subaward counted in your base", "$25,000", "$50,000")}
              ${row(4, "Single audit threshold", "$750,000", "$1,000,000")}
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 4, chip: "What changed in 2024", num: "04", line: "Four numbers moved up, all in your favor." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-led .grp",{transformOrigin:"50% 50%"},0);
      // "In 2024, OMB rewrote the rulebook... raised a bunch of thresholds." (0-7)
      tl.fromTo("#l-head",{opacity:0,y:12},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.8);
      // "Most of them kick in for awards given out on or after October 1, 2024." (7-12.9)
      tl.fromTo("#l-cite",{opacity:0,x:14},{opacity:1,x:0,duration:0.6,ease:"power2.out"},7.0);
      // rows fill in (labels + old values) during the intro so the ledger isn't empty.
      tl.fromTo("#nr1",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},2.6);
      tl.fromTo("#nr2",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},4.6);
      tl.fromTo("#nr3",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},9.0);
      tl.fromTo("#nr4",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},11.5);
      // hold 13.0->22.0 (9s) before tick 1 — swell-and-return (4.5s, 2 half-cycles).
      tl.to("#f-led .grp",{scale:1.012,duration:4.5,yoyo:true,repeat:1,ease:"sine.inOut"},13.0);
      // #1 de minimis: "...up to fifteen percent. It used to be ten." (15.8-23.9)
      tl.fromTo("#s1",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},22.0);
      tl.fromTo("#nw1",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},22.7);
      // hold 23.9->34.5 (10.6s) before tick 2 — swell-and-return (5.3s, 2 half-cycles).
      tl.to("#f-led .grp",{scale:1.012,duration:5.3,yoyo:true,repeat:1,ease:"sine.inOut"},23.9);
      // #2 equipment: "...went from five thousand dollars to ten thousand." (29.3-35.1)
      tl.fromTo("#s2",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},34.5);
      tl.fromTo("#nw2",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},35.1);
      // hold 35.6->53.5 (17.9s) before tick 3 — swell-and-return (4.475s, 4 half-cycles).
      tl.to("#f-led .grp",{scale:1.012,duration:4.475,yoyo:true,repeat:3,ease:"sine.inOut"},35.6);
      // #3 subaward: "...the first fifty thousand dollars... used to be only twenty-five thousand." (46.0-56.8)
      tl.fromTo("#s3",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},53.5);
      tl.fromTo("#nw3",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.5,ease:"back.out(1.6)"},54.1);
      // hold 56.8->67.0 (10.2s) before tick 4 — swell-and-return (5.1s, 2 half-cycles).
      tl.to("#f-led .grp",{scale:1.012,duration:5.1,yoyo:true,repeat:1,ease:"sine.inOut"},56.8);
      // #4 single audit: "...went from seven hundred fifty thousand dollars to one million." (62.5-68.5)
      tl.fromTo("#s4",{scaleX:0},{scaleX:1,duration:0.4,ease:"power2.out"},66.8);
      tl.fromTo("#nw4",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.6)"},67.4);
      // final drift past render-end so the seam frame stays alive.
      tl.fromTo("#f-led .grp",{scale:1},{scale:1.02,duration:(D+1.0)-67.8,ease:"sine.inOut"},67.8);`;
    return { body, timeline };
  },

  // 05 (50s) — The single audit. One-audit-not-per-grant, then the $1M threshold line,
  // then how it's done (CPA / standards / federal database) + the threshold-jump note.
  "05": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-def",
          open: true,
          children: `<div class="grp">
            <div id="d-band" class="oneband" style="opacity:0">One audit &middot; your whole organization</div>
            <div class="grantcluster" id="d-grants">
              <div class="gchip" id="dg1" style="opacity:0">Grant A</div>
              <div class="gchip" id="dg2" style="opacity:0">Grant B</div>
              <div class="gchip" id="dg3" style="opacity:0">Grant C</div>
              <div class="gchip" id="dg4" style="opacity:0">Grant D</div>
            </div>
            <div id="d-strike" class="strikeline" style="opacity:0">not a separate audit of each grant<span class="strike" id="d-sx"></span></div>
          </div>`,
        })}
        ${slot({
          id: "f-thr",
          children: `<div class="grp">
            <div class="threshold">
              <div class="tline" id="th-line" style="opacity:0"><span class="tlbl">$1,000,000 spent in a year</span></div>
              <div class="tbar small" id="th-small" style="opacity:0"><div class="blab">Smaller org</div></div>
              <div class="tbar big" id="th-big" style="opacity:0"><div class="redtag" id="th-tag" style="opacity:0">single audit</div><div class="blab">Larger org</div></div>
            </div>
            <div id="th-spend" class="ptag" style="opacity:0">It's what you spend, not what you were promised</div>
            <div id="th-fy" class="sub" style="opacity:0">For fiscal years that start on or after October 1, 2024.</div>
          </div>`,
        })}
        ${slot({
          id: "f-how",
          children: `<div class="grp">
            <div class="auditchips">
              <div class="achip" id="ac1" style="opacity:0"><span class="adot"></span>Done by an independent CPA</div>
              <div class="achip" id="ac2" style="opacity:0"><span class="adot"></span>Under the government's audit standards</div>
              <div class="achip" id="ac3" style="opacity:0"><span class="adot"></span>Filed in a federal database</div>
            </div>
            <div id="hw-note" class="asidecard" style="opacity:0">
              <div class="ak">Why the jump matters</div>
              <div class="at">The line moved up to $1,000,000. So some smaller groups that used to need one don't anymore.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 5, chip: "The single audit", num: "05", line: "One org-wide audit, triggered at $1M federal money spent." })}`;
    const timeline = `
      ${capIn}
      tl.set("#f-def .grp",{transformOrigin:"50% 50%"},0);
      // "...one outside audit of your whole group, not a separate audit of each grant." (0-9.7)
      tl.fromTo("#dg1",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"power2.out"},0.8);
      tl.fromTo("#dg2",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"power2.out"},1.2);
      tl.fromTo("#dg3",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"power2.out"},1.6);
      tl.fromTo("#dg4",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"power2.out"},2.0);
      tl.fromTo("#d-band",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.5)"},3.2);
      tl.fromTo("#d-strike",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},5.0);
      tl.fromTo("#d-sx",{scaleX:0},{scaleX:1,duration:0.5,ease:"power2.out"},6.0);
      // hold 6.6->9.7 (3.1s) short swell-and-return.
      tl.to("#f-def .grp",{scale:1.018,duration:1.55,yoyo:true,repeat:1,ease:"sine.inOut"},6.6);
      // "Here's the trigger. If you spend $1M or more... you need one." (9.7-17.2)
      tl.to("#f-def",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},9.7);
      tl.fromTo("#f-thr",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},10.1);
      tl.fromTo("#th-line",{opacity:0,scaleX:0.6},{opacity:1,scaleX:1,duration:0.7,ease:"power2.out"},10.6);
      tl.fromTo("#th-small",{opacity:0,scaleY:0},{opacity:1,scaleY:1,duration:0.7,ease:"power3.out"},11.6);
      tl.fromTo("#th-big",{opacity:0,scaleY:0},{opacity:1,scaleY:1,duration:0.8,ease:"power3.out"},13.0);
      tl.fromTo("#th-tag",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"back.out(1.6)"},14.0);
      // "Notice the word spend... not what you were promised." (17.2-23.8)
      tl.fromTo("#th-spend",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"back.out(1.3)"},18.0);
      // "This one follows your fiscal year... start on or after October 1, 2024." (23.8-32.0)
      tl.fromTo("#th-fy",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},24.2);
      tl.set("#f-thr .grp",{transformOrigin:"50% 50%"},0);
      // hold across the threshold explanation; returns to 1 at the 32.0 handoff (15.0->32.0 = 17s).
      tl.to("#f-thr .grp",{scale:1.012,duration:4.25,yoyo:true,repeat:3,ease:"sine.inOut"},15.0);
      // "A single audit has to be done by an independent CPA..." (32.0-41.8)
      tl.to("#f-thr",{opacity:0,duration:0.6,ease:"power2.inOut",overwrite:"auto"},32.0);
      tl.fromTo("#f-how",{opacity:0},{opacity:1,duration:0.6,ease:"power2.out"},32.4);
      tl.fromTo("#ac1",{opacity:0,x:-22},{opacity:1,x:0,duration:0.6,ease:"power2.out"},32.6);
      tl.fromTo("#ac2",{opacity:0,x:-22},{opacity:1,x:0,duration:0.6,ease:"power2.out"},36.0);
      tl.fromTo("#ac3",{opacity:0,x:-22},{opacity:1,x:0,duration:0.6,ease:"power2.out"},39.0);
      // "The line moved up to one million. So some smaller groups... don't anymore." (43.6-50.0)
      tl.fromTo("#hw-note",{opacity:0,y:18,scale:0.97},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.3)"},43.6);
      tl.set("#f-how .grp",{transformOrigin:"50% 50%"},0);
      // hold 39.6->43.6 (4s) swell-and-return before the note.
      tl.to("#f-how .grp",{scale:1.012,duration:2.0,yoyo:true,repeat:1,ease:"sine.inOut"},39.6);
      tl.fromTo("#f-how .grp",{scale:1},{scale:1.022,duration:(D+1.0)-44.6,ease:"sine.inOut"},44.6);`;
    return { body, timeline };
  },

  // 06 (41.88s) — What to remember. Recap line + three chips, then the GrantPipe end
  // card with the Grant Compliance Checklist lead magnet. FINAL chapter: fades out.
  "06": () => {
    const body = `
      <style>${CONCEPT_CSS}</style>
      <div class="stage" style="gap:0">
        ${slot({
          id: "f-recap",
          open: true,
          children: `<div class="grp">
            <div id="r-line" class="recapline">One rulebook. Three jobs. <span class="em">Numbers moved up in 2024.</span></div>
            <div class="recaprow">
              <div class="rchip" id="rc1" style="opacity:0"><span class="dot"></span>Run the grant</div>
              <div class="rchip" id="rc2" style="opacity:0"><span class="dot"></span>Charge it right</div>
              <div class="rchip" id="rc3" style="opacity:0"><span class="dot"></span>Prove it in the audit</div>
            </div>
          </div>`,
        })}
        ${slot({
          id: "f-end",
          children: `<div class="grp">
            <div id="end-mark" class="endmark" role="img" aria-label="GrantPipe" style="opacity:0"></div>
            <div id="end-head" class="endhead" style="opacity:0">Start with what you know.</div>
            <div id="end-card" class="endcard" style="opacity:0">
              <div class="ek">Free checklist</div>
              <div class="en">Grant Compliance Checklist</div>
              <div class="es">It walks the basics so nothing slips. We'll send it to your inbox.</div>
            </div>
          </div>`,
        })}
      </div>
      ${caption({ idx: 6, chip: "What to remember", num: "06", line: "One rulebook. Three jobs. Numbers moved up in 2024." })}`;
    // FINAL scene: exit animations ALLOWED here only (the closing fade).
    const timeline = `
      ${capIn}
      // "So that's the Uniform Guidance. One rulebook... Three jobs." (0-4.9): line opens centered
      // (y:140 cancels the empty chip-row space) then lifts as the chips arrive.
      tl.fromTo("#r-line",{scale:0.97,y:140},{scale:1,y:140,duration:0.8,ease:"power2.out"},0.4);
      // intro hold 1.2->4.9 (3.7s) swell-and-return (y held, scale breathes), returns to 1 at the 4.9 lift.
      tl.to("#r-line",{scale:1.03,duration:1.85,yoyo:true,repeat:1,overwrite:"auto",ease:"sine.inOut"},1.2);
      tl.to("#r-line",{y:0,duration:0.7,ease:"power2.inOut"},4.9);
      // "Run the grant, charge it right, and prove it in an audit." (4.9-8.7)
      tl.fromTo("#rc1",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power2.out"},5.4);
      tl.fromTo("#rc2",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power2.out"},6.4);
      tl.fromTo("#rc3",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6,ease:"power2.out"},7.4);
      tl.set("#f-recap .grp",{transformOrigin:"50% 50%"},0);
      // breathing across the recap hold; returns to 1 at the 24.0 handoff (9.5->24.0 = 14.5s).
      tl.to("#f-recap .grp",{scale:1.02,duration:3.625,yoyo:true,repeat:3,ease:"sine.inOut"},9.5);
      // "...we built GrantPipe to handle. But the knowledge matters more than any tool." (22.6-29.2)
      tl.to("#f-recap",{opacity:0,duration:0.7,ease:"power2.inOut",overwrite:"auto"},24.0);
      tl.fromTo("#f-end",{opacity:0},{opacity:1,duration:0.7,ease:"power2.out"},24.6);
      tl.fromTo("#end-mark",{opacity:0,y:-14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},25.0);
      tl.fromTo("#end-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"power3.out"},25.6);
      tl.set("#f-end .grp",{transformOrigin:"50% 50%"},0);
      // mark+headline hold 26.3->29.2 (2.9s) short swell-and-return before the lead-magnet card.
      tl.to("#f-end .grp",{scale:1.022,duration:1.45,yoyo:true,repeat:1,ease:"sine.inOut"},26.3);
      // "...the Grant Compliance Checklist... We'll send it to your inbox." (29.2-38.9)
      tl.fromTo("#end-card",{opacity:0,y:20,scale:0.96},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.4)"},29.4);
      tl.fromTo("#f-end .grp",{scale:1},{scale:1.03,duration:(D-1.1)-30.4,ease:"sine.inOut"},30.4);
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
