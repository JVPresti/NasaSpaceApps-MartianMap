import { afterEach, describe, expect, it } from 'vitest';
import { createProvenanceRegistry } from '../data/provenance.js';
import { assertPartnerState } from '../engine/partnerSource.js';
import { CREWMATE_SOURCES, crewmatePhase, crewmatePresent, crewmateSense, startCrewmate, stopCatalogue } from './crewmate.js';
import { createInitialState, resetStore, useMissionStore } from './store.js';

// stops.json as #282 ships it: the science stops with a card, and route_stops for the first sortie
const STOPS_282 = {
  stops: [
    { id: 'bright-angel', name: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', x: -11, z: -50, arrival_radius: { value: 2, unit: 'm' } },
    { id: 'cheyava-falls', name: 'Cheyava Falls', waypoint: 'Cheyava Falls', x: 0, z: 0, arrival_radius: { value: 2, unit: 'm' } },
  ],
  route_stops: [{ id: 'sortie', name: 'Light-toned patch by the habitat', waypoint: 'S1 · light-toned patch', x: 493, z: 539 }],
};
// and as main ships it: no route_stops
const STOPS_MAIN = { stops: STOPS_282.stops };

afterEach(() => resetStore());

describe('crew size (#282 needs.crew)', () => {
  it('EV2 exists with two astronauts, not with one, and on main where the field does not exist', () => {
    expect(crewmatePresent({ needs: { crew: 2 } })).toBe(true);
    expect(crewmatePresent({ needs: { crew: 1 } })).toBe(false);
    expect(crewmatePresent({})).toBe(true);
    expect(crewmatePresent(createInitialState())).toBe(true);
  });
});

describe('EVA phase', () => {
  it('reads the habitat-first stage when it exists', () => {
    expect(['habitat', 'egress', 'eva', 'ingress', 'debrief'].map((stage) => crewmatePhase({ stage, eva: { phase: 'active' } })))
      .toEqual(['pre', 'pre', 'eva', 'post', 'post']);
  });
  it('falls back to eva.phase on main and #282', () => {
    expect(['ready', 'active', 'ended'].map((phase) => crewmatePhase({ eva: { phase } }))).toEqual(['pre', 'eva', 'post']);
    expect(crewmatePhase(createInitialState())).toBe('pre');
  });
});

describe('stopCatalogue and crewmateSense', () => {
  it('knows the science stops of main and the route stops of #282, with at least the 5 m stop radius', () => {
    expect(stopCatalogue(STOPS_MAIN).map((s) => s.id)).toEqual(['bright-angel', 'cheyava-falls']);
    const all = stopCatalogue(STOPS_282);
    expect(all.map((s) => s.id)).toEqual(['bright-angel', 'cheyava-falls', 'sortie']);
    expect(all.every((s) => s.radiusM === 5)).toBe(true);
    expect(stopCatalogue(null)).toEqual([]);
  });

  it('turns a store snapshot into the crewmate sense: stops on the route, next stop range, alerts, shelter, EV2 suit', () => {
    const s = createInitialState();
    s.route.waypoints = [{ name: 'HAB', x: 535.1, z: 574.1 }, { name: 'S1 · light-toned patch', x: 493, z: 539 }];
    s.route.path = [[535.1, 574.1], [493, 539]];
    s.route.nextIndex = 1;
    s.route.shelter = { id: 'HAB', name: 'Habitat', type: 'habitat', x: 535.1, z: 574.1 };
    s.navigation.waypointRangeM = 22.4;
    s.alerts = { 'dust-storm': { active: true }, radiation: null };
    s.crew = [{ id: 'EV2', marginSec: 2400, status: 'nominal', rangeM: 6.2, link: true }];
    s.eva.phase = 'active';
    s.stage = 'eva';   // the habitat-first flow (#260) says where the astronaut is
    const sense = crewmateSense(s, stopCatalogue(STOPS_282));
    expect(sense).toMatchObject({
      present: true, phase: 'eva', storm: true, radiation: false, rangeM: 6.2, link: true,
      stops: [{ id: 'sortie', name: 'Light-toned patch by the habitat', x: 493, z: 539, radiusM: 5 }],
      nextStop: { name: 'Light-toned patch by the habitat', rangeM: 22.4 },
      own: { marginSec: 2400, status: 'nominal' },
      shelter: { id: 'HAB' },
    });
    expect(sense.path).toBe(s.route.path);
  });

  it('treats the place of a sampling task as a stop: a known stop by its catalogue entry, a clicked point by itself (#352)', () => {
    const s = createInitialState();
    s.route.waypoints = [
      { name: 'HAB', x: 535.1, z: 574.1 },
      { name: 'P1 · task point', label: 'P1', x: 470, z: 560, stopId: null, required: true, place: 'P1', tasks: ['t2'], arrivalRadiusM: 8, workSec: 240 },
      { name: 'WP3 · Bright Angel outcrop', label: 'Bright Angel', x: -11, z: -50, stopId: 'bright-angel', required: true, place: 'bright-angel', tasks: ['t1'], workSec: 480 },
      { name: 'WP9 · a route point', x: 100, z: 100 },
    ];
    s.route.nextIndex = 1;
    s.navigation.waypointRangeM = 12;
    const sense = crewmateSense(s, stopCatalogue(STOPS_282));
    expect(sense.stops).toEqual([
      { id: 'P1', name: 'P1', x: 470, z: 560, radiusM: 8 },   // its 8 m, more than the 5 m stop radius
      { id: 'bright-angel', name: 'Bright Angel', x: -11, z: -50, radiusM: 5 },
    ]);
    expect(sense.nextStop).toEqual({ name: 'P1', rangeM: 12 });
    // a point without its own radius still counts within the stop radius; a plain route point is no stop
    s.route.waypoints[1] = { ...s.route.waypoints[1], arrivalRadiusM: undefined };
    expect(crewmateSense(s, stopCatalogue(STOPS_282)).stops[0].radiusM).toBe(5);
    s.route.nextIndex = 3;
    expect(crewmateSense(s, stopCatalogue(STOPS_282)).nextStop).toBeNull();
  });

  it('has no stops on main\'s route.json walk until the route reaches a science stop', () => {
    const s = createInitialState();
    s.route.waypoints = [{ name: 'HAB', x: 520, z: 600 }, { name: 'WP1 · channel floor', x: 330, z: 300 }, { name: 'Cheyava Falls', x: 0, z: 0 }];
    const sense = crewmateSense(s, stopCatalogue(STOPS_MAIN));
    expect(sense.stops.map((x) => x.id)).toEqual(['cheyava-falls']);
    expect(sense.nextStop).toBeNull();
    expect(sense.link).toBe(true);
  });
});

describe('startCrewmate', () => {
  const fakeEngine = () => {
    const engine = { source: null, setPartnerSource(src) { engine.source = src; }, slopeAt: () => 3 };
    return engine;
  };

  it('installs EV2 as the partner source, declares its source tags and writes its callouts to comms.partner', async () => {
    const engine = fakeEngine(), registry = createProvenanceRegistry({ dev: false });
    const run = startCrewmate(engine, { store: useMissionStore, loadStops: () => Promise.resolve(STOPS_282), registry, now: () => 1234 });
    expect(engine.source).toBe(run.source);
    expect(engine.source).toMatchObject({ id: 'EV2', kind: 'crewmate' });
    for (const path of Object.keys(CREWMATE_SOURCES)) expect(registry.lookup(path)).not.toBeNull();
    expect(registry.lookup('crewmate.slopeAheadDeg').tag).toBe('DERIVED');

    useMissionStore.setState((s) => ({
      stage: 'eva',
      eva: { ...s.eva, phase: 'active' },
      route: { ...s.route, path: [[0, 0], [60, 0]] },
      alerts: { 'dust-storm': { active: true, level: 'warning' } },
    }));
    const world = { player: { x: 10, z: 0 }, habitat: null, duck: () => 0 };
    for (let i = 0; i < 10; i++) assertPartnerState(engine.source.update(1 / 30, world));
    expect(useMissionStore.getState().comms.partner).toMatchObject({ kind: 'storm', key: 'crewmate.say.storm', urgent: true, from: 'EV2', atMs: 1234 });
    run.stop();
  });

  it('hides EV2 for a crew of one', () => {
    const engine = fakeEngine();
    startCrewmate(engine, { store: useMissionStore, loadStops: () => Promise.resolve(null), registry: createProvenanceRegistry({ dev: false }) });
    useMissionStore.setState((s) => ({ needs: { ...(s.needs ?? {}), crew: 1 } }));
    expect(engine.source.update(1 / 30, { player: { x: 0, z: 0 }, habitat: null, duck: () => 0 }).visible).toBe(false);
  });

  it('does nothing with an engine that has no partner', () => {
    expect(startCrewmate({}, { store: useMissionStore }).source).toBeNull();
  });
});
