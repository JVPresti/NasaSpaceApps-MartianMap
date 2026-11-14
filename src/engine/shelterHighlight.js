// Shelter highlight (issue #30): the shelter the planner chose, marked in green while an event is active.
//   - a safe zone draped on the ground around it (faint fill, bright edge, a ring pulsing outward)
//   - a low see-through wall of light around that zone, readable from eye height
//   - a column of light above it, visible from hundreds of metres and through the dust storm
// Close to the shelter the zone, the wall and the column fade out: the shelter itself is in plain sight there.
//   - a small floating marker with its distance from the player (shelterLabel.js)
// A habitat shelter is centred on the habitat the engine placed: the entry in shelters.json is its airlock door, which
// stays the point the distance is measured to.
//
//   sys.shelter.set({ id, name, x, z, type?, protection? } | null)   the entries of public/data/shelters.json fit as they are
//   sys.shelter.rebuild()                                            re-drape after the terrain mesh changes (tier switch)
//   sys.shelter.update(dt, player, camera)                           once per frame: fade in or out, marker
import * as THREE from 'three';
import * as SH from './shelterHighlight.shaders.js';
import { createShelterLabel } from './shelterLabel.js';
import { validShelter } from './shelterRules.js';

const RADIUS_M = { habitat: 9, natural: 7 };    // safe-zone radius by shelter type; 9 m encloses the 14.4 m habitat
const HABITAT_MID_M = 2.75;                     // habitat footprint centre along its axis, from the core (habitat.js: -4.45 to 9.95)
const HABITAT_SNAP_M = 40;                      // a habitat entry this close to the placed habitat is that habitat
const RINGS = 14, SEGMENTS = 64;                // ground disc resolution
const OUTER = 1.4;                              // the disc reaches past the edge so the pulse ring has room
const LIFT_M = 0.08;                            // above the drawn mesh
const WALL_H = 3.5;                             // height of the wall of light, metres
const BEACON_H = 120;                           // column height, metres: shows over ridges between the player and the shelter
const LABEL_H = 11;                             // label height above the ground: clear of the habitat roof (7.9 m)
const FADE_PER_S = 2.5;
const ZONE_FULL_FROM = 3;                       // zone and wall fully on beyond this many radii from the centre
const ZONE_OFF_WITHIN = 1.2;                    // and gone within this many radii (the player is at the shelter)

