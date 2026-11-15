import SourceTag from '../components/SourceTag.jsx';
import Modal from '../components/Modal.jsx';
import { t, translateText } from '../i18n/index.js';
import {
  buildMissionLog,
  formatDistance,
  formatDose,
  formatDuration,
  formatMissionTime,
  formatPercent,
  formatSamples,
  formatSignedMinutes,
  plannedStopAt,
  routeDistanceChange,
  routeKindLabel,
  routeReasonText,
} from './format.js';
import RouteReview, { ReviewNotes } from './RouteReview.jsx';
import TaskRows from './TaskRows.jsx';
import { MissionRecap } from '../mission/MissionBeat.jsx';
import SaveRouteForm from '../plan/SaveRouteForm.jsx';
import { useReserveSec } from './useReserveSec.js';
import './debrief.css';

/** The tag chip stays small next to a large metric value and is not interactive inside the modal. */
const TAG_CLASS = () => 'source-tag-chip debrief-tag';

/** "rock · Cheyava Falls; soil · at Light-toned patch": each sample's kind, its site, and the planned stop it was taken at. */
function sampleDetail(samples, plan) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  return samples
    .map((sample) => {
      const site = sample?.site ? translateText(sample.site) : null;
      const stop = plannedStopAt(sample, plan?.waypoints);
      const at = stop && translateText(stop) !== site ? t('debrief.sample.at', { stop: translateText(stop) }) : null;
      return [t(sample?.kind === 'ground' ? 'debrief.sample.soil' : 'debrief.sample.rock'), site, at].filter(Boolean).join(' · ');
    })
    .join('; ');
}

