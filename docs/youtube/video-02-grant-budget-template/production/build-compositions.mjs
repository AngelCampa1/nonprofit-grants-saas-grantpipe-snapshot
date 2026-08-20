// Generates compositions/chapter-XX.html for all chapters, timed to audio durations.
import { readFileSync, writeFileSync } from "node:fs";
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
  // 0 — Cold open / hook
  "00": () => {
    const body = `
    <div class="stage">
      <div id="t-eyebrow" style="opacity:0;font-family:'Mono';font-size:24px;letter-spacing:6px;text-transform:uppercase;color:var(--ochre);margin-bottom:26px">Grant Budget, Done Right</div>
      <h1 id="t-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:100px;line-height:1.02;letter-spacing:-2px;text-align:center;max-width:1560px">When the numbers don't<br/>match the <span style="color:var(--emerald)">story</span></h1>
      <div id="t-sub" style="opacity:0;margin-top:34px;font-size:34px;color:var(--muted);font-weight:500">Build a grant budget that holds together, line by line</div>
      <div id="t-free" style="opacity:0;margin-top:46px;display:flex;align-items:center;gap:14px;background:var(--emerald);color:var(--white);padding:16px 30px;border-radius:999px;font-family:'Sora';font-weight:600;font-size:30px;box-shadow:var(--shadow)">Free template included <span style="font-family:'Mono';font-size:22px;background:var(--ochre);color:#3a2a07;padding:3px 14px;border-radius:999px">link below</span></div>
    </div>`;
    const timeline = `
    tl.fromTo("#t-eyebrow",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.3);
    tl.fromTo("#t-head",{opacity:0,y:34},{opacity:1,y:0,duration:0.9,ease:"power3.out"},0.7);
    tl.fromTo("#t-sub",{opacity:0,y:20},{opacity:1,y:0,duration:0.7},1.6);
    tl.fromTo("#t-free",{opacity:0,scale:.92},{opacity:1,scale:1,duration:0.7,ease:"back.out(1.5)"},2.5);
    tl.to("#t-head span",{color:"#b9842b",duration:0.6,yoyo:true,repeat:1},D-3);`;
    return { kicker: "GrantPipe · YouTube", body, timeline };
  },

  // 1 — Why most grant budgets get rejected
  "01": () => {
    const cols = [
      { key: "cat", label: "Budget Category", w: 460 },
      { key: "amt", label: "Amount", w: 260, cls: "num" },
    ];
    const rows = [
      { cat: "Staff", amt: "$50,000" },
      { cat: "Supplies", amt: "$10,000" },
      { cat: "Travel", amt: "$5,000" },
      { cat: "Total Requested", amt: { v: "$65,000", cls: "" } },
    ];
    const s = sheet({ tabs: [{ label: "Budget", active: true }], cols, rows, idPrefix: "p" });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:200px">
        <div id="sheet" style="opacity:0;width:760px">${s}</div>
        <div id="stamp" style="opacity:0;position:absolute;top:330px;right:360px;transform:rotate(-12deg);border:6px solid var(--red);color:var(--red);font-family:'Sora';font-weight:700;font-size:52px;padding:10px 26px;border-radius:14px;letter-spacing:2px;background:rgba(251,233,231,.6)">NOT JUSTIFIED</div>
      </div>
      ${caption({ idx: 1, chip: "Chapter 1", num: "01", line: "Round numbers tell a reviewer you estimated instead of calculated." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.8,ease:"power2.out"},0.2);
      ${capIn}
      tl.to(["#p-r0-amt","#p-r1-amt","#p-r2-amt"],{className:"+=hl-ochre",duration:0.3,stagger:0.15},D*0.42);
      tl.fromTo("#stamp",{opacity:0,scale:1.4,rotation:-12},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},D*0.6);`;
    return { body, timeline };
  },

  // 2 — The line items funders expect
  "02": () => {
    const cats = [
      "Personnel",
      "Fringe Benefits",
      "Travel",
      "Equipment",
      "Supplies",
      "Contractual",
      "Other",
      "Indirect",
    ];
    const cols = [
      { key: "cat", label: "Budget Category", w: 360 },
      { key: "desc", label: "Description / Math", w: 540 },
      { key: "total", label: "Total", w: 220, cls: "num" },
    ];
    const rows = cats.map((c) => ({ cat: c, desc: "", total: "" }));
    const s = sheet({
      tabs: [{ label: "Budget", active: true }, { label: "Budget Narrative" }],
      cols,
      rows,
      idPrefix: "c",
    });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:150px">
        <div id="sheet" style="opacity:0">${s}</div>
      </div>
      ${caption({ idx: 2, chip: "Chapter 2", num: "02", line: "The standard federal categories, in the order reviewers expect." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      const catKeys=${JSON.stringify(cats.map((_, i) => `#c-r${i}-cat`))};
      catKeys.forEach((sel,i)=>{ tl.fromTo(sel,{opacity:0,x:-16},{opacity:1,x:0,duration:0.3},0.9+i*0.22); });
      tl.to("#c-r7-cat",{className:"+=hl-emerald",duration:0.3},D-2.4);`;
    return { body, timeline };
  },

  // 3 — Personnel and fringe
  "03": () => {
    const cols = [
      { key: "role", label: "Role", w: 360 },
      { key: "salary", label: "Annual Salary", w: 240, cls: "num" },
      { key: "effort", label: "% Effort", w: 180, cls: "num" },
      { key: "cost", label: "Cost to Grant", w: 240, cls: "num" },
    ];
    const rows = [
      { role: "Program Director", salary: "$80,000", effort: "25%", cost: { v: "$20,000" } },
      { role: "Lead Instructor", salary: "$52,000", effort: "50%", cost: "$26,000" },
      { role: "Fringe Benefits (30%)", salary: "—", effort: "—", cost: { v: "$13,800" } },
    ];
    const s = sheet({ tabs: [{ label: "Budget", active: true }], cols, rows, idPrefix: "p" });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:170px">
        <div id="sheet" style="opacity:0">${s}</div>
        <div id="formula" style="opacity:0;margin-top:26px;font-family:'Mono';font-size:28px;background:var(--ink);color:#eafff5;padding:14px 24px;border-radius:12px;box-shadow:var(--shadow)"><span style="color:var(--ochre)">Cost</span> = Salary × % Effort &nbsp;→&nbsp; <span style="color:#9be7c4">$80,000 × 25% = $20,000</span></div>
        <div id="call" class="callout" style="opacity:0;left:1250px;top:300px">
          <span class="k">Fringe</span>Payroll taxes + benefits, as a % of the salaries you charge.
        </div>
      </div>
      ${caption({ idx: 3, chip: "Chapter 3", num: "03", line: "Personnel is your biggest number. Calculate it, never estimate." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      tl.to(["#p-r0-effort"],{className:"+=hl-ochre",duration:0.3},D*0.3);
      tl.fromTo("#formula",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},D*0.38);
      tl.to(["#p-r2-role","#p-r2-cost"],{className:"+=hl-emerald",duration:0.3},D*0.6);
      tl.fromTo("#call",{opacity:0,x:24},{opacity:1,x:0,duration:0.6},D*0.66);`;
    return { body, timeline };
  },

  // 4 — Other direct costs
  "04": () => {
    const cols = [
      { key: "cat", label: "Category", w: 280 },
      { key: "desc", label: "Math (units × rate)", w: 620 },
      { key: "total", label: "Total", w: 220, cls: "num" },
    ];
    const rows = [
      { cat: "Travel", desc: "3 staff × $420 airfare + 6 nights × $160 hotel", total: "$2,220" },
      { cat: "Supplies", desc: "25 student lab kits × $48", total: "$1,200" },
      { cat: "Contractual", desc: "Eval consultant, 40 hrs × $95", total: "$3,800" },
      { cat: "Equipment", desc: "1 lab spectrometer (>$10k, >1 yr)", total: { v: "$12,000" } },
    ];
    const s = sheet({ tabs: [{ label: "Budget", active: true }], cols, rows, idPrefix: "d" });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:160px">
        <div id="sheet" style="opacity:0">${s}</div>
        <div id="split" style="opacity:0;display:flex;gap:24px;margin-top:30px">
          <div style="background:var(--emerald-50);border:2px solid var(--emerald);border-radius:14px;padding:20px 28px;min-width:420px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:var(--emerald)">Equipment</div>
            <div style="font-family:'Sora';font-weight:600;font-size:30px;margin-top:6px">≥ $10,000 per unit · lasts > 1 year</div></div>
          <div style="background:var(--ochre-50);border:2px solid var(--ochre-line);border-radius:14px;padding:20px 28px;min-width:420px">
            <div style="font-family:'Mono';font-size:18px;letter-spacing:2px;text-transform:uppercase;color:#7a5410">Supplies</div>
            <div style="font-family:'Sora';font-weight:600;font-size:30px;margin-top:6px">Below $10,000 per unit</div></div>
        </div>
      </div>
      ${caption({ idx: 4, chip: "Chapter 4", num: "04", line: "Break every cost into units. Never one lump sum." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      tl.to("#d-r3-cat",{className:"+=hl-emerald",duration:0.3},D*0.5);
      tl.fromTo("#split",{opacity:0,y:18},{opacity:1,y:0,duration:0.6},D*0.56);`;
    return { body, timeline };
  },

  // 5 — Indirect & de minimis 15%
  "05": () => {
    const body = `
      <div class="stage">
        <div id="big" style="opacity:0;display:flex;align-items:baseline;gap:18px">
          <div style="font-family:'Sora';font-weight:700;font-size:200px;color:var(--emerald);line-height:1;letter-spacing:-4px">15<span style="font-size:120px">%</span></div>
          <div style="text-align:left">
            <div style="font-family:'Mono';font-size:22px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre)">de minimis rate</div>
            <div style="font-family:'Sora';font-weight:600;font-size:34px;max-width:520px;margin-top:8px">Up from 10% in the 2024 Uniform Guidance (2 CFR 200)</div></div>
        </div>
        <div id="mtdc" style="opacity:0;margin-top:50px;font-family:'Mono';font-size:30px;background:var(--ink);color:#eafff5;padding:20px 30px;border-radius:14px;box-shadow:var(--shadow);line-height:1.5">
          Direct costs <span style="color:var(--ochre)">− equipment</span> <span style="color:var(--ochre)">− subaward portion over $50k</span><br/>= <span style="color:#9be7c4">MTDC base</span> &nbsp;×&nbsp; 15% &nbsp;=&nbsp; <span style="color:#9be7c4">Indirect</span>
        </div>
      </div>
      ${caption({ idx: 5, chip: "Chapter 5 · The money most leave behind", num: "05", line: "Indirect costs, written into the regulation. Don't skip them." })}`;
    const timeline = `
      tl.fromTo("#big",{opacity:0,scale:.9},{opacity:1,scale:1,duration:0.8,ease:"back.out(1.4)"},0.3);
      ${capIn}
      tl.fromTo("#mtdc",{opacity:0,y:20},{opacity:1,y:0,duration:0.6},D*0.45);`;
    return { body, timeline };
  },

  // 6 — Cost share & match
  "06": () => {
    const cardCash = `<div id="m-cash" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:16px;box-shadow:var(--shadow);padding:32px 34px;width:560px">
      <div style="font-family:'Sora';font-weight:600;font-size:38px;color:var(--emerald)">Cash Match</div>
      <div style="font-size:27px;color:var(--ink);margin-top:14px;line-height:1.35">Real dollars from your budget or another funder.</div>
      <div style="font-family:'Mono';font-size:30px;margin-top:18px;color:var(--ink)">$15,000</div></div>`;
    const cardKind = `<div id="m-kind" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--ochre);border-radius:16px;box-shadow:var(--shadow);padding:32px 34px;width:560px">
      <div style="font-family:'Sora';font-weight:600;font-size:38px;color:#7a5410">In-Kind Match</div>
      <div style="font-size:27px;color:var(--ink);margin-top:14px;line-height:1.35">Donated value: volunteer hours, space, pro bono work.</div>
      <div style="font-family:'Mono';font-size:26px;margin-top:18px;color:var(--muted)">200 volunteer hrs × $33.49 = <span style="color:var(--ink)">$6,698</span></div></div>`;
    const body = `
      <div class="stage" style="gap:34px">
        <div style="display:flex;gap:34px">${cardCash}${cardKind}</div>
        <div id="m-rule" style="opacity:0;background:var(--red-50);border:1px solid var(--red);border-radius:14px;padding:18px 26px;font-size:26px;color:var(--red);max-width:1100px;text-align:center">Commit to a match and you're legally on the hook to deliver and document it. Only pledge what you can prove.</div>
      </div>
      ${caption({ idx: 6, chip: "Chapter 6", num: "06", line: "Cost share comes in two flavors, and both are a promise." })}`;
    const timeline = `
      tl.fromTo("#m-cash",{opacity:0,x:-30},{opacity:1,x:0,duration:0.6,ease:"power2.out"},0.4);
      tl.fromTo("#m-kind",{opacity:0,x:30},{opacity:1,x:0,duration:0.6,ease:"power2.out"},0.8);
      ${capIn}
      tl.fromTo("#m-rule",{opacity:0,y:18},{opacity:1,y:0,duration:0.6},D*0.55);`;
    return { body, timeline };
  },

  // 7 — Budget narrative
  "07": () => {
    const budCols = [
      { key: "cat", label: "Line", w: 300 },
      { key: "total", label: "Total", w: 180, cls: "num" },
    ];
    const budRows = [
      { cat: "Program Director", total: "$20,000" },
      { cat: "Travel", total: "$2,220" },
      { cat: "Indirect (15%)", total: "$7,530" },
    ];
    const budSheet = sheet({
      tabs: [{ label: "Budget", active: true }],
      cols: budCols,
      rows: budRows,
      idPrefix: "bn",
    });
    const narrLines = [
      "Program director at 25% effort to supervise curriculum and staff.",
      "Three round-trip flights to the national convening at $420 each.",
      "15% de minimis indirect rate on modified total direct costs.",
    ]
      .map(
        (t, i) =>
          `<div id="nl-${i}" style="opacity:0;display:flex;gap:16px;align-items:flex-start;padding:18px 0;border-bottom:1px solid var(--line)">
        <div style="font-family:'Mono';color:var(--emerald);font-size:22px;min-width:28px">${i + 1}.</div>
        <div style="font-size:27px;line-height:1.3;color:var(--ink)">${t}</div></div>`,
      )
      .join("");
    const body = `
      <style>#ch7 .sheet{width:560px}</style>
      <div id="ch7" class="stage" style="flex-direction:row;gap:56px;align-items:center;padding-top:150px;justify-content:center">
        <div id="sheet" style="opacity:0">${budSheet}</div>
        <div id="arrow" style="opacity:0;font-family:'Sora';font-weight:700;font-size:60px;color:var(--ochre)">→</div>
        <div id="narr" style="opacity:0;background:var(--white);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:26px 34px;width:680px">
          <div style="font-family:'Sora';font-weight:600;font-size:30px;color:var(--emerald);margin-bottom:8px">Budget Narrative</div>
          ${narrLines}
        </div>
      </div>
      ${caption({ idx: 7, chip: "Chapter 7 · What wins or loses budgets", num: "07", line: "Every number gets one sentence. Not a paragraph, a sentence." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,x:-24},{opacity:1,x:0,duration:0.6},0.3);
      tl.fromTo("#arrow",{opacity:0,scale:.7},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},0.9);
      tl.fromTo("#narr",{opacity:0,x:24},{opacity:1,x:0,duration:0.6},1.2);
      ${capIn}
      tl.fromTo(["#nl-0","#nl-1","#nl-2"],{opacity:0,y:14},{opacity:1,y:0,duration:0.5,stagger:0.6},D*0.4);`;
    return { body, timeline };
  },

  // 8 — Allowable + period of performance
  "08": () => {
    const allow = [
      "Program staff salaries",
      "Project supplies & materials",
      "Direct travel for the work",
    ]
      .map(
        (t) =>
          `<div style="display:flex;gap:14px;align-items:center;margin-top:14px"><span style="color:var(--emerald);font-size:32px">✓</span><span style="font-size:28px">${t}</span></div>`,
      )
      .join("");
    const unallow = ["Alcohol", "Lobbying", "Fundraising costs", "Most entertainment"]
      .map(
        (t) =>
          `<div style="display:flex;gap:14px;align-items:center;margin-top:14px"><span style="color:var(--red);font-size:30px">✕</span><span style="font-size:28px">${t}</span></div>`,
      )
      .join("");
    const body = `
      <div class="stage" style="gap:44px;padding-top:150px;justify-content:flex-start">
        <div style="display:flex;gap:34px">
          <div id="p-allow" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--emerald);border-radius:16px;box-shadow:var(--shadow);padding:28px 36px;width:600px">
            <div style="font-family:'Sora';font-weight:600;font-size:34px;color:var(--emerald)">Allowable</div>${allow}</div>
          <div id="p-unallow" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--red);border-radius:16px;box-shadow:var(--shadow);padding:28px 36px;width:600px">
            <div style="font-family:'Sora';font-weight:600;font-size:34px;color:var(--red)">Unallowable</div>${unallow}</div>
        </div>
        <div id="pop" style="opacity:0;width:1240px">
          <div style="font-family:'Mono';font-size:20px;letter-spacing:2px;text-transform:uppercase;color:var(--ochre);margin-bottom:12px">Period of Performance</div>
          <div style="position:relative;height:60px;background:var(--emerald-50);border:2px solid var(--emerald);border-radius:12px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font-family:'Mono';font-size:24px;color:var(--emerald-d)">
            <span>Oct 1, 2025</span><span style="font-family:'Plex';font-weight:600;color:var(--emerald)">Costs must fall inside this window</span><span>Sep 30, 2026</span>
          </div>
          <div id="pop-bad" style="opacity:0;position:absolute;margin-top:-78px;margin-left:-30px;background:var(--red-50);border:2px solid var(--red);color:var(--red);font-family:'Mono';font-size:20px;padding:8px 16px;border-radius:10px">Sep 20 expense → rejected</div>
        </div>
      </div>
      ${caption({ idx: 8, chip: "Chapter 8 · Two guardrails", num: "08", line: "What you can charge, and the window you can charge it in." })}`;
    const timeline = `
      tl.fromTo("#p-allow",{opacity:0,x:-26},{opacity:1,x:0,duration:0.6},0.4);
      tl.fromTo("#p-unallow",{opacity:0,x:26},{opacity:1,x:0,duration:0.6},0.7);
      ${capIn}
      tl.fromTo("#pop",{opacity:0,y:20},{opacity:1,y:0,duration:0.6},D*0.5);
      tl.fromTo("#pop-bad",{opacity:0,scale:.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},D*0.7);`;
    return { body, timeline };
  },

  // 9 — Where a budget template breaks
  "09": () => {
    const breaks = [
      {
        h: "Budget vs. actual",
        d: "Keeping spent current against this plan, by category, by hand, all year.",
      },
      { h: "Split costs", d: "One expense across two grants. No clean formula allocates it." },
      {
        h: "Sheer volume",
        d: "Each grant: its own budget, period, narrative. Soon it's a full-time job.",
      },
    ]
      .map(
        (b, i) =>
          `<div id="bk-${i}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--red);border-radius:16px;box-shadow:var(--shadow);padding:30px 32px;width:520px">
        <div style="font-family:'Sora';font-weight:600;font-size:36px;color:var(--red)">${b.h}</div>
        <div style="font-size:26px;color:var(--ink);margin-top:12px;line-height:1.3">${b.d}</div></div>`,
      )
      .join("");
    const files = [
      "grant_budget_v2.xlsx",
      "grant_budget_final.xlsx",
      "grant_budget_FINAL_real.xlsx",
    ]
      .map(
        (f, i) =>
          `<span id="fl-${i}" style="opacity:0;font-family:'Mono';font-size:22px;background:#eef0ec;color:var(--muted);border:1px solid var(--line2);padding:8px 16px;border-radius:8px;transform:rotate(${i % 2 ? 2 : -2}deg)">${f}</span>`,
      )
      .join("");
    const body = `
      <div class="stage">
        <div id="bk-title" style="opacity:0;font-family:'Sora';font-weight:700;font-size:64px;margin-bottom:44px;text-align:center">Where a budget template <span style="color:var(--red)">breaks</span></div>
        <div style="display:flex;gap:34px">${breaks}</div>
        <div style="display:flex;gap:18px;margin-top:44px">${files}</div>
      </div>
      ${caption({ idx: 9, chip: "Chapter 9 · The honest part", num: "09", line: "A template is a snapshot. The award turns it into a living thing." })}`;
    const timeline = `
      tl.fromTo("#bk-title",{opacity:0,y:24},{opacity:1,y:0,duration:0.7},0.3);
      tl.fromTo(["#bk-0","#bk-1","#bk-2"],{opacity:0,y:30},{opacity:1,y:0,duration:0.6,stagger:0.5,ease:"power2.out"},1.0);
      ${capIn}
      tl.fromTo(["#fl-0","#fl-1","#fl-2"],{opacity:0,y:14},{opacity:1,y:0,duration:0.4,stagger:0.25},D*0.66);`;
    return { body, timeline };
  },

  // 10 — Outro / CTA
  10: () => {
    const body = `
    <div class="stage">
      <div id="o-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:80px;text-align:center;line-height:1.05;letter-spacing:-1.5px">Grab the free<br/>budget template</div>
      <div id="o-pills" style="opacity:0;display:flex;gap:18px;margin-top:38px">
        <span style="font-family:'Mono';font-size:26px;background:var(--emerald-50);color:var(--emerald);border:1px solid var(--emerald);padding:12px 26px;border-radius:999px">Google Sheets</span>
        <span style="font-family:'Mono';font-size:26px;background:var(--ochre-50);color:#7a5410;border:1px solid var(--ochre-line);padding:12px 26px;border-radius:999px">Excel (.xlsx)</span>
        <span style="font-family:'Mono';font-size:26px;background:#eef0ec;color:var(--muted);border:1px solid var(--line2);padding:12px 26px;border-radius:999px">Sent to your inbox</span>
      </div>
      <div id="o-link" style="opacity:0;margin-top:42px;font-family:'Sora';font-weight:600;font-size:34px;color:var(--ink)">grantpipe.com<span style="color:var(--muted)">/grant-budget-template</span></div>
      <div id="o-next" style="opacity:0;margin-top:64px;display:flex;align-items:center;gap:16px;color:var(--muted);font-size:28px">
        <span style="font-family:'Mono';letter-spacing:2px;text-transform:uppercase;font-size:20px;color:var(--ochre)">Next up</span>
        <span style="font-family:'Sora';font-weight:600;color:var(--ink)">The Single Audit, Explained</span>
      </div>
    </div>
    ${caption({ idx: 10, chip: "Build it like a reviewer will read it", line: "" })}`;
    const timeline = `
      tl.fromTo("#o-head",{opacity:0,y:30},{opacity:1,y:0,duration:0.8,ease:"power3.out"},0.3);
      tl.fromTo("#o-pills",{opacity:0,y:18},{opacity:1,y:0,duration:0.6},1.2);
      tl.fromTo("#o-link",{opacity:0},{opacity:1,duration:0.6},1.9);
      tl.fromTo("#o-next",{opacity:0,y:16},{opacity:1,y:0,duration:0.6},D-3.2);`;
    return { body, timeline };
  },
};

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
  const out = resolve(__dirname, "compositions", `chapter-${ch.id}.html`);
  writeFileSync(out, html);
  count++;
  console.log(`wrote compositions/chapter-${ch.id}.html  (${dur}s)`);
}
console.log(`\n${count} compositions generated.`);
