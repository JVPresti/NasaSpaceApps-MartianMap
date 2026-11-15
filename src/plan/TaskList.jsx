import { useShallow } from 'zustand/react/shallow';
import { formatNumber, t, translateText } from '../i18n/index.js';
import { SAMPLE_REACH_M } from '../sim/missions.js';
import { COUNT_RANGE, patchTask, resolvePlace, TASK_KINDS, withoutTask, withTask } from '../sim/sampleTasks.js';
import { ROCK_COVER_LOW, rockCover } from '../sim/taskPlace.js';
import { waypointNumber } from '../sim/waypointNumber.js';
import { setTasks, useMissionStore } from '../state/store.js';
import { LAYERS, layerProvenancePath } from './layers.js';
import { stopLine, taskDroppedWhy, taskRole } from './routeWhy.js';
import SourceTag from './SourceTag.jsx';
import { addedTask, cancelPick, startPick, useCostGrid, usePickState } from './useTaskPlace.js';

// The sampling tasks of the "Collect samples" goal on the Route step (#352), in the place of the stop list until the
// EVA begins: up to three rows, each what (photo, soil, rock), how many (1 to 3) and where (a known stop, a point already
// on the list, or a new point clicked on the map, useTaskPlace.js). Each row shows its place's number on the map and the
// line the stop list would give it (the work there and why the leg runs where it does), or why the plan left it out. A
// rock task over little rock cover says so, with the Rocks layer's tag and its caveat. The rows are the stop list's own
// (.table-stops) with the needs panel's selects, so nothing here is a new kind of control.

const NONE = [];
const COUNTS = Array.from({ length: COUNT_RANGE[1] - COUNT_RANGE[0] + 1 }, (_, k) => COUNT_RANGE[0] + k);
const ROCK_LAYER = LAYERS.find((layer) => layer.id === 'rock');
const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');
const lowerFirst = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : '');

/** The where select's value for a place. */
const whereValue = (place) => (place?.type === 'point' ? 'point:' + place.id : 'stop:' + place?.stopId);

/**
 * Where a task stands in the plan on the table: its place's number on the map and the second line of its row.
 * @returns {{ code: string, line: string | null, dropped: boolean }}
 */
function planned(task, { waypoints, legs, explain, planTasks }) {
  const entry = planTasks.find((item) => item.id === task.id);
  // a task after a goal task with no path is not tried: neither kept nor dropped (drop null)
  if (entry?.kept === false && entry.drop) {
    return { code: '–', line: `${sentence(t('table.stop.left.out'))}: ${lowerFirst(taskDroppedWhy(entry))}`, dropped: true };
  }
  const k = entry ? waypoints.findIndex((w, index) => index > 0 && w.tasks?.includes(task.id)) : -1;
  if (k < 1) return { code: '–', line: null, dropped: false };
  const waypoint = waypoints[k];
  const here = planTasks.filter((item) => waypoint.tasks.includes(item.id));
  const leg = legs[k - 1];
  return { code: waypointNumber(k), line: stopLine({ workSec: leg?.workSec ?? waypoint.workSec, explain: explain[k - 1], role: taskRole(here) }), dropped: false };
}

/**
 * @param {{ waypoints: Array<object>, legs?: Array<object>, explain?: Array<object>, planTasks?: Array<object>,
 *   candidates: Array<object> }} props waypoints, legs, explain: the route on the table; planTasks: route.tasks, while the
 *   route on the table is the planned one; candidates: the known stops (stops.routeStopCandidates)
 */
