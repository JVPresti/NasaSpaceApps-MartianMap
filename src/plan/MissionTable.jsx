import { useMemo, useState } from 'react';
import { t, translateText } from '../i18n/index.js';
import { useShallow } from 'zustand/react/shallow';
import { HAZARDS_PATH } from '../data/provenance.js';
import { imageUrl, stopForWaypoint } from '../data/stops.js';
import EventBanner from '../events/EventBanner.jsx';
import { formatEva } from '../hud/format.js';
import dustStorm from '../sim/events/dust-storm.json';
import lowOxygenCaution from '../sim/events/low-oxygen-caution.json';
import lowOxygenWarning from '../sim/events/low-oxygen-warning.json';
import radiation from '../sim/events/radiation.json';
import { openSources } from '../sources/sourcesStore.js';
import { setHazardEnabled, setLayer, setRouteDecision, useMissionStore } from '../state/store.js';
import { PlanStopCard } from '../stops/ScienceStops.jsx';
import { cardImage, stopHasContent } from '../stops/content.js';
import { toggleWaypoint } from '../stops/selection.js';
import { useStops } from '../stops/useStops.js';
import { PROFILE_IDS } from '../sim/routeProfiles.js';
import { eventStartSec } from '../sim/missions.js';
import { PlanBeat } from '../mission/MissionBeat.jsx';
import { LAYERS, SLOPE_LIMITS } from './layers.js';
import LayerLegend from './LayerLegend.jsx';
import LayerPreview from './LayerPreview.jsx';
import MissionMap from './MissionMap.jsx';
import { layerButtonText, layerMapTitle } from './tableLayers.js';
import { decisionFor } from './decision.js';
import NeedsPanel from './NeedsPanel.jsx';
import { droppedWhy, planReasonLines, stopLine } from './routeWhy.js';
import { useDataFile, useDustAgainstLimit } from './useConditions.js';
import RouteProfiles from './RouteProfiles.jsx';
import SourceTag from './SourceTag.jsx';
import SuitFigure from './SuitFigure.jsx';
import dustArt from '../assets/ui/hazard_dust.webp';
import oxygenArt from '../assets/ui/hazard_oxygen.webp';
import radiationArt from '../assets/ui/hazard_radiation.webp';
import { fixed as num, routeMetrics } from './routePlan.js';
import './table.css';

// The mission table (#11): the screen in the habitat where the EVA is planned, before the helmet view. Four steps
// (site, route, hazards, suit check); the EVA begins from the route or the suit check. The Walk view then needs no
// planning controls. Every number comes from the store, the planner or the data files, as in the old Plan panels.

const TABS = [
  { id: 'site', label: 'table.tab.site' },
  { id: 'route', label: 'table.tab.route' },
  { id: 'hazards', label: 'table.tab.hazards' },
  { id: 'suit', label: 'table.tab.suit' },
];

const minutes = (sec) => Math.round(sec / 60);
const peak = (event, path) => Math.max(...event.timeline.map((step) => step.set?.[path]).filter(Number.isFinite));

