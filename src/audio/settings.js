// Audio settings (#72): mute and volume, remembered in localStorage. A tiny observable for the pause menu and the audio
// engine. No React, no Web Audio.

export const AUDIO_SETTINGS_KEY = 'marswalk.audio.v1';
export const DEFAULT_VOLUME = 0.7;

const listeners = new Set();
let current = load();

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** @returns {{ muted: boolean, volume: number }} */
export function parseAudioSettings(raw) {
  let v = null;
  try { v = raw ? JSON.parse(raw) : null; } catch { v = null; }
  const volume = v && Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : DEFAULT_VOLUME;
  return { muted: !!(v && v.muted === true), volume };
}

function load() {
  return parseAudioSettings(storage()?.getItem(AUDIO_SETTINGS_KEY));
}

export function getAudioSettings() {
  return current;
}

/** @param {{ muted?: boolean, volume?: number }} patch */
export function setAudioSettings(patch) {
  const next = parseAudioSettings(JSON.stringify({ ...current, ...patch }));
  if (next.muted === current.muted && next.volume === current.volume) return;
  current = next;
  try { storage()?.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(current)); } catch { /* session-only preference */ }
  for (const l of listeners) l(current);
}

/** @param {(s: { muted: boolean, volume: number }) => void} listener @returns {() => void} */
export function subscribeAudioSettings(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests: read the stored settings again. */
export function reloadAudioSettings() {
  current = load();
}
