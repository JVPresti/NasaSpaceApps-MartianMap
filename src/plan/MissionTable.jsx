import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { loadDataFile } from '../data/dataFiles.js';
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
import { LAYERS, SLOPE_LIMITS } from './layers.js';
import LayerPreview from './LayerPreview.jsx';
import MissionMap from './MissionMap.jsx';
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
  { id: 'site', label: 'Site' },
  { id: 'route', label: 'Route' },
  { id: 'hazards', label: 'Hazards' },
  { id: 'suit', label: 'Suit' },
];

const LAYER_BUTTONS = [
  { index: 0, label: 'Image', title: 'Route on the HiRISE image, 25 cm per pixel' },
  { index: 1, label: 'Slope', title: 'Route over the slope layer' },
  { index: 2, label: 'Elevation', title: 'Route over the elevation layer' },
  { index: 3, label: 'Rocks', title: 'Route over the rock abundance estimate' },
  { index: 4, label: 'Outcrop', title: 'Route over the light-toned outcrop' },
];

const minutes = (sec) => Math.round(sec / 60);
const peak = (event, path) => Math.max(...event.timeline.map((step) => step.set?.[path]).filter(Number.isFinite));

// The hazards come from the event files the simulation runs (src/sim/events), so the briefing cannot drift from them.
// `events` are the event ids a checkbox switches; low oxygen is one hazard with a caution and a warning.
const HAZARDS = [
  {
    id: 'dust-storm',
    art: dustArt,
    artAlt: 'Illustration: an astronaut on Mars as a wall of dust rolls in.',
    events: [dustStorm.id],
    name: dustStorm.label,
    level: 'warning',
    levelLabel: 'Warning',
    when: `${minutes(dustStorm.trigger.atSec)} min into the EVA`,
    happens: `Dust thickens over the site and the light drops: the opacity climbs to ${num(peak(dustStorm, 'environment.dustOpacity'))} in ${dustStorm.timeline.at(-1).atSec} s.`,
    alert: dustStorm.alert.text,
    act: 'Follow the new route back to the habitat. The storm ends when you reach it.',
    basis: 'Peak opacity of the 2018 global storm, measured by Curiosity in Gale crater, not Jezero. How fast it rises is our assumption.',
  },
  {
    id: 'radiation',
    art: radiationArt,
    artAlt: 'Illustration: an astronaut hurries to the habitat as the Sun sends out a burst of particles.',
    events: [radiation.id],
    name: radiation.label,
    level: 'danger',
    levelLabel: 'Danger',
    when: `${minutes(radiation.trigger.atSec)} min into the EVA`,
    happens: `A solar particle event raises the dose rate to ${num(peak(radiation, 'environment.doseRateUgyH'), 1)} µGy/h, about three times the background.`,
    alert: radiation.alert.text,
    act: 'Go to the habitat, the only full shelter on the map. The stops left on the route are skipped.',
    basis: 'Dose rates of the September 2017 event, measured by RAD on Curiosity in Gale crater, not Jezero. Its 12 min length is shortened for one EVA.',
  },
  {
    id: 'low-oxygen',
    art: oxygenArt,
    artAlt: 'Illustration: a wrist display with a nearly empty gauge.',
    events: [lowOxygenCaution.id, lowOxygenWarning.id],
    name: 'Low oxygen',
    level: 'caution',
    levelLabel: 'Caution, then warning',
    when: `When the margin falls under ${minutes(lowOxygenCaution.trigger.value)} min, and again at zero`,
    happens: 'The oxygen left, minus the walk home, minus the 30 min reserve, is running out.',
    alert: `${lowOxygenCaution.alert.text} Then: ${lowOxygenWarning.alert.text}`,
    act: 'Turn back at the caution. At the warning, head straight for the habitat.',
    basis: 'Oxygen use, margin and reserve come from our suit model.',
  },
];

const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

/** A data file under public/, through the shared loader (#217): one request per file per page, shared and read-only. */
function useDataFile(path) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadDataFile(path).then((json) => !cancelled && setValue(json)).catch(() => {});
    return () => { cancelled = true; };
  }, [path]);
  return value;
}

/** "WP1 · channel floor" → ["WP1", "Channel floor"]; the start is the habitat and the last stop is the end. */
function stopLabel(name, index, count) {
  if (index === 0) return ['HAB', 'Habitat'];
  const [code, rest] = name.includes(' · ') ? name.split(' · ') : [index === count - 1 ? 'END' : `WP${index}`, name];
  return [index === count - 1 ? 'END' : code, sentence(rest)];
}

