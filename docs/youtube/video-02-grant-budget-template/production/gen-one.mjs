// One-off: generate a single audio clip from a text arg to a named file.
// Used to add a chapter without re-spending the whole script's character budget.
// Usage: node gen-one.mjs <outfile.mp3> "<text>"
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = "/Users/angel/code/grantpipe/.env";
const VOICE_ID = "hpp4J3VqNfWAUOO0d1Us"; // Bella
const MODEL_ID = "eleven_multilingual_v2";
const VOICE_SETTINGS = {
  stability: 0.45,
  similarity_boost: 0.8,
  style: 0.15,
  use_speaker_boost: true,
  speed: 0.97,
};

const key = readFileSync(ENV_PATH, "utf8")
  .match(/^ELEVENLABS_API_KEY=(.+)$/m)[1]
  .trim();
const [, , out, text] = process.argv;
if (!out || !text) {
  console.error("usage: node gen-one.mjs <out.mp3> <text>");
  process.exit(1);
}
console.log(`chars: ${text.length} -> ${out}`);
const res = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
  {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL_ID, voice_settings: VOICE_SETTINGS }),
  },
);
if (!res.ok) {
  console.error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
writeFileSync(resolve(out), Buffer.from(await res.arrayBuffer()));
console.log("done");
