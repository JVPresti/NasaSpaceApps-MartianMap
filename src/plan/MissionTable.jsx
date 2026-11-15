import { useEffect, useMemo, useState } from 'react';
import { formatNumber, getLanguage, t, translateText } from '../i18n/index.js';
import { useShallow } from 'zustand/react/shallow';
import { HAZARDS_PATH } from '../data/provenance.js';
import { imageUrl, stopForWaypoint, stopReason } from '../data/stops.js';
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
import { clearWaypoint, toggleWaypoint, useStopSelection } from '../stops/selection.js';
import { useStops } from '../stops/useStops.js';
import { PROFILE_IDS } from '../sim/routeProfiles.js';
import { waypointNumber } from '../sim/waypointNumber.js';
import { eventTiming, missionEventDefinitions, missionForObjective, missionSourcePath } from '../sim/missions.js';
import { PlanBeat } from '../mission/MissionBeat.jsx';
import { LAYERS, SLOPE_LIMITS } from './layers.js';
import LayerLegend from './LayerLegend.jsx';
import LayerPreview from './LayerPreview.jsx';
import MissionMap from './MissionMap.jsx';
import { layerButtonText, layerMapTitle } from './tableLayers.js';
import { decisionFor, liveSuitStatus, startSuitStatus, tightestText } from './decision.js';
import { planLimits } from './limits.js';
import { suitConstantsFromHazards } from '../sim/suitModel.js';
import { eventRouteOf, shelterLabel } from './eventRoute.js';
import { distanceLeft, planLegTo, remainingPlan } from './planProgress.js';
import NeedsPanel from './NeedsPanel.jsx';
import OutlookStrip from './OutlookStrip.jsx';
import { droppedWhy, planReasonLines, stopLine } from './routeWhy.js';
import { eventTimingText, shortDuration } from './tableFormat.js';
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
const EVENT_LABELS = { [dustStorm.id]: dustStorm.label, [radiation.id]: radiation.label };
const peak = (event, path) => Math.max(...event.timeline.map((step) => step.set?.[path]).filter(Number.isFinite));
/** The event as the objective's mission runs it (src/sim/missions.js): its start and its timeline, compressed for the
    first sortie. */
const scheduled = (event, objective) => missionEventDefinitions(objective, [event])[0];
/** When an event starts in the objective's mission: seconds under two minutes, minutes after (tableFormat.eventWhen). */
/** An event's name inside a sentence: "the dust storm". */
const eventName = (id) => {
  const name = translateText(EVENT_LABELS[id] ?? id);
  return name.charAt(0).toLowerCase() + name.slice(1);
};
/** When an event starts in the objective's mission, from its trigger (N5, missions.eventTiming). */
const when = (event, objective) => sentence(eventTimingText(eventTiming(objective, event.id), eventName) ?? '–');

