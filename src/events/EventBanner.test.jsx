import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import { provenance } from '../data/provenance.js';
import { resetStore, useMissionStore } from '../state/store.js';
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
    const entry = provenance.lookup(EVENT_VALUE_PATHS['dust-storm']);
    const html = banner('dust-storm', { dustOpacity: 3.17 });
    expect(text(html)).toContain('τ 3.17 · ' + entry.caption);
    expect(tagOf(html)).toBe(entry.tag);
    expect(html).toContain(`title="${entry.source.replace(/'/g, '&#x27;')}"`);
    expect(entry.caption).toMatch(/Gale 2018/);
    expect(entry.source).toMatch(/Gale crater/);
    expect(entry.source).not.toMatch(/2022/);
  });

  it('ignores a live store source with another tag, so the words and the tag stay together', () => {
    const html = banner('dust-storm', { dustOpacity: 0.45 }, { 'environment.dustOpacity': { tag: 'SIM', source: 'something else' } });
    expect(tagOf(html)).toBe(provenance.lookup('environment.dustOpacity').tag);
  });

  it('cites the September 2017 event for the radiation rate, not the background', () => {
    const entry = provenance.lookup(EVENT_VALUE_PATHS.radiation);
    const html = banner('radiation', { doseRateUgyH: 29.92, doseUgy: 0.9 });
    expect(text(html)).toContain('29.9 µGy/h · 0.9 µGy · ' + entry.caption);
    expect(tagOf(html)).toBe('DATA');
    expect(entry.caption).toMatch(/September 2017/);
    expect(entry.source).toMatch(/sep_2017_profile/);
  });

  it('translates the caption', () => {
    setLanguage('es');
    expect(eventCaption(EVENT_VALUE_PATHS['dust-storm'])).toMatch(/tormenta de Curiosity en Gale en 2018/);
    expect(eventCaption(EVENT_VALUE_PATHS.radiation)).toMatch(/septiembre de 2017/);
  });
});
