import { useShallow } from 'zustand/react/shallow';
import { t } from '../i18n/index.js';
import { useMissionStore } from '../state/store.js';
import './habitat.css';

// The airlock's walk zones (collide.js HAB_ZONES). Before Begin EVA the outer hatch stays shut, so walking in there
// gets a line that says why.
const AIRLOCK_ZONES = new Set(['inner', 'airlock', 'hatch']);

/**
 * The habitat HUD (habitat-first flow): inside, before the EVA, the suit is on standby, so none of the EVA HUD shows.
 * Only where the astronaut is, the local Mars time and what to do next: walk to the mission table and press E or click.
 * Reads the store only; `habitat.nearTable` and `habitat.zone` come from the engine bridge 5 times per second.
 */
export default function HabitatHud() {
  const { sol, lmst, nearTable, zone } = useMissionStore(useShallow((s) => ({
    sol: s.mission.sol,
    lmst: s.mission.lmst,
    nearTable: s.habitat?.nearTable === true,
    zone: s.habitat?.zone ?? null,
  })));
  const inAirlock = AIRLOCK_ZONES.has(zone);

  return (
    <div className="habitat-hud" aria-live="polite">
      <section className="habitat-where" aria-label={t('habitat.where')}>
        <p className="habitat-kicker">{t('habitat.kicker')}</p>
        <p className="habitat-site">{t('habitat.site')}</p>
        <p className="habitat-time">
          {sol != null && <span>{t('sol')} {sol}</span>}
          <span><b>{lmst || '––:––'}</b> {t('ui.lmst')}</span>
        </p>
      </section>

      <div className="habitat-dot" aria-hidden="true" />

      {nearTable ? (
        <p className="habitat-prompt habitat-prompt-action">
          <kbd>E</kbd>
          <span>{t('habitat.openTable')}</span>
        </p>
      ) : (
        <p className="habitat-prompt">{inAirlock ? t('habitat.hatchShut') : t('habitat.goToTable')}</p>
      )}
    </div>
  );
}