// The hazards come from the event files the simulation runs (src/sim/events) and the times of the objective's mission
// (src/sim/missions.js), so the briefing cannot drift from them. `events` are the event ids a checkbox switches; low
// oxygen is one hazard with a caution and a warning. when, happens and basis take the crew's objective.
const HAZARDS = [
  {
    id: 'dust-storm',
    art: dustArt,
    get artAlt() { return t('table.hazard.dust.art'); },
    events: [dustStorm.id],
    get name() { return translateText(dustStorm.label); },
    level: 'warning',
    get levelLabel() { return t('table.hazard.level.warning'); },
    timed: true,
    when: (objective) => when(dustStorm, objective),
    happens: (objective) => t('table.hazard.dust.happens', {
      opacity: num(peak(dustStorm, 'environment.dustOpacity')), sec: Math.round(scheduled(dustStorm, objective).timeline.at(-1).atSec),
    }),
    get alert() { return translateText(dustStorm.alert.text); },
    get act() { return t('table.hazard.dust.act', { radius: dustStorm.end?.radius ?? 25 }); },
    basis: () => t('table.hazard.dust.basis'),
  },
  {
    id: 'radiation',
    art: radiationArt,
    get artAlt() { return t('table.hazard.radiation.art'); },
    events: [radiation.id],
    get name() { return translateText(radiation.label); },
    level: 'warning',
    get levelLabel() { return t('table.hazard.level.warning'); },
    timed: true,
    when: (objective) => when(radiation, objective),
    happens: () => t('table.hazard.radiation.happens', { rate: num(peak(radiation, 'environment.doseRateUgyH'), 1), background: num(radiation.timeline[0]?.set?.['environment.doseRateUgyH'], 1) }),
    get alert() { return translateText(radiation.alert.text); },
    get act() { return t('table.hazard.radiation.act', { radius: radiation.end?.radius ?? 25 }); },
    basis: (objective) => t('table.hazard.radiation.basis', { length: shortDuration(scheduled(radiation, objective).timeline.at(-1).atSec) }),
  },
  {
    id: 'low-oxygen',
    art: oxygenArt,
    get artAlt() { return t('table.hazard.oxygen.art'); },
    events: [lowOxygenCaution.id, lowOxygenWarning.id],
    get name() { return t('table.hazard.oxygen.name'); },
    level: 'caution',
    get levelLabel() { return t('table.hazard.level.caution.then.warning'); },
    when: () => t('table.hazard.oxygen.when', { min: minutes(lowOxygenCaution.trigger.value) }),
    happens: () => t('table.hazard.oxygen.happens'),
    get alert() {
      return t('table.hazard.oxygen.alert', { caution: translateText(lowOxygenCaution.alert.text), warning: translateText(lowOxygenWarning.alert.text) });
    },
    get act() { return t('table.hazard.oxygen.act'); },
    basis: () => t('table.hazard.oxygen.basis'),
  },
];

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

/** A place name in the interface language: the name itself when en.json has it, else its lower-case form ("light-toned
    patch"), else the name as it is (a proper name such as Bright Angel). */
function placeName(name) {
  const direct = translateText(name);
  if (direct !== name) return direct;
  const lower = translateText(name.charAt(0).toLowerCase() + name.slice(1));
  return lower !== name.charAt(0).toLowerCase() + name.slice(1) ? sentence(lower) : name;
}

/**
 * One number and one name per stop, as the map shows them (P8): the number is the stop's place in route.waypoints
 * (waypointNumber: the habitat is 0), the name its `label` (stops.json). A route.json anchor without a label falls
 * back to the part of its name after " · ".
 */
function stopLabel(waypoint, index) {
  if (index === 0) return [waypointNumber(0), t('table.habitat')];
  const name = waypoint.label ?? (waypoint.name.includes(' · ') ? waypoint.name.split(' · ')[1] : waypoint.name);
  return [waypointNumber(index), sentence(placeName(name))];
}

