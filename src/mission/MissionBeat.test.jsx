import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogs, setLanguage } from '../i18n/index.js';
import { MISSIONS } from '../sim/missions.js';
import { resetStore, setNeeds, useMissionStore } from '../state/store.js';
import { MissionRecap, PlanBeat, WalkBeat } from './MissionBeat.jsx';

// Render a populated mission snapshot in SSR (Zustand normally uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => { setLanguage('en'); resetStore(); });

const walk = (evaBegun = true) => renderToStaticMarkup(<WalkBeat evaBegun={evaBegun} />);
const alert = (eventId) => ({ [eventId]: { id: eventId, eventId, level: 'warning', text: eventId, active: true } });

describe('beat lines (#265)', () => {
  it('has every beat line in English and Spanish', () => {
    const keys = [...MISSIONS.first.beats.map((beat) => beat.text), 'mission.recap.title', 'mission.start.full'];
    for (const key of keys) {
      expect(typeof catalogs.en[key]).toBe('string');
      expect(typeof catalogs.es[key]).toBe('string');
      expect(catalogs.es[key]).not.toBe(catalogs.en[key]);
    }
  });

  it('names the NASA data behind each event beat', () => {
    expect(catalogs.en['mission.beat.storm']).toMatch(/Mastcam-Z|MEDA/);
    expect(catalogs.en['mission.beat.storm']).toMatch(/Gale/);
    expect(catalogs.en['mission.beat.radiation']).toMatch(/RAD/);
    expect(catalogs.en['mission.beat.radiation']).toMatch(/ALARA/);
    expect(catalogs.en['mission.beat.plan']).toMatch(/HiRISE/);
  });

  it('never says GPS, and keeps each Walk beat on one line beside the HUD at 1366 px (about 92 characters)', () => {
    for (const language of ['en', 'es']) {
      for (const beat of MISSIONS.first.beats) expect(catalogs[language][beat.text]).not.toMatch(/GPS/);
      for (const id of ['walk', 'dust-storm', 'radiation']) {
        const beat = MISSIONS.first.beats.find((entry) => entry.id === id);
        expect(catalogs[language][beat.text].length).toBeLessThanOrEqual(92);
      }
    }
  });

  it('names the full EVA on the start screen like the table names its goal', () => {
    expect(catalogs.en['mission.start.full']).toContain('Sample Cheyava Falls');
    expect(catalogs.es['mission.start.full']).toContain('Muestrear Cheyava Falls');
  });

  it('shows the plan beat as a table note before Begin EVA, and not after', () => {
    expect(renderToStaticMarkup(<PlanBeat evaBegun={false} />)).toMatch(/class="table-note mission-beat"[^>]*>Plan · /);
    expect(renderToStaticMarkup(<PlanBeat evaBegun={true} />)).toBe('');
  });

  it('shows the walk, storm and radiation beats in the key strip during the first mission', () => {
    useMissionStore.setState({ mode: 'walk' });
    expect(walk()).toMatch(/class="hint mission-beat"[^>]*data-beat="walk"/);
    useMissionStore.setState({ alerts: alert('dust-storm') });
    expect(walk()).toContain('data-beat="dust-storm"');
    useMissionStore.setState({ alerts: { ...alert('dust-storm'), ...alert('radiation') } });
    expect(walk()).toContain('data-beat="radiation"');
    setLanguage('es');
    expect(walk()).toContain('Radiación · ');
  });

  it('shows no beat line and no recap for the full EVA', () => {
    setNeeds({ objective: 'cheyava' });
    useMissionStore.setState({ mode: 'walk', alerts: alert('dust-storm') });
    expect(walk()).toBe('');
    expect(renderToStaticMarkup(<PlanBeat evaBegun={false} />)).toBe('');
    expect(renderToStaticMarkup(<MissionRecap />)).toBe('');
  });

  it('recaps every beat of the first mission in the debrief, one line each', () => {
    const html = renderToStaticMarkup(<MissionRecap objective="sortie" />);
    expect(html).toContain('What this mission showed');
    expect(html.match(/<p data-beat=/g)).toHaveLength(MISSIONS.first.beats.length);
    expect(html).toContain('data-beat="debrief"');
  });
});
