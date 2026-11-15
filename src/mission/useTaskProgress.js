import { useMemo } from 'react';
import { taskText } from '../plan/routeWhy.js';
import { taskProgress, tasksAt } from '../sim/taskProgress.js';
import { useMissionStore } from '../state/store.js';

/**
 * The sampling tasks in the walk (#352): one row per task of the plan (route.tasks), counted from this EVA's samples and
 * photos (src/sim/taskProgress.js), and the kept rows whose place is near the crew's estimated position. The banner at
 * the place (TaskBanner.jsx) and the sampling panel's line (src/hud/SamplingPanel.jsx) read it. route.tasks is empty for
 * the goals without tasks, so nothing is counted or shown for them.
 *
 * The nearby rows come nearest place first (two task places can be in reach at once: the banner shows the one the crew
 * stands at), in list order within a place. They are selected as a string of ids, so the 5 Hz position updates re-render
 * only when a place comes into reach, goes out of it or becomes the nearest.
 * @returns {{ rows: ReturnType<typeof taskProgress>, near: ReturnType<typeof taskProgress> }}
 */
export function useTaskProgress() {
  const tasks = useMissionStore((s) => s.route?.tasks);
  const samples = useMissionStore((s) => s.sampling?.samples);
  const photoLog = useMissionStore((s) => s.sampling?.photoLog);
  const rows = useMemo(() => (Array.isArray(tasks) && tasks.length > 0 ? taskProgress(tasks, { samples, photoLog }) : []), [tasks, samples, photoLog]);
  const nearIds = useMissionStore((s) => (rows.length === 0 ? '' : nearestFirst(tasksAt(rows, s.navigation).filter((row) => row.kept), s.navigation).join(',')));
  const near = useMemo(() => (nearIds ? nearIds.split(',').map((id) => rows.find((row) => row.id === id)).filter(Boolean) : []), [rows, nearIds]);
  return { rows, near };
}

/** The ids of the rows, nearest place first; a stable sort, so the rows of one place keep their list order. */
function nearestFirst(rows, position) {
  return rows
    .map((row) => ({ id: row.id, d: Math.hypot(position.x - row.place.x, position.z - row.place.z) }))
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.id);
}

/** "1 rock sample", "2 photos": what a task asks for, with its count, in the mission table's words (routeWhy.taskText). */
export const taskWhat = taskText;
