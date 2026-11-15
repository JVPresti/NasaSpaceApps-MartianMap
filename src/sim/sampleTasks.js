/**
 * Sampling tasks (#352): what the crew sets out to collect, where and how many, for the "Collect samples" goal of the
 * mission table (src/sim/missionNeeds.js, objective 'samples').
 *
 * A task is `{ id, what, count, place }`:
 * - id: 't1', 't2' or 't3' (up to three tasks);
 * - what: 'photo' (a photo record), 'soil' (a scoop of soil, sample kind 'ground' in src/state/sampling.js) or 'rock'
 *   (a loose rock, sample kind 'rock'): what the walk can already do (src/engine/sampling.js);
 * - count: 1 to 3;
 * - place: a known stop of public/data/stops.json (`{ type: 'stop', stopId }`) or a point the crew clicked on the table
 *   map (`{ type: 'point', id: 'P1' | 'P2' | 'P3', x, z }`, metres, engine frame).
 *
 * The tasks live in the store's needs (needs.tasks) and lock with them at Begin EVA. The planner routes to their places
 * (missionNeeds.planFromNeeds); the walk and the debrief count what was collected there (src/sim/taskProgress.js).
 *
 * Plain JavaScript with no React and no three.js: it runs in the planner worker and in tests.
 */

/** @typedef {{ type: 'stop', stopId: string } | { type: 'point', id: 'P1'|'P2'|'P3', x: number, z: number }} TaskPlace */
/** @typedef {{ id: 't1'|'t2'|'t3', what: 'photo'|'soil'|'rock', count: 1|2|3, place: TaskPlace }} Task */
/**
 * @typedef {{ key: string, type: 'stop'|'point', stopId: string|null, x: number, z: number, radiusM: number,
 *   label: string, waypoint: string, reason: object|null }} ResolvedPlace
 */

export const TASK_KINDS = Object.freeze(['photo', 'soil', 'rock']);
export const MAX_TASKS = 3;
export const COUNT_RANGE = Object.freeze([1, 3]);
export const TASK_IDS = Object.freeze(['t1', 't2', 't3']);
export const POINT_IDS = Object.freeze(['P1', 'P2', 'P3']);

/**
 * Arrival radius of a clicked point (SIM, our choice, PO Q3): a clicked place is a patch of ground, as the light-toned
 * patch of the first sortie (stops.json route_stops, 8 m), not a single rock. Metres.
 */
export const POINT_RADIUS_M = 8;

/** Arrival radius of a known stop without its own: the waypoint runner's default (waypointRunner.ARRIVAL_RADIUS_M). */
export const STOP_RADIUS_DEFAULT_M = 5;

/**
 * Work per item, for a pair of astronauts (SIM, our estimate). A solo crew takes CREW_SETTINGS[1].workFactor (1.5)
 * times as long, as at any stop. A task at a known stop uses this table, never the stop's work_time_s (PO Q4): the
 * crew's task sets the work, not the stop. Seconds.
 */
export const TASK_WORK_SEC = Object.freeze({ photo: 120, soil: 240, rock: 480 });

/** Why each work time is what it is: one sentence per kind, shown in the tasks.workSec source (src/data/provenance.js). */
export const TASK_WORK_NOTES = Object.freeze({
  photo: 'photo 120 s: frame the place with a scale, one context shot and a note; each of the four checklist steps at Bright Angel is about 4 min (stops.json), and a photo with no sample is half of that.',
  soil: 'soil 240 s: photo, scoop, texture look, bag and seal for one scoop; twice the sortie\'s 2 min training stop, which skips the look and the seal check.',
  rock: 'rock 480 s: find a loose rock of 0.35 m or more in reach, chip it, photo, bag and seal; about half the 15 min Bright Angel checklist, which documents a layered outcrop before its one scoop.',
});

