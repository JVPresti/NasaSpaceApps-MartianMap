#!/usr/bin/env python3
"""Print the A/B judge prompt for one judge: ab_prompt.py <scratch_round_judge_dir> <persona a|b|c> <state>..."""
import os, sys
d, persona, *states = sys.argv[1:]
P = {"a": "a NASA Space Apps judge who watches a 30 second video and 2 minutes of live demo and decides whether the project looks professional",
     "b": "a game UI and HUD designer who looks at hierarchy, legibility, density and consistency",
     "c": "a first-time player who has to understand what to do next and whether they are in danger"}
D = {"walk": "walking outside the habitat toward the first waypoint", "walk-stop": "just arrived at a science stop, its card is open",
     "walk-storm": "a dust storm event has just started", "wrist": "the wrist screen is raised", "debrief": "the end-of-EVA debrief",
     "table-route": "the mission planning table, Route tab", "pause": "the pause menu", "start": "the start screen"}
rubric = open(os.path.join(os.path.dirname(__file__), "rubric.md")).read().split("\n", 2)[2]
pairs = "\n".join(f"- {s} ({D.get(s, s)}): {os.path.join(d, s, 'A.png')} and {os.path.join(d, s, 'B.png')}" for s in states)
print(f"""You are a judge comparing two versions of the same screen of a product. Only look at the image files named below with the Read tool. Do not open, search or read any other file, do not run commands, and do not edit anything.

Product: Marswalk is a first-person EVA simulator set in Jezero crater on Mars, at the rock where Perseverance found a potential biosignature. The player first plans the walk at a mission table, then walks the route in a suit with limited oxygen and a walkback margin, reacting to events like dust storms and stopping at science sites.

Your persona: {P[persona]}.

For each moment below there are two screenshots, A and B, of the same moment. Live values (times, distances, oxygen) can differ slightly between A and B because they were captured on different runs; judge the design, not those small number differences.
{pairs}

{rubric}
Return one JSON object per moment, keyed by the moment name, strict JSON only, nothing around it:
{{"{states[0]}": {{"prefer": "A|B|neither", "why": "...", "better": ["..."], "worse": ["..."], "next": "..."}}{''.join(', "' + s + '": {...}' for s in states[1:])}}}""")
