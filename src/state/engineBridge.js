// Connects the mission store and the engine. Store -> engine: mode, layer, sky, route path, shelter, dust and
// the look settings, when they change, and clearing the boot prints when a new EVA starts.
// Engine -> store: the player's position and heading, 5 times per second (never per frame).
// For now the position written is the true one; the estimate with its error ring comes with #21 and #42.
import { useMissionStore } from './store.js';
import { dustLevelFromTau } from './dustLevel.js';

export const PLAYER_POLL_MS = 200;

/** @returns {() => void} disconnect */
export function connectEngine(engine, store = useMissionStore) {
  const apply = (s, prev) => {
    if (!prev || s.mode !== prev.mode) engine.setMode(s.mode);
    if (!prev || s.view.layer !== prev.view.layer) engine.setLayer(s.view.layer);
    if (!prev || s.view.sky !== prev.view.sky) engine.setSky(s.view.sky);
    // The dust storm blends from the current sky preset. At start only a non-zero blend is applied, so the
    // default preset (late_afternoon, #59) is not replaced by a clear_day blend at t=0.
    if (!prev || s.view.slopeGrid !== prev.view.slopeGrid) engine.setSlopeGrid(!!s.view.slopeGrid);
    if (prev ? s.view.skyBlend !== prev.view.skyBlend : (s.view.skyBlend ?? 0) > 0) {
      engine.setSkyBlend(s.view.sky, 'dust_storm', s.view.skyBlend ?? 0);
    }
    if (!prev || s.route.path !== prev.route.path) engine.setRoute(s.route.path);
    if (!prev || s.route.shelter !== prev.route.shelter) engine.setShelter(s.route.shelter ?? null);
    if (!prev || s.environment.dustOpacity !== prev.environment.dustOpacity) engine.setDust(dustLevelFromTau(s.environment.dustOpacity));
    if (!prev || s.settings.look !== prev.settings.look) engine.setLookSettings(s.settings.look);
    // a new EVA starts with clean ground: the boot prints of the last one go (#46)
    if (prev && s.mission.startedAtMs !== prev.mission.startedAtMs) engine.clearPrints();
  };
  apply(store.getState(), null);
  const unsubscribe = store.subscribe(apply);

  const timer = setInterval(() => {
    const p = engine.getPlayer(), nav = store.getState().navigation;
    const x = Math.round(p.x * 100) / 100, z = Math.round(p.z * 100) / 100, headingDeg = Math.round(p.headingDeg * 10) / 10;
    if (x === nav.x && z === nav.z && headingDeg === nav.headingDeg && nav.slopeDeg !== null) return;   // standing still: no store update, no re-render
    const slopeDeg = Math.round(engine.slopeAt(x, z) * 10) / 10;   // terrain slope under the player, for the HUD (DERIVED from the HiRISE DTM)
    store.setState((s) => ({ navigation: { ...s.navigation, x, z, headingDeg, slopeDeg } }));
  }, PLAYER_POLL_MS);

  return () => { unsubscribe(); clearInterval(timer); };
}
