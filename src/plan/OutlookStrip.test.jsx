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
  <OutlookView window={window} dust={clear} space={spaceWeather({ leadMin: lead, atSec: 95 })} missionId="first" {...props} />,
);
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// The visible words: the badges' captions, without the screen-reader text of the source tags.
const shown = (html) => text(html.replace(/<span class="[^"]*sr[^"]*">.*?<\/span>/g, ''));
const badge = (html, label) => html.split('<figure').find((f) => f.includes(`>${label}`)) ?? '';

afterEach(() => setLanguage('en'));

describe('conditions outlook badges (#248, #397)', () => {
  it('shows the MEDA weather over the planned walk as three context badges, tagged DATA', () => {
    const html = render();
    for (const label of ['Pressure', 'Temperature', 'Wind']) {
      expect(badge(html, label)).toContain('tone-muted');
      expect(badge(html, label)).toContain('src-tag-data');
    }
    expect(shown(html)).toMatch(/7\d\d Pa Pressure/);
  });

  it('colours the dust ring against the terrain-fix limit, with its DATA and SIM tags', () => {
    const ok = badge(render(), 'Dust');
    expect(ok).toContain('tone-ok');
    expect(ok).toContain('τ');
    expect(ok).toContain('src-tag-sim');
    const over = badge(render({ dust: { ...dustAgainstLimit(8, limit), measured: true }, dustSource: { tag: 'DATA', label: 'Curiosity · Gale', source: 'storm' } }), 'Dust');
    expect(over).toContain('tone-warning');
  });

  it('gives the radiation alert as one word in the colour of its state, with the DERIVED lead time tag', () => {
    const scheduled = badge(render(), 'Radiation');
    expect(scheduled).toContain('tone-caution');
    expect(text(scheduled)).toContain('Expected');
    expect(scheduled).toContain('src-tag-derived');
    expect(badge(render({ space: spaceWeather({ leadMin: lead, atSec: 95, active: true }) }), 'Radiation')).toContain('tone-warning');
    expect(text(badge(render({ space: spaceWeather({ leadMin: lead, atSec: 95, off: true }) }), 'Radiation'))).toContain('Off');
    expect(text(badge(render({ space: spaceWeather({ leadMin: lead }) }), 'Radiation'))).toContain('None');
  });

  it('gives the route\'s open sky as a share, tagged DERIVED, and a dash without a route', () => {
    const html = badge(render({ exposure: { mean: 0.93, min: 0.88 } }), 'Open sky');
    expect(text(html)).toContain('93 %');
    expect(html).toContain('src-tag-derived');
    expect(text(badge(render(), 'Open sky'))).toContain('–');
  });

  it('shows dashes for the weather until the route is planned', () => {
    expect(text(badge(render({ window: null }), 'Pressure'))).toContain('–');
  });

  it('carries no paragraphs: no notes under the badges', () => {
    const html = render({ exposure: { mean: 0.93, min: 0.88 } });
    expect(html).not.toContain('table-note');
    expect(html.match(/<figure/g)).toHaveLength(6);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render());
    for (const label of ['Presión', 'Temperatura', 'Viento', 'Polvo', 'Radiación', 'Cielo abierto', 'Prevista']) expect(t).toContain(label);
    expect(t).toContain('0,45');
  });
});
