import SourceTag from '../components/SourceTag.jsx';
import { formatUnit, t, translateText } from '../i18n/index.js';
import { taskText } from '../plan/routeWhy.js';
import { formatMissionTime } from './format.js';

/** The tag chip of the debrief's rows (debrief.css .debrief-tag), not interactive inside the modal. */
const TAG_CLASS = () => 'source-tag-chip debrief-tag';
const STATE_KEY = { done: 'taskreview.state.done', elsewhere: 'taskreview.state.elsewhere', open: 'taskreview.state.open' };

/** "1 of 1", or "1 of 2 at the place, 1 elsewhere" when records from elsewhere count. */
function countText(row) {
  return row.elsewhere > 0
    ? t('taskreview.count.split', { here: row.here, count: row.count, elsewhere: row.elsewhere })
    : t('taskreview.count', { here: row.here, count: row.count });
}

/** The farthest counted record from the place: a decimal under 10 m, whole metres above. Null with none. */
function distanceText(row) {
  const m = row.distanceM;
  if (typeof m !== 'number' || !Number.isFinite(m)) return null;
  return t('taskreview.distance', { distance: formatUnit(m, 'm', m < 10 ? 1 : 0) });
}

/**
 * The sampling tasks of the approved plan in the debrief (#352): one row per task, as the mission log's rows (time,
 * title, meta). The time is when the task was complete (a dash while it is not); the title says done, done elsewhere
 * or not done, what and where; the meta how many were collected at the place and elsewhere, the farthest from the place,
 * and whether the plan had left the task out. Reads the frozen summary's `tasks` rows (src/sim/taskProgress.js) only;
 * renders nothing when there are none, so the goals without tasks keep their debrief.
 * @param {{ tasks?: Array<object> }} props summary.tasks
 */
export default function TaskRows({ tasks }) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  return (
    <section className="debrief-log-section" aria-labelledby="debrief-tasks-title">
      <h3 id="debrief-tasks-title" className="debrief-section-title">{t('taskreview.title')}</h3>
      <ol className="debrief-log">
        {tasks.map((row) => {
          const distance = distanceText(row);
          return (
            <li key={row.id} className="debrief-entry" data-task={row.id} data-state={row.state}>
              <span className="debrief-time">{formatMissionTime(row.atSec)}</span>
              <div className="debrief-entry-body">
                <p className="debrief-entry-title">
                  {t('taskreview.row', { state: t(STATE_KEY[row.state] ?? STATE_KEY.open), what: taskText(row), place: translateText(row.place?.label ?? row.place?.key ?? '—') })}
                  <SourceTag path="eva.tasks" variant="tag" interactive={false} className={TAG_CLASS} />
                </p>
                <p className="debrief-entry-meta">
                  <span>{countText(row)}</span>
                  {distance && <span>{distance}</span>}
                  {row.kept === false && <span>{t('taskreview.dropped')}</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
