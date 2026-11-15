import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DOOR_OPEN, FURNITURE_MARGIN, HAB_SOLIDS, HAB_ZONES, PARTNER_GAP, ROCK_BLOCK_D, WALKER_RADIUS,
  addCircle, addFootprint, footprint, habCanStand, habSlide, habSlideWorld, habZone, pushOut, rockBlocks,
} from './collide.js';
import { OUTCROP, outcropFootprint, outcropPlacement } from './rocks.js';
import { decodeTerrain, heightAt } from '../sim/costGrid.js';

const load = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../public/marswalk/' + path, import.meta.url)), 'utf8'));
const habitatJson = load('assets_habitat/habitat.json');
const layout = load('assets_habitat/furniture/layout.json');
const rocksJson = load('assets/rocks.json');
const cheyava = load('assets/cheyava.json');
const ROCK_TYPES = Object.keys(rocksJson).filter((k) => rocksJson[k].lods);
const BLOCKS = layout.items.flatMap((it) => (it.blocks ? [].concat(it.blocks) : []));   // as habitat.init collects them
const FRAME = 1 / 60;   // s

// distance from p to the core segment of obstacle i
function segDist(p, obs, i) {
  const ax = obs[i], az = obs[i + 1], ex = obs[i + 2] - ax, ez = obs[i + 3] - az, l2 = ex * ex + ez * ez;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - ax) * ex + (p.z - az) * ez) / l2)) : 0;
  return Math.hypot(p.x - ax - ex * t, p.z - az - ez * t);
}
// smallest clearance between the walker's edge and any obstacle's edge (negative = overlap)
function clearance(p, obs) {
  let c = Infinity;
  for (let i = 0; i < obs.length; i += 5) c = Math.min(c, segDist(p, obs, i) - obs[i + 4] - WALKER_RADIUS);
  return c;
}
// walk at speed (m/s) for n frames; dirAt(p) gives the heading (unit vector) each frame, like holding a key
function walk(start, dirAt, n, obs, speed = 1.0) {
  const p = { ...start }, path = [];
  for (let k = 0; k < n; k++) {
    const d = dirAt(p); p.x += d.x * speed * FRAME; p.z += d.z * speed * FRAME;
    pushOut(p, obs, WALKER_RADIUS); path.push({ x: p.x, z: p.z });
  }
  return path;
}
// jitter = the walker moving back the way it just came between two frames
function reversals(path, key2 = 'z') {
  let n = 0;
  for (let k = 2; k < path.length; k++) {
    const ax = path[k - 1].x - path[k - 2].x, az = path[k - 1][key2] - path[k - 2][key2], bx = path[k].x - path[k - 1].x, bz = path[k][key2] - path[k - 1][key2];
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    if (la > 1e-7 && lb > 1e-7 && (ax * bx + az * bz) / (la * lb) < -0.5) n++;
  }
  return n;
}

describe('rock size filter', () => {
  it('blocks rocks of 0.35 m and larger and lets smaller ones through', () => {
    expect(ROCK_BLOCK_D).toBe(0.35);
    expect(rockBlocks(0.35)).toBe(true);
    expect(rockBlocks(2.5)).toBe(true);
    expect(rockBlocks(0.3499)).toBe(false);
    expect(rockBlocks(0.1)).toBe(false);
  });
});

describe('footprint', () => {
  for (const name of ROCK_TYPES) {
    it(`fits a capsule to the outline of ${name}`, () => {
      const p = rocksJson[name].lods[0].p, f = footprint(p);
      let hx = 0, hz = 0;
      for (let i = 0; i < p.length; i += 3) { hx = Math.max(hx, Math.abs(p[i] - f.cx)); hz = Math.max(hz, Math.abs(p[i + 2] - f.cz)); }
      expect(f.r).toBeCloseTo(Math.min(hx, hz), 6);              // short side: the radius
      expect(f.half + f.r).toBeCloseTo(Math.max(hx, hz), 6);     // long side: segment plus radius
      expect(f.half + f.r).toBeCloseTo(0.5, 2);                  // rock meshes are one unit long, so the rock's size is its longest side
    });
  }

  it('turns with the mesh: local x along (cos t, -sin t), local z along (sin t, cos t)', () => {
    const f = { cx: 0, cz: 0, alongX: false, half: 0.25, r: 0.25, ext: 0.5 };   // long along local z
    const out = [];
    addFootprint(out, f, 10, 20, 2, Math.cos(Math.PI / 2), -Math.sin(Math.PI / 2));   // t = 90 deg: local z now points along world +x
    expect(out[0]).toBeCloseTo(9.5, 9); expect(out[1]).toBeCloseTo(20, 9);
    expect(out[2]).toBeCloseTo(10.5, 9); expect(out[3]).toBeCloseTo(20, 9);
    expect(out[4]).toBe(0.5);
  });
});

