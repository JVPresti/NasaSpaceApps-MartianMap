// Helmet HUD (issue #20): what the astronaut reads while walking. Every value comes from the mission store; the store
// changes a few times per second (suit 4 Hz, position 5 Hz), so these components re-render at that rate, never per frame.
// Layout follows the v3 "Caminar · Normal" mockup; final Figma measurements come later (#11).
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMissionStore } from '../state/store.js';
import { batteryLevel, cardinal, formatEva, formatMinutes, formatValue, nextWaypointInfo, pickAlert, wrapDeg } from './format.js';
import ElevationProfile from './ElevationProfile.jsx';
import * as I from './icons.jsx';
import './hud.css';

/** Source tag for a store path (DATA, DERIVED or SIM), with the full source on hover. Replaced by #62's component later. */
function SourceTag({ path }) {
  const src = useMissionStore((s) => s.sources[path]);
  if (!src) return null;
  return <span className={'hud-src hud-src-' + String(src.tag).toLowerCase()} title={src.source || src.label || src.tag}>{src.tag}</span>;
}

function Pill({ icon, children, label }) {
  return <div className="hud-pill" aria-label={label}>{icon}{children}</div>;
}

function Clocks() {
  const { elapsedSec, lmst } = useMissionStore(useShallow((s) => ({ elapsedSec: s.mission.elapsedSec, lmst: s.mission.lmst })));
  return (
    <>
      <div className="hud-eva"><Pill icon={<I.Stopwatch />} label="EVA time"><b>EVA {formatEva(elapsedSec)}</b></Pill></div>
      <div className="hud-lmst"><Pill icon={<I.Horizon />} label="Local mean solar time"><b>{lmst || '––:––'}</b> <small>LMST</small></Pill></div>
    </>
  );
}

const SPAN = 60;                         // degrees shown each side of the heading
const W = 1120, R = 1500, CX = W / 2, TOP = 12, SWEEP = 0.4;   // tape geometry in viewBox units
const arc = (offsetDeg) => { const a = offsetDeg / SPAN * SWEEP; return { x: CX + R * Math.sin(a), y: TOP + R * (1 - Math.cos(a)), a }; };

function HeadingTape() {
  const heading = useMissionStore((s) => s.navigation.headingDeg);
  const target = useMissionStore(useShallow((s) => { const w = nextWaypointInfo(s.route, s.navigation); return w ? Math.round(w.bearingDeg) : null; }));
  const h = typeof heading === 'number' ? heading : null;
  const ticks = [];
  if (h !== null) {
    const first = Math.ceil((h - SPAN) / 5) * 5;
    for (let d = first; d <= h + SPAN; d += 5) {
      const o = d - h, { x, y, a } = arc(o), major = d % 15 === 0, len = major ? 12 : 6;
      ticks.push(<line key={'t' + d} x1={x} y1={y} x2={x - Math.sin(a) * len} y2={y + Math.cos(a) * len} className={major ? 'hud-tick-major' : 'hud-tick'} />);
      if (wrapDeg(d) % 45 === 0) ticks.push(<text key={'l' + d} x={x} y={y + 30} className="hud-tape-label">{cardinal(d)}</text>);
    }
  }
  let marker = null;
  if (h !== null && target !== null) {
    const o = ((target - h + 540) % 360) - 180;
    if (Math.abs(o) <= SPAN) { const { x, y } = arc(o); marker = <path d={`M${x - 7} ${y + 16} L${x + 7} ${y + 16} L${x} ${y + 27} Z`} className="hud-tape-target" />; }
  }
  const path = `M${arc(-SPAN).x} ${arc(-SPAN).y} A${R} ${R} 0 0 1 ${arc(SPAN).x} ${arc(SPAN).y}`;
  return (
    <div className="hud-heading" aria-label={h === null ? 'Heading unknown' : `Heading ${Math.round(h)} degrees`}>
      <svg viewBox={`0 0 ${W} 120`} className="hud-tape" aria-hidden="true">
        <path d={path} className="hud-tape-arc" />
        {ticks}{marker}
        <line x1={CX} y1={TOP - 10} x2={CX} y2={TOP + 18} className="hud-tape-center" />
      </svg>
      <div className="hud-heading-box">{h === null ? '–' : Math.round(wrapDeg(h)) + '°'}</div>
    </div>
  );
}

