import { useId, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { MEDA_SOL_PATH, parseMedaSol } from '../data/medaRad.js';
import { HAZARDS_PATH, provenance } from '../data/provenance.js';
import { formatNumber, t, translateText } from '../i18n/index.js';
import { eventTiming, missionForObjective, missionSourcePath } from '../sim/missions.js';
import dustStorm from '../sim/events/dust-storm.json';
import { useMissionStore } from '../state/store.js';
import { medaOverWindow, plannedWalkSec, spaceWeather, walkStartLmstSec } from './outlook.js';
import { exposureText, useRouteExposure } from './routeExposure.js';
import SourceTag from './SourceTag.jsx';
import { eventTimingText } from './tableFormat.js';
import { useDataFile } from './useConditions.js';

// The conditions outlook on the mission table (#248), next to go / no-go: the MEDA weather over the planned walk, the
// dust opacity against the terrain-fix limit and the space-weather warning. Honest tags: MEDA is a replayed sol, not a
// forecast, and the warning's lead time is the September 2017 event, measured by RAD in Gale crater, not Jezero.
// Compact by default (#397): only the dust opacity and the space weather bear on go / no-go, so the strip opens with
// those and one short line; More detail shows the MEDA weather, the full radiation note and the route's sky exposure.

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

const lowerFirst = (text) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

const range = (min, max) => {
  const a = formatNumber(min, 0), b = formatNumber(max, 0);
  return a === b ? a : t('outlook.range', { min: a, max: b });
};

/** One figure of the strip: a label, the value and its unit, then its source tag and an optional note. */
function Cell({ label, tag, value, unit, tone, note }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd><b className={tone ? 'tone-' + tone : undefined}>{value}</b>{unit && <span>{unit}</span>}</dd>
      {(tag || note) && <small>{tag}{note}</small>}
    </div>
  );
}

/**
 * The strip itself, from computed values: tested without the data files.
 * @param {{ window: ReturnType<typeof medaOverWindow> | null, dust: object | null, dustSource?: object | null,
 *   space: ReturnType<typeof spaceWeather>, missionId: string, exposure?: { label: string, value: string, note: string } | null,
 *   detail?: boolean, onToggleDetail?: () => void }} props
 *   exposure: the sky exposure along the route (routeExposure.exposureText), the route's own radiation figure;
 *   detail: show everything (More detail), otherwise only dust and space weather with a short radiation line
 */
