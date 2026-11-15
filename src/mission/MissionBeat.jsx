import { getLanguage, t, translateText } from '../i18n/index.js';
import { stopReason } from '../data/stops.js';
import SourceTag from '../plan/SourceTag.jsx';
import { useStops } from '../stops/useStops.js';
import { FIRST_STOP_REASON_PATH } from './sources.js';
import { atStopOf, currentBeat, missionForObjective } from '../sim/missions.js';
import { useMissionStore } from '../state/store.js';

/**
 * The first mission's beat lines (#265): one short line per beat saying what it shows and which NASA data is behind
 * it. The mission comes from the crew's objective (src/sim/missions.js); the full EVA has no beat lines, so its
 * screens stay as they were. Each placement reuses an existing pattern: the Walk key strip (`.hint`), the table's
 * notes (`.table-note`) and the debrief's lists.
 */

function useBeat(evaBegun) {
  const objective = useMissionStore((s) => s.needs?.objective);
  const mode = useMissionStore((s) => s.mode);
  const alerts = useMissionStore((s) => s.alerts);
  const events = useMissionStore((s) => s.eva?.events);
  const samples = useMissionStore((s) => s.sampling?.count ?? 0);
  const mission = missionForObjective(objective);
  const stopBeat = mission.beats.find((beat) => beat.id === 'stop');
  const atStop = useMissionStore((s) => atStopOf(stopBeat, s.route?.waypoints, s.navigation));
  return currentBeat(mission, { mode, evaBegun, alerts, events: events ?? [], atStop, samples });
}

/**
 * The Walk beat (walk, the science stop, dust storm, radiation) in the key strip's place at the bottom of the view. App renders it only
 * while the wrist screen's key strip is not up, so the two never share the spot.
 * @param {{ evaBegun: boolean }} props
 */
export function WalkBeat({ evaBegun }) {
  const beat = useBeat(evaBegun);
  if (!beat || beat.id === 'plan') return null;
  return <p className="hint mission-beat" role="status" data-beat={beat.id}>{t(beat.text)}</p>;
}

/**
 * Why the science stop is worth the walk (D10), at the stop until a sample is secured: the stop's one-line reason from
 * stops.json (route_stops[].reason, SIM), in the event banner's place and style, which no alert holds before the storm.
 * The beat line at the bottom says what to do there. No card and no images: no rover has looked at this ground.
 * @param {{ evaBegun: boolean, stops?: Array<object> }} props stops: the parsed stops.json list (loaded when left out)
 */
export function StopBanner({ evaBegun, stops: given }) {
  const beat = useBeat(evaBegun);
  const loaded = useStops();
  if (beat?.id !== 'stop') return null;
  const stop = (given ?? loaded).find((entry) => entry.id === beat.stop);
  const reason = stopReason(stop, getLanguage());
  if (!reason) return null;
  return (
    <div className="event-banner info event-banner-walk mission-stop" role="status" data-stop={stop.id}>
      <div className="event-banner-main">
        <span className="event-level">{translateText(stop.name)}</span>
        <span className="event-text">{reason} <SourceTag path={FIRST_STOP_REASON_PATH} source={null} interactive={false} requireSource={false} /></span>
      </div>
    </div>
  );
}

/**
 * The plan beat, as a note on the mission table, before Begin EVA.
 * @param {{ evaBegun: boolean }} props
 */
export function PlanBeat({ evaBegun }) {
  const beat = useBeat(evaBegun);
  if (beat?.id !== 'plan') return null;
  return <p className="table-note mission-beat" data-beat="plan">{t(beat.text)}</p>;
}

/**
 * The debrief recap: one line per beat of the mission the EVA ran (the objective stays locked from Begin EVA until a
 * restart), as a debrief section of paragraphs like its notes. Nothing for the full EVA.
 * @param {{ objective?: string, className?: string, titleClassName?: string }} props
 */
export function MissionRecap({ objective, className = '', titleClassName = '' }) {
  const stored = useMissionStore((s) => s.needs?.objective);
  const beats = missionForObjective(objective ?? stored).beats;
  if (beats.length === 0) return null;
  return (
    <section className={className} aria-labelledby="mission-recap-title">
      <h3 id="mission-recap-title" className={titleClassName}>{t('mission.recap.title')}</h3>
      {beats.map((beat) => <p key={beat.id} data-beat={beat.id}>{t(beat.text)}</p>)}
    </section>
  );
}
