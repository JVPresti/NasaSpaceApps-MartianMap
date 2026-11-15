#!/usr/bin/env bash
# Build and capture on the Windows side of a WSL machine (Windows node and Chrome, real GPU), for when WSL is too
# loaded to build or start Chromium. Mirrors the sources into C:\Temp\mwbuild (npm ci run there once), builds with
# Windows node, runs capture.mjs and copies the screenshots and metrics back to scripts/quality/out/<name>.
#   scripts/quality/win.sh <name> [capture.mjs args...]
set -uo pipefail
name=${1:-current}; shift || true
root=$(git rev-parse --show-toplevel)
win=/mnt/c/Temp/mwbuild
rm -rf "$win/src" "$win/out/$name"
cp -r "$root/src" "$win/src"
cp "$root/package.json" "$root/vite.config.js" "$root/index.html" "$win/"
mkdir -p "$win/scripts/quality"
cp "$root/scripts/quality/capture.mjs" "$win/scripts/quality/capture.mjs"
cd "$win" || exit 1
cmd.exe /c "npx vite build --logLevel error" 2>&1 | tail -3
cmd.exe /c "node scripts\\quality\\capture.mjs --out out\\$name $*" 2>&1 | grep -v '^    at '
mkdir -p "$root/scripts/quality/out/$name"
cp -r "$win/out/$name/." "$root/scripts/quality/out/$name/" 2>/dev/null
