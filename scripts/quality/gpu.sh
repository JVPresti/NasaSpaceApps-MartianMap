#!/usr/bin/env bash
# Build and capture on this machine's GPU (QA_GPU=1, headed Chromium on WSLg, see capture.mjs).
#   scripts/quality/gpu.sh <name> [capture.mjs args...]
set -uo pipefail
name=${1:-current}; shift || true
cd "$(git rev-parse --show-toplevel)" || exit 1
npm run build --silent >/dev/null 2>&1 || { echo "build failed"; npm run build 2>&1 | tail -20; exit 1; }
QA_GPU=1 node scripts/quality/capture.mjs --out "scripts/quality/out/$name" "$@" 2>&1 | grep -v '^    at '
