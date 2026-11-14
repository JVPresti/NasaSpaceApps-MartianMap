import { describe, expect, it } from 'vitest';
import hazards from '../../public/data/hazards.json';
import { createStaticPartner } from '../engine/partnerSource.js';
import { suitConstantsFromHazards } from './suitModel.js';
import { rangeBearing, SEPARATION_ALERT_ID, SEPARATION_RULE, separationAlert, separationLevel } from './partnerStatus.js';
import { PARTNER_SOURCES, startPartnerRunner } from './partnerRunner.js';

const constants = suitConstantsFromHazards(hazards);

describe('rangeBearing', () => {
  // x east, z south: north is -z
  it.each([
    [{ x: 0, z: -100 }, 100, 0],
    [{ x: 50, z: 0 }, 50, 90],
    [{ x: 0, z: 30 }, 30, 180],
    [{ x: -40, z: 0 }, 40, 270],
    [{ x: 30, z: -40 }, 50, 36.87],
  ])('from the origin to %o is %d m at %d°', (to, range, bearing) => {
    const r = rangeBearing({ x: 0, z: 0 }, to);
    expect(r.rangeM).toBeCloseTo(range, 6);
    expect(r.bearingDeg).toBeCloseTo(bearing, 2);
  });

  it('works from a point that is not the origin', () => {
    const r = rangeBearing({ x: 10, z: 10 }, { x: 10, z: -90 });
    expect(r.rangeM).toBe(100);
    expect(r.bearingDeg).toBe(0);
  });
});

describe('separationLevel', () => {
  it('rises at the caution distance and past the limit', () => {
    expect(separationLevel(79.9, 'nominal')).toBe('nominal');
    expect(separationLevel(80, 'nominal')).toBe('caution');
    expect(separationLevel(100, 'caution')).toBe('caution');
    expect(separationLevel(100.1, 'caution')).toBe('warning');
    expect(separationLevel(150, 'nominal')).toBe('warning');
  });

  it('falls only once the range is 5 m back inside a threshold', () => {
    expect(separationLevel(96, 'warning')).toBe('warning');
    expect(separationLevel(95, 'warning')).toBe('caution');
    expect(separationLevel(76, 'caution')).toBe('caution');
    expect(separationLevel(75, 'caution')).toBe('nominal');
    expect(separationLevel(60, 'warning')).toBe('nominal');
  });

  it('keeps the previous level without a range', () => {
    expect(separationLevel(null, 'caution')).toBe('caution');
  });

  it('reads the limit as 100 m with caution at 80 m', () => {
    expect(SEPARATION_RULE).toMatchObject({ limitM: 100, cautionM: 80 });
  });
});

describe('separationAlert', () => {
  it('has the shape of the store alerts', () => {
    expect(separationAlert('warning', { partnerId: 'EV2', startedAtSec: 12 })).toEqual({
      id: SEPARATION_ALERT_ID, eventId: SEPARATION_ALERT_ID, level: 'warning',
      text: 'EV2 is past the 100 m separation limit: walk back toward your partner', startedAtSec: 12, active: true,
    });
    expect(separationAlert('caution', { partnerId: 'EV2' }).text).toBe('EV2 is close to the 100 m separation limit');
    expect(separationAlert('nominal')).toBeNull();
  });
});

// A store that records every write to alerts.partner-separation.
function memoryStore(state) {
  let current = { mission: { paused: false, elapsedSec: 0 }, navigation: { x: 0, z: 0 }, crew: [], alerts: {}, sources: {}, ...state };
  const alertWrites = [];
  return {
    alertWrites,
    getState: () => current,
    setState: (updater) => {
      const patch = typeof updater === 'function' ? updater(current) : updater;
      if (patch.alerts && patch.alerts[SEPARATION_ALERT_ID] !== current.alerts[SEPARATION_ALERT_ID]) alertWrites.push(patch.alerts[SEPARATION_ALERT_ID]);
      current = { ...current, ...patch };
    },
  };
}

// A fake partner source behind the same read the engine gives (engine.getPartner): id, colour, last PartnerState.
function fakePartner(pose) {
  const source = createStaticPartner({ id: 'EV2', ...pose });
  let state = null;
  return {
    source,
    frame(dt = 0.25) { state = source.update(dt, { player: { x: 0, z: 0 }, habitat: null, duck: () => 0 }); },
    read: () => (state ? { id: source.id, color: source.color, state } : null),
  };
}

function start(store, partner, { heightAt = () => 0, clock, lineOfSight } = {}) {
  const t = clock || { ms: 0 };
  return startPartnerRunner({
    store, readPartner: partner.read, heightAt, lineOfSight, constants, habitat: { x: 0, z: 0 },
    now: () => t.ms, setInterval: () => 1, clearInterval: () => {},
  });
}

