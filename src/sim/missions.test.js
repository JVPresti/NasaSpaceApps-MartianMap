import { describe, expect, it } from 'vitest';
import dustStorm from './events/dust-storm.json';
import lowOxygenCaution from './events/low-oxygen-caution.json';
import radiation from './events/radiation.json';
import { validateEvent } from './eventEngine.js';
import { OBJECTIVE_IDS } from './missionNeeds.js';
import {
  currentBeat, eventStartSec, eventTiming, eventTrigger, FIRST_OBJECTIVE, FIRST_STOP, FULL_OBJECTIVE, MISSION_SOURCES, MISSIONS,
  missionEventDefinitions, missionForObjective, missionSourcePath,
} from './missions.js';

// The sortie stop as the event runner places it: its planned waypoint and the 5 m arrival radius.
const STOPS = { [FIRST_STOP]: { x: 493, z: 539, radius: 5 } };

const DEFINITIONS = [dustStorm, radiation, lowOxygenCaution];

describe('missionForObjective', () => {
  it('makes the first sortie the first mission and the two science objectives the full EVA', () => {
    expect(missionForObjective('sortie').id).toBe('first');
    expect(missionForObjective('cheyava').id).toBe('full');
    expect(missionForObjective('bright-angel').id).toBe('full');
    expect(missionForObjective('samples').id).toBe('full');
  });

  it('falls back to the first mission, like the default needs', () => {
    expect(missionForObjective(undefined).id).toBe('first');
    expect(missionForObjective('moon').id).toBe('first');
  });

  it('covers every objective the needs know, once', () => {
    const covered = Object.values(MISSIONS).flatMap((mission) => mission.objectives);
    expect([...covered].sort()).toEqual([...OBJECTIVE_IDS].sort());
    expect(OBJECTIVE_IDS).toContain(FIRST_OBJECTIVE);
    expect(missionForObjective(FULL_OBJECTIVE).id).toBe('full');
  });
});

describe('event times per mission', () => {
  it('keeps T+480 s and T+720 s for the full EVA', () => {
    for (const objective of ['cheyava', 'bright-angel']) {
      expect(eventStartSec(objective, 'dust-storm')).toBe(480);
      expect(eventStartSec(objective, 'radiation')).toBe(720);
      expect(eventTrigger(objective, 'dust-storm')).toEqual({ type: 'missionTime', atSec: 480 });
      expect(eventTrigger(objective, 'radiation')).toEqual({ type: 'missionTime', atSec: 720 });
    }
  });

  it('runs a Collect samples plan on the full EVA\'s schedule: the storm at T+480 s, radiation at T+720 s (#352)', () => {
    const [storm, rad] = missionEventDefinitions('samples', DEFINITIONS, { stops: STOPS });
    expect(storm.trigger).toEqual({ type: 'missionTime', atSec: 480 });
    expect(rad.trigger).toEqual({ type: 'missionTime', atSec: 720 });
    expect(storm.timeline).toEqual(dustStorm.timeline);
    expect(eventTiming('samples', 'radiation')).toMatchObject({ earliestSec: 720, afterStop: null });
    expect(MISSIONS.full.beats).toEqual([]);
  });

  it('brings both events forward in the first mission, the storm first', () => {
    expect(eventStartSec('sortie', 'dust-storm')).toBe(45);
    expect(eventStartSec('sortie', 'radiation')).toBe(45);
    const storm = eventTrigger('sortie', 'dust-storm');
    expect(storm.holdInsideEnd).toBe(true);
    expect(storm.requires).toContainEqual({ stop: FIRST_STOP });
    expect(storm.latestSec).toBeLessThan(eventTrigger('sortie', 'radiation').latestSec);
  });

  it('says when each event comes, for the mission table (N5)', () => {
    expect(eventTiming('sortie', 'dust-storm')).toEqual({
      earliestSec: 45, latestSec: 240,
      afterStop: { stop: FIRST_STOP, afterSampleSec: 3, orAtStopSec: 90 },
      afterEvent: null, orNearHomeM: 10, holdsOutsideEnd: true, minDurationSec: 20,
    });
    expect(eventTiming('sortie', 'radiation')).toMatchObject({
      earliestSec: 45, latestSec: 255, afterEvent: { event: 'dust-storm', afterSec: 15 }, orNearHomeM: 10, holdsOutsideEnd: false, minDurationSec: 20,
    });
    expect(eventTiming('cheyava', 'dust-storm')).toEqual({
      earliestSec: 480, latestSec: null, afterStop: null, afterEvent: null, orNearHomeM: null, holdsOutsideEnd: false, minDurationSec: null,
    });
    expect(eventTiming('sortie', 'low-oxygen-caution')).toBeNull();
  });

  it('schedules no time for low oxygen, which keeps its own threshold', () => {
    expect(eventStartSec('sortie', 'low-oxygen-caution')).toBeNull();
    expect(eventTrigger('cheyava', 'low-oxygen-caution')).toBeNull();
  });
});

