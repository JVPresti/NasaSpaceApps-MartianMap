import { describe, expect, it, vi } from 'vitest';
import { createInitialState } from '../state/store.js';
import { dustLevelFromTau } from '../state/dustLevel.js';
import { ENGINE_TIMEOUT_MS, createHoldTimer, createPlayer, playLabel, pointerStep, slideTarget, videoFrame, fallbackStep, presentHrefFor, presentKey, queryWithoutPresent, restoreEngine } from './control.js';

const key = (k, mods = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, ...mods });

describe('presentKey', () => {
  it('maps clicker keys to next and back', () => {
    for (const k of ['ArrowRight', 'PageDown', 'Enter']) expect(presentKey(key(k))).toBe('next');
    for (const k of ['ArrowLeft', 'PageUp']) expect(presentKey(key(k))).toBe('back');
  });

  it('plays and pauses on Space, P and K, and jumps to a slide on its digit', () => {
    for (const k of [' ', 'p', 'P', 'k', 'K']) expect(presentKey(key(k))).toBe('toggle');
    expect(presentKey(key('1'))).toBe('slide:1');
    expect(presentKey(key('4'))).toBe('slide:4');
    expect(presentKey(key('0'))).toBe('swallow');
  });

  it('exits on Esc and switches language on L', () => {
    expect(presentKey(key('Escape'))).toBe('exit');
    expect(presentKey(key('l'))).toBe('lang');
    expect(presentKey(key('L'))).toBe('lang');
  });

  it('swallows the app keys, so G and WASD never reach the scene under the presentation', () => {
    for (const k of ['g', 'G', 'w', 'a', 's', 'd', 'm', 'Tab']) expect(presentKey(key(k))).toBe('swallow');
  });

  it('leaves the browser its keys: modifiers, reload, full screen and the developer tools', () => {
    expect(presentKey(key('r', { ctrlKey: true }))).toBeNull();
    expect(presentKey(key('ArrowRight', { altKey: true }))).toBeNull();
    for (const k of ['F5', 'F11', 'F12']) expect(presentKey(key(k))).toBeNull();
  });
});

describe('restoreEngine', () => {
  const engine = () => ({
    setDust: vi.fn(), setSky: vi.fn(), setSkyBlend: vi.fn(), setSkyTime: vi.fn(), setLayer: vi.fn(), setSlopeGrid: vi.fn(),
  });

  it('puts back the store default light, not clear_day', () => {
    const eng = engine();
    restoreEngine(eng, createInitialState());
    expect(eng.setSky).toHaveBeenCalledWith('late_afternoon');
    expect(eng.setLayer).toHaveBeenCalledWith(0);
    expect(eng.setSlopeGrid).toHaveBeenCalledWith(false);
    expect(eng.setDust).toHaveBeenCalledWith(dustLevelFromTau(0));
    expect(eng.setSkyBlend).not.toHaveBeenCalled();
  });

  it('puts back a layer, a storm blend and the dust the store holds', () => {
    const eng = engine();
    const s = createInitialState();
    s.view = { ...s.view, layer: 2, sky: 'clear_day', skyBlend: 0.4, slopeGrid: true };
    s.environment = { ...s.environment, dustOpacity: 4 };
    restoreEngine(eng, s);
    expect(eng.setLayer).toHaveBeenCalledWith(2);
    expect(eng.setSky).toHaveBeenCalledWith('clear_day');
    expect(eng.setSkyBlend).toHaveBeenCalledWith('clear_day', 'dust_storm', 0.4);
    expect(eng.setSlopeGrid).toHaveBeenCalledWith(true);
    expect(eng.setDust).toHaveBeenCalledWith(dustLevelFromTau(4));
  });

  it('survives an engine that throws or is missing', () => {
    expect(() => restoreEngine(null, createInitialState())).not.toThrow();
    const eng = engine();
    eng.setSky.mockImplementation(() => { throw new Error('not ready'); });
    expect(() => restoreEngine(eng, createInitialState())).not.toThrow();
    expect(eng.setLayer).toHaveBeenCalled();
  });
});

describe('createHoldTimer', () => {
  it('expires after one unbroken hold of the timeout', () => {
    const t = createHoldTimer(1000);
    expect(t.update(true, 0)).toBe(false);
    expect(t.update(true, 999)).toBe(false);
    expect(t.update(true, 1000)).toBe(true);
  });

  it('starts over when the hold ends', () => {
    const t = createHoldTimer(1000);
    t.update(true, 0);
    expect(t.update(false, 900)).toBe(false);
    expect(t.update(true, 950)).toBe(false);
    expect(t.update(true, 1900)).toBe(false);
    expect(t.update(true, 1950)).toBe(true);
  });

  it('waits 20 s by default', () => expect(ENGINE_TIMEOUT_MS).toBe(20_000));
});

