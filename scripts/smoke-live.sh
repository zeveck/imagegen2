#!/bin/bash
set -euo pipefail

if [[ -z "${OPENAI_API_KEY:-}" && -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is missing; live image smoke skipped."
  exit 0
fi

OUT_DIR="${IMAGEGEN2_SMOKE_DIR:-/tmp/imagegen2-smoke}"
mkdir -p "$OUT_DIR"

node cli/generate.cjs \
  --prompt "A simple red circle on a blank background, no text" \
  --output "$OUT_DIR/red-circle.png" \
  --quality low \
  --size 1024x1024

node cli/generate.cjs \
  --prompt "Make the circle blue while preserving the same simple icon style" \
  --output "$OUT_DIR/blue-circle.png" \
  --image "$OUT_DIR/red-circle.png" \
  --quality low \
  --size 1024x1024

node cli/generate.cjs \
  --prompt "A simple red circle, centered, no text, solid flat #ff00ff chroma-key background, no shadows, no gradients, no background objects" \
  --output "$OUT_DIR/red-circle-transparent.png" \
  --background transparent \
  --transparent-mode chroma-key \
  --chroma-key '#ff00ff' \
  --quality low \
  --size 1024x1024

node - "$OUT_DIR/red-circle-transparent.png" <<'NODE'
const fs = require("fs");
const { parsePng } = require("./cli/generate.cjs");

const file = process.argv[2];
const image = parsePng(fs.readFileSync(file));
let transparent = 0;
let visible = 0;
const total = image.width * image.height;
for (let i = 0; i < image.rgba.length; i += 4) {
  if (image.rgba[i + 3] === 0) transparent++;
  if (image.rgba[i + 3] === 255) visible++;
}
if (transparent === 0) {
  throw new Error(`${file} has no transparent pixels after chroma-key cleanup`);
}
if (visible === 0) {
  throw new Error(`${file} has no fully visible pixels after chroma-key cleanup`);
}
if (transparent / total < 0.25) {
  throw new Error(`${file} only has ${transparent}/${total} transparent pixels after chroma-key cleanup`);
}
console.log(`Verified alpha in ${file}: ${transparent} transparent pixels, ${visible} visible pixels`);
NODE
