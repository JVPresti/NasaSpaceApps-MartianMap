// The presentation mode (#291): ?present=1. One camera falls from Mars orbit to the HiRISE ground at Cheyava Falls,
// the walkback zone is the hero shot, and the last beat hands over to the live mission table without a reload.
//
// Keys (presentation clickers send these): Right, Space, PageDown, Enter next; Left, PageUp back; L language; Esc exit.
// URL: &autoplay=1 runs the beats on their timings; &record=1 steps exactly 1/60 s a frame for scripts/present/record.mjs;
// &seq=global30 plays the 30 s global video cut; &beat=<id> starts at a beat; &tier=low forces the light version.
//
// Everything moves from one clock (clock.js), never from CSS transitions, so a recording is frame-perfect.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLanguage } from '../i18n/index.js';
import { useMissionStore } from '../state/store.js';
import { detectTier } from '../engine/tiers.js';
import { sequence, captionsOf } from './beats.js';
import { createClock, createTimeline, RECORD_STEP, easeInOut, easeOut, ramp, showValue, trackValue } from './clock.js';
import { blendShot, boxToLocal, cameraHeight, engineCamera, geoToLocal, localToGeo } from './geo.js';
import { createGlobe } from './globe.js';
import { createProjector } from './project.js';
import { layoutCards } from './layout.js';
import { decodeLast, fill, marginAt, clockAt, areaAt, resolvePlace, trackNumber, astronautAt } from './data.js';
import { createHoldTimer, fallbackStep, presentKey, queryWithoutPresent, restoreEngine as restoreFromStore } from './control.js';
import './present.css';

const BASE = (import.meta.env.BASE_URL || '/') + 'present/';
const GLOBE_FULL_M = 70_000;    // above this camera height only the globe draws
const ENGINE_FULL_M = 32_000;   // below this only the engine's terrain draws; between them they crossfade
const TAG_CLASS = { DATA: 'data', DERIVED: 'derived', SIM: 'sim' };
const UI = {
  loading: { en: 'Loading the HiRISE terrain', es: 'Cargando el terreno HiRISE' },
  fallback: { en: '3D view unavailable. Captions only', es: 'Vista 3D no disponible. Solo textos' },
  late: { en: 'Terrain still loading. Captions until it is ready', es: 'El terreno sigue cargando. Textos mientras tanto' },
  placeholder: { en: 'zone: placeholder model', es: 'zona: modelo provisional' },
  exit: { en: 'Esc exits', es: 'Esc para salir' },
};

function params() {
  const q = new URLSearchParams(window.location.search);
  return {
    autoplay: q.get('autoplay') === '1' || q.get('record') === '1',
    record: q.get('record') === '1',
    seq: q.get('seq') === 'global30' ? 'global30' : 'full',
    beat: q.get('beat'),
    tier: q.get('tier'),
    lang: q.get('lang'),
  };
}

function weakGpu() {
  let gl = null;
  try {
    gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    return detectTier({ getContext: () => gl }).tier === 'low';
  } catch { return true; } finally {
    gl?.getExtension('WEBGL_lose_context')?.loseContext();   // give the probe's context back; browsers cap live ones
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + src));
    img.src = src;
  });
}

async function loadAssets(low) {
  const [plan, images] = await Promise.all([
    fetch(BASE + 'plan.json').then((r) => r.json()),
    fetch(BASE + 'images.json').then((r) => r.json()),
  ]);
  const [globe, region, ctx] = await Promise.all([
    loadImage(BASE + (low ? 'globe_2k.jpg' : 'globe_4k.jpg')), loadImage(BASE + 'jezero_region.jpg'), loadImage(BASE + 'jezero_ctx.jpg'),
  ]);
  plan.zone.lastBytes = decodeLast(plan.zone.last);
  return { plan, images, globe, region, ctx };
}

