"""Re-export every Marswalk model and the terrain mesh from the Blender scenes.

One command, from the repository root:

    blender -b --python blender/export/export_all.py

Options go after a "--":

    blender -b --python blender/export/export_all.py -- --only habitat terrain
    blender -b --python blender/export/export_all.py -- --list

    --only NAME ...   export only these groups (see --list)
    --src DIR         folder with the .blend scenes   (default: blender/)
    --out DIR         where the files are written     (default: public/marswalk/)
    --no-draco        write the terrain tiles without Draco compression

The script starts one background Blender per scene, so nothing depends on what
is open, selected or hidden in the scene files. It never saves a scene.

Conventions: 1 unit = 1 m, origin at Cheyava Falls. Blender +X east, +Y north,
+Z up becomes three.js x east, z south, y up: Blender (x, y, z) -> (x, z, -y).
The HiRISE terrain is already corrected for its east-west stretch
(cos(latitude) = 0.948). Nothing here corrects it again.
"""
import bpy, sys, os, json, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

# ----------------------------------------------------------------------------
# What is exported. One entry per output file.
#   objects     exact object names written to the file (and nothing else)
#   actions     animation clips to include, by name (omit for no animation)
#   def_bones   True: only deforming bones. False: every bone (helper bones too)
#   sample      True: one key per frame. False: keep the original keyframes
#   images      "WEBP" packs the textures as WebP, "NONE" writes no textures
#   max_texture largest texture side in pixels; bigger textures are scaled down
#   at_origin   True: the first object is moved to the origin for the export
#               (the scene keeps its pieces side by side; the app places them).
#               "each": every object is moved to the origin (detail levels parked side by side)
#   materials   "NONE" writes the mesh without materials (the app supplies its own shader)
#   drop_bones  helper bones removed for this file (the scene is not saved)
#   quality     WebP quality, 0-100 (default 75)
# The object names are part of the contract with the app code. The full list is
# in docs/marswalk-assets/README.md, "Object names the code depends on".
# ----------------------------------------------------------------------------
MANIFEST = {
    "astronaut": {
        "scene": "marswalk_astronaut.blend",
        "files": [
            {"out": "assets_astronaut/z2_astronaut.glb", "objects": ["Z2", "Z2_rig"],
             "actions": ["walk", "idle", "case_set_down", "walk_stoop"], "def_bones": True, "images": "WEBP", "quality": 92, "max_texture": 2048},
            {"out": "assets_astronaut/z2_fp_legs.glb", "objects": ["Z2_fp_legs", "Z2_rig"],
             "actions": ["walk", "idle"], "def_bones": True, "images": "NONE"},
        ],
    },
    "arms": {
        "scene": "marswalk_arms.blend",
        "files": [
            {"out": "assets_astronaut/arm_left.glb", "objects": ["ArmL", "WristScreen", "ArmL_rig"],
             "actions": ["open", "relaxed", "point", "pinch", "fist"], "def_bones": True, "drop_bones": ["camrig"], "images": "NONE"},
            {"out": "assets_astronaut/arm_clips.glb", "objects": ["ArmL_rig"],
             "actions": ["open", "relaxed", "point", "pinch", "fist", "collect_rock", "collect_ground",
                         "stow_sample", "pour_sample"], "def_bones": False, "sample": True, "images": "NONE"},
        ],
    },
    "props": {
        "scene": "marswalk_props.blend",
        "files": [
            {"out": "assets_props/sample_scoop.glb", "objects": ["SampleScoop", "ScoopRocks", "ScoopSoil"], "images": "NONE"},
            {"out": "assets_props/tool_case.glb", "objects": ["ToolCase", "ToolCaseLid", "CaseSoil", "CaseRocks"], "images": "NONE", "at_origin": True},
        ],
    },
    "habitat": {
        "scene": "marswalk_habitat.blend",
        "files": [
            {"out": "assets_habitat/habitat.glb", "images": "WEBP", "quality": 80,
             "objects": ["HabitatBase", "HabitatCore", "HabitatExterior", "HabitatHatch", "HabitatHatchFrames",
                         "HabitatHatchRear", "HabitatHatchSideA", "HabitatHatchSideB"]},
            {"out": "assets_habitat/habitat_interior.glb", "objects": ["HabitatInterior", "HabitatScreens"], "images": "NONE"},
        ],
    },
    "furniture": {
        "scene": "marswalk_furniture.blend",
        "files": [
            {"out": "assets_habitat/furniture/planning_table.glb", "objects": ["planning_table"], "images": "NONE", "at_origin": True},
            {"out": "assets_habitat/furniture/suit_rack.glb", "objects": ["suit_rack"], "images": "NONE", "at_origin": True},
            {"out": "assets_habitat/furniture/sample_glovebox.glb", "objects": ["sample_glovebox", "sample_glovebox_glass"], "images": "NONE", "at_origin": True},
            {"out": "assets_habitat/furniture/sample_canister.glb", "objects": ["sample_canister"], "images": "NONE", "at_origin": True},
            {"out": "assets_habitat/furniture/tablet.glb", "objects": ["tablet"], "images": "NONE", "at_origin": True},
            {"out": "assets_habitat/furniture/crate.glb", "objects": ["crate"], "images": "WEBP", "quality": 80, "at_origin": True, "max_texture": 512},
            {"out": "assets_habitat/furniture/shelves.glb", "objects": ["shelves"], "images": "WEBP", "quality": 80, "at_origin": True, "max_texture": 512},
            {"out": "assets_habitat/furniture/stool.glb", "objects": ["stool"], "images": "WEBP", "quality": 80, "at_origin": True, "max_texture": 512},
        ],
    },
    "outcrop": {
        "scene": "marswalk_outcrop.blend",
        "files": [
            # three detail levels of the layered outcrop; its textures are assets/outcrop_color*.jpg and outcrop_nao*.jpg
            {"out": "assets/outcrop.glb", "objects": ["Outcrop_LOD0", "Outcrop_LOD1", "Outcrop_LOD2"], "images": "NONE",
             "materials": "NONE", "at_origin": "each"},
        ],
    },
    "terrain": {
        "scene": "marswalk_jezero_real.blend",
        # The 1 m source mesh is resampled to the same grid as assets/terrain.json
        # (n x n points, about 2 m apart) and cut into tiles x tiles pieces.
        "terrain": {"out": "assets/terrain_tiles.glb", "object": "Jezero_SRC", "n": 751, "tiles": 5},
    },
}


