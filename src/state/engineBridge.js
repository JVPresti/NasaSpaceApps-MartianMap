// Connects the mission store and the engine. Store -> engine: mode, layer, sky, route path, shelter, when they change.
// Engine -> store: the player's position and heading, 5 times per second (never per frame).
// For now the position written is the true one; the estimate with its error ring comes with #21 and #42.
import { useMissionStore } from './store.js';

export const PLAYER_POLL_MS = 200;

/** @returns {() => void} disconnect */
export function connectEngine(engine, store = useMissionStore) {
  const apply = (s, prev) => {
    if (!prev || s.mode !== prev.mode) engine.setMode(s.mode);
    if (!prev || s.view.layer !== prev.view.layer) engine.setLayer(s.view.layer);
    if (!prev || s.view.sky !== prev.view.sky) engine.setSky(s.view.sky);
    if (!prev || s.view.skyBlend !== prev.view.skyBlend) {
      engine.setSkyBlend('clear_day', 'dust_storm', s.view.skyBlend ?? 0);
    }
    if (!prev || s.route.path !== prev.route.path) engine.setRoute(s.route.path);
    if (!prev || s.route.shelter !== prev.route.shelter) engine.setShelter(s.route.shelter ?? null);
  };
  apply(store.getState(), null);
  const unsubscribe = store.subscribe(apply);

  const timer = setInterval(() => {
    const p = engine.getPlayer(), nav = store.getState().navigation;
    const x = Math.round(p.x * 100) / 100, z = Math.round(p.z * 100) / 100, headingDeg = Math.round(p.headingDeg * 10) / 10;
    if (x === nav.x && z === nav.z && headingDeg === nav.headingDeg) return;   // standing still: no store update, no re-render
    store.setState((s) => ({ navigation: { ...s.navigation, x, z, headingDeg } }));
  }, PLAYER_POLL_MS);

  return () => { unsubscribe(); clearInterval(timer); };
}
