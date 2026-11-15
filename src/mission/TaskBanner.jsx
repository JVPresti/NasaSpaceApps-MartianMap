import { t, translateText } from '../i18n/index.js';
import SourceTag from '../plan/SourceTag.jsx';
import { useMissionStore } from '../state/store.js';
import { taskWhat, useTaskProgress } from './useTaskProgress.js';

/** The banner's line for one task: what to collect here and how many are in, or the tick once all are in. */
function taskBannerText(row) {
  const values = { what: taskWhat(row), here: row.here, count: row.count };
  if (row.state === 'done') return t('taskwalk.done', values);
  return t(row.what === 'photo' ? 'taskwalk.todo.photo' : 'taskwalk.todo', values);
}

/**
 * The sampling task at its place (#352): once the crew has reached a task place (its waypoint is in route.visited) and
 * while it is near it, "Collect 1 rock sample here · 0 of 1", ticked when the sample is secured there. It reuses the
 * science stop's banner (StopBanner in MissionBeat.jsx: the event banner's place and style), which no alert holds: it
 * gives way to any active alert, and the full EVA that a "Collect samples" plan runs has no stop banner, so the two
 * never meet. Nothing holds the crew at the place; the banner goes when they walk on.
 */
export default function TaskBanner() {
  const { near } = useTaskProgress();
  const visited = useMissionStore((s) => s.route?.visited);
  const alerted = useMissionStore((s) => Object.values(s.alerts ?? {}).some((alert) => alert && alert.active));
  const reached = Array.isArray(visited) ? near.filter((row) => row.place.waypoint && visited.includes(row.place.waypoint)) : [];
  if (alerted || reached.length === 0) return null;
  const place = reached[0].place;   // the nearest place reached (useTaskProgress orders `near` nearest first)
  const rows = reached.filter((row) => row.place.key === place.key);   // the tasks of one place (merged into one waypoint)
  return (
    <div className="event-banner info event-banner-walk mission-stop" role="status" data-task-place={place.key}>
      <div className="event-banner-main">
        <span className="event-level">{t('taskwalk.level', { place: translateText(place.label ?? place.key ?? '') })}</span>
        {rows.map((row, index) => (
          <span key={row.id} className="event-text" data-task={row.id} data-state={row.state}>
            {taskBannerText(row)}
            {index === rows.length - 1 && <> <SourceTag path="eva.tasks" source={null} interactive={false} requireSource={false} /></>}
          </span>
        ))}
      </div>
    </div>
  );
}