function Big({ value, unit, label, tone }) {
  return (
    <div className="table-big">
      <p><b className={tone ? 'tone-' + tone : undefined}>{value}</b>{unit && <span>{unit}</span>}</p>
      <span>{label}</span>
    </div>
  );
}

function Hazards({ compact = false }) {
  const off = useMissionStore(useShallow((s) => s.hazards.off ?? []));
  return HAZARDS.map((hazard) => {
    const on = !hazard.events.some((id) => off.includes(id));
    return (
      <label key={hazard.id} className="table-check">
        <input type="checkbox" checked={on} onChange={(event) => hazard.events.forEach((id) => setHazardEnabled(id, event.target.checked))} />
        <span>{compact ? hazard.name : 'Can happen in this run'}</span>
      </label>
    );
  });
}

function Stops({ waypoints, legs }) {
  const stops = useStops();
  return (
    <ol className="table-stops">
      {waypoints.map((waypoint, k) => {
        const [code, label] = stopLabel(waypoint.name, k, waypoints.length);
        const stop = stopForWaypoint(stops, waypoint.name);
        const science = stopHasContent(stop);
        const distance = k === 0 ? 'Start' : Number.isFinite(legs[k - 1]?.distanceM) ? `${Math.round(legs[k - 1].distanceM)} m` : '';
        return (
          <li key={k} className={science ? 'science' : undefined}>
            <code>{code}</code>
            {science ? (
              <button type="button" className="table-stop-name" title="Open the science card" onClick={() => toggleWaypoint(waypoint.name)}>{label}</button>
            ) : (
              <span className="table-stop-name">{label}</span>
            )}
            <span className="table-stop-dist">{distance}</span>
          </li>
        );
      })}
    </ol>
  );
}

function SuitNow() {
  const suit = useMissionStore(useShallow((s) => ({ o2: s.suit.oxygenPct, battery: s.suit.batteryPct, pressure: s.suit.pressurePsi })));
  const hazards = useDataFile(HAZARDS_PATH);
  // Before the EVA the suit runner has not started: the suit is full, at its nominal pressure (hazards.json).
  const o2 = Number.isFinite(suit.o2) ? suit.o2 : 100;
  const battery = Number.isFinite(suit.battery) ? suit.battery : 100;
  const pressure = Number.isFinite(suit.pressure) ? suit.pressure : hazards?.values?.['suit.pressure.nominal']?.value;
  const bar = (pct) => <span className="table-bar"><span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></span>;
  return (
    <dl className="table-suit-now">
      <div><dt>Oxygen</dt><dd><b>{num(o2)}</b><span>%</span></dd>{bar(o2)}</div>
      <div><dt>Battery</dt><dd><b>{num(battery)}</b><span>%</span></dd>{bar(battery)}</div>
      <div><dt>Pressure</dt><dd><b>{Number.isFinite(pressure) ? num(pressure, 1) : '–'}</b><span>psi</span></dd></div>
    </dl>
  );
}

