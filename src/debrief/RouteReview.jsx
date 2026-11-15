import { useMemo, useState } from 'react';
import SourceTag from '../components/SourceTag.jsx';
import { provenance } from '../data/provenance.js';
import { t } from '../i18n/index.js';
import MissionMap from '../plan/MissionMap.jsx';
import { REVIEW_RULES, reviewRoute } from '../sim/routeReview.js';
import { formatMinutes, formatMissionTime, waypointCode } from './format.js';
import { costText, detailText, reasonText, ruleNotes, summaryLine, verdictLabel } from './reviewText.js';

// Route review in the debrief (#274): the plan approved at Begin EVA and the walked track on the mission table's map,
// one row per deviation with its verdict, reason and cost, and the suit margin over time under the map. It reuses the
// debrief's log rows and the mission table's map, markers and legend; debrief.css adds only the track, the verdict
// colours and the margin strip.

// Where the review's numbers come from (#62). The thresholds are ours (SIM); the costs come from the suit model.
const rules = REVIEW_RULES;
provenance.define({
  'review.verdict': {
    tag: 'SIM',
    label: 'Route review rules',
    source: `route review (src/sim/routeReview.js): a deviation is more than ${rules.enterM} m from the approved plan for ${rules.minLengthM} m of walking, over back within ${rules.exitM} m; risky at or above the ${rules.slopeLimitDeg}° slope limit (hazards.json slope.no_go) or with the suit margin under the reserve`,
  },
  'review.cost': {
    tag: 'DERIVED',
    label: 'Suit model',
    source: 'mission time and suit O2 over the walked stretch, minus the per-leg suit model costs of the stretch of the approved plan it replaced',
  },
});

/** The verdict number chip: the map's stop number, in the verdict colour. */
const NUM_CLASS = (verdict) => 'map-marker-num debrief-review-num review-' + verdict;
const TAG_CLASS = () => 'source-tag-chip debrief-tag';
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** The review rules for "How to read these numbers". */
export function ReviewNotes({ reserveSec = null }) {
  return ruleNotes(reserveSec).map(({ term, text }) => (
    <p key={term ?? text}>{term ? <><b>{term}</b>: </> : null}{text}</p>
  ));
}

/** Marks on the map: re-plans, finds and samples in their usual shapes, and the numbered deviations on top. */
function reviewMarks(review, summary) {
  const marks = [];
  for (const [index, r] of review.replans.entries()) {
    marks.push({
      id: 'replan-' + index,
      x: r.x,
      z: r.z,
      className: 'map-mark-replan',
      label: t('review.mark.replan', { time: formatMissionTime(r.atSec), reason: t('review.kind.' + (['offroute', 'slope', 'event'].includes(r.kind) ? r.kind : 'replan')) }),
    });
  }
  for (const f of Array.isArray(summary.finds) ? summary.finds : []) {
    if (!isNumber(f?.x) || !isNumber(f?.z)) continue;
    marks.push({ id: 'find-' + f.id, x: f.x, z: f.z, className: f.accepted ? 'map-mark-find accepted' : 'map-mark-find', text: f.label, label: t('review.mark.find', { label: f.label ?? '' }) });
  }
  for (const [index, s] of (Array.isArray(summary.samples) ? summary.samples : []).entries()) {
    if (!isNumber(s?.x) || !isNumber(s?.z)) continue;
    marks.push({ id: 'sample-' + (s.id ?? index), x: s.x, z: s.z, className: 'map-mark-sample', label: t('review.mark.sample', { time: formatMissionTime(s.atSec) }) });
  }
  for (const d of review.deviations) {
    marks.push({ id: 'deviation-' + d.n, x: d.at.x, z: d.at.z, className: 'map-mark-num ' + NUM_CLASS(d.verdict), text: String(d.n), label: t('review.mark.deviation', { n: d.n, verdict: verdictLabel(d.verdict) }) });
  }
  return marks;
}

/**
 * The suit margin over the EVA, with the reserve line (margin 0: below it the suit is using the reserve) and the
 * deviations shaded in their verdict colours.
 */
export function MarginStrip({ track, deviations }) {
  const points = track.filter((p) => isNumber(p.atSec) && isNumber(p.marginSec));
  if (points.length < 2) return null;
  const t0 = points[0].atSec;
  const span = Math.max(1, points.at(-1).atSec - t0);
  const margins = points.map((p) => p.marginSec);
  const low = Math.min(...margins);
  const lo = Math.min(0, low);
  const hi = Math.max(...margins, lo + 600);
  const pad = (hi - lo) * 0.1;
  const x = (sec) => ((sec - t0) / span) * 100;
  const y = (m) => ((hi + pad - m) / (hi - lo + 2 * pad)) * 100;
  const lowest = points[margins.indexOf(low)];
  const reserveY = y(0);
  const line = points.map((p) => x(p.atSec).toFixed(2) + ',' + y(p.marginSec).toFixed(2)).join(' ');
  const lowText = formatMinutes(low);
  const atText = formatMissionTime(lowest.atSec);

  return (
    <figure className="debrief-review-strip">
      <figcaption className="debrief-review-strip-head">
        <span>{t('review.strip.title')}</span>
        <SourceTag path="suit.marginSec" variant="tag" interactive={false} className={TAG_CLASS} />
        <span className="debrief-review-strip-low">{t('review.strip.lowest', { low: lowText, at: atText })}</span>
      </figcaption>
      <div
        className="debrief-review-strip-plot"
        role="img"
        aria-label={t('review.strip.label', { start: formatMissionTime(t0), end: formatMissionTime(t0 + span), low: lowText, at: atText })}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {deviations.filter((d) => isNumber(d.startSec) && isNumber(d.endSec)).map((d) => (
            <rect key={d.n} className={'debrief-review-shade review-' + d.verdict} x={x(d.startSec)} y="0" width={Math.max(0.6, x(d.endSec) - x(d.startSec))} height="100" />
          ))}
          <line className="debrief-review-reserve" x1="0" x2="100" y1={reserveY} y2={reserveY} />
          <polyline className="debrief-review-margin" points={line} />
        </svg>
        {deviations.filter((d) => isNumber(d.startSec)).map((d) => (
          <span key={d.n} className={'debrief-review-shade-num review-' + d.verdict} style={{ left: `${x(d.startSec)}%` }} aria-hidden="true">{d.n}</span>
        ))}
        <span className="debrief-review-reserve-label" style={{ top: `${reserveY}%` }} aria-hidden="true">{t('review.strip.reserve')}</span>
      </div>
      <div className="debrief-review-strip-axis" aria-hidden="true">
        <span>{formatMissionTime(t0)}</span>
        <span>{formatMissionTime(t0 + span)}</span>
      </div>
    </figure>
  );
}

