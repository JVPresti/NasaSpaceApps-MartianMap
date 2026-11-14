# Marswalk graphics assets: terrain (Cheyava Falls, Neretva Vallis, Jezero)

Status: terrain asset finished 2026-11-12. This folder is a three.js TEST BENCH for the assets, not the product.
The files in assets/ are what the project reuses; index.html + main.js only prove they load, look right and run fast.

## Run the test bench
Serve this folder with any static server (`npx serve .`) and open index.html.
Rebuild after editing src/: `npm i three esbuild`, then
`npx esbuild src/main.js --bundle --minify --format=iife --outfile=main.js`

## Coordinates
x = east, y = up, z = south, metres, true ground scale. Origin = Cheyava Falls
(Perseverance waypoint sol 1210, 18.4975 N, 77.3053 E). The detailed tile is 1422.5 m (E-W) x 1500 m (N-S).
Heights are relative to the lowest point of the tile (base_elev_m in terrain.json = -2393.37 m MOLA).
HiRISE files are stretched 5.4 % east-west (equirectangular, lat_ts = 0); everything here is already corrected.

## assets/
| File | What it is |
|---|---|
| terrain.json | 751x751 heights (Uint16 base64, 2 m spacing) + 256x256 brightness map used for rock density. The routing team can read this directly. |
| ring.json | 241x241 heights (50 m spacing) for the 12 km background terrain (CTX). |
| ortho_hi.jpg / ortho_lo.jpg | HiRISE orthomosaic, grayscale (3000 px / 1500 px). The Mars colour ramp is applied in the shader. |
| normal_ao.jpg | R,B = world-space normal x,z from the 1 m DEM; G = baked ambient occlusion. |
| outcrop_mask.jpg | Where light-toned outcrop is (from HiRISE brightness). Drives the slab detail and the Outcrop layer. |
| gravel_nl.jpg, slab_nl.jpg | Close-up detail, 2 m tiles. R,G = normal map (GL), B = sqrt(luminance). |
| ring_gray.jpg | CTX mosaic for the background, brightness-matched to HiRISE. |
| rocks.json + rock_*.jpg, namaqualand_*.jpg | 5 rock scans x 3 detail levels (500 / 120 / 28 triangles), normalised to 1 m longest side. |
| cheyava.json + cheyava_color.jpg, cheyava_nao.jpg | Cheyava Falls rock (10k triangles). nao: R,G = tangent normal, B = AO. |
| atmosphere_presets.json | Sky, sun, fog, exposure, helmet lamp for: clear_day, dust_storm, late_afternoon, night. Linear RGB. The lamp has half_distance_m (4) and range_m (30): it fades to nothing at 30 m, like a helmet work light. |
| route.json | Waypoints (placeholders). Add "path": [[x,z],...] to draw a real route instead of the built-in test planner. |

## src/
- shaders.js: all GLSL. COMMON (lighting, fog, lamp) is shared by every material. Terrain shader has detail fade,
  outcrop slabs, edge blend to the background, sun shadows, and the data layers
  (uLayer: 0 none, 1 slope hazard, 2 elevation + 5 m contours, 3 rock abundance, 4 outcrop).
- main.js: loading, terrain mesh, background ring, sky, CPU sun-shadow map, rock placement, tiers, views.

## How the rocks work
Placed around the camera in 16 m cells, deterministic (same rocks every run). Counts per m2 follow the Golombek
Mars rock size-frequency model at about 5 % cover, thinned by HiRISE brightness (more on outcrop, fewer on sand).
Detail level is chosen by apparent size; rocks grow in over the last 20 % of their draw radius.

## Tiers
| | High | Low |
|---|---|---|
| Terrain grid | 501x501 | 189x189 |
| Rock radius (pebble / small / medium) | 12 / 55 / 180 m | 0 / 28 / 110 m |
| Typical load | 1.25 M triangles, 19k rocks | 0.42 M triangles, 6k rocks |
Close Blender or set its viewport to Solid before measuring: a Rendered viewport takes the GPU.