def args_after_dashes():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"only": [], "src": os.path.join(REPO, "blender"), "out": os.path.join(REPO, "public", "marswalk"),
         "draco": True, "list": False, "group": None}
    i = 0
    while i < len(a):
        if a[i] == "--only":
            i += 1
            while i < len(a) and not a[i].startswith("--"):
                o["only"].append(a[i]); i += 1
            continue
        if a[i] == "--src": o["src"] = os.path.abspath(a[i + 1]); i += 2; continue
        if a[i] == "--out": o["out"] = os.path.abspath(a[i + 1]); i += 2; continue
        if a[i] == "--group": o["group"] = a[i + 1]; o["index"] = int(a[i + 2]); i += 3; continue   # internal: run inside the scene's own Blender
        if a[i] == "--no-draco": o["draco"] = False
        elif a[i] == "--list": o["list"] = True
        else: raise SystemExit("unknown option " + a[i])
        i += 1
    return o


# ----------------------------------------------------------------------------
# inside one scene
# ----------------------------------------------------------------------------
def gltf_kwargs(**want):
    """Only pass options this Blender version knows, so the script survives exporter updates."""
    known = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    skipped = sorted(k for k in want if k not in known)
    if skipped: print("  note: this Blender has no exporter option", ", ".join(skipped))
    return {k: v for k, v in want.items() if k in known}


