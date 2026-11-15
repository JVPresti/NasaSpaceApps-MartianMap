import { t, formatNumber } from '../i18n/index.js';
// Helmet HUD (issue #20): what the astronaut reads while walking. Every value comes from the mission store; the store
// changes a few times per second (suit 4 Hz, position 5 Hz), so these components re-render at that rate, never per frame.
// Layout follows the v3 "Caminar · Normal" mockup; final Figma measurements come later (#11).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import SharedSourceTag from '../components/SourceTag.jsx';
import { useMissionStore } from '../state/store.js';
import { bearingDeg } from '../sim/bearing.js';
import { nextTarget } from '../sim/waypointRunner.js';
import { batteryLevel, cardinal, formatDose, formatEva, formatMinutes, formatValue, nextWaypointInfo, wrapDeg } from './format.js';
import ElevationProfile from './ElevationProfile.jsx';
import RadioLink from './RadioLink.jsx';
import LayerChip from './LayerChip.jsx';
import SlopeAhead from './SlopeAhead.jsx';
import * as I from './icons.jsx';
import { clearOfRects, createPanelRects } from './labelClear.js';
import { applyVisorClasses, isDetailToggle, samplingInProgress } from './visorMode.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import { setLiveEngine, usePoseFrame } from './livePose.js';
import NavLine from './NavLine.jsx';
import Minimap from './Minimap.jsx';
import './hud.css';
import './hudMobile.css';
import { SamplingChecklist, SamplingCrosshair } from './SamplingPanel.jsx';
import PartnerPanel from './PartnerPanel.jsx';
import { useInCabin } from './useInCabin.js';

// Shared source tag (#62). The HUD never takes the pointer, so the tag shows its tag text only and puts the full
// source in the title and the screen reader text.
const hudSrc = (tag) => 'hud-src hud-src-' + tag;
const SourceTag = ({ path }) => <SharedSourceTag path={path} variant="tag" interactive={false} requireSource className={hudSrc} />;

function Pill({ icon, children, label }) {
  return <div className="hud-pill" aria-label={label}>{icon}{children}</div>;
}

function Clocks() {
  const { elapsedSec, lmst } = useMissionStore(useShallow((s) => ({ elapsedSec: s.mission.elapsedSec, lmst: s.mission.lmst })));
  return (
    <>
      <div className="hud-eva"><Pill icon={<I.Stopwatch />} label={t('ui.eva.time')}><b>{t('ui.eva')}{formatEva(elapsedSec)}</b></Pill></div>
      <div className="hud-lmst"><Pill icon={<I.Horizon />} label={t('ui.local.mean.solar.time')}><b>{lmst || '––:––'}</b> <small>{t('ui.lmst')}</small></Pill></div>
    </>
  );
}

const SPAN = 60;                         // degrees shown each side of the heading
const W = 1120, R = 1500, CX = W / 2, TOP = 12, SWEEP = 0.4;   // tape geometry in viewBox units
const arc = (offsetDeg) => { const a = offsetDeg / SPAN * SWEEP; return { x: CX + R * Math.sin(a), y: TOP + R * (1 - Math.cos(a)), a }; };

// The tape is drawn once for every heading (ticks at their absolute bearing on one circle) and turned as a group each
// frame; the labels counter-turn so they stay upright, and a wedge-shaped clip keeps the visible arc to ±SPAN.
const TICKS = [];
for (let d = -SPAN; d <= 360 + SPAN; d += 5) {
  const { x, y, a } = arc(d), major = d % 15 === 0, len = major ? 12 : 6;
  TICKS.push({ d, x, y, a, major, len, label: wrapDeg(d) % 45 === 0 ? cardinal(d) : null });
}
const PIVOT = { x: CX, y: TOP + R };
const rad2deg = 180 / Math.PI;
const CLIP = (() => {   // a wedge from the circle's centre through both ends of the visible arc, a little past the labels
  const far = R * 1.2, a = SWEEP;
  return `M${PIVOT.x} ${PIVOT.y} L${PIVOT.x + far * Math.sin(-a)} ${PIVOT.y - far * Math.cos(-a)} L${PIVOT.x + far * Math.sin(a)} ${PIVOT.y - far * Math.cos(a)} Z`;
})();

