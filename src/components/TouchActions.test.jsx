import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TouchActions from './TouchActions.jsx';
import { resetStore, useMissionStore } from '../state/store.js';

const coarse = (on) => {
  const matchMedia = (q) => ({ matches: on && q === '(pointer: coarse)', addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('matchMedia', matchMedia);
  vi.stubGlobal('window', { matchMedia });
};
const ids = (html) => [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);

// Server rendering reads zustand's initial state object, so a test writes the situation there and puts it back after.
const initial = useMissionStore.getInitialState();
const saved = { ...initial };
const situation = (patch) => Object.assign(initial, patch);
beforeEach(() => { resetStore(); });
afterEach(() => { vi.unstubAllGlobals(); Object.assign(initial, saved); });

describe('TouchActions (#365)', () => {
  it('draws nothing on a fine pointer before any touch', () => {
    coarse(false);
    expect(renderToStaticMarkup(<TouchActions engine={null} wristOpen={false} />)).toBe('');
  });

  it('offers the table actions in the habitat cabin', () => {
    coarse(true);
    situation({ mode: 'walk', stage: 'habitat' });
    const html = renderToStaticMarkup(<TouchActions engine={{ inHabitatCabin: () => true }} wristOpen={false} />);
    expect(ids(html)).toEqual(['pause', 'mode', 'open-plan', 'end-eva']);
  });

  it('puts the sampling buttons in their own row and the wrist keys up with the wrist', () => {
    coarse(true);
    situation({ mode: 'walk', stage: 'eva', sampling: { ...saved.sampling, status: { actions: { click: 'collect', photo: 'photo', stow: null, case: null } } } });
    const html = renderToStaticMarkup(<TouchActions engine={{ inHabitatCabin: () => false }} wristOpen={false} />);
    expect(html).toMatch(/touch-actions-sampling.*data-action="sample".*data-action="photo"/);
    expect(ids(html)).toEqual(['pause', 'mode', 'wrist', 'sample', 'photo']);
    const up = renderToStaticMarkup(<TouchActions engine={{ inHabitatCabin: () => false }} wristOpen />);
    expect(ids(up)).toEqual(['pause', 'mode', 'wrist', 'wrist-previous-page', 'wrist-next-page', 'wrist-previous-row', 'wrist-next-row', 'wrist-confirm']);
    expect(up).toContain('touch-rotate');
  });
});