export function createShelterHighlight(ctx) {
  const { scene, U, sys } = ctx;
  const { meshH } = ctx.terrain;
  const uniforms = { ...U, uOn: { value: 0 }, uZone: { value: 1 }, uBeaconH: { value: BEACON_H } };
  const common = { uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide };

  const zone = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    ...common, vertexShader: SH.SHELTER_ZONE_VERT, fragmentShader: SH.SHELTER_ZONE_FRAG,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  }));
  zone.renderOrder = 2;

  const wall = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ ...common, vertexShader: SH.SHELTER_WALL_VERT, fragmentShader: SH.SHELTER_WALL_FRAG }));
  wall.renderOrder = 3;

  const beaconGeo = new THREE.BufferGeometry();
  beaconGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
  beaconGeo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, 0, 1, 0, 1, 1, -1, 1]), 2));
  beaconGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const beacon = new THREE.Mesh(beaconGeo, new THREE.ShaderMaterial({ ...common, vertexShader: SH.SHELTER_BEACON_VERT, fragmentShader: SH.SHELTER_BEACON_FRAG }));
  beacon.renderOrder = 3;

  const label = createShelterLabel();
  const group = new THREE.Group();
  group.add(zone, wall, beacon, label.sprite);
  group.visible = false;
  for (const o of [zone, wall, beacon]) o.frustumCulled = false;
  scene.add(group);

  let shelter = null;   // the one shown, or fading out
  let target = 0;       // 1 while a shelter is set

  function build() {
    if (!shelter) return;
    const { x, z } = shelter, R = shelter.radius;
    // ground disc: rings x segments, every vertex on the drawn mesh
    const n = (RINGS + 1) * (SEGMENTS + 1), pos = new Float32Array(n * 3), rr = new Float32Array(n), idx = [];
    for (let i = 0; i <= RINGS; i++) {
      const r = (i / RINGS) * OUTER;
      for (let j = 0; j <= SEGMENTS; j++) {
        const a = (j / SEGMENTS) * Math.PI * 2, px = x + Math.cos(a) * r * R, pz = z + Math.sin(a) * r * R, v = i * (SEGMENTS + 1) + j;
        pos.set([px, meshH(px, pz) + LIFT_M, pz], v * 3); rr[v] = r;
        if (i < RINGS && j < SEGMENTS) { const b = v + SEGMENTS + 1; idx.push(v, b, v + 1, v + 1, b, b + 1); }
      }
    }
    zone.geometry.dispose();
    zone.geometry = new THREE.BufferGeometry();
    zone.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    zone.geometry.setAttribute('aR', new THREE.BufferAttribute(rr, 1));
    zone.geometry.setIndex(idx);
    // wall: one ring of vertices on the ground at the zone edge, one WALL_H above it
    const wn = SEGMENTS + 1, wp = new Float32Array(wn * 6), wv = new Float32Array(wn * 2), wi = [];
    for (let j = 0; j < wn; j++) {
      const a = (j / SEGMENTS) * Math.PI * 2, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R, y0 = meshH(px, pz) + LIFT_M;
      wp.set([px, y0, pz, px, y0 + WALL_H, pz], j * 6); wv.set([0, 1], j * 2);
      if (j < SEGMENTS) wi.push(j * 2, j * 2 + 2, j * 2 + 1, j * 2 + 1, j * 2 + 2, j * 2 + 3);
    }
    wall.geometry.dispose();
    wall.geometry = new THREE.BufferGeometry();
    wall.geometry.setAttribute('position', new THREE.BufferAttribute(wp, 3));
    wall.geometry.setAttribute('aV', new THREE.BufferAttribute(wv, 1));
    wall.geometry.setIndex(wi);
    // beacon: all four corners at the base; the vertex shader spreads them
    const y = meshH(x, z), bp = beaconGeo.attributes.position;
    for (let k = 0; k < 4; k++) bp.setXYZ(k, x, y, z);
    bp.needsUpdate = true;
    label.sprite.position.set(x, y + LABEL_H, z);
  }

  return {
    group,
    /** @param {{ id?: string, name?: string, x: number, z: number, type?: string, protection?: string, radius?: number } | null} s */
    set(s) {
      if (s === null) { target = 0; return; }   // fades out; the last shelter stays drawn until then
      if (!validShelter(s)) throw new Error('setShelter: expected { x, z } in metres, or null');
      const partial = s.protection === 'partial', hab = sys.habitat;
      let cx = s.x, cz = s.z;
      if (s.type === 'habitat' && hab && hab.root && Math.hypot(s.x - hab.pos.x, s.z - hab.pos.z) < HABITAT_SNAP_M) {
        cx = hab.pos.x + hab.dir.x * HABITAT_MID_M; cz = hab.pos.z + hab.dir.z * HABITAT_MID_M;
      }
      shelter = {
        x: cx, z: cz, doorX: s.x, doorZ: s.z,
        radius: Number.isFinite(s.radius) && s.radius > 0 ? s.radius : (RADIUS_M[s.type] || RADIUS_M.natural),
        title: partial ? 'Partial cover' : 'Shelter',
      };
      target = 1;
      build();
    },
    rebuild() { build(); },
    /** @param {number} dt @param {{ x: number, z: number }} player @param {THREE.Camera} camera */
    update(dt, player, camera) {
      const u = uniforms.uOn;
      u.value += Math.sign(target - u.value) * Math.min(Math.abs(target - u.value), dt * FADE_PER_S);
      group.visible = !!shelter && u.value > 0.001;
      if (!group.visible) return;
      const r = Math.hypot(player.x - shelter.x, player.z - shelter.z) / shelter.radius;
      const t = Math.min(1, Math.max(0, (r - ZONE_OFF_WITHIN) / (ZONE_FULL_FROM - ZONE_OFF_WITHIN)));
      uniforms.uZone.value = t * t * (3 - 2 * t);
      label.update(shelter.title, Math.hypot(player.x - shelter.doorX, player.z - shelter.doorZ), camera, u.value, dt);
    },
    dispose() {
      zone.geometry.dispose(); zone.material.dispose(); wall.geometry.dispose(); wall.material.dispose(); beaconGeo.dispose(); beacon.material.dispose(); label.dispose();
      scene.remove(group);
    },
  };
}
