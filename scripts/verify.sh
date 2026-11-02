#!/bin/bash
# Verification gates. Run before every commit: bash scripts/verify.sh
set -e
cd "$(dirname "$0")/.."
echo "[verify] tsc --noEmit"
npx tsc --noEmit
echo "[verify] vite build"
npm run build -- --logLevel warn 2>&1 | tail -3
echo "[verify] named-error lint (parser must only throw E_* errors)"
if grep -rn "throw new Error('" src/api/ | grep -v "E_" ; then
  echo "[verify] FAIL: unnamed error found in src/api"
  exit 1
fi
echo "[verify] ALL GATES PASSED"