const pct1 = (value) => (Number.isFinite(value) ? value.toFixed(1) : '–');

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
  const t = totals;
  const minutes = (sec) => Math.round(sec / 60);
  const reserveSec = 30 * 60;
  const time = t ? [[t.timeSec, 'out'], [t.roundTrip ? 0 : t.returnTimeSec, 'back'], [Math.max(0, t.marginSec), 'spare'], [reserveSec, 'reserve']] : [];
  const tank = (outPct, leftPct) => [[outPct, 'out'], [Math.max(0, 100 - outPct - leftPct), 'back'], [leftPct, 'left']];
  return (
    <div className="table-panel budget-panel">
      <p className="table-label">What the EVA spends</p>

      <div className="budget-row">
        <div className="budget-head"><span>Time</span><b>{t ? minutes(t.timeSec) : metrics.time.value}<small>min out</small></b></div>
        {t && <Stack parts={time} label={`${minutes(t.timeSec)} min out, ${minutes(t.returnTimeSec)} min back, ${minutes(t.marginSec)} min spare, 30 min reserve`} />}
        {t && (
          <p className="budget-key">
            <i className="seg-out" />{minutes(t.timeSec)} out <i className="seg-back" />{t.roundTrip ? 'round trip' : `${minutes(t.returnTimeSec)} back`}{' '}
            <i className="seg-spare" />{minutes(t.marginSec)} spare <i className="seg-reserve" />30 reserve
          </p>
        )}
      </div>

      <div className="budget-row">
        <div className="budget-head"><span>Oxygen</span><b>{metrics.o2.value}<small>g out · {pct1(t?.o2Pct)} %</small></b></div>
        {t && <Stack parts={tank(t.o2Pct, t.arrivalO2Pct)} label={`Oxygen: ${pct1(t.o2Pct)} % out, ${num(t.arrivalO2Pct)} % left at the habitat`} />}
      </div>

      <div className="budget-row">
        <div className="budget-head"><span>Battery</span><b>{metrics.battery.value}<small>Wh out · {pct1(t?.batteryPct)} %</small></b></div>
        {t && <Stack parts={tank(t.batteryPct, t.arrivalBatteryPct)} label={`Battery: ${pct1(t.batteryPct)} % out, ${num(t.arrivalBatteryPct)} % left at the habitat`} />}
        {t && <p className="budget-key"><i className="seg-out" />way out <i className="seg-back" />way back <i className="seg-left" />left at the habitat</p>}
      </div>

      <p className="table-note">Walking time and climb from the HiRISE elevation model; oxygen and battery from our suit model.</p>
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
  const t = totals;
  const marginMin = t ? Math.round(t.marginSec / 60) : null;
  const tone = t ? (t.status === 'nominal' ? 'ok' : t.status) : null;
  return (
    <div className="table-panel return-panel">
      <p className="table-label">Back at the habitat</p>
      <div className="ring-pair">
        <Ring value={t?.arrivalO2Pct} label="Oxygen left" />
        <Ring value={t?.arrivalBatteryPct} label="Battery left" />
      </div>
      <div className="return-margin">
        <b className={tone ? 'tone-' + tone : undefined}>{t ? `${marginMin >= 0 ? '+' : ''}${marginMin}` : '–'}<small>min</small></b>
        {/* route.totals.marginSec is capped at the 8 h EVA limit (#208); the tag's details say so. */}
        <span>margin at the end of the plan, over the 30 min reserve<SourceTag path="route.totals.marginSec" /></span>
      </div>
    </div>
  );
}

function decisionFor(planner, totals) {
  if (planner.status === 'error') return { tone: 'warning', title: 'No-go', text: planner.error ?? 'The planner could not find a route.', go: false };
  if (!totals) return { tone: null, title: 'Planning', text: 'Waiting for the route and its cost.', go: false };
  if (totals.status === 'warning') return { tone: 'warning', title: 'No-go', text: 'The route uses the oxygen reserve. Shorten it before you go out.', go: false };
  if (totals.status === 'caution') return { tone: 'caution', title: 'Go with care', text: 'The margin over the reserve is small. Once you begin, the mission clock starts and this table closes.', go: true };
  return { tone: 'ok', title: 'Go', text: 'The suit is nominal and the route leaves a wide margin. Once you begin, the mission clock starts and this table closes.', go: true };
}

function Actions({ children }) {
  return <div className="table-actions">{children}</div>;
}

function BeginButton({ planner, totals, evaBegun, onBeginEva }) {
  const route = useMissionStore((s) => s.route);
  const decision = decisionFor(planner, totals);
  return (
    <button
      type="button"
      className="table-primary"
      disabled={!route.path || !decision.go || !onBeginEva}
      onClick={() => { setRouteDecision('go'); onBeginEva?.(); }}
    >
      {evaBegun ? 'Continue the EVA' : 'Begin EVA'}
    </button>
  );
}

/**
 * @param {{ planner: { status: string, error: string | null, replan: () => void },
 *   waypoints: Array<{ name: string, x: number, z: number }>, evaBegun?: boolean, onBeginEva?: () => void,
 *   onControls?: () => void }} props
 */
