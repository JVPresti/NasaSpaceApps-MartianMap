#!/usr/bin/env python3
"""Prepare a blind A/B round: copies before/after screenshots per judge into neutral A.png/B.png files in a
scratch folder, random order per judge and state, and writes the mapping to council/<round>.json.
   prep_round.py <round> <before_dir> <after_dir> <scratch_dir> <state> [<state>...]"""
import json, os, random, shutil, sys
rnd, before, after, scratch, *states = sys.argv[1:]
out = {"round": rnd, "before": before, "after": after, "states": states, "judges": {}}
for j in ("j1", "j2", "j3"):
    out["judges"][j] = {}
    for s in states:
        d = os.path.join(scratch, rnd, j, s)
        os.makedirs(d, exist_ok=True)
        new_is_a = random.random() < 0.5
        shutil.copy(os.path.join(after if new_is_a else before, s + ".png"), os.path.join(d, "A.png"))
        shutil.copy(os.path.join(before if new_is_a else after, s + ".png"), os.path.join(d, "B.png"))
        out["judges"][j][s] = {"new": "A" if new_is_a else "B"}
path = os.path.join(os.path.dirname(__file__), "council", rnd + ".json")
json.dump(out, open(path, "w"), indent=1)
print(json.dumps({j: {s: v["new"] for s, v in m.items()} for j, m in out["judges"].items()}))
