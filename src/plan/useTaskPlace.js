import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { loadCostGrid, loadDataFile } from '../data/dataFiles.js';
import { routeStopCandidates, STOPS_PATH } from '../data/stops.js';
import { formatNumber, t, translateText } from '../i18n/index.js';
import { COST_CONSTANTS } from '../sim/costGrid.js';
import { DEFAULT_TASKS, nextPointId, patchTask, resolvePlace, withoutTask } from '../sim/sampleTasks.js';
import { checkTaskPoint, SNAP_M } from '../sim/taskPlace.js';
import { setTasks, useMissionStore } from '../state/store.js';

// Placing a sampling task on the mission table map (#352). The task list (TaskList.jsx) starts a pick for one task; the
// map (MissionMap `picking`, `onPick`) sends the click back; the click is checked on the planner's own grid
// (src/sim/taskPlace.js) and becomes the task's place, or is refused with its reason. One pick at a time for the whole
// table, so the list and the map share it here rather than through props. Escape cancels it in a capture listener, as
// the map's stop window does, so it never reaches the pause menu.

/** The pick in progress: the task being placed, and the last word on a click (a refusal, or the place it took). */
const usePick = create(() => ({ taskId: null, note: null }));

const NONE = [];

/** Start placing a task: the next click on the map sets its place. */
export function startPick(taskId) {
  usePick.setState({ taskId, note: null });
}

/** Stop placing, leaving the task where it was. */
export function cancelPick() {
  usePick.setState({ taskId: null, note: null });
}

// A pick lasts only while the table is the "Collect samples" table: a change of goal or the needs locking at Begin EVA
// ends it, so its Escape listener never swallows a key and it never comes back with the goal. (The test files that
// replace the store module give a store without subscribe.)
useMissionStore.subscribe?.((s) => {
  if (usePick.getState().taskId && (s.needs?.objective !== 'samples' || s.needs?.locked === true)) cancelPick();
});

/** The order "Add task" tries the kinds in (PO, #352 section 12). */
const ADD_ORDER = ['soil', 'photo', 'rock'];

/**
 * The task "Add task" adds (PO, #352 section 12): the first of soil, photo and rock the list does not have yet, one of
 * it, at the place of the last row, so a second task is one click and the crew then changes what it wants. With no row
 * yet, at the place the goal opens with (DEFAULT_TASKS).
 * @param {Array<object>} tasks needs.tasks
 * @returns {{ what: string, count: number, place: object }}
 */
export function addedTask(tasks) {
  const what = ADD_ORDER.find((kind) => !tasks.some((task) => task.what === kind)) ?? ADD_ORDER[0];
  return { what, count: 1, place: tasks.at(-1)?.place ?? DEFAULT_TASKS[0].place };
}

/**
 * The points a click can take, once each, as checkTaskPoint takes them: those of the other tasks. A point only the task
 * being placed uses is left out, so the crew can move it a few metres; a point it shares still takes the click.
 */
function listPoints(tasks) {
  const points = new Map();
  for (const task of tasks) if (task?.place?.type === 'point') points.set(task.place.id, task.place);
  return [...points.values()];
}

/** The display name of a resolved place: the stop's name in the interface language, or the point's id. */
function placeName(place) {
  if (!place) return '';
  return place.type === 'stop' ? translateText(place.label) : place.label;
}

/**
 * What a click on the map means for the task being placed: checked on the grid, then set in the store (setTasks) with
 * a note when it took a known place or moved to walkable ground, or refused with the reason. Plain function, tested
 * with a grid and a list.
 * @param {object} grid the base cost grid
 * @param {{ x: number, z: number }} point the click, metres
 * @param {{ taskId: string, tasks: Array<object>, start: { x: number, z: number }, candidates: Array<object> }} context
 * @returns {{ tasks: Array<object> | null, note: { tone: 'caution' | null, text: string, tag: string | null } | null, done: boolean }}
 *   tasks: the new list, null when refused; done: the pick is over
 */
export function placeTask(grid, point, { taskId, tasks, start, candidates }) {
  const n = tasks.findIndex((task) => task.id === taskId) + 1;
  const result = checkTaskPoint(grid, point, { start, stops: candidates, points: listPoints(withoutTask(tasks, taskId)) });
  if (!result.ok) {
    const values = { slope: Number.isFinite(result.slopeDeg) ? formatNumber(result.slopeDeg, 0) : '–', limit: COST_CONSTANTS.SLOPE_LIMIT_DEG, snap: SNAP_M };
    return { tasks: null, note: { tone: 'caution', text: t(`tasktable.refuse.${result.reason}`, values), tag: 'tasks.place' }, done: false };
  }
  let place = result.place;
  let note = null;
  if (place.type === 'stop' || place.id) {
    note = { tone: null, text: t('tasktable.near', { n, place: placeName(resolvePlace(place, candidates)), m: formatNumber(result.snappedM, 0) }), tag: null };
  } else {
    place = { ...place, id: nextPointId(withoutTask(tasks, taskId)) };
    if (result.snappedM > 0) note = { tone: null, text: t('tasktable.snapped', { m: formatNumber(result.snappedM, 0), limit: COST_CONSTANTS.SLOPE_LIMIT_DEG }), tag: 'tasks.place' };
  }
  return { tasks: patchTask(tasks, taskId, { place }), note, done: true };
}

/** The base cost grid, once loaded (the planner's shared copy, dataFiles.loadCostGrid); null until then. */
export function useCostGrid() {
  const [grid, setGrid] = useState(null);
  useEffect(() => {
    let alive = true;
    loadCostGrid().then((value) => alive && setGrid(value), () => {});
    return () => { alive = false; };
  }, []);
  return grid;
}

/** The known stops a task can go to (stops.routeStopCandidates), once stops.json has loaded; empty until then. */
export function useTaskCandidates() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    loadDataFile(STOPS_PATH).then((value) => alive && setData(value), () => {});
    return () => { alive = false; };
  }, []);
  return useMemo(() => {
    try { return data ? routeStopCandidates(data) : NONE; } catch { return NONE; }
  }, [data]);
}

/** The pick as the task list shows it: `{ taskId, note }`, the task being placed and the last note (a zustand hook). */
export const usePickState = usePick;

/**
 * The pick for the map: `picking` (the task being placed, or null) and `onPick`, which checks a click and places the
 * task. Escape cancels while a pick is on. Call it once per table (MissionTable.jsx).
 * @param {{ start: { x: number, z: number } | null, candidates: Array<object> }} context start: the airlock
 *   (route.waypoints[0])
 */
export function useTaskPick({ start, candidates }) {
  const taskId = usePick((s) => s.taskId);
  useEffect(() => {
    if (!taskId) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      cancelPick();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [taskId]);
  // The pick ends when the table closes, so a pick left on never catches a click on the next visit.
  useEffect(() => cancelPick, []);

  const onPick = (point) => {
    const id = usePick.getState().taskId;
    if (!id || !start) return;
    loadCostGrid().then((grid) => {
      if (usePick.getState().taskId !== id) return;   // cancelled meanwhile
      const tasks = useMissionStore.getState().needs?.tasks ?? NONE;
      if (!tasks.some((task) => task.id === id)) { cancelPick(); return; }
      const outcome = placeTask(grid, point, { taskId: id, tasks, start, candidates });
      if (outcome.tasks) setTasks(outcome.tasks);
      usePick.setState({ taskId: outcome.done ? null : id, note: outcome.note ? { ...outcome.note, taskId: id } : null });
    }, () => {});
  };
  return { picking: taskId, onPick };
}