// The hazards come from the event files the simulation runs (src/sim/events), so the briefing cannot drift from them.
// `events` are the event ids a checkbox switches; low oxygen is one hazard with a caution and a warning.
const HAZARDS = [
  {
    id: 'dust-storm',
    art: dustArt,
    get artAlt() { return t('table.hazard.dust.art'); },
    events: [dustStorm.id],
    get name() { return translateText(dustStorm.label); },
    level: 'warning',
    get levelLabel() { return t('table.hazard.level.warning'); },
    get when() { return t('table.hazard.when.min', { min: minutes(eventStartSec(useMissionStore.getState().needs?.objective, dustStorm.id)) }); },
    get happens() {
      return t('table.hazard.dust.happens', { opacity: num(peak(dustStorm, 'environment.dustOpacity')), sec: dustStorm.timeline.at(-1).atSec });
    },
    get alert() { return translateText(dustStorm.alert.text); },
    get act() { return t('table.hazard.dust.act'); },
    get basis() { return t('table.hazard.dust.basis'); },
  },
  {
    id: 'radiation',
    art: radiationArt,
    get artAlt() { return t('table.hazard.radiation.art'); },
    events: [radiation.id],
    get name() { return translateText(radiation.label); },
    level: 'warning',
    get levelLabel() { return t('table.hazard.level.warning'); },
    get when() { return t('table.hazard.when.min', { min: minutes(eventStartSec(useMissionStore.getState().needs?.objective, radiation.id)) }); },
    get happens() { return t('table.hazard.radiation.happens', { rate: num(peak(radiation, 'environment.doseRateUgyH'), 1) }); },
    get alert() { return translateText(radiation.alert.text); },
    get act() { return t('table.hazard.radiation.act'); },
    get basis() { return t('table.hazard.radiation.basis'); },
  },
  {
    id: 'low-oxygen',
    art: oxygenArt,
    get artAlt() { return t('table.hazard.oxygen.art'); },
    events: [lowOxygenCaution.id, lowOxygenWarning.id],
    get name() { return t('table.hazard.oxygen.name'); },
    level: 'caution',
    get levelLabel() { return t('table.hazard.level.caution.then.warning'); },
    get when() { return t('table.hazard.oxygen.when', { min: minutes(lowOxygenCaution.trigger.value) }); },
    get happens() { return t('table.hazard.oxygen.happens'); },
    get alert() {
      return t('table.hazard.oxygen.alert', { caution: translateText(lowOxygenCaution.alert.text), warning: translateText(lowOxygenWarning.alert.text) });
    },
    get act() { return t('table.hazard.oxygen.act'); },
    get basis() { return t('table.hazard.oxygen.basis'); },
  },
];

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

/** "WP1 · channel floor" → ["WP1", "Channel floor"]; the start is the habitat and the last stop is the end. */
function stopLabel(name, index, count) {
  if (index === 0) return ['HAB', t('table.habitat')];
  const [code, rest] = name.includes(' · ') ? name.split(' · ') : [index === count - 1 ? 'END' : `WP${index}`, name];
  return [index === count - 1 ? 'END' : code, sentence(translateText(rest))];
}

function Big({ value, unit, label, tone }) {
  return (
    <div className="table-big">
      <p><b className={tone ? 'tone-' + tone : undefined}>{value}</b>{unit && <span>{unit}</span>}</p>
      <span>{label}</span>
    </div>
  );
}

/**
 * The stops in walking order, each with the distance of the leg that reaches it. While the route on the table is the
 * planned one, each stop also says the work planned there (#247) and why its leg runs where it does (#246), and the
 * stops the objective allows but the plan left out follow, with the reason.
 * @param {{ waypoints: Array<object>, legs: Array<object>, explain?: Array<object>, dropped?: Array<object> }} props
 *   explain and dropped: route.explain and route.dropped, empty when an event re-plan replaced the planned route
 */
function Stops({ waypoints, legs, explain = [], dropped = [] }) {
  const stops = useStops();
  return (
    <ol className="table-stops">
      {waypoints.map((waypoint, k) => {
        const [code, label] = stopLabel(waypoint.name, k, waypoints.length);
        const stop = stopForWaypoint(stops, waypoint.name);
        const science = stopHasContent(stop);
        const leg = k > 0 ? legs[k - 1] : null;
        const distance = k === 0 ? t('table.stop.start') : Number.isFinite(leg?.distanceM) ? `${Math.round(leg.distanceM)} m` : '';
        const line = k > 0 ? stopLine({ workSec: leg?.workSec ?? waypoint.workSec, explain: explain[k - 1] }) : null;
        return (
          <li key={k} className={science ? 'science' : undefined}>
            <code>{code}</code>
            {science ? (
              <button type="button" className="table-stop-name" title={t('table.open.science.card')} onClick={() => toggleWaypoint(waypoint.name)}>{label}</button>
            ) : (
              <span className="table-stop-name">{label}</span>
            )}
            <span className="table-stop-dist">{distance}</span>
            {line && <small className="table-stop-why">{line}</small>}
          </li>
        );
      })}
      {dropped.map((stop) => (
        <li key={'dropped-' + stop.id} className="dropped">
          <code>–</code>
          <span className="table-stop-name">{translateText(stop.name)}</span>
          <span className="table-stop-dist">{t('table.stop.left.out')}</span>
          <small className="table-stop-why">{droppedWhy(stop)}</small>
        </li>
      ))}
    </ol>
  );
}

