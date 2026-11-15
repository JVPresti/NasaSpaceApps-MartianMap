import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMedaSol } from '../data/medaRad.js';
import { provenance } from '../data/provenance.js';
import { setLanguage } from '../i18n/index.js';
import { parseLmst } from '../sim/missionClock.js';
import { MISSION_SOURCES } from '../sim/missions.js';
import { dustAgainstLimit, medaOverWindow, spaceWeather } from './outlook.js';
import { OutlookView } from './OutlookStrip.jsx';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const meda = read('../../public/data/meda_sol.json');
const hazards = read('../../public/data/hazards.json');
provenance.loadData({ hazards, meda });
provenance.define(MISSION_SOURCES);   // the event runner registers these in the app (src/state/events.js)

const lead = hazards.values['radiation.sep_2017.warning_lead_time'].value;
const limit = hazards.values['dust.event.nav_fix_tau_max'].value;
const window = medaOverWindow(parseMedaSol(meda), parseLmst('17:45'), 420);
const clear = { ...dustAgainstLimit(hazards.values['dust.tau.clear_season'].value, limit), measured: false };
const render = (props) => renderToStaticMarkup(
  <OutlookView window={window} dust={clear} space={spaceWeather({ leadMin: lead, atSec: 95 })} missionId="first" detail {...props} />,
);
// The tests above the compact block read the whole strip, as More detail shows it (#397).
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => setLanguage('en'));

describe('conditions outlook strip (#248)', () => {
  it('shows the MEDA weather over the planned walk window, tagged DATA, and says it is a replay', () => {
    const html = render();
    const t = text(html);
    expect(t).toContain('Over the planned walk, 17:45 to 17:51 LMST');
    for (const label of ['Pressure', 'Temperature', 'Wind']) expect(t).toContain(label);
    expect(t).toMatch(/\d+ to \d+ Pa|\d+ Pa/);
    expect(html.match(/src-tag-data/g)?.length).toBeGreaterThanOrEqual(3);
    expect(t).toContain('replayed from a past sol');
    expect(t).toContain('not a forecast');
  });

  it('shows the dust opacity against the terrain-fix limit, with its DATA and SIM tags', () => {
    const t = text(render());
    expect(t).toContain('τ 0.45');
    expect(t).toContain('terrain fix up to τ 1');
    const html = render();
    expect(html).toContain('tone-ok');
    expect(html).toContain('src-tag-sim');
  });

  it('turns the dust figure into a warning above the limit', () => {
    const html = render({ dust: { ...dustAgainstLimit(8, limit), measured: true }, dustSource: { tag: 'DATA', label: 'Curiosity · Gale', source: 'storm' } });
    expect(html).toContain('tone-warning');
    expect(text(html)).toContain('over τ 1: no terrain fix');
  });

  it('gives the space-weather warning and its 224 min lead before the radiation event, Gale not Jezero', () => {
    const html = render();
    const t = text(html);
    expect(t).toContain('224 min warning');
    expect(t).toContain('radiation alert comes 95 s into the EVA');
    expect(t).toContain('Gale, not Jezero');
    expect(html).toContain('src-tag-derived');
  });

  it('says when the particle event is under way, or switched off', () => {
    expect(text(render({ space: spaceWeather({ leadMin: lead, atSec: 95, active: true }) }))).toContain('Particle event under way');
    expect(text(render({ space: spaceWeather({ leadMin: lead, atSec: 95, off: true }) }))).toContain('switched off for this run');
  });

  it('gives the route\'s sky exposure, tagged DERIVED, when the route has one', () => {
    const exposure = { label: 'Sky exposure on the route', value: '0.93 mean · 0.88 at its most sheltered', note: 'Dose scales with it.' };
    const html = render({ exposure, space: spaceWeather({ leadMin: lead }) });
    expect(text(html)).toContain('Sky exposure on the route : 0.93 mean · 0.88 at its most sheltered');
    expect(html.match(/src-tag-derived/g)?.length).toBeGreaterThanOrEqual(2);
    expect(render()).not.toContain('outlook-exposure');
  });

  it('waits for a route before it has a window', () => {
    const t = text(render({ window: null }));
    expect(t).toContain('once the route is planned');
    expect(t).toContain('Pressure –');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render());
    for (const label of ['Previsión de condiciones', 'Presión', 'Viento', 'Polvo (opacidad)', 'Clima espacial', 'min de aviso', 'Gale, no Jezero', 'no una previsión']) expect(t).toContain(label);
    expect(t).toContain('τ 0,45');
  });

  describe('compact by default (#397)', () => {
    const exposure = { label: 'Sky exposure on the route', value: '0.93 mean', note: 'Dose scales with it.' };
    const compact = (props) => render({ detail: false, exposure, ...props });

    it('shows only the dust opacity and the space weather, with a short radiation line', () => {
      const t = text(compact());
      for (const label of ['Dust opacity', 'Space weather', '224 min warning', 'Radiation alert expected 95 s into the EVA.']) expect(t).toContain(label);
      for (const hidden of ['Pressure', 'Temperature', 'Wind', 'not a forecast', 'Gale, not Jezero', 'Sky exposure on the route']) expect(t).not.toContain(hidden);
    });

    it('keeps the dust and space-weather source tags', () => {
      const html = compact();
      expect(html).toContain('src-tag-sim');
      expect(html).toContain('src-tag-derived');
    });

    it('offers More detail, collapsed, and Less detail once open', () => {
      expect(compact()).toMatch(/<button[^>]*aria-expanded="false"[^>]*>More detail<\/button>/);
      expect(render({ exposure })).toMatch(/<button[^>]*aria-expanded="true"[^>]*>Less detail<\/button>/);
      expect(text(render({ exposure }))).toContain('Sky exposure on the route');
    });

    it('says plainly when no alert is planned, or the event is under way or off', () => {
      expect(text(compact({ space: spaceWeather({ leadMin: lead }) }))).toContain('No radiation alert expected on this walk.');
      expect(text(compact({ space: spaceWeather({ leadMin: lead, atSec: 95, active: true }) }))).toContain('Particle event under way');
      expect(text(compact({ space: spaceWeather({ leadMin: lead, atSec: 95, off: true }) }))).toContain('switched off for this run');
    });

    it('speaks Spanish', () => {
      setLanguage('es');
      const t = text(compact());
      for (const label of ['Polvo (opacidad)', 'Clima espacial', 'Más detalle', 'Alerta de radiación prevista']) expect(t).toContain(label);
      expect(t).not.toContain('Presión');
    });
  });
});