function Big({ value, unit, label, tone, title }) {
  return (
    <div className="table-big" title={title}>
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
function Stops({ waypoints, legs, explain = [], dropped = [], planStops = [], planLegs = null, done = null }) {
  const stops = useStops();
  const language = getLanguage();
  return (
    <ol className="table-stops">
      {waypoints.map((waypoint, k) => {
        const [code, label] = stopLabel(waypoint, k);
        const stop = stopForWaypoint(stops, waypoint.name);
        const science = stopHasContent(stop);
        // During the EVA the legs are the approved plan's (eva.plan.legs), and a stop reached or skipped says so in place of
        // a distance (A1): the current route's legs are whatever path is left, split at the plan's waypoints.
        const leg = k > 0 ? (planLegs ? planLegTo(planLegs, waypoint.name) : legs[k - 1]) : null;
        const state = k > 0 && done ? (done.reached.includes(waypoint.name) ? 'reached' : done.skipped.includes(waypoint.name) ? 'skipped' : null) : null;
        const distance = k === 0 ? t('table.stop.start')
          : state === 'reached' ? t('table.stop.reached') : state === 'skipped' ? t('table.event.skipped')
            : Number.isFinite(leg?.distanceM) ? `${Math.round(leg.distanceM)} m` : '';
        // the goal of the walk, or a stop kept because it fits the crew's time (D13: route.stops[].required)
        const planned = k > 0 ? planStops.find((entry) => entry.id === waypoint.stopId) : null;
        const role = planned ? t(planned.required ? 'table.stop.goal' : 'table.stop.fits') : null;
        const line = k > 0 && !state ? stopLine({ workSec: leg?.workSec ?? waypoint.workSec, explain: explain[k - 1], role }) : null;
        // why the stop is worth the walk, when stops.json says (D10: the sortie's light-toned patch), tagged SIM
        const reason = k > 0 && !state ? stopReason(planned, language) : null;
        return (
          <li key={k} className={[science ? 'science' : '', state === 'skipped' ? 'dropped' : state === 'reached' ? 'reached' : ''].join(' ').trim() || undefined}>
            <code>{code}</code>
            {science ? (
              <button type="button" className="table-stop-name" title={t('table.open.science.card')} onClick={() => toggleWaypoint(waypoint.name)}>{label}</button>
            ) : (
              <span className="table-stop-name">{label}</span>
            )}
            <span className="table-stop-dist">{distance}</span>
            {(line || reason) && (
              <small className="table-stop-why">
                {line}
                {reason && <>{line ? ' · ' : ''}{reason}<SourceTag path="route.stops" requireSource={false} /></>}
              </small>
            )}
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

/**
 * The stop list while an event's shelter route is the route (#265): from where the crew is to the shelter, with the
 * alert that sent them there, and the stops the event route leaves out. The plan approved before the EVA comes back
 * when the event ends.
 * @param {{ event: ReturnType<typeof eventRouteOf> }} props
 */
function EventStops({ event, waypoints, leftM = null }) {
  const [code, name] = shelterLabel(event.shelter);
  return (
    <ol className="table-stops">
      <li>
        <code>{t('table.event.here.code')}</code>
        <span className="table-stop-name">{t('table.event.here')}</span>
        <span className="table-stop-dist">{t('table.stop.start')}</span>
      </li>
      <li className="event">
        <code>{code}</code>
        <span className="table-stop-name">{t('table.event.shelter', { name: sentence(translateText(name)) })}</span>
        {/* what is left from where the crew is (Q3), else the route's length when it was planned */}
        <span className="table-stop-dist">{Number.isFinite(leftM ?? event.distanceM) ? `${Math.round(leftM ?? event.distanceM)} m` : ''}</span>
        {event.alertText && <small className="table-stop-why">{translateText(event.alertText)}</small>}
      </li>
      {event.skipped.map((stop) => {
        const k = waypoints.findIndex((waypoint) => waypoint.name === stop);
        const [skippedCode, label] = k > 0 ? stopLabel(waypoints[k], k) : ['–', placeName(stop)];
        return (
          <li key={'skipped-' + stop} className="dropped">
            <code>{skippedCode}</code>
            <span className="table-stop-name">{sentence(translateText(label))}</span>
            <span className="table-stop-dist">{t('table.event.skipped')}</span>
          </li>
        );
      })}
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
 * The whole EVA in minutes, door to door: the walk out with the work at the stops, plus the walk back. Rounded as the
 * Suit step's time bar rounds its parts, so the two steps show the same numbers (#341).
 * @param {object} tot route.totals
 */
function evaMinutes(tot) {
  const out = Math.ceil(tot.timeSec / 60);
  const back = tot.roundTrip ? 0 : Math.round(tot.returnTimeSec / 60);
  return { out, back, total: out + back };
}

/**
 * What the EVA spends, as budgets: time (out, back, and against the crew's time: spare and the risk reserve) and the
 * oxygen and battery tanks (out, back, left). Shares from route.totals (src/sim/legCosts.js) and route.budget
 * (src/sim/missionNeeds.js). The time bar is the crew's time only: the oxygen margin is the Return panel's figure (N12).
 * @param {{ totals: object | null, metrics: object, limits: object | null, budget: object | null }} props
 */
function BudgetPanel({ totals, metrics, limits, budget }) {
  const tot = totals;
  const minutes = (sec) => Math.round(sec / 60);
  const outMin = (sec) => Math.ceil(sec / 60);   // the time out rounded up, as on the Route step (Q14)
  const time = limits?.time ?? null;
  const parts = tot ? [[tot.timeSec, 'out'], [tot.roundTrip ? 0 : tot.returnTimeSec, 'back']] : [];
  if (time && budget) parts.push([Math.max(0, time.spareSec), 'spare'], [budget.reserveSec ?? 0, 'reserve']);
  const tank = (outPct, leftPct) => [[outPct, 'out'], [Math.max(0, 100 - outPct - Math.max(0, leftPct)), 'back'], [Math.max(0, leftPct), 'left']];
  return (
    <div className="table-panel budget-panel">
      <p className="table-label">{t('table.budget.title')}</p>

      <div className="budget-row">
        <div className="budget-head"><span>{t('table.time')}</span><b>{tot ? outMin(tot.timeSec) : metrics.time.value}<small>{t('table.budget.min.out')}</small></b></div>
        {tot && (
          <Stack
            parts={parts}
            label={t('table.budget.time.label', { out: minutes(tot.timeSec), back: minutes(tot.roundTrip ? 0 : tot.returnTimeSec) })}
          />
        )}
        {tot && (
          <p className="budget-key">
            <i className="seg-out" />{tot.workSec > 0 ? t('table.budget.key.out.work', { min: outMin(tot.timeSec), work: shortDuration(tot.workSec) }) : t('table.budget.key.out', { min: outMin(tot.timeSec) })}{' '}
            <i className="seg-back" />{tot.roundTrip ? t('table.budget.key.round.trip') : t('table.budget.key.back', { min: minutes(tot.returnTimeSec) })}{' '}
            {time && budget && (time.ok
              ? <><i className="seg-spare" />{t('table.budget.key.spare', { min: minutes(time.spareSec) })}{' '}</>
              : <span className="tone-warning">{t('table.budget.key.time.over', { min: Math.ceil(-time.spareSec / 60) })}{' '}</span>)}
            {time && budget && <><i className="seg-reserve" />{t('table.budget.key.time.reserve', { min: minutes(budget.reserveSec ?? 0) })}</>}
          </p>
        )}
      </div>

      <div className="budget-row">
        <div className="budget-head"><span>{t('table.oxygen')}</span><b>{metrics.o2.value}<small>{t('table.budget.g.out', { pct: pct1(tot?.o2Pct) })}</small></b></div>
        {tot && <Stack parts={tank(tot.o2Pct, tot.arrivalO2Pct)} label={t('table.budget.oxygen.label', { out: pct1(tot.o2Pct), left: num(Math.max(0, tot.arrivalO2Pct)) })} />}
      </div>

      <div className="budget-row">
        <div className="budget-head"><span>{t('table.battery')}</span><b>{metrics.battery.value}<small>{t('table.budget.wh.out', { pct: pct1(tot?.batteryPct) })}</small></b></div>
        {tot && <Stack parts={tank(tot.batteryPct, tot.arrivalBatteryPct)} label={t('table.budget.battery.label', { out: pct1(tot.batteryPct), left: num(Math.max(0, tot.arrivalBatteryPct)) })} />}
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

/** A ring gauge, 0 to 100 %. A value under 0 draws empty, and the caption says what is short instead (P1). */
function Ring({ value, label, shortLabel, tone = 'ok' }) {
  const r = 42, c = 2 * Math.PI * r;
  const share = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;
  const short = Number.isFinite(value) && value < 0;
  return (
    <figure className="ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ring-track" />
        <circle cx="50" cy="50" r={r} className={'ring-fill tone-' + tone} strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <figcaption>
        <b className={short ? 'tone-warning' : undefined}>{Number.isFinite(value) ? num(Math.max(0, value)) : '–'}<small>%</small></b>
        <span className={short ? 'tone-warning' : undefined}>{short ? shortLabel(num(-value)) : label}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The tone of a limit's figure: warning when it breaks, caution when it has less than the suit's caution margin left,
 * green only while the decision is a go (a no-go never sits beside a green figure), else plain.
 */
function limitTone(limit, go, cautionSec = 15 * 60) {
  if (!limit) return go ? 'ok' : 'muted';
  if (!limit.ok) return 'warning';
  if (limit.spareSec < cautionSec) return 'caution';
  return go ? 'ok' : 'muted';
}

/**
 * What is left when the walk ends back at the airlock, and the oxygen margin over the reserve, each in the tone of its
 * own limit (src/plan/limits.js).
 * @param {{ totals: object | null, limits: object | null, go: boolean }} props
 */
function ReturnPanel({ totals, limits, go }) {
  const tot = totals;
  const marginMin = tot ? Math.round(tot.marginSec / 60) : null;
  const o2Tone = tot ? limitTone(limits?.o2 ?? (tot.status === 'warning' ? { ok: false } : null), go) : null;
  return (
    <div className="table-panel return-panel">
      <p className="table-label">{t('table.return.title')}</p>
      <div className="ring-pair">
        <Ring value={tot?.arrivalO2Pct} label={t('table.return.oxygen.left')} shortLabel={(pct) => t('table.return.oxygen.short', { pct })} tone={o2Tone ?? 'ok'} />
        <Ring value={tot?.arrivalBatteryPct} label={t('table.return.battery.left')} shortLabel={(pct) => t('table.return.battery.short', { pct })} tone={tot ? limitTone(limits?.battery, go) : 'ok'} />
      </div>
      <div className="return-margin">
        <b className={o2Tone && o2Tone !== 'muted' ? 'tone-' + o2Tone : undefined}>{tot ? `${marginMin >= 0 ? '+' : ''}${marginMin}` : '–'}<small>min</small></b>
        {/* route.totals.marginSec is capped at the 8 h EVA limit (#208); the tag's details say so. */}
        <span>{t('table.return.margin')}<SourceTag path="route.totals.marginSec" /></span>
      </div>
    </div>
  );
}

function Actions({ children }) {
  return <div className="table-actions">{children}</div>;
}

function BeginButton({ decision, planning = false, evaBegun, onBeginEva }) {
  const path = useMissionStore((s) => s.route.path);
  // Go / No-go gates the start only. Once the EVA is under way the astronaut is already outside and the clock runs,
  // so a route that now reads No-go (oxygen spent, a failed re-plan, the storm's dust) must not keep them at the table.
  // While a change of the needs is being planned, the route on the map is the last one: wait for the new one.
  const blocked = evaBegun ? false : !path || !decision.go || planning;
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
  // A stop card left open closes when its stop leaves the route (a new goal, a re-plan) (P23).
  const selectedStop = useStopSelection((s) => s.waypoint);
  useEffect(() => {
    if (selectedStop && !waypoints.some((waypoint) => waypoint.name === selectedStop)) clearWaypoint();
  }, [selectedStop, waypoints]);
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
  // During an event the route is the event's route to a shelter (#265): the table shows it, and where the crew is.
  const alerts = useMissionStore((s) => s.alerts);
  const event = eventRouteOf(route, alerts);
  // The navigation estimate the HUD shows, with its error ring (#42): rounded, so the table repaints only when it moves
  // a metre, turns 5 degrees or the ring changes by half a metre.
  const crewAt = useMissionStore(useShallow((s) => ({
    x: Math.round(s.navigation.x ?? NaN),
    z: Math.round(s.navigation.z ?? NaN),
    errorM: Number.isFinite(s.navigation.errorM) ? Math.round(s.navigation.errorM * 2) / 2 : null,
    headingDeg: Number.isFinite(s.navigation.headingDeg) ? Math.round(s.navigation.headingDeg / 5) * 5 : null,
    fixMode: s.navigation.fixMode ?? null,
  })));
  const position = evaBegun && Number.isFinite(crewAt.x) && Number.isFinite(crewAt.z) ? crewAt : null;
  // The approved plan, drawn thin under an event's route so the route home reads apart from it (eva.plan, #274).
  const planPath = useMissionStore((s) => s.eva?.plan?.path ?? null);
  // During the EVA (A1): the approved plan's legs, the stops reached or skipped, and whether the crew is back home.
  const evaProgress = useMissionStore(useShallow((s) => ({
    planLegs: s.eva?.plan?.legs ?? null, visited: s.route.visited ?? [], skipped: s.route.skipped ?? [], atHabitat: s.eva?.atHabitat === true,
  })));
  const done = evaBegun ? { reached: evaProgress.visited, skipped: evaProgress.skipped } : null;
  const remaining = evaBegun && !event && evaProgress.planLegs ? remainingPlan(evaProgress.planLegs, waypoints, [...evaProgress.visited, ...evaProgress.skipped]) : null;
  // During an event, what is left of the route to the shelter from where the crew is (Q3).
  const leftM = event ? distanceLeft(route.path, position) : null;
  // The Route card: what remains of the plan during the EVA, what is left to the shelter during an event, else the
  // planned route. Minutes are rounded up everywhere, as on the Suit step (Q14).
  const upMin = (sec) => (Number.isFinite(sec) && sec > 0 ? String(Math.ceil(sec / 60)) : '–');
  const cardMetrics = remaining
    ? {
      distance: remaining.count ? formatNumber(remaining.distanceM / 1000, 2) : '–', time: remaining.count ? upMin(remaining.timeSec) : '–',
      climb: remaining.count ? `+${Math.round(remaining.climbM)}` : '–', steepest: Number.isFinite(remaining.steepestDeg) ? String(Math.round(remaining.steepestDeg)) : '–',
    }
    : event && Number.isFinite(leftM) && Number.isFinite(route.distanceM) && route.distanceM > 0
      ? { distance: formatNumber(leftM / 1000, 2), time: upMin((route.etaSec ?? 0) * (leftM / route.distanceM)), climb: metrics.climb.value, steepest: metrics.steepest.value }
      : { distance: metrics.distance.value, time: metrics.time.value, climb: metrics.climb.value, steepest: metrics.steepest.value };
  const objective = useMissionStore((s) => s.needs.objective);
  const needs = useMissionStore(useShallow((s) => ({ crew: s.needs.crew, o2Pct: s.needs.o2Pct, batteryPct: s.needs.batteryPct })));
  const dust = useDustAgainstLimit();
  // One decision from the three limits of the plan, time, oxygen and battery, each as minutes of slack (P1).
  const hazardsFile = useDataFile(HAZARDS_PATH);
  const constants = useMemo(() => {
    try { return hazardsFile ? suitConstantsFromHazards(hazardsFile) : null; } catch { return null; }
  }, [hazardsFile]);
  const limits = planLimits({ totals, budget: planCurrent ? route.budget : null, constants, needs });
  // The forecast radiation alert (D6): switched on for this run and not yet fired.
  const radiationExpected = useMissionStore((s) => !(s.hazards.off ?? []).includes('radiation')) && !alerts?.radiation;
  const decision = decisionFor({ planner, totals, limits, dust, objective, radiationExpected });
  // Each reason is said once: a solo crew held to the radio route under the profile buttons it turns off
  // (RouteProfiles.jsx), whether the plan fits in the tightest-limit line. A no-go takes the place of the plan's reasons:
  // what to change comes first, the crew and risk settings stay in view in the needs panel, and each leg's reason stays
  // in the stop list.
  const soloRadio = needs.crew === 1 && profiles?.radio?.ok === true;
  const noGo = !decision.go && decision.reason !== 'planning';
  const said = (r) => (soloRadio && r.code === 'solo-radio') || r.code === 'fits' || r.code === 'required-over';
  // a no-go keeps one reason: the stops fit on another profile (the way out the profile buttons offer)
  const reasonLines = planCurrent ? planReasonLines((route.planReasons ?? []).filter((r) => !said(r) && (!noGo || r.code === 'profile-over' || r.code === 'profile-unreachable'))) : [];
  const whyLines = planCurrent && !noGo && limits?.tightest ? [tightestText(limits.tightest), ...reasonLines] : reasonLines;
  // The plan being approved, in one line (P9): goal · crew · profile.
  const planLine = t('table.plan.line', {
    goal: t(`needs.objective.${objective}`), crew: t(`needs.crew.${needs.crew}`), profile: t(`profiles.${inUse ?? route.profile}`),
  });
  // The suit: before the EVA, against the plan (the O2 and battery at the start are the crew's inputs); during it, the
  // suit model's live status.
  const liveStatus = useMissionStore((s) => s.suit.status);
  const suitStatus = evaBegun ? liveSuitStatus(liveStatus) : startSuitStatus(limits, constants);

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
      <MissionMap path={route.path} waypoints={waypoints} science={science} legs={route.legs ?? []} onScience={toggleWaypoint} traverse={traverse} mast={planner.mast ?? null} position={position} eventRoute={Boolean(event)} planPath={event ? planPath : null} {...props} />
      <div className="table-overlay">
        <EventBanner />
        <PlanStopCard />
      </div>
    </div>
  );

  let body;
  if (tab === 'site') {
    // The Site step is about Cheyava Falls, whatever the goal: the first sortie's stop has no science card, and the
    // last stop of a Bright Angel survey is not the rock the title and the numbers describe.
    const target = stopForWaypoint(stops, 'Cheyava Falls');
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
        {/* The habitat and the rock the step describes, whatever stop the goal walks to */}
        {map({ layer: 0, route: false, title: t('table.layer.hirise'), waypoints: target && waypoints.length > 0 ? [waypoints[0], { name: target.waypoint, x: target.x, z: target.z }] : waypoints })}
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
            <div className="table-panel-head">
              <p className="table-label">{event ? t('table.event.stops') : t('table.stops')}</p>
              {/* the work at each stop (SIM) and why each leg bends (DERIVED) */}
              {!event && <span><SourceTag path="route.legs.workSec" requireSource={false} /><SourceTag path="route.explain" requireSource={false} /></span>}
            </div>
            {event ? <EventStops event={event} waypoints={waypoints} leftM={leftM} /> : (
              <Stops waypoints={waypoints} legs={route.legs ?? []} explain={planCurrent ? route.explain ?? [] : []} dropped={planCurrent ? route.dropped ?? [] : []}
                planStops={planCurrent ? route.stops ?? [] : []} planLegs={evaBegun ? evaProgress.planLegs : null} done={done} />
            )}
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
              {/* no re-plan through the stops while an event's route leads to a shelter (B1) */}
              <button type="button" className="table-link" onClick={planner.replan} disabled={planner.status === 'planning' || Boolean(route.shelter)}>
                {planner.status === 'planning' ? t('table.planning') : t('table.replan')}
              </button>
            </div>
            {/* The verdict on the step where the route is chosen, the same one the Suit step shows (#341) */}
            {!event && !evaBegun && decision.reason !== 'planning' && (
              <p className={'table-decision table-route-decision' + (decision.tone ? ' tone-' + decision.tone : '')}>{decision.title}</p>
            )}
            <div className="table-grid2">
              <Big value={cardMetrics.distance} unit="km" label={t('ui.distance')} />
              {/* Walk out plus the work at the stops (#247): planned time, not played in real time */}
              {event
                ? <Big value={cardMetrics.time} unit="min" label={t('table.event.to.shelter')} />
                : totals && !remaining
                  ? <Big value={evaMinutes(totals).total} unit="min" label={t('table.eva.total')} />
                  : <Big value={cardMetrics.time} unit="min" label={t('table.planned.out')} title={t('table.planned.out.title')} />}
              <Big value={cardMetrics.climb} unit="m" label={t('ui.climb')} />
              <Big value={cardMetrics.steepest} unit="°" label={t('table.steepest.slope')} tone={remaining ? null : steepTone} />
            </div>
            {!event && totals && !remaining && (
              <p className="table-note route-eva-parts">
                {totals.workSec > 0
                  ? t('table.budget.key.out.work', { min: evaMinutes(totals).out, work: shortDuration(totals.workSec) })
                  : t('table.budget.key.out', { min: evaMinutes(totals).out })}
                {' · '}
                {totals.roundTrip ? t('table.budget.key.round.trip') : t('table.budget.key.back', { min: evaMinutes(totals).back })}
              </p>
            )}
            {remaining && remaining.count === 0 && !evaProgress.skipped.length && (
              <p className="table-note">{t(evaProgress.atHabitat ? 'table.progress.home' : 'table.progress.done')}</p>
            )}
            {event && (
              <p className="table-note tone-caution">
                {t('table.event.replanned', { event: event.label ? translateText(event.label) : t('table.event.an.event'), shelter: sentence(translateText(shelterLabel(event.shelter)[1])) })}
              </p>
            )}
            {!event && route.skipped?.length > 0 && (
              <p className="table-note tone-caution">
                {t('table.replanned.skipped', { stops: route.skipped.map((name) => { const k = waypoints.findIndex((w) => w.name === name); return k > 0 ? stopLabel(waypoints[k], k)[1] : name; }).join(' · ') })}
              </p>
            )}
            {/* Why this route (#246), plan level: the crew rules, the risk and the budget; each leg's reason is in the stop
                list. A no-go reason comes first, so a locked Begin EVA always says why. */}
            {!evaBegun && !decision.go && decision.tone && <p className={'table-note tone-' + decision.tone}>{decision.text}</p>}
            {whyLines.length > 0 && <p className="table-note route-why">{whyLines.join(' ')}<SourceTag path="route.planReasons" requireSource={false} /></p>}
          </div>
          {/* The comparison takes the place of the suit readout, which the Suit step shows in full (#245). */}
          <div className="table-panel table-fill profiles-panel">
            <RouteProfiles locked={evaBegun} />
          </div>
          <Actions>
            <BeginButton decision={decision} planning={planner.status === 'planning'} evaBegun={evaBegun} onBeginEva={onBeginEva} />
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
          <p className="table-text">{t(evaBegun ? 'table.hazards.text.eva' : 'table.hazards.text')}</p>
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
                <div>
                  <dt>{t('table.hazard.when')}</dt>
                  {/* the mission's timing is SIM: its tag gives the whole rule (missions.MISSION_SOURCES) */}
                  <dd>{hazard.when(objective)}{hazard.timed && <SourceTag path={missionSourcePath(missionForObjective(objective).id, hazard.id)} requireSource={false} />}</dd>
                </div>
                <div><dt>{t('table.hazard.what.happens')}</dt><dd>{hazard.happens(objective)}</dd></div>
                <div><dt>{t('table.hazard.the.alert')}</dt><dd>{hazard.alert}</dd></div>
                <div><dt>{t('table.hazard.what.to.do')}</dt><dd>{hazard.act}</dd></div>
              </dl>
              <p className="table-note">{hazard.basis(objective)}</p>
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
            <div className="table-panel-head">
              <p className="table-label">{t(evaBegun && !evaProgress.atHabitat ? 'table.suit.now.eva' : 'table.suit.now')}</p>
              <p className={'table-label tone-' + suitStatus.tone}>{suitStatus.label}</p>
            </div>
            <SuitNow />
          </div>
          <BudgetPanel totals={totals} metrics={metrics} limits={limits} budget={planCurrent ? route.budget : null} />
        </section>
        {/* The conditions outlook (#248) heads the middle column, level with go / no-go; the suit model fills the rest. */}
        <div className="table-centre-wrap">
          <OutlookStrip dust={dust} planCurrent={planCurrent} />
          <div className="table-centre">
            <SuitFigure />
          </div>
        </div>
        <section className="table-right">
          <div className="table-panel">
            <p className="table-label">{t('table.decision')}</p>
            {evaBegun ? (
              <>
                <p className={'table-decision tone-' + suitStatus.tone}>{t('table.decision.eva')}</p>
                <p className="table-text small">
                  {event
                    ? t('table.decision.eva.event', { event: event.label ? translateText(event.label) : t('table.event.an.event'), shelter: sentence(translateText(shelterLabel(event.shelter)[1])) })
                    : t('table.decision.eva.text')}
                </p>
              </>
            ) : (
              <>
                <p className={'table-decision' + (decision.tone ? ' tone-' + decision.tone : '')}>{decision.title}</p>
                <p className="table-text small">
                  <span className="decision-plan">{planLine}</span>{decision.text}
                  {decision.note && <span className="decision-begin"> {decision.note}</span>}
                </p>
              </>
            )}
          </div>
          <ReturnPanel totals={totals} limits={limits} go={evaBegun || decision.go} />
          <Actions>
            <BeginButton decision={decision} planning={planner.status === 'planning'} evaBegun={evaBegun} onBeginEva={onBeginEva} />
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
