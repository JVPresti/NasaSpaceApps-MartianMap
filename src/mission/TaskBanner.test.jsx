import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogs, setLanguage } from '../i18n/index.js';
import { resetStore, useMissionStore } from '../state/store.js';
import { SamplingChecklist } from '../hud/SamplingPanel.jsx';
import TaskBanner from './TaskBanner.jsx';

// Render a populated mission snapshot in SSR (Zustand normally uses the creation-time state).
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore),
  };
});

afterEach(() => { setLanguage('en'); resetStore(); });

// route.tasks as the planner writes it: a rock and two photos at Bright Angel (one waypoint), soil at a clicked point,
// and a photo left out of the plan.
const BRIGHT_ANGEL = { key: 'bright-angel', type: 'stop', stopId: 'bright-angel', x: -11, z: -50, radiusM: 2, label: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', reason: null };
const P1 = { key: 'P1', type: 'point', stopId: null, x: 470, z: 560, radiusM: 8, label: 'P1', waypoint: 'P1 · task point', reason: null };
const TASKS = [
  { id: 't1', what: 'rock', count: 1, place: BRIGHT_ANGEL, workSec: 480, kept: true, drop: null },
  { id: 't2', what: 'photo', count: 2, place: BRIGHT_ANGEL, workSec: 240, kept: true, drop: null },
  { id: 't3', what: 'soil', count: 1, place: P1, workSec: 240, kept: false, drop: { limit: 'time' } },
];
const banner = () => renderToStaticMarkup(<TaskBanner />);
const at = (x, z, visited = ['HAB', 'WP3 · Bright Angel outcrop']) => useMissionStore.setState((s) => ({
  mode: 'walk',
  route: { ...s.route, tasks: TASKS, visited },
  navigation: { ...s.navigation, x, z },
}));
const secure = (samples, photoLog = []) => useMissionStore.setState((s) => ({ sampling: { ...s.sampling, samples, photoLog } }));

describe('the task banner (#352)', () => {
  it('shows the place\'s first task on arrival in one line, in the stop banner\'s markup, tagged SIM', () => {
    at(-12, -48);
    const html = banner();
    expect(html).toMatch(/^<div class="event-banner info event-banner-walk mission-stop" role="status" data-task-place="bright-angel">/);
    expect(html).toContain('Task · Bright Angel');
    expect(html).toMatch(/data-task="t1" data-state="open">Collect 1 rock sample here · 0 of 1 · \+1 more /);
    expect(html.match(/class="event-text"/g)).toHaveLength(1);   // one line: the science card sits under the banner
    expect(html.match(/data-tag="SIM"/g)).toHaveLength(1);
  });

  it('goes on to the next task once one is in, counts photos as they come, and ticks the place when all are in', () => {
    at(-12, -48);
    secure([{ id: 1, kind: 'rock', site: 'Bright Angel', x: -11.5, z: -49, into: 'pouch', atSec: 300 }], [{ x: -11, z: -50, kind: 'rock', site: 'Bright Angel', atSec: 290 }]);
    expect(banner()).toMatch(/data-task="t2" data-state="open">Take 2 photos here · 1 of 2 </);
    secure([{ id: 1, kind: 'rock', site: 'Bright Angel', x: -11.5, z: -49, into: 'pouch', atSec: 300 }], [{ x: -11, z: -50, kind: 'rock', site: 'Bright Angel', atSec: 290 }, { x: -10, z: -50, kind: 'rock', site: null, atSec: 310 }]);
    expect(banner()).toMatch(/data-task="t1 t2" data-state="done">✓ Done · 1 rock sample, 2 photos here </);
  });

  it('ticks a single task with its count when its sample is secured inside the place', () => {
    at(-12, -48);
    useMissionStore.setState((s) => ({ route: { ...s.route, tasks: [TASKS[0]] } }));
    expect(banner()).toMatch(/data-task="t1" data-state="open">Collect 1 rock sample here · 0 of 1 </);
    secure([{ id: 1, kind: 'rock', site: 'Bright Angel', x: -11.5, z: -49, into: 'pouch', atSec: 300 }]);
    expect(banner()).toMatch(/data-task="t1" data-state="done">✓ Done · 1 rock sample here · 1 of 1 </);
  });

  it('keeps an open task open when its sample was taken elsewhere: the count is what is in at the place', () => {
    at(-12, -48);
    secure([{ id: 1, kind: 'rock', site: null, x: 300, z: 300, into: 'pouch', atSec: 300 }]);
    expect(banner()).toMatch(/data-task="t1" data-state="elsewhere">Collect 1 rock sample here · 0 of 1/);
  });

  it('shows nothing before the place is reached, away from it, for a task left out, or while an alert is active', () => {
    at(-12, -48, ['HAB']);
    expect(banner()).toBe('');
    at(-11, -50 + 2 + 8.5);
    expect(banner()).toBe('');
    at(470, 560, ['HAB', 'P1 · task point']);   // t3 was left out of the plan
    expect(banner()).toBe('');
    at(-12, -48);
    useMissionStore.setState({ alerts: { 'dust-storm': { id: 'dust-storm', eventId: 'dust-storm', level: 'warning', text: 'Dust storm', active: true } } });
    expect(banner()).toBe('');
  });

  it('shows the place the crew stands at when two reached places are in reach (found in the browser: P2 read P1)', () => {
    const first = { ...P1, x: 510, z: 552 };
    const P2 = { ...P1, key: 'P2', label: 'P2', x: 493, z: 539, waypoint: 'P2 · task point' };
    const near = [
      { id: 't1', what: 'soil', count: 1, place: first, workSec: 240, kept: true, drop: null },
      { id: 't2', what: 'photo', count: 1, place: P2, workSec: 120, kept: true, drop: null },
    ];
    useMissionStore.setState((s) => ({ mode: 'walk', route: { ...s.route, tasks: near, visited: ['HAB', 'P1 · task point', 'P2 · task point'] }, navigation: { ...s.navigation, x: 500.4, z: 544.4 } }));
    const html = banner();   // 12 m from P1 and 9 m from P2: both in reach
    expect(html).toContain('data-task-place="P2"');
    expect(html).toContain('Take 1 photo here · 0 of 1');
    expect(html).not.toContain('soil');
    expect(renderToStaticMarkup(<SamplingChecklist />)).toContain('data-tasks="t2">Task · 1 photo · 0 of 1</div>');
  });

  it('shows nothing for a goal without tasks', () => {
    useMissionStore.setState((s) => ({ mode: 'walk', route: { ...s.route, tasks: [], visited: ['HAB', 'S1 · light-toned patch'] }, navigation: { ...s.navigation, x: 493, z: 539 } }));
    expect(banner()).toBe('');
  });

  it('adds one caption line to the sampling panel near a kept task place, with the same count, and none elsewhere', () => {
    at(-12, -48, ['HAB']);   // the line does not wait for the arrival: it counts while the crew works near the place
    secure([{ id: 1, kind: 'rock', site: 'Bright Angel', x: -11.5, z: -49, into: 'pouch', atSec: 300 }]);
    const html = renderToStaticMarkup(<SamplingChecklist />);
    // in the "Last" line's slot and style, so the panel keeps its height
    expect(html).toContain('<div class="hud-caption hud-sampling-last" data-tasks="t1 t2">Task · 1 rock sample · 1 of 1; 2 photos · 0 of 2</div>');
    expect(html).not.toContain('LAST');
    at(200, 200);
    expect(renderToStaticMarkup(<SamplingChecklist />)).not.toContain('Task ·');
    expect(renderToStaticMarkup(<SamplingChecklist />)).toContain('LAST · Bright Angel chips');
    at(470, 560);   // the left-out task's place
    expect(renderToStaticMarkup(<SamplingChecklist />)).not.toContain('Task ·');
  });

  it('speaks Spanish', () => {
    at(-12, -48);
    setLanguage('es');
    const html = banner();
    expect(html).toContain('Tarea · Bright Angel');
    expect(html).toContain('Recoge 1 muestra de roca aquí · 0 de 1 · +1 más');
    secure([{ id: 1, kind: 'rock', site: 'Bright Angel', x: -11.5, z: -49, into: 'pouch', atSec: 300 }]);
    expect(banner()).toContain('Toma 2 fotos aquí · 0 de 2');
    expect(catalogs.es['taskwalk.done']).not.toBe(catalogs.en['taskwalk.done']);
  });
});
