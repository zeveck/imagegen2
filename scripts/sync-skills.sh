#!/bin/bash
# Copy the canonical CLI and reference into every bundled skill folder.
set -euo pipefail
cd "$(dirname "$0")/.."
for dir in skills/imagegen2 .codex/skills/imagegen2 .gemini/skills/imagegen2; do
  cp cli/generate.cjs cli/reference.md "$dir/"
done
echo "Synced cli/generate.cjs and cli/reference.md into skill folders."