function SuitNow() {
  const suit = useMissionStore(useShallow((s) => ({
    o2: s.suit.oxygenPct, battery: s.suit.batteryPct, pressure: s.suit.pressurePsi, o2Start: s.needs.o2Pct, batteryStart: s.needs.batteryPct,
  })));
  const hazards = useDataFile(HAZARDS_PATH);
  // Before the EVA the suit runner has not started: the suit holds what the crew set in their needs (a full tank and
  // battery by default), at its nominal pressure (hazards.json). The plan's budget starts from the same values.
  const o2 = Number.isFinite(suit.o2) ? suit.o2 : Number.isFinite(suit.o2Start) ? suit.o2Start : 100;
  const battery = Number.isFinite(suit.battery) ? suit.battery : Number.isFinite(suit.batteryStart) ? suit.batteryStart : 100;
  const pressure = Number.isFinite(suit.pressure) ? suit.pressure : hazards?.values?.['suit.pressure.nominal']?.value;
  const bar = (pct) => <span className="table-bar"><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>;
  return (
    <dl className="table-suit-now">
      <div><dt>{t('table.oxygen')}</dt><dd><b>{num(o2)}</b><span>%</span></dd>{bar(o2)}</div>
      <div><dt>{t('table.battery')}</dt><dd><b>{num(battery)}</b><span>%</span></dd>{bar(battery)}</div>
      <div><dt>{t('table.pressure')}</dt><dd><b>{Number.isFinite(pressure) ? num(pressure, 1) : '–'}</b><span>psi</span></dd></div>
    </dl>
  );
}

const pct1 = (value) => num(value, 1);

/** One stacked bar: segments are [share 0-100, class, label]. */
function Stack({ parts, label }) {
  return (
    <div className="budget-stack" role="img" aria-label={label}>
      {parts.filter(([share]) => share > 0).map(([share, kind], k) => (
        <span key={k} className={'seg-' + kind} style={{ flexGrow: share }} />
      ))}
    </div>
  );
}

/**
 * What the EVA spends, as budgets: time (out, back, spare, reserve) and the oxygen and battery tanks (out, back, left).
 * Every share comes from route.totals (src/sim/legCosts.js).
 */
function BudgetPanel({ totals, metrics }) {
  const tot = totals;
  const minutes = (sec) => Math.round(sec / 60);
  const reserveSec = 30 * 60;
  const time = tot ? [[tot.timeSec, 'out'], [tot.roundTrip ? 0 : tot.returnTimeSec, 'back'], [Math.max(0, tot.marginSec), 'spare'], [reserveSec, 'reserve']] : [];
  const tank = (outPct, leftPct) => [[outPct, 'out'], [Math.max(0, 100 - outPct - leftPct), 'back'], [leftPct, 'left']];
  return (
    <div className="table-panel budget-panel">
      <p className="table-label">{t('table.budget.title')}</p>

      <div className="budget-row">
        <div className="budget-head"><span>{t('table.time')}</span><b>{tot ? minutes(tot.timeSec) : metrics.time.value}<small>{t('table.budget.min.out')}</small></b></div>
        {tot && (
          <Stack
            parts={time}
            label={t('table.budget.time.label', { out: minutes(tot.timeSec), back: minutes(tot.returnTimeSec), spare: minutes(tot.marginSec) })}
          />
        )}
        {tot && (
          <p className="budget-key">
            <i className="seg-out" />{t('table.budget.key.out', { min: minutes(tot.timeSec) })}{' '}
            <i className="seg-back" />{tot.roundTrip ? t('table.budget.key.round.trip') : t('table.budget.key.back', { min: minutes(tot.returnTimeSec) })}{' '}
            <i className="seg-spare" />{t('table.budget.key.spare', { min: minutes(tot.marginSec) })}{' '}
            <i className="seg-reserve" />{t('table.budget.key.reserve')}
          </p>
        )}
      </div>

      <div className="budget-row">
        <div className="budget-head"><span>{t('table.oxygen')}</span><b>{metrics.o2.value}<small>{t('table.budget.g.out', { pct: pct1(tot?.o2Pct) })}</small></b></div>
        {tot && <Stack parts={tank(tot.o2Pct, tot.arrivalO2Pct)} label={t('table.budget.oxygen.label', { out: pct1(tot.o2Pct), left: num(tot.arrivalO2Pct) })} />}
      </div>

      <div className="budget-row">
        <div className="budget-head"><span>{t('table.battery')}</span><b>{metrics.battery.value}<small>{t('table.budget.wh.out', { pct: pct1(tot?.batteryPct) })}</small></b></div>
        {tot && <Stack parts={tank(tot.batteryPct, tot.arrivalBatteryPct)} label={t('table.budget.battery.label', { out: pct1(tot.batteryPct), left: num(tot.arrivalBatteryPct) })} />}
        {tot && (
          <p className="budget-key">
            <i className="seg-out" />{t('table.budget.key.way.out')}{' '}
            <i className="seg-back" />{t('table.budget.key.way.back')}{' '}
            <i className="seg-left" />{t('table.budget.key.left')}
          </p>
        )}
      </div>

      <p className="table-note">{t('table.budget.note')}</p>
    </div>
  );
}

