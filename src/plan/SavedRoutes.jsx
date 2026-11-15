import { formatNumber, t } from '../i18n/index.js';
import { applySavedRoute, deleteSavedRoute, useMissionStore } from '../state/store.js';
import SaveRouteForm from './SaveRouteForm.jsx';
import SourceTag from './SourceTag.jsx';

// Saved routes (#357): the crew's route library at the mission table. Each entry shows the plan (waypoints,
// distance, climb, steepest grade) and its success record (runs, completions, samples, distance walked).

const km = (value) => formatNumber((value ?? 0) / 1000, 2);
const riskTone = (level) => (level === 'high' ? 'warning' : level === 'caution' ? 'caution' : 'ok');

function SavedRoute({ entry }) {
  const record = entry.record ?? {};
  const walked = (record.attempts ?? 0) > 0;
  return (
    <li className="saved-route">
      <div className="saved-route-head">
        <b>{entry.name}</b>
        <span className={'saved-route-risk tone-' + riskTone(entry.risk?.level)}>{t('savedRoutes.risk.' + (entry.risk?.level ?? 'unknown'))}</span>
      </div>
      <p className="saved-route-line">
        <span>{t('savedRoutes.plan', { waypoints: entry.waypoints.length, distance: km(entry.distanceM), climb: Math.round(entry.climbM ?? 0), slope: Math.round(entry.risk?.maxSlopeDeg ?? 0) })}</span>
        <SourceTag path="routeLibrary.risk.maxSlopeDeg" requireSource={false} />
      </p>
      <p className="saved-route-line">
        <span>{walked ? t('savedRoutes.record.line', { attempts: record.attempts, completed: record.completed, samples: record.samples, distance: km(record.distanceM) }) : t('savedRoutes.record.none')}</span>
        {walked && <SourceTag path="routeLibrary.record.attempts" requireSource={false} />}
      </p>
      <div className="saved-route-actions">
        <button type="button" className="table-link" onClick={() => applySavedRoute(entry.id)}>{t('savedRoutes.load')}</button>
        <button type="button" className="table-link" onClick={() => deleteSavedRoute(entry.id)}>{t('savedRoutes.delete')}</button>
      </div>
    </li>
  );
}

/** The saved-routes panel of the Route step. */
export default function SavedRoutes() {
  const list = useMissionStore((s) => s.routeLibrary.list);
  const manual = useMissionStore((s) => s.route.manual === true);
  return (
    <div className="saved-routes">
      <SaveRouteForm />
      {manual && <p className="table-note">{t('savedRoutes.manual')}</p>}
      {list.length === 0 ? (
        <p className="table-note">{t('savedRoutes.empty')}</p>
      ) : (
        <ul className="saved-routes-list">{list.map((entry) => <SavedRoute key={entry.id} entry={entry} />)}</ul>
      )}
    </div>
  );
}
