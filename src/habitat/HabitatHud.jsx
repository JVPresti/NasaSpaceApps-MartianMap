import { useShallow } from 'zustand/react/shallow';
import { t } from '../i18n/index.js';
import { useMissionStore } from '../state/store.js';
import './habitat.css';

// The airlock's walk zones (collide.js HAB_ZONES). Before Begin EVA the outer hatch stays shut, so walking in there
// gets a line that says why.
const AIRLOCK_ZONES = new Set(['inner', 'airlock', 'hatch']);

/**
 * The habitat HUD (habitat-first flow, #260): inside, before the EVA, the suit is on standby, so none of the EVA HUD
 * shows. Only where the astronaut is and the local Mars time. The table's own prompt ("[E] Open plan", "[X] Finish
 * EVA", src/state/tableActions.js) floats over the table in the cabin, so this HUD adds a line only in the airlock,
 * where the hatch stays shut until Begin EVA. Reads the store only; `habitat.zone` comes from the engine bridge.
 */
export default function HabitatHud() {
  const { sol, lmst, zone } = useMissionStore(useShallow((s) => ({
    sol: s.mission.sol,
    lmst: s.mission.lmst,
    zone: s.habitat?.zone ?? null,
  })));

  return (
    <div className="habitat-hud" aria-live="polite">
      <section className="habitat-where" aria-label={t('habitat.where')}>
        <p className="habitat-kicker">{t('habitat.kicker')}</p>
        <p className="habitat-site">{t('habitat.site')}</p>
        <p className="habitat-time">
          {sol != null && <span>{t('sol')} {sol}</span>}
          <span><b>{lmst || '--:--'}</b> {t('ui.lmst')}</span>
        </p>
      </section>

      {AIRLOCK_ZONES.has(zone) && <p className="habitat-prompt">{t('habitat.hatchShut')}</p>}
    </div>
  );
}