/** The shot a beat ends on, as a geo shot with the target's ground height. */
function beatShot(beat, plan, groundAt, reduced) {
  const s = beat.shot;
  const zt = beat.tracks?.zone; const zoneStart = zt ? trackNumber(Array.isArray(zt[0]) ? zt[0][0] : zt[0], plan) : 0;
  const place = typeof s.target === 'string' ? resolvePlace(s.target, plan, zoneStart) : s.target;
  const geo = place.lat !== undefined ? place : localToGeo(place.x, place.z);
  const local = place.x !== undefined ? place : geoToLocal(place.lat, place.lon);
  const near = Math.abs(local.x) < 6000 && Math.abs(local.z) < 6000;
  return {
    lat: geo.lat, lon: geo.lon, dist: s.dist, yaw: s.yaw, pitch: s.pitch, fov: s.fov,
    targetH: near && groundAt ? groundAt(local.x, local.z) : 0,
    spin: reduced ? 0 : s.spin || 0,
  };
}

export default function Present({ engine, onExit }) {
  const opts = useMemo(() => params(), []);
  const beats = useMemo(() => sequence(opts.seq), [opts.seq]);
  const [lang, setLang] = useState(() => (opts.lang === 'es' || opts.lang === 'en' ? opts.lang : opts.record ? 'en' : getLanguage()));
  const [index, setIndex] = useState(() => Math.max(0, beats.findIndex((b) => b.id === opts.beat)));
  const [assets, setAssets] = useState(null);
  const [failed, setFailed] = useState(null);
  const [waiting, setWaiting] = useState(false);
  // The engine is late (ENGINE_TIMEOUT_MS): captions show until it boots, then the live show takes over at the same beat.
  const [stalled, setStalled] = useState(false);
  const still = !!failed || stalled;   // the caption fallback is up
  const indexRef = useRef(index);
  useEffect(() => { indexRef.current = index; }, [index]);
  const dialogRef = useRef(null), globeRef = useRef(null), layerRef = useRef(null);
  const engineRef = useRef(engine);
  const exitRef = useRef(null);
  const low = useMemo(() => opts.tier === 'low' || (opts.tier !== 'high' && weakGpu()), [opts.tier]);
  const reduced = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && !opts.record, [opts.record]);
  useEffect(() => { engineRef.current = engine; }, [engine]);
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  // ---------------------------------------------------------------- open: modal over the start screen
  useEffect(() => {
    const dialog = dialogRef.current;
    document.body.classList.add('mw-presenting');
    if (opts.record) document.body.classList.add('mw-recording');
    try { if (!dialog.open) dialog.showModal(); } catch { /* already open */ }
    return () => {
      document.body.classList.remove('mw-presenting', 'mw-recording');
      if (dialog.open) dialog.close();
    };
  }, [opts.record]);

  useEffect(() => {
    let live = true;
    loadAssets(low).then((a) => { if (live) setAssets(a); }, (err) => { if (live) setFailed(err.message); });
    return () => { live = false; };
  }, [low]);

  // ---------------------------------------------------------------- the frame loop
  useEffect(() => {
    if (!assets || failed) return undefined;
    const { plan } = assets;
    const canvas = globeRef.current;
    let globe;
    try {
      globe = createGlobe(canvas, { globe: assets.globe, region: assets.region, ctx: assets.ctx, low,
        boxes: { region: assets.images.region.box, ctx: assets.images.ctx.box } });
    } catch (err) {
      queueMicrotask(() => setFailed(err.message || 'WebGL failed'));   // the caption fallback takes over for good
      return undefined;
    }
    const projector = createProjector();
    const clock = createClock({ fixedStep: opts.record ? RECORD_STEP : null });
    const timeline = createTimeline(beats, { autoplay: opts.autoplay, start: Math.max(0, beats.findIndex((b) => b.id === opts.beat)) });
    let cine = null, engineState = { sky: null, layer: 0, dust: -1 };
    let fromShot = null, toShot = null, current = null, alive = true, raf = 0, lastNow = performance.now(), zoneFrame = 0;
    let waitingNow = false, stalledNow = false, late = false;
    const needsEngineAt = (i) => cameraHeight(beatShot(beats[i], plan, null, reduced)) < GLOBE_FULL_M;
    const holdTimer = createHoldTimer();
    const dims = { w: 1, h: 1 };
    const groundAt = () => (cine ? cine.groundAt : null);

    const resize = () => {
      dims.w = Math.max(1, canvas.clientWidth); dims.h = Math.max(1, canvas.clientHeight);
      globe.setSize(dims.w, dims.h);
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    function attachEngine() {
      const eng = engineRef.current;
      if (cine || !eng || !eng.cinematic) return;
      cine = eng.cinematic();
      if (!cine) return;
      cine.setLoop(false);   // one loop drives both renderers: this one
      if (opts.record) cine.setFixedStep(RECORD_STEP);
      const region = boxToLocal(assets.images.region.box), ctxBox = boxToLocal(assets.images.ctx.box);
      cine.addImage({ image: assets.region, box: region, y: -205 });
      cine.addImage({ image: assets.ctx, box: ctxBox, y: -185 });
      cine.setRoute(plan.path, { width: low ? 5 : 4 });
      cine.setRouteReveal(0, 0);
      cine.setZone({ ...plan.zone, last: plan.zone.lastBytes });
      cine.setZoneFocus(plan.hab.x, plan.hab.z, 1100);   // the sortie's zone sits around the habitat
      // the beat's shot may have used height 0 before the terrain existed
      startBeat(timeline.index, true);
    }

    function endShot(b) {
      const sh = beatShot(b, plan, groundAt(), reduced);
      if (sh.spin) sh.lon += sh.spin * b.duration;
      if (b.drift && !reduced) sh.yaw += (b.drift.yaw || 0) * Math.max(0, b.duration - (b.move?.dur ?? 0));
      sh.spin = 0;
      return sh;
    }

    function startBeat(i, keepFrom = false) {
      const beat = beats[i];
      const prev = beats[Math.max(0, timeline.previous)];
      // Starting cold (?beat=, a recording segment): come from where the previous beat ended, spin and drift included,
      // so two segments recorded apart join without a jump.
      if (!keepFrom || !current) fromShot = current ? { ...current } : (i > 0 ? endShot(prev) : beatShot(beat, plan, groundAt(), reduced));
      toShot = beatShot(beat, plan, groundAt(), reduced);
      const eng = engineRef.current;
      if (cine && eng) {
        const sky = beat.scene?.sky || 'clear_day';
        if (engineState.sky !== sky) { eng.setSky(sky); engineState.sky = sky; }
      }
    }

    function shotAt(beat, t) {
      const dur = reduced ? 0 : (beat.move?.dur ?? 0);
      const u = dur > 0 ? ramp(t, 0, dur) : 1;
      const ease = beat.move?.ease;
      // zoomIn ends fast and zoomOut starts fast, so two of them back to back read as one fall with no stop between
      const eased = ease === 'out' ? easeOut(u) : ease === 'zoomIn' ? u * u : ease === 'zoomOut' ? 1 - (1 - u) * (1 - u) : easeInOut(u);
      const zoom = ease === 'zoom' || ease === 'zoomIn' || ease === 'zoomOut';
      const end = { ...toShot };
      if (end.spin) end.lon += end.spin * t;
      if (beat.drift && !reduced) end.yaw += (beat.drift.yaw || 0) * Math.max(0, t - dur);
      return blendShot(fromShot, end, eased, { zoom });
    }

    function applyTracks(beat, t) {
      const tr = beat.tracks || {};
      const eng = engineRef.current;
      const route = tr.route ? trackValue([trackNumber(tr.route[0], plan), trackNumber(tr.route[1], plan), tr.route[2], tr.route[3]], t) : 0;
      zoneFrame = tr.zone ? trackValue(tr.zone, t) : 0;
      const zoneOpacity = tr.zone ? (tr.zoneOpacity ? trackValue(tr.zoneOpacity, t) : 1) : 0;
      if (cine) {
        cine.setRouteReveal(beat.scene?.route ? route : 0, beat.scene?.route ? 1 : 0);
        cine.setZoneFrame(zoneFrame, zoneOpacity, 0.34 * zoneOpacity);
      }
      if (cine && eng) {
        const layer = tr.layer ? (trackValue(tr.layer, t) > 0.5 ? 1 : 0) : (beat.scene?.layer && !tr.layer ? beat.scene.layer : 0);
        if (layer !== engineState.layer) { eng.setLayer(layer); engineState.layer = layer; }
        const dust = tr.dust ? trackValue(tr.dust, t) : (beat.scene?.sky === 'dust_storm' ? 0.75 : 0);
        if (Math.abs(dust - engineState.dust) > 0.01) { eng.setDust(dust); engineState.dust = dust; }
      }
      return { route, zoneOpacity };
    }

    function placeLabels(beat, t, globeAlpha) {
      const layer = layerRef.current;
      if (!layer) return;
      const shown = [];
      for (const el of layer.querySelectorAll('[data-at]')) {
        const i = Number(el.dataset.i);
        const chip = beat.chips?.[i];
        if (!chip) continue;
        const place = resolvePlace(chip.at, plan, zoneFrame);
        let p = null;
        if (place) {
          if (place.lat !== undefined && globeAlpha > 0.5) p = globe.project(place.lat, place.lon, dims.w, dims.h);
          else {
            const local = place.x !== undefined ? place : geoToLocal(place.lat, place.lon);
            const y = (cine ? cine.meshAt(local.x, local.z) : 0) + 3;
            p = projector.project(local.x, y, local.z, dims.w, dims.h);
          }
        }
        const a = p && p.visible ? showValue(chip.show || [0], t, beat.duration) : 0;
        el.style.opacity = a.toFixed(3);
        const card = el.querySelector('.pr-card');
        if (p && a > 0) shown.push({ el, card, p, below: !!chip.offset });
        if (card) card.style.translate = `0 ${((1 - a) * 10).toFixed(1)}px`;
        if (chip.live === 'margin' || chip.live === 'area') {
          const big = el.querySelector('.pr-big');
          if (big) big.textContent = chip.live === 'area' ? `${fill('{a:1}', { a: areaAt(plan, zoneFrame) }, langRef.current)} ha` : `${marginAt(plan, zoneFrame)} min`;
          el.classList.toggle('danger', zoneFrame >= plan.zone.scenario.speFrame - 0.5);   // orange from the alert on
          const text = el.querySelector('.pr-text');
          if (text && chip.liveText) text.textContent = fill(chip.liveText[langRef.current] ?? chip.liveText.en, { clock: clockAt(plan, zoneFrame) }, langRef.current);
        }
        if (chip.ring) {
          for (const ring of el.querySelectorAll('.pr-ring')) {
            const k = Number(ring.dataset.k);
            const u = ((t - (chip.show?.[0] || 0)) * 0.55 + k * 0.5) % 1;
            const on = t >= (chip.show?.[0] || 0) ? 1 : 0;
            ring.style.transform = `translate(-50%, -50%) scale(${(0.3 + u * 2.4).toFixed(3)})`;
            ring.style.opacity = (on * (1 - u) * 0.9).toFixed(3);
          }
        }
      }
      // Cards beside their points, inside the frame, above the captions and clear of each other (layout.js)
      const cop = layer.parentElement.querySelector('.pr-copy');
      const bottom = cop ? Math.min(dims.h * 0.78, cop.offsetTop - 12) : dims.h * 0.7;
      const boxes = layoutCards(shown.map(({ card, p, below }) => ({ x: p.x, y: p.y, w: card?.offsetWidth || 0, h: card?.offsetHeight || 0, below })), { w: dims.w, h: dims.h, bottom });
      shown.forEach(({ el, card }, k) => {
        const b = boxes[k];
        el.style.transform = `translate(${b.pinX.toFixed(1)}px, ${b.pinY.toFixed(1)}px)`;
        if (card) { card.style.left = `${b.cardX.toFixed(1)}px`; card.style.top = `${b.cardY.toFixed(1)}px`; card.style.bottom = 'auto'; }
      });
      const astro = layer.querySelector('.pr-astronaut');
      if (astro) {
        const show = beat.tracks?.zone ? 1 : 0;
        const pos = astronautAt(plan, zoneFrame);
        const p = projector.project(pos.x, (cine ? cine.meshAt(pos.x, pos.z) : 0) + 1.5, pos.z, dims.w, dims.h);
        astro.style.opacity = String(show && p.visible ? Math.min(1, trackValue(beat.tracks.zoneOpacity || [1, 1, 0, 0], t)) : 0);
        astro.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      }
      // captions, title, source line and the hand-off button fade on the same clock
      const caps = captionsOf(beat);
      layer.parentElement.querySelectorAll('[data-cap]').forEach((el) => {
        const k = Number(el.dataset.cap);
        const from = caps[k]?.at ?? 0, to = caps[k + 1]?.at;
        el.style.opacity = showValue([from + 0.3, to], t, beat.duration).toFixed(3);
      });
      layer.parentElement.querySelectorAll('[data-fade]').forEach((el) => {
        el.style.opacity = showValue([Number(el.dataset.fade) || 0], t, beat.duration).toFixed(3);
      });
    }

    function frame(dt) {
      attachEngine();
      if (stalledNow) {
        // Still late, on a beat that needs the terrain: the captions stay up. The globe beats (Mars, Jezero) need no
        // engine, so stepping back to them plays them live.
        if (!cine && needsEngineAt(indexRef.current)) return;
        // The engine booted after the timeout, or the presenter stepped back to the globe: take over live at that
        // beat, with the camera move from the beat before it.
        stalledNow = false; setStalled(false); holdTimer.update(false, 0);
        current = null;
        timeline.goTo(indexRef.current);
        startBeat(timeline.index);
      }
      const needsEngine = cameraHeight(toShot || beatShot(timeline.beat, plan, null, reduced)) < GLOBE_FULL_M;
      const hold = needsEngine && !cine;
      if (hold !== waitingNow) { waitingNow = hold; setWaiting(hold); }
      // A late engine must not hold the show: after ENGINE_TIMEOUT_MS the captions take over until it boots (above).
      // A recording waits instead (its readyCheck below), since a fallback frame in a video is worse than a late one.
      // Once the engine has been late, a later hold drops to the captions at once instead of waiting again.
      if (!opts.record && (holdTimer.update(hold, performance.now()) || (hold && late))) { stalledNow = late = true; setStalled(true); return; }
      if (!hold) {
        const changed = timeline.advance(dt);
        if (changed) { startBeat(timeline.index); setIndex(timeline.index); }
      }
      const beat = timeline.beat;
      const t = timeline.beatTime;
      current = shotAt(beat, t);
      const h = cameraHeight(current);
      const globeAlpha = !cine ? 1 : h >= GLOBE_FULL_M ? 1 : h <= ENGINE_FULL_M ? 0 : easeInOut(ramp(h, ENGINE_FULL_M, GLOBE_FULL_M));
      applyTracks(beat, t);
      const pose = engineCamera(current);
      projector.set(pose, dims.w / dims.h);
      if (globeAlpha > 0) {
        // the Jezero images fade in as the camera comes down, so no tinted square pops up over the globe from orbit
        globe.render(current, { region: 1 - ramp(h, 450_000, 1_400_000), ctx: 1 - ramp(h, 90_000, 220_000), stars: 1 });
      }
      canvas.style.opacity = globeAlpha.toFixed(3);
      if (cine && globeAlpha < 1) {
        cine.setShot(pose);
        cine.step();
      }
      placeLabels(beat, t, globeAlpha);
      if (window.__present) { window.__present.frame = clock.frames; window.__present.done = timeline.done; window.__present.beat = beat.id; }
    }

    startBeat(timeline.index);
    const nav = {
      next() { if (timeline.index === beats.length - 1) return false; timeline.next(); startBeat(timeline.index); setIndex(timeline.index); return true; },
      back() { timeline.back(); startBeat(timeline.index); setIndex(timeline.index); },
    };
    exitRef.current = { nav, release: () => { if (cine) { cine.release(); cine = null; } } };

    if (opts.record) {
      // The recorder calls step() once per frame and saves the frame after it resolves.
      window.__present = {
        ready: false, done: false, frame: 0, beat: beats[0].id, total: Math.ceil(timeline.total / RECORD_STEP),
        async step() {
          frame(clock.tick(0));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          return { frame: clock.frames, done: timeline.done, beat: timeline.beat.id };
        },
      };
      const readyCheck = setInterval(() => {
        attachEngine();
        if (cine) { window.__present.ready = true; clearInterval(readyCheck); }
      }, 200);
      return () => { clearInterval(readyCheck); alive = false; ro.disconnect(); if (cine) cine.release(); globe.dispose(); delete window.__present; };
    }

    const loop = (now) => {
      if (!alive) return;
      const dt = clock.tick((now - lastNow) / 1000); lastNow = now;
      try { frame(dt); } catch (err) { console.error(err); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame((now) => { lastNow = now; loop(now); });
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      if (cine) { cine.release(); cine = null; }
      exitRef.current = null;
      globe.dispose();
    };
  }, [assets, beats, failed, low, opts, reduced]);

  // ---------------------------------------------------------------- leaving
  const restoreEngine = useCallback(() => {
    const eng = engineRef.current;
    if (exitRef.current) exitRef.current.release();
    restoreFromStore(eng, useMissionStore.getState());
    window.history.replaceState(null, '', window.location.pathname + queryWithoutPresent(window.location.search) + window.location.hash);
  }, []);

  const exit = useCallback(() => {
    restoreEngine();
    onExit?.();
  }, [onExit, restoreEngine]);

  // "Begin the mission": the same button the presenter would press on the start screen, inside this key or click, so
  // the browser still counts it as the user's gesture (pointer capture needs one on the habitat-first flow).
  const begin = useCallback(() => {
    restoreEngine();
    document.body.classList.remove('mw-presenting');
    if (dialogRef.current?.open) dialogRef.current.close();
    const primary = document.querySelector('.start-primary');
    if (primary && !primary.disabled) primary.click();
    onExit?.();
  }, [onExit, restoreEngine]);

  useEffect(() => {
    // Captured on window and stopped there, so no key reaches the app under the presentation (view.js, App's shortcuts).
    const onKey = (e) => {
      const action = presentKey(e);
      if (!action) return;
      e.stopImmediatePropagation();
      if (action === 'swallow') return;
      e.preventDefault();
      if (e.type !== 'keydown' || e.repeat) return;
      if (action === 'exit') { exit(); return; }
      if (action === 'lang') { setLang((v) => (v === 'en' ? 'es' : 'en')); return; }
      if (still) { setIndex((i) => fallbackStep(i, action, beats.length)); return; }   // no clock, no camera, no hand-off
      const nav = exitRef.current?.nav;
      if (action === 'back') { nav?.back(); return; }
      if (!nav?.next() && beats[beats.length - 1].cta) begin();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', onKey, true); };
  }, [beats, begin, exit, still]);

  // ?autoplay keeps running in the caption fallback, on the same beat lengths
  useEffect(() => {
    if (!still || !opts.autoplay || index >= beats.length - 1) return undefined;
    const id = setTimeout(() => setIndex((i) => fallbackStep(i, 'next', beats.length)), beats[index].duration * 1000);
    return () => clearTimeout(id);
  }, [still, opts.autoplay, index, beats]);

  const beat = beats[index];
  const plan = assets?.plan;
  const tx = (o) => (o ? (o[lang] ?? o.en ?? '') : '');
  // The clock fades the copy in; in the caption fallback there is no clock, so it shows at once.
  const hidden = still ? undefined : { opacity: 0 };
  const dataFor = plan ? { ...plan, zone: { ...plan.zone, margin: plan.zone.frames[0].marginMin, area: plan.zone.frames[0].areaHa } } : {};

  return (
    <dialog ref={dialogRef} className={`present${opts.record ? ' recording' : ''}`} aria-label="Marswalk presentation" onCancel={(e) => { e.preventDefault(); exit(); }}>
      <canvas ref={globeRef} className="pr-globe" aria-hidden="true" />
      <div className="pr-scrim" aria-hidden="true" />
      {still && <div className="pr-fallback" style={assets ? { backgroundImage: `url(${BASE}${index < 2 ? 'globe_2k.jpg' : 'jezero_ctx.jpg'})` } : undefined} aria-hidden="true" />}
      <div className="pr-layer" ref={layerRef} aria-hidden="true" hidden={still}>
        {plan && beat.tracks?.zone && <div className="pr-astronaut"><span /></div>}
        {plan && (beat.chips || []).map((chip, i) => (
          <div key={`${beat.id}-${i}`} className={`pr-pin${chip.danger ? ' danger' : ''}${chip.offset ? ' offset' : ''}${chip.home ? ' home' : ''}`} data-at="1" data-i={i} style={{ opacity: 0 }}>
            <span className="pr-dot" />
            {chip.ring && [0, 1].map((k) => <span key={k} className="pr-ring" data-k={k} />)}
            <div className="pr-card">
              {chip.big && <div className="pr-big">{fill(chip.big, dataFor, lang)}</div>}
              {chip.text && <div className="pr-text">{fill(tx(chip.text), dataFor, lang)}</div>}
              {chip.tag && <span className={`pr-tag ${TAG_CLASS[chip.tag]}`}>{chip.tag}</span>}
            </div>
          </div>
        ))}
      </div>
      <div className={`pr-copy${still ? ' still' : ''}`} key={`copy-${beat.id}-${lang}`}>
        {beat.list && (
          <div className="pr-list" data-fade="0.5" style={hidden}>
            <h2 className="pr-list-title">{tx(beat.list.title)}</h2>
            <ul>
              {beat.list.lines.map((line, k) => (
                <li key={k}><span className={`pr-tag ${TAG_CLASS[line.tag]}`}>{line.tag}</span>{tx(line)}</li>
              ))}
            </ul>
            {beat.list.note && <p className="pr-list-note">{beat.list.note}</p>}
          </div>
        )}
        {beat.title && <h1 className="pr-title" data-fade="0.2" style={hidden}>{beat.title}</h1>}
        <div className="pr-captions">
          {captionsOf(beat).map((c, k) => (
            <p key={k} className="pr-caption" data-cap={k} style={hidden}>{tx(c)}</p>
          ))}
        </div>
        {beat.source && (
          <p className="pr-source" data-fade="1.2" style={hidden}>
            <span className={`pr-tag ${TAG_CLASS[beat.source.tag]}`}>{beat.source.tag}</span>
            {tx(beat.source)}
            {beat.tracks?.zone && plan?.zone.source === 'placeholder' && <em className="pr-warn"> · {tx(UI.placeholder)}</em>}
          </p>
        )}
        {beat.cta && !still && (
          <button type="button" className="pr-cta" data-fade="1.5" style={hidden} onClick={begin}>
            {tx(beat.cta)} <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
      {!opts.record && (
        <div className="pr-progress" aria-hidden="true">
          {beats.map((b, i) => <span key={b.id} className={i === index ? 'on' : i < index ? 'past' : ''} />)}
          <span className="pr-lang">{lang.toUpperCase()}</span>
        </div>
      )}
      {waiting && !still && <p className="pr-wait">{tx(UI.loading)}</p>}
      {still && <p className="pr-wait">{tx(stalled && !failed ? UI.late : UI.fallback)}</p>}
    </dialog>
  );
}