/** A ring gauge, 0 to 100 %. */
function Ring({ value, label, tone = 'ok' }) {
  const r = 42, c = 2 * Math.PI * r;
  const share = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;
  return (
    <figure className="ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ring-track" />
        <circle cx="50" cy="50" r={r} className={'ring-fill tone-' + tone} strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <figcaption><b>{Number.isFinite(value) ? num(value) : '–'}<small>%</small></b><span>{label}</span></figcaption>
    </figure>
  );
}

/** What is left when the walk ends back at the airlock, and the margin over the reserve. */
function ReturnPanel({ totals }) {
  const tot = totals;
  const marginMin = tot ? Math.round(tot.marginSec / 60) : null;
  const tone = tot ? (tot.status === 'nominal' ? 'ok' : tot.status) : null;
  return (
    <div className="table-panel return-panel">
      <p className="table-label">{t('table.return.title')}</p>
      <div className="ring-pair">
        <Ring value={tot?.arrivalO2Pct} label={t('table.return.oxygen.left')} />
        <Ring value={tot?.arrivalBatteryPct} label={t('table.return.battery.left')} />
      </div>
      <div className="return-margin">
        <b className={tone ? 'tone-' + tone : undefined}>{tot ? `${marginMin >= 0 ? '+' : ''}${marginMin}` : '–'}<small>min</small></b>
        {/* route.totals.marginSec is capped at the 8 h EVA limit (#208); the tag's details say so. */}
        <span>{t('table.return.margin')}<SourceTag path="route.totals.marginSec" /></span>
      </div>
    </div>
  );
}

function Actions({ children }) {
  return <div className="table-actions">{children}</div>;
}

function BeginButton({ decision, evaBegun, onBeginEva }) {
  const path = useMissionStore((s) => s.route.path);
  // Go / No-go gates the start only. Once the EVA is under way the astronaut is already outside and the clock runs,
  // so a route that now reads No-go (oxygen spent, a failed re-plan, the storm's dust) must not keep them at the table.
  const blocked = evaBegun ? false : !path || !decision.go;
  return (
    <button
      type="button"
      className="table-primary"
      disabled={blocked || !onBeginEva}
      onClick={() => { if (!evaBegun) setRouteDecision('go'); onBeginEva?.(); }}
    >
      {evaBegun ? t('table.continue.eva') : t('table.begin.eva')}
    </button>
  );
}

/** A tab id the table has, or the first step. */
const tabOrSite = (id) => (TABS.some((item) => item.id === id) ? id : TABS[0].id);

/**
 * @param {{ planner: { status: string, error: string | null, replan: () => void },
 *   waypoints: Array<{ name: string, x: number, z: number }>, evaBegun?: boolean, onBeginEva?: () => void,
 *   onControls?: () => void, initialTab?: 'site' | 'route' | 'hazards' | 'suit' }} props
 *   initialTab: the step the table opens on (the habitat table's "Open plan" opens Route); step 1 by default
 */
