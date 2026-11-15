/**
 * Sampling task progress (#352): what the walk collected for each task of the approved plan, and where.
 *
 * A task (src/sim/sampleTasks.js) asks for `count` items of one kind at one place. The records are what the sampling
 * bridge keeps (src/state/sampling.js):
 * - photo: `sampling.photoLog`, every helmet photo with the point it was aimed at;
 * - soil: `sampling.samples` of kind 'ground', secured in a container (bag or case), at the scoop's target point;
 * - rock: `sampling.samples` of kind 'rock', the same.
 *
 * A record counts AT a place when its point lies within the place's arrival radius plus SAMPLE_REACH_M (2 m, the scoop's
 * reach: the same rule as the first sortie's "sample secured at the stop", src/sim/missions.js), or, at a known stop,
 * when the engine named the record's site after that stop (`site` 'Bright Angel': a chip of the outcrop itself, at any
 * distance; the outcrop is centred 4.2 m from its waypoint and is 6.7 m long, more than its 4 m count radius). Counting
 * has two passes, and each record counts once:
 *   1. tasks in list order take the unused matching records at their place, oldest first, up to their count (`here`);
 *   2. tasks still short take unused matching records anywhere, oldest first, up to what is missing (`elsewhere`).
 * The tasks the plan kept go through both passes first, then the tasks it left out, so a left-out task never takes a
 * record from a kept one.
 * A task is 'done' with all its items at the place, 'elsewhere' when the count is complete only with records from
 * elsewhere, and 'open' otherwise. Nothing holds the crew at a place: an open task simply stays open.
 *
 * Callers: src/mission/useTaskProgress.js for the walk (the banner at the place and the sampling panel's line) and
 * src/state/eva.js for the debrief's frozen rows. No store field: the rows are always computed from the records.
 *
 * Plain JavaScript with no React and no three.js.
 */
import { SAMPLE_REACH_M } from './missions.js';

/** How near a place the walk shows its task (the banner, the sampling panel's line): its radius plus this. Metres. */
export const TASK_NEAR_M = 8;

const SAMPLE_KIND = Object.freeze({ soil: 'ground', rock: 'rock' });

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const timeOf = (record) => (finite(record?.atSec) ? record.atSec : Infinity);

/**
 * The records that can count for a kind of task, oldest first (a record without a time last, in its own order).
 * @param {'photo' | 'soil' | 'rock'} what
 * @param {{ samples?: object[], photoLog?: object[] }} sampling the store's sampling slice (photoLog may be missing)
 * @returns {Array<{ x: number, z: number, atSec: number | null }>}
 */
export function taskRecords(what, { samples = [], photoLog = [] } = {}) {
  const list = what === 'photo'
    ? (Array.isArray(photoLog) ? photoLog : [])
    : (Array.isArray(samples) ? samples : []).filter((s) => s?.kind === SAMPLE_KIND[what]);
  return list
    .filter((r) => finite(r?.x) && finite(r?.z))
    .map((r, order) => ({ r, order }))
    .sort((a, b) => timeOf(a.r) - timeOf(b.r) || a.order - b.order)
    .map(({ r }) => r);
}

/** A row's place from a task's place (a ResolvedPlace from the planner); positions null when the place is unknown. */
function rowPlace(place) {
  const known = finite(place?.x) && finite(place?.z);
  const key = place?.key ?? (place?.type === 'point' ? place?.id : place?.stopId) ?? null;
  return {
    key,
    label: typeof place?.label === 'string' && place.label ? place.label : key,
    x: known ? place.x : null,
    z: known ? place.z : null,
    radiusM: known ? (finite(place?.radiusM) ? place.radiusM : 0) : null,
    waypoint: typeof place?.waypoint === 'string' ? place.waypoint : null,
  };
}

/** The site name the engine gives a record taken at this place: a known stop's name ('Bright Angel'), else null. */
function siteOf(place) {
  const stop = place?.type === 'stop' || (place?.type === undefined && !!place?.stopId);
  return stop && typeof place.label === 'string' && place.label ? place.label : null;
}

