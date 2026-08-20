#!/usr/bin/env bash
# Render every chapter composition to a silent MP4 at standard quality.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ../output
QUALITY="${1:-standard}"
CHAPTERS=(00 01 02 03 04 05 06)
for c in "${CHAPTERS[@]}"; do
  echo "=== rendering chapter-$c ($QUALITY) ==="
  npx --yes hyperframes@0.6.29 render . -c "compositions/chapter-$c.html" \
    -o "../output/chapter-$c.silent.mp4" -q "$QUALITY" -f 30 -w 2 --quiet
done
echo "ALL CHAPTERS RENDERED"
