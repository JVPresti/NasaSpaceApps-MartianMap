import SourceTag from '../components/SourceTag.jsx';
import Modal from '../components/Modal.jsx';
import {
  buildMissionLog,
  formatDistance,
  formatDose,
  formatDuration,
  formatMissionTime,
  formatPercent,
  formatSamples,
  formatSignedMinutes,
  routeDistanceChange,
  routeKindLabel,
} from './format.js';
import './debrief.css';

/** The tag chip stays small next to a large metric value and is not interactive inside the modal. */
const TAG_CLASS = () => 'source-tag-chip debrief-tag';

function sampleDetail(samples) {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  return samples
    .map((sample) => [sample?.kind === 'ground' ? 'soil' : 'rock', sample?.site].filter(Boolean).join(' · '))
    .join('; ');
}

function MissionLogEntry({ entry }) {
  const { type, atSec } = entry;
  if (type === 'event') {
    const event = entry.event;
    const label = event.label || event.eventId || 'Event';
    const showId = event.eventId && event.label && event.label !== event.eventId;
    return (
      <li className="debrief-entry debrief-entry-event">
        <span className="debrief-time">{formatMissionTime(atSec)}</span>
        <div className="debrief-entry-body">
          <p className="debrief-entry-title">{label}</p>
          <p className="debrief-entry-meta">
            <span>{event.type === 'end' ? 'Event ended' : 'Event started'}</span>
            {showId ? <span className="debrief-entry-id">{event.eventId}</span> : null}
          </p>
        </div>
      </li>
    );
  }

  const change = entry.change;
  const kindLabel = routeKindLabel(change.kind);
  const reason = change.reason || null;
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
 * The end-of-EVA debrief (#43). It reads one frozen `eva.summary` snapshot and shows the metrics, then the whole
 * mission log in mission time: every event start and end, and every route change with its reason and distance.
 *
 * The screen is a native modal, like the start screen and the pause menu. Esc is deliberately inert: the EVA has
 * already ended, so there is no pause menu or start screen behind this one. Restart is the app's real
 * `handleRestartConfirm`; Sources opens the existing screen above this dialog and returns focus here.
 *
 * @param {{
 *   summary: object,
 *   busy?: boolean,
 *   notice?: string | null,
 *   onRestart: () => void,
 *   onSources: () => void,
 * }} props
 */
export default function DebriefScreen({ summary, busy = false, notice = null, onRestart, onSources }) {
  const log = buildMissionLog(summary);
  const samples = sampleDetail(summary.samples);
  const hasWindow = Number.isFinite(summary.startedAtSec) && Number.isFinite(summary.endedAtSec);

  return (
    <Modal labelledBy="debrief-title" className="debrief-dialog" onCancel={() => {}}>
      <div className="dialog-body debrief">
        <p className="dialog-kicker">Marswalk</p>
        <h2 id="debrief-title" className="dialog-title" tabIndex={-1} data-autofocus="true">EVA debrief</h2>
        <p className="dialog-site">Back in the habitat · mission clock stopped</p>

        <dl className="debrief-metrics">
          <div className="debrief-metric">
            <dt>Time outside</dt>
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
            <dt>Distance walked</dt>
            <dd>
              <span className="debrief-value">{formatDistance(summary.distanceM)}</span>
              <SourceTag path="eva.distanceM" variant="tag" interactive={false} className={TAG_CLASS} />
              <span className="debrief-metric-note">horizontal, on foot</span>
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>Samples</dt>
            <dd>
              <span className="debrief-value">{formatSamples(summary.sampleCount)}</span>
              <SourceTag path="eva.sampleCount" variant="tag" interactive={false} className={TAG_CLASS} />
              {samples && <span className="debrief-metric-note">{samples}</span>}
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>Dose</dt>
            <dd>
              <span className="debrief-value">{formatDose(summary.doseUgy)}</span>
              <SourceTag path="environment.doseUgy" variant="tag" interactive={false} className={TAG_CLASS} />
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>Lowest oxygen margin</dt>
            <dd>
              <span className="debrief-value">{formatSignedMinutes(summary.minOxygenMarginSec)}</span>
              <SourceTag path="suit.marginSec" variant="tag" interactive={false} className={TAG_CLASS} />
              <span className="debrief-metric-note">negative means below the reserve</span>
            </dd>
          </div>
          <div className="debrief-metric">
            <dt>Lowest battery</dt>
            <dd>
              <span className="debrief-value">{formatPercent(summary.minBatteryPct)}</span>
              <SourceTag path="suit.batteryPct" variant="tag" interactive={false} className={TAG_CLASS} />
            </dd>
          </div>
        </dl>

        <section className="debrief-log-section" aria-labelledby="debrief-log-title">
          <h3 id="debrief-log-title" className="debrief-section-title">Mission log</h3>
          {log.length > 0 ? (
            <ol className="debrief-log">
              {log.map((entry) => (
                <MissionLogEntry key={entry.type + '-' + entry.order} entry={entry} />
              ))}
            </ol>
          ) : (
            <p className="debrief-empty">No events or route changes were recorded outside the habitat.</p>
          )}
        </section>

        <section className="debrief-notes" aria-labelledby="debrief-notes-title">
          <h3 id="debrief-notes-title" className="debrief-section-title">How to read these numbers</h3>
          <p>
            Dose follows the scripted radiation scenario and is recorded when you return to the habitat.
          </p>
          <p>
            Battery shows the lowest remaining charge predicted by the suit model. A dash means no reading was available.
          </p>
        </section>

        {notice && <p className="dialog-notice" role="alert">{notice}</p>}

        <div className="dialog-actions debrief-actions">
          <button type="button" className="ui-button primary" onClick={onRestart} disabled={busy}>
            {busy ? 'Restarting…' : 'Restart EVA'}
          </button>
          <button type="button" className="ui-button ghost" onClick={onSources} disabled={busy}>
            Sources
          </button>
        </div>
        <p className="dialog-footnote">
          Restart clears this log and returns to the start screen. This screen stays open until then; Esc does not
          resume the EVA.
        </p>
      </div>
    </Modal>
  );
}
