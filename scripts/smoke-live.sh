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
