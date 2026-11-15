import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { ZONE_LAYER } from '../zone/zoneLayer.js';
import { ZONE_REFRESH, returnZoneService, zoneChange, zoneInput } from './returnZone.js';
import { zoneStatus } from '../zone/zoneStatus.js';

const hazards = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/hazards.json', import.meta.url)), 'utf8'));
const c = suitConstantsFromHazards(hazards);
const habitat = { x: 535.1, z: 574.1 };
const base = {
  mode: 'plan',
  eva: { phase: 'ready' },
  suit: { oxygenG: null },
  navigation: { x: 500, z: 560, trueX: 501, trueZ: 561 },
  mission: { elapsedSec: 0 },
  route: { budget: { o2StartG: 600, usableSec: 1530 }, shelter: null },
  alerts: {},
  hazards: { zones: [] },
};

describe('zoneInput', () => {
  it('gives the plan zone from the habitat with the crew\'s O2 and planned time before the EVA', () => {
    const input = zoneInput(base, habitat, c);
    expect(input).toMatchObject({ kind: 'plan', home: habitat, from: null, suit: { o2G: 600, elapsedSec: 0 }, evaLimitSec: 1530 });
    expect(input.modifiers.homeward).toBe(false);
  });

  it('falls back to a full tank and the suit limit without a plan', () => {
    const input = zoneInput({ ...base, route: { budget: null } }, habitat, c);
    expect(input.suit.o2G).toBe(c.o2UsableG);
    expect(input.evaLimitSec).toBeUndefined();
  });

  it('follows the astronaut\'s true position, O2 and EVA time during the walk', () => {
    const s = { ...base, mode: 'walk', suit: { oxygenG: 700 }, mission: { elapsedSec: 120 } };
    expect(zoneInput(s, habitat, c)).toMatchObject({ kind: 'live', home: habitat, from: { x: 501, z: 561 }, suit: { o2G: 700, elapsedSec: 120 } });
  });

  it('turns homeward and heads for the shelter while the storm is on', () => {
    const s = {
      ...base, mode: 'walk', suit: { oxygenG: 700 },
      alerts: { 'dust-storm': { eventId: 'dust-storm', active: true } },
      route: { ...base.route, shelter: { id: 'HAB', x: 535.1, z: 574.1 } },
    };
    const input = zoneInput(s, habitat, c);
    expect(input.modifiers.homeward).toBe(true);
    expect(input.events).toEqual(['dust-storm']);
    expect(zoneInput({ ...s, alerts: { 'low-oxygen-caution': { eventId: 'low-oxygen-caution', active: true } } }, habitat, c).modifiers.homeward).toBe(false);
  });
});

describe('zoneChange', () => {
  const walk = zoneInput({ ...base, mode: 'walk', suit: { oxygenG: 700 } }, habitat, c);
  const moved = (dx, extra = {}) => ({ ...walk, from: { x: walk.from.x + dx, z: walk.from.z }, ...extra });

  it('waits for 5 m, 2 g of O2 or 10 s of EVA time', () => {
    expect(zoneChange(walk, moved(ZONE_REFRESH.moveM - 1)).needed).toBe(false);
    expect(zoneChange(walk, moved(ZONE_REFRESH.moveM))).toEqual({ needed: true, urgent: false });
    expect(zoneChange(walk, { ...walk, suit: { o2G: 698, elapsedSec: 0 } }).needed).toBe(true);
    expect(zoneChange(walk, { ...walk, suit: { o2G: 700, elapsedSec: 10 } }).needed).toBe(true);
  });

  it('recomputes at once when an event starts, so the snap lands on the alert', () => {
    expect(zoneChange(walk, { ...walk, events: ['radiation'], modifiers: { ...walk.modifiers, homeward: true } })).toEqual({ needed: true, urgent: true });
    expect(zoneChange(null, walk)).toEqual({ needed: true, urgent: true });
  });
});

