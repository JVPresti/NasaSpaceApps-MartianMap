#!/usr/bin/env bash
# Conflict gate: replay the given commits on origin/main in a throwaway index (no checkout), then check that the
# result merges cleanly with origin/main, #282 and feat/habitat-flow.  gate.sh <commit>...
set -uo pipefail
base=$(git rev-parse origin/main); tip=$base
for c in "$@"; do
  tree=$(git merge-tree --write-tree --merge-base "$c^" "$tip" "$c" 2>/dev/null) || { echo "replay of $c on main: CONFLICT"; git merge-tree --write-tree --name-only --merge-base "$c^" "$tip" "$c" | grep CONFLICT; exit 1; }
  tip=$(git commit-tree "$tree" -p "$tip" -m gate)
done
# a branch that already conflicts with main keeps those files; only conflicts the commits add count
conflicts() { git merge-tree --write-tree --name-only "$1" "$2" 2>/dev/null | grep '^CONFLICT' | sort; }
ok=0
for r in pr282 feat/habitat-flow; do
  new=$(comm -13 <(conflicts "$r" "$base") <(conflicts "$r" "$tip"))
  if [ -z "$new" ]; then echo "$r: no new conflicts"; else echo "$r: NEW CONFLICT"; echo "$new"; ok=1; fi
done
exit $ok
