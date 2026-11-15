import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_SETTINGS_KEY, DEFAULT_VOLUME, getAudioSettings, parseAudioSettings, reloadAudioSettings, setAudioSettings, subscribeAudioSettings,
} from './settings.js';

afterEach(() => { vi.unstubAllGlobals(); reloadAudioSettings(); });

describe('audio settings (#72)', () => {
  it('reads stored settings and falls back to defaults on bad data', () => {
    expect(parseAudioSettings(null)).toEqual({ muted: false, volume: DEFAULT_VOLUME });
    expect(parseAudioSettings('{bad')).toEqual({ muted: false, volume: DEFAULT_VOLUME });
    expect(parseAudioSettings(JSON.stringify({ muted: true, volume: 2 }))).toEqual({ muted: true, volume: 1 });
  });
  it('remembers mute and volume and tells listeners', () => {
    const saved = new Map();
    vi.stubGlobal('localStorage', { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) });
    reloadAudioSettings();
    const listener = vi.fn();
    const off = subscribeAudioSettings(listener);
    setAudioSettings({ muted: true });
    expect(getAudioSettings().muted).toBe(true);
    expect(JSON.parse(saved.get(AUDIO_SETTINGS_KEY))).toEqual({ muted: true, volume: DEFAULT_VOLUME });
    setAudioSettings({ muted: true });   // no change: no call
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    reloadAudioSettings();               // the next visit reads it back
    expect(getAudioSettings()).toEqual({ muted: true, volume: DEFAULT_VOLUME });
  });
});
