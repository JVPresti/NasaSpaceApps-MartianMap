import { useShallow } from 'zustand/react/shallow';
import { formatEva } from '../hud/format.js';
import { useMissionStore } from '../state/store.js';
import SourceTag from './SourceTag.jsx';

/**
 * Mission clock for the Plan mode top bar: sol, local mean solar time and EVA time, from the clock of #112.
 * The Walk HUD shows the same fields in its own pills.
 */
export default function MissionClock() {
  const { sol, lmst, elapsedSec } = useMissionStore(
    useShallow((s) => ({ sol: s.mission.sol, lmst: s.mission.lmst, elapsedSec: s.mission.elapsedSec })),
  );

  return (
    <div className="mission-clock" role="group" aria-label="Mission clock">
      <span className="clock-item">
        <span className="clock-label">Sol</span>
        <b>{Number.isFinite(sol) ? sol : '–'}</b>
      </span>
      <span className="clock-item">
        <b>{lmst || '––:––'}</b>
        <span className="unit">LMST</span>
      </span>
      <span className="clock-item">
        <span className="clock-label">EVA</span>
        <b>{formatEva(elapsedSec)}</b>
        <span className="unit">h:mm</span>
      </span>
      <SourceTag path="mission.lmst" />
    </div>
  );
}
