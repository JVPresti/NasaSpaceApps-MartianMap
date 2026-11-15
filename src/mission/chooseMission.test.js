import { beforeEach, describe, expect, it } from 'vitest';
import { FIRST_OBJECTIVE, FULL_OBJECTIVE, eventStartSec, missionForObjective } from '../sim/missions.js';
import { resetStore, setMode, useMissionStore } from '../state/store.js';
import { chooseMission } from './chooseMission.js';

beforeEach(() => resetStore());

describe('chooseMission (the start screen choice, #265)', () => {
  it('opens the first sortie from the main action', () => {
    expect(chooseMission(FIRST_OBJECTIVE)).toBe('sortie');
    const { needs, mode } = useMissionStore.getState();
    expect(mode).toBe('plan');
    expect(missionForObjective(needs.objective).id).toBe('first');
    expect(eventStartSec(needs.objective, 'dust-storm')).toBe(75);
    expect(needs.timeMin).toBe(30);
  });

  it('opens the full EVA from the secondary button, with its times and its default time available', () => {
    expect(chooseMission(FULL_OBJECTIVE)).toBe('cheyava');
    const { needs } = useMissionStore.getState();
    expect(missionForObjective(needs.objective).id).toBe('full');
    expect(eventStartSec(needs.objective, 'dust-storm')).toBe(480);
    expect(eventStartSec(needs.objective, 'radiation')).toBe(720);
    expect(needs.timeMin).toBe(120);
  });

  it('changes nothing once the EVA has begun', () => {
    chooseMission(FIRST_OBJECTIVE);
    setMode('walk');
    expect(chooseMission(FULL_OBJECTIVE)).toBe('sortie');
    expect(useMissionStore.getState().needs.locked).toBe(true);
  });
});
