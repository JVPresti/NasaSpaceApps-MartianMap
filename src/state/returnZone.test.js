import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { ZONE_LAYER } from '../zone/zoneLayer.js';
import { ZONE_REFRESH, zoneChange, zoneInput } from './returnZone.js';

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

describe('the zone layer legend', () => {
  it('names the caution margin of hazards.json', () => {
    expect(c.cautionSec).toBe(15 * 60);
    expect(ZONE_LAYER.swatches[1].detail).toBe('margin under 15 min');
  });
});
