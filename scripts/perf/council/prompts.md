# Plan phase council prompts

Each judge is a fresh agent with no other context. The orchestrator copies the images into a neutral folder, so no
file name gives away a build, and fills in the persona. Builds of #282 are what ships. Judges never see scores, and
never give one.

## Product

Marswalk is a first-person EVA simulator set in Jezero crater on Mars, at the rock where Perseverance found a
potential biosignature. Before going out, the crew plans the walk at a mission table in the habitat: the site, the
route on a flat map with data layers, the hazards for this run, and a suit check with a go or no-go. Then they walk
the route in a suit with limited oxygen and a walkback margin.

## Personas

1. A first-time player who is also a NASA Space Apps judge. No Mars background. Has 2 minutes of live demo and
   decides whether this looks like a finished, professional product.
2. An EVA mission planner. Checks whether the table supports a real go or no-go decision: where the crew goes,
   what can hurt them on the way, how long it takes, what margin is left, and what each map layer means.
3. A visual and interaction designer. Holds the table to its design system (#232): dark cool panels
   (`--panel` rgba(12,16,22,0.8)), square corners (2 to 3 px), one orange main action per screen
   (`--accent` #ff6a2b), cyan for the route (`--cyan` #2bffed), alert colours only for alerts and margins, Barlow and
   Barlow Condensed, tabular numbers, sentence case, 11 px minimum text. Also judges motion: does dragging, zooming
   and switching feel immediate and smooth.

## Critique round

The judge gets: the four steps of the table (Site, Route, Hazards, Suit) at 1366x768, the Route step with a data
layer on, and filmstrips of a map drag, a map zoom, a tab switch and a layer toggle. Each filmstrip has 6 frames
with the time since the input under each frame and the longest gap between frames in the title (a gap over 50 ms
is a visible hitch). Then the comprehension quiz on the Route screenshot, answered before reading anything else.

Return strict JSON only:

{"quiz": {"where": "...", "safe": "...", "how_long": "...", "layer_meaning": "..."},
 "findings": [{"screen": "...", "where": "...", "problem": "...", "severity": "blocker" | "major" | "minor",
   "why": "...", "fix": "..."}],
 "demo_as_is": {"yes": true | false, "why": "..."}}

At most 6 findings, most serious first. blocker: someone would not understand what to do, would miss a danger, would
get a quiz question wrong, or it looks broken or stuck. major: a Space Apps judge or a planner would notice within
2 minutes that it is confusing, clunky or amateur. minor: polish.

## Quiz (one screenshot of the Route step)

- where: Where is the crew going? Name the destination.
- safe: Is the route safe to walk right now? Yes or no, and what on screen tells you.
- how_long: How long will the EVA take?
- layer_meaning: What does the map layer that is switched on show, and what do its colours mean?

## A/B round

Two builds of the same moment, as A and B in random order per judge. Strict JSON only:

{"prefer": "A" | "B" | "neither", "why": "2 to 4 sentences on what you see", "better": ["..."], "worse": ["..."],
 "next": "the one concrete change you would make now"}

`worse` must name anything important (destination, route, go or no-go, time, margin, hazard, layer meaning) that one
build shows and the other hides or makes harder to find. A change is kept only when 2 of 3 judges prefer it and
nobody names lost information.
