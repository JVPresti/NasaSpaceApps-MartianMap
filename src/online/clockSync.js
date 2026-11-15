/**
 * The shared mission clock (docs/IMPLEMENTATION_PLAN.md 9.5), wired from outside the simulation.
 *
 * Mission time online is (Date.now() + offset - startedAt) x time scale. The mission clock (src/sim/missionClock.js)
 * already reads (now - anchor) x time scale, so this module writes one plain number into the store: the room's
 * start on this machine's clock, `mission.sharedStartMs = online.startedAtMs - online.offsetMs`. The clock follows it
 * and ignores pauses while it is set. Offline, or before the first `start`, it is null and nothing changes.
 */

/** The room's start on the local clock, or null when there is no shared start. */
export function sharedStartMs(online) {
  if (!online || online.code === null || online.code === undefined) return null;
  if (typeof online.startedAtMs !== 'number' || !Number.isFinite(online.startedAtMs)) return null;
  const offset = typeof online.offsetMs === 'number' && Number.isFinite(online.offsetMs) ? online.offsetMs : 0;
  return Math.max(0, online.startedAtMs - offset);
}

/** Changes under this many ms (a resync that moved the offset by a hair) are not written. */
export const SYNC_EPSILON_MS = 0.5;

/** Keeps `mission.sharedStartMs` equal to the room's start. Returns a function that stops it. */
export function startClockSync(store) {
  const sync = (state) => {
    const want = sharedStartMs(state.online);
    const have = state.mission?.sharedStartMs ?? null;
    if (want === have) return;
    if (want !== null && have !== null && Math.abs(want - have) < SYNC_EPSILON_MS) return;
    store.setState((s) => ({ mission: { ...s.mission, sharedStartMs: want } }));
  };
  sync(store.getState());
  return store.subscribe(sync);
}