describe('pushOut', () => {
  it('leaves a walker that is clear of every obstacle alone', () => {
    const obs = []; addCircle(obs, 0, 0, 1);
    const p = { x: 1.31, z: 0 };
    expect(pushOut(p, obs, WALKER_RADIUS)).toBe(false);
    expect(p).toEqual({ x: 1.31, z: 0 });
  });

  it('pushes a walker straight out of a circle and out of a capsule, side and tip', () => {
    const obs = []; addCircle(obs, 0, 0, 1);
    const p = { x: 0.6, z: 0.8 };
    pushOut(p, obs, WALKER_RADIUS);
    expect(p.x).toBeCloseTo(0.78, 9); expect(p.z).toBeCloseTo(1.04, 9);
    const cap = [-1, 0, 1, 0, 0.5];
    const side = { x: 0.3, z: -0.2 }, tip = { x: 1.3, z: 0 };
    pushOut(side, cap, WALKER_RADIUS); pushOut(tip, cap, WALKER_RADIUS);
    expect(side.x).toBeCloseTo(0.3, 9); expect(side.z).toBeCloseTo(-0.8, 9);
    expect(tip.x).toBeCloseTo(1.8, 9); expect(tip.z).toBeCloseTo(0, 9);
  });

  it('pushes a walker standing exactly on an obstacle centre out, the same way every time', () => {
    const obs = []; addCircle(obs, 2, 3, 0.4);
    const a = { x: 2, z: 3 }, b = { x: 2, z: 3 };
    pushOut(a, obs, WALKER_RADIUS); pushOut(b, obs, WALKER_RADIUS);
    expect(Math.hypot(a.x - 2, a.z - 3)).toBeCloseTo(0.7, 9);
    expect(a).toEqual(b);
  });

  for (const name of ROCK_TYPES) {
    it(`keeps the walker out of a ${name} of 0.35 m to 2.5 m, from four sides and three headings`, () => {
      const f = footprint(rocksJson[name].lods[0].p);
      for (const D of [0.35, 0.6, 1.0, 2.5]) for (const yaw of [0, 0.7, 2.1]) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const obs = []; addFootprint(obs, f, 0, 0, D, Math.cos(yaw), -Math.sin(yaw));
        const path = walk({ x: -dx * 4, z: -dz * 4 }, () => ({ x: dx, z: dz }), 600, obs, 1.5);   // 6 s of jogging straight at it
        for (const p of path) expect(clearance(p, obs)).toBeGreaterThan(-1e-9);   // it may slide off a turned rock, never into it
      }
    });
  }

  it('lets the walker slide around a rock it hits off-centre, without jitter', () => {
    const obs = []; addFootprint(obs, footprint(rocksJson.rock_07.lods[0].p), 0, 0, 1.0, 0, 1);   // 1 m rock, long side along the path: hit its round end
    const path = walk({ x: -3, z: 0.15 }, () => ({ x: 1, z: 0 }), 500, obs);
    for (const p of path) expect(clearance(p, obs)).toBeGreaterThan(-1e-9);
    expect(path[path.length - 1].x).toBeGreaterThan(1.5);   // got round it
    expect(reversals(path)).toBe(0);
    for (let k = 1; k < path.length; k++) expect(path[k].z).toBeGreaterThanOrEqual(path[k - 1].z - 1e-12);   // sideways motion never flips
  });

  it('holds the walker still in the notch between two overlapping rocks', () => {
    const obs = []; addCircle(obs, 0, 0.4, 0.5); addCircle(obs, 0, -0.4, 0.5);
    const path = walk({ x: -3, z: 0.05 }, () => ({ x: 1, z: 0 }), 600, obs);
    const tail = path.slice(-120);
    for (const p of tail) {
      expect(clearance(p, obs)).toBeGreaterThan(-0.005);
      expect(Math.hypot(p.x - tail[0].x, p.z - tail[0].z)).toBeLessThan(1e-4);   // held still for the last 2 s
    }
  });

  it('keeps the partner at least PARTNER_GAP away, also when a rock is behind the walker', () => {
    const obs = []; addCircle(obs, 0, 0, PARTNER_GAP - WALKER_RADIUS); addCircle(obs, -1.3, 0.2, 0.4);
    const path = walk({ x: -3, z: 0 }, () => ({ x: 1, z: 0 }), 400, obs);
    for (const p of path) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(PARTNER_GAP - 1e-6);
    expect(reversals(path)).toBe(0);
  });

  it('blocks the Cheyava Falls rock along its real outline', () => {
    const f = footprint(cheyava.p), t = cheyava.rot_z_blender, obs = [];
    addFootprint(obs, f, 0, 0, 1, Math.cos(t), -Math.sin(t));
    expect(f.half + f.r).toBeGreaterThan(0.5);   // about 1.05 x 0.65 m
    expect(f.r).toBeGreaterThan(0.3);
    for (let a = 0; a < 16; a++) {
      const dx = Math.cos(a * Math.PI / 8), dz = Math.sin(a * Math.PI / 8);
      const path = walk({ x: -dx * 4, z: -dz * 4 }, () => ({ x: dx, z: dz }), 400, obs);
      for (const p of path) expect(clearance(p, obs)).toBeGreaterThan(-1e-9);
    }
  });
});

