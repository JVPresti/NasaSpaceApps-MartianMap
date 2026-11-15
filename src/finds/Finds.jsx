// Unexpected find (#71, plan section 3.4 scenario 3). Hold Q for 2 s while looking at the ground: the right arm points,
// a ring fills around the centre of the view and a marker drops where the view meets the terrain. A card then prices
// the detour (time, O2, walkback margin before and after, go or no-go) and the crew chooses: Y adds the find to the
// route, N or Esc dismisses it. The card closes after the choice, so nothing stays on the visor. In the habitat's cabin an
// unanswered card waits, keys included, so it never covers the table prompt (#244); it comes back outside the cabin.
//
// App mounts this once the scene is ready, in both modes: the markers in the scene follow the store in Walk and in Plan,
// the ring and the card show only in Walk. The ring is redrawn through refs, never by a React render per frame.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import SharedSourceTag from '../components/SourceTag.jsx';
import { FIND_HOLD_MS, FIND_RANGE_M, FIND_STEADY_M, MAX_FINDS } from '../sim/findDetour.js';
import { createFindService, markFind, pruneFinds } from '../state/finds.js';
import { useMissionStore } from '../state/store.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import { formatMinutes } from '../hud/format.js';
import { useInCabin } from '../hud/useInCabin.js';
import { inCabin } from '../state/tableActions.js';
import { findMarkers } from './markers.js';
import { formatNumber, t, translateText } from '../i18n/index.js';
import '../hud/hud.css';
import './finds.css';

/** Hold to point. Q sits next to WASD and is free: the engine uses WASD, arrows, Shift, P, E and F, the interface M, L, 0, H,
 * T, C and G (slope grid). */
export const FIND_KEY = 'KeyQ';
const ACCEPT_KEY = 'KeyY';
const DISMISS_KEY = 'KeyN';
const RING_R = 26, RING_C = 2 * Math.PI * RING_R;

const hudSrc = (tag) => 'hud-src hud-src-' + tag;
const SourceTag = ({ path }) => <SharedSourceTag path={path} variant="tag" interactive={false} requireSource className={hudSrc} />;
const typingTarget = (el) => !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
const plainKey = (e) => !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typingTarget(e.target);

/** What markFind would refuse, checked when Q goes down so the arm does not rise for nothing. */
function markBlocker(finds) {
  const undecided = finds.list.find((f) => f.status !== 'accepted');
  if (undecided) return t('finds.decide.first', { label: undecided.label });
  if (finds.list.length >= MAX_FINDS) return t('finds.limit', { max: MAX_FINDS });
  return null;
}

