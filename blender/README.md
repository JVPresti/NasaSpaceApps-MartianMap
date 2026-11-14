# Blender sources

The scenes that produce the files in `public/marswalk/`. Made with Blender 5.3.
Everything in this folder is stored with Git LFS; nothing under `public/` is.

## Getting the files

```bash
git lfs install   # once per machine
git lfs pull
```

Without `git lfs pull` the `.blend` files are small text pointers and Blender cannot open them.

## Which scene produces which file

| Scene | Size | Produces in `public/marswalk/` |
| --- | --- | --- |
| `marswalk_jezero_real.blend` | 144 MB | `assets/terrain.json`, `ring.json`, `rocks.json`, `cheyava.json`, `atmosphere_presets.json`, and the terrain, ring, rock and Cheyava textures in `assets/` (`ortho_*.jpg`, `normal_ao.jpg`, `ring_gray.jpg`, `outcrop_mask.jpg`, `cheyava_*.jpg`, the five rock `.jpg`) |
| `marswalk_astronaut.blend` | 14 MB | `assets_astronaut/z2_astronaut.glb`, `z2_fp_legs.glb`, `astronaut.json` |
| `marswalk_arms.blend` | 0.3 MB | `assets_astronaut/arm_left.glb`, `arm_clips.glb`, `arms.json` |
| `marswalk_props.blend` | 0.2 MB | `assets_props/sample_scoop.glb`, `tool_case.glb`, `props.json` |
| `marswalk_habitat.blend` | 15 MB | `assets_habitat/habitat.glb`, `habitat_interior.glb`, `habitat.json`, `interior_lightmap.jpg`, `interior_lightvolume.png` |
| `marswalk_furniture.blend` | 2 MB | `assets_habitat/furniture/*.glb`, `layout.json` |

`assets/route.json`, `gravel_nl.jpg` and `slab_nl.jpg` are not made in Blender.
Details of every exported file are in `docs/marswalk-assets/README.md`.

## Other folders

- `bake/` : full-size baked textures the scenes link to (Cheyava rock, terrain High/Low, habitat lightmap and HDU texture), and the `.npy` arrays behind the interior light volume (`probe_light.npy`, `probe_mask.npy`) and the HDU texture edit (`hdu_regions.npy`).
- `data/` : the cropped inputs the terrain scene was built from: the 1 m elevation crop (`jezero_cheyava_dtm_1m.npy`), the 25 cm image crop, the CTX horizon ring, the outcrop mask and `jezero_cheyava_meta.json` (source URL, projection, centre latitude and longitude of the crop).

All image links inside the scenes are relative (`//bake/...`, `//data/...`), so the folder layout must stay as it is. The astronaut scene reads `public/marswalk/assets_astronaut/z2_accent_mask.png` from the repository.

## Not in the repository

- Raw NASA downloads: the 6.9 GB HiRISE orthomosaic and the 1.8 GB elevation model. Source URLs are in `data/jezero_cheyava_meta.json` and in the assets README.
- The original NASA Z-2 suit and habitat model downloads.
- `.blend1` backups (ignored in `.gitignore`) and the old `marswalk_terrain.blend` test.
- The layered outcrop scene, which arrives with issue #45.

## Conventions

1 unit = 1 m. Origin at Cheyava Falls. Blender +X east, +Y north, +Z up becomes three.js x east, z south, y up: Blender (x, y, z) is three.js (x, z, -y).
The HiRISE data is already corrected for its 5.4 % east-west stretch. Do not correct it again.