def select_only(names):
    missing = [n for n in names if n not in bpy.data.objects]
    if missing: raise SystemExit("ERROR: objects not found in %s: %s" % (bpy.data.filepath, ", ".join(missing)))
    for o in bpy.data.objects:
        if o.name not in bpy.context.view_layer.objects: continue
        on = o.name in names
        if on: o.hide_viewport = False; o.hide_set(False); o.hide_render = False
        o.select_set(on)
    bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]


def keep_actions(names):
    """Remove every NLA track that is not asked for. The scene is never saved, so nothing is lost."""
    found = set()
    for o in bpy.data.objects:
        ad = o.animation_data
        if not ad: continue
        ad.action = None
        for t in list(ad.nla_tracks):
            acts = [s.action.name for s in t.strips if s.action]
            if names and acts and all(a in names for a in acts): t.mute = False; found.update(acts)
            else: ad.nla_tracks.remove(t)
    missing = [n for n in (names or []) if n not in found]
    if missing: raise SystemExit("ERROR: animation clips not found in %s: %s" % (bpy.data.filepath, ", ".join(missing)))


def export_file(spec, out_root):
    path = os.path.join(out_root, *spec["out"].split("/")); os.makedirs(os.path.dirname(path), exist_ok=True)
    select_only(spec["objects"]); keep_actions(spec.get("actions"))
    objs = [bpy.data.objects[n] for n in spec["objects"]]
    if spec.get("at_origin"):
        off = objs[0].matrix_world.translation.copy()
        for ob in objs:
            if ob.parent is None: ob.location = (0, 0, 0) if spec["at_origin"] == "each" else ob.location - off
    for ob in objs:
        if ob.type == "ARMATURE" and spec.get("drop_bones"):
            bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode="EDIT")
            for n in spec["drop_bones"]:
                if n in ob.data.edit_bones: ob.data.edit_bones.remove(ob.data.edit_bones[n])
            bpy.ops.object.mode_set(mode="OBJECT")
    # Materials coloured by a Color Attribute node are written with a white base colour. The exporter
    # sometimes writes the unused grey (0.8) of the socket instead, which darkens the vertex colours in three.js.
    for ob in objs:
        for sl in getattr(ob, "material_slots", []):
            m = sl.material
            if not (m and m.node_tree): continue
            for nd in m.node_tree.nodes:
                if nd.type != "BSDF_PRINCIPLED": continue
                sk = nd.inputs["Base Color"]
                if sk.is_linked and sk.links[0].from_node.type == "VERTEX_COLOR": sk.default_value = (1, 1, 1, 1)
    if spec.get("max_texture"):
        for ob in objs:
            for sl in getattr(ob, "material_slots", []):
                if not (sl.material and sl.material.node_tree): continue
                for nd in sl.material.node_tree.nodes:
                    im = getattr(nd, "image", None)
                    if im and max(im.size) > spec["max_texture"]:
                        k = spec["max_texture"] / max(im.size); im.scale(max(1, round(im.size[0] * k)), max(1, round(im.size[1] * k)))
    bpy.context.view_layer.update()
    anim = bool(spec.get("actions"))
    kw = gltf_kwargs(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_cameras=False, export_lights=False, export_extras=False,
        export_image_format=spec.get("images", "NONE"), export_materials=spec.get("materials", "EXPORT"), export_image_quality=spec.get("quality", 75),
        export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
        export_animations=anim, export_animation_mode="NLA_TRACKS", export_def_bones=spec.get("def_bones", False),
        export_force_sampling=spec.get("sample", False), export_optimize_animation_size=not spec.get("sample", False),
        export_anim_single_armature=True, export_reset_pose_bones=True, export_current_frame=False,
        export_skins=True, export_morph=False, export_draco_mesh_compression_enable=False,
    )
    bpy.ops.export_scene.gltf(**kw)
    print("  wrote %-48s %8.1f KB" % (spec["out"], os.path.getsize(path) / 1024))