describe('missionEventDefinitions', () => {
  it('gives the full EVA the event files as they were, with the mission trigger', () => {
    const [storm, rad, oxygen] = missionEventDefinitions('cheyava', DEFINITIONS);
    expect(storm.trigger).toEqual({ type: 'missionTime', atSec: 480 });
    expect(rad.trigger).toEqual({ type: 'missionTime', atSec: 720 });
    expect(storm.timeline).toEqual(dustStorm.timeline);
    expect(rad.timeline).toEqual(radiation.timeline);
    expect({ ...storm, trigger: null }).toEqual({ ...dustStorm, trigger: null });
    expect(oxygen).toBe(lowOxygenCaution);
  });

  it('compresses the first mission timelines and keeps the values', () => {
    const [storm, rad] = missionEventDefinitions('sortie', DEFINITIONS);
    expect(storm.timeline.at(-1).atSec).toBe(30);
    expect(rad.timeline.at(-1).atSec).toBe(60);
    expect(storm.timeline.map((entry) => entry.set)).toEqual(dustStorm.timeline.map((entry) => entry.set));
    expect(rad.timeline.map((entry) => entry.set)).toEqual(radiation.timeline.map((entry) => entry.set));
    // the same end area, played at least 20 s (N14)
    expect(storm.end).toEqual({ ...dustStorm.end, minSec: 20 });
    expect(rad.alert).toEqual(radiation.alert);
  });

  it('places the stop requirements on the planned stop, and leaves them out when the stop is not planned', () => {
    const [placed] = missionEventDefinitions('sortie', [dustStorm], { stops: STOPS });
    expect(placed.trigger.requires[0]).toEqual({ area: STOPS[FIRST_STOP] });
    expect(placed.trigger.requires[1].anyOf).toEqual([
      { path: 'sampling.samples', inArea: { ...STOPS[FIRST_STOP], radius: STOPS[FIRST_STOP].radius + 2 }, atLeast: 1, forSec: 3 },
      { area: STOPS[FIRST_STOP], forSec: 90 },
      { nearEndM: 10 },
    ]);
    expect(validateEvent(placed)).toEqual({ ok: true, errors: [] });

    const [unplaced, radUnplaced] = missionEventDefinitions('sortie', [dustStorm, radiation]);
    expect(unplaced.trigger.requires).toBeUndefined();
    expect(unplaced.trigger).toMatchObject({ atSec: 45, latestSec: 240 });
    expect(radUnplaced.trigger.requires).toEqual([
      { event: 'dust-storm', afterSec: 0 },
      { anyOf: [{ event: 'dust-storm', afterSec: 15 }, { nearEndM: 10 }] },
    ]);
  });

  it('returns valid event definitions for every objective and leaves the files alone', () => {
    const before = JSON.stringify(DEFINITIONS);
    for (const objective of OBJECTIVE_IDS) {
      for (const definition of [...missionEventDefinitions(objective, DEFINITIONS), ...missionEventDefinitions(objective, DEFINITIONS, { stops: STOPS })]) {
        expect(validateEvent(definition)).toEqual({ ok: true, errors: [] });
      }
    }
    expect(JSON.stringify(DEFINITIONS)).toBe(before);
  });
});

describe('currentBeat', () => {
  const first = MISSIONS.first;
  const active = (id) => ({ [id]: { id, eventId: id, active: true } });

  it('shows the plan beat at the table before Begin EVA, and nothing in Walk before it', () => {
    expect(currentBeat(first, { mode: 'plan', evaBegun: false }).id).toBe('plan');
    expect(currentBeat(first, { mode: 'walk', evaBegun: false })).toBeNull();
  });

  it('shows the stop beat at the science stop until a sample is secured, then nothing until the storm (P3)', () => {
    expect(currentBeat(first, { mode: 'walk', evaBegun: true, atStop: true }).id).toBe('stop');
    expect(currentBeat(first, { mode: 'walk', evaBegun: true, atStop: true, samples: 1 })).toBeNull();
    expect(currentBeat(first, { mode: 'walk', evaBegun: true, atStop: false, samples: 1 })).toBeNull();
  });

  it('shows the walk beat until the first event starts', () => {
    expect(currentBeat(first, { mode: 'walk', evaBegun: true }).id).toBe('walk');
    const events = [{ type: 'start', eventId: 'dust-storm' }, { type: 'end', eventId: 'dust-storm' }];
    expect(currentBeat(first, { mode: 'walk', evaBegun: true, events })).toBeNull();
  });

  it('shows the event beats while their alerts are active, radiation over the storm', () => {
    expect(currentBeat(first, { mode: 'walk', evaBegun: true, alerts: active('dust-storm') }).id).toBe('dust-storm');
    const both = { ...active('dust-storm'), ...active('radiation') };
    expect(currentBeat(first, { mode: 'walk', evaBegun: true, alerts: both }).id).toBe('radiation');
  });

  it('shows nothing at the table during the EVA, and nothing for the full EVA', () => {
    expect(currentBeat(first, { mode: 'plan', evaBegun: true, alerts: active('dust-storm') })).toBeNull();
    expect(currentBeat(MISSIONS.full, { mode: 'plan', evaBegun: false })).toBeNull();
    expect(currentBeat(MISSIONS.full, { mode: 'walk', evaBegun: true, alerts: active('dust-storm') })).toBeNull();
  });
});

describe('MISSION_SOURCES', () => {
  it('tags every scheduled event time SIM', () => {
    for (const mission of Object.values(MISSIONS)) {
      for (const eventId of Object.keys(mission.events)) {
        const entry = MISSION_SOURCES[missionSourcePath(mission.id, eventId)];
        expect(entry?.tag).toBe('SIM');
        expect(entry.source).toMatch(/T\+\d+ s/);
      }
    }
  });
});
