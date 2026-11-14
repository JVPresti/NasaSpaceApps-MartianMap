import { t, translateText } from '../i18n/index.js';
// Partner on the helmet HUD (#70, plan section 3.4 scenario 7). The visor keeps one chip: suit status dot, range and a
// bearing arrow relative to the heading. The detail (O2, battery, separation bar with the limit) opens with T, and
// opens by itself while the separation or the partner's suit is in caution or warning. Plan section 3.3: what takes
// reading stays off the visor until asked for. The values come from crew[0], written by src/sim/partnerRunner.js.
// With no radio line of sight (plan section 4.2) the chip greys out and shows the last known position.
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import SharedSourceTag from '../components/SourceTag.jsx';
import { useMissionStore } from '../state/store.js';
import { crewCss } from './crewColor.js';
import { batteryLevel, formatValue } from './format.js';
import * as I from './icons.jsx';
import './partner.css';

/** Key that opens and closes the partner detail. T for "team": the engine uses WASD, arrows, Shift, P, E and F. */
const PARTNER_KEY = 'KeyT';

const hudSrc = (tag) => 'hud-src hud-src-' + tag;
const SourceTag = ({ path }) => <SharedSourceTag path={path} variant="tag" interactive={false} requireSource className={hudSrc} />;

const RANK = { nominal: 0, caution: 1, warning: 2 };
const worst = (...levels) => levels.reduce((a, b) => ((RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a), 'nominal');


const typingTarget = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function usePartnerKey() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== PARTNER_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typingTarget(e.target)) return;
      setOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return open;
}

function Bar({ frac, level, marks = [] }) {
  const f = Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  return (
    <div className={'hud-bar hud-partner-bar hud-' + level}>
      <span style={{ width: f * 100 + '%' }} />
      {marks.map((m) => <i key={m.at} className={'hud-partner-mark hud-partner-mark-' + m.kind} style={{ left: m.at * 100 + '%' }} />)}
    </div>
  );
}

export default function PartnerPanel() {
  const manual = usePartnerKey();
  const p = useMissionStore(useShallow((s) => {
    const c = s.crew[0];
    if (!c || !Number.isFinite(c.rangeM)) return null;
    const h = s.navigation.headingDeg;
    return {
      id: c.id, color: crewCss(c.color),
      rangeM: Math.round(c.rangeM), bearingDeg: Math.round(c.bearingDeg),
      relDeg: Number.isFinite(h) && Number.isFinite(c.bearingDeg) ? Math.round(((c.bearingDeg - h + 540) % 360) - 180) : null,
      o2: Number.isFinite(c.oxygenPct) ? Math.round(c.oxygenPct) : null,
      batt: Number.isFinite(c.batteryPct) ? Math.round(c.batteryPct) : null,
      o2Level: c.status || 'nominal', battLevel: batteryLevel(c.batteryPct),
      separation: c.separation || 'nominal',
      limitM: c.separationLimitM ?? 100, cautionM: c.separationCautionM ?? 80,
      link: c.link !== false,
      // whole minutes since the last radio contact, so the selector changes once a minute at most
      ageMin: c.link === false && Number.isFinite(c.lastContactSec) ? Math.floor(Math.max(0, (s.mission.elapsedSec ?? 0) - c.lastContactSec) / 60) : null,
    };
  }));
  if (!p) return null;

  const suit = worst(p.o2Level, p.battLevel);
  const open = manual || suit !== 'nominal' || p.separation !== 'nominal';
  const scale = p.limitM * 1.2;   // the bar runs 20 % past the limit so a warning still shows how far over
  const brg = String(p.bearingDeg % 360).padStart(3, '0');
  const lastSeen = p.ageMin === null ? '' : p.ageMin < 1 ? t('menu.under.1.min.ago') : t('fixAgeMinutes', { minutes: p.ageMin });
  const label = t('menu.partner.p0.p1.p2.metres.bearing.p3.suit', { p0: p.id, p1: p.link ? '' : t('menu.no.radio.link.last.known'), p2: p.rangeM, p3: brg, p4: translateText(suit), p5: translateText(p.separation) });

  return (
    <section className={'hud-partner hud-partner-sep-' + p.separation + (p.link ? '' : ' hud-partner-lost')} aria-label={label} style={p.color ? { '--partner': p.color } : undefined}>
      <div className="hud-panel hud-partner-chip">
        <span className={'hud-partner-dot hud-partner-dot-' + (p.link ? suit : 'lost')} title={p.link ? t('menu.partner.suit.status', { status: translateText(suit) }) : t('menu.no.radio.link')} />
        <b className="hud-partner-id">{p.id}</b>
        {p.relDeg !== null && (
          <svg viewBox="0 0 24 24" className="hud-icon hud-partner-arrow" style={{ transform: `rotate(${p.relDeg}deg)` }} aria-hidden="true">
            <path d="M12 3 19 20 12 16 5 20Z" />
          </svg>
        )}
        <span className="hud-partner-range"><b>{p.rangeM}</b><small>{t('units.metres')}</small></span>
        <span className="hud-partner-brg">{brg}<small>°</small></span>
        {!p.link && <span className="hud-partner-last" title={t('menu.last.known.position.age', { age: lastSeen })}>{t('menu.last')}</span>}
        {!open && p.link && <kbd className="hud-partner-key" title={t('menu.press.t.for.partner.detail')}>{t('menu.t')}</kbd>}
      </div>
      {open && (
        <div className="hud-panel hud-partner-detail">
          {!p.link && <div className="hud-partner-nolink">{t('menu.no.link.last.contact')}{lastSeen}<SourceTag path="crew.0.link" /></div>}
          <div className="hud-partner-row">
            <div className="hud-row-head"><span className="hud-o2">{t('ui.o')}<sub>2</sub></span><b>{formatValue(p.o2)}</b><small>%</small><SourceTag path="crew.0.oxygenPct" /></div>
            <Bar frac={p.o2 / 100} level={p.o2Level} />
          </div>
          <div className="hud-partner-row">
            <div className="hud-row-head"><I.Battery /><b>{formatValue(p.batt)}</b><small>%</small><SourceTag path="crew.0.batteryPct" /></div>
            <Bar frac={p.batt / 100} level={p.battLevel} />
          </div>
          <div className="hud-partner-row hud-partner-sep">
            <div className="hud-row-head"><span className="hud-partner-sep-label">{t('menu.sep')}</span><b>{p.rangeM}</b><small>/ {p.limitM}{t('units.metresSuffix')}</small><SourceTag path="crew.0.rangeM" /></div>
            <Bar frac={p.rangeM / scale} level={p.separation} marks={[{ at: p.cautionM / scale, kind: 'caution' }, { at: p.limitM / scale, kind: 'limit' }]} />
            <div className="hud-caption">{t('menu.separation.limit')}{p.limitM}{t('units.metresSuffix')}<SourceTag path="crew.0.separationLimitM" /></div>
          </div>
        </div>
      )}
    </section>
  );
}