describe('partner runner', () => {
  it('writes crew[0] from the partner source and registers the sources', () => {
    const store = memoryStore({ navigation: { x: 0, z: 0 } });
    const partner = fakePartner({ x: 30, z: -40 });
    partner.frame();
    start(store, partner).tick();
    const c = store.getState().crew[0];
    expect(c).toMatchObject({ id: 'EV2', name: 'EV2', x: 30, z: -40, separation: 'nominal', separationLimitM: 100, status: 'nominal' });
    expect(c.color).toEqual([1, 0.32, 0.03]);
    expect(c.rangeM).toBeCloseTo(50, 6);
    expect(c.bearingDeg).toBeCloseTo(36.87, 2);
    expect(c.oxygenPct).toBeCloseTo(100, 6);
    expect(c.batteryPct).toBeCloseTo(100, 6);
    expect(store.getState().sources['crew.0.oxygenPct']).toEqual(PARTNER_SOURCES['crew.0.oxygenPct']);
  });

  it('writes nothing until the source has reported a state, and removes the partner when it goes away', () => {
    const store = memoryStore();
    const partner = fakePartner({ x: 10, z: 0 });
    const runner = start(store, partner);
    runner.tick();
    expect(store.getState().crew).toEqual([]);
    partner.frame(); runner.tick();
    expect(store.getState().crew).toHaveLength(1);
    partner.source.set({ visible: false }); partner.frame(); runner.tick();
    expect(store.getState().crew).toEqual([]);
  });

  it('fires the caution and the warning once per crossing, with hysteresis', () => {
    const store = memoryStore();
    const partner = fakePartner({ x: 0, z: 0 });
    const clock = { ms: 0 };
    const runner = start(store, partner, { clock });
    // walk out to 120 m and back in steps of 1 m, ticking several times at each step (several frames per metre)
    const out = Array.from({ length: 121 }, (_, i) => i), back = out.slice().reverse();
    for (const d of [...out, ...back]) {
      for (let k = 0; k < 3; k++) { partner.source.set({ x: d }); partner.frame(); clock.ms += 250; runner.tick(); }
    }
    expect(store.alertWrites.map((a) => (a ? a.level : null))).toEqual(['caution', 'warning', 'caution', null]);
    expect(store.getState().alerts[SEPARATION_ALERT_ID]).toBeNull();
  });

  it('does not flicker while the partner hovers around the limit', () => {
    const store = memoryStore();
    const partner = fakePartner({ x: 90 });
    const runner = start(store, partner);
    for (const d of [90, 99, 101, 99, 101, 97, 101, 96, 102]) { partner.source.set({ x: d }); partner.frame(); runner.tick(); }
    expect(store.alertWrites.map((a) => a.level)).toEqual(['caution', 'warning']);
  });

  it('uses the oxygen faster when the partner climbs', () => {
    const walk = (heightAt) => {
      const store = memoryStore(), partner = fakePartner({ x: 0, z: 0 }), clock = { ms: 0 };
      const runner = start(store, partner, { heightAt, clock });
      // one metre per second north for two minutes
      for (let i = 0; i <= 480; i++) { partner.source.set({ z: -i * 0.25 }); partner.frame(); runner.tick(); clock.ms += 250; }
      return store.getState().crew[0];
    };
    const flat = walk(() => 0);
    const uphill = walk((x, z) => -z * 0.15);   // a 15 % grade, rising toward the north
    expect(uphill.oxygenPct).toBeLessThan(flat.oxygenPct);
    expect(flat.oxygenPct).toBeLessThan(100);
    expect(uphill.batteryPct).toBeLessThan(flat.batteryPct);
  });

  it('keeps the last known position and suit while a ridge blocks the radio', () => {
    const store = memoryStore();
    const partner = fakePartner({ x: 40 });
    const ridge = (a, b) => ({ clear: Math.max(a.x, b.x) < 50 });   // anything east of x = 50 is behind a ridge
    const runner = start(store, partner, { lineOfSight: ridge });
    partner.frame(); runner.tick();
    expect(store.getState().crew[0]).toMatchObject({ x: 40, link: true, lastContactSec: 0 });
    expect(store.getState().sources['crew.0.link'].tag).toBe('DERIVED');

    store.setState((s) => ({ mission: { ...s.mission, elapsedSec: 30 } }));
    partner.source.set({ x: 60 }); partner.frame(); runner.tick();
    const hidden = store.getState().crew[0];
    expect(hidden).toMatchObject({ x: 40, link: false, lastContactSec: 0 });
    expect(hidden.rangeM).toBeCloseTo(40, 6);

    partner.source.set({ x: 45 }); partner.frame(); runner.tick();
    expect(store.getState().crew[0]).toMatchObject({ x: 45, link: true, lastContactSec: 30 });
  });

  it('shows nothing until the radio has reached the partner once', () => {
    const store = memoryStore();
    const partner = fakePartner({ x: 80 });
    const runner = start(store, partner, { lineOfSight: () => ({ clear: false }) });
    partner.frame(); runner.tick();
    expect(store.getState().crew).toEqual([]);
  });

  it('uses nothing while the mission is paused', () => {
    const store = memoryStore({ mission: { paused: true, elapsedSec: 0 } });
    const partner = fakePartner({ x: 0, z: 0 }), clock = { ms: 0 };
    const runner = start(store, partner, { clock });
    for (let i = 0; i < 40; i++) { partner.source.set({ x: i }); partner.frame(); runner.tick(); clock.ms += 250; }
    expect(store.getState().crew[0].oxygenPct).toBe(100);
  });
});
