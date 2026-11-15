import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogs, setLanguage } from '../i18n/index.js';
import { provenance } from '../data/provenance.js';
import { CREWMATE_SOURCES } from '../state/crewmate.js';
import { resetStore, useMissionStore } from '../state/store.js';
import CrewmateRadio from './CrewmateRadio.jsx';
import { calloutText, RADIO_SHOW_MS } from './crewmateRadioText.js';

vi.mock('./crewmateRadio.css', () => ({}));
vi.mock('../components/SourceTag.css', () => ({}));
// Render the current store snapshot in SSR (Zustand normally uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore) };
});

afterEach(() => { setLanguage('en'); resetStore(); });

const slope = { kind: 'slope', key: 'crewmate.say.slope', params: { deg: 18, side: 'crewmate.side.left' }, sources: { deg: 'crewmate.slopeAheadDeg' }, urgent: false };

describe('EV2 radio line', () => {
  it('says each callout in English and Spanish, with the translated side', () => {
    expect(calloutText(slope)).toBe('EV2: slope 18° ahead, I\'m taking the left side');
    setLanguage('es');
    expect(calloutText(slope)).toBe('EV2: pendiente de 18° delante, voy por la izquierda');
    expect(calloutText(null)).toBe('');
  });

  it('has every callout key in both catalogues', () => {
    const keys = Object.keys(catalogs.en).filter((k) => k.startsWith('crewmate.'));
    expect(keys.length).toBeGreaterThanOrEqual(11);
    for (const k of keys) expect(typeof catalogs.es[k]).toBe('string');
  });

  it('shows the last callout for 8 s, with the source tag of its number', () => {
    provenance.define(CREWMATE_SOURCES);   // startCrewmate declares them when the simulation starts
    expect(renderToStaticMarkup(<CrewmateRadio />)).toBe('');
    useMissionStore.setState({ comms: { partner: { ...slope, atMs: Date.now() } } });
    const html = renderToStaticMarkup(<CrewmateRadio />);
    expect(html).toContain('EV2: slope 18° ahead');
    expect(html).toContain('DERIVED');
    useMissionStore.setState({ comms: { partner: { ...slope, atMs: Date.now() - RADIO_SHOW_MS - 1 } } });
    expect(renderToStaticMarkup(<CrewmateRadio />)).toBe('');
  });
});