function Bar({ frac, level }) {
  const f = typeof frac === 'number' && Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  return <div className={'hud-bar hud-' + level}><span style={{ width: f * 100 + '%' }} /></div>;
}

function SuitPanel() {
  const s = useMissionStore(useShallow((st) => ({
    o2: st.suit.oxygenPct, batt: st.suit.batteryPct, psi: st.suit.pressurePsi,
    walkbackSec: st.suit.walkbackSec, marginSec: st.suit.marginSec, status: st.suit.status || 'nominal',
  })));
  const battLevel = batteryLevel(s.batt);
  return (
    <section className="hud-panel hud-suit" aria-label="Suit">
      <div className="hud-row">
        <div className="hud-row-head"><span className="hud-o2">O<sub>2</sub></span><b>{formatValue(s.o2)}</b><small>%</small><SourceTag path="suit.oxygenPct" /></div>
        <Bar frac={s.o2 / 100} level={s.status} />
      </div>
      <div className="hud-row">
        <div className="hud-row-head"><I.Battery /><b>{formatValue(s.batt)}</b><small>%</small><SourceTag path="suit.batteryPct" /></div>
        <Bar frac={s.batt / 100} level={battLevel} />
      </div>
      <div className="hud-row">
        <div className="hud-row-head"><I.Gauge /><b>{formatValue(s.psi, 1)}</b><small>psi</small><SourceTag path="suit.pressurePsi" /></div>
        <Bar frac={s.psi / 4.3} level="nominal" />
      </div>
      <div className={'hud-walkback hud-' + s.status} title="Oxygen margin after walking back to the habitat and keeping the 30 min reserve">
        <div className="hud-row-head"><I.Return /><b>{formatMinutes(s.marginSec, { signed: true })}</b><small>min</small><SourceTag path="suit.marginSec" /></div>
        <div className="hud-caption">WALKBACK MARGIN · home in {formatMinutes(s.walkbackSec)} min</div>
      </div>
    </section>
  );
}

// An environment value is shown only once something has registered its source: the store's starting values (for example
// dustOpacity 0) are not measurements, so without a source the HUD shows a dash.
function EnvValue({ icon, path, value, unit, title }) {
  const sourced = useMissionStore((s) => !!s.sources[path]);
  return (
    <div className="hud-env-item" title={title}>
      {icon}<b>{sourced ? value : '–'}</b>{unit && <small>{unit}</small>}<SourceTag path={path} />
    </div>
  );
}

function EnvStrip() {
  const e = useMissionStore(useShallow((s) => ({ t: s.environment.tempC, w: s.environment.windMs, tau: s.environment.dustOpacity, dose: s.environment.doseUgy, rate: s.environment.doseRateUgyH })));
  return (
    <section className="hud-panel hud-env" aria-label="Environment">
      <EnvValue icon={<I.Thermometer />} path="environment.tempC" value={formatValue(e.t)} unit="°C" title="Air temperature" />
      <EnvValue icon={<I.Wind />} path="environment.windMs" value={formatValue(e.w)} unit="m/s" title="Wind speed" />
      <EnvValue icon={<span className="hud-tau">τ</span>} path="environment.dustOpacity" value={formatValue(e.tau, 2)} title="Dust opacity (tau)" />
      <EnvValue icon={<I.Radiation />} path="environment.doseUgy" value={formatValue(e.dose)} unit="µGy" title={'Radiation dose this EVA' + (typeof e.rate === 'number' ? ` · rate ${e.rate.toFixed(1)} µGy/h` : '')} />
    </section>
  );
}

