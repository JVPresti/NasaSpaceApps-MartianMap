import { describe, expect, it } from 'vitest';
import { CHECKLIST, samplingPrompt } from './samplingPrompt.js';

const NONE = { click: null, photo: null, stow: null, case: null };
const status = (over = {}) => ({ phase: 'idle', holding: null, target: null, caseState: 'carried', caseInReach: false, actions: NONE, ...over });
const cheyava = (inReach, distanceM = 1.1) => ({ kind: 'rock', site: 'Cheyava Falls', distanceM, inReach });
const keys = (p) => p.items.map((i) => i.key);

describe('samplingPrompt', () => {
  it('shows only the aiming crosshair before the engine reports', () => {
    expect(samplingPrompt(null)).toEqual({ reticle: 'aim', items: [], note: null });
  });

  it('keeps a crosshair on screen with nothing in view and during a clip (#199)', () => {
    expect(samplingPrompt(status()).reticle).toBe('aim');
    expect(samplingPrompt(status({ phase: 'collecting', target: cheyava(true) })).reticle).toBe('aim');
  });

  it('lights the crosshair when the target is in reach (#199)', () => {
    const ground = { kind: 'ground', site: null, distanceM: 1.2, inReach: true };
    expect(samplingPrompt(status({ target: ground, actions: { ...NONE, click: 'collect', photo: 'photo' } })).reticle).toBe('reach');
    expect(samplingPrompt(status({ target: cheyava(false, 1.6), actions: { ...NONE, photo: 'photo' } })).reticle).toBe('look');
  });

  it('offers to chip Cheyava Falls within reach', () => {
    const p = samplingPrompt(status({ target: cheyava(true), actions: { ...NONE, click: 'collect', photo: 'photo', case: 'call-case' } }));
    expect(p.reticle).toBe('reach');
    expect(p.items).toEqual([{ key: 'Click', text: 'Take rock chips from Cheyava Falls' }, { key: 'P', text: 'Photograph Cheyava Falls' }]);
  });

  it('tells the player to walk closer to a rock out of reach', () => {
    const p = samplingPrompt(status({ target: cheyava(false, 3.24), actions: { ...NONE, photo: 'photo' } }));
    expect(p.reticle).toBe('look');
    expect(keys(p)).toEqual(['P']);
    expect(p.note).toBe('Cheyava Falls · 3.2 m · walk closer to sample');
  });

  it('offers soil within reach, and stays quiet with only far ground in view', () => {
    const soil = samplingPrompt(status({ target: { kind: 'ground', site: null, distanceM: 1.2, inReach: true }, actions: { ...NONE, click: 'collect', photo: 'photo' } }));
    expect(soil.items[0]).toEqual({ key: 'Click', text: 'Scoop soil' });
    const far = samplingPrompt(status({ target: { kind: 'ground', site: null, distanceM: 6, inReach: false }, actions: { ...NONE, photo: 'photo' } }));
    expect(far).toEqual({ reticle: 'aim', items: [], note: null });
  });

  it('offers stow and the case while holding a sample', () => {
    const p = samplingPrompt(status({ phase: 'holding', holding: 'rock', actions: { ...NONE, stow: 'stow', case: 'call-case' } }));
    expect(p.items).toEqual([{ key: 'E', text: 'Stow in the sample bag' }, { key: 'F', text: 'Ask EV2 to set the case down' }]);
    const pour = samplingPrompt(status({ phase: 'holding', caseState: 'down', caseInReach: true, actions: { ...NONE, stow: 'stow', case: 'pour' } }));
    expect(keys(pour)).toEqual(['E', 'F']);
    expect(pour.items[1].text).toBe('Pour into the case');
    const far = samplingPrompt(status({ phase: 'holding', caseState: 'down', caseInReach: false, actions: { ...NONE, stow: 'stow' } }));
    expect(far.note).toBe('Walk to the case to pour');
  });

  it('describes clips and the partner', () => {
    expect(samplingPrompt(status({ phase: 'collecting' })).note).toBe('Sampling…');
    expect(samplingPrompt(status({ phase: 'pouring' })).note).toBe('Pouring into the case…');
    expect(samplingPrompt(status({ phase: 'holding', caseState: 'coming', actions: { ...NONE, stow: 'stow' } })).note).toBe('EV2 is bringing the case');
    expect(samplingPrompt(status({ caseState: 'picking-up' })).note).toBe('EV2 is closing the case');
  });

  it('does not advertise the case while the scoop is free and the partner carries it', () => {
    expect(samplingPrompt(status({ actions: { ...NONE, case: 'call-case' } })).items).toEqual([]);
    expect(samplingPrompt(status({ caseState: 'down', actions: { ...NONE, case: 'pick-up-case' } })).items).toEqual([{ key: 'F', text: 'EV2 takes the case back' }]);
  });
});

describe('CHECKLIST', () => {
  it('has the four steps in order', () => {
    expect(CHECKLIST.map((r) => r.id)).toEqual(['photo', 'texture', 'sample', 'seal']);
  });
});
