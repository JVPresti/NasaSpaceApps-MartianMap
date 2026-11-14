// Every file the initial scene loads, registered up front so the loading bar has a stable
// denominator instead of jumping to 100 % after the first batch and then falling back.
// Keep this list in step with the loaders in engine/index.js and the subsystems under engine/.
import { TIERS } from './tiers.js';

export const ROCK_NAMES = ['rock_09', 'rock_07', 'namaqualand_boulder_06', 'namaqualand_boulder_05', 'namaqualand_boulder_03'];

// One entry per glb in public/marswalk/assets_habitat/furniture/; layout.json places copies of these.
export const FURNITURE_MODELS = [
  'planning_table',
  'stool',
  'suit_rack',
  'sample_glovebox',
  'shelves',
  'crate',
  'sample_canister',
  'tablet',
];

const CORE_JSON = [
  'assets/terrain.json',
  'assets/ring.json',
  'assets/atmosphere_presets.json',
  'assets/rocks.json',
  'assets/cheyava.json',
  'assets/route.json',
];

const CORE_TEXTURES = [
  'assets/normal_ao.jpg',
  'assets/outcrop_mask.jpg',
  'assets/gravel_nl.jpg',
  'assets/slab_nl.jpg',
  'assets/ring_gray.jpg',
  'assets/cheyava_color.jpg',
  'assets/cheyava_nao.jpg',
  ...ROCK_NAMES.map((name) => 'assets/' + name + '.jpg'),
];

const MODELS = [
  'assets_astronaut/z2_astronaut.glb',
  'assets_astronaut/z2_fp_legs.glb',
  'assets_astronaut/arm_left.glb',
  'assets_astronaut/arm_clips.glb',
  'assets_props/sample_scoop.glb',
  'assets_props/tool_case.glb',
  'assets/outcrop.glb',
  'assets_habitat/habitat.glb',
  'assets_habitat/habitat_interior.glb',
  ...FURNITURE_MODELS.map((name) => 'assets_habitat/furniture/' + name + '.glb'),
];

const OTHER = [
  'assets_astronaut/z2_accent_mask.png',
  'assets_habitat/interior_lightmap.jpg',
  'assets_habitat/interior_lightvolume.png',
  'assets_habitat/furniture/layout.json',
];

/**
 * Relative paths under public/marswalk/ for one initial boot at the given quality tier.
 * @param {'high' | 'low'} tier
 * @returns {string[]}
 */
export function buildAssetManifest(tier) {
  const ortho = (TIERS[tier] || TIERS.high).ortho;
  const oc = tier === 'low' ? '_lo' : '';   // the layered outcrop has half-size textures for the Low tier
  return [...CORE_JSON, ...CORE_TEXTURES, 'assets/' + ortho, 'assets/outcrop_color' + oc + '.jpg', 'assets/outcrop_nao' + oc + '.jpg', ...MODELS, ...OTHER];
}