describe('habitat zones and solids', () => {
  const wz = habitatJson.walk_zones;

  it('match walk_zones in habitat.json', () => {
    expect(HAB_ZONES.map((q) => q.n)).toEqual(wz.zones.map((z) => z.name));
    wz.zones.forEach((z, i) => {
      const q = HAB_ZONES[i];
      if (z.radius) expect(q.r).toBe(z.radius);
      else expect([q.x0, q.x1, q.v0, q.v1]).toEqual([...z.x, ...z.v]);
      expect(!!q.door).toBe(!!z.needs_door_open);
      expect(q.duck).toBe(z.duck_m);
      if (typeof z.floor === 'number') expect(q.floor(q.r ? 0 : (q.x0 + q.x1) / 2)).toBe(z.floor);
    });
    expect(HAB_SOLIDS.map((q) => (q.r ? [q.r] : [q.x0, q.x1, q.v0, q.v1]))).toEqual(wz.solids.map((s) => (s.radius ? [s.radius] : [...s.x, ...s.v])));
  });

  it('use the floor heights and hatch sills of habitat.json', () => {
    const z = Object.fromEntries(HAB_ZONES.map((q) => [q.n, q]));
    expect(z.stairs.floor(9.95)).toBeCloseTo(0, 9);     // the steps reach the ground
    expect(z.stairs.floor(8.23)).toBeCloseTo(1.02, 9);  // and meet the porch
    const top = habitatJson.floor_height_m + habitatJson.doors.sill_m;
    expect(z.hatch.floor(7.2)).toBeCloseTo(top, 9);
    expect(z.inner.floor(2.4)).toBeCloseTo(top, 9);
    expect(z.main.floor()).toBe(habitatJson.floor_height_m);
  });

  it('add the walker radius of habitat.json to the furniture circles', () => {
    expect(FURNITURE_MARGIN).toBe(Number(/plus ([\d.]+) m walker radius/.exec(wz.furniture)[1]));
  });

  it('leave a free ring round the planning table in the main room (layout.json free_floor)', () => {
    for (let a = 0; a < 360; a++) expect(habZone(1.3 * Math.cos(a * Math.PI / 180), 1.3 * Math.sin(a * Math.PI / 180), 1, BLOCKS)?.n).toBe('main');
  });

  it('need the outer hatch open to stand in it', () => {
    expect(habZone(7.05, 0, 1, BLOCKS)?.n).toBe('hatch');
    expect(habZone(7.05, 0, DOOR_OPEN - 0.01, BLOCKS)).toBeNull();
    expect(habCanStand(7.05, 0, 0, BLOCKS)).toBe(false);
  });
});

