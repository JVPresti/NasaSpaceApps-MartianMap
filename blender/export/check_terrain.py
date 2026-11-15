"""Check that the exported terrain mesh agrees with the height grid the route planner uses.

    blender -b --python blender/export/check_terrain.py

Reads public/marswalk/assets/terrain_tiles.glb (the exported mesh, Draco included; not deployed, see #205) and
compares its surface with public/marswalk/assets/terrain.json at 100 fixed random points.
Fails (exit code 1) if any point differs by more than 0.2 m.

Options after "--":  --out DIR (default public/marswalk)   --points N (default 100)   --tolerance M (default 0.2)
"""
import bpy, sys, os, json, base64, random, struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opt = {"--out": os.path.join(REPO, "public", "marswalk"), "--points": "100", "--tolerance": "0.2"}
for i in range(0, len(a), 2): opt[a[i]] = a[i + 1]
root, npts, tol = os.path.abspath(opt["--out"]), int(opt["--points"]), float(opt["--tolerance"])

# ---- the height grid, read exactly as the app reads it
tj = json.load(open(os.path.join(root, "assets", "terrain.json")))
n, W, D, R = tj["n"], tj["width_m"], tj["depth_m"], tj["range_m"]
u16 = struct.unpack("<%dH" % (n * n), base64.b64decode(tj["heights_u16_b64"]))
def grid_height(x, z):          # three.js coordinates: x east, z south
    fc = (x / W + 0.5) * (n - 1); fr = (z / D + 0.5) * (n - 1)
    c = min(int(fc), n - 2); r = min(int(fr), n - 2); u = fc - c; v = fr - r
    h = lambda rr, cc: u16[rr * n + cc] / 65535 * R
    return (h(r, c) * (1 - u) + h(r, c + 1) * u) * (1 - v) + (h(r + 1, c) * (1 - u) + h(r + 1, c + 1) * u) * v

# ---- the exported mesh, through Blender's own glTF importer
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=os.path.join(root, "assets", "terrain_tiles.glb"))
tiles = [o for o in bpy.data.objects if o.type == "MESH"]
verts, polys = [], []
for o in tiles:
    base = len(verts); mw = o.matrix_world
    verts += [mw @ v.co for v in o.data.vertices]
    polys += [[base + i for i in p.vertices] for p in o.data.polygons]
bvh = BVHTree.FromPolygons(verts, polys)
xs = [v.x for v in verts]; ys = [v.y for v in verts]
print("terrain_tiles.glb: %d tiles, %d vertices, %d triangles" % (len(tiles), len(verts), len(polys)))
print("  extent: x %.2f .. %.2f m, y %.2f .. %.2f m   (terrain.json: width %.2f m, depth %.2f m)" % (min(xs), max(xs), min(ys), max(ys), W, D))

# ---- compare. The importer turns three.js (x, y, z) back into Blender (x, -z, y).
rnd = random.Random(2026); worst = 0.0; bad = []; total = 0.0
for k in range(npts):
    x = (rnd.random() - 0.5) * W * 0.998; z = (rnd.random() - 0.5) * D * 0.998
    hit = bvh.ray_cast(Vector((x, -z, 10000.0)), Vector((0, 0, -1)))
    if hit[0] is None: bad.append((x, z, None)); continue
    d = abs(hit[0].z - grid_height(x, z)); worst = max(worst, d); total += d
    if d > tol: bad.append((x, z, d))
extent_ok = abs((max(xs) - min(xs)) - W) < 0.05 and abs((max(ys) - min(ys)) - D) < 0.05
print("  %d points: mean difference %.3f m, worst %.3f m (limit %.2f m)" % (npts, total / max(1, npts - len(bad)), worst, tol))
for x, z, d in bad[:10]: print("  FAIL at x=%.1f z=%.1f: %s" % (x, z, "no surface under the point" if d is None else "%.3f m" % d))
if not extent_ok: print("  FAIL: the mesh does not cover the same area as terrain.json")
ok = not bad and extent_ok
print("CHECK PASSED" if ok else "CHECK FAILED")
sys.exit(0 if ok else 1)
