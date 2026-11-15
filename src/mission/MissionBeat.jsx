import { t } from '../i18n/index.js';
import { currentBeat, missionForObjective } from '../sim/missions.js';
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
  return currentBeat(missionForObjective(objective), { mode, evaBegun, alerts, events: events ?? [] });
}

/**
 * The Walk beat (walk, dust storm, radiation) in the key strip's place at the bottom of the view. App renders it only
 * while the wrist screen's key strip is not up, so the two never share the spot.
 * @param {{ evaBegun: boolean }} props
 */
export function WalkBeat({ evaBegun }) {
  const beat = useBeat(evaBegun);
  if (!beat || beat.id === 'plan') return null;
  return <p className="hint mission-beat" role="status" data-beat={beat.id}>{t(beat.text)}</p>;
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
