// Rebuild durations.json from the generated audio files.
// Probes each audio/chapter-NN.mp3 with ffprobe, accumulates start offsets,
// and pulls labels from audio/manifest.json (written by voiceover.mjs).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = resolve(__dirname, "../audio");
const manifest = JSON.parse(readFileSync(resolve(AUDIO_DIR, "manifest.json"), "utf8"));

function probe(file) {
  const out = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Math.round(parseFloat(out.toString().trim()) * 1000) / 1000;
}

let start = 0;
const chapters = manifest.map((m) => {
  const file = resolve(AUDIO_DIR, `chapter-${m.id}.mp3`);
  if (!existsSync(file)) throw new Error(`missing audio file: ${file}`);
  const duration = probe(file);
  const entry = {
    id: m.id,
    label: m.title,
    audio: `audio/chapter-${m.id}.mp3`,
    duration,
    start: Math.round(start * 1000) / 1000,
  };
  start += duration;
  return entry;
});

const durations = { total: Math.round(start * 1000) / 1000, chapters };
writeFileSync(resolve(__dirname, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
console.log(
  `wrote durations.json — ${chapters.length} chapters, total ${durations.total}s (${(durations.total / 60).toFixed(2)} min)`,
);