export default function MissionTable({ planner, waypoints, evaBegun = false, onBeginEva, onControls, initialTab = 'site' }) {
  const [tab, setTab] = useState(() => tabOrSite(initialTab));
  // A new initialTab while the table is open moves to that step; set while rendering, as React suggests for state
  // that follows a prop.
  const [openedOn, setOpenedOn] = useState(initialTab);
  if (initialTab !== openedOn) {
    setOpenedOn(initialTab);
    setTab(tabOrSite(initialTab));
  }
  const [traverse, setTraverse] = useState(true);   // Perseverance's drives on the map (#249), on both map steps
  const route = useMissionStore((s) => s.route);
  const layer = useMissionStore((s) => s.view.layer);
  const clock = useMissionStore(useShallow((s) => ({ lmst: s.mission.lmst, elapsedSec: s.mission.elapsedSec })));
  const stops = useStops();
  const science = useMemo(() => new Set(waypoints.filter((w) => stopHasContent(stopForWaypoint(stops, w.name))).map((w) => w.name)), [waypoints, stops]);
  const index = TABS.findIndex((item) => item.id === tab);
  const totals = route.totals;
  const metrics = Object.fromEntries(routeMetrics(route).map((m) => [m.key, m]));
  const steepTone = route.steepestSlopeDeg > SLOPE_LIMITS.noGo ? 'warning' : route.steepestSlopeDeg > SLOPE_LIMITS.caution ? 'caution' : null;
  // Route profiles (#245): the one in use is drawn as the route in its colour, the others dashed, until the EVA begins.
  const profiles = route.profiles;
  const inUse = PROFILE_IDS.find((id) => profiles?.[id]?.ok && profiles[id].path === route.path) ?? null;
  const alternatives = useMemo(
    () => (inUse && !evaBegun ? PROFILE_IDS.filter((id) => id !== inUse && profiles[id]?.ok).map((id) => ({ id, path: profiles[id].path })) : []),
    [profiles, inUse, evaBegun],
  );
  // The plan's own fields (the crew's budget, why each leg bends, the stops left out) describe the planned route. An
  // event re-plan to a shelter replaces route.path and leaves them as they were, so they show only while the route on
  // the table is one of the planned profiles.
  const planCurrent = inUse !== null;
  const objective = useMissionStore((s) => s.needs.objective);
  const dust = useDustAgainstLimit();
  const decision = decisionFor({ planner, totals, budget: planCurrent ? route.budget : null, dust });
  const whyLines = planCurrent ? planReasonLines(route.planReasons) : [];

  const onTabKey = (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    setTab(next.id);
    document.getElementById(`table-tab-${next.id}`)?.focus();
  };

  const map = (props) => (
    <div className="table-centre">
      <MissionMap path={route.path} waypoints={waypoints} science={science} legs={route.legs ?? []} onScience={toggleWaypoint} traverse={traverse} {...props} />
      <div className="table-overlay">
        <EventBanner />
        <PlanStopCard />
      </div>
    </div>
  );

  let body;
  if (tab === 'site') {
    const target = stopForWaypoint(stops, waypoints.at(-1)?.name ?? 'Cheyava Falls');
    // The close-up of the leopard spots (PIA26368) fills a tall panel better than the wide overhead mosaic.
    const image = target ? (target.images?.find((i) => i?.file && i?.credit && !i.reference_match) ?? cardImage(target)) : null;
    body = (
      <>
        <section className="table-left">
          <h2 className="table-h">{t('ui.cheyava.falls')}</h2>
          <p className="table-text">{t('table.site.text')}</p>
          {/* The first mission's plan beat (#265, src/mission/MissionBeat.jsx): nothing for the full EVA. */}
          <PlanBeat evaBegun={evaBegun} />
          {image && (
            <figure className="table-panel table-fill table-photo">
              <img src={imageUrl(image)} alt={image.alt} width={image.width_px} height={image.height_px} />
              <figcaption><b>{t('table.site.photo')}</b> · {t('table.site.image.credit', { credit: image.credit })}</figcaption>
            </figure>
          )}
        </section>
        {map({ layer: 0, route: false, title: t('table.layer.hirise') })}
        <section className="table-right">
          <div className="table-panel table-fill">
            <p className="table-label">{t('table.site.where')}</p>
            <dl className="table-stats">
              <div><dd><b>18.4975</b><span>° N</span></dd><dt>{t('table.site.latitude')}</dt></div>
              <div><dd><b>77.3053</b><span>° E</span></dd><dt>{t('table.site.longitude')}</dt></div>
              <div><dd><b>785</b><span>m</span></dd><dt>{t('table.site.from.habitat')}</dt></div>
              <div><dd><b>221</b><span>m</span></dd><dt>{t('table.site.relief')}</dt></div>
              <div><dd><b>1422 × 1500</b><span>m</span></dd><dt>{t('table.site.area')}</dt></div>
            </dl>
            <p className="table-note">{t('table.site.origin')}</p>
          </div>
          <Actions>
            <button type="button" className="table-primary" onClick={() => setTab('route')}>{t('table.next.route')}</button>
            <button type="button" className="table-secondary" onClick={openSources}>{t('ui.sources.188')}</button>
          </Actions>
        </section>
      </>
    );
  } else if (tab === 'route') {
    // The buttons and the legend come from layers.js (the list I2b's layer work changes), worded by tableLayers.js.
    const current = LAYERS.find((item) => item.index === layer) ?? LAYERS[0];
    body = (
      <>
        <section className="table-left">
          <h2 className="table-h">{t(`needs.objective.${objective}`)}</h2>
          <p className="table-text">{t(`needs.objective.${objective}.text`)}</p>
          {/* The crew's needs take the place of the compact hazard switches, which the Hazards step has in full. */}
          <NeedsPanel locked={evaBegun} />
          <div className="table-panel table-fill">
            <p className="table-label">{t('table.stops')}</p>
            <Stops waypoints={waypoints} legs={route.legs ?? []} explain={planCurrent ? route.explain ?? [] : []} dropped={planCurrent ? route.dropped ?? [] : []} />
          </div>
          <div className="table-panel">
            {/* Perseverance's drives on or off (#249): an overlay, so it sits by the heading, apart from the layer grid
                (layers.js now has six layers, which fill two rows). How to zoom and pan is the heading's tooltip. */}
            <div className="table-panel-head table-layers-head">
              <p className="table-label" title={t('table.map.help')}>{t('table.map.layer')}</p>
              <button type="button" className={traverse ? 'table-overlay-toggle on' : 'table-overlay-toggle'} aria-pressed={traverse}
                title={t('map.traverse.toggle.title')} onClick={() => setTraverse((value) => !value)}>
                <i aria-hidden="true" />{t('map.traverse.toggle')}
              </button>
            </div>
            <div className="table-layers" role="group" aria-label={t('table.map.layer')}>
            {LAYERS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={layer === item.index ? 'on' : undefined}
                aria-pressed={layer === item.index}
                title={t('table.layer.button.title', { title: layerMapTitle(item) })}
                onClick={() => setLayer(item.index)}
              >
                {layerButtonText(item)}
                <LayerPreview layer={item} />
              </button>
            ))}
            </div>
          </div>
        </section>
        {map({ layer: current.index, title: layerMapTitle(current), legend: <LayerLegend layer={current} />, alternatives, routeClass: inUse ? 'profile-' + inUse : '' })}
        <section className="table-right">
          <div className="table-panel">
            <div className="table-panel-head">
              <p className="table-label">{t('table.tab.route')}</p>
              <button type="button" className="table-link" onClick={planner.replan} disabled={planner.status === 'planning'}>
                {planner.status === 'planning' ? t('table.planning') : t('table.replan')}
              </button>
            </div>
            <div className="table-grid2">
              <Big value={metrics.distance.value} unit="km" label={t('ui.distance')} />
              <Big value={metrics.time.value} unit="min" label={t('ui.walk.out')} />
              <Big value={metrics.climb.value} unit="m" label={t('ui.climb')} />
              <Big value={metrics.steepest.value} unit="°" label={t('table.steepest.slope')} tone={steepTone} />
            </div>
            {route.skipped?.length > 0 && <p className="table-note tone-caution">{t('table.replanned.skipped', { stops: route.skipped.join(' · ') })}</p>}
            {/* Why this route (#246), plan level: the crew rules, the risk and the budget; each leg's reason is in the stop
                list. A no-go reason comes first, so a locked Begin EVA always says why. */}
            {!decision.go && decision.tone && <p className={'table-note tone-' + decision.tone}>{decision.text}</p>}
            {whyLines.length > 0 && <p className="table-note route-why">{whyLines.join(' ')}</p>}
          </div>
          {/* The comparison takes the place of the suit readout, which the Suit step shows in full (#245). */}
          <div className="table-panel table-fill profiles-panel">
            <RouteProfiles locked={evaBegun} />
          </div>
          <Actions>
            <BeginButton decision={decision} evaBegun={evaBegun} onBeginEva={onBeginEva} />
            <div className="table-pair">
              <button type="button" className="table-secondary" onClick={onControls}>{t('menu.controls')}</button>
              <button type="button" className="table-secondary" onClick={openSources}>{t('ui.sources.188')}</button>
            </div>
          </Actions>
        </section>
      </>
    );
  } else if (tab === 'hazards') {
    body = (
      <div className="table-hazards">
        <div className="table-hazards-head">
          <div>
            <h2 className="table-h">{t('table.hazards.title')}</h2>
          </div>
          <p className="table-text">{t('table.hazards.text')}</p>
        </div>
        <ul className="table-hazard-cards">
          {HAZARDS.map((hazard) => (
            <li key={hazard.id} className={'table-panel hazard-' + hazard.level}>
              <img className="table-hazard-art" src={hazard.art} alt={hazard.artAlt} width="640" height="640" />
              <div className="table-hazard-title">
                <h3>{hazard.name}</h3>
                <span><i />{hazard.levelLabel}</span>
              </div>
              <dl>
                <div><dt>{t('table.hazard.when')}</dt><dd>{hazard.when}</dd></div>
                <div><dt>{t('table.hazard.what.happens')}</dt><dd>{hazard.happens}</dd></div>
                <div><dt>{t('table.hazard.the.alert')}</dt><dd>{hazard.alert}</dd></div>
                <div><dt>{t('table.hazard.what.to.do')}</dt><dd>{hazard.act}</dd></div>
              </dl>
              <p className="table-note">{hazard.basis}</p>
              <HazardSwitch hazard={hazard} locked={evaBegun} />
            </li>
          ))}
        </ul>
        <Actions>
          <div className="table-pair end">
            <button type="button" className="table-secondary" onClick={() => setTab('route')}>{t('table.back.to.route')}</button>
            <button type="button" className="table-primary" onClick={() => setTab('suit')}>{t('table.next.suit.check')}</button>
          </div>
        </Actions>
      </div>
    );
  } else {
    body = (
      <>
        <section className="table-left">
          <h2 className="table-h">{t('table.suit.check')}</h2>
          <div className="table-panel">
            <div className="table-panel-head"><p className="table-label">{t('table.suit.now')}</p><p className="table-label tone-ok">{t('table.nominal')}</p></div>
            <SuitNow />
          </div>
          <BudgetPanel totals={totals} metrics={metrics} />
        </section>
        <div className="table-centre">
          <SuitFigure />
        </div>
        <section className="table-right">
          <div className="table-panel">
            <p className="table-label">{t('table.decision')}</p>
            <p className={'table-decision' + (decision.tone ? ' tone-' + decision.tone : '')}>{decision.title}</p>
            <p className="table-text small">{decision.text}</p>
          </div>
          <ReturnPanel totals={totals} />
          <Actions>
            <BeginButton decision={decision} evaBegun={evaBegun} onBeginEva={onBeginEva} />
            <div className="table-pair">
              <button type="button" className="table-secondary" onClick={() => setTab('route')}>{t('table.back.to.route')}</button>
              <button type="button" className="table-secondary" onClick={onControls}>{t('menu.controls')}</button>
            </div>
          </Actions>
        </section>
      </>
    );
  }

  return (
    <div className="table-screen">
      <header className="table-top">
        <p className="table-brand">{t('app.brand')}</p>
        <div className="table-tabs" role="tablist" aria-label={t('table.steps')} onKeyDown={onTabKey}>
          {TABS.map((item) => (
            <button
              key={item.id}
              id={`table-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="table-body"
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? 'on' : undefined}
              onClick={() => setTab(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <p className="table-time">
          {evaBegun ? `EVA ${formatEva(clock.elapsedSec)} · ` : ''}
          {clock.lmst ? `${clock.lmst} LMST · ` : ''}{t('table.habitat')}
        </p>
      </header>
      <div id="table-body" className={'table-body table-body-' + tab} role="tabpanel" aria-labelledby={`table-tab-${tab}`}>
        {body}
      </div>
    </div>
  );
}

function HazardSwitch({ hazard, locked = false }) {
  const off = useMissionStore(useShallow((s) => s.hazards.off ?? []));
  const on = !hazard.events.some((id) => off.includes(id));
  return (
    <label className="table-check table-hazard-switch">
      <input type="checkbox" checked={on} disabled={locked} onChange={(event) => hazard.events.forEach((id) => setHazardEnabled(id, event.target.checked))} />
      <span>{t('table.hazard.can.happen')}</span>
    </label>
  );
}