const distance = (place, record) => Math.hypot(record.x - place.x, record.z - place.z);
const atPlace = (place, site, record) => (site !== null && record.site === site)
  || (place.x !== null && distance(place, record) <= place.radiusM + SAMPLE_REACH_M);

/**
 * One row per task, in list order: what was collected at its place and elsewhere.
 * @param {Array<{ id: string, what: string, count: number, kept?: boolean, place: object | null }>} tasks route.tasks
 *   (kept and dropped), or the debrief plan's copy of it
 * @param {{ samples?: object[], photoLog?: object[] }} sampling
 * @returns {Array<{ id: string, what: string, count: number, kept: boolean,
 *   place: { key: string | null, label: string | null, x: number | null, z: number | null, radiusM: number | null, waypoint: string | null },
 *   here: number, elsewhere: number, state: 'done' | 'elsewhere' | 'open', atSec: number | null, distanceM: number | null }>}
 */
export function taskProgress(tasks, sampling = {}) {
  const list = Array.isArray(tasks) ? tasks.filter((task) => task && typeof task === 'object') : [];
  const pools = new Map();
  const pool = (what) => {
    if (!pools.has(what)) pools.set(what, taskRecords(what, sampling ?? {}).map((record) => ({ record, used: false })));
    return pools.get(what);
  };
  const rows = list.map((task) => ({
    task,
    place: rowPlace(task.place),
    site: siteOf(task.place),
    count: finite(task.count) && task.count > 0 ? Math.round(task.count) : 1,
    here: [],
    elsewhere: [],
  }));

  const count = (group) => {
    // Pass 1: at the place first, every task of the group in list order.
    for (const row of group) {
      for (const item of pool(row.task.what)) {
        if (row.here.length >= row.count) break;
        if (!item.used && atPlace(row.place, row.site, item.record)) { item.used = true; row.here.push(item.record); }
      }
    }
    // Pass 2: what is still missing, from anywhere.
    for (const row of group) {
      for (const item of pool(row.task.what)) {
        if (row.here.length + row.elsewhere.length >= row.count) break;
        if (!item.used) { item.used = true; row.elsewhere.push(item.record); }
      }
    }
  };
  // The tasks the plan kept count first, both passes, then the ones it left out: a left-out task never takes a record a
  // kept one could count. The rows still come back in list order.
  count(rows.filter((row) => row.task.kept !== false));
  count(rows.filter((row) => row.task.kept === false));

  return rows.map(({ task, place, count, here, elsewhere }) => {
    const counted = [...here, ...elsewhere];
    const complete = counted.length >= count;
    const times = counted.map((r) => r.atSec).filter(finite);
    return {
      id: task.id,
      what: task.what,
      count,
      kept: task.kept !== false,
      place,
      here: here.length,
      elsewhere: elsewhere.length,
      state: here.length >= count ? 'done' : complete ? 'elsewhere' : 'open',
      // the time the last counted record was secured: when the task became complete
      atSec: complete && times.length > 0 ? Math.max(...times) : null,
      distanceM: place.x !== null && counted.length > 0 ? Math.max(...counted.map((r) => distance(place, r))) : null,
    };
  });
}

/**
 * The rows whose place is near a position: within the place's radius plus TASK_NEAR_M. The position is the
 * navigation estimate the interface reads, so this is an estimate too.
 * @param {ReturnType<typeof taskProgress>} rows
 * @param {{ x?: number | null, z?: number | null } | null} position
 */
export function tasksAt(rows, position) {
  if (!Array.isArray(rows) || !finite(position?.x) || !finite(position?.z)) return [];
  return rows.filter((row) => row?.place && finite(row.place.x) && finite(row.place.z)
    && Math.hypot(position.x - row.place.x, position.z - row.place.z) <= (row.place.radiusM ?? 0) + TASK_NEAR_M);
}
