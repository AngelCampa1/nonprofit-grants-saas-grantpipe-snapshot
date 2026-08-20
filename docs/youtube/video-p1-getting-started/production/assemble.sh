#!/usr/bin/env bash
# Mux each chapter's narration onto its silent render, normalize loudness, then concat.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../output
AUD=../audio
CHAPTERS=(00 01 02 03 04 05)

for c in "${CHAPTERS[@]}"; do
  [ -f "$OUT/chapter-$c.silent.mp4" ] || { echo "MISSING $OUT/chapter-$c.silent.mp4"; exit 1; }
  echo "muxing chapter-$c"
  ffmpeg -y -loglevel error \
    -i "$OUT/chapter-$c.silent.mp4" -i "$AUD/chapter-$c.mp3" \
    -filter:a "loudnorm=I=-16:TP=-1.5:LRA=11" \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest \
    "$OUT/seg-$c.mp4"
done

# Build concat list
LIST="$OUT/concat.txt"; : > "$LIST"
for c in "${CHAPTERS[@]}"; do echo "file 'seg-$c.mp4'" >> "$LIST"; done

echo "concatenating -> getting-started.mp4"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
  "$OUT/getting-started.mp4"

echo "DONE"
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of default=noprint_wrappers=1 "$OUT/getting-started.mp4"
