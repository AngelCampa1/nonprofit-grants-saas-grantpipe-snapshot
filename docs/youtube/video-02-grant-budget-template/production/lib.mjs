// Shared rendering library for GrantPipe YouTube #17 compositions.
// Brand: emerald + archival ochre on warm paper. Sora / IBM Plex Sans / IBM Plex Mono.

export const FONT_FACES = `
@font-face{font-family:'Sora';font-weight:700;src:url('../assets/fonts/Sora-700.woff2') format('woff2');font-display:block}
@font-face{font-family:'Sora';font-weight:600;src:url('../assets/fonts/Sora-600.woff2') format('woff2');font-display:block}
@font-face{font-family:'Plex';font-weight:400;src:url('../assets/fonts/PlexSans-400.woff2') format('woff2');font-display:block}
@font-face{font-family:'Plex';font-weight:500;src:url('../assets/fonts/PlexSans-500.woff2') format('woff2');font-display:block}
@font-face{font-family:'Plex';font-weight:600;src:url('../assets/fonts/PlexSans-600.woff2') format('woff2');font-display:block}
@font-face{font-family:'Mono';font-weight:400;src:url('../assets/fonts/PlexMono-400.woff2') format('woff2');font-display:block}
@font-face{font-family:'Mono';font-weight:500;src:url('../assets/fonts/PlexMono-500.woff2') format('woff2');font-display:block}
`;

export const BASE_CSS = `
:root{
  --paper:#faf7f0; --paper2:#f3eee2; --ink:#17211c; --muted:#6c726a;
  --emerald:#065f46; --emerald-d:#053d2e; --emerald-50:#e7f3ee;
  --ochre:#b9842b; --ochre-50:#f6ecd6; --ochre-line:#e4cf9f;
  --red:#b3261e; --red-50:#fbe9e7;
  --line:#e6e0d2; --line2:#d8d0bd; --white:#fffdf8;
  --shadow:0 24px 60px -28px rgba(20,40,30,.45), 0 4px 14px -6px rgba(20,40,30,.18);
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:var(--paper);
  font-family:'Plex',system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
#root{position:relative;width:1920px;height:1080px;
  background:
    radial-gradient(1200px 700px at 78% -8%, rgba(6,95,70,.10), transparent 60%),
    radial-gradient(900px 600px at 8% 108%, rgba(185,132,43,.10), transparent 60%),
    linear-gradient(180deg,var(--paper),var(--paper2));
}
.wordmark{position:absolute;top:54px;left:72px;display:flex;align-items:center;gap:16px;z-index:5}
.wordmark .mark{width:40px;height:40px;display:block}
.wordmark .name{font-family:'Sora';font-weight:700;font-size:30px;letter-spacing:-.4px;color:var(--ink)}
.kicker{position:absolute;top:60px;right:72px;font-family:'Mono';font-weight:500;font-size:19px;letter-spacing:3px;
  color:var(--emerald);text-transform:uppercase;opacity:.9;z-index:5}
.stage{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:2}
.caption{position:absolute;left:72px;bottom:96px;z-index:6;max-width:1500px}
.caption .chip{display:inline-flex;align-items:center;gap:12px;background:var(--emerald);color:var(--white);
  font-family:'Mono';font-weight:500;font-size:20px;letter-spacing:2px;text-transform:uppercase;
  padding:9px 18px;border-radius:999px;box-shadow:var(--shadow)}
.caption .chip .num{background:var(--ochre);color:#3a2a07;border-radius:999px;padding:1px 11px;font-size:18px}
.caption .line{margin-top:18px;font-family:'Sora';font-weight:600;font-size:46px;line-height:1.12;letter-spacing:-.6px;
  color:var(--ink);max-width:1400px}
.progress{position:absolute;left:72px;right:72px;bottom:58px;height:6px;display:flex;gap:7px;z-index:6}
.progress .seg{flex:1;height:6px;border-radius:4px;background:var(--line2)}
.progress .seg.on{background:var(--ochre)}
.progress .seg.done{background:var(--emerald)}

/* Spreadsheet */
.sheet{width:1480px;background:var(--white);border-radius:20px;box-shadow:var(--shadow);
  border:1px solid var(--line);overflow:hidden}
.sheet .tabs{display:flex;gap:6px;padding:16px 20px;background:linear-gradient(180deg,#fff,#fbf8f1);
  border-bottom:1px solid var(--line)}
.sheet .tab{font-family:'Plex';font-weight:600;font-size:20px;color:var(--muted);padding:9px 18px;border-radius:9px}
.sheet .tab.active{background:var(--emerald-50);color:var(--emerald)}
table{border-collapse:collapse;width:100%;table-layout:fixed}
th,td{border:1px solid var(--line);padding:0 18px;height:62px;text-align:left;font-size:24px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
th{background:var(--emerald-50);color:var(--emerald-d);font-family:'Plex';font-weight:600;font-size:21px;
  letter-spacing:.2px}
td{font-family:'Plex';font-weight:400;color:var(--ink)}
td.mono,th.mono{font-family:'Mono';font-weight:400}
td.num{font-family:'Mono';text-align:right}
.rowhead{width:64px;background:#f7f3ea;color:var(--muted);font-family:'Mono';font-size:18px;text-align:center;
  padding:0}
.colidx td,.colidx th{height:40px;background:#f7f3ea;color:var(--muted);font-family:'Mono';font-size:16px;
  text-align:center;font-weight:400;padding:0}
.hl-ochre{background:var(--ochre-50)!important;box-shadow:inset 0 0 0 2px var(--ochre)}
.hl-emerald{background:var(--emerald-50)!important;box-shadow:inset 0 0 0 2px var(--emerald)}
.hl-red{background:var(--red-50)!important;box-shadow:inset 0 0 0 2px var(--red);color:var(--red)!important}
.tag{display:inline-block;font-family:'Mono';font-size:18px;padding:2px 12px;border-radius:999px;font-weight:500}
.tag.yes{background:var(--ochre-50);color:#7a5410;border:1px solid var(--ochre-line)}
.tag.no{background:#eef0ec;color:var(--muted);border:1px solid var(--line2)}
.callout{position:absolute;z-index:7;background:var(--ink);color:var(--white);border-radius:14px;
  padding:18px 22px;font-family:'Plex';font-weight:500;font-size:26px;box-shadow:var(--shadow);max-width:520px;line-height:1.25}
.callout .k{font-family:'Mono';color:var(--ochre);font-size:18px;letter-spacing:2px;text-transform:uppercase;display:block;margin-bottom:6px}
.callout::after{content:"";position:absolute;width:18px;height:18px;background:var(--ink);transform:rotate(45deg)}
.bignum{font-family:'Mono';font-weight:500}
`;