function DeviationRow({ deviation: d, events, selected, onSelect }) {
  return (
    <li>
      <button
        type="button"
        className="debrief-entry debrief-review-row"
        aria-pressed={selected}
        title={t('review.row.frame', { n: d.n })}
        onClick={() => onSelect(selected ? null : d.n)}
      >
        <span className="debrief-time">{formatMissionTime(d.startSec)}</span>
        <span className="debrief-entry-body">
          <span className="debrief-entry-title">
            <span className={NUM_CLASS(d.verdict)} aria-hidden="true">{d.n}</span>
            <span>{verdictLabel(d.verdict)}</span>
            <SourceTag path="review.verdict" variant="tag" interactive={false} className={TAG_CLASS} />
          </span>
          <span className="debrief-entry-meta debrief-review-reason">
            <span>{reasonText(d, events)}</span>
            {!d.returned && <span>{t('review.open')}</span>}
          </span>
          <span className="debrief-entry-meta">
            <span className="debrief-route-distance">{costText(d.cost)}</span>
            <SourceTag path="review.cost" variant="tag" interactive={false} className={TAG_CLASS} />
            <span>{detailText(d.cost)}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The review without its own state, so a test can render any selection.
 * @param {{ summary: object, review: ReturnType<typeof reviewRoute>, selected: number | null,
 *   onSelect: (n: number | null) => void }} props
 */
export function RouteReviewView({ summary, review, selected, onSelect }) {
  const plan = summary.plan;
  const waypoints = useMemo(
    () => (Array.isArray(plan?.waypoints) ? plan.waypoints.map((w, index) => ({ ...w, name: waypointCode(w.name, index) })) : []),
    [plan],
  );
  const track = useMemo(() => review.track.map((p) => [p.x, p.z]), [review]);
  const stretches = useMemo(() => review.deviations.map((d) => ({ id: 'deviation-' + d.n, path: d.path, className: 'review-' + d.verdict })), [review]);
  const marks = useMemo(() => reviewMarks(review, summary), [review, summary]);
  const focus = useMemo(() => {
    const d = review.deviations.find((item) => item.n === selected);
    return d ? d.path.map(([x, z]) => ({ x, z })) : null;
  }, [review, selected]);
  const hasFinds = marks.some((m) => m.className.startsWith('map-mark-find'));
  const hasSamples = marks.some((m) => m.className === 'map-mark-sample');

  const legend = (
    <div className="table-map-legend debrief-review-legend">
      <ul>
        <li><i className="review-key-plan" />{t('review.legend.plan')}</li>
        <li><i className="review-key-track" />{t('review.legend.track')}</li>
        {review.replans.length > 0 && <li><i className="review-key-replan" />{t('review.legend.replan')}</li>}
        {hasFinds && <li><i className="review-key-find" />{t('review.legend.find')}</li>}
        {hasSamples && <li><i className="review-key-sample" />{t('review.legend.sample')}</li>}
      </ul>
    </div>
  );

  return (
    <section className="debrief-review" aria-labelledby="debrief-review-title">
      <h3 id="debrief-review-title" className="debrief-section-title">{t('review.title')}</h3>
      <p className="debrief-review-summary">{summaryLine(review)}</p>
      {review.ok && (
        <>
          <div className="debrief-review-body">
            <div className="debrief-review-map">
              <MissionMap
                layer={0}
                path={plan.path}
                waypoints={waypoints}
                title={t('review.map.title')}
                legend={legend}
                track={track}
                stretches={stretches}
                marks={marks}
                focus={focus}
              />
            </div>
            {review.deviations.length > 0 ? (
              <ol className="debrief-log debrief-review-list">
                {review.deviations.map((d) => (
                  <DeviationRow key={d.n} deviation={d} events={summary.events} selected={selected === d.n} onSelect={onSelect} />
                ))}
              </ol>
            ) : (
              <p className="debrief-empty">{t('review.none.detail', { enter: rules.enterM, length: rules.minLengthM })}</p>
            )}
          </div>
          <MarginStrip track={review.track} deviations={review.deviations} />
        </>
      )}
    </section>
  );
}

/** @param {{ summary: object }} props the frozen eva.summary */
export default function RouteReview({ summary }) {
  const review = useMemo(() => reviewRoute(summary), [summary]);
  const [selected, setSelected] = useState(null);   // the deviation framed on the map
  return <RouteReviewView summary={summary} review={review} selected={selected} onSelect={setSelected} />;
}