describe('habSlide', () => {
  // walk in habitat space; dirAt(p) gives the heading each frame
  function hwalk(start, dirAt, n, { open = 1, speed = 1.0 } = {}) {
    const p = { ...start }, out = { x: 0, v: 0 }, path = [];
    for (let k = 0; k < n; k++) {
      const d = dirAt(p);
      habSlide(p.x, p.v, p.x + d.x * speed * FRAME, p.v + d.v * speed * FRAME, open, BLOCKS, out);
      p.x = out.x; p.v = out.v; path.push({ x: p.x, v: p.v });
    }
    return path;
  }
  const toward = (tx, tv) => (p) => { const dx = tx - p.x, dv = tv - p.v, l = Math.hypot(dx, dv) || 1; return { x: dx / l, v: dv / l }; };
  const allStandable = (path, open = 1) => path.every((p) => habCanStand(p.x, p.v, open, BLOCKS));

  it('lets the walker climb the steps, pass both hatches and stand in the main room', () => {
    const path = hwalk({ x: 11, v: 0.3 }, toward(1.2, 0), 900);
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - 1.2, end.v)).toBeLessThan(0.02);
    expect(habZone(end.x, end.v, 1, BLOCKS).n).toBe('main');
    expect(allStandable(path)).toBe(true);
    const seen = new Set(path.map((p) => habZone(p.x, p.v, 1, BLOCKS)?.n));
    for (const n of ['stairs', 'porch', 'hatch', 'airlock', 'inner', 'main']) expect(seen.has(n)).toBe(true);
    // and back out again
    const back = hwalk(end, toward(11, 0), 900);
    expect(Math.hypot(back[back.length - 1].x - 11, back[back.length - 1].v)).toBeLessThan(0.02);
  });

  it('stops the walker at the outer hatch while it is shut, even on a long step', () => {
    const path = hwalk({ x: 11, v: 0 }, toward(1.2, 0), 900, { open: 0 });
    expect(path[path.length - 1].x).toBeCloseTo(7.25, 3);
    expect(path.every((p) => p.x >= 7.25 - 1e-9)).toBe(true);
    const out = { x: 0, v: 0 };
    habSlide(7.26, 0, 6.76, 0, 0, BLOCKS, out);   // 0.5 m in one frame would land in the airlock
    expect(out.x).toBeCloseTo(7.25, 3);
  });

  it('keeps the walker inside the airlock walls and slides it along them without stair-stepping', () => {
    for (const [dv, wall] of [[1, 0.8], [-1, -0.5]]) {
      const path = hwalk({ x: 4.5, v: 0 }, () => ({ x: 0, v: dv }), 180);
      expect(path[path.length - 1].v).toBeCloseTo(wall, 3);
      expect(allStandable(path)).toBe(true);
    }
    const s = Math.SQRT1_2, path = hwalk({ x: 6.5, v: 0.7 }, () => ({ x: -s, v: s }), 400);
    const onWall = path.filter((p) => p.v > 0.8 - 1e-3 && p.x > 2.9);
    expect(onWall.length).toBeGreaterThan(100);
    for (let k = 1; k < onWall.length; k++) expect(onWall[k - 1].x - onWall[k].x).toBeCloseTo(s * FRAME, 6);   // steady slide, same speed every frame
    expect(path[path.length - 1].x).toBeCloseTo(2.8, 3);   // stops in the corner by the inner hatch
    expect(reversals(path, 'v')).toBe(0);
  });

  it('keeps the walker on the steps and the porch (handrails), even on a long step', () => {
    const path = hwalk({ x: 8.0, v: 0 }, () => ({ x: 0, v: 1 }), 120);
    expect(path[path.length - 1].v).toBeCloseTo(0.6, 3);
    const out = { x: 0, v: 0 };
    habSlide(8.0, 0.55, 8.0, 0.85, 1, BLOCKS, out);   // 0.3 m in one frame would clear the rail
    expect(out.v).toBeCloseTo(0.6, 3);
  });

  it('stops the walker at the planning table and the furniture, and slides it round them', () => {
    const t = hwalk({ x: 1.2, v: 0 }, () => ({ x: -1, v: 0 }), 120);
    expect(Math.hypot(t[t.length - 1].x, t[t.length - 1].v)).toBeCloseTo(0.7 + FURNITURE_MARGIN, 3);
    // walk the free ring all the way round, steering along it
    let turned = 0, prev = 0;
    const ring = hwalk({ x: 1.2, v: 0 }, (p) => { const a = Math.atan2(p.v, p.x) + 0.3; return toward(1.2 * Math.cos(a), 1.2 * Math.sin(a))(p); }, 1200);
    for (const p of ring) { const a = Math.atan2(p.v, p.x); let d = a - prev; if (d < -Math.PI) d += 2 * Math.PI; turned += d; prev = a; }
    expect(turned).toBeGreaterThan(2 * Math.PI);
    expect(allStandable(ring)).toBe(true);
    expect(reversals(ring, 'v')).toBe(0);
    // pressed against the table while walking round it: hugs the circle, smoothly
    const hug = hwalk({ x: 0.9502 * Math.cos(-0.3), v: 0.9502 * Math.sin(-0.3) }, (p) => { const l = Math.hypot(p.x, p.v); return { x: (-p.v / l) - 0.3 * p.x / l, v: (p.x / l) - 0.3 * p.v / l }; }, 60);
    for (const p of hug) expect(Math.hypot(p.x, p.v)).toBeCloseTo(0.7 + FURNITURE_MARGIN, 3);
    expect(reversals(hug, 'v')).toBe(0);
  });

  it('keeps an outside walker out of the shell and slides it round, without jitter', () => {
    const path = hwalk({ x: 0, v: -4 }, () => ({ x: 0, v: 1 }), 180);
    expect(path[path.length - 1].v).toBeCloseTo(-2.75, 3);
    const round = hwalk({ x: -0.5, v: -2.8 }, (p) => { const l = Math.hypot(p.x, p.v); return { x: (-p.v / l) - 0.2 * p.x / l, v: (p.x / l) - 0.2 * p.v / l }; }, 240);
    for (const p of round) expect(Math.hypot(p.x, p.v)).toBeGreaterThanOrEqual(2.75);
    expect(allStandable(round)).toBe(true);
    expect(reversals(round, 'v')).toBe(0);
    for (const p of hwalk({ x: 3, v: -3 }, () => ({ x: 0.2, v: 1 }), 300)) expect(habCanStand(p.x, p.v, 1, BLOCKS)).toBe(true);   // into the tunnel side
  });

  it('slides along the walls of a turned habitat in world space at a steady speed (no zigzag)', () => {
    const hx = 520, hz = 600, yaw = 0.7, c = Math.cos(yaw), s = Math.sin(yaw);
    const world = (x, v) => ({ x: hx + x * c + v * s, z: hz - x * s + v * c });   // inverse of habitat.local
    const local = (p) => ({ x: (p.x - hx) * c - (p.z - hz) * s, v: (p.x - hx) * s + (p.z - hz) * c });
    const free = world(4.5, 0), same = { ...free };
    habSlideWorld(hx, hz, yaw, 1, BLOCKS, free.x - 0.01, free.z, same);
    expect(same).toEqual(free);   // an unblocked step is left exactly as it was
    // pressed diagonally against the airlock wall (v = 0.8), heading along it toward the main room
    const h = Math.SQRT1_2, d = { x: -h * c + h * s, z: h * s + h * c }, p = world(6.5, 0.79), xs = [];
    for (let k = 0; k < 200; k++) {
      const x0 = p.x, z0 = p.z; p.x += d.x * FRAME; p.z += d.z * FRAME;
      habSlideWorld(hx, hz, yaw, 1, BLOCKS, x0, z0, p);
      const l = local(p); expect(l.v).toBeLessThanOrEqual(0.8 + 1e-9); xs.push(l.x);
    }
    for (let k = 20; k < xs.length; k++) expect(xs[k - 1] - xs[k]).toBeCloseTo(h * FRAME, 6);   // 0.71 m/s along the wall, every frame
  });

  it('frees a walker caught inside a wall at the nearest place it may stand', () => {
    const out = { x: 0, v: 0 };
    habSlide(0, 2.5, 0, 2.51, 1, BLOCKS, out);   // between the main room and the outer shell
    expect(habCanStand(out.x, out.v, 1, BLOCKS)).toBe(true);
    expect(Math.hypot(out.x, out.v - 2.5)).toBeLessThan(0.3);
    habSlide(7.05, 0, 7.04, 0, 0, BLOCKS, out);   // in the hatch as it shut: back onto the porch or into the airlock, not round the habitat
    expect(habCanStand(out.x, out.v, 0, BLOCKS)).toBe(true);
    expect(Math.abs(out.x - 7.05)).toBeLessThan(0.25);
  });
});

