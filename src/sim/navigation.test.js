import { beforeEach, describe, expect, it } from 'vitest';
import { resetStore, useMissionStore } from '../state/store.js';
import { FIX_MODES, NAVIGATION_SOURCES, NAV_PLACEHOLDER_ERROR_M, initNavigation } from './navigation.js';

beforeEach(() => resetStore());

describe('navigation placeholder', () => {
  it('writes a terrain fix at the current mission time with a small fixed error', () => {
    useMissionStore.setState((s) => ({ mission: { ...s.mission, elapsedSec: 1234 }, navigation: { ...s.navigation, x: 8, z: 70, headingDeg: 12 } }));
    initNavigation({ store: useMissionStore });
    const nav = useMissionStore.getState().navigation;
    expect(nav).toMatchObject({ errorM: NAV_PLACEHOLDER_ERROR_M, fixMode: FIX_MODES.terrainFix, lastFixSec: 1234 });
    expect(nav).toMatchObject({ x: 8, z: 70, headingDeg: 12 });   // position and heading stay with the engine bridge
    expect(NAV_PLACEHOLDER_ERROR_M).toBeLessThan(1);               // a terrain fix is under 1 m (plan, section 4.2)
  });

  it('falls back to mission time 0 before the clock publishes', () => {
    useMissionStore.setState((s) => ({ mission: { ...s.mission, elapsedSec: null } }));
    initNavigation({ store: useMissionStore });
    expect(useMissionStore.getState().navigation.lastFixSec).toBe(0);
  });

  it('tags every navigation value it owns as SIM and keeps other sources', () => {
    useMissionStore.setState({ sources: { 'suit.oxygenPct': { tag: 'DERIVED', source: 'suit model' } } });
    initNavigation({ store: useMissionStore });
    const { sources } = useMissionStore.getState();
    for (const path of ['navigation.x', 'navigation.z', 'navigation.errorM', 'navigation.fixMode', 'navigation.lastFixSec']) expect(sources[path].tag).toBe('SIM');
    expect(sources['suit.oxygenPct'].tag).toBe('DERIVED');
  });

  it('never names satellite navigation in the source text people read', () => {
    for (const s of Object.values(NAVIGATION_SOURCES)) expect(s.source).not.toMatch(/GPS/i);
  });
});