/**
 * The tasks a crew starts with when it chooses "Collect samples" (PO Q1): one rock sample at Bright Angel, so the goal
 * has a route at once (store.setNeeds pre-fills it while the list is empty).
 */
export const DEFAULT_TASKS = Object.freeze([
  Object.freeze({ id: 't1', what: 'rock', count: 1, place: Object.freeze({ type: 'stop', stopId: 'bright-angel' }) }),
]);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const centi = (value) => Math.round(value * 100) / 100;

/**
 * The key of a place: the stop id for a known stop, the point id ('P1' ...) for a clicked point.
 * @param {TaskPlace} place
 * @returns {string}
 */
export function placeKey(place) {
  return place?.type === 'point' ? String(place.id) : String(place?.stopId);
}

/** A clean copy of one place; throws on a bad one. Point positions are rounded to 0.01 m. */
function cleanPlace(place) {
  if (!place || typeof place !== 'object') throw new Error('task place must be an object');
  if (place.type === 'stop') {
    if (typeof place.stopId !== 'string' || !place.stopId) throw new Error('a stop place needs a stopId');
    return { type: 'stop', stopId: place.stopId };
  }
  if (place.type === 'point') {
    if (!POINT_IDS.includes(place.id)) throw new Error(`a point place needs an id of ${POINT_IDS.join(', ')}`);
    if (!finite(place.x) || !finite(place.z)) throw new Error('a point place needs finite x and z');
    return { type: 'point', id: place.id, x: centi(place.x), z: centi(place.z) };
  }
  throw new Error('task place type must be stop or point');
}

/** A clean copy of one task; throws on a bad one. The count is rounded and clamped to 1..3. */
function cleanTask(task) {
  if (!task || typeof task !== 'object') throw new Error('a task must be an object');
  if (!TASK_IDS.includes(task.id)) throw new Error(`task id must be one of ${TASK_IDS.join(', ')}`);
  if (!TASK_KINDS.includes(task.what)) throw new Error(`task what must be one of ${TASK_KINDS.join(', ')}`);
  if (!finite(task.count)) throw new Error('task count must be a finite number');
  const count = Math.max(COUNT_RANGE[0], Math.min(COUNT_RANGE[1], Math.round(task.count)));
  return { id: task.id, what: task.what, count, place: cleanPlace(task.place) };
}

/**
 * Check a task list. Returns a clean copy; throws on: not an array, more than three tasks, a duplicate id, an unknown
 * what, a bad place, or one point id at two positions. Counts are rounded and clamped to 1..3, positions rounded to
 * 0.01 m.
 * @param {Array<Task>} list
 * @returns {Array<Task>}
 */
export function checkTasks(list) {
  if (!Array.isArray(list)) throw new Error('tasks must be an array');
  if (list.length > MAX_TASKS) throw new Error(`at most ${MAX_TASKS} tasks`);
  const ids = new Set();
  const points = new Map();
  return list.map((entry) => {
    const task = cleanTask(entry);
    if (ids.has(task.id)) throw new Error(`duplicate task id ${task.id}`);
    ids.add(task.id);
    if (task.place.type === 'point') {
      const at = points.get(task.place.id);
      if (at && (at.x !== task.place.x || at.z !== task.place.z)) throw new Error(`point ${task.place.id} at two positions`);
      points.set(task.place.id, task.place);
    }
    return task;
  });
}

/**
 * The planner's task list: undefined gives DEFAULT_TASKS (a plan from the objective alone), anything else not an array
 * gives none; otherwise the valid entries only (a duplicate id, or a point id already at another position, is left
 * out), the first three, cleaned.
 * @param {unknown} list needs.tasks
 * @returns {Array<Task>}
 */
export function normaliseTasks(list) {
  if (list === undefined) return checkTasks(DEFAULT_TASKS);
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (out.length >= MAX_TASKS) break;
    try {
      checkTasks([...out, entry]);
      out.push(cleanTask(entry));
    } catch {
      // an invalid entry is left out
    }
  }
  return out;
}

