// Generates per-chapter voiceover MP3s from script-final.md via ElevenLabs.
// Reads ELEVENLABS_API_KEY from the main checkout .env (worktrees don't carry the gitignored .env).
// Usage:
//   node voiceover.mjs --dry-run     # parse + char counts only, no API spend
//   node voiceover.mjs               # generate audio/chapter-NN.mp3

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, "../script-final.md");
const AUDIO_DIR = resolve(__dirname, "../audio");
const ENV_PATH = "/Users/angel/code/grantpipe/.env";

const VOICE_ID = "hpp4J3VqNfWAUOO0d1Us"; // Bella — female, professional/bright/warm, American, educational (free-tier usable)
const MODEL_ID = "eleven_multilingual_v2";
const VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.15,
  use_speaker_boost: true,
  speed: 0.97,
};

function loadKey() {
  const env = readFileSync(ENV_PATH, "utf8");
  const m = env.match(/^ELEVENLABS_API_KEY=(.+)$/m);
  if (!m) throw new Error("ELEVENLABS_API_KEY not found in " + ENV_PATH);
  return m[1].trim();
}

// Parse script into chapters. A chapter starts at a "### " heading.
// Narration = non-blank lines that are not headings, VISUAL cues, blockquotes, bold meta, or hr.
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

async function tts(key, text, outPath) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 400)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(outPath, buf);
  return buf.length;
}

const dryRun = process.argv.includes("--dry-run");
const md = readFileSync(SCRIPT, "utf8");
const chapters = parseChapters(md);

const total = chapters.reduce((n, c) => n + c.text.length, 0);
console.log(`Parsed ${chapters.length} chapters. Total narration chars: ${total}`);
for (const c of chapters) {
  console.log(`  [${c.id}] ${String(c.text.length).padStart(4)} chars  ${c.slug}`);
}

if (dryRun) {
  console.log("\nDry run only. No API calls made.");
  process.exit(0);
}

if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
const key = loadKey();

const manifest = [];
for (const c of chapters) {
  const out = resolve(AUDIO_DIR, `chapter-${c.id}.mp3`);
  process.stdout.write(`Generating chapter ${c.id} (${c.text.length} chars)... `);
  const bytes = await tts(key, c.text, out);
  console.log(`${(bytes / 1024).toFixed(0)} KB`);
  manifest.push({
    id: c.id,
    title: c.title,
    slug: c.slug,
    chars: c.text.length,
    file: `audio/chapter-${c.id}.mp3`,
    text: c.text,
  });
}
writeFileSync(resolve(AUDIO_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nDone. ${chapters.length} files in audio/. Manifest written.`);
