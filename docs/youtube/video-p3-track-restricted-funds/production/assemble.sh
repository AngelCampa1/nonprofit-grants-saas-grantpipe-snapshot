#!/usr/bin/env bash
# Mux each chapter's narration onto its silent render, normalize loudness, then join
# the chapters with a short cross-dissolve at every seam (no hard jump cuts).
#
# Seam handling: each chapter's audio has ~0.27s of leading silence and a quiet
# (<-44 dB) trailing tail, so an XF-second crossfade lands entirely on near-silence —
# it never clips a word onset. Video uses xfade(transition=fade); audio uses
# acrossfade with the SAME XF, so the joined video and audio totals stay identical
# (sum(seg) - 5*XF) and never drift. Because both sides shrink by XF per seam, caption
# starts shift earlier by ci*XF — gen-srt.mjs applies the same XF (keep them in sync).
set -euo pipefail
cd "$(dirname "$0")"
OUT=../output
AUD=../audio
CHAPTERS=(00 01 02 03 04 05 06)
XF=0.35   # cross-dissolve duration at each seam (video xfade + audio acrossfade)

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

# Probe muxed seg durations (drive the xfade offsets).
DURS=()
for c in "${CHAPTERS[@]}"; do
  DURS+=("$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/seg-$c.mp4")")
done

INPUTS=()
for c in "${CHAPTERS[@]}"; do INPUTS+=(-i "$OUT/seg-$c.mp4"); done

# Build chained xfade (video) + acrossfade (audio). Video xfade offset for appending
# seg i = (sum of seg 0..i-1) - i*XF, relative to the accumulated stream.
N=${#CHAPTERS[@]}
FILTER=""
prev_v="[0:v]"
prev_a="[0:a]"
cum=0
for ((i=1; i<N; i++)); do
  cum=$(awk -v a="$cum" -v b="${DURS[$((i-1))]}" 'BEGIN{printf "%.6f", a+b}')
  off=$(awk -v c="$cum" -v i="$i" -v x="$XF" 'BEGIN{printf "%.6f", c - i*x}')
  outv="[v$i]"; outa="[a$i]"
  FILTER+="${prev_v}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off}${outv};"
  FILTER+="${prev_a}[${i}:a]acrossfade=d=${XF}:c1=tri:c2=tri${outa};"
  prev_v="$outv"; prev_a="$outa"
done

echo "joining with ${XF}s cross-dissolves -> track-restricted-funds.mp4"
ffmpeg -y -loglevel error "${INPUTS[@]}" \
  -filter_complex "$FILTER" \
  -map "$prev_v" -map "$prev_a" \
  -c:v libx264 -preset medium -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart \
  "$OUT/track-restricted-funds.mp4"

echo "DONE"
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of default=noprint_wrappers=1 "$OUT/track-restricted-funds.mp4"