function MissionLogEntry({ entry }) {
  const { type, atSec } = entry;
  if (type === 'event') {
    const event = entry.event;
    // Event labels come from the event files in English; the catalog translates the ones it knows.
    const label = (event.label ? translateText(event.label) : null) || event.eventId || t('debrief.log.event');
    const showId = event.eventId && event.label && event.label !== event.eventId;
    return (
      <li className="debrief-entry debrief-entry-event">
        <span className="debrief-time">{formatMissionTime(atSec)}</span>
        <div className="debrief-entry-body">
          <p className="debrief-entry-title">{label}</p>
          <p className="debrief-entry-meta">
            <span>{t(event.type === 'end' ? 'debrief.log.event.ended' : 'debrief.log.event.started')}</span>
            {showId ? <span className="debrief-entry-id">{event.eventId}</span> : null}
          </p>
        </div>
      </li>
    );
  }

  const change = entry.change;
  const kindLabel = routeKindLabel(change.kind);
  const reason = routeReasonText(change.reason);
  const distance = routeDistanceChange(change);
  const meta = [reason ? kindLabel : null, distance].filter(Boolean);
  return (
    <li className="debrief-entry debrief-entry-route">
      <span className="debrief-time">{formatMissionTime(atSec)}</span>
      <div className="debrief-entry-body">
        <p className="debrief-entry-title">{reason || kindLabel}</p>
        {meta.length > 0 && (
          <p className="debrief-entry-meta">
            {reason ? <span>{kindLabel}</span> : null}
            {distance ? <span className="debrief-route-distance">{distance}</span> : null}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * The end-of-EVA debrief (#43). It reads one frozen `eva.summary` snapshot and shows the metrics, the route review
 * (#274: the walked track against the approved plan, with a verdict per deviation, RouteReview.jsx), then the whole
 * mission log in mission time: every event start and end, and every route change with its reason and distance.
 * Every string is in src/i18n under debrief.* and review.*.
 *
 * The screen is a native modal, like the start screen and the pause menu. Esc is deliberately inert: the EVA has
 * already ended, so there is no pause menu or start screen behind this one. Continue goes back to the EVA (#244);
 * Restart starts a new one at the mission table; Sources opens the existing screen above this dialog and returns focus here.
 *
 * @param {{
 *   summary: object,
 *   busy?: boolean,
 *   notice?: string | null,
 *   onContinue: () => void,
 *   onRestart: () => void,
 *   onSources: () => void,
 *   reserveSec?: number | null,
 * }} props reserveSec: the suit reserve for the review rules; read from hazards.json when left out
 */
export default function DebriefScreen({ summary, busy = false, notice = null, onContinue, onRestart, onSources, reserveSec: reserveOverride }) {
  const loadedReserveSec = useReserveSec();
  const reserveSec = reserveOverride === undefined ? loadedReserveSec : reserveOverride;
  const log = buildMissionLog(summary);
  const samples = sampleDetail(summary.samples, summary.plan);
  const hasWindow = Number.isFinite(summary.startedAtSec) && Number.isFinite(summary.endedAtSec);

  return (
    <Modal labelledBy="debrief-title" className="debrief-dialog" onCancel={() => {}}>
      <div className="dialog-body debrief">
        <p className="dialog-kicker">{t('app.brand')}</p>
        <h2 id="debrief-title" className="dialog-title" tabIndex={-1} data-autofocus="true">{t('debrief.title')}</h2>
        <p className="dialog-site">{t('debrief.site')}</p>

        <dl className="debrief-metrics">
          <div className="debrief-metric">
            <dt>{t('debrief.metric.time')}</dt>
            <dd>
              <span className="debrief-value">{formatDuration(summary.elapsedOutsideSec)}</span>
              <SourceTag path="eva.elapsedOutsideSec" variant="tag" interactive={false} className={TAG_CLASS} />
              {hasWindow && (
                <span className="debrief-metric-note">
                  {formatMissionTime(summary.startedAtSec)} → {formatMissionTime(summary.endedAtSec)}
                </span>
              )}
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>{t('debrief.metric.distance')}</dt>
            <dd>
              <span className="debrief-value">{formatDistance(summary.distanceM)}</span>
              <SourceTag path="eva.distanceM" variant="tag" interactive={false} className={TAG_CLASS} />
              <span className="debrief-metric-note">{t('debrief.metric.distance.note')}</span>
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>{t('debrief.metric.samples')}</dt>
            <dd>
              <span className="debrief-value">{formatSamples(summary.sampleCount)}</span>
              <SourceTag path="eva.sampleCount" variant="tag" interactive={false} className={TAG_CLASS} />
              {samples && <span className="debrief-metric-note">{samples}</span>}
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>{t('debrief.metric.dose')}</dt>
            <dd>
              <span className="debrief-value">{formatDose(summary.doseUgy)}</span>
              <SourceTag path="environment.doseUgy" variant="tag" interactive={false} className={TAG_CLASS} />
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>{t('debrief.metric.margin')}</dt>
            <dd>
              <span className="debrief-value">{formatSignedMinutes(summary.minOxygenMarginSec)}</span>
              <SourceTag path="suit.marginSec" variant="tag" interactive={false} className={TAG_CLASS} />
              <span className="debrief-metric-note">{t('debrief.metric.margin.note')}</span>
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>{t('debrief.metric.battery')}</dt>
            <dd>
              <span className="debrief-value">{formatPercent(summary.minBatteryPct)}</span>
              <SourceTag path="suit.batteryPct" variant="tag" interactive={false} className={TAG_CLASS} />
            </dd>
          </div>
        </dl>

        {/* The sampling tasks of the plan (#352, TaskRows.jsx): done, done elsewhere or not done; nothing without tasks. */}
        <TaskRows tasks={summary.tasks} />

        <RouteReview summary={summary} />

        {/* The first mission's recap (#265, src/mission/MissionBeat.jsx): one line per beat; nothing for the full EVA. */}
        <MissionRecap className="debrief-notes" titleClassName="debrief-section-title" />

        <section className="debrief-log-section" aria-labelledby="debrief-log-title">
          <h3 id="debrief-log-title" className="debrief-section-title">{t('debrief.log.title')}</h3>
          {log.length > 0 ? (
            <ol className="debrief-log">
              {log.map((entry) => (
                <MissionLogEntry key={entry.type + '-' + entry.order} entry={entry} />
              ))}
            </ol>
          ) : (
            <p className="debrief-empty">{t('debrief.log.empty')}</p>
          )}
        </section>

        {/* Save the route as it ended, with the finds added during the walk (#364): Restart would start a fresh plan. */}
        <section className="debrief-save" aria-labelledby="debrief-save-title">
          <h3 id="debrief-save-title" className="debrief-section-title">{t('debrief.save.title')}</h3>
          <p className="debrief-save-text">{t('debrief.save.text')}</p>
          <SaveRouteForm summary={summary} buttonClass="ui-button primary" className="debrief-save-form" />
        </section>

        <section className="debrief-notes" aria-labelledby="debrief-notes-title">
          <h3 id="debrief-notes-title" className="debrief-section-title">{t('debrief.notes.title')}</h3>
          <p>{t('debrief.notes.dose')}</p>
          <p>{t('debrief.notes.battery')}</p>
          <ReviewNotes reserveSec={reserveSec} />
        </section>

        {notice && <p className="dialog-notice" role="alert">{translateText(notice)}</p>}

        <div className="dialog-actions debrief-actions">
          <button type="button" className="ui-button primary" onClick={onContinue} disabled={busy}>
            {t('debrief.continue')}
          </button>
          <button type="button" className="ui-button ghost" onClick={onRestart} disabled={busy}>
            {busy ? t('debrief.restarting') : t('debrief.restart')}
          </button>
          <button type="button" className="ui-button ghost" onClick={onSources} disabled={busy}>
            {t('debrief.sources')}
          </button>
        </div>
        <p className="dialog-footnote">{t('debrief.footnote')}</p>
      </div>
    </Modal>
  );
}