export function OutlookView({ window, dust, dustSource = null, space, missionId, exposure = null, detail = false, onToggleDetail }) {
  const detailId = useId();
  const weather = (key, path, label, unit) => {
    const c = window?.channels[key] ?? null;
    return (
      <Cell label={label} unit={c ? unit : null} value={c ? range(c.min, c.max) : '–'}
        tag={c ? <SourceTag path={path} requireSource={false} source={c.source} /> : null} />
    );
  };
  const lead = space.leadMin ?? '–';
  const spaceLine = space.state === 'active' ? t('outlook.space.active')
    : space.state === 'off' ? t('outlook.space.off')
      : space.state === 'scheduled' ? t('outlook.space.scheduled', { when: lowerFirst(space.when ?? eventTimingText({ earliestSec: space.atSec })), lead })
        : t('outlook.space.watch', { lead });
  const spaceShort = space.state === 'active' ? t('outlook.space.active')
    : space.state === 'off' ? t('outlook.space.off')
      : space.state === 'scheduled' ? t('outlook.space.scheduled.short', { when: lowerFirst(space.when ?? eventTimingText({ earliestSec: space.atSec })) })
        : t('outlook.space.watch.short');

  return (
    <div className={'table-panel outlook-strip' + (detail ? ' is-detail' : '')} id={detailId}>
      <div className="table-panel-head">
        <p className="table-label">{t('outlook.title')}</p>
        <p className="table-label outlook-window">
          {window ? t('outlook.window', { from: window.fromLmst, to: window.toLmst }) : t('outlook.window.waiting')}
        </p>
        <button type="button" className="outlook-toggle" aria-expanded={detail} aria-controls={detailId} onClick={onToggleDetail}>
          {t(detail ? 'outlook.less' : 'outlook.more')}
        </button>
      </div>
      <dl className="outlook-grid">
        {detail && weather('pressurePa', 'environment.pressurePa', t('outlook.pressure'), 'Pa')}
        {detail && weather('tempC', 'environment.tempC', t('outlook.temperature'), '°C')}
        {detail && weather('windMs', 'environment.windMs', t('outlook.wind'), 'm/s')}
        <Cell
          label={t('outlook.dust')}
          tag={dust ? (dust.measured ? <SourceTag path="environment.dustOpacity" requireSource={false} source={dustSource} /> : <SourceTag path="outlook.clearTau" requireSource={false} />) : null}
          value={dust ? `τ ${formatNumber(dust.tau, 2)}` : '–'}
          tone={dust ? (dust.over ? 'warning' : 'ok') : null}
          note={dust ? <>{t(dust.over ? 'outlook.dust.over' : 'outlook.dust.limit', { limit: formatNumber(dust.limit, 0) })}<SourceTag path="outlook.navFixTauMax" requireSource={false} /></> : null}
        />
        <Cell
          label={t('outlook.space')}
          tag={<SourceTag path="outlook.sepLeadMin" requireSource={false} />}
          value={lead}
          unit={t('outlook.space.lead.unit')}
          tone={space.state === 'active' ? 'warning' : null}
        />
      </dl>
      <p className="table-note">
        {detail ? spaceLine : spaceShort}
        {space.state === 'scheduled' && <SourceTag path={missionSourcePath(missionId, 'radiation')} requireSource={false} />}
        {detail && <>{' '}{t('outlook.replay')}</>}
      </p>
      {/* The route's own radiation figure (Exposure layer): how open the sky is along it, so it moves with the route. */}
      {detail && exposure && (
        <p className="table-note outlook-exposure">
          <b>{exposure.label}</b>: {exposure.value}<SourceTag path="map.exposure" requireSource={false} /> {exposure.note}
        </p>
      )}
    </div>
  );
}

/**
 * @param {{ dust: { tau: number, limit: number, over: boolean, measured: boolean } | null, planCurrent?: boolean }} props
 *   dust: useDustAgainstLimit() of the table, the same the decision reads; planCurrent: the route on the table is the
 *   planned one, so its budget sets the walk window
 */
export default function OutlookStrip({ dust, planCurrent = true }) {
  const [detail, setDetail] = useState(false);
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

  const exposure = exposureText(useRouteExposure(s.path));
  const durationSec = plannedWalkSec({ budget: planCurrent ? s.budget : null, totals: s.totals });
  const start = walkStartLmstSec({ initialLmst: s.initialLmst }, s.sky);
  const window = meda && durationSec !== null ? medaOverWindow(meda, start, durationSec) : null;
  // When this run's alert comes, as its trigger allows (N5): after the storm in the first sortie, at a time in the full EVA.
  const timing = eventTiming(s.objective, 'radiation');
  const when = eventTimingText(timing, (id) => lowerFirst(translateText(id === dustStorm.id ? dustStorm.label : id)));
  const space = { ...spaceWeather({
    leadMin: hazards?.values?.['radiation.sep_2017.warning_lead_time']?.value,
    atSec: timing?.earliestSec ?? null,
    off: (s.off ?? []).includes('radiation'),
    active: s.radiationActive,
  }), when };
  return (
    <OutlookView window={window} dust={dust} dustSource={s.dustSource ?? null} space={space} missionId={missionForObjective(s.objective).id}
      exposure={exposure} detail={detail} onToggleDetail={() => setDetail((value) => !value)} />
  );
}