/**
 * Key of the tasks that change the plan: '' unless the objective is 'samples', so the three other goals plan as before.
 * @param {{ objective?: string, tasks?: unknown }} needs
 * @returns {string}
 */
export function tasksKey(needs) {
  if (needs?.objective !== 'samples') return '';
  return normaliseTasks(needs.tasks)
    .map((task) => `${task.id}:${task.what}:${task.count}:${placeKey(task.place)}${task.place.type === 'point' ? `@${task.place.x}:${task.place.z}` : ''}`)
    .join(',');
}

/** The lowest free task id, or null when the list is full. */
export function nextTaskId(list) {
  const used = new Set((Array.isArray(list) ? list : []).map((task) => task?.id));
  return TASK_IDS.find((id) => !used.has(id)) ?? null;
}

/** The lowest point id the list's points do not use, or null when all three are in use. */
export function nextPointId(list) {
  const used = new Set((Array.isArray(list) ? list : []).filter((task) => task?.place?.type === 'point').map((task) => task.place.id));
  return POINT_IDS.find((id) => !used.has(id)) ?? null;
}

/**
 * The list with one task added at the end (pure). A task without an id takes nextTaskId; a full list comes back as it
 * was. The store's setTasks checks the result.
 */
export function withTask(list, task) {
  const base = Array.isArray(list) ? list : [];
  const id = task?.id ?? nextTaskId(base);
  if (!id || base.length >= MAX_TASKS) return base.slice();
  return [...base, { ...task, id }];
}

/** The list with one task changed (pure): the patch's fields replace the task's, its id stays. */
export function patchTask(list, id, patch) {
  return (Array.isArray(list) ? list : []).map((task) => (task?.id === id ? { ...task, ...patch, id } : task));
}

/** The list without one task (pure). */
export function withoutTask(list, id) {
  return (Array.isArray(list) ? list : []).filter((task) => task?.id !== id);
}

/**
 * Seconds of work a task plans: the work per item (TASK_WORK_SEC) times the count, times the crew's work factor (1.5
 * for a solo crew, CREW_SETTINGS in missionNeeds.js).
 * @param {{ what: string, count: number }} task
 * @param {number} [workFactor]
 */
export function taskWorkSec(task, workFactor = 1) {
  return Math.round((TASK_WORK_SEC[task?.what] ?? 0) * (finite(task?.count) ? task.count : 0) * (finite(workFactor) ? workFactor : 1));
}

/**
 * Where a task goes, for the planner and the walk: a known stop from the candidates (stops.routeStopCandidates), with
 * its position, name, waypoint name, arrival radius and reason line; or a clicked point, an 8 m patch named by its id.
 * Null for a stop id the candidates do not have.
 * @param {TaskPlace} place
 * @param {Array<{ id: string, name: string, waypoint: string, x: number, z: number, arrivalRadiusM?: number,
 *   reason?: object | null }>} candidates
 * @returns {ResolvedPlace | null}
 */
export function resolvePlace(place, candidates) {
  if (place?.type === 'point') {
    if (!finite(place.x) || !finite(place.z)) return null;
    return {
      key: place.id, type: 'point', stopId: null, x: place.x, z: place.z, radiusM: POINT_RADIUS_M,
      label: place.id, waypoint: `${place.id} · task point`, reason: null,
    };
  }
  const stop = (Array.isArray(candidates) ? candidates : []).find((candidate) => candidate?.id === place?.stopId);
  if (!stop) return null;
  return {
    key: stop.id, type: 'stop', stopId: stop.id, x: stop.x, z: stop.z,
    radiusM: finite(stop.arrivalRadiusM) ? stop.arrivalRadiusM : STOP_RADIUS_DEFAULT_M,
    label: stop.name, waypoint: stop.waypoint, reason: stop.reason ?? null,
  };
}