function HeadingTape() {
  const heading = useMissionStore((s) => s.navigation.headingDeg);
  const target = useMissionStore(useShallow((s) => { const w = nextWaypointInfo(s.route, s.navigation); return w ? Math.round(w.bearingDeg) : null; }));
  const group = useRef(null), box = useRef(null), shown = useRef({ h: null, text: null });
  const h0 = typeof heading === 'number' ? heading : null;
  // Per frame: turn the tape to the engine's heading and update the box, writing to the DOM only when it changed.
  usePoseFrame((p) => {
    const h = p && Number.isFinite(p.headingDeg) ? p.headingDeg : null;
    if (h === null || h === shown.current.h || !group.current) return;
    shown.current.h = h;
    const turn = -(h / SPAN) * SWEEP * rad2deg;
    group.current.setAttribute('transform', `rotate(${turn} ${PIVOT.x} ${PIVOT.y})`);
    for (const el of group.current.querySelectorAll('text')) el.setAttribute('transform', `rotate(${-turn} ${el.getAttribute('x')} ${el.getAttribute('y')})`);
    const text = Math.round(wrapDeg(h)) + '°';
    if (box.current && text !== shown.current.text) { box.current.textContent = text; shown.current.text = text; }
  });
  // the first paint and the case without a live engine use the store's heading
  const turn0 = h0 === null ? 0 : -(h0 / SPAN) * SWEEP * rad2deg;
  // the waypoint marker sits at its absolute bearing, drawn radially so it points at the arc after the turn
  const markerAt = (deg) => { const { x, y, a } = arc(deg); return <path key={deg} d={`M${x - 7} ${y + 16} L${x + 7} ${y + 16} L${x} ${y + 27} Z`} transform={`rotate(${a * rad2deg} ${x} ${y})`} className="hud-tape-target" />; };
  const markers = target === null ? [] : [target, target < SPAN ? target + 360 : null, target > 360 - SPAN ? target - 360 : null].filter((d) => d !== null).map(markerAt);
  const path = `M${arc(-SPAN).x} ${arc(-SPAN).y} A${R} ${R} 0 0 1 ${arc(SPAN).x} ${arc(SPAN).y}`;
  return (
    <div className="hud-heading" aria-label={h0 === null ? t('ui.heading.unknown') : t('ui.heading.p0.degrees', { p0: Math.round(h0) })}>
      <svg viewBox={`0 0 ${W} 120`} className="hud-tape" aria-hidden="true">
        <defs><clipPath id="hud-tape-clip"><path d={CLIP} /></clipPath></defs>
        <path d={path} className="hud-tape-arc" />
        {h0 !== null && (
          <g clipPath="url(#hud-tape-clip)">
            <g ref={group} transform={`rotate(${turn0} ${PIVOT.x} ${PIVOT.y})`}>
              {TICKS.map((k) => <line key={'t' + k.d} x1={k.x} y1={k.y} x2={k.x - Math.sin(k.a) * k.len} y2={k.y + Math.cos(k.a) * k.len} className={k.major ? 'hud-tick-major' : 'hud-tick'} />)}
              {TICKS.filter((k) => k.label).map((k) => (
                <text key={'l' + k.d} x={k.x - Math.sin(k.a) * 30} y={k.y + Math.cos(k.a) * 30} transform={`rotate(${-turn0} ${k.x - Math.sin(k.a) * 30} ${k.y + Math.cos(k.a) * 30})`} className="hud-tape-label">{k.label}</text>
              ))}
              {markers}
            </g>
          </g>
        )}
        <line x1={CX} y1={TOP - 10} x2={CX} y2={TOP + 18} className="hud-tape-center" />
      </svg>
      <div className="hud-heading-box" ref={box}>{h0 === null ? '–' : Math.round(wrapDeg(h0)) + '°'}</div>
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
    walkbackSec: st.suit.walkbackSec, walkbackTo: st.suit.walkbackTo, marginSec: st.suit.marginSec, status: st.suit.status || 'nominal',
  })));
  const battLevel = batteryLevel(s.batt);
  return (
    <section className="hud-panel hud-suit" aria-label={t('ui.suit')}>
      <div className="hud-row">
        <div className="hud-row-head"><span className="hud-o2">{t('ui.o')}<sub>2</sub></span><b>{formatValue(s.o2)}</b><small>%</small><SourceTag path="suit.oxygenPct" /></div>
        <Bar frac={s.o2 / 100} level={s.status} />
      </div>
      <div className="hud-row">
        <div className="hud-row-head"><I.Battery /><b>{formatValue(s.batt)}</b><small>%</small><SourceTag path="suit.batteryPct" /></div>
        <Bar frac={s.batt / 100} level={battLevel} />
      </div>
      <div className="hud-row">
        <div className="hud-row-head"><I.Gauge /><b>{formatValue(s.psi, 1)}</b><small>{t('ui.psi')}</small><SourceTag path="suit.pressurePsi" /></div>
        <Bar frac={s.psi / 4.3} level="nominal" />
      </div>
      <div className={'hud-walkback hud-' + s.status} title={t('ui.margin.now.title')}>
        <div className="hud-row-head"><I.Return /><b>{formatMinutes(s.marginSec, { signed: true })}</b><small>{t('ui.min')}</small><SourceTag path="suit.marginSec" /></div>
        <div className="hud-caption">{t(s.walkbackTo === 'shelter' ? 'ui.margin.now.shelter.in' : 'ui.margin.now.home.in')}{formatMinutes(s.walkbackSec)}{t('units.minutesSuffix')}</div>
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
    <section className="hud-panel hud-env" aria-label={t('ui.environment')}>
      <EnvValue icon={<I.Thermometer />} path="environment.tempC" value={formatValue(e.t)} unit={t('ui.c')} title={t('ui.air.temperature')} />
      <EnvValue icon={<I.Wind />} path="environment.windMs" value={formatValue(e.w)} unit={t('ui.m.s')} title={t('ui.wind.speed')} />
      <EnvValue icon={<span className="hud-tau">τ</span>} path="environment.dustOpacity" value={formatValue(e.tau, 2)} title={t('ui.dust.opacity.tau')} />
      <EnvValue icon={<I.Radiation />} path="environment.doseUgy" value={formatDose(e.dose)} unit={t('ui.gy')} title={t('ui.radiation.dose.this.eva') + (typeof e.rate === 'number' ? t('ui.rate.rate.gy.h', { rate: formatNumber(e.rate, 1) }) : '')} />
    </section>
  );
}

