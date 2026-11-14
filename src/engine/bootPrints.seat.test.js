// Boot prints sit on the terrain that is drawn, on both tiers (#46 follow-up to #141). Uses the real terrain.json and
// the real terrain mesh from terrain.js, so a change to the triangle split or the tier grids shows up here.
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { decodeTerrainJson } from './queries.js';
import { createTerrain } from './terrain.js';
import { TIERS } from './tiers.js';
import { createStepTracker, seatPrint } from './bootPrintRules.js';

const u16 = (s) => { const b = Buffer.from(s, 'base64'); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength / 2); };
const u8 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const T = decodeTerrainJson(JSON.parse(readFileSync(new URL('../../public/marswalk/assets/terrain.json', import.meta.url), 'utf8')), u16, u8);
const ROUTE = JSON.parse(readFileSync(new URL('../../public/marswalk/assets/route.json', import.meta.url), 'utf8')).waypoints.map((w) => [w.x, w.z]);
const PATROL = [[14, 58], [5, 12]];   // the scripted partner's A and B (partnerSource.js)
const HALF_W = 0.12, HALF_L = 0.22, LIFT_M = 0.015;   // bootPrints.js QUAD_W / 2, QUAD_L / 2, LIFT_M

function terrainFor(tier) {
  const terrain = createTerrain({ T, RING: null, U: {}, scene: new THREE.Scene() });
  terrain.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  terrain.buildTerrain(TIERS[tier]);
  terrain.group.updateMatrixWorld(true);
  return terrain;
}

// the prints of walking a polyline at 1 m/s, 60 frames a second
function printsAlong(path) {
  const t = createStepTracker(), out = [], emit = (x, z, yaw) => out.push({ x, z, yaw });
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) * 60);
    for (let k = 0; k <= n; k++) t.track(ax + (bx - ax) * k / n, az + (bz - az) * k / n, undefined, false, emit);
  }
  return out;
}
const PRINTS = [...printsAlong(ROUTE), ...printsAlong(PATROL), ...printsAlong(PATROL.slice().reverse())];

describe.each(['high', 'low'])('boot prints on the %s tier', (tier) => {
  const terrain = terrainFor(tier);

  it('reads the height of the triangles the GPU draws', () => {
    const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), chunks = TIERS[tier].chunks;
    let worst = 0;
    for (let i = 0; i < 150; i++) {
      // spread over the tile, away from the chunk edges where a ray can hit two chunks
      const x = (((i * 0.6180339) % 1) - 0.5) * T.W * 0.98, z = (((i * 0.4142136) % 1) - 0.5) * T.H * 0.98;
      const cx = Math.min(chunks - 1, Math.floor((x / T.W + 0.5) * chunks)), cz = Math.min(chunks - 1, Math.floor((z / T.H + 0.5) * chunks));
      ray.set(new THREE.Vector3(x, 1000, z), down);
      const [hit] = ray.intersectObject(terrain.group.children[cz * chunks + cx]);
      expect(hit).toBeDefined();
      worst = Math.max(worst, Math.abs(hit.point.y - terrain.meshTriH(x, z)));
    }
    expect(worst).toBeLessThan(1e-3);   // float32 vertex positions
  });

  it('keeps every print on or above the drawn surface, and close to it', () => {
    const seat = { y: 0, ux: 0, uy: 1, uz: 0 }, h = terrain.meshTriH;
    let lowest = Infinity, centreLowest = Infinity;
    const highest = [];
    for (const p of PRINTS) {
      seatPrint(h, p.x, p.z, p.yaw, HALF_W, HALF_L, LIFT_M, seat);
      const fx = Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = Math.sin(p.yaw);
      let top = -Infinity;
      // the quad's plane against the triangles on a 9 x 13 grid over the whole quad
      for (let a = 0; a <= 8; a++) for (let b = 0; b <= 12; b++) {
        const u = (a / 4 - 1) * HALF_W, v = (b / 6 - 1) * HALF_L;
        const qx = p.x + rx * u + fx * v, qz = p.z + rz * u + fz * v;
        const quadY = seat.y - (seat.ux * (qx - p.x) + seat.uz * (qz - p.z)) / seat.uy;
        const gap = quadY - h(qx, qz);
        lowest = Math.min(lowest, gap); top = Math.max(top, gap);
        if (a === 4 && b === 6) centreLowest = Math.min(centreLowest, gap);
      }
      highest.push(top);
    }
    highest.sort((a, b) => a - b);
    expect(PRINTS.length).toBeGreaterThan(1900);
    expect(centreLowest).toBeGreaterThanOrEqual(LIFT_M - 1e-6);   // no print centre below the drawn surface plus the lift
    expect(lowest).toBeGreaterThan(0);                             // no part of any quad under the surface
    expect(highest[Math.floor(highest.length * 0.99)]).toBeLessThan(0.04);   // and not floating: p99 of the highest gap
  });
});
