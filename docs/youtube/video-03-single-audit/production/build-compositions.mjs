// Generates compositions/chapter-XX.html for all chapters, timed to audio durations.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { doc, sheet, progress } from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8"));
const N = durations.chapters.length;

// caption block (animatable: #cap is faded/slid in)
function caption({ idx, chip, num, line }) {
  const numHtml = num != null ? `<span class="num">${num}</span>` : "";
  return `<div id="cap" class="caption clip" data-start="0" data-duration="DUR" data-track-index="8" style="opacity:0">
    <div class="chip">${numHtml}${chip}</div>
    <div class="line">${line}</div>
  </div>
  <div id="chrome-progress" class="clip" data-start="0" data-duration="DUR" data-track-index="7">${progress(N, idx)}</div>`;
}
const capIn = `tl.fromTo("#cap",{opacity:0,y:28},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.25);`;

// ---- Scene builders. Each returns {kicker?, body, timeline}. Use DUR placeholder; replaced per chapter. ----
const scenes = {
  // 0 — Cold open / hook: $750k struck, $1,000,000 rises
  "00": () => {
    const body = `
    <div class="stage">
      <div id="t-tag" style="opacity:0;font-family:'Mono';font-size:24px;letter-spacing:6px;text-transform:uppercase;color:var(--ochre);margin-bottom:30px">2 CFR 200 · 2024 update</div>
      <div id="t-old" style="opacity:0;position:relative;font-family:'Sora';font-weight:700;font-size:96px;color:var(--muted);line-height:1">
        $750,000
        <div id="t-strike" style="position:absolute;left:-10px;right:-10px;top:52%;height:8px;background:var(--red);transform:scaleX(0);transform-origin:left;border-radius:6px"></div>
      </div>
      <div id="t-new" style="opacity:0;margin-top:18px;font-family:'Sora';font-weight:700;font-size:168px;line-height:1;letter-spacing:-3px;color:var(--emerald)">$1,000,000</div>
      <div id="t-sub" style="opacity:0;margin-top:30px;font-size:34px;color:var(--ink);font-weight:500;max-width:1200px;text-align:center">The federal single audit threshold changed. Here's the number that matters now.</div>
    </div>`;
    const timeline = `
    tl.fromTo("#t-tag",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},0.3);
    tl.fromTo("#t-old",{opacity:0,y:24},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.7);
    tl.to("#t-strike",{scaleX:1,duration:0.5,ease:"power2.inOut"},1.7);
    tl.fromTo("#t-new",{opacity:0,scale:.86,y:30},{opacity:1,scale:1,y:0,duration:0.9,ease:"back.out(1.5)"},2.3);
    tl.fromTo("#t-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.7},3.3);`;
    return { kicker: "GrantPipe · YouTube", body, timeline };
  },

  // 1 — What a single audit actually is: two halves + history timeline
  "01": () => {
    const body = `
      <div class="stage" style="gap:54px">
        <div style="display:flex;gap:30px;align-items:stretch">
          <div id="half-a" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:18px;box-shadow:var(--shadow);padding:34px 38px;width:600px">
            <div style="font-family:'Mono';font-size:19px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">Half 1</div>
            <div style="font-family:'Sora';font-weight:600;font-size:38px;margin-top:10px;color:var(--ink)">Financial statement audit</div>
            <div style="font-size:27px;color:var(--muted);margin-top:12px;line-height:1.35">Are your books accurate?</div>
          </div>
          <div id="brace" style="opacity:0;display:flex;align-items:center;font-family:'Sora';font-weight:700;font-size:54px;color:var(--ochre)">+</div>
          <div id="half-b" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:18px;box-shadow:var(--shadow);padding:34px 38px;width:600px">
            <div style="font-family:'Mono';font-size:19px;letter-spacing:2px;text-transform:uppercase;color:#7a5410">Half 2</div>
            <div style="font-family:'Sora';font-weight:600;font-size:38px;margin-top:10px;color:var(--ink)">Federal compliance audit</div>
            <div style="font-size:27px;color:var(--muted);margin-top:12px;line-height:1.35">Did you follow the grant rules?</div>
          </div>
        </div>
        <div id="tl-strip" style="opacity:0;display:flex;align-items:center;gap:20px;font-family:'Mono';font-size:24px">
          <span style="background:var(--emerald-50);color:var(--emerald-d);padding:12px 22px;border-radius:10px;border:1px solid var(--emerald)">Single Audit Act · 1984 / amended 1996</span>
          <span style="color:var(--muted)">→</span>
          <span id="tl-a133" style="background:#eef0ec;color:var(--muted);padding:12px 22px;border-radius:10px;border:1px solid var(--line2);text-decoration:line-through">OMB Circular A-133</span>
          <span style="color:var(--muted)">→</span>
          <span style="background:var(--ochre-50);color:#7a5410;padding:12px 22px;border-radius:10px;border:1px solid var(--ochre-line)">2 CFR 200, Subpart F</span>
        </div>
      </div>
      ${caption({ idx: 1, chip: "Chapter 1", num: "01", line: "Two audits in one: your financials, plus how you spent federal money." })}`;
    const timeline = `
      tl.fromTo("#half-a",{opacity:0,x:-26},{opacity:1,x:0,duration:0.6,ease:"power2.out"},0.3);
      tl.fromTo("#brace",{opacity:0,scale:.6},{opacity:1,scale:1,duration:0.4,ease:"back.out(2)"},0.7);
      tl.fromTo("#half-b",{opacity:0,x:26},{opacity:1,x:0,duration:0.6,ease:"power2.out"},0.9);
      ${capIn}
      tl.fromTo("#tl-strip",{opacity:0,y:20},{opacity:1,y:0,duration:0.6},D*0.55);`;
    return { body, timeline };
  },

  // 2 — Who needs one + the $1M threshold + entity list
  "02": () => {
    const entities = ["Nonprofits (501c3)", "States", "Local governments", "Tribal governments", "Universities"]
      .map(
        (t, i) =>
          `<div id="ent-${i}" style="opacity:0;display:flex;gap:12px;align-items:center;font-size:30px"><span style="color:var(--emerald);font-size:30px">✓</span><span>${t}</span></div>`,
      )
      .join("");
    const body = `
      <div class="stage" style="gap:40px">
        <div id="bignum" style="opacity:0;text-align:center">
          <div style="font-family:'Sora';font-weight:700;font-size:176px;line-height:1;letter-spacing:-3px;color:var(--emerald)">$1,000,000</div>
          <div style="font-family:'Sora';font-weight:600;font-size:36px;margin-top:14px;color:var(--ink)">Federal awards EXPENDED in one fiscal year</div>
          <div style="font-family:'Mono';font-size:24px;margin-top:14px;color:#7a5410;background:var(--ochre-50);border:1px solid var(--ochre-line);display:inline-block;padding:8px 20px;border-radius:999px">Up from $750,000 — 2024 Uniform Guidance</div>
        </div>
        <div id="ents" style="display:flex;gap:40px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:1500px">
          ${entities}
          <div id="ent-x" style="opacity:0;display:flex;gap:12px;align-items:center;font-size:30px;color:var(--muted)"><span style="color:var(--red);font-size:28px">✕</span><span>For-profit companies — different rules</span></div>
        </div>
      </div>
      ${caption({ idx: 2, chip: "Chapter 2 · The number that changed", num: "02", line: "Spend $1,000,000+ in federal awards in a year, and a single audit is required." })}`;
    const timeline = `
      tl.fromTo("#bignum",{opacity:0,scale:.9},{opacity:1,scale:1,duration:0.8,ease:"back.out(1.4)"},0.3);
      ${capIn}
      const ents=["#ent-0","#ent-1","#ent-2","#ent-3","#ent-4"];
      ents.forEach((s,i)=>tl.fromTo(s,{opacity:0,y:14},{opacity:1,y:0,duration:0.4},D*0.45+i*0.25));
      tl.fromTo("#ent-x",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},D*0.78);`;
    return { body, timeline };
  },

  // 3 — "expended": three rows (awarded/received/expended) + what-counts strip
  "03": () => {
    const rows = [
      { label: "Awarded", v: "$1,400,000", bad: true, note: "the size of the grant" },
      { label: "Received in cash", v: "$900,000", bad: true, note: "what hit the bank" },
      { label: "Expended this fiscal year", v: "$1,050,000", bad: false, note: "what you actually spent" },
    ]
      .map(
        (r, i) =>
          `<div id="row-${i}" style="opacity:0;display:flex;align-items:center;gap:24px;background:var(--white);${r.bad ? "border:1px solid var(--line);" : "border:2px solid var(--emerald);"}border-radius:14px;box-shadow:var(--shadow);padding:20px 30px;width:1120px">
            <span style="font-size:34px;color:${r.bad ? "var(--muted)" : "var(--emerald)"}">${r.bad ? "✕" : "✓"}</span>
            <div style="flex:1">
              <div style="font-family:'Sora';font-weight:600;font-size:32px;color:${r.bad ? "var(--muted)" : "var(--ink)"}">${r.label}</div>
              <div style="font-size:22px;color:var(--muted)">${r.note}</div>
            </div>
            <div style="font-family:'Mono';font-weight:500;font-size:42px;color:${r.bad ? "var(--muted)" : "var(--emerald)"}">${r.v}</div>
          </div>`,
      )
      .join("");
    const body = `
      <div class="stage" style="gap:18px;padding-top:104px;justify-content:flex-start">
        ${rows}
        <div id="counts" style="opacity:0;display:flex;gap:18px;margin-top:10px;align-items:center;flex-wrap:wrap;justify-content:center;max-width:1200px">
          <span style="font-family:'Mono';font-size:22px;background:var(--emerald-50);color:var(--emerald-d);border:1px solid var(--emerald);padding:8px 18px;border-radius:999px">✓ Direct federal awards</span>
          <span style="font-family:'Mono';font-size:22px;background:var(--ochre-50);color:#7a5410;border:1px solid var(--ochre-line);padding:8px 18px;border-radius:999px">✓ Pass-through subawards</span>
          <span style="font-family:'Mono';font-size:22px;background:#eef0ec;color:var(--muted);border:1px solid var(--line2);padding:8px 18px;border-radius:999px">✕ Contractor income</span>
        </div>
      </div>
      ${caption({ idx: 3, chip: 'Chapter 3 · The word "expended"', num: "03", line: "Not what you were awarded. Not what you received. What you actually spent." })}`;
    const timeline = `
      tl.fromTo("#row-0",{opacity:0,x:-20},{opacity:1,x:0,duration:0.5},0.3);
      tl.fromTo("#row-1",{opacity:0,x:-20},{opacity:1,x:0,duration:0.5},0.7);
      ${capIn}
      tl.fromTo("#row-2",{opacity:0,x:-20},{opacity:1,x:0,duration:0.6,ease:"back.out(1.4)"},D*0.4);
      tl.fromTo("#counts",{opacity:0,y:14},{opacity:1,y:0,duration:0.6},D*0.66);`;
    return { body, timeline };
  },

  // 4 — single audit vs program-specific (two paths)
  "04": () => {
    const body = `
      <div class="stage" style="gap:40px">
        <div id="node" style="opacity:0;font-family:'Sora';font-weight:600;font-size:32px;background:var(--ink);color:var(--white);padding:18px 34px;border-radius:14px;box-shadow:var(--shadow)">You're over $1,000,000</div>
        <div style="display:flex;gap:40px;align-items:stretch">
          <div id="path-a" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:18px;box-shadow:var(--shadow);padding:32px 36px;width:600px">
            <div style="font-family:'Mono';font-size:19px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">Default</div>
            <div style="font-family:'Sora';font-weight:600;font-size:36px;margin-top:10px">Full single audit</div>
            <div style="font-size:27px;color:var(--muted);margin-top:12px;line-height:1.35">Federal money across multiple programs.</div>
          </div>
          <div id="path-b" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:18px;box-shadow:var(--shadow);padding:32px 36px;width:600px">
            <div style="font-family:'Mono';font-size:19px;letter-spacing:2px;text-transform:uppercase;color:#7a5410">Narrower option</div>
            <div style="font-family:'Sora';font-weight:600;font-size:36px;margin-top:10px">Program-specific audit</div>
            <div style="font-size:27px;color:var(--muted);margin-top:12px;line-height:1.35">One federal program only. Ask your auditor if you qualify.</div>
          </div>
        </div>
      </div>
      ${caption({ idx: 4, chip: "Chapter 4 · A fork in the road", num: "04", line: "Multiple programs? Full single audit. Just one? A lighter path may apply." })}`;
    const timeline = `
      tl.fromTo("#node",{opacity:0,y:-16},{opacity:1,y:0,duration:0.6},0.3);
      tl.fromTo("#path-a",{opacity:0,x:-26},{opacity:1,x:0,duration:0.6},0.8);
      tl.fromTo("#path-b",{opacity:0,x:26},{opacity:1,x:0,duration:0.6},1.1);
      ${capIn}`;
    return { body, timeline };
  },

  // 5 — what the auditor tests: SEFA + major programs + CPA/Yellow Book
  "05": () => {
    const cols = [
      { key: "prog", label: "Federal Program", w: 620 },
      { key: "amt", label: "Expended", w: 260, cls: "num" },
    ];
    const rows = [
      { prog: "Dept. of Education — Title I", amt: "$620,000" },
      { prog: "HHS — Community Services Block Grant", amt: "$310,000" },
      { prog: "USDA — Nutrition program", amt: "$95,000" },
      { prog: "Local pass-through — Workforce", amt: "$58,000" },
    ];
    const s = sheet({ tabs: [{ label: "SEFA", active: true }], cols, rows, idPrefix: "se" });
    const body = `
      <div class="stage" style="gap:26px;padding-top:118px;justify-content:flex-start">
        <div id="sheet" style="opacity:0;width:980px">${s}</div>
        <div id="sefa-cap" style="opacity:0;font-family:'Mono';font-size:22px;color:var(--muted)">Schedule of Expenditures of Federal Awards — the backbone of the audit</div>
        <div id="cards" style="display:flex;gap:24px;margin-top:2px">
          <div id="major" style="opacity:0;background:var(--emerald-50);border:2px solid var(--emerald);border-radius:14px;padding:18px 26px;width:560px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">Risk-based selection</div>
            <div style="font-family:'Sora';font-weight:600;font-size:27px;margin-top:6px">Not every dollar is tested — the biggest, riskiest "major programs" are.</div>
          </div>
          <div id="cpa" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:14px;padding:18px 26px;width:560px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:#7a5410">Who runs it</div>
            <div style="font-family:'Sora';font-weight:600;font-size:27px;margin-top:6px">An independent CPA you hire, following the "Yellow Book."</div>
          </div>
        </div>
      </div>
      ${caption({ idx: 5, chip: "Chapter 5 · What gets tested", num: "05", line: "Build the SEFA. The auditor risk-selects major programs to test." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.2);
      ${capIn}
      tl.fromTo("#sefa-cap",{opacity:0},{opacity:1,duration:0.5},D*0.3);
      tl.to(["#se-r0-amt","#se-r1-amt"],{className:"+=hl-emerald",duration:0.3,stagger:0.2},D*0.42);
      tl.fromTo("#major",{opacity:0,y:18},{opacity:1,y:0,duration:0.5},D*0.56);
      tl.fromTo("#cpa",{opacity:0,y:18},{opacity:1,y:0,duration:0.5},D*0.74);`;
    return { body, timeline };
  },

  // 6 — findings, questioned costs, corrective action, low-risk auditee
  "06": () => {
    const cols = [
      { key: "ref", label: "Finding", w: 160 },
      { key: "desc", label: "Description", w: 640 },
      { key: "qc", label: "Questioned cost", w: 280, cls: "num" },
    ];
    const rows = [
      { ref: "2025-001", desc: "Unsupported cost — no receipt on file", qc: "$14,200" },
      { ref: "2025-002", desc: "Charge outside the period of performance", qc: "$3,800" },
    ];
    const s = sheet({ tabs: [{ label: "Findings & Questioned Costs", active: true }], cols, rows, idPrefix: "fn" });
    const body = `
      <div class="stage" style="gap:28px;padding-top:128px;justify-content:flex-start">
        <div id="sheet" style="opacity:0;width:1180px">${s}</div>
        <div style="display:flex;gap:24px;margin-top:2px">
          <div id="cap-plan" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:14px;padding:20px 28px;width:640px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">For every finding</div>
            <div style="font-family:'Sora';font-weight:600;font-size:30px;margin-top:6px">Corrective action plan</div>
            <div style="font-size:24px;color:var(--muted);margin-top:8px;line-height:1.3">What went wrong, who owns the fix, and when it's done.</div>
          </div>
          <div id="badge" style="opacity:0;background:var(--ochre-50);border:2px solid var(--ochre-line);border-radius:14px;padding:20px 28px;width:520px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:#7a5410">Low-risk auditee ✓✓</div>
            <div style="font-size:25px;color:var(--ink);margin-top:8px;line-height:1.3">A clean two-year track record means the auditor tests less next time.</div>
          </div>
        </div>
      </div>
      ${caption({ idx: 6, chip: "Chapter 6 · When something doesn't line up", num: "06", line: "Questioned costs become findings — each needs a corrective action plan." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      tl.to(["#fn-r0-qc","#fn-r1-qc"],{className:"+=hl-red",duration:0.3,stagger:0.2},D*0.34);
      tl.fromTo("#cap-plan",{opacity:0,x:-20},{opacity:1,x:0,duration:0.5},D*0.52);
      tl.fromTo("#badge",{opacity:0,x:20},{opacity:1,x:0,duration:0.5},D*0.72);`;
    return { body, timeline };
  },

  // 7 — how/where you file: reporting package -> FAC; deadline
  "07": () => {
    const pkg = [
      "Financial statements + SEFA",
      "Auditor's reports",
      "Schedule of findings",
      "Corrective action plan",
      "Data collection form (SF-SAC)",
    ]
      .map(
        (t, i) =>
          `<div id="pk-${i}" style="opacity:0;display:flex;gap:12px;align-items:center;font-size:26px;margin-top:10px"><span style="color:var(--emerald);font-size:24px">✓</span>${t}</div>`,
      )
      .join("");
    const body = `
      <div class="stage" style="flex-direction:row;gap:50px;align-items:center;padding-top:50px">
        <div id="pkg" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:18px;box-shadow:var(--shadow);padding:30px 36px;width:660px">
          <div style="font-family:'Sora';font-weight:600;font-size:32px;color:var(--emerald)">Reporting package</div>
          ${pkg}
        </div>
        <div id="port-arrow" style="opacity:0;font-family:'Sora';font-weight:700;font-size:56px;color:var(--ochre)">→</div>
        <div style="display:flex;flex-direction:column;gap:26px">
          <div id="portal" style="opacity:0;background:var(--emerald);color:var(--white);border-radius:16px;box-shadow:var(--shadow);padding:26px 34px;width:560px">
            <div style="font-family:'Sora';font-weight:600;font-size:32px">Federal Audit Clearinghouse</div>
            <div style="font-family:'Mono';font-size:26px;margin-top:8px">fac.gov <span style="opacity:.85">· now run by GSA</span></div>
          </div>
          <div id="deadline" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:16px;box-shadow:var(--shadow);padding:24px 32px;width:560px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:#7a5410">Deadline — whichever comes first</div>
            <div style="font-size:26px;color:var(--ink);margin-top:10px;line-height:1.35">30 days after the auditor's report<br/><span style="color:var(--muted)">— or —</span><br/>9 months after your fiscal year ends</div>
          </div>
        </div>
      </div>
      ${caption({ idx: 7, chip: "Chapter 7 · How you file it", num: "07", line: "Bundle the reporting package and submit it to the FAC at fac.gov." })}`;
    const timeline = `
      tl.fromTo("#pkg",{opacity:0,x:-26},{opacity:1,x:0,duration:0.6},0.3);
      ${capIn}
      const pk=["#pk-0","#pk-1","#pk-2","#pk-3","#pk-4"];
      pk.forEach((s,i)=>tl.fromTo(s,{opacity:0,x:-12},{opacity:1,x:0,duration:0.3},0.8+i*0.18));
      tl.fromTo("#port-arrow",{opacity:0,scale:.7},{opacity:1,scale:1,duration:0.4,ease:"back.out(2)"},D*0.5);
      tl.fromTo("#portal",{opacity:0,x:24},{opacity:1,x:0,duration:0.5},D*0.56);
      tl.fromTo("#deadline",{opacity:0,x:24},{opacity:1,x:0,duration:0.5},D*0.72);`;
    return { body, timeline };
  },

  // 8 — where preparing breaks down (three red cards)
  "08": () => {
    const breaks = [
      { h: "Did we cross $1M?", d: "Federal spend scattered across spreadsheets, your ledger, somebody's email." },
      { h: "Rebuilding the SEFA", d: "Reconstructing every federal dollar by program, at year-end, from scratch." },
      { h: "The audit trail", d: "Finding the documentation behind a questioned cost, eighteen months later." },
    ]
      .map(
        (b, i) =>
          `<div id="bk-${i}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--red);border-radius:16px;box-shadow:var(--shadow);padding:28px 30px;width:500px">
            <div style="font-family:'Sora';font-weight:600;font-size:32px;color:var(--red)">${b.h}</div>
            <div style="font-size:25px;color:var(--ink);margin-top:12px;line-height:1.3">${b.d}</div></div>`,
      )
      .join("");
    const files = ["federal_2025_v3.xlsx", "drawdowns_FINAL.xlsx", "passthrough_misc.xlsx"]
      .map(
        (f, i) =>
          `<span id="fl-${i}" style="opacity:0;font-family:'Mono';font-size:22px;background:#eef0ec;color:var(--muted);border:1px solid var(--line2);padding:8px 16px;border-radius:8px;transform:rotate(${i % 2 ? 2 : -2}deg)">${f}</span>`,
      )
      .join("");
    const body = `
      <div class="stage" style="gap:40px">
        <div id="bk-title" style="opacity:0;font-family:'Sora';font-weight:700;font-size:60px;text-align:center">A year-long job, treated as a <span style="color:var(--red)">year-end project</span></div>
        <div style="display:flex;gap:28px">${breaks}</div>
        <div style="display:flex;gap:18px;margin-top:18px">${files}</div>
      </div>
      ${caption({ idx: 8, chip: "Chapter 8 · Where it breaks", num: "08", line: "The rule is simple. Reconstructing it all at year-end is where teams lose weeks." })}`;
    const timeline = `
      tl.fromTo("#bk-title",{opacity:0,y:22},{opacity:1,y:0,duration:0.7},0.3);
      tl.fromTo(["#bk-0","#bk-1","#bk-2"],{opacity:0,y:26},{opacity:1,y:0,duration:0.5,stagger:0.45,ease:"power2.out"},0.9);
      ${capIn}
      tl.fromTo(["#fl-0","#fl-1","#fl-2"],{opacity:0,y:14},{opacity:1,y:0,duration:0.4,stagger:0.22},D*0.66);`;
    return { body, timeline };
  },

  // 9 — outro / soft CTA
  "09": () => {
    const body = `
    <div class="stage">
      <div id="o-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:74px;text-align:center;line-height:1.05;letter-spacing:-1.5px">See the single audit<br/>coming, not <span style="color:var(--emerald)">scrambling</span></div>
      <div id="o-card" style="opacity:0;margin-top:46px;display:flex;align-items:center;gap:16px;background:var(--emerald);color:var(--white);padding:18px 34px;border-radius:999px;font-family:'Sora';font-weight:600;font-size:32px;box-shadow:var(--shadow)">2 CFR 200 Audit Prep Checklist <span style="font-family:'Mono';font-size:22px;background:var(--ochre);color:#3a2a07;padding:3px 14px;border-radius:999px">free · emailed</span></div>
      <div id="o-link" style="opacity:0;margin-top:30px;font-family:'Sora';font-weight:600;font-size:32px;color:var(--ink)">grantpipe.com<span style="color:var(--muted)">/2-cfr-200-audit-prep-checklist</span></div>
      <div id="o-next" style="opacity:0;margin-top:58px;display:flex;align-items:center;gap:16px;color:var(--muted);font-size:28px">
        <span style="font-family:'Mono';letter-spacing:2px;text-transform:uppercase;font-size:20px;color:var(--ochre)">Next up</span>
        <span style="font-family:'Sora';font-weight:600;color:var(--ink)">How to Prepare for a Single Audit</span>
      </div>
    </div>
    ${caption({ idx: 9, chip: "Track federal spending as you go", line: "" })}`;
    const timeline = `
      tl.fromTo("#o-head",{opacity:0,y:30},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.3);
      tl.fromTo("#o-card",{opacity:0,scale:.92},{opacity:1,scale:1,duration:0.7,ease:"back.out(1.5)"},1.3);
      tl.fromTo("#o-link",{opacity:0},{opacity:1,duration:0.6},2.1);
      tl.fromTo("#o-next",{opacity:0,y:16},{opacity:1,y:0,duration:0.6},D-3.2);`;
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
