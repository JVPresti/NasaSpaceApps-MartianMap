# Council rubric

Judge the two screenshots, A and B, of the same moment in the product. Both are captured at 1366x768.
Weigh these six things, in this order of importance:

1. Clarity of the important information. Can the player read at a glance what matters for this moment
   (oxygen or return margin, where to go and how far, heading, any active danger; on the planning table,
   the route and whether it is a go; in the debrief, how the walk went)?
2. Visual hierarchy. Does the eye land on the most important thing first, and on secondary things later?
3. Clutter and density. Is there more on screen than the moment needs? Do panels crowd, cover or
   compete with each other or with the view of the terrain?
4. Consistency with the visual system. Do panels, type, colours, corners and labels look like one
   designed system, or like pieces from different hands?
5. Legibility at 1366x768. Is the text large enough and with enough contrast to read on a laptop?
6. Professional or amateur. Would this pass as a finished product in a 30 second demo video?

Answer with strict JSON only, no prose around it and no scores:

{"prefer": "A" | "B" | "neither", "why": "2-4 sentences explaining what you see", "better": ["..."], "worse": ["..."], "next": "the one concrete change you would make to this screen now"}

Use "neither" when neither is better or both have a serious problem. `worse` must name anything important
(oxygen, margin, waypoint, distance, heading, an active danger, the route, go or no-go, the debrief results)
that is visible in one screenshot and missing or harder to find in the other, and say which one lost it.
