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
      <div id="t-eyebrow" style="opacity:0;font-family:'Mono';font-size:24px;letter-spacing:6px;text-transform:uppercase;color:var(--ochre);margin-bottom:26px">Grant Tracking, Done Right</div>
      <h1 id="t-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:104px;line-height:1.02;letter-spacing:-2px;text-align:center;max-width:1500px">The one column<br/>most trackers <span style="color:var(--emerald)">forget</span></h1>
      <div id="t-sub" style="opacity:0;margin-top:34px;font-size:34px;color:var(--muted);font-weight:500">Build a grant tracking spreadsheet that survives an audit</div>
      <div id="t-free" style="opacity:0;margin-top:46px;display:flex;align-items:center;gap:14px;background:var(--emerald);color:var(--white);padding:16px 30px;border-radius:999px;font-family:'Sora';font-weight:600;font-size:30px;box-shadow:var(--shadow)">Free template included <span style="font-family:'Mono';font-size:22px;background:var(--ochre);color:#3a2a07;padding:3px 14px;border-radius:999px">link below</span></div>
    </div>
    <div id="t-grid" style="opacity:0;position:absolute;left:50%;top:62%;transform:translateX(-50%);z-index:-1"></div>`;
    const timeline = `
    tl.fromTo("#t-eyebrow",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power2.out"},0.3);
    tl.fromTo("#t-head",{opacity:0,y:34},{opacity:1,y:0,duration:0.9,ease:"power3.out"},0.7);
    tl.fromTo("#t-sub",{opacity:0,y:20},{opacity:1,y:0,duration:0.7},1.6);
    tl.fromTo("#t-free",{opacity:0,scale:.92},{opacity:1,scale:1,duration:0.7,ease:"back.out(1.5)"},2.5);
    tl.to("#t-head span",{color:"#b9842b",duration:0.6,yoyo:true,repeat:1},D-3);`;
    return { kicker: "GrantPipe · YouTube", body, timeline };
  },

  // 1 — Why most trackers fail
  "01": () => {
    const s = sheet({
      tabs: [{ label: "Sheet1", active: true }],
      cols: [
        { key: "g", label: "Grant Name", w: 360 },
        { key: "f", label: "Funder", w: 300 },
        { key: "a", label: "Amount", w: 220, cls: "num" },
        { key: "s", label: "Status", w: 240 },
      ],
      rows: [
        { g: "After-School STEM", f: "Dept. of Ed.", a: "$50,000", s: "Received" },
        { g: "Family Literacy", f: "Hartwell Fdn.", a: "$28,000", s: "Received" },
        { g: "Summer Meals", f: "State DHS", a: "$41,500", s: "Pending" },
      ],
      idPrefix: "x",
    });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:150px">
        <div id="sheet" style="opacity:0">${s}</div>
        <div id="stamp" style="opacity:0;position:absolute;top:300px;right:300px;transform:rotate(-12deg);border:6px solid var(--red);color:var(--red);font-family:'Sora';font-weight:700;font-size:54px;padding:10px 26px;border-radius:14px;letter-spacing:2px;background:rgba(251,233,231,.6)">FAILS AT AUDIT</div>
      </div>
      ${caption({ idx: 1, chip: "Chapter 1", num: "01", line: "Tracks whether the money showed up — and nothing else." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.8,ease:"power2.out"},0.2);
      ${capIn}
      tl.fromTo("#stamp",{opacity:0,scale:1.4,rotation:-12},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},D*0.55);`;
    return { body, timeline };
  },

  // 2 — The Grant Register
  "02": () => {
    const cols = [
      { key: "id", label: "Grant ID", w: 180, cls: "mono" },
      { key: "name", label: "Grant Name", w: 300 },
      { key: "funder", label: "Funder", w: 240 },
      { key: "type", label: "Type", w: 180 },
      { key: "amt", label: "Award", w: 180, cls: "num" },
      { key: "start", label: "Start", w: 160, cls: "mono" },
      { key: "end", label: "End", w: 160, cls: "mono" },
      { key: "status", label: "Status", w: 200 },
    ];
    const rows = [
      {
        id: "ED-2026-01",
        name: "After-School STEM",
        funder: "Dept. of Ed.",
        type: "Federal",
        amt: "$50,000",
        start: "10/01/25",
        end: "09/30/26",
        status: "Active",
      },
      {
        id: "HF-2026-02",
        name: "Family Literacy",
        funder: "Hartwell Fdn.",
        type: "Foundation",
        amt: "$28,000",
        start: "01/01/26",
        end: "12/31/26",
        status: "Active",
      },
      {
        id: "ST-2026-03",
        name: "Summer Meals",
        funder: "State DHS",
        type: "State",
        amt: "$41,500",
        start: "05/01/26",
        end: "08/31/26",
        status: "Awarded",
      },
    ];
    const s = sheet({
      tabs: [
        { label: "Grant Register", active: true },
        { label: "Budget vs Actual" },
        { label: "Expense Log" },
      ],
      cols,
      rows,
      idPrefix: "r",
    });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:160px">
        <div id="sheet" style="opacity:0">${s}</div>
      </div>
      ${caption({ idx: 2, chip: "Chapter 2", num: "02", line: "One row per grant. This is your master list." })}`;
    // reveal columns left-to-right, then the period-of-performance highlight
    const cells = (key) => `["#r-r0-${key}","#r-r1-${key}","#r-r2-${key}"]`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      const colKeys=${JSON.stringify(cols.map((c) => c.key))};
      colKeys.forEach((k,i)=>{ tl.fromTo("#r-r0-"+k+",#r-r1-"+k+",#r-r2-"+k+","+"th:nth-child("+(i+1)+")",{opacity:0},{opacity:1,duration:0.25},0.9+i*0.18); });
      tl.to([${cells("start").slice(1, -1)},${cells("end").slice(1, -1)}],{className:"+=hl-emerald",duration:0.3},D*0.62);`;
    return { body, timeline };
  },

  // 3 — Restricted vs unrestricted
  "03": () => {
    const cols = [
      { key: "id", label: "Grant ID", w: 200, cls: "mono" },
      { key: "name", label: "Grant Name", w: 360 },
      { key: "amt", label: "Award", w: 200, cls: "num" },
      { key: "restr", label: "Restricted?", w: 220 },
      { key: "purpose", label: "Restriction Purpose", w: 460 },
    ];
    const rows = [
      {
        id: "ED-2026-01",
        name: "After-School STEM",
        amt: "$50,000",
        restr: { v: `<span class="tag yes">YES</span>`, cls: "" },
        purpose: "STEM program only",
      },
      {
        id: "HF-2026-02",
        name: "Family Literacy",
        amt: "$28,000",
        restr: { v: `<span class="tag yes">YES</span>` },
        purpose: "Literacy materials & staff",
      },
      {
        id: "GEN-OPS-00",
        name: "General Operating",
        amt: "$15,000",
        restr: { v: `<span class="tag no">NO</span>` },
        purpose: "—",
      },
    ];
    const s = sheet({
      tabs: [{ label: "Grant Register", active: true }],
      cols,
      rows,
      idPrefix: "r",
    });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:170px">
        <div id="sheet" style="opacity:0">${s}</div>
        <div id="call" class="callout" style="opacity:0;left:1140px;top:430px">
          <span class="k">Why it matters</span>Restricted dollars are legally tied to one purpose. Spend them elsewhere and that's a compliance finding.
          <span style="position:absolute;left:-9px;top:40px"></span>
        </div>
      </div>
      ${caption({ idx: 3, chip: "Chapter 3 · The missing column", num: "03", line: "Restricted vs. unrestricted — the column everyone forgets." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      tl.fromTo(["#r-r0-restr","#r-r1-restr","#r-r2-restr"],{opacity:0,x:-12},{opacity:1,x:0,duration:0.4,stagger:0.12},1.1);
      tl.fromTo(["#r-r0-purpose","#r-r1-purpose","#r-r2-purpose"],{opacity:0},{opacity:1,duration:0.4,stagger:0.1},1.7);
      tl.to(["#r-r0-restr","#r-r1-restr"],{className:"+=hl-ochre",duration:0.3},D*0.42);
      tl.fromTo("#call",{opacity:0,x:24},{opacity:1,x:0,duration:0.6},D*0.5);`;
    return { body, timeline };
  },

  // 4 — Budget vs Actual
  "04": () => {
    const cols = [
      { key: "cat", label: "Budget Category", w: 420 },
      { key: "bud", label: "Budgeted", w: 240, cls: "num" },
      { key: "spent", label: "Spent", w: 240, cls: "num" },
      { key: "rem", label: "Remaining", w: 260, cls: "num" },
    ];
    const rows = [
      { cat: "Personnel", bud: "$32,000", spent: "$24,100", rem: "$7,900" },
      { cat: "Supplies", bud: "$6,000", spent: "$5,210", rem: "$790" },
      {
        cat: "Travel",
        bud: "$8,000",
        spent: { v: "$12,300", cls: "" },
        rem: { v: "-$4,300", cls: "" },
      },
      { cat: "Indirect (10%)", bud: "$4,000", spent: "$3,600", rem: "$400" },
    ];
    const s = sheet({
      tabs: [
        { label: "Grant Register" },
        { label: "Budget vs Actual", active: true },
        { label: "Expense Log" },
      ],
      cols,
      rows,
      idPrefix: "b",
    });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:170px">
        <div style="font-family:'Mono';font-size:22px;color:var(--emerald);margin-bottom:14px;opacity:0" id="b-title">ED-2026-01 · After-School STEM</div>
        <div id="sheet" style="opacity:0">${s}</div>
        <div id="formula" style="opacity:0;margin-top:26px;font-family:'Mono';font-size:28px;background:var(--ink);color:#eafff5;padding:14px 24px;border-radius:12px;box-shadow:var(--shadow)"><span style="color:var(--ochre)">Remaining</span> = Budgeted − Spent &nbsp;→&nbsp; <span style="color:#9be7c4">=B2-C2</span></div>
      </div>
      ${caption({ idx: 4, chip: "Chapter 4", num: "04", line: "Track spend against the budget — line by line." })}`;
    const timeline = `
      tl.fromTo("#b-title",{opacity:0},{opacity:1,duration:0.4},0.2);
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.4);
      ${capIn}
      tl.fromTo("#formula",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},1.4);
      tl.to(["#b-r2-spent","#b-r2-rem"],{className:"+=hl-red",duration:0.3},D*0.55);`;
    return { body, timeline };
  },

  // 5 — Expense log
  "05": () => {
    const cols = [
      { key: "date", label: "Date", w: 170, cls: "mono" },
      { key: "gid", label: "Grant ID", w: 200, cls: "mono" },
      { key: "cat", label: "Category", w: 240 },
      { key: "vendor", label: "Vendor", w: 320 },
      { key: "amt", label: "Amount", w: 200, cls: "num" },
      { key: "notes", label: "Notes", w: 300 },
    ];
    const rows = [
      {
        date: "03/04/26",
        gid: "ED-2026-01",
        cat: "Supplies",
        vendor: "Lakeshore Learning",
        amt: "$1,240",
        notes: "Lab kits",
      },
      {
        date: "03/09/26",
        gid: "ED-2026-01",
        cat: "Travel",
        vendor: "Delta Air Lines",
        amt: "$612",
        notes: "Site visit",
      },
      {
        date: "03/12/26",
        gid: "HF-2026-02",
        cat: "Personnel",
        vendor: "Payroll",
        amt: "$3,800",
        notes: "Tutor wages",
      },
    ];
    const s = sheet({
      tabs: [{ label: "Budget vs Actual" }, { label: "Expense Log", active: true }],
      cols,
      rows,
      idPrefix: "e",
    });
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:185px">
        <div id="sheet" style="opacity:0">${s}</div>
        <div id="formula" style="opacity:0;margin-top:28px;font-family:'Mono';font-size:26px;background:var(--ink);color:#eafff5;padding:14px 24px;border-radius:12px;box-shadow:var(--shadow)"><span style="color:#9be7c4">=SUMIFS</span>(Amount, GrantID, <span style="color:var(--ochre)">"ED-2026-01"</span>, Category, <span style="color:var(--ochre)">"Travel"</span>)</div>
      </div>
      ${caption({ idx: 5, chip: "Chapter 5", num: "05", line: "One row per dollar. SUMIFS links it to the budget." })}`;
    const timeline = `
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},0.2);
      ${capIn}
      tl.to(["#e-r0-gid","#e-r1-gid","#e-r2-gid"],{className:"+=hl-emerald",duration:0.3},D*0.4);
      tl.fromTo("#formula",{opacity:0,y:14},{opacity:1,y:0,duration:0.5},D*0.5);`;
    return { body, timeline };
  },

  // 6 — Deadlines + dashboard
  "06": () => {
    const cols = [
      { key: "gid", label: "Grant ID", w: 200, cls: "mono" },
      { key: "type", label: "Report", w: 280 },
      { key: "due", label: "Due Date", w: 220, cls: "mono" },
      { key: "sub", label: "Submitted", w: 220, cls: "mono" },
      { key: "status", label: "Status", w: 220 },
    ];
    const rows = [
      {
        gid: "ED-2026-01",
        type: "Quarterly Financial",
        due: { v: "06/15/26", cls: "" },
        sub: "—",
        status: "Due soon",
      },
      {
        gid: "HF-2026-02",
        type: "Interim Narrative",
        due: { v: "05/01/26", cls: "" },
        sub: "—",
        status: "Overdue",
      },
      { gid: "ST-2026-03", type: "Final Report", due: "09/30/26", sub: "—", status: "Upcoming" },
    ];
    const s = sheet({ tabs: [{ label: "Reporting", active: true }], cols, rows, idPrefix: "p" });
    const cards = [
      { k: "Total Awarded", v: "$134,500" },
      { k: "Total Spent", v: "$89,162" },
      { k: "% Restricted", v: "58%" },
      { k: "Reports due / 30d", v: "2" },
    ]
      .map(
        (
          c,
          i,
        ) => `<div class="card" id="card-${i}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:24px 30px;min-width:300px">
        <div style="font-family:'Mono';font-size:19px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)">${c.k}</div>
        <div class="bignum" style="font-size:52px;margin-top:8px;color:var(--emerald)">${c.v}</div></div>`,
      )
      .join("");
    const body = `
      <div class="stage" style="justify-content:flex-start;padding-top:140px;gap:34px">
        <div style="display:flex;gap:24px" >${cards}</div>
        <div id="sheet" style="opacity:0">${s}</div>
      </div>
      ${caption({ idx: 6, chip: "Chapter 6", num: "06", line: "Deadlines that find you — plus a one-glance dashboard." })}`;
    const timeline = `
      tl.fromTo(["#card-0","#card-1","#card-2","#card-3"],{opacity:0,y:24},{opacity:1,y:0,duration:0.5,stagger:0.12},0.3);
      tl.fromTo("#sheet",{opacity:0,y:30},{opacity:1,y:0,duration:0.7},1.1);
      ${capIn}
      tl.to("#p-r1-due",{className:"+=hl-red",duration:0.3},D*0.5);
      tl.to("#p-r0-due",{className:"+=hl-ochre",duration:0.3},D*0.58);`;
    return { body, timeline };
  },

  // 7 — Lock it down
  "07": () => {
    const items = [
      {
        n: "1",
        h: "Protect the cells",
        d: "Lock award amounts & formulas. Data → Protect sheets and ranges.",
      },
      {
        n: "2",
        h: "Right level of access",
        d: "Read-only people get Viewer, not Editor. Fewer mystery edits.",
      },
      {
        n: "3",
        h: "Name it like you'll be asked",
        d: `"Grant Tracker 2026" + a dated copy every quarter.`,
      },
    ]
      .map(
        (
          it,
          i,
        ) => `<div id="li-${i}" style="opacity:0;display:flex;gap:24px;align-items:flex-start;background:var(--white);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);padding:26px 32px;width:1180px">
        <div style="font-family:'Sora';font-weight:700;font-size:40px;color:var(--white);background:var(--emerald);min-width:64px;height:64px;border-radius:14px;display:flex;align-items:center;justify-content:center">${it.n}</div>
        <div><div style="font-family:'Sora';font-weight:600;font-size:36px">${it.h}</div>
        <div style="font-size:27px;color:var(--muted);margin-top:6px">${it.d}</div></div></div>`,
      )
      .join("");
    const body = `
      <div class="stage" style="gap:26px;justify-content:flex-start;padding-top:200px">${items}</div>
      ${caption({ idx: 7, chip: "Chapter 7", num: "07", line: "Lock it down before it bites you." })}`;
    const timeline = `
      tl.fromTo(["#li-0","#li-1","#li-2"],{opacity:0,x:-26},{opacity:1,x:0,duration:0.6,stagger:0.5,ease:"power2.out"},0.4);
      ${capIn}`;
    return { body, timeline };
  },

  // 8 — Where it breaks
  "08": () => {
    const breaks = [
      {
        h: "No audit trail",
        d: "Two people edit. Nobody knows who changed the award amount, or when.",
      },
      { h: "Split costs", d: "One expense across two grants. No clean formula can allocate it." },
      { h: "Sheer volume", d: "Enough grants and the reporting tab becomes a full-time job." },
    ]
      .map(
        (
          b,
          i,
        ) => `<div id="bk-${i}" style="opacity:0;background:var(--white);border:1px solid var(--line);border-top:5px solid var(--red);border-radius:16px;box-shadow:var(--shadow);padding:30px 32px;width:520px">
        <div style="font-family:'Sora';font-weight:600;font-size:36px;color:var(--red)">${b.h}</div>
        <div style="font-size:26px;color:var(--ink);margin-top:12px;line-height:1.3">${b.d}</div></div>`,
      )
      .join("");
    const body = `
      <div class="stage">
        <div id="bk-title" style="opacity:0;font-family:'Sora';font-weight:700;font-size:64px;margin-bottom:48px;text-align:center">Where the spreadsheet <span style="color:var(--red)">breaks</span></div>
        <div style="display:flex;gap:34px">${breaks}</div>
      </div>
      ${caption({ idx: 8, chip: "Chapter 8 · The honest part", num: "08", line: "Not a failure — a spreadsheet doing what spreadsheets do." })}`;
    const timeline = `
      tl.fromTo("#bk-title",{opacity:0,y:24},{opacity:1,y:0,duration:0.7},0.3);
      tl.fromTo(["#bk-0","#bk-1","#bk-2"],{opacity:0,y:30},{opacity:1,y:0,duration:0.6,stagger:0.5,ease:"power2.out"},1.0);
      ${capIn}`;
    return { body, timeline };
  },

  // 9 — Outro / CTA
  "09": () => {
    const body = `
    <div class="stage">
      <div id="o-head" style="opacity:0;font-family:'Sora';font-weight:700;font-size:80px;text-align:center;line-height:1.05;letter-spacing:-1.5px">Grab the free<br/>template</div>
      <div id="o-pills" style="opacity:0;display:flex;gap:18px;margin-top:38px">
        <span style="font-family:'Mono';font-size:26px;background:var(--emerald-50);color:var(--emerald);border:1px solid var(--emerald);padding:12px 26px;border-radius:999px">Google Sheets</span>
        <span style="font-family:'Mono';font-size:26px;background:var(--ochre-50);color:#7a5410;border:1px solid var(--ochre-line);padding:12px 26px;border-radius:999px">Excel (.xlsx)</span>
        <span style="font-family:'Mono';font-size:26px;background:#eef0ec;color:var(--muted);border:1px solid var(--line2);padding:12px 26px;border-radius:999px">Sent to your inbox</span>
      </div>
      <div id="o-link" style="opacity:0;margin-top:42px;font-family:'Sora';font-weight:600;font-size:34px;color:var(--ink)">grantpipe.com<span style="color:var(--muted)">/grant-tracking-template</span></div>
      <div id="o-next" style="opacity:0;margin-top:64px;display:flex;align-items:center;gap:16px;color:var(--muted);font-size:28px">
        <span style="font-family:'Mono';letter-spacing:2px;text-transform:uppercase;font-size:20px;color:var(--ochre)">Next up</span>
        <span style="font-family:'Sora';font-weight:600;color:var(--ink)">The Single Audit, Explained</span>
      </div>
    </div>
    ${caption({ idx: 9, chip: "Build it right the first time", line: "" })}`;
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