function WaypointPanel({ heightAt, slopeAt }) {
  const w = useMissionStore(useShallow((s) => {
    const info = nextWaypointInfo(s.route, s.navigation);
    if (!info) return null;
    return {
      name: info.shortName,
      full: info.name,
      range: Math.round(Number.isFinite(s.navigation.waypointRangeM) ? s.navigation.waypointRangeM : info.rangeM),
      brg: Math.round(Number.isFinite(s.navigation.waypointBearingDeg) ? s.navigation.waypointBearingDeg : info.bearingDeg),
      eta: Math.round(info.etaSec / 60),
      slope: s.navigation.slopeDeg,
      path: s.route.path,
      waypoints: s.route.waypoints,
      position: Number.isFinite(s.navigation.x) && Number.isFinite(s.navigation.z) ? { x: s.navigation.x, z: s.navigation.z } : null,
    };
  }));
  if (!w) return <section className="hud-panel hud-waypoint hud-waypoint-empty" aria-label="Next waypoint">No route yet · plan one in Plan mode</section>;
  return (
    <section className="hud-panel hud-waypoint" aria-label="Next waypoint" title={w.full}>
      <div className="hud-waypoint-row">
        <div className="hud-wp-name"><I.Pointer /><b>{w.name}</b></div>
        <div className="hud-wp-cell"><div><b>{w.range}</b><small>m</small></div><span>RNG</span></div>
        <div className="hud-wp-cell"><div><b>{String(w.brg).padStart(3, '0')}</b><small>°</small></div><span>BRG</span></div>
        <div className="hud-wp-cell"><div><b>{w.eta}</b><small>min</small></div><span>ETA</span></div>
        <div className="hud-wp-cell"><div><b>{formatValue(w.slope)}</b><small>°</small></div><span>SLOPE</span></div>
      </div>
      <ElevationProfile
        path={w.path}
        waypoints={w.waypoints}
        heightAt={heightAt}
        slopeAt={slopeAt}
        position={w.position}
        compact
      />
    </section>
  );
}

function WaypointMarker({ engine }) {
  const info = useMissionStore(useShallow((s) => {
    const next = nextWaypointInfo(s.route, s.navigation);
    return next ? {
      name: next.shortName,
      full: next.name,
      x: next.x,
      z: next.z,
      rangeM: next.rangeM,
      bearingDeg: next.bearingDeg,
      headingDeg: s.navigation.headingDeg,
    } : null;
  }));
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!engine || !info) return undefined;
    const update = () => {
      const projected = engine.project(info.x, info.z);
      if (!projected) return;
      if (projected.visible) {
        setPosition({ mode: 'marker', x: projected.x, y: projected.y });
        return;
      }
      const heading = Number.isFinite(info.headingDeg) ? info.headingDeg : 0;
      const relative = ((info.bearingDeg - heading + 540) % 360) - 180;
      const rad = relative * Math.PI / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const halfW = Math.max(40, window.innerWidth / 2 - 84);
      const halfH = Math.max(40, window.innerHeight / 2 - 84);
      let t = Infinity;
      if (Math.abs(dx) > 1e-6) t = Math.min(t, halfW / Math.abs(dx));
      if (Math.abs(dy) > 1e-6) t = Math.min(t, halfH / Math.abs(dy));
      if (!Number.isFinite(t)) t = 0;
      setPosition({
        mode: 'edge',
        x: window.innerWidth / 2 + dx * t,
        y: window.innerHeight / 2 + dy * t,
        angle: relative,
      });
    };
    update();
    const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [engine, info]);

  if (!info || !position) return null;
  if (position.mode === 'marker') {
    return (
      <div className="hud-wp-marker" style={{ left: position.x, top: position.y }} title={info.full}>
        <span className="hud-wp-marker-name">{info.name}</span>
        <span className="hud-wp-marker-range">{Math.round(info.rangeM)} m</span>
      </div>
    );
  }
  return (
    <div
      className="hud-wp-arrow"
      style={{ left: position.x, top: position.y, transform: `translate(-50%, -50%) rotate(${position.angle}deg)` }}
      title={`${info.full} · ${Math.round(info.rangeM)} m`}
      aria-label={`Waypoint ${info.full}, ${Math.round(info.rangeM)} metres, off screen`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 21 12 16 3 21Z" /></svg>
    </div>
  );
}

function AlertBanner() {
  const alert = useMissionStore(useShallow((s) => { const a = pickAlert(s.alerts); return a ? { id: a.id, level: a.level, text: a.text } : null; }));
  if (!alert) return null;
  return (
    <div className={'hud-alert hud-alert-' + alert.level} role={alert.level === 'info' ? 'status' : 'alert'}>
      <I.Alert /><span>{alert.text}</span>
    </div>
  );
}

/** The whole visor HUD. Rendered by App in Walk mode once the scene is ready. */
export default function Hud({ engine }) {
  return (
    <div className="hud" aria-label="Helmet display">
      <HeadingTape />
      <WaypointMarker engine={engine} />
      <AlertBanner />
      <Clocks />
      <SuitPanel />
      <EnvStrip />
      <WaypointPanel heightAt={engine?.heightAt} slopeAt={engine?.slopeAt} />
    </div>
  );
}