### How the app picks a tier
- At load, from the GPU name (`detectTier` in `src/engine/tiers.js`). Intel and mobile GPUs and AMD integrated graphics
  ("AMD Radeon(TM) Graphics", "Radeon Vega") start on Low. Discrete cards and newer named APUs (for example "Radeon 780M") start on High.
- While running, three slow seconds in a row on High (under 40 fps) switch to Low. There is no switch back up.
- Manual override: add `?tier=high` or `?tier=low` to the URL. It forces that tier and turns off the automatic switch.
  An unknown value is ignored with a console warning.

### Measured frame rate
`npm run measure` starts the dev server, opens a visible Chrome (or Edge if Chrome is not installed) at the screen's size,
and measures each tier for 10 s per situation. Frame times come from requestAnimationFrame; "1 % low" is the frame rate of
the slowest 1 % of frames. Add a row group for your machine when you measure. Plug in the laptop and close Blender first.

Ryzen 5 5600H laptop, AMD Radeon integrated graphics (Vega), Edge 157 (Chrome not installed), window 1672 x 988 CSS px
at pixel ratio 1.5, on AC power, Windows balanced power plan. Measured 2026-11-14.

| Tier | Situation | fps | 1 % low |
|---|---|---|---|
| High | Walk, standing outdoors | 60 | 58 |
| High | Walk, walking outdoors | 59 | 30 |
| High | Walk, inside the habitat | 41 | 15 |
| High | Plan | 59 | 30 |
| Low | Walk, standing outdoors | 60 | 57 |
| Low | Walk, walking outdoors | 60 | 58 |
| Low | Walk, inside the habitat | 58 | 30 |
| Low | Plan | 60 | 58 |

Result: Low holds the 30 fps target everywhere. High drops to 41 fps inside the habitat, just above the 40 fps automatic switch,
so the GPU check now starts AMD integrated graphics on Low. On High, walking stutters briefly (1 % low 30) when the nearby rocks are regenerated every 4 m.

## What is real and what is not (say this in the app)
- Real: terrain shape and photo (HiRISE DTM 1 m + orthomosaic 25 cm), background (CTX DEM 20 m + mosaic 6 m),
  position of Cheyava Falls, slope values, sun shadows.
- Artistic: the Mars colour (HiRISE and CTX are grayscale), sky and haze presets, night lamp.
- Modelled / estimated: rock positions (statistical model, not individual real rocks), rock shapes and close-up
  textures (Earth scans), the Cheyava Falls rock (hand-made after NASA PIA26401), rock-abundance layer.
- Real spot for the "dangerous slope" scene: about 200 m west of Cheyava Falls (x -201, z -52), 34 deg average.
- There is no mesa overhang in this area; elevation data cannot contain overhangs.

## Source files (not in this folder)
- ..\marswalk_jezero_real.blend : Blender scene (terrain, Geometry Nodes rock scatter, Cheyava rock, presets).
- ..\data\ : raw NASA clips. ..\out\ : Blender renders. ..\out\_old\ : outdated, do not use.

## Colour (matched to rover photos, 2026-11-14)
HiRISE and CTX are grayscale, so the Mars colour is added in the shaders. Until 2026-11-14 it was a hand-picked orange-red.
It is now matched to colour photos Perseverance took at this exact spot: nine Mastcam-Z frames of the Cheyava Falls workspace
(sol 1217, around local noon) and three horizon / sky frames (sols 1211, 1213, 1216). They are in ..\ref\perseverance_sol1217\
(_list.json has the image ids; the grayscale copies in _gray_not_used are not needed).
- Measured (linear red:green and green:blue): soil 1.5 and 1.75, light rock 1.3 to 1.6 and 1.6 to 1.9, sky near the horizon 1.16 and 1.48.
  The old ramp was 2.5 and 2.2 in the dark tones: far too red. Test bench now: ground 1.45 and 1.68.
- Changed: the terrain colour ramp (ramp() in TERRAIN_FRAG and RING_FRAG), slab and dust tints, the loose-rock tint (rocks at the site are as pale as the soil,
  not dark red), the ground seen through the habitat portholes, and the clear_day sky, halo and haze in atmosphere_presets.json.
