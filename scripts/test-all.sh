#!/bin/bash
set -euo pipefail

node --check cli/generate.cjs
npm test

if [[ "${IMAGEGEN2_LIVE_TEST:-}" == "1" ]]; then
  bash scripts/smoke-live.sh
else
  echo "Live smoke skipped. Set IMAGEGEN2_LIVE_TEST=1 to enable."
fi