def export_terrain(spec, out_root, draco):
    import numpy as np, bmesh
    src = bpy.data.objects[spec["object"]]; me = src.data; nv = len(me.vertices)
    co = np.empty(nv * 3, dtype=np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3).astype(np.float64)
    mw = np.array(src.matrix_world); co = co @ mw[:3, :3].T + mw[:3, 3]
    side = int(round(nv ** 0.5))
    if side * side != nv: raise SystemExit("ERROR: %s is not a square grid (%d vertices)" % (src.name, nv))
    # order the vertices as a grid: row 0 = north (largest y), column 0 = west (smallest x)
    order = np.lexsort((co[:, 0], -np.round(co[:, 1], 3))); g = co[order].reshape(side, side, 3)
    if not (np.all(np.diff(g[:, :, 0], axis=1) > 0) and np.all(np.diff(g[:, :, 1], axis=0) < 0)):
        raise SystemExit("ERROR: %s vertices do not form a regular grid" % src.name)
    x0, x1, y0, y1 = g[0, 0, 0], g[0, -1, 0], g[0, 0, 1], g[-1, 0, 1]
    z = g[:, :, 2]; zmin = float(z.min())
    n = spec["n"]
    t = np.linspace(0, side - 1, n); i0 = np.floor(t).astype(int).clip(0, side - 2); f = t - i0   # same resampling as terrain.json
    A = z[i0][:, i0] * (1 - f) + z[i0][:, i0 + 1] * f; B = z[i0 + 1][:, i0] * (1 - f) + z[i0 + 1][:, i0 + 1] * f
    H = A * (1 - f)[:, None] + B * f[:, None] - zmin                      # heights above the lowest point, like terrain.json
    X = np.linspace(x0, x1, n); Y = np.linspace(y0, y1, n)
    gy, gx = np.gradient(H, Y, X); nrm = np.stack([-gx, -gy, np.ones_like(H)], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    tiles = spec["tiles"]; step = (n - 1) // tiles
    if step * tiles != n - 1: raise SystemExit("ERROR: (n - 1) must be divisible by tiles")
    coll = bpy.data.collections.new("TerrainTiles"); bpy.context.scene.collection.children.link(coll); made = []
    for tr in range(tiles):
        for tc in range(tiles):
            r0, c0 = tr * step, tc * step; m = step + 1
            sl = (slice(r0, r0 + m), slice(c0, c0 + m))
            P = np.stack([np.broadcast_to(X[sl[1]][None, :], (m, m)), np.broadcast_to(Y[sl[0]][:, None], (m, m)), H[sl]], -1).reshape(-1, 3)
            idx = np.arange(m * m).reshape(m, m)
            a, b, c, d = idx[:-1, :-1].ravel(), idx[1:, :-1].ravel(), idx[1:, 1:].ravel(), idx[:-1, 1:].ravel()
            tris = np.concatenate([np.stack([a, b, d], 1), np.stack([b, c, d], 1)]).astype(np.int32)   # counter-clockwise seen from above
            mesh = bpy.data.meshes.new("Terrain_%d_%d" % (tr, tc))
            mesh.vertices.add(m * m); mesh.vertices.foreach_set("co", P.astype(np.float32).ravel())
            mesh.loops.add(len(tris) * 3); mesh.loops.foreach_set("vertex_index", tris.ravel())
            mesh.polygons.add(len(tris)); mesh.polygons.foreach_set("loop_start", np.arange(0, len(tris) * 3, 3, dtype=np.int32))
            mesh.polygons.foreach_set("loop_total", np.full(len(tris), 3, dtype=np.int32))
            mesh.polygons.foreach_set("use_smooth", np.ones(len(tris), dtype=bool))
            mesh.update(calc_edges=True)
            uvl = mesh.uv_layers.new(name="UVMap")                          # u east, v north across the whole terrain
            U = np.stack([(P[:, 0] - x0) / (x1 - x0), (P[:, 1] - y1) / (y0 - y1)], 1)[tris.ravel()]
            uvl.data.foreach_set("uv", U.astype(np.float32).ravel())
            # normals from the whole grid, so the light does not break at tile edges
            mesh.normals_split_custom_set_from_vertices(nrm[sl].reshape(-1, 3).tolist())
            ob = bpy.data.objects.new(mesh.name, mesh); coll.objects.link(ob); made.append(ob.name)
    bpy.context.view_layer.update()
    for o in bpy.data.objects:
        if o.name in bpy.context.view_layer.objects: o.select_set(o.name in made)
    bpy.context.view_layer.objects.active = bpy.data.objects[made[0]]
    path = os.path.join(out_root, *spec["out"].split("/")); os.makedirs(os.path.dirname(path), exist_ok=True)
    kw = gltf_kwargs(
        filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_yup=True,
        export_cameras=False, export_lights=False, export_extras=False, export_materials="NONE", export_animations=False,
        export_texcoords=True, export_normals=True,
        export_draco_mesh_compression_enable=draco, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=16, export_draco_normal_quantization=10, export_draco_texcoord_quantization=14,
    )
    bpy.ops.export_scene.gltf(**kw)
    info = {"file": spec["out"], "grid_n": n, "tiles": tiles, "tile_cells": step, "draco": bool(draco),
            "x_west_m": float(x0), "x_east_m": float(x1), "y_north_m": float(y0), "y_south_m": float(y1),
            "lowest_point_blender_z_m": zmin, "height_range_m": float(H.max()),
            "note": "Nodes Terrain_<row>_<col>, row 0 = north, col 0 = west. In three.js: x east, z south, y = height above the lowest point (same zero as terrain.json). UV: u east, v north over the whole terrain."}
    json.dump(info, open(path[:-4] + ".json", "w"), indent=1)
    print("  wrote %-48s %8.1f KB  (%d tiles, %d x %d points, draco %s)" % (spec["out"], os.path.getsize(path) / 1024, tiles * tiles, n, n, "on" if draco else "off"))


def run_one(name, index, o):
    g = MANIFEST[name]
    if "terrain" in g: export_terrain(g["terrain"], o["out"], o["draco"])
    else: export_file(g["files"][index], o["out"])


# ----------------------------------------------------------------------------
# driver: one background Blender per scene
# ----------------------------------------------------------------------------
def main():
    o = args_after_dashes()
    if o["list"]:
        for k, g in MANIFEST.items():
            print(k, "<-", g["scene"])
            for s in g.get("files", []): print("   ", s["out"])
            if "terrain" in g: print("   ", g["terrain"]["out"])
        return
    if o["group"]:
        run_one(o["group"], o["index"], o); return
    names = o["only"] or list(MANIFEST)
    bad = [n for n in names if n not in MANIFEST]
    if bad: raise SystemExit("unknown group: %s (use --list)" % ", ".join(bad))
    t0 = time.time(); failed = []
    for n in names:
        scene = os.path.join(o["src"], MANIFEST[n]["scene"])
        print("\n== %s  (%s)" % (n, MANIFEST[n]["scene"]), flush=True)
        if not os.path.exists(scene): print("  ERROR: scene not found:", scene); failed.append(n); continue
        if os.path.getsize(scene) < 2000: print("  ERROR: this is a Git LFS pointer, run: git lfs pull"); failed.append(n); continue
        # a fresh Blender for every output file: each export starts from the scene exactly as saved
        for k in range(len(MANIFEST[n].get("files", [0]))):
            cmd = [bpy.app.binary_path, "-b", "--factory-startup", scene, "--python-exit-code", "1", "--python", os.path.abspath(__file__),
                   "--", "--group", n, str(k), "--src", o["src"], "--out", o["out"]] + ([] if o["draco"] else ["--no-draco"])
            p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
            lines = [l for l in p.stdout.splitlines() if l.startswith("  ") or "ERROR" in l or "Traceback" in l]
            print("\n".join(lines) if p.returncode == 0 else p.stdout[-3000:], flush=True)
            if p.returncode != 0 and n not in failed: failed.append(n)
    print("\n%s in %.0f s. Output: %s" % ("FAILED: " + ", ".join(failed) if failed else "All exports done", time.time() - t0, o["out"]))
    if failed: sys.exit(1)


main()