function WaypointPanel({ heightAt, slopeAt }) {
  const w = useMissionStore(useShallow((s) => {
    const info = nextWaypointInfo(s.route, s.navigation);
    const complete = !info && nextTarget(s.route)?.kind === 'complete';
    if (!info && !complete) return null;
    return {
      complete,
      shelter: info?.kind === 'shelter',
      name: info?.shortName,
      full: info?.name,
      // Range and bearing come from nextTarget and the position, like the runner's navigation.waypointRangeM, so the
      // panel, the tape and the marker never show a target the runner has already left.
      range: info ? Math.round(info.rangeM) : null,
      brg: info ? Math.round(info.bearingDeg) : null,
      eta: info ? Math.round(info.etaSec / 60) : null,
      reached: Array.isArray(s.route.visited) ? s.route.visited.length : 0,
      total: s.route.waypoints.length,
      slope: s.navigation.slopeDeg,
      path: s.route.path,
      waypoints: s.route.waypoints,
      px: s.navigation.x,   // plain numbers only: useShallow compares one level deep, so a new { x, z } object here
      pz: s.navigation.z,   // would look like a change on every read and re-render forever (#153)
    };
  }));
  const px = w?.px, pz = w?.pz;
  const position = useMemo(() => (Number.isFinite(px) && Number.isFinite(pz) ? { x: px, z: pz } : null), [px, pz]);
  if (!w) return <section className="hud-panel hud-waypoint hud-waypoint-empty" aria-label={t('ui.next.waypoint')}>{t('ui.no.route.yet.plan.one.in.plan.mode')}</section>;
  return (
    <section className="hud-panel hud-waypoint" aria-label={w.complete ? t('ui.route.complete') : w.shelter ? t('ui.shelter') : t('ui.next.waypoint')} title={w.complete ? undefined : w.full}>
      <div className="hud-waypoint-row">
        {w.complete ? (
          <>
            <div className="hud-wp-name"><I.Pointer /><b>{t('ui.route.complete')}</b></div>
            <div className="hud-wp-cell"><div><b>{w.reached}</b><small>{t('ui.of')}{w.total}</small></div><span>{t('ui.reached')}</span></div>
          </>
        ) : (
          <>
            <div className="hud-wp-name"><I.Pointer /><b>{w.name}</b>{w.shelter && <small>{t('ui.shelter.89')}</small>}</div>
            <div className="hud-wp-cell"><div><b>{w.range}</b><small>{t('units.metres')}</small><SourceTag path="navigation.waypointRangeM" /></div><span>{t('ui.rng')}</span></div>
            <div className="hud-wp-cell"><div><b>{String(w.brg).padStart(3, '0')}</b><small>°</small><SourceTag path="navigation.waypointBearingDeg" /></div><span>{t('ui.brg')}</span></div>
            <div className="hud-wp-cell"><div><b>{w.eta}</b><small>{t('ui.min')}</small></div><span>{t('ui.eta')}</span></div>
          </>
        )}
        <div className="hud-wp-cell"><div><b>{formatValue(w.slope)}</b><small>°</small></div><span>{t('ui.slope')}</span></div>
      </div>
      <ElevationProfile
        path={w.path}
        waypoints={w.waypoints}
        heightAt={heightAt}
        slopeAt={slopeAt}
        position={position}
        compact
      />
    </section>
  );
}

