import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import './gamepadHint.css';

const HIDE_AFTER_MS = 10000;

/**
 * One-line reminder of the gamepad layout. It is drawn only for an input the player has already used (#103), so it
 * waits for the engine to report the first gamepad press, then hides itself after ten seconds and never returns.
 *
 * The engine API is optional on purpose: an older engine, or `null` before boot, renders nothing instead of failing.
 *
 * @param {{ engine?: { subscribeGamepad?: (listener: (state: { used: boolean, connected: boolean }) => void) => (() => void) | void } | null }} props
 */
export default function GamepadHint({ engine }) {
  const [shown, setShown] = useState(false);
  // The hint appears once, on first use: later gamepad presses must not bring it back.
  const usedOnce = useRef(false);

  useEffect(() => {
    if (typeof engine?.subscribeGamepad !== 'function') return undefined;
    // No engine yet, or an engine without this API: no subscription, and the hint never appears.
    const unsubscribe = engine.subscribeGamepad(({ used }) => {
      if (!used || usedOnce.current) return;
      usedOnce.current = true;
      setShown(true);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [engine]);

  useEffect(() => {
    if (!shown) return undefined;
    const timer = setTimeout(() => setShown(false), HIDE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="gamepad-hint" role="status" aria-live="polite">
      <strong>{t('menu.gamepad')}</strong>
      <span>{t('menu.gamepad.hint.left.stick.walk.l3.jog.right.stick.look.start.plan.walk.lb.rb.layer')} {t('tableprompt.gamepad')}</span>
    </div>
  );
}
