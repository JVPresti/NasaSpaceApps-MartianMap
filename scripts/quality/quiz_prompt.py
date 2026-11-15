#!/usr/bin/env python3
"""Copy one screenshot to a neutral path and print the comprehension prompt: quiz_prompt.py <shots_dir> <state> <scratch_dir> <tag>"""
import json, os, shutil, sys
shots, state, scratch, tag = sys.argv[1:]
q = json.load(open(os.path.join(os.path.dirname(__file__), "quiz.json")))["states"][state]
d = os.path.join(scratch, tag, state); os.makedirs(d, exist_ok=True)
img = os.path.join(d, "screen.png"); shutil.copy(os.path.join(shots, state + ".png"), img)
qs = "\n".join(f'- {x["id"]}: {x["q"]}' for x in q["questions"])
ids = ", ".join(f'"{x["id"]}": "..."' for x in q["questions"])
open(os.path.join(d, "prompt.txt"), "w").write(f"""You are taking a comprehension test about one screenshot of a product. Only look at the image file named below with the Read tool. Do not open, search or read any other file, do not run commands, and do not edit anything.

Context: {q["context"]}
Screenshot (1366x768): {img}

Answer each question from the screenshot alone, as a person seeing this screen for the first time. If the screen does not tell you, say so instead of guessing.
{qs}

Then say what you looked at to answer, what confused you, and what would have let you answer faster.
Reply with strict JSON only, nothing around it:
{{"answers": {{{ids}}}, "looked_at": "...", "confused_by": "...", "faster_if": "..."}}
""")
print(os.path.join(d, "prompt.txt"))