export default function TaskList({ waypoints, legs = NONE, explain = NONE, planTasks = NONE, candidates = NONE }) {
  const { tasks, off } = useMissionStore(useShallow((s) => ({ tasks: s.needs?.tasks ?? NONE, off: s.needs?.locked === true })));
  const pick = usePickState();
  const grid = useCostGrid();
  const full = tasks.length >= 3;
  const points = [...new Map(tasks.filter((task) => task.place?.type === 'point').map((task) => [task.place.id, task.place])).values()];
  const set = (list) => { if (!off) setTasks(list); };

  const onWhere = (task, value) => {
    if (value === 'pick') { startPick(task.id); return; }
    cancelPick();
    const [type, id] = value.split(':');
    const place = type === 'point' ? points.find((p) => p.id === id) : { type: 'stop', stopId: id };
    if (place) set(patchTask(tasks, task.id, { place }));
  };
  const onRemove = (task) => {
    cancelPick();
    set(withoutTask(tasks, task.id));
  };

  return (
    <div className="table-panel table-fill">
      <div className="table-panel-head">
        <p className="table-label" title={t('tasktable.title.help')}>
          {t('tasktable.title')}
          {/* the work per task (SIM, sampleTasks.TASK_WORK_SEC) and why each leg bends (DERIVED) */}
          <SourceTag path="tasks.workSec" requireSource={false} /><SourceTag path="route.explain" requireSource={false} />
        </p>
        <button type="button" className="table-link" data-task-add="" disabled={off || full} title={full ? t('tasktable.add.full') : undefined}
          onClick={() => set(withTask(tasks, addedTask(tasks)))}>
          {t('tasktable.add')}
        </button>
      </div>
      {tasks.length === 0 ? <p className="table-note">{t('tasks.plan.none')}</p> : (
        <ol className="table-stops">
          {tasks.map((task, k) => {
            const n = k + 1;
            const { code, line, dropped } = planned(task, { waypoints, legs, explain, planTasks });
            const place = resolvePlace(task.place, candidates);
            const cover = task.what === 'rock' && grid && place ? rockCover(grid, place, place.radiusM + SAMPLE_REACH_M) : null;
            const note = pick.note?.taskId === task.id ? pick.note : null;
            return (
              <li key={task.id} className={dropped ? 'dropped' : undefined}>
                <code>{code}</code>
                <select className="needs-select" aria-label={t('tasktable.what.label', { n })} value={task.what} disabled={off}
                  onChange={(event) => set(patchTask(tasks, task.id, { what: event.target.value }))}>
                  {TASK_KINDS.map((kind) => <option key={kind} value={kind}>{t(`tasktable.what.${kind}`)}</option>)}
                </select>
                <select className="needs-select" aria-label={t('tasktable.count.label', { n })} value={task.count} disabled={off}
                  onChange={(event) => set(patchTask(tasks, task.id, { count: Number(event.target.value) }))}>
                  {COUNTS.map((count) => <option key={count} value={count}>{t('tasktable.count', { n: count })}</option>)}
                </select>
                <select className="needs-select task-where" data-task-where={task.id} aria-label={t('tasktable.where.label', { n })}
                  value={whereValue(task.place)} disabled={off} onChange={(event) => onWhere(task, event.target.value)}>
                  {candidates.map((stop) => <option key={stop.id} value={'stop:' + stop.id}>{translateText(stop.name)}</option>)}
                  {points.map((p) => <option key={p.id} value={'point:' + p.id}>{t('tasktable.where.at.point', { id: p.id })}</option>)}
                  {/* a stop the file has not loaded yet still shows as chosen */}
                  {task.place.type === 'stop' && !candidates.some((stop) => stop.id === task.place.stopId) && <option value={whereValue(task.place)}>{task.place.stopId}</option>}
                  <option value="pick">{t('tasktable.where.point')}</option>
                </select>
                <button type="button" className="table-link" aria-label={t('tasktable.remove.label', { n })} disabled={off} onClick={() => onRemove(task)}>
                  {t('tasktable.remove')}
                </button>
                {line && <small className="table-stop-why">{line}</small>}
                {pick.taskId === task.id && (
                  <p className="table-note">
                    {t('tasktable.pick.hint', { n })}{' '}
                    <button type="button" className="table-link" onClick={cancelPick}>{t('tasktable.pick.cancel')}</button>
                  </p>
                )}
                {note && (
                  <p className={note.tone ? 'table-note tone-' + note.tone : 'table-note'}>
                    {note.text}{note.tag && <SourceTag path={note.tag} requireSource={false} />}
                  </p>
                )}
                {cover?.low && (
                  <p className="table-note tone-caution">
                    {t('tasktable.rock.low', { mean: formatNumber(cover.mean, 2), low: formatNumber(ROCK_COVER_LOW, 1) })} {t('tasktable.rock.caveat')}
                    <SourceTag path={layerProvenancePath(ROCK_LAYER)} requireSource={false} />
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
