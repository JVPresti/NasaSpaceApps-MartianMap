# Export from Blender

One command re-exports every model and the terrain mesh from the scenes in `blender/`
into `public/marswalk/`. Run it from the repository root, with Blender 5.3:

```bash
git lfs pull                                              # the scenes are stored with Git LFS
blender -b --python blender/export/export_all.py          # export everything (about 1 minute)
blender -b --python blender/export/check_terrain.py       # terrain mesh against terrain.json
```

On Windows, if `blender` is not on the PATH, use the full path, for example
`"C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b --python blender/export/export_all.py`.

Options go after a `--`:

| Option | What it does |
| --- | --- |
| `--list` | Print every group and the files it writes |
| `--only habitat terrain` | Export only these groups |
| `--out some/folder` | Write somewhere else (handy to compare before overwriting) |
| `--src some/folder` | Read the scenes from somewhere else |
| `--no-draco` | Write the terrain tiles without Draco compression |

## How it works

- `MANIFEST` at the top of `export_all.py` lists every output file: which scene, which objects,
  which animation clips, texture format and size. To add a model, add an entry there.
- Each file is exported by its own background Blender, starting from the scene exactly as saved.
  The result does not depend on what is selected, hidden or open, and the script never saves a scene.
  Running it twice gives byte-identical files.
- Only the objects named in the manifest are written. Cameras, lights and helper objects are left out.

## Terrain

`assets/terrain_tiles.glb` is the terrain as a mesh: 25 tiles (`Terrain_<row>_<col>`, row 0 = north,
column 0 = west), 751 x 751 points, about 2 m apart, with normals and UVs. It is built from the 1 m
source mesh `Jezero_SRC` with the same resampling as `assets/terrain.json`, so the visible ground and
the height grid used by the route planner agree. `assets/terrain_tiles.json` records the extent.

The tiles are Draco-compressed (1.7 MB). In three.js they need a `DRACOLoader`:

```js
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
const draco = new DRACOLoader().setDecoderPath('/draco/');   // copy node_modules/three/examples/jsm/libs/draco/gltf/ to public/draco/
const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('/marswalk/assets/terrain_tiles.glb');
```

The UVs cover the whole terrain (u east, v north). Textures applied to them use `flipY = false`,
the usual glTF setting. The other models are small and are not Draco-compressed, so they load with a plain `GLTFLoader`.

`check_terrain.py` loads the exported file and compares its surface with `terrain.json` at 100 fixed
random points. It fails if any point differs by more than 0.2 m. Current result: worst 0.03 m.

## Conventions

- 1 unit = 1 m. The origin is Cheyava Falls.
- Blender +X east, +Y north, +Z up becomes three.js x east, z south, y up: Blender (x, y, z) is three.js (x, z, -y).
- Terrain heights are metres above the lowest point of the crop, the same zero as `terrain.json`.
- The HiRISE data is stretched 5.4 % east-west in the original files. The scenes and every exported
  asset are already corrected (the terrain is 1422.5 m wide and 1500 m deep). Do not correct it again.

## Not exported by this script

The `.json` data files (`terrain.json`, `ring.json`, `rocks.json`, `cheyava.json`, the atmosphere
presets) and the `.jpg` textures in `assets/` were built once from the same scenes and are not
regenerated here.