const EDGE_INSET_PX = 84;   // the edge arrow keeps this far from the sides of the view

// Where the marker goes on screen: over the target when the camera sees it, else an arrow on the edge of the view
// that points the way to turn. Sizes are the engine container's, the same ones engine.project() uses.
function placeMarker(engine, target, width, height) {
  const projected = engine.project(target.x, target.z);
  if (!projected) return null;
  if (projected.visible) return { mode: 'marker', x: projected.x, y: projected.y };
  const player = engine.getPlayer();
  const relative = ((bearingDeg(player, target) - player.headingDeg + 540) % 360) - 180;
  const rad = relative * Math.PI / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const halfW = Math.max(40, width / 2 - EDGE_INSET_PX), halfH = Math.max(40, height / 2 - EDGE_INSET_PX);
  let t = Infinity;
  if (Math.abs(dx) > 1e-6) t = Math.min(t, halfW / Math.abs(dx));
  if (Math.abs(dy) > 1e-6) t = Math.min(t, halfH / Math.abs(dy));
  if (!Number.isFinite(t)) t = 0;
  return { mode: 'edge', x: width / 2 + dx * t, y: height / 2 + dy * t, angle: relative };
}

// Projects every frame and writes style.transform through refs, so the marker follows head turns without a React
// render. The store only changes the text (name and range) at its own rate.
function WaypointMarker({ engine }) {
  const info = useMissionStore(useShallow((s) => {
    const next = nextWaypointInfo(s.route, s.navigation);
    return next ? { name: next.shortName, full: next.name, x: next.x, z: next.z, rangeM: Math.round(next.rangeM) } : null;
  }));
  const target = useRef(null);
  useEffect(() => { target.current = info; }, [info]);
  const marker = useRef(null);
  const arrow = useRef(null);
  const hasTarget = info !== null;

  useEffect(() => {
    if (!engine || !hasTarget) return undefined;
    let frame = 0, panels = null;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const m = marker.current, a = arrow.current, t = target.current;
      if (!m || !a) return;
      const box = m.parentElement;   // the .hud overlay, inset 0 over the engine container
      const place = t && box ? placeMarker(engine, t, box.clientWidth, box.clientHeight) : null;
      // a world label behind a HUD panel shows through it and reads as a glitch (#283). Move it beside the panel, or hide
      // it when there is no clear spot, since the panel below already names the waypoint and its range
      if (place?.mode === 'marker' && box && !panels) panels = createPanelRects(box);
      const p = place?.mode === 'marker' ? panels.get(m) : null;
      const clear = p ? clearOfRects(place, p.w, p.h, p.rects) : true;
      m.style.visibility = place?.mode === 'marker' && clear ? 'visible' : 'hidden';
      a.style.visibility = place?.mode === 'edge' ? 'visible' : 'hidden';
      if (!place) return;
      const el = place.mode === 'marker' ? m : a;
      el.style.transform = `translate(${place.x}px, ${place.y}px) translate(-50%, -50%)` + (place.mode === 'edge' ? ` rotate(${place.angle}deg)` : '');
    };
    draw();
    return () => { cancelAnimationFrame(frame); if (panels) panels.dispose(); };
  }, [engine, hasTarget]);

  if (!info) return null;
  return (
    <>
      <div ref={marker} className="hud-wp-marker" style={{ left: 0, top: 0, visibility: 'hidden' }} title={info.full}>
        <span className="hud-wp-marker-name">{info.name}</span>
        <span className="hud-wp-marker-range">{info.rangeM}{t('units.metresSuffix')}<SourceTag path="navigation.waypointRangeM" /></span>
      </div>
      <div
        ref={arrow}
        className="hud-wp-arrow"
        style={{ left: 0, top: 0, visibility: 'hidden' }}
        title={`${info.full} · ${info.rangeM} m`}
        aria-label={t('ui.waypoint.p0.p1.metres.off.screen', { p0: info.full, p1: info.rangeM })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 21 12 16 3 21Z" /></svg>
      </div>
    </>
  );
}