export default function MissionTable({ planner, waypoints, evaBegun = false, onBeginEva, onControls }) {
  const [tab, setTab] = useState('site');   // the table opens on step 1
  const route = useMissionStore((s) => s.route);
  const layer = useMissionStore((s) => s.view.layer);
  const clock = useMissionStore(useShallow((s) => ({ lmst: s.mission.lmst, elapsedSec: s.mission.elapsedSec })));
  const stops = useStops();
  const science = useMemo(() => new Set(waypoints.filter((w) => stopHasContent(stopForWaypoint(stops, w.name))).map((w) => w.name)), [waypoints, stops]);
  const index = TABS.findIndex((item) => item.id === tab);
  const totals = route.totals;
  const metrics = Object.fromEntries(routeMetrics(route).map((m) => [m.key, m]));
  const steepTone = route.steepestSlopeDeg > SLOPE_LIMITS.noGo ? 'warning' : route.steepestSlopeDeg > SLOPE_LIMITS.caution ? 'caution' : null;

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
      <MissionMap path={route.path} waypoints={waypoints} science={science} legs={route.legs ?? []} onScience={toggleWaypoint} {...props} />
      <div className="table-overlay">
        <EventBanner />
        <PlanStopCard />
      </div>
    </div>
  );

  const slopeLegend = (
    <div className="table-map-legend">
      <p>Slope, from the HiRISE elevation model</p>
      <ul>
        <li><i className="sw-clear" />0 to {SLOPE_LIMITS.caution}° · walkable</li>
        <li><i className="sw-caution" />{SLOPE_LIMITS.caution} to {SLOPE_LIMITS.noGo}° · caution</li>
        <li><i className="sw-nogo" />Over {SLOPE_LIMITS.noGo}° · no-go</li>
      </ul>
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
          <h2 className="table-h">Cheyava Falls</h2>
          <p className="table-text">
            A rock about one metre long in Neretva Vallis, the old river channel that fed the lake in Jezero crater.
            Perseverance cored it on 21 July 2024, and in 2025 NASA called it a potential biosignature.
          </p>
          {image && (
            <figure className="table-panel table-fill table-photo">
              <img src={imageUrl(image)} alt={image.alt} width={image.width_px} height={image.height_px} />
              <figcaption><b>The leopard spots on Cheyava Falls, close up</b> · Image: {image.credit}</figcaption>
            </figure>
          )}
        </section>
        {map({ layer: 0, route: false, title: 'HiRISE image, 25 cm per pixel' })}
        <section className="table-right">
          <div className="table-panel table-fill">
            <p className="table-label">Where</p>
            <dl className="table-stats">
              <div><dd><b>18.4975</b><span>° N</span></dd><dt>Latitude</dt></div>
              <div><dd><b>77.3053</b><span>° E</span></dd><dt>Longitude</dt></div>
              <div><dd><b>785</b><span>m</span></dd><dt>From the habitat, in a straight line</dt></div>
              <div><dd><b>221</b><span>m</span></dd><dt>Relief, lowest to highest point</dt></div>
              <div><dd><b>1422 × 1500</b><span>m</span></dd><dt>Area of the terrain</dt></div>
            </dl>
            <p className="table-note">Origin of the map: Perseverance waypoint, sol 1210.</p>
          </div>
          <Actions>
            <button type="button" className="table-primary" onClick={() => setTab('route')}>Next: route</button>
            <button type="button" className="table-secondary" onClick={openSources}>Sources</button>
          </Actions>
        </section>
      </>
    );
  } else if (tab === 'route') {
    const current = LAYER_BUTTONS.find((item) => item.index === layer) ?? LAYER_BUTTONS[0];
    body = (
      <>
        <section className="table-left">
          <h2 className="table-h">Sample Cheyava Falls</h2>
          <p className="table-text">
            Walk from the habitat to the rock where Perseverance reported a potential biosignature, stop at the Bright
            Angel outcrop, and be back before the oxygen reserve.
          </p>
          <div className="table-panel table-fill">
            <p className="table-label">Stops</p>
            <Stops waypoints={waypoints} legs={route.legs ?? []} />
          </div>
          <div className="table-panel table-fill">
            <p className="table-label">Hazards in this run</p>
            <div className="table-checks"><Hazards compact /></div>
          </div>
          <div className="table-panel">
            <p className="table-label" title="On the map: scroll to zoom, drag to move, double-click to fit the route">Map layer · scroll to zoom, drag to move</p>
            <div className="table-layers" role="group" aria-label="Map layer">
            {LAYER_BUTTONS.map((item) => (
              <button
                key={item.index}
                type="button"
                className={layer === item.index ? 'on' : undefined}
                aria-pressed={layer === item.index}
                title={`${item.title} (L: next layer)`}
                onClick={() => setLayer(item.index)}
              >
                {item.label}
                {LAYERS.some((entry) => entry.index === item.index) && <LayerPreview layer={LAYERS.find((entry) => entry.index === item.index)} />}
              </button>
            ))}
            </div>
          </div>
        </section>
        {map({ layer, title: current.title, legend: layer === 1 ? slopeLegend : null })}
        <section className="table-right">
          <div className="table-panel table-fill">
            <div className="table-panel-head">
              <p className="table-label">Route</p>
              <button type="button" className="table-link" onClick={planner.replan} disabled={planner.status === 'planning'}>
                {planner.status === 'planning' ? 'Planning…' : 'Re-plan'}
              </button>
            </div>
            <div className="table-grid2">
              <Big value={metrics.distance.value} unit="km" label="Distance" />
              <Big value={metrics.time.value} unit="min" label="Walk out" />
              <Big value={metrics.climb.value} unit="m" label="Climb" />
              <Big value={metrics.steepest.value} unit="°" label="Steepest slope" tone={steepTone} />
            </div>
            {route.skipped?.length > 0 && <p className="table-note tone-caution">Re-planned for the event. Skipped: {route.skipped.join(' · ')}</p>}
          </div>
          <div className="table-panel table-fill">
            <div className="table-panel-head"><p className="table-label">Suit</p><p className="table-label tone-ok">Nominal</p></div>
            <SuitNow />
          </div>
          <Actions>
            <BeginButton planner={planner} totals={totals} evaBegun={evaBegun} onBeginEva={onBeginEva} />
            <div className="table-pair">
              <button type="button" className="table-secondary" onClick={onControls}>Controls</button>
              <button type="button" className="table-secondary" onClick={openSources}>Sources</button>
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
            <h2 className="table-h">What can go wrong outside</h2>
          </div>
          <p className="table-text">
            Choose the events for this run here. During the EVA there are no switches: an alert tells you, and the route is
            re-planned to the habitat.
          </p>
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
                <div><dt>When</dt><dd>{hazard.when}</dd></div>
                <div><dt>What happens</dt><dd>{hazard.happens}</dd></div>
                <div><dt>The alert</dt><dd>{hazard.alert}</dd></div>
                <div><dt>What to do</dt><dd>{hazard.act}</dd></div>
              </dl>
              <p className="table-note">{hazard.basis}</p>
              <HazardSwitch hazard={hazard} />
            </li>
          ))}
        </ul>
        <Actions>
          <div className="table-pair end">
            <button type="button" className="table-secondary" onClick={() => setTab('route')}>Back to route</button>
            <button type="button" className="table-primary" onClick={() => setTab('suit')}>Next: suit check</button>
          </div>
        </Actions>
      </div>
    );
  } else {
    const decision = decisionFor(planner, totals);
    body = (
      <>
        <section className="table-left">
          <h2 className="table-h">Suit check</h2>
          <div className="table-panel">
            <div className="table-panel-head"><p className="table-label">Now, in the habitat</p><p className="table-label tone-ok">Nominal</p></div>
            <SuitNow />
          </div>
          <BudgetPanel totals={totals} metrics={metrics} />
        </section>
        <div className="table-centre">
          <SuitFigure />
        </div>
        <section className="table-right">
          <div className="table-panel">
            <p className="table-label">Decision</p>
            <p className={'table-decision' + (decision.tone ? ' tone-' + decision.tone : '')}>{decision.title}</p>
            <p className="table-text small">{decision.text}</p>
          </div>
          <ReturnPanel totals={totals} />
          <Actions>
            <BeginButton planner={planner} totals={totals} evaBegun={evaBegun} onBeginEva={onBeginEva} />
            <div className="table-pair">
              <button type="button" className="table-secondary" onClick={() => setTab('route')}>Back to route</button>
              <button type="button" className="table-secondary" onClick={onControls}>Controls</button>
            </div>
          </Actions>
        </section>
      </>
    );
  }

  return (
    <div className="table-screen">
      <header className="table-top">
        <p className="table-brand">Marswalk</p>
        <div className="table-tabs" role="tablist" aria-label="Planning steps" onKeyDown={onTabKey}>
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
              {item.label}
            </button>
          ))}
        </div>
        <p className="table-time">
          {evaBegun ? `EVA ${formatEva(clock.elapsedSec)} · ` : ''}
          {clock.lmst ? `${clock.lmst} LMST · ` : ''}Habitat
        </p>
      </header>
      <div id="table-body" className={'table-body table-body-' + tab} role="tabpanel" aria-labelledby={`table-tab-${tab}`}>
        {body}
      </div>
    </div>
  );
}

function HazardSwitch({ hazard }) {
  const off = useMissionStore(useShallow((s) => s.hazards.off ?? []));
  const on = !hazard.events.some((id) => off.includes(id));
  return (
    <label className="table-check table-hazard-switch">
      <input type="checkbox" checked={on} onChange={(event) => hazard.events.forEach((id) => setHazardEnabled(id, event.target.checked))} />
      <span>Can happen in this run</span>
    </label>
  );
}
