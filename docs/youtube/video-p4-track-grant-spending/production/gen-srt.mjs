// Generate captions.srt by distributing each chapter's narration sentences
// across that chapter's audio span (proportional to character length).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(resolve(__dirname, "../script-final.md"), "utf8");
const durations = JSON.parse(readFileSync(resolve(__dirname, "durations.json"), "utf8")).chapters;

// assemble.sh joins chapters with an XFADE-second cross-dissolve at each seam, which
// pulls chapter ci earlier by ci*XFADE in the final timeline. Apply the same shift here
// so captions stay aligned to the joined audio. MUST match XF in assemble.sh.
const XFADE = 0.35;

// parse narration per chapter (same rules as voiceover.mjs)
const isCue = (s) =>
  s.startsWith("#") ||
  s.startsWith("[VISUAL") ||
  s.startsWith(">") ||
  s.startsWith("**") ||
  s.startsWith("---");
const chapters = [];
let cur = null;
for (const raw of md.split("\n")) {
  const s = raw.trim();
  if (s.startsWith("### ")) {
    cur = { narration: [] };
    chapters.push(cur);
    continue;
  }
  if (!cur || !s || isCue(s)) continue;
  cur.narration.push(s);
}
const chapText = chapters
  .map((c) => c.narration.join(" ").replace(/\s+/g, " ").trim())
  .filter(Boolean);

if (chapText.length !== durations.length) {
  console.warn(`chapter count mismatch: text=${chapText.length} durations=${durations.length}`);
}

function splitSentences(t) {
  // split on sentence boundaries, keep reasonable caption lengths (merge very short, split very long).
  // The trailing ["')\]] class keeps a closing quote/paren attached to the sentence it closes,
  // so a line like `you click "Add grant."` is never split into `... "Add grant.` + `"`.
  let parts = t.match(/[^.!?]+[.!?]+["'”’)\]]*/g) || [t];
  parts = parts.map((p) => p.trim());
  const out = [];
  for (let p of parts) {
    // split overly long sentences (>110 chars) at commas
    if (p.length > 110 && p.includes(",")) {
      const sub = p.split(/,\s*/);
      let buf = "";
      for (const seg of sub) {
        if ((buf + ", " + seg).length > 90 && buf) {
          out.push(buf.trim());
          buf = seg;
        } else buf = buf ? buf + ", " + seg : seg;
      }
      if (buf) out.push(buf.trim());
    } else out.push(p);
  }
  return out;
}

function fmt(t) {
  // Work in integer milliseconds so a rounded fractional second can never carry to
  // a 4-digit "1000" ms field (the old `Math.round((t % 1) * 1000)` produced 00:00:31,1000).
  let total = Math.round(t * 1000);
  const ms = total % 1000;
  total = (total - ms) / 1000;
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

let idx = 1;
const lines = [];
for (let ci = 0; ci < chapText.length; ci++) {
  const text = chapText[ci];
  const { start, duration } = durations[ci];
  const aStart = start - ci * XFADE; // crossfade pulls each chapter earlier
  // Cap this chapter's cues at the next chapter's crossfade-shifted start so the last line
  // never bleeds past it. Without this, the seam crossfade leaves two captions on screen
  // for XFADE seconds at every chapter boundary.
  const nextStart =
    ci + 1 < durations.length ? durations[ci + 1].start - (ci + 1) * XFADE : Infinity;
  const capEnd = Math.min(aStart + duration, nextStart);
  const sents = splitSentences(text);
  const totalChars = sents.reduce((n, s) => n + s.length, 0) || 1;
  let t = aStart;
  for (const sent of sents) {
    const dur = (sent.length / totalChars) * duration;
    const end = t + dur;
    lines.push(`${idx}`);
    lines.push(`${fmt(t)} --> ${fmt(Math.min(end, capEnd))}`);
    lines.push(sent);
    lines.push("");
    idx++;
    t = end;
  }
}
writeFileSync(resolve(__dirname, "../output/captions.srt"), lines.join("\n"));
console.log(`wrote output/captions.srt (${idx - 1} cues)`);
