import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { MEDA_SOL_PATH, parseMedaSol } from '../data/medaRad.js';
import { HAZARDS_PATH, provenance } from '../data/provenance.js';
import { formatNumber, t } from '../i18n/index.js';
import { eventTiming, missionForObjective, missionSourcePath } from '../sim/missions.js';
import { useMissionStore } from '../state/store.js';
import { medaOverWindow, plannedWalkSec, spaceWeather, walkStartLmstSec } from './outlook.js';
import { useRouteExposure } from './routeExposure.js';
import * as I from '../hud/icons.jsx';
import SourceTag from './SourceTag.jsx';
import { useDataFile } from './useConditions.js';

// The conditions outlook on the mission table (#248), next to go / no-go: the MEDA weather over the planned walk, the
// dust opacity against the terrain-fix limit and the space-weather warning. Honest tags: MEDA is a replayed sol, not a
// forecast, and the warning's lead time is the September 2017 event, measured by RAD in Gale crater, not Jezero.
// Drawn as round badges (#397): an icon in a ring, one large number and one word, with the ring in the colour of the
// condition. No paragraphs: each badge's source tag carries its source and caveats (replayed sol, Gale not Jezero).

// Registry entries for the values that are not store paths; the details fill in from hazards.json once it loads.
provenance.define({
  'outlook.navFixTauMax': {
    tag: 'SIM', label: 'SIM · terrain-fix limit',
    source: 'above this dust opacity the helmet cameras cannot match the orbital map, so there is no terrain fix (hazards.json dust.event.nav_fix_tau_max, our assumption)',
    from: { hazards: ['dust.event.nav_fix_tau_max'] },
  },
  'outlook.clearTau': {
    tag: 'DATA', label: 'Mastcam-Z · Perseverance · Jezero',
    source: 'clear-season dust opacity in Jezero, the air the walk starts in before any storm (hazards.json dust.tau.clear_season)',
    from: { hazards: ['dust.tau.clear_season'] },
  },
  'outlook.sepLeadMin': {
    tag: 'DERIVED', label: 'DERIVED · DONKI + RAD',
    source: 'time from the DONKI flare alert to the particle onset RAD measured at Mars, September 2017, Gale crater, not Jezero (hazards.json radiation.sep_2017.warning_lead_time)',
    from: { hazards: ['radiation.sep_2017.warning_lead_time'] },
  },
});

const R = 42, C = 2 * Math.PI * R;
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * One condition: a ring filled to `share` in the colour of `tone` (ok, caution, warning, or muted when the value is
 * context and sets no limit), an icon in the ring, the number under it and one word.
 */
function Badge({ icon, value, unit, label, share = 1, tone = 'muted', tag = null }) {
  return (
    <figure className={'outlook-badge tone-' + tone}>
      <div className="outlook-ring">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} className="ring-track" />
          <circle cx="50" cy="50" r={R} className={'ring-fill tone-' + tone} strokeDasharray={`${C * clamp01(share)} ${C}`} transform="rotate(-90 50 50)" />
        </svg>
        <span className="outlook-icon">{icon}</span>
      </div>
      <figcaption>
        <b>{value}{unit && <small>{unit}</small>}</b>
        <span>{label}{tag}</span>
      </figcaption>
    </figure>
  );
}

const mid = (c) => (c ? Math.round((c.min + c.max) / 2) : null);
const DUST_CAUTION = 0.75;   // share of the terrain-fix limit from which the dust ring turns amber

/**
 * The badges, from computed values: tested without the data files.
 * @param {{ window: ReturnType<typeof medaOverWindow> | null, dust: object | null, dustSource?: object | null,
 *   space: ReturnType<typeof spaceWeather>, missionId: string, exposure?: { mean: number, min: number } | null }} props
 *   window: the replayed MEDA weather over the planned walk; dust: the opacity against the terrain-fix limit; space: the
 *   radiation alert's state; exposure: the sky exposure along the route (useRouteExposure), 0 to 1
 */
