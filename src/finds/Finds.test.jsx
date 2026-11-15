import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetStore, useMissionStore } from '../state/store.js';
import Finds from './Finds.jsx';

// Render the current mission snapshot in SSR (Zustand normally uses the creation-time state), as interface.test.jsx does.
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => resetStore());

const FIND = {
  id: 'f1', label: 'M01', x: 540, z: 580, status: 'priced', error: null,
  detour: { ok: true, verdict: 'go', reason: null, extraSec: 0, extraO2G: 0, extraM: 1, marginBeforeSec: 22860, marginAfterSec: 22860, marginStatus: 'nominal' },
};
const pending = () => useMissionStore.setState((s) => ({ mode: 'walk', finds: { ...s.finds, list: [FIND], activeId: 'f1' } }));
const engine = (cabin) => ({ inHabitatCabin: () => cabin });
const render = (e) => renderToStaticMarkup(<Finds engine={e} mode="walk" />);

describe('the find card and the habitat table (#244)', () => {
  it('shows an unanswered find card outside the cabin', () => {
    pending();
    expect(render(engine(false))).toContain('find-card');
    expect(render(null)).toContain('find-card');   // no engine yet: nothing to give way to
  });

  it('keeps the card away while the player is in the cabin, so the table prompt stays readable', () => {
    pending();
    const html = render(engine(true));
    expect(html).not.toContain('find-card');
    expect(html).toContain('find-ring');   // the pointing ring stays mounted (hidden until Q is held)
    expect(useMissionStore.getState().finds.activeId).toBe('f1');   // the find still waits for an answer
  });
});
