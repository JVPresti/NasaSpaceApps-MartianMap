import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AIRLOCK_STEPS_FOOT_M, airlockExit, partnerPatrol, PARTNER_SIDE_M } from './spawn.js';
import { PARTNER_GAP } from './collide.js';
import { buildCostGrid, heightAt } from '../sim/costGrid.js';

const read = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));
const route = read('../../public/marswalk/assets/route.json');
const shelters = read('../../public/data/shelters.json');
const habitatJson = read('../../public/marswalk/assets_habitat/habitat.json');
const grid = buildCostGrid(read('../../public/marswalk/assets/terrain.json'));

// The placement rule of habitat.init (src/engine/habitat.js), on the planner's height grid as in scripts/build-shelters.mjs.
function placeHabitat() {
  const hab = route.waypoints.find((w) => w.name === 'HAB'), next = route.waypoints[1];
  let best = null;
  for (let dz = -30; dz <= 30; dz += 3) for (let dx = -30; dx <= 30; dx += 3) {
    const x = hab.x + dx, z = hab.z + dz;
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 12; a += 1) {
      const h = heightAt(grid, x + Math.cos(a * 0.5236) * 5.5, z + Math.sin(a * 0.5236) * 5.5);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (!best || hi - lo < best.relief) best = { x, z, relief: hi - lo };
  }
  const length = Math.hypot(next.x - best.x, next.z - best.z);
  return { pos: { x: best.x, z: best.z }, dir: { x: (next.x - best.x) / length, z: (next.z - best.z) / length } };
}

const forward = (yaw) => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });   // view.js

describe('EVA start at the airlock (#166)', () => {
  const { pos, dir } = placeHabitat();
  const wp1 = route.waypoints[1];
  const exit = airlockExit(pos, dir, wp1);

  it('uses the steps foot from habitat.json', () => {
    expect(habitatJson.airlock).toContain(`x = ${AIRLOCK_STEPS_FOOT_M}`);
  });

  it('puts the player within a metre of the HAB airlock entry in shelters.json', () => {
    const entry = shelters.shelters.find((s) => s.id === 'HAB');
    expect(Math.hypot(exit.x - entry.x, exit.z - entry.z)).toBeLessThan(1);
  });

  it('is about 800 m from the old start near Cheyava Falls', () => {
    expect(Math.hypot(exit.x - 8, exit.z - 70)).toBeGreaterThan(700);
  });

  it('faces WP1', () => {
    const f = forward(exit.yaw), d = Math.hypot(wp1.x - exit.x, wp1.z - exit.z);
    expect(f.x).toBeCloseTo((wp1.x - exit.x) / d, 6);
    expect(f.z).toBeCloseTo((wp1.z - exit.z) / d, 6);
  });

  it('faces out of the airlock without a target', () => {
    const f = forward(airlockExit(pos, dir).yaw);
    expect(f.x).toBeCloseTo(dir.x, 6);
    expect(f.z).toBeCloseTo(dir.z, 6);
  });

  it('starts the partner beside the player, outside the collision gap, walking toward WP1', () => {
    const { A, B } = partnerPatrol(exit);
    const side = Math.hypot(A.x - exit.x, A.z - exit.z);
    expect(side).toBeCloseTo(PARTNER_SIDE_M, 6);
    expect(side).toBeGreaterThan(PARTNER_GAP);
    expect(Math.hypot(B.x - wp1.x, B.z - wp1.z)).toBeLessThan(Math.hypot(A.x - wp1.x, A.z - wp1.z));
  });
});