describe('the zone legend numbers', () => {
  it('come from the zone inputs, so hazards.json sets the O2 reserve and the caution margin', () => {
    const status = zoneStatus({
      kind: 'plan', events: [], stats: { limit: 'eva', reachM: 600 }, budget: { availableSec: 1800, reserveSec: 270 },
      inputs: { o2G: c.o2UsableG, o2UsableG: c.o2UsableG, reserveSec: c.reserveSec, cautionSec: c.cautionSec, evaLimitSec: 1530, elapsedSec: 0 },
    });
    expect(status.head).toContain(`${c.reserveSec / 60} min O2 reserve`);
    expect(status.head).toContain(`tight under ${c.cautionSec / 60} min`);
    expect(ZONE_LAYER.swatches.map((sw) => sw.detail).join(' ')).not.toMatch(/\d+ min/);
  });
});

describe('zoneChange on the table', () => {
  const plan = zoneInput(base, habitat, c);

  it('recomputes when only the battery the crew sets changes', () => {
    const lower = zoneInput({ ...base, route: { ...base.route, budget: { ...base.route.budget, batteryStartWh: 600 } } }, habitat, c);
    expect(lower.suit.batteryWh).toBe(600);
    expect(zoneChange(plan, lower)).toEqual({ needed: true, urgent: false });
    expect(zoneChange(plan, zoneInput(base, habitat, c)).needed).toBe(false);
  });

  it('recomputes at once when a hazard area moves, grows or switches off, not only when one is added', () => {
    const at = (zone) => zoneInput({ ...base, hazards: { zones: [zone] } }, habitat, c);
    const a = at({ id: 'h', x: 10, z: 10, radiusM: 20, active: true });
    expect(zoneChange(a, at({ id: 'h', x: 30, z: 10, radiusM: 20, active: true }))).toEqual({ needed: true, urgent: true });
    expect(zoneChange(a, at({ id: 'h', x: 10, z: 10, radiusM: 40, active: true })).urgent).toBe(true);
    expect(zoneChange(a, at({ id: 'h', x: 10, z: 10, radiusM: 20, active: false })).urgent).toBe(true);
    expect(zoneChange(a, at({ id: 'h', x: 10, z: 10, radiusM: 20, active: true })).needed).toBe(false);
  });

  it('builds the plan key once while the route objects stay the same', () => {
    const memo = {};
    const first = zoneInput(base, habitat, c, memo).plan;
    expect(zoneInput({ ...base, mission: { elapsedSec: 5 } }, habitat, c, memo).plan).toBe(first);
    expect(zoneInput({ ...base, route: { ...base.route, budget: { ...base.route.budget } } }, habitat, c, memo).plan).not.toBe(first);
    // another caller's memo, as another store's service has, builds its own plan
    expect(zoneInput(base, habitat, c, {}).plan).not.toBe(first);
  });
});

describe('returnZoneService', () => {
  function fakeStore(state) {
    const subs = new Set();
    return { getState: () => state, setState: (next) => { state = { ...state, ...next }; subs.forEach((f) => f(state)); }, subscribe: (f) => { subs.add(f); return () => subs.delete(f); } };
  }
  const deps = (computed) => ({
    load: () => Promise.resolve([{ n: 2 }, hazards, { shelters: [{ id: 'HAB', x: 535.1, z: 574.1 }] }]),
    clientFactory: () => ({ setGrid: () => {}, compute: (input) => { computed.push(input); return Promise.resolve({ stats: {}, inputs: {} }); } }),
  });

  it('keeps one service per store and computes from the store it was given', async () => {
    const a = fakeStore(base), b = fakeStore({ ...base, route: { ...base.route, budget: { ...base.route.budget, usableSec: 600 } } });
    const ca = [], cb = [];
    const sa = returnZoneService(a, deps(ca)), sb = returnZoneService(b, deps(cb));
    expect(sa).not.toBe(sb);
    expect(returnZoneService(a)).toBe(sa);
    const seen = [];
    sa.subscribe((z) => seen.push(z.kind));
    sb.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(ca[0].evaLimitSec).toBe(1530);
    expect(cb[0].evaLimitSec).toBe(600);
    expect(seen).toEqual(['plan']);
  });
});
