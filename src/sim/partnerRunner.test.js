// Several partners (#53): one crew entry per partner, remote players reporting their own estimate and suit.
import { describe, expect, it } from 'vitest';
import hazards from '../../public/data/hazards.json';
import { createStaticPartner } from '../engine/partnerSource.js';
import { suitConstantsFromHazards } from './suitModel.js';
import { SEPARATION_ALERT_ID } from './partnerStatus.js';
import { startPartnerRunner } from './partnerRunner.js';

const constants = suitConstantsFromHazards(hazards);

function memoryStore() {
  let current = { mission: { paused: false, elapsedSec: 0 }, navigation: { x: 0, z: 0 }, crew: [], alerts: {}, sources: {} };
  return {
    getState: () => current,
    setState: (u) => { current = { ...current, ...(typeof u === 'function' ? u(current) : u) }; },
  };
}

/** A remote-like partner: a drawn true position and a radio report (estimate and suit). */
function remote(id, pose, report = {}) {
  const source = createStaticPartner({ id, ...pose });
  const radio = { name: 'Crew ' + id, ...report };
  return {
    source, radio,
    read: () => ({ id, name: radio.name, color: [0.1, 0.8, 0.3], state: source.update(0.25), radio: { ...radio } }),
  };
}

function start(store, partners, { lineOfSight } = {}) {
  return startPartnerRunner({
    store, readPartners: () => partners.map((p) => p.read()), heightAt: () => 0, lineOfSight, constants, habitat: { x: 0, z: 0 },
    now: () => 0, setInterval: () => 1, clearInterval: () => {},
  });
}

describe('partner runner with several partners', () => {
  it('writes one entry per partner, in order, with the reported estimate, name and suit', () => {
    const store = memoryStore();
    const a = remote('a', { x: 30, z: 0 }, { x: 31, z: 1, oxygenPct: 77, batteryPct: 66 });
    const b = remote('b', { x: 0, z: -20 }, { x: 0, z: -21 });
    start(store, [a, b]).tick();
    const [ea, eb] = store.getState().crew;
    expect(ea).toMatchObject({ id: 'a', name: 'Crew a', x: 31, z: 1, oxygenPct: 77, batteryPct: 66, link: true, remote: true });
    expect(eb).toMatchObject({ id: 'b', x: 0, z: -21, link: true });
    expect(eb.oxygenPct).toBeCloseTo(100, 6);   // no tel yet: the local suit model
    expect(store.getState().sources['crew.0.oxygenPct'].source).toMatch(/tel every 5 s/);
  });

  it('keeps the last estimate received in line of sight, greyed as last known, per partner', () => {
    const store = memoryStore();
    const ridge = (p, q) => ({ clear: Math.max(p.x, q.x) < 50 });   // east of x = 50 is behind a ridge
    const a = remote('a', { x: 40 }, { x: 41, z: 0 });
    const b = remote('b', { x: -10 }, { x: -11, z: 0 });
    const runner = start(store, [a, b], { lineOfSight: ridge });
    runner.tick();
    store.setState((s) => ({ mission: { ...s.mission, elapsedSec: 20 } }));
    a.source.set({ x: 70 }); Object.assign(a.radio, { x: 69 });
    b.source.set({ x: -12 }); Object.assign(b.radio, { x: -13 });
    runner.tick();
    const [ea, eb] = store.getState().crew;
    expect(ea).toMatchObject({ x: 41, link: false, lastContactSec: 0 });
    expect(eb).toMatchObject({ x: -13, link: true, lastContactSec: 20 });
    a.source.set({ x: 45 }); Object.assign(a.radio, { x: 46 });
    runner.tick();
    expect(store.getState().crew[0]).toMatchObject({ x: 46, link: true, lastContactSec: 20 });
  });

  it('drops a partner who left and clears the crew when nobody is left', () => {
    const store = memoryStore();
    const a = remote('a', { x: 10 }), b = remote('b', { x: 20 });
    const list = [a, b];
    const runner = start(store, list);
    runner.tick();
    expect(store.getState().crew.map((e) => e.id)).toEqual(['a', 'b']);
    list.splice(0, 1);
    runner.tick();
    expect(store.getState().crew.map((e) => e.id)).toEqual(['b']);
    list.splice(0, 1);
    runner.tick();
    expect(store.getState().crew).toEqual([]);
  });

  it('the separation alert follows the nearest partner', () => {
    const store = memoryStore();
    const near = remote('near', { x: 20 }, { x: 20, z: 0 }), far = remote('far', { x: 150 }, { x: 150, z: 0 });
    const list = [far, near];
    const runner = start(store, list);
    runner.tick();
    expect(store.getState().crew.map((e) => e.separation)).toEqual(['warning', 'nominal']);
    expect(store.getState().alerts[SEPARATION_ALERT_ID] ?? null).toBeNull();
    list.splice(1, 1);
    runner.tick();
    expect(store.getState().alerts[SEPARATION_ALERT_ID]).toMatchObject({ level: 'warning' });
    expect(store.getState().alerts[SEPARATION_ALERT_ID].text).toMatch(/^Crew far/);
  });
});
