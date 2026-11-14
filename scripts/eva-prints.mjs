// Simulates the boot prints of a whole EVA and reports whether the player's trail home survives (#46).
//
//   npm run prints:eva
//   npm run prints:eva -- --hours 3
//
// The player walks the route from the habitat to Cheyava Falls at 1 m/s, works the site in a lawnmower pattern
// (always on fresh ground, the worst case for the ring), and walks back along the same line. The scripted partner
// patrols its 47 m line the whole time. Both feed the same trackers and rings the engine uses (bootPrintRules.js),
// 60 frames a second. The habitat's no-print zone is left out: it only removes prints.
// The same run with the old shared 5000-print ring and no spacing check shows what #141 kept.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStepTracker, createPrintStore, KEEP_PLAYER, KEEP_PARTNER } from '../src/engine/bootPrintRules.js';
import { createScriptedPartner } from '../src/engine/partnerSource.js';

const ROUTE = JSON.parse(readFileSync(new URL('../public/marswalk/assets/route.json', import.meta.url), 'utf8')).waypoints.map((w) => [w.x, w.z]);
const OLD_KEEP = 5000;
const GPU_BYTES_PER_SLOT = 16 * 4 + 4 + 4;   // instance matrix, aSide, aSeed

// a point moving along a polyline at a speed: returns { x, z, done }
function follower(path, speed) {
  let i = 0, x = path[0][0], z = path[0][1];
  return (dt) => {
    let left = speed * dt;
    while (left > 0 && i < path.length - 1) {
      const [bx, bz] = path[i + 1], d = Math.hypot(bx - x, bz - z);
      if (d <= left) { x = bx; z = bz; left -= d; i++; } else { x += (bx - x) / d * left; z += (bz - z) / d * left; left = 0; }
    }
    return { x, z, done: i >= path.length - 1 };
  };
}
const pathLength = (p) => p.slice(1).reduce((L, q, k) => L + Math.hypot(q[0] - p[k][0], q[1] - p[k][1]), 0);

/** @param {{ hours?: number, fps?: number }} [options] */
export function simulateEva({ hours = 2, fps = 60 } = {}) {
  const dt = 1 / fps, frames = Math.round(hours * 3600 * fps), speed = 1.0;
  const outLen = pathLength(ROUTE), back = ROUTE.slice().reverse();
  const siteSec = hours * 3600 - 2 * outLen / speed;
  if (siteSec <= 0) throw new Error('EVA too short for the route');
  // lawnmower over the site: 60 m rows 1 m apart, as many as fit in the site time with the walk back to the start
  const rowLen = 60, rows = Math.floor((siteSec * speed - rowLen) / (rowLen + 2)), [cx, cz] = ROUTE[ROUTE.length - 1], site = [[cx, cz]];
  for (let r = 0; r < rows; r++) { const z = cz + r * 1; site.push([cx + (r % 2 ? 0 : rowLen), z], [cx + (r % 2 ? 0 : rowLen), z + 1]); }
  site.push([cx, cz]);

  const player = { tracker: createStepTracker(), store: createPrintStore(KEEP_PLAYER), offered: 0 };
  const partner = { tracker: createStepTracker(), store: createPrintStore(KEEP_PARTNER), offered: 0 };
  const outbound = [];   // { slot, x, z } of every outbound print the player kept
  let phase = 'out', move = follower(ROUTE, speed), siteEnd = 0, oldTotal = 0;
  const oldOutboundIndex = [];   // index in the old shared ring's stream of each outbound print
  let px = ROUTE[0][0], pz = ROUTE[0][1], pyaw = 0;
  const emitPlayer = (x, z, yaw, side) => {
    player.offered++; oldTotal++;
    if (phase === 'out') oldOutboundIndex.push(oldTotal);
    const s = player.store.add(x, z, yaw, side);
    if (s >= 0 && phase === 'out') outbound.push({ slot: s, x: player.store.x[s], z: player.store.z[s] });
  };
  const emitPartner = (x, z, yaw, side) => { partner.offered++; oldTotal++; partner.store.add(x, z, yaw, side); };

  const source = createScriptedPartner();
  const world = { player: { x: px, z: pz }, habitat: null, duck: () => 0 };
  const t0 = performance.now();
  for (let f = 0; f < frames; f++) {
    const p = move(dt);
    const dx = p.x - px, dz = p.z - pz;
    if (Math.hypot(dx, dz) > 1e-6) pyaw = Math.atan2(dx, -dz);
    px = p.x; pz = p.z;
    player.tracker.track(px, pz, pyaw, false, emitPlayer);
    if (p.done && phase === 'out') { phase = 'site'; move = follower(site, speed); }
    else if (p.done && phase === 'site') { phase = 'back'; siteEnd = f; move = follower(back, speed); }

    world.player.x = px; world.player.z = pz;
    const st = source.update(dt, world);
    if (st.visible && !st.action) partner.tracker.track(st.x, st.z, Math.PI - st.yaw, false, emitPartner);
    else partner.tracker.reset();
  }
  const ms = performance.now() - t0;

  const kept = outbound.filter((o) => player.store.x[o.slot] === o.x && player.store.z[o.slot] === o.z).length;
  const oldKept = oldOutboundIndex.filter((i) => oldTotal - i < OLD_KEEP).length;
  return {
    hours, routeM: Math.round(outLen), siteMin: Math.round(siteSec / 60), backStartedMin: Math.round(siteEnd / fps / 60),
    player: { offered: player.offered, kept: player.store.count, capacity: KEEP_PLAYER, bytes: player.store.bytes },
    partner: { offered: partner.offered, kept: partner.store.count, capacity: KEEP_PARTNER, bytes: partner.store.bytes },
    outbound: { prints: outbound.length, stillThere: kept },
    oldSharedRing: { outbound: oldOutboundIndex.length, stillThere: oldKept },
    gpuBytes: (KEEP_PLAYER + KEEP_PARTNER) * GPU_BYTES_PER_SLOT,
    simMs: Math.round(ms),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--hours'), r = simulateEva({ hours: i > 0 ? Number(process.argv[i + 1]) : 2 });
  const kb = (b) => (b / 1024).toFixed(0) + ' KB';
  console.log(`EVA ${r.hours} h: route ${r.routeM} m each way, ${r.siteMin} min at the site, walk back from minute ${r.backStartedMin}`);
  console.log(`player:  ${r.player.offered} steps, ${r.player.kept} / ${r.player.capacity} prints kept, ring ${kb(r.player.bytes)}`);
  console.log(`partner: ${r.partner.offered} steps, ${r.partner.kept} / ${r.partner.capacity} prints kept, ring ${kb(r.partner.bytes)}`);
  console.log(`outbound trail: ${r.outbound.stillThere} of ${r.outbound.prints} prints still there at the end`);
  console.log(`old shared ${OLD_KEEP} ring: ${r.oldSharedRing.stillThere} of ${r.oldSharedRing.outbound} outbound prints would be left`);
  console.log(`GPU buffers: ${kb(r.gpuBytes)} (instance matrix + aSide + aSeed for ${KEEP_PLAYER + KEEP_PARTNER} slots); simulated in ${r.simMs} ms`);
}