// Build a spreadsheet table. cols: [{key,label,w,cls}]. rows: array of objects keyed by col.key (value may be {v,cls}).
export function sheet({ tabs = [], cols = [], rows = [], idPrefix = "c" }) {
  const tabHtml = tabs
    .map((t) => `<div class="tab ${t.active ? "active" : ""}">${t.label}</div>`)
    .join("");
  const colgroup = `<colgroup>${cols.map((c) => `<col style="width:${c.w || 200}px">`).join("")}</colgroup>`;
  const head = `<tr>${cols.map((c) => `<th class="${c.cls || ""}">${c.label}</th>`).join("")}</tr>`;
  const body = rows
    .map((r, ri) => {
      const cells = cols
        .map((c) => {
          const cell = r[c.key];
          const v = cell && typeof cell === "object" ? cell.v : (cell ?? "");
          const cls = cell && typeof cell === "object" ? cell.cls || "" : "";
          return `<td id="${idPrefix}-r${ri}-${c.key}" class="${c.cls === "num" ? "num" : ""} ${cls}">${v}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<div class="sheet"><div class="tabs">${tabHtml}</div><table>${colgroup}<thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// Progress bar with N segments; `done` segments emerald, `on` index ochre.
export function progress(n, current) {
  const segs = Array.from({ length: n }, (_, i) => {
    const cls = i < current ? "done" : i === current ? "on" : "";
    return `<div class="seg ${cls}"></div>`;
  }).join("");
  return `<div class="progress">${segs}</div>`;
}

// Full composition document.
export function doc({ id, duration, body, timeline, kicker = "Grant Budget Template" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=1920, height=1080"/>
<script src="../assets/gsap.min.js"></script>
<style>${FONT_FACES}${BASE_CSS}</style>
</head>
<body>
<div id="root" data-composition-id="${id}" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080">
  <div id="chrome-wordmark" class="wordmark clip" data-start="0" data-duration="${duration}" data-track-index="10"><img class="mark" src="../assets/grantpipe-mark.svg" alt="GrantPipe"/><div class="name">GrantPipe</div></div>
  <div id="chrome-kicker" class="kicker clip" data-start="0" data-duration="${duration}" data-track-index="11">${kicker}</div>
  ${body}
</div>
<script>
window.__timelines = window.__timelines || {};
(function(){
  const tl = gsap.timeline({ paused: true });
  const D = ${duration};
  ${timeline}
  window.__timelines["${id}"] = tl;
})();
</script>
</body>
</html>`;
}
