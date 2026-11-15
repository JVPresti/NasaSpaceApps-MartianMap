import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import { provenance } from '../data/provenance.js';
import { resetStore, setNeeds, useMissionStore } from '../state/store.js';
import { FIRST_STORM_TAU_PATH, RADIATION_STEP_PATH } from '../mission/sources.js';
import { DOSE_SOURCE } from '../sim/environmentRunner.js';
import EventBanner, { EVENT_VALUE_PATHS, eventCaption } from './EventBanner.jsx';

// Render a populated mission snapshot in SSR (Zustand normally uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => { setLanguage('en'); resetStore(); });

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const tagOf = (html) => html.match(/data-tag="(\w+)"/)?.[1];
const tagsOf = (html) => [...html.matchAll(/data-tag="(\w+)"/g)].map((m) => m[1]);

function banner(eventId, environment, sources = {}) {
  useMissionStore.setState((s) => ({
    alerts: { [eventId]: { active: true, eventId, level: 'warning', text: 'alert' } },
    environment: { ...s.environment, ...environment },
    sources: { ...s.sources, ...sources },
  }));
  return renderToStaticMarkup(<EventBanner />);
}

describe('event banner captions and tags (#196)', () => {
  it('writes the dust caption and tag from one registry entry, the profile the event plays', () => {
    setNeeds({ objective: 'cheyava' });   // the full EVA plays the storm on its own ramp
    const entry = provenance.lookup(EVENT_VALUE_PATHS['dust-storm']);
    const html = banner('dust-storm', { dustOpacity: 3.17 });
    expect(text(html)).toContain('τ 3.17 · ' + entry.caption);
    expect(tagOf(html)).toBe(entry.tag);
    expect(html).toContain(`title="${entry.source.replace(/'/g, '&#x27;')}"`);
    expect(entry.caption).toMatch(/Gale 2018/);
    expect(entry.source).toMatch(/Gale crater/);
    expect(entry.source).not.toMatch(/2022/);
  });

  it('tags the storm opacity SIM in the first mission, whose ramp is shortened, with the same caption (P19)', () => {
    const entry = provenance.lookup(FIRST_STORM_TAU_PATH);
    const html = banner('dust-storm', { dustOpacity: 3.17 });
    expect(entry.tag).toBe('SIM');
    expect(tagOf(html)).toBe('SIM');
    expect(entry.caption).toBe(provenance.lookup(EVENT_VALUE_PATHS['dust-storm']).caption);
    expect(text(html)).toContain('τ 3.17 · ' + entry.caption);
  });

  it('ignores a live store source with another tag, so the words and the tag stay together', () => {
    setNeeds({ objective: 'cheyava' });
    const html = banner('dust-storm', { dustOpacity: 0.45 }, { 'environment.dustOpacity': { tag: 'SIM', source: 'something else' } });
    expect(tagOf(html)).toBe(provenance.lookup('environment.dustOpacity').tag);
  });

  it('cites the September 2017 event for the radiation rate, not the background', () => {
    const entry = provenance.lookup(EVENT_VALUE_PATHS.radiation);
    const html = banner('radiation', { doseRateUgyH: 29.92, doseUgy: 0.9 }, { 'environment.doseUgy': DOSE_SOURCE });
    expect(text(html)).toContain('29.9 µGy/h · ' + entry.caption);
    expect(tagOf(html)).toBe('DATA');
    expect(entry.caption).toMatch(/September 2017/);
    expect(entry.source).toMatch(/sep_2017_profile/);
    expect(entry.note).toMatch(/B detector/);
    expect(entry.note).toMatch(/E detector/);   // the step from the HUD's background is a change of detector (#295)
  });

  it('tags our ramp steps SIM and the measured rates DATA, with words from the same entry (#295)', () => {
    for (const rate of [10, 29.92]) expect(tagsOf(banner('radiation', { doseRateUgyH: rate, doseUgy: 1 }))[0]).toBe('DATA');
    const step = provenance.lookup(RADIATION_STEP_PATH);
    for (const rate of [20, 12]) {
      const html = banner('radiation', { doseRateUgyH: rate, doseUgy: 1 });
      expect(tagsOf(html)[0]).toBe('SIM');
      expect(text(html)).toContain(' µGy/h · ' + step.caption);
      expect(html).toContain(`title="${step.source.replace(/'/g, '&#x27;')}"`);
    }
    expect(step.caption).toMatch(/our step/);
  });

  it('gives the dose this EVA its own DERIVED tag, apart from the rate (#295)', () => {
    const html = banner('radiation', { doseRateUgyH: 29.92, doseUgy: 4.8 }, { 'environment.doseUgy': DOSE_SOURCE });
    expect(tagsOf(html)).toEqual(['DATA', 'DERIVED']);
    const shown = text(html.replace(/<span class="source-tag-sr">[^<]*<\/span>/g, ''));   // what is drawn
    expect(shown).toMatch(/Jezero DATA 4\.8 µGy DERIVED/);
    expect(DOSE_SOURCE.source).toMatch(/minutes the event plays/);
  });

  it('translates the caption', () => {
    setLanguage('es');
    expect(eventCaption(EVENT_VALUE_PATHS['dust-storm'])).toMatch(/tormenta de Curiosity en Gale en 2018/);
    expect(eventCaption(EVENT_VALUE_PATHS.radiation)).toMatch(/septiembre de 2017/);
    expect(eventCaption(RADIATION_STEP_PATH)).toMatch(/paso nuestro/);
  });
});

describe('event banner order', () => {
  const alert = (eventId, level, startedAtSec) => ({ active: true, eventId, level, text: eventId + ' alert', startedAtSec });

  it('shows the newest of two alerts of one level, and counts the other (#265)', () => {
    useMissionStore.setState({ alerts: { 'dust-storm': alert('dust-storm', 'warning', 75), radiation: alert('radiation', 'warning', 95) } });
    const html = text(renderToStaticMarkup(<EventBanner />));
    expect(html).toMatch(/^ ?warning radiation alert/);
    expect(html).toMatch(/1 more alert/);
  });

  it('still puts a more severe alert above a newer one', () => {
    useMissionStore.setState({ alerts: { 'dust-storm': alert('dust-storm', 'warning', 75), 'low-oxygen-caution': alert('low-oxygen-caution', 'caution', 95) } });
    expect(text(renderToStaticMarkup(<EventBanner />))).toMatch(/^ ?warning dust-storm alert/);
  });
});
