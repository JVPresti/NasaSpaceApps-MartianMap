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
 * The banner's one line for the tasks of one place: the first not done yet, with "+1 more" for the others still open, or
 * the tick once every one is done. One line, so the banner keeps the height the science card below it allows for at
 * 1366 x 768 (stopCard.css .stop-card-walk); the sampling panel's line lists every task of the place.
 * @returns {{ text: string, row: object | null }} row: the task the line is about, null for the tick of several
 */
function placeLine(rows) {
  const current = rows.find((row) => row.state !== 'done');
  if (current) {
    const others = rows.filter((row) => row !== current && row.state !== 'done').length;
    return { text: taskBannerText(current) + (others > 0 ? ' · ' + t('taskwalk.more', { count: others }) : ''), row: current };
  }
  if (rows.length === 1) return { text: taskBannerText(rows[0]), row: rows[0] };
  return { text: t('taskwalk.done.all', { list: rows.map(taskWhat).join(', ') }), row: null };
}

/**
 * The sampling task at its place (#352): once the crew has reached a task place (its waypoint is in route.visited) and
 * while it is near it, "Collect 1 rock sample here · 0 of 1", ticked when the sample is secured there (several tasks at
 * one place: the first open one and "+1 more", then the tick of all). It reuses the
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
  const line = placeLine(rows);
  return (
    <div className="event-banner info event-banner-walk mission-stop" role="status" data-task-place={place.key}>
      <div className="event-banner-main">
        <span className="event-level">{t('taskwalk.level', { place: translateText(place.label ?? place.key ?? '') })}</span>
        <span className="event-text" data-task={line.row ? line.row.id : rows.map((row) => row.id).join(' ')} data-state={line.row ? line.row.state : 'done'}>
          {line.text} <SourceTag path="eva.tasks" source={null} interactive={false} requireSource={false} />
        </span>
      </div>
    </div>
  );
}
