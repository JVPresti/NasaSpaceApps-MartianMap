import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { touchBarActions } from '../input/actions.js';
import { coarsePointer, fullscreen } from '../input/device.js';
import { sendKey } from '../input/sendKey.js';
import { useInCabin } from '../hud/useInCabin.js';
import { t } from '../i18n/index.js';
import { useMissionStore } from '../state/store.js';
import './touchActions.css';

const COARSE = '(pointer: coarse)';
const SAMPLING_IDS = new Set(['sample', 'photo', 'stow', 'case']);

function subscribeCoarse(onChange) {
  const mq = globalThis.matchMedia?.(COARSE);
  if (!mq) return () => {};
  mq.addEventListener?.('change', onChange);
  return () => mq.removeEventListener?.('change', onChange);
}

/**
 * True on a coarse primary pointer. On a touchscreen laptop (fine primary pointer) the bar shows after a touch on the
 * scene and hides again when the mouse moves, so a mouse player never keeps it.
 */
function useTouchBar(engine) {
  const coarse = useSyncExternalStore(subscribeCoarse, () => coarsePointer(), () => coarsePointer());
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (coarse || typeof engine?.subscribeTouch !== 'function') return undefined;
    const off = engine.subscribeTouch((s) => { if (s?.visible) setTouched(true); });
    const onMouse = (e) => { if (e.pointerType === 'mouse' && (e.movementX || e.movementY || e.type === 'pointerdown')) setTouched(false); };
    window.addEventListener('pointermove', onMouse, true);
    window.addEventListener('pointerdown', onMouse, true);
    return () => {
      if (typeof off === 'function') off();
      window.removeEventListener('pointermove', onMouse, true);
      window.removeEventListener('pointerdown', onMouse, true);
    };
  }, [engine, coarse]);
  return coarse || touched;
}

/**
 * The touch action bar (#365): a button for every keyboard action of what the player is doing now, from the action
 * list (src/input/actions.js). A tap sends the action's key through sendKey, so the key's own handler and guards run.
 * Sample has no key (the mouse click samples), so it calls the engine. The stick and drag-to-look stay with the engine.
 *
 * @param {{ engine: object | null, wristOpen: boolean }} props
 */
export default function TouchActions({ engine, wristOpen }) {
  const show = useTouchBar(engine);
  const now = useMissionStore(useShallow((s) => ({ mode: s.mode, stage: s.stage, actions: s.sampling?.status?.actions ?? null })));
  const inCabin = useInCabin(engine);
  const [more, setMore] = useState(false);
  const held = useRef(false);
  const [fs] = useState(fullscreen);
  const [isFull, setFull] = useState(() => fs.active());
  useEffect(() => {
    const onChange = () => setFull(fs.active());
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('webkitfullscreenchange', onChange); };
  }, [fs]);

  if (!show) return null;
  const { main: all, more: extra } = touchBarActions({ mode: now.mode, stage: now.stage, inCabin, wristOpen, sampling: { actions: now.actions } });
  // The sampling buttons come and go as the crosshair moves; they get their own row above the main one, so the buttons
  // under the thumb (Wrist, More) never shift when one appears.
  const sampling = all.filter((a) => SAMPLING_IDS.has(a.id));
  const main = all.filter((a) => !SAMPLING_IDS.has(a.id));

  const button = (a) => {
    // A tap acts on click: the browser fires it when the finger lifts on the button. The More menu closes after one of
    // its actions, so it never covers the card or the view the action opened.
    const press = (e) => {
      e.preventDefault();
      if (a.id === 'sample') { engine?.sampleAct?.('click'); return; }
      sendKey(a.id, 'keydown');
      sendKey(a.id, 'keyup');
      if (a.more) setMore(false);
    };
    // A hold action (Q, held 2 s) sends keydown when the finger goes down and one keyup when it lifts, is cancelled or
    // slides off the button; the first of those three ends the hold.
    const hold = (e) => {
      e.preventDefault();
      if (held.current) return;
      held.current = true;
      sendKey(a.id, 'keydown');
    };
    const release = () => {
      if (!held.current) return;
      held.current = false;
      sendKey(a.id, 'keyup');
      if (a.more) setMore(false);
    };
    const handlers = a.hold
      ? { onPointerDown: hold, onPointerUp: release, onPointerCancel: release, onPointerLeave: release, onContextMenu: (e) => e.preventDefault() }
      : { onClick: press };
    return (
      <button key={a.id} type="button" className={`touch-action touch-action-${a.id}`} data-action={a.id} {...handlers}>
        {t(a.label)}
      </button>
    );
  };

  return (
    <>
    {/* In portrait the narrow view leaves the raised wrist half off screen: suggest turning the phone (CSS shows it). */}
    {wristOpen && <p className="touch-rotate" role="status">{t('touch.rotate')}</p>}
    <nav className={`touch-actions${more ? ' open' : ''}`} aria-label={t('touch.bar')}>
      <div className="touch-actions-main">
        {main.map(button)}
        {(extra.length > 0 || fs.available) && (
          <button type="button" className="touch-action touch-action-more" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {t(more ? 'touch.less' : 'touch.more')}
          </button>
        )}
      </div>
      {sampling.length > 0 && <div className="touch-actions-sampling">{sampling.map(button)}</div>}
      {more && (
        <div className="touch-actions-more">
          {extra.map(button)}
          {fs.available && (
            <button type="button" className="touch-action touch-action-fullscreen" onClick={() => { setMore(false); fs.toggle().then(setFull); }}>
              {t(isFull ? 'touch.fullscreen.exit' : 'touch.fullscreen')}
            </button>
          )}
        </div>
      )}
    </nav>
    </>
  );
}