function useTransientHint() {
  const [hint, setHint] = useState(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((text) => {
    clearTimeout(timer.current);
    setHint(text);
    timer.current = setTimeout(() => setHint(null), 2800);
  }, []);
  return [hint, flash];
}

function FindPointer({ engine, service }) {
  const ring = useRef(null);
  const arc = useRef(null);
  const [hint, flash] = useTransientHint();

  useEffect(() => {
    if (!engine) return undefined;
    let hold = null;   // { t0, anchor, frame } while Q is down

    const draw = (frac, state) => {
      const el = ring.current, a = arc.current;
      if (!el || !a) return;
      el.dataset.state = state;
      a.style.strokeDashoffset = String(RING_C * (1 - frac));
    };
    const stop = () => {
      if (!hold) return;
      cancelAnimationFrame(hold.frame);
      hold = null;
      engine.setPointing(false);
      draw(0, 'off');
    };
    const step = () => {
      if (!hold) return;
      hold.frame = requestAnimationFrame(step);
      const s = useMissionStore.getState();
      if (s.mission.paused || s.mode !== 'walk' || wristOwnsKeys()) { stop(); return; }
      const now = performance.now(), aim = engine.aimGround(FIND_RANGE_M);
      if (!aim) { hold.anchor = null; hold.t0 = now; draw(0, 'none'); return; }   // sky or ground past 50 m
      if (!hold.anchor || Math.hypot(aim.x - hold.anchor.x, aim.z - hold.anchor.z) > FIND_STEADY_M) { hold.anchor = aim; hold.t0 = now; }
      const frac = Math.min(1, (now - hold.t0) / FIND_HOLD_MS);
      draw(frac, 'aim');
      if (frac < 1) return;
      stop();
      const r = markFind(aim);
      if (r.ok) service.price(r.find.id);
      else if (r.reason !== 'invalid') flash(markBlocker(useMissionStore.getState().finds));
    };
    const onDown = (e) => {
      if (e.code === 'Escape') { stop(); return; }
      if (e.code !== FIND_KEY || !plainKey(e) || hold) return;
      const s = useMissionStore.getState();
      if (s.mode !== 'walk' || s.mission.paused || wristOwnsKeys()) return;
      const blocked = markBlocker(s.finds);
      if (blocked) { flash(blocked); return; }
      hold = { t0: performance.now(), anchor: null, frame: 0 };
      engine.setPointing(true);
      step();
    };
    const onUp = (e) => { if (e.code === FIND_KEY) stop(); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', stop);
    return () => {
      stop();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', stop);
    };
  }, [engine, service, flash]);

  return (
    <>
      <div ref={ring} className="find-ring" data-state="off" aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r={RING_R} className="find-ring-track" />
          <circle ref={arc} cx="32" cy="32" r={RING_R} className="find-ring-arc" strokeDasharray={RING_C} strokeDashoffset={RING_C} />
        </svg>
        <span className="find-ring-label find-ring-label-aim">{t('finds.hold.on.the.spot')}</span>
        <span className="find-ring-label find-ring-label-none">{t('finds.no.ground', { range: FIND_RANGE_M })}</span>
      </div>
      {hint && <p className="find-hint" role="status">{hint}</p>}
    </>
  );
}

const REASONS = { blocked: 'finds.reason.blocked', unreachable: 'finds.reason.unreachable', margin: 'finds.reason.margin', 'no-margin': 'finds.reason.no.margin' };
const VERDICTS = { go: 'finds.verdict.go', 'no-go': 'finds.verdict.no.go' };

function FindCard({ service }) {
  const f = useMissionStore(useShallow((s) => {
    const find = s.finds.list.find((x) => x.id === s.finds.activeId);
    if (!find) return null;
    const d = find.detour;
    return {
      id: find.id, label: find.label, status: find.status, error: find.error,
      ok: !!d?.ok, verdict: d?.verdict ?? null, reason: d?.reason ?? null,
      extraSec: d?.extraSec ?? null, extraO2G: d?.extraO2G ?? null, extraM: d?.extraM ?? null,
      before: d?.marginBeforeSec ?? null, after: d?.marginAfterSec ?? null, marginStatus: d?.marginStatus ?? null,
    };
  }));
  const id = f?.id ?? null;
  const busy = f ? f.status === 'pricing' || f.status === 'accepting' : false;
  const canAdd = !!f && f.ok && !busy;

  useEffect(() => {
    if (!id) return undefined;
    const onKey = (e) => {
      if (!plainKey(e) || wristOwnsKeys() || useMissionStore.getState().mode !== 'walk') return;
      if (e.code === ACCEPT_KEY && canAdd) { e.preventDefault(); service.accept(id); }
      else if (e.code === DISMISS_KEY || e.code === 'Escape') { if (e.code === DISMISS_KEY) e.preventDefault(); service.dismiss(id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, canAdd, service]);

  if (!f) return null;
  const priced = f.status === 'priced' || f.status === 'accepting';
  const verdict = priced && f.verdict ? f.verdict : 'pending';
  const reasonKey = priced ? (REASONS[f.reason] ?? (f.marginStatus === 'caution' ? 'finds.reason.caution' : null)) : null;
  const why = reasonKey ? t(reasonKey) : null;
  return (
    <section className={'hud-panel find-card find-card-' + verdict} aria-label={t('finds.card.label', { label: f.label })}>
      <header className="find-card-head">
        <span className="find-card-title">{t('finds.card.title')} <b>{f.label}</b></span>
        {priced && f.verdict && (
          <span className={'find-verdict find-verdict-' + f.verdict}>{VERDICTS[f.verdict] ? t(VERDICTS[f.verdict]) : '–'}<SourceTag path="finds.verdict" /></span>
        )}
      </header>
      {f.status === 'pricing' && <p className="find-line find-dim">{t('finds.pricing')}</p>}
      {priced && f.ok && (
        <>
          <p className="find-line">
            <span className="find-key">{t('finds.detour')}</span>
            <b>+{formatMinutes(f.extraSec)}</b><small>min</small>
            <span className="find-sep">·</span>
            <b>+{formatNumber(f.extraO2G)}</b><small>g O<sub>2</sub></small>
            <span className="find-sep">·</span>
            <b>+{formatNumber(f.extraM)}</b><small>m</small>
            <SourceTag path="finds.extraSec" />
          </p>
          <p className="find-line">
            <span className="find-key">{t('finds.margin')}</span>
            <b>{formatMinutes(f.before, { signed: true })}</b>
            <span className="find-arrow">→</span>
            <b className={'find-margin-' + (f.marginStatus ?? 'nominal')}>{formatMinutes(f.after, { signed: true })}</b><small>min</small>
            <SourceTag path="finds.marginAfterSec" />
          </p>
        </>
      )}
      {why && <p className="find-why">{why}</p>}
      {f.error && <p className="find-error" role="alert">{translateText(f.error)}</p>}
      <div className="find-actions">
        <button type="button" onClick={() => service.accept(f.id)} disabled={!canAdd}>
          <kbd>Y</kbd>{t(f.status === 'accepting' ? 'finds.adding' : f.verdict === 'no-go' ? 'finds.add.anyway' : 'finds.add')}
        </button>
        <button type="button" onClick={() => service.dismiss(f.id)} disabled={f.status === 'accepting'}>
          <kbd>N</kbd>{t('finds.dismiss')}
        </button>
      </div>
    </section>
  );
}

/**
 * @param {{ engine: object | null, mode: 'walk' | 'plan' }} props
 */
export default function Finds({ engine, mode }) {
  // start / stop pair with the effect, so the extra cleanup StrictMode runs in development does not leave it stopped
  const [service] = useState(() => createFindService());
  useEffect(() => {
    service.start();
    return () => service.stop();
  }, [service]);

  // Markers in the scene (findMarkers). In Plan an accepted find is already a numbered waypoint marker, so only the
  // undecided one keeps its own marker there. The cabin check runs on every store change, as the position moves.
  useEffect(() => {
    if (!engine) return undefined;
    let last = null;
    const sync = () => {
      const s = useMissionStore.getState(), cabin = s.mode === 'walk' && inCabin(engine);
      if (last && last.list === s.finds.list && last.mode === s.mode && last.cabin === cabin) return;
      last = { list: s.finds.list, mode: s.mode, cabin };
      engine.setFinds(findMarkers(s, cabin));
    };
    sync();
    const unsubscribe = useMissionStore.subscribe(sync);
    return () => { unsubscribe(); engine.setFinds(null); };
  }, [engine]);

  // An accepted find leaves the list once its waypoint is reached or the route no longer has it.
  useEffect(() => useMissionStore.subscribe((s, prev) => {
    if (s.route.visited !== prev.route.visited || s.route.waypoints !== prev.route.waypoints) pruneFinds();
  }), []);

  // In the cabin the table prompt is the interface (#244): an unanswered card waits, keys included, until the crew is out.
  const cabin = useInCabin(engine);

  if (mode !== 'walk') return null;
  return (
    <div className="hud finds-layer">
      <FindPointer engine={engine} service={service} />
      {!cabin && <FindCard service={service} />}
    </div>
  );
}
