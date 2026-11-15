import { afterEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { setLanguage } from '../i18n/index.js';
import { taskProgress } from '../sim/taskProgress.js';
import TaskRows from './TaskRows.jsx';

afterEach(() => setLanguage('en'));

const BRIGHT_ANGEL = { key: 'bright-angel', type: 'stop', stopId: 'bright-angel', x: -11, z: -50, radiusM: 2, label: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', reason: null };
const P1 = { key: 'P1', type: 'point', stopId: null, x: 470, z: 560, radiusM: 8, label: 'P1', waypoint: 'P1 · task point', reason: null };
const CHEYAVA = { key: 'cheyava-falls', type: 'stop', stopId: 'cheyava-falls', x: 0, z: 0, radiusM: 2, label: 'Cheyava Falls', waypoint: 'Cheyava Falls', reason: null };
// The summary's rows, as eva.js freezes them: a rock done at Bright Angel, two soil scoops done elsewhere for P1, and a
// photo at Cheyava Falls not done and left out of the plan.
const ROWS = taskProgress([
  { id: 't1', what: 'rock', count: 1, place: BRIGHT_ANGEL, kept: true },
  { id: 't2', what: 'soil', count: 2, place: P1, kept: true },
  { id: 't3', what: 'photo', count: 1, place: CHEYAVA, kept: false },
], {
  samples: [
    { id: 1, kind: 'rock', site: 'Bright Angel', x: -11.6, z: -49.0, into: 'pouch', atSec: 750 },
    { id: 2, kind: 'ground', site: null, x: 474, z: 563, into: 'pouch', atSec: 900 },
    { id: 3, kind: 'ground', site: null, x: 500, z: 580, into: 'case', atSec: 960 },
  ],
  photoLog: [],
});

const rowOf = (html, id) => html.match(new RegExp(`<li class="debrief-entry" data-task="${id}"[\\s\\S]*?</li>`))[0];

describe('the debrief task rows (#352)', () => {
  it('lists each task in the mission log\'s row style: done, done elsewhere, not done and left out of the plan', () => {
    const html = renderToStaticMarkup(<TaskRows tasks={ROWS} />);
    expect(html).toMatch(/^<section class="debrief-log-section"[^>]*><h3 id="debrief-tasks-title" class="debrief-section-title">Sampling tasks<\/h3><ol class="debrief-log">/);

    const done = rowOf(html, 't1');
    expect(done).toContain('data-state="done"');
    expect(done).toContain('<span class="debrief-time">T+0:12:30</span>');
    expect(done).toContain('Done · 1 rock sample · Bright Angel');
    expect(done).toContain('1 of 1');
    expect(done).toContain('1.2 m from the place');
    expect(done).toMatch(/data-tag="SIM"/);

    const elsewhere = rowOf(html, 't2');
    expect(elsewhere).toContain('Done elsewhere · 2 soil samples · P1');
    expect(elsewhere).toContain('<span class="debrief-time">T+0:16:00</span>');
    expect(elsewhere).toContain('1 of 2 at the place, 1 elsewhere');
    expect(elsewhere).toContain('36 m from the place');
    expect(elsewhere).not.toContain('left out');

    const open = rowOf(html, 't3');
    expect(open).toContain('Not done · 1 photo · Cheyava Falls');
    expect(open).toContain('<span class="debrief-time">—</span>');
    expect(open).toContain('0 of 1');
    expect(open).not.toContain('from the place');
    expect(open).toContain('left out of the plan');
  });

  it('shows a photo task only as Done or Not done, never done elsewhere (decision 11): the browser verifier\'s case', () => {
    // soil x1 at P1 and photo x1 at Bright Angel; one soil sample at P1 with its photo step, nobody at Bright Angel
    const rows = taskProgress([
      { id: 't1', what: 'soil', count: 1, place: P1, kept: true },
      { id: 't2', what: 'photo', count: 1, place: BRIGHT_ANGEL, kept: true },
    ], { samples: [{ id: 1, kind: 'ground', site: null, x: 471, z: 561, into: 'pouch', atSec: 60 }], photoLog: [{ x: 471, z: 561, kind: 'ground', site: null, atSec: 50 }] });
    const html = renderToStaticMarkup(<TaskRows tasks={rows} />);
    const photoRow = rowOf(html, 't2');
    expect(photoRow).toContain('data-state="open"');
    expect(photoRow).toContain('<p class="debrief-entry-title">Not done · 1 photo · Bright Angel<span');
    expect(photoRow).toContain('<p class="debrief-entry-meta"><span>0 of 1</span></p>');   // no split count, no distance
    expect(photoRow).toContain('<span class="debrief-time">—</span>');
  });

  it('renders nothing without tasks, so the goals without them keep their debrief', () => {
    expect(renderToStaticMarkup(<TaskRows tasks={[]} />)).toBe('');
    expect(renderToStaticMarkup(<TaskRows />)).toBe('');
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const html = renderToStaticMarkup(<TaskRows tasks={ROWS} />);
    expect(html).toContain('Tareas de muestreo');
    expect(rowOf(html, 't1')).toContain('Hecha · 1 muestra de roca · Bright Angel');
    expect(rowOf(html, 't1')).toContain('a 1,2 m del lugar');
    expect(rowOf(html, 't2')).toContain('Hecha en otro lugar · 2 muestras de suelo · P1');
    expect(rowOf(html, 't3')).toContain('fuera del plan');
  });
});