// I shows every instrument (#283). By default the visor keeps what a walk needs: heading, EVA clock, suit and margin,
// next waypoint, partner and minimap. The full set adds the environment strip, the navigation and radio lines, the
// sampling checklist, local solar time and the source tag of each reading. A panel that is warning stays visible.
function useHudDetail() {
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (isDetailToggle(e, { wristOwnsKeys: wristOwnsKeys(), dialogOpen: !!document.querySelector('dialog[open]') })) setDetail((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return detail;
}

/**
 * The two keys a first-time player needs to find everything else. It also owns the visor's mode classes on the .hud
 * element: hud-detail while I is on, hud-sampling-on while a rock or the soil is in view or a sample is under way (the
 * checklist also shows while a science card is open, see hud.css).
 */
function KeyHint({ engine }) {
  const ref = useRef(null);
  useEffect(() => { setLiveEngine(engine ?? null); return () => setLiveEngine(null); }, [engine]);   // the per-frame pose feed (#307)
  // hud-wrist while the wrist screen is up (#286): the waypoint panel folds to its header row (hud.css)
  useEffect(() => {
    const hud = ref.current && ref.current.closest('.hud');
    if (!hud || !engine || typeof engine.subscribeWrist !== 'function') return undefined;
    const off = engine.subscribeWrist((state) => hud.classList.toggle('hud-wrist', state?.open === true));
    return () => { if (typeof off === 'function') off(); hud.classList.remove('hud-wrist'); };
  }, [engine]);
  const detail = useHudDetail();
  const sampling = useMissionStore(samplingInProgress);
  useLayoutEffect(() => {
    const hud = ref.current && ref.current.closest('.hud');
    if (!hud) return undefined;
    applyVisorClasses(hud.classList, { detail, sampling });
    return () => hud.classList.remove('hud-detail', 'hud-sampling-on');
  }, [detail, sampling]);
  return (
    <div className="hud-keys" aria-hidden="true" ref={ref}>
      <span><kbd>H</kbd>{t('ui.hud.keys.controls')}</span>
      <span><kbd>I</kbd>{t(detail ? 'ui.hud.keys.fewer' : 'ui.hud.keys.instruments')}</span>
    </div>
  );
}

/**
 * The whole visor HUD. Rendered by App in Walk mode once the scene is ready. Alerts show in App's event banner, under
 * the heading box (src/events/events.css), so the HUD has no alert strip of its own.
 * `minimapRoute` is App's route tracker: it outlives this component so Plan mode does not reset the walk.
 */
export default function Hud({ engine, minimapRoute }) {
  // In the habitat's cabin the table prompt is the interface (#244): the next-waypoint panel and marker, centred and about
  // the walk outside, give way to it so they neither cover it nor point the crew back out, and so does the sampling ring.
  const cabin = useInCabin(engine);
  return (
    <div className="hud" aria-label={t('ui.helmet.display')}>
      <HeadingTape />
      {!cabin && <WaypointMarker engine={engine} />}
      <SlopeAhead engine={engine} />
      <Clocks />
      <KeyHint engine={engine} />
      <SuitPanel />
      <PartnerPanel />
      <LayerChip />
      {/* One flex column on the right (#191): each panel sits under the one above, so none can cover another. */}
      <div className="hud-right">
        <Minimap tracker={minimapRoute} />
        <SamplingChecklist />
        <EnvStrip />
        <NavLine><SourceTag path="navigation.errorM" /></NavLine>
        <RadioLink engine={engine} />
      </div>
      {!cabin && <WaypointPanel heightAt={engine?.heightAt} slopeAt={engine?.slopeAt} />}
      <SamplingCrosshair reticle={!cabin} />
    </div>
  );
}
