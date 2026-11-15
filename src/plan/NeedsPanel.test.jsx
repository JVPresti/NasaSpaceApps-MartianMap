import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import { DEFAULT_NEEDS } from '../sim/missionNeeds.js';

// The panel reads the store's needs and the route.budget source tag; each test sets the snapshot it renders.
const mock = vi.hoisted(() => ({ state: null }));
vi.mock('../state/store.js', () => ({
  useMissionStore: (selector) => selector(mock.state),
  setNeeds: vi.fn(),
}));

const { default: NeedsPanel } = await import('./NeedsPanel.jsx');
const stateWith = (needs) => ({ needs: { ...DEFAULT_NEEDS, locked: false, ...needs }, sources: { 'route.budget': { tag: 'SIM', source: 'ours' } } });
const render = (needs = {}, props = {}) => {
  mock.state = stateWith(needs);
  return renderToStaticMarkup(<NeedsPanel {...props} />);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => setLanguage('en'));

describe('mission needs panel', () => {
  it('asks for the goal, the crew, the time, the O2 and battery at the start and the risk', () => {
    const html = render();
    for (const label of ['Goal', 'Crew', 'Time', 'O2', 'Battery', 'Risk']) expect(text(html)).toContain(label);
    expect(html).toContain('<select id="needs-objective"');
    expect(html.match(/<option/g)).toHaveLength(3);
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html).toContain('src-tag-sim');
  });

  it('shows the needs in the store: the first sortie, a pair, 30 min, full tanks, standard risk', () => {
    const html = render();
    expect(html).toMatch(/<option value="sortie" selected="">First sortie<\/option>/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>2 astronauts/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Standard/);
    expect(html).toMatch(/id="needs-time"[^>]*value="30"/);
    expect(text(html)).toContain('30 min');
    expect(text(html)).toContain('100 %');
  });

  it('follows a change of the needs, the time in hours and minutes', () => {
    const html = render({ objective: 'cheyava', crew: 1, timeMin: 100, o2Pct: 80, risk: 'cautious' });
    expect(html).toMatch(/<option value="cheyava" selected="">/);
    expect(html).toMatch(/aria-pressed="true"[^>]*>1 astronaut</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Cautious/);
    expect(text(html)).toContain('1 h 40 min');
    expect(text(html)).toContain('80 %');
  });

  it('explains each crew and risk choice in its tooltip, with the numbers of missionNeeds.js', () => {
    const html = render();
    expect(html).toContain('takes 1.5 times as long');
    expect(html).toContain('25 % of the time is held back');
    expect(html).toContain('5 % of the time is held back');
  });

  it('locks every control once the EVA has begun, and says so', () => {
    const locked = render({}, { locked: true });
    expect(locked.match(/disabled=""/g)).toHaveLength(1 + 2 + 3 + 3);
    expect(text(locked)).toContain('Locked since the EVA began');
    expect(render({ locked: true }).match(/disabled=""/g)).toHaveLength(9);
    expect(render()).not.toContain('disabled=""');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render());
    for (const label of ['Objetivo', 'Equipo', 'Tiempo', 'Batería', 'Riesgo', 'Primera salida', '2 astronautas', 'Prudente', 'Audaz']) expect(t).toContain(label);
  });
});