export function OutlookView({ window, dust, dustSource = null, space, missionId, exposure = null }) {
  const ch = (key) => window?.channels[key] ?? null;
  const meda = (key, path) => (ch(key) ? <SourceTag path={path} requireSource={false} source={ch(key).source} /> : null);
  const pressure = mid(ch('pressurePa')), temp = mid(ch('tempC')), wind = ch('windMs') ? Math.round(ch('windMs').max) : null;
  const dustShare = dust ? dust.tau / dust.limit : 0;
  const dustTone = !dust ? 'muted' : dust.over ? 'warning' : dustShare >= DUST_CAUTION ? 'caution' : 'ok';
  const radTone = space.state === 'active' ? 'warning' : space.state === 'scheduled' ? 'caution' : 'ok';
  const dash = '–';

  return (
    <div className="table-panel outlook-strip" role="group" aria-label={t('outlook.title')}>
      <div className="outlook-badges">
        <Badge icon={<I.Gauge />} value={pressure ?? dash} unit={pressure !== null ? 'Pa' : null} label={t('outlook.pressure')} tag={meda('pressurePa', 'environment.pressurePa')} />
        <Badge icon={<I.Thermometer />} value={temp ?? dash} unit={temp !== null ? '°C' : null} label={t('outlook.temperature')} tag={meda('tempC', 'environment.tempC')} />
        <Badge icon={<I.Wind />} value={wind ?? dash} unit={wind !== null ? 'm/s' : null} label={t('outlook.wind')} tag={meda('windMs', 'environment.windMs')} />
        <Badge
          icon={<span className="outlook-glyph">τ</span>}
          value={dust ? formatNumber(dust.tau, 2) : dash}
          label={t('outlook.badge.dust')}
          share={dustShare}
          tone={dustTone}
          tag={dust ? <>{dust.measured ? <SourceTag path="environment.dustOpacity" requireSource={false} source={dustSource} /> : <SourceTag path="outlook.clearTau" requireSource={false} />}<SourceTag path="outlook.navFixTauMax" requireSource={false} /></> : null}
        />
        <Badge
          icon={<I.Radiation />}
          value={t('outlook.rad.' + space.state)}
          label={t('outlook.badge.radiation')}
          tone={radTone}
          tag={<>{space.state === 'scheduled' && <SourceTag path={missionSourcePath(missionId, 'radiation')} requireSource={false} />}<SourceTag path="outlook.sepLeadMin" requireSource={false} /></>}
        />
        <Badge
          icon={<I.Horizon />}
          value={exposure ? Math.round(exposure.mean * 100) : dash}
          unit={exposure ? '%' : null}
          label={t('outlook.badge.exposure')}
          share={exposure ? exposure.mean : 0}
          tag={exposure ? <SourceTag path="map.exposure" requireSource={false} /> : null}
        />
      </div>
    </div>
  );
}

/**
 * @param {{ dust: { tau: number, limit: number, over: boolean, measured: boolean } | null, planCurrent?: boolean }} props
 *   dust: useDustAgainstLimit() of the table, the same the decision reads; planCurrent: the route on the table is the
 *   planned one, so its budget sets the walk window
 */
export default function OutlookStrip({ dust, planCurrent = true }) {
  const medaJson = useDataFile(MEDA_SOL_PATH);
  const hazards = useDataFile(HAZARDS_PATH);
  const meda = useMemo(() => {
    try { return medaJson ? parseMedaSol(medaJson) : null; } catch { return null; }
  }, [medaJson]);
  const s = useMissionStore(useShallow((state) => ({
    budget: state.route.budget, totals: state.route.totals, path: state.route.path, initialLmst: state.mission.initialLmst, sky: state.view.sky,
    objective: state.needs.objective, off: state.hazards.off, radiationActive: state.alerts?.radiation?.active === true,
    dustSource: state.sources['environment.dustOpacity'],
  })));

  const exposure = useRouteExposure(s.path);
  const durationSec = plannedWalkSec({ budget: planCurrent ? s.budget : null, totals: s.totals });
  const start = walkStartLmstSec({ initialLmst: s.initialLmst }, s.sky);
  const window = meda && durationSec !== null ? medaOverWindow(meda, start, durationSec) : null;
  // When this run's alert comes, as its trigger allows (N5): after the storm in the first sortie, at a time in the full EVA.
  const timing = eventTiming(s.objective, 'radiation');
  const space = { ...spaceWeather({
    leadMin: hazards?.values?.['radiation.sep_2017.warning_lead_time']?.value,
    atSec: timing?.earliestSec ?? null,
    off: (s.off ?? []).includes('radiation'),
    active: s.radiationActive,
  }) };
  return <OutlookView window={window} dust={dust} dustSource={s.dustSource ?? null} space={space} missionId={missionForObjective(s.objective).id} exposure={exposure} />;
}