- Raw frames are auto-stretched, so only the hue was taken from them, not the brightness. Not changed: dust_storm, late_afternoon and night skies,
  the Cheyava Falls hero rock texture, the sample soil in the scoop and case.
- Credit for these frames: NASA/JPL-Caltech/ASU.

## Credits
The full list, with licences, links and the text for the submission form, is in [docs/credits.md](../credits.md) (built by `npm run credits`).
HiRISE DTM and orthomosaic: NASA/JPL/University of Arizona, as the HiRISE usage policy asks; mosaics by USGS Astrogeology (Fergason et al. 2020).
CTX DEM and mosaic: NASA/JPL/Malin Space Science Systems, as MSSS asks; mosaics by USGS Astrogeology (Fergason et al. 2020).
Rover waypoint: NASA/JPL-Caltech (Mars 2020 MMGIS). Cheyava Falls reference: NASA/JPL-Caltech/ASU/MSSS (PIA26401).
Rock size model: Golombek et al. 2003. Rock models, detail textures and habitat stool / shelves / crate: Poly Haven (CC0).
Z-2 suit and Habitat Demonstration Unit: NASA 3D Resources.

## assets_astronaut/ (third-person astronaut, first-person arms, first-person legs)
| File | What it is |
|---|---|
| z2_astronaut.glb | NASA Z-2 suit, 30k triangles, 2K textures, 19-bone skeleton, animations "walk" (1.2 s loop, about 1 m per cycle), "idle" (3 s loop) and "case_set_down". Faces +Z in three.js. The shoulder patches and the surface under them are a rigid plate on the upper-arm bone, so they stay flat in every pose. Inner filler geometry closes the gaps between suit shells in deep poses. |
| z2_astronaut.glb.json | The same file as base64, only because the preview host cannot serve .glb. The product should load the .glb. |
| z2_accent_mask.png | Where the per-player colour goes: upper-arm bands, thigh bands, backpack band, boot rings, helmet ring. Uses the model UVs (flipY = false). NASA and flag patches are never recoloured. |
| astronaut.json | Animation list, player-colour formula, suggested colours. |

Test bench: the "Partner" view shows the astronaut walking a short loop, blending walk and idle; "Partner colour" cycles player colours.
Shaders: SUIT_VERT / SUIT_FRAG in src/shaders.js (skinning + player colour + shared lighting).
Known limits: suit hands are one bone each (first-person hands are a separate model, below); no reduced far-distance version yet; contact shadow is a soft disc.
Source scene: ..\marswalk_astronaut.blend (rig "Z2_rig", pose formula stored in the build history). Original NASA files: ..\nasa_models\.
NASA insignia: check https://www.nasa.gov/nasa-brand-center/images-and-media before using the suit outside the hackathon.

### First-person legs and boots (2026-11-13)
| File | What it is |
|---|---|
| z2_fp_legs.glb | The same Z-2 suit cut at the waist (hips, legs, boots; 9.8k triangles), waist closed with a cap. Same 19-bone skeleton and the same "walk" / "idle" animations as z2_astronaut.glb. No textures inside: it uses the colour texture and z2_accent_mask.png of z2_astronaut.glb (same UVs), so nothing extra is downloaded. |
| z2_fp_legs.glb.json | Same file as base64 for the preview host only. |

- Use: put it under the first-person camera, facing the walking direction, and play walk while moving. In the test bench the hips sit 0.10 m behind the eye, sliding to 0.32 m as you look down (the head leans forward), see `legs` in src/main.js.
- What you see: standing still, only the boot toes at the steepest look-down; while walking, the forward leg swings into view. This is what a real suit allows. The Figma frame "Pendiente peligrosa" shows the legs larger than a standing astronaut would see them.
- Boot dust: SUIT_FRAG now tints boots and shins with regolith (strongest at the sole, gone at the knee; uniform uSuitDust, 0 = clean, default 0.6). It applies to the partner astronaut too.
- Test bench: view "Look down", toggle "Legs".
- Source: object "Z2_fp_legs" in ..\marswalk_astronaut.blend.