describe('URLs', () => {
  it('drops only the presentation keys when it ends', () => {
    expect(queryWithoutPresent('?present=1&autoplay=1&record=1&seq=global30&beat=zone')).toBe('');
    expect(queryWithoutPresent('?present=1&tier=low&lang=es')).toBe('?tier=low&lang=es');
  });

  it('keeps ?tier and ?lang on the way in', () => {
    expect(presentHrefFor('')).toBe('?present=1');
    expect(presentHrefFor('?tier=low&lang=es')).toBe('?tier=low&lang=es&present=1');
  });
});

describe('fallbackStep', () => {
  it('steps the caption fallback and stops at both ends', () => {
    expect(fallbackStep(0, 'back', 10)).toBe(0);
    expect(fallbackStep(3, 'back', 10)).toBe(2);
    expect(fallbackStep(3, 'next', 10)).toBe(4);
    expect(fallbackStep(9, 'next', 10)).toBe(9);   // no hand-off into an app without an engine
    expect(fallbackStep(4, 'lang', 10)).toBe(4);
  });
});

describe('createPlayer: paused behind the Play button until the presenter starts it', () => {
  it('starts paused and not started, then plays and pauses', () => {
    const p = createPlayer();
    expect(p.playing).toBe(false);
    expect(p.started).toBe(false);
    expect(p.toggle()).toBe(true);
    expect(p.started).toBe(true);
    expect(p.toggle()).toBe(false);
    expect(p.started).toBe(true);   // the big Play button does not come back after a pause
  });

  it('plays at once with ?autoplay=1 or a recording', () => {
    const p = createPlayer(true);
    expect(p.playing).toBe(true);
    expect(p.started).toBe(true);
  });
});

describe('slideTarget: the digit keys', () => {
  it('turns slide N into its index, clamped to the slides there are', () => {
    expect(slideTarget('slide:1', 6)).toBe(0);
    expect(slideTarget('slide:4', 6)).toBe(3);
    expect(slideTarget('slide:9', 6)).toBe(5);
    expect(slideTarget('next', 6)).toBeNull();
  });
});

describe('pointerStep: taps and swipes', () => {
  it('reads a swipe left as next, right as back, and a tap by its half', () => {
    expect(pointerStep({ x: 600, y: 300 }, { x: 400, y: 310 }, 1000)).toBe('next');
    expect(pointerStep({ x: 300, y: 300 }, { x: 500, y: 290 }, 1000)).toBe('back');
    expect(pointerStep({ x: 800, y: 300 }, { x: 802, y: 301 }, 1000)).toBe('next');
    expect(pointerStep({ x: 100, y: 300 }, { x: 101, y: 300 }, 1000)).toBe('back');
    expect(pointerStep({ x: 100, y: 300 }, { x: 130, y: 300 }, 1000)).toBeNull();   // a drag, not a step
  });
});

describe('videoFrame: the demo plays, holds its last frame, then fades', () => {
  it('plays from the beat start and fades in', () => {
    expect(videoFrame(0, 90, 89.5)).toMatchObject({ time: 0, playing: true, opacity: 0 });
    expect(videoFrame(10, 90, 89.5)).toMatchObject({ time: 10, playing: true, opacity: 1 });
  });

  it('holds a frame before the end once the file has played, never an ended or rewound video', () => {
    const f = videoFrame(89.8, 90, 89.5);
    expect(f.playing).toBe(false);
    expect(f.time).toBeCloseTo(89.5 - 1 / 30);
  });

  it('fades out over the beat\'s last 0.6 s into the next beat', () => {
    expect(videoFrame(89.7, 90, 89.5).opacity).toBeCloseTo(0.5);
    expect(videoFrame(90, 90, 89.5).opacity).toBe(0);
  });

  it('holds the last frame, with no fade, once the presenter has taken over and the beat stays up', () => {
    expect(videoFrame(89.7, 90, 89.5, { hold: true })).toMatchObject({ playing: false, opacity: 1 });
    const f = videoFrame(200, 90, 89.5, { hold: true });
    expect(f.opacity).toBe(1);
    expect(f.time).toBeCloseTo(89.5 - 1 / 30);
    expect(videoFrame(10, 90, 89.5, { hold: true })).toMatchObject({ time: 10, playing: true, opacity: 1 });
  });

  it('falls back to the beat length while the file\'s length is unknown', () => {
    expect(videoFrame(5, 90, NaN)).toMatchObject({ time: 5, playing: true });
  });
});

describe('playLabel: the play state beside the slide number', () => {
  it('reads Playing or Paused in both languages', () => {
    expect(playLabel(true, 'en')).toBe('Playing');
    expect(playLabel(false, 'en')).toBe('Paused');
    expect(playLabel(false, 'es')).toBe('En pausa');
  });
});
