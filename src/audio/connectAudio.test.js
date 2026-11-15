import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStore, useMissionStore } from '../state/store.js';
import { connectAudio, UPDATE_MS } from './connectAudio.js';

function target() {
  const handlers = {};
  return {
    handlers,
    visibilityState: 'visible',
    addEventListener(type, fn) { if (!handlers[type]) handlers[type] = new Set(); handlers[type].add(fn); },
    removeEventListener(type, fn) { if (handlers[type]) handlers[type].delete(fn); },
    fire(type) { for (const fn of [...(handlers[type] || [])]) fn(); },
  };
}

function fakeAudio() {
  const audio = {
    running: false,
    setSettings: vi.fn(), setHidden: vi.fn(), update: vi.fn(), step: vi.fn(), alert: vi.fn(), radio: vi.fn(), dispose: vi.fn(),
  };
  audio.start = vi.fn(() => { audio.running = true; });
  return audio;
}

function connect(player = { x: 0, z: 0 }) {
  const win = target(), doc = target(), audio = fakeAudio();
  const off = connectAudio({ getPlayer: () => player }, useMissionStore, { win, doc, audio });
  return { win, doc, audio, off, player };
}

beforeEach(() => { resetStore(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('suit audio connection (#72)', () => {
  it('starts only on the first click or key press', () => {
    const { win, audio, off } = connect();
    vi.advanceTimersByTime(UPDATE_MS * 3);
    expect(audio.start).not.toHaveBeenCalled();
    expect(audio.update).not.toHaveBeenCalled();
    win.fire('pointerdown');
    expect(audio.start).toHaveBeenCalledOnce();
    expect(win.handlers.pointerdown.size).toBe(0);
    off();
    expect(audio.dispose).toHaveBeenCalled();
  });

  it('keeps listening after a touch that left the context suspended, and starts on the finger lifting (#365)', () => {
    const { win, audio, off } = connect();
    audio.start = vi.fn(() => { if (audio.start.mock.calls.length >= 2) audio.running = true; });
    win.fire('pointerdown');   // a finger going down: the browser makes the context but keeps it suspended
    expect(audio.running).toBe(false);
    expect(win.handlers.touchend.size).toBe(1);
    win.fire('touchend');      // the finger lifts: a user activation, so the context resumes
    expect(audio.start).toHaveBeenCalledTimes(2);
    expect(audio.running).toBe(true);
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) expect(win.handlers[type].size).toBe(0);
    off();
  });

  it('plays a tone and a habitat call for a new alert, and radio cues for the partner link', () => {
    const { audio, off } = connect();
    useMissionStore.setState({ alerts: { storm: { level: 'warning', active: true } } });
    expect(audio.alert).toHaveBeenCalledWith('warning');
    expect(audio.radio).toHaveBeenCalledWith('call', expect.any(Number));
    useMissionStore.setState({ crew: [{ link: true }] });
    useMissionStore.setState({ crew: [{ link: false }] });
    expect(audio.radio).toHaveBeenLastCalledWith('lost');
    off();
  });

  it('follows effort and plays footsteps only while walking in Walk', () => {
    useMissionStore.setState((s) => ({ mode: 'walk', suit: { ...s.suit, effort: 0.8 } }));
    const { win, audio, off, player } = connect();
    win.fire('keydown');
    vi.advanceTimersByTime(UPDATE_MS);
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ effort: 0.8, audible: true }));
    player.habitatZone = 'main';
    vi.advanceTimersByTime(UPDATE_MS);
    expect(audio.update).toHaveBeenLastCalledWith(expect.objectContaining({ shelter: 1 }));
    player.habitatZone = null;
    for (let i = 0; i < 20; i++) { player.x += 0.1; vi.advanceTimersByTime(UPDATE_MS); }   // 2 m: two strides
    expect(audio.step).toHaveBeenCalledTimes(2);
    useMissionStore.setState({ mode: 'plan' });
    for (let i = 0; i < 20; i++) { player.x += 0.1; vi.advanceTimersByTime(UPDATE_MS); }
    expect(audio.step).toHaveBeenCalledTimes(2);
    off();
  });

  it('suspends while the tab is hidden', () => {
    const { doc, audio, off } = connect();
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(audio.setHidden).toHaveBeenLastCalledWith(true);
    off();
  });
});
