import { describe, expect, it } from 'vitest';
import { eventRouteOf, shelterLabel } from './eventRoute.js';

const shelter = { id: 'HAB', name: 'HAB · habitat airlock', type: 'habitat', x: 535.1, z: 574.1 };
const storm = { eventId: 'dust-storm', level: 'warning', text: 'Dust storm: opacity rising. Return to the habitat.', active: true, startedAtSec: 96 };
const radiation = { eventId: 'radiation', level: 'warning', text: 'Radiation alert: elevated dose rate.', active: true, startedAtSec: 112 };

describe('event route on the table (#265)', () => {
  it('is nothing while no event owns the route', () => {
    expect(eventRouteOf({ shelter: null }, { 'dust-storm': storm })).toBeNull();
    expect(eventRouteOf(null, {})).toBeNull();
  });

  it('describes the route to the shelter and the alert that asked for it', () => {
    const event = eventRouteOf({ shelter, reason: 'Re-plan to shelter (dust-storm)', distanceM: 41.2, etaSec: 48, skipped: ['S1 · light-toned patch'] }, { 'dust-storm': storm });
    expect(event).toMatchObject({ eventId: 'dust-storm', label: 'Dust storm', alertText: storm.text, distanceM: 41.2, etaSec: 48 });
    expect(event.skipped).toEqual(['S1 · light-toned patch']);
  });

  it('takes the event named in the route reason, else the newest active alert', () => {
    const alerts = { 'dust-storm': storm, radiation };
    expect(eventRouteOf({ shelter, reason: 'x (dust-storm)' }, alerts).eventId).toBe('dust-storm');
    expect(eventRouteOf({ shelter, reason: 'x' }, alerts).eventId).toBe('radiation');
    expect(eventRouteOf({ shelter, reason: 'x' }, { radiation: { ...radiation, active: false } }).label).toBeNull();
  });

  it('splits the shelter name like a stop', () => {
    expect(shelterLabel(shelter)).toEqual(['HAB', 'habitat airlock']);
    expect(shelterLabel({ id: 'SP2', name: 'Shade' })).toEqual(['SP2', 'Shade']);
  });
});