### Astronaut shadows, partner lamp, resting hands, head bob (2026-11-13)
- Walking and jogging use the same "walk" clip (played faster when jogging). The bounce of the view is camera code, not an asset: the test bench has a reference head bob in tick() in src/main.js (1.2 cm per step walking; 4.5 cm with 2 m strides jogging, a low-gravity lope).
- Cast shadow (High tier): each frame the astronauts are drawn from the sun's point of view into a small mask (512 x 256; left half = player, right half = partner). COMMON has castShadow(worldPos), which looks the mask up and dims the sun term, so everything that calls it receives the shadow: terrain, rocks, the Cheyava rock and props. The shadow is the real silhouette, follows any surface, stretches in the late afternoon and gets softer with distance. Code: `cast` in src/main.js (casters are on layer 1; the player uses an invisible copy of the full astronaut that exists only on that layer). Cost: one extra draw of each astronaut plus five texture reads per pixel near an astronaut.
- Low tier: no mask; a soft dark disc under each astronaut instead.
- Limits: the player's shadow shows the full model's arms at its sides, not the first-person gesture; props (scoop, case) do not cast yet.
- Partner helmet lamp: lamp() in COMMON now adds a second spot (uLamp2Pos, uLamp2Dir, world space) with the same colour, cone and reach as the player's lamp. It is only lit in presets that have a lamp (night). The test bench also shows a small glow at the partner's helmet.
- Resting hands: the "down" state is placed relative to the torso, so the gloves show at the bottom of the view at level gaze and come up as you look down (numbers in arms.json, rest_pose).

### First-person arms + wrist screen (fourth pass, 2026-11-12; suit-matched colours, EVA glove detail, solved screen tap)
| File | What it is |
|---|---|
| arm_left.glb | LEFT forearm + bulky EVA glove (12.8k triangles, 17 bones; pleated finger joints, knuckle pad, hand strap and buckle, palm bar, wrist-ring lock tabs, cuff hems, sleeve strap) and a strapped wrist screen (382 triangles). Held poses as animations: open, relaxed, point, pinch, fist. |
| arm_left.glb.json | Same file as base64 for the preview host only. |
| arms.json | Axes, materials, how to mirror for the right arm, and camera-space placements for each gesture (down, screen, point, pinch, open). |

- Right arm = the same model mirrored (scale.x = -1, double-sided, WristScreen hidden).
- The Screen material is one quad with 0-1 UVs: draw the UI to a canvas and use it as the texture. The test bench shows the vision-layer list and highlights the active layer.
- Test bench: "Hands" row. "Wrist screen" raises the left forearm across the view with the right index on the screen, as in the Figma "Gesto - Elegir capa" frame.
- Shaders: ARM_VERT / ARM_FRAG (skinning, vertex colour, fabric grain, player colour on the wrist ring).
- Colours were measured from the Z-2 texture (off-white sleeve, dark gloves), so the arms match the partner astronaut. Soot, dust and fabric grain are procedural in ARM_FRAG (the Z-2 texture is too low-resolution to reuse close to the camera).
- Colour is in COLOR_0 (linear); 1 - UV.y is the cloth class used by the shader.
- Wrist-screen tap: the right index fingertip is solved onto the selected row each frame and approaches from above the glass, so it does not pass through the left arm (arms.tapTarget in src/main.js; numbers in arms.json).
- Known limits: fingers are rigid segments (visible only very close up); detail is geometry plus procedural dirt, not a photographed texture.
- Source: ..\marswalk_arms.blend. Older drafts: assets_astronaut\_old\.

### Interaction clips: collect a sample from the ground or from a rock (first pass 2026-11-13)
| File | What it is |
|---|---|
| arm_clips.glb | Skeleton and animations only (no mesh). "collect_ground" (4.9 s): the camera crouches, the right hand turns the scoop palm-down, pushes it into the soil, lifts, and stands up with the sample. "collect_rock" (3.85 s): the camera bends to a low rock, the scoop works against the rock face, and comes up with chips. Bone names match arm_left.glb. |
| arm_clips.glb.json | Same file as base64 for the preview host only. |

