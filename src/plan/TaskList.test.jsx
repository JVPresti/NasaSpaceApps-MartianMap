import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeStopCandidates } from '../data/stops.js';
import { setLanguage } from '../i18n/index.js';

// The list reads the store's tasks (needs.tasks) and its sources for the tags; each test sets the snapshot it renders.
// The cost grid and the pick are fixtures: the rock warning reads the grid's density, and a zustand store renders its
// initial state on the server, so the pick the list shows is set here.
const mock = vi.hoisted(() => ({ state: null, grid: null, pick: { taskId: null, note: null } }));
vi.mock('../state/store.js', () => ({
  useMissionStore: Object.assign((selector) => selector(mock.state), { getState: () => mock.state }),
  setTasks: vi.fn(),
}));
vi.mock('./useTaskPlace.js', async (importOriginal) => ({ ...(await importOriginal()), useCostGrid: () => mock.grid, usePickState: () => mock.pick }));

const { default: TaskList } = await import('./TaskList.jsx');
const { addedTask, placeTask } = await import('./useTaskPlace.js');

const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8'));
const candidates = routeStopCandidates(readJson('public/data/stops.json'));
const rock = { id: 't1', what: 'rock', count: 1, place: { type: 'stop', stopId: 'bright-angel' } };
const photo = { id: 't2', what: 'photo', count: 2, place: { type: 'point', id: 'P1', x: 560, z: 574 } };
const soil = { id: 't3', what: 'soil', count: 1, place: { type: 'stop', stopId: 'sortie' } };
// a plan that kept the rock at Bright Angel (number 2, after the photo point) and the photos at P1, and dropped the soil
const waypoints = [
  { name: 'HAB', x: 535.1, z: 574.1 },
  { name: 'P1 · task point', label: 'P1', x: 560, z: 574, workSec: 240, place: 'P1', tasks: ['t2'] },
  { name: 'WP3 · Bright Angel outcrop', label: 'Bright Angel', x: -11, z: -50, workSec: 480, stopId: 'bright-angel', place: 'bright-angel', tasks: ['t1'] },
];
const legs = [{ distanceM: 25, workSec: 240 }, { distanceM: 900, workSec: 480 }];
const explain = [{ clear: true }, { clear: false, block: 'steep', extraM: 40, extraSec: 30 }];
const planTasks = [
  { id: 't1', what: 'rock', count: 1, kept: true, drop: null },
  { id: 't2', what: 'photo', count: 2, kept: true, drop: null },
  { id: 't3', what: 'soil', count: 1, kept: false, drop: { limit: 'time', overSec: 240 } },
];
const render = (tasks, props = {}, needs = {}) => {
  mock.state = { needs: { objective: 'samples', tasks, locked: false, ...needs }, sources: {} };
  return renderToStaticMarkup(<TaskList waypoints={waypoints} legs={legs} explain={explain} planTasks={planTasks} candidates={candidates} {...props} />);
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const rowOf = (html, k) => html.split('<li')[k + 1] ?? '';
const rockyGrid = (byte) => ({ width: 1422.5, depth: 1500, density: new Uint8Array(256 * 256).fill(byte), densityN: 256 });

afterEach(() => { setLanguage('en'); mock.grid = null; mock.pick = { taskId: null, note: null }; });

describe('sampling task list', () => {
  it('heads the panel with the two tags of the stop list and an "Add task" link the demo can find', () => {
    const html = render([rock]);
    expect(text(html)).toContain('Tasks');
    expect(html).toContain('src-tag-sim');
    expect(html).toContain('src-tag-derived');
    expect(html).toMatch(/<button type="button" class="table-link" data-task-add=""[^>]*>Add task<\/button>/);
  });

  it('gives each task a row of the stop list: what, how many and where in the needs panel\'s selects, and Remove', () => {
    const html = render([rock, photo, soil]);
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(html).toContain('<ol class="table-stops">');
    expect(html.match(/class="needs-select/g)).toHaveLength(9);
    const second = rowOf(html, 1);
    expect(second).toMatch(/<option value="photo" selected="">Photo<\/option>/);
    expect(second).toMatch(/<option value="2" selected="">×2<\/option>/);
    expect(second).toMatch(/data-task-where="t2"/);
    expect(second).toMatch(/<option value="point:P1" selected="">P1 · map point<\/option>/);
    expect(second).toContain('<option value="pick">Point on the map…</option>');
    expect(rowOf(html, 0)).toMatch(/<option value="stop:bright-angel" selected="">Bright Angel<\/option>/);
    for (const name of ['Cheyava Falls', 'Light-toned patch']) expect(rowOf(html, 0)).toContain(`>${name}</option>`);
    expect(second).toContain('aria-label="Remove task 2"');
  });

  it('shows each kept task\'s place number on the map and its stop line, naming the task the leg serves', () => {
    const html = render([rock, photo, soil]);
    expect(rowOf(html, 0)).toContain('<code>2</code>');
    expect(text(rowOf(html, 0))).toContain('For 1 rock sample · 8 min work');
    expect(rowOf(html, 1)).toContain('<code>1</code>');
    expect(text(rowOf(html, 1))).toContain('For 2 photos · 4 min work · straight line clear');
  });

  it('says why a task was left out, with a dash for its number', () => {
    const third = rowOf(render([rock, photo, soil]), 2);
    expect(third).toMatch(/^ class="dropped"/);
    expect(third).toContain('<code>–</code>');
    expect(text(third)).toContain('Left out: 4 min over your time');
  });

  it('waits for the plan before it numbers a new task', () => {
    const fresh = { id: 't3', what: 'soil', count: 1, place: { type: 'stop', stopId: 'sortie' } };
    const row = rowOf(render([rock, fresh], { planTasks: planTasks.slice(0, 1) }), 1);
    expect(row).toContain('<code>–</code>');
    expect(row).not.toContain('table-stop-why');
  });

  it('allows three tasks, and says so on the disabled "Add task"', () => {
    expect(render([rock, photo, soil])).toMatch(/data-task-add="" disabled="" title="Up to three tasks"/);
    expect(render([rock])).not.toMatch(/data-task-add="" disabled/);
  });

  it('says how to add a task when the list is empty', () => {
    expect(text(render([]))).toContain('No sampling task yet: add one to plan a route.');
  });

  it('tells the crew how to place a task while a pick is on, with a way to cancel', () => {
    mock.pick = { taskId: 't2', note: null };
    const html = render([rock, photo]);
    expect(text(rowOf(html, 1))).toContain('Click the map to place task 2. Esc cancels.');
    expect(rowOf(html, 1)).toContain('>Cancel</button>');
    expect(rowOf(html, 0)).not.toContain('Click the map');
  });

  it('shows a refused click under its task in the caution colour, with the place check\'s tag', () => {
    mock.pick = { taskId: 't1', note: { taskId: 't1', tone: 'caution', text: 'Not placed: no walkable route from the airlock reaches it.', tag: 'tasks.place' } };
    const row = rowOf(render([rock]), 0);
    expect(row).toMatch(/<p class="table-note tone-caution">Not placed: no walkable route from the airlock reaches it\.<span[^>]*src-tag-derived/);
  });

  it('warns a rock task over little rock cover, with the Rocks layer\'s tag and its caveat', () => {
    mock.grid = rockyGrid(0);
    const html = render([rock, { ...photo, what: 'photo' }]);
    const warning = rowOf(html, 0);
    expect(warning).toContain('table-note tone-caution');
    expect(text(warning)).toContain('Little rock cover here: 0.08 on the Rocks layer, under 0.2. A loose rock within reach is unlikely. The layer is a brightness proxy, not a count of rocks.');
    expect(warning).toContain('src-tag-derived');
    expect(rowOf(html, 1)).not.toContain('Little rock cover');
    mock.grid = rockyGrid(255);
    expect(render([rock])).not.toContain('Little rock cover');
  });

  it('locks every control once the needs are locked', () => {
    const html = render([rock, photo], {}, { locked: true });
    expect(html.match(/disabled=""/g)).toHaveLength(1 + 2 * 4);
  });

  it('speaks Spanish', () => {
    setLanguage('es');
    const t = text(render([rock, photo, soil]));
    for (const label of ['Tareas', 'Añadir tarea', 'Roca', 'Foto', 'Suelo', 'Punto en el mapa…', 'Quitar', 'Zona de tono claro', 'Para 1 muestra de roca', 'Fuera: ']) expect(t).toContain(label);
  });
});

describe('adding and placing a task', () => {
  it('adds the first of soil, photo and rock not yet on the list, one of it, at the last row\'s place', () => {
    expect(addedTask([rock])).toEqual({ what: 'soil', count: 1, place: rock.place });
    expect(addedTask([rock, soil])).toEqual({ what: 'photo', count: 1, place: soil.place });
    expect(addedTask([soil, photo])).toEqual({ what: 'rock', count: 1, place: photo.place });
    expect(addedTask([])).toMatchObject({ what: 'soil', place: { type: 'stop', stopId: 'bright-angel' } });
  });

  // 21 x 21 nodes 2 m apart around the origin, a blocked column at x = 8 m
  const n = 21;
  const blocked = new Uint8Array(n * n);
  for (let j = 0; j < n; j += 1) blocked[j * n + 14] = 1;
  const grid = { n, width: 40, depth: 40, blocked, baseBlocked: blocked, slopes: new Float32Array(n * n).fill(5).map((v, k) => (blocked[k] ? 31 : v)), density: new Uint8Array(16).fill(255), densityN: 4 };
  const start = { x: -16, z: 0 };
  const near = [{ id: 'bright-angel', name: 'Bright Angel', waypoint: 'WP3', x: -10, z: -10 }];

  it('makes a click a new point with the next free id, and the task\'s own point id is free again', () => {
    const tasks = [{ ...rock, place: { type: 'point', id: 'P1', x: 0, z: 0 } }, { ...photo, place: { type: 'point', id: 'P2', x: 2, z: 2 } }];
    const out = placeTask(grid, { x: -4, z: 12 }, { taskId: 't1', tasks, start, candidates: near });
    expect(out.done).toBe(true);
    expect(out.tasks[0].place).toEqual({ type: 'point', id: 'P1', x: -4, z: 12 });
    expect(out.note).toBeNull();
  });

  it('says when a click takes a known stop or an existing point', () => {
    const out = placeTask(grid, { x: -8, z: -10 }, { taskId: 't1', tasks: [rock], start, candidates: near });
    expect(out.tasks[0].place).toEqual({ type: 'stop', stopId: 'bright-angel' });
    expect(out.note.text).toBe('Task 1 takes Bright Angel, 2 m from the click.');
  });

  it('refuses a click past a steep band with its reason, and keeps the pick on', () => {
    const out = placeTask(grid, { x: 12, z: 0 }, { taskId: 't1', tasks: [rock], start, candidates: near });
    expect(out).toMatchObject({ tasks: null, done: false, note: { tone: 'caution', tag: 'tasks.place', text: 'Not placed: no walkable route from the airlock reaches it.' } });
    const steep = placeTask({ ...grid, blocked: new Uint8Array(n * n).fill(1), baseBlocked: new Uint8Array(n * n).fill(1), slopes: new Float32Array(n * n).fill(31) }, { x: 0, z: 0 }, { taskId: 't1', tasks: [rock], start, candidates: [] });
    expect(steep.note.text).toBe('Not placed: 31° there, over the 20° suit limit, with no walkable ground within 4 m.');
    expect(placeTask(grid, { x: 30, z: 0 }, { taskId: 't1', tasks: [rock], start, candidates: [] }).note.text).toBe('Not placed: that is off the site. Click inside the map.');
  });
});