describe('the layered outcrop at WP3', () => {
  // vertex positions of a node's mesh in a .glb (tightly packed float32 positions, no node transform: true of outcrop.glb)
  function glbPositions(path, nodeName) {
    const b = readFileSync(fileURLToPath(new URL('../../public/marswalk/' + path, import.meta.url)));
    const n = b.readUInt32LE(12), j = JSON.parse(b.toString('utf8', 20, 20 + n)), bin = 20 + n + 8;
    const node = j.nodes.find((q) => q.name === nodeName), a = j.accessors[j.meshes[node.mesh].primitives[0].attributes.POSITION], v = j.bufferViews[a.bufferView];
    const p = new Float32Array(a.count * 3), o = bin + (v.byteOffset || 0) + (a.byteOffset || 0);
    for (let i = 0; i < a.count * 3; i++) p[i] = b.readFloatLE(o + i * 4);
    return p;
  }
  const p = glbPositions('assets/outcrop.glb', 'Outcrop_LOD0');
  // the real ground at WP3 (route.json): the stance point is on 14 degree ground, the outcrop on the 22 degree slope above it
  const grid = decodeTerrain(load('assets/terrain.json')), slope = (x, z) => heightAt(grid, x, z);
  const wp = load('assets/route.json').waypoints.find((w) => w.name.startsWith(OUTCROP.waypoint));
  const at = outcropPlacement(wp, slope), f = outcropFootprint(p, at, slope), obs = [];
  addFootprint(obs, f, at.x, at.z, 1, at.ux, at.uz);

  it('blocks the walker along the part of it that stands above the ground', () => {
    // the 6.7 x 3.4 m model lies on the 22 degree slope with its uphill half buried: about 3.3 x 3 m stands up, downhill
    expect(f).not.toBeNull();
    expect(2 * (f.half + f.r)).toBeGreaterThan(2.8);
    expect(2 * (f.half + f.r)).toBeLessThan(4.5);
    expect(2 * f.r).toBeGreaterThan(2.5);
    expect(f.cx).toBeLessThan(-0.5);
    for (let a = 0; a < 16; a++) {
      const dx = Math.cos(a * Math.PI / 8), dz = Math.sin(a * Math.PI / 8);
      const path = walk({ x: at.x - dx * 8, z: at.z - dz * 8 }, () => ({ x: dx, z: dz }), 900, obs);
      for (const q of path) expect(clearance(q, obs)).toBeGreaterThan(-1e-9);
    }
  });

  it('leaves room to stand at the waypoint in front of its broken face', () => {
    expect(OUTCROP.back).toBeGreaterThan(2);
    expect(clearance(wp, obs)).toBeGreaterThan(0.2);
    const path = walk(wp, () => ({ x: at.ux, z: at.uz }), 300, obs);   // walk uphill at it from the waypoint
    const end = path[path.length - 1];
    expect(clearance(end, obs)).toBeCloseTo(0, 6);   // stopped against it
    expect(Math.hypot(end.x - wp.x, end.z - wp.z)).toBeLessThan(2);   // still inside the 2 m arrival circle
  });
});