- The camera crouch is inside the clip, as an extra bone called "camrig", so hand and camera stay in sync. arms.json ("clips") says how to read it; src/main.js (arms.play and tick) is the reference.
- Both clips start and end on the tool-hold placement, in camera space; the scoop must be parented to the arm's "hand" bone.
- Test bench: Hands row, "Sample ground" and "Sample rock" (the second one walks you to the Cheyava Falls rock first).
- Scoop contents: sample_scoop.glb also holds ScoopSoil and ScoopRocks, shown after the matching clip (props.json, arms.json). Their grain, veins and specks are procedural in PROP_FRAG (keyed by vertex alpha), so there is no texture file.
- Putting the sample away: "stow_sample" (2.2 s, scoop down to the hip, out of view) and "pour_sample" (2.7 s, bend and tip the scoop over a case on the ground). The page hides the contents part-way through. Test bench: "Stow sample", "Pour into case" (use it after the partner has set the case down, see the hand-over section).
- Collisions are app code, not an asset. The test bench has a small reference (rocks.collide in src/main.js): it pushes the walker out of rocks 0.35 m and larger, the Cheyava rock and the partner, using the same deterministic rock positions that are drawn.
- Not in the clips (code, later): dust puff, the mark in the soil. The first-person legs are hidden while crouched and the player's shadow is switched off during the crouch.
- Real-world basis: Apollo crews scooped soil from the ground and took rock pieces with tongs or a hammer, kneeling or leaning because suits bend poorly.
- Source: actions "collect_ground", "collect_rock", "stow_sample" and "pour_sample" in ..\marswalk_arms.blend (each action's "note" property explains the coordinates).

### Sample hand-over with the partner's case (first pass 2026-11-13)
| File | What it is |
|---|---|
| z2_astronaut.glb | Now also holds "case_set_down" (2.07 s): deep crouch, reaching out to the front-left until the left hand meets the ground clear of the boot, short settle, stand up. Used for both putting the case down and picking it up. (The separate z2_clips.glb is no longer used; it is in assets_astronaut\_old.) |
| tool_case.glb | Body with an open cavity, a hinged lid (ToolCaseLid; rotation.x from 0 closed to -1.75 rad open), and two sample meshes for the cavity (CaseSoil, CaseRocks). |

- Sequence: the partner sets the case down and it opens; the player pours the sample in with "pour_sample"; the lid closes and the partner picks the case up. Exact steps and numbers: props.json ("hand_over") and astronaut.json ("extra_clips").
- Test bench: Show row "Partner: case down / up", then Hands row "Pour into case" (it places you opposite the partner with the case between you).
- The partner walks to you and faces you before bending, and walks back to its route afterwards (reference code only; where the partner goes is the app's decision).
- While you tip the scoop the sample falls as particles under Mars gravity, then appears in the case (CaseSoil / CaseRocks inside tool_case.glb). The particles are a reference effect in src/main.js (props.startSpill).
- The bend clip has staged timing: torso first going down, legs first coming up, with a small settle at the bottom.
- When released, the case settles onto the ground beside the partner, clear of the boots.
- The sample in the case and the seal around the opening are kept a few millimetres away from the surfaces next to them, so they do not flicker.
- Sources: action "case_set_down" in ..\marswalk_astronaut.blend; objects ToolCase and ToolCaseLid in ..\marswalk_props.blend.

## assets_props/ (hand tool and carried case: first pass 2026-11-13)
| File | What it is |
|---|---|
| sample_scoop.glb | Soil sampling scoop (1.2k triangles, 58 cm): aluminium handle, ribbed glove-sized grip, tether ring, open scoop pan. Shown in the Figma frame "Llegada a Cheyava Falls". |
| tool_case.glb | Hard sample / tool case (1.7k triangles, 37 x 22 x 31 cm): latches, hinges, corner bumpers, label plate, carry handle. Shown in the Figma frame "Caminata en pareja". |
| *.glb.json | Same files as base64 for the preview host only. |
| props.json | Origins, axes, sizes and the exact numbers for holding the scoop and carrying the case. |

- No textures: colours are vertex colours, so both files together are under 70 KB.
- Shaders: PROP_VERT / PROP_FRAG in src/shaders.js.
- Test bench: Hands row "Hold tool" puts the scoop in the right fist; the partner always carries the case in the left hand.
- Both are generic designs made for this project, not copies of specific NASA flight hardware.
- Source: ..\marswalk_props.blend (objects SampleScoop, ToolCase).

## assets_habitat/ (start point and refuge: second interior pass 2026-11-13)
| File | What it is |
|---|---|
| habitat.glb + habitat_interior.glb | The habitat at the HAB waypoint, 12.6 x 6 x 7 m (7.9 m with the antenna), 17k triangles in two files (outside, inside), plus the furniture library and one baked lightmap. Shell = NASA Habitat Demonstration Unit (cylinder with loft dome, airlock tunnel, hygiene module, NASA texture). Around it, made for this project: legs and footpads, airlock porch with steps, hatch light, comms mast. |
| habitat.glb.json | Same file as base64 for the preview host only. |
| habitat.json | Sizes, parts, where the airlock is, shaders, placement, credits. |

- Real vs made up: the shell is real NASA hardware (a 2010-2012 field prototype for a surface habitat). NASA's model also has Earth test-site parts (access ramps with yellow railings, an air-conditioning unit); those are left out. The legs, steps and mast are our own additions so it can stand on Mars; say so in the app.
- Test bench: View row "Habitat". At night the hatch light and a red mast beacon glow.
- Shadow: on High the habitat casts its real silhouette through the same mask as the astronauts (COMMON castShadow, slot 2).
- Refuge: for the radiation alert the plan is to use this habitat as the shelter (the Figma's rock overhang cannot exist in elevation data). The green safe-zone highlight and the dotted route to it are shader/code work, not done yet.
- Entering: the outer hatch is a real hinged door (HabitatHatch) and the inside is modelled (habitat_interior.glb): an airlock room, then a round main room. Doors are the real HDU size, 0.94 x 1.43 m, so a suited astronaut ducks.
- Walking in: habitat.json lists the walkable zones (stairs, porch, hatch, airlock, inner doorway, main room) with floor heights, and the solid boxes around them. The test bench uses exactly those numbers (habitat.canStand, ground, duck in src/main.js); the hatch opens when you come close. View row: "Inside".
- Interior lighting is its own shader (INTERIOR_FRAG): constant indoor light, glowing ceiling panels, not affected by the Mars sun or dust.
- Hatch: a rounded pressure hatch with hand wheel, latch dogs and window; both hatch openings have rounded frames and warning bands on the floor.
- Stooping: the hatches are 1.43 m tall. The camera lowers before the frame, not inside it (numbers in habitat.json, "doors").
- Furniture library: assets_habitat\furniture\ has one small file per piece and layout.json with positions and blocked floor circles. Ours: planning_table (lit rim, three edge consoles), suit_rack, sample_glovebox (detailed: glove ports with gloves, see-through window, sample tubes and rock chips inside, pass-through hatch, filters, gauges), sample_canister, tablet (vertex colours, 2-62 KB each). Small loose pieces (canisters, tablets, crates on the shelves) are placed by layout.json like everything else. From Poly Haven (CC0): stool, shelves, crate (2.2k triangles and one 512 px texture each, about 110 KB each). Source: ..\marswalk_furniture.blend; Poly Haven originals in ..\data\polyhaven.
- Interior lighting is baked: interior_lightmap.jpg (1024 px, about 225 KB) holds real lamp light, bounce light and soft shadows for both rooms, including the furniture's shadows. Furniture and loose objects are lit from a second baked file, interior_lightvolume.png (290 KB): the cabin's light sampled on a 15 cm grid in six directions. A piece reads its light by where it stands and which way each face points, so the table is bright on top and dark underneath, the cabinet is shaded on its far side, and an object that is moved or carried stays correctly lit. No extra data is needed in the furniture files. (Before 2026-11-13 afternoon the furniture used a made-up formula and the furniture was accidentally left out of the room bake, which is why it looked flatter than in Blender.) If the furniture layout changes, re-bake (steps in habitat.json, "re_bake").
- Portholes: the two side-hatch windows are modelled in 3D on the inside (bolted bezel ring, recessed tunnel, pane at the back). The pane shows the plain outside (ground with stones, crater rim, sky, all following the weather preset) with a dark rim, edge dust and a reflection; no hole is cut in the shell. Code: windowView in COMMON plus the window branch of INTERIOR_FRAG.
- Glass: any furniture mesh with 'glass' in its name (sample_glovebox_glass) is drawn see-through with a moving reflection (GLASS_FRAG, glassSheen): light bands slide over the pane as you walk, and it mirrors more at flat angles.
- Wall screens: the five screens are one small mesh, HabitatScreens, inside habitat_interior.glb. Its UVs point into one 1024 px canvas with a cell per screen (cells in habitat.json, "screens"). The test bench draws placeholder content 4 times a second (habitat.screens.draw in src/main.js): life support, EVA team vitals, weather and alerts (turns red with "DUST STORM - EVA HOLD" in the storm preset), airlock status (follows the outer hatch), hatch control. Replace the drawing code with real app data; the mesh and cells stay the same.
- Small coloured indicator lights on the control strips blink (uTime in INTERIOR_FRAG).
- Cabin brightness stays the same in every weather preset (uInterior cancels the outdoor exposure change).
- Hatch sills are 15 cm high; the walk zones raise the floor there so the camera steps over them.
- Checked for overlaps in Blender (2026-11-13): no furniture piece touches another or the fixed wall equipment. Fixed on the way: the pass-through hatch of the glovebox hit a screen shelf, the shelves hit the ceiling conduit (now scale 0.92), parts of the NASA side-hatch frames stuck through the wall in front of two screens, and both hatch tunnels were drawn twice (one copy unlit, which showed as black patches on the sills).
- The planning table top shows the terrain photo with the route and waypoints, drawn from route.json (reference code in habitat.init; this is where the Plan-mode screen goes).
- The rooms have a colour scheme (blue-grey lower wall, orange band, warm upper wall, dark studded floor) and fixed equipment: wall screens, control strips, lockers, extinguisher, first-aid box, cable tray, conduit.
- The ladder leads to the loft hatch, which stays closed: the real HDU has crew quarters up there, not modelled.
- Exterior detail (2026-11-13): a separate mesh, HabitatExterior, inside habitat.glb (3.3k triangles, about 190 KB of the 415 KB file, no texture). It adds a bellows collar that closes the gap between core and tunnel, hoop ribs and yellow handrails on the tunnel, a bolted flange band under the loft, real 3D portholes over the four painted ones (dark glass that mirrors sky and ground), loft seams, top vent and antenna, handrails and lamps at the side hatches, an air unit, gas bottles, and a stowage locker on the rear module. All of it is our own addition, not NASA hardware; say so in the app.
- NASA's texture letters the small rear module "AIRLOCK". In Marswalk the entrance is the long tunnel, so the locker covers that lettering to avoid two airlocks.
- Exterior, second pass (2026-11-13): the blurry painted marks are painted out of NASA's texture (small NASA logos and flags, mission patches, X-Hab logos, the AIRLOCK lettering); one large NASA logo and one flag stay on the loft. The two side doors and the rear module door now carry the same detailed pressure hatch as the entrance (same mesh reused, no size cost; they stay shut). Nine floodlights are modelled on the shell; at night they glow and throw a warm pool of light on the ground and the shell (lamp() in COMMON). The locker, air unit, rear module and tunnel got extra parts so they read as equipment.
- Partner entering: z2_astronaut.glb has a new clip, walk_stoop (crouched walk, 1.35 m tall, same timing as walk). Test bench button "Partner: into habitat / out": the partner (moved to 8 m in front of the steps first, because its patrol path is 700 m away) climbs the steps, crouches through both hatches and stands in the main room, then comes back out. Reference code: partner.visitHabitat. Indoors the partner is still shaded with the outdoor light model; using the light volume for astronauts is a small follow-up.
- Not included yet: an inner door leaf, a cable from the comms mast to the habitat, interiors behind the side and rear hatches.
- Source: ..\marswalk_habitat.blend (objects HabitatCore, HabitatBase; the unused NASA part 2 is kept hidden in the file).
