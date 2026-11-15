#!/usr/bin/env bash
# Builds one git ref with the ?qa=1 hooks of #277 (src/qa.js) into scripts/perf/out/dist-<name>, for plan.mjs.
#
#   scripts/perf/build.sh <ref> <name>        e.g. scripts/perf/build.sh origin/main main
#
# The ref is checked out in a throwaway worktree with this checkout's node_modules linked in, so the build never
# touches the working tree. The qa hooks are added only when the ref does not have them yet. Not minified,
# so the React commit counter can name the components; React itself is still the production build.
set -euo pipefail
ref=$1; name=$2
root=$(git rev-parse --show-toplevel)
out=$root/scripts/perf/out/dist-$name
tmp=$(mktemp -d "${TMPDIR:-/tmp}/perf-build-XXXX")
trap 'git -C "$root" worktree remove --force "$tmp" >/dev/null 2>&1 || rm -rf "$tmp"' EXIT
git -C "$root" worktree add --detach "$tmp" "$ref" >/dev/null 2>&1
ln -s "$root/node_modules" "$tmp/node_modules"
cd "$tmp"
# the ?qa=1 hooks of #277 (src/qa.js): the store on window and window.__marswalk in a production build
if ! grep -q exposeQaHooks src/main.jsx; then
  cp "$root/scripts/perf/qa.js" src/qa.js
  printf "\nimport { exposeQaHooks } from './qa.js'\nexposeQaHooks()\n" >> src/main.jsx
  sed -i "s/debug: import.meta.env.DEV,/debug: import.meta.env.DEV || new URLSearchParams(location.search).get('qa') === '1',/" src/components/EngineView.jsx
fi
rm -rf "$out"
npx vite build --minify false --outDir "$out" --emptyOutDir --logLevel warn
echo "$(git -C "$tmp" rev-parse --short HEAD) $ref" > "$out/REF"
echo "built $ref -> $out"
