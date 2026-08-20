// Generates per-chapter voiceover MP3s from a script markdown file via Google Gemini TTS (Vertex AI).
//
// Auth: uses Application Default Credentials (ADC), NOT an API key.
//   The repo's gcloud *core* login is dead ("account deleted"), so we mint a token via
//   `gcloud auth application-default print-access-token` (authed as whichever Google account
//   ran `gcloud auth application-default login` for this project).
//   ADC tokens last ~1h — fine for a full script run. Re-run if you see 401s on a long batch.
//
// Output: Gemini returns base64 PCM (audio/L16, 24kHz, mono). We pipe it through ffmpeg → MP3
//   so the files match the ElevenLabs pipeline's audio/chapter-NN.mp3 layout.
//
// Usage (run from a video's production/ folder, mirroring the ElevenLabs voiceover.mjs):
//   node ../../_lib/voiceover-gemini.mjs --dry-run                 # parse + char counts, no API/spend
//   node ../../_lib/voiceover-gemini.mjs                          # generate ./audio/chapter-NN.mp3
//   node ../../_lib/voiceover-gemini.mjs --script ./script-final.md --out ./audio
//   node ../../_lib/voiceover-gemini.mjs --voice Charon --chapters 0,1   # voice override + subset (A/B)
//
// Config via env (all have sensible defaults):
//   GOOGLE_TTS_PROJECT   (default core-stronghold-498211-g7 — free-trial project)
//   GOOGLE_TTS_LOCATION  (default us-central1)
//   GOOGLE_TTS_MODEL     (default gemini-3.1-flash-tts-preview — Vertex publisher model, us-central1)
//   GOOGLE_TTS_VOICE     (default Laomedeia — chosen channel voice; female, non-generic)
//   GOOGLE_TTS_STYLE     (default below — lively human host, the GrantPipe register)

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const PROJECT = process.env.GOOGLE_TTS_PROJECT || "core-stronghold-498211-g7";
const LOCATION = process.env.GOOGLE_TTS_LOCATION || "us-central1";
const MODEL = process.env.GOOGLE_TTS_MODEL || "gemini-3.1-flash-tts-preview";
const VOICE = process.env.GOOGLE_TTS_VOICE || "Laomedeia";
const STYLE =
  process.env.GOOGLE_TTS_STYLE ||
  "Narrate like a real human host with personality and conviction — natural conversational delivery, genuine variation in pitch, pace, and emphasis. Lean into the important words, let the rhythm breathe. Brisk and engaged, never a flat even AI-narrator cadence.";

// ---- CLI args ----
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const dryRun = argv.includes("--dry-run");
const SCRIPT = resolve(process.cwd(), flag("--script") || "../script-final.md");
const AUDIO_DIR = resolve(process.cwd(), flag("--out") || "./audio");
const voice = flag("--voice") || VOICE;
const chapterFilter = flag("--chapters"); // e.g. "0,1,4"

// ---- ADC token ----
function loadToken() {
  try {
    return execFileSync("gcloud", ["auth", "application-default", "print-access-token"], {
      encoding: "utf8",
    }).trim();
  } catch (e) {
    throw new Error(
      "Could not get ADC token. Run `gcloud auth application-default login` (with the Google account authorized for this project).\n" +
        (e.stderr || e.message),
      { cause: e },
    );
  }
}

// ---- Script parsing (mirrors the ElevenLabs voiceover.mjs chapter logic) ----
// A chapter starts at a "### " heading. Narration = non-blank lines that are not headings,
// VISUAL cues, blockquotes, bold meta, or horizontal rules.
function parseChapters(md) {
  const lines = md.split("\n");
  const chapters = [];
  let current = null;
  const isCue = (s) =>
    s.startsWith("#") ||
    s.startsWith("[VISUAL") ||
    s.startsWith(">") ||
    s.startsWith("**") ||
    s.startsWith("---");
  for (const raw of lines) {
    const s = raw.trim();
    if (s.startsWith("### ")) {
      const title = s.replace(/^###\s+/, "");
      const slug = title
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
      current = { title, slug, narration: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue;
    if (!s || isCue(s)) continue;
    current.narration.push(s);
  }
  return chapters
    .map((c, i) => ({
      index: i,
      id: String(i).padStart(2, "0"),
      title: c.title,
      slug: c.slug,
      text: c.narration.join(" ").replace(/\s+/g, " ").trim(),
    }))
    .filter((c) => c.text.length > 0);
}

// ---- Gemini TTS call → raw PCM buffer ----
async function tts(token, text) {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: "user", parts: [{ text: `${STYLE}\n\n${text}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  // Retry on transient 404/429/5xx (the freshly-enabled API throttles bursts).
  let lastErr = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        // Required for preview publisher models (e.g. gemini-3.1-flash-tts-preview);
        // without it Vertex returns 404 even though the model is listed for the project.
        "x-goog-user-project": PROJECT,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json();
      const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      const b64 = part?.inlineData?.data;
      if (!b64) throw new Error("No audio in response: " + JSON.stringify(json).slice(0, 300));
      return Buffer.from(b64, "base64");
    }
    lastErr = `${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (![404, 429, 500, 503].includes(res.status)) break;
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  throw new Error(`Gemini TTS failed after retries — ${lastErr}`);
}

// ---- PCM (L16/24kHz/mono) → MP3 via ffmpeg ----
function pcmToMp3(pcm, outPath) {
  const tmp = outPath.replace(/\.mp3$/, ".pcm");
  writeFileSync(tmp, pcm);
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", tmp, "-b:a", "192k", outPath],
    { encoding: "utf8" },
  );
  rmSync(tmp, { force: true });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + (r.stderr || r.error?.message));
}

// ---- Main ----
const md = readFileSync(SCRIPT, "utf8");
let chapters = parseChapters(md);
if (chapterFilter) {
  const keep = new Set(chapterFilter.split(",").map((n) => n.trim()));
  chapters = chapters.filter((c) => keep.has(String(c.index)));
}

const total = chapters.reduce((n, c) => n + c.text.length, 0);
console.log(`Model: ${MODEL} | Voice: ${voice} | Project: ${PROJECT} (${LOCATION})`);
console.log(`Parsed ${chapters.length} chapters. Total narration chars: ${total}`);
for (const c of chapters) {
  console.log(`  [${c.id}] ${String(c.text.length).padStart(4)} chars  ${c.slug}`);
}

if (dryRun) {
  console.log("\nDry run only. No API calls made.");
  process.exit(0);
}

if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
const token = loadToken();

const manifest = [];
for (const c of chapters) {
  const out = resolve(AUDIO_DIR, `chapter-${c.id}.mp3`);
  process.stdout.write(`Generating chapter ${c.id} (${c.text.length} chars)... `);
  const pcm = await tts(token, c.text);
  pcmToMp3(pcm, out);
  const bytes = readFileSync(out).length;
  console.log(`${(bytes / 1024).toFixed(0)} KB`);
  manifest.push({
    id: c.id,
    title: c.title,
    slug: c.slug,
    chars: c.text.length,
    voice,
    model: MODEL,
    file: `audio/chapter-${c.id}.mp3`,
    text: c.text,
  });
}
writeFileSync(resolve(AUDIO_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nDone. ${chapters.length} files in ${AUDIO_DIR}. Manifest written.`);
