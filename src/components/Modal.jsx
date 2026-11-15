import { useEffect, useRef } from 'react';
import { FOCUSABLE, focusTarget, isUsableControl } from './focus.js';

/**
 * Native modal dialog: showModal() makes the page behind it inert, keeps Tab and Shift+Tab inside and
 * returns focus to the previous element on close. Esc is intercepted through the cancel event so each
 * menu can decide what "Back" means. The first element marked data-autofocus receives focus on open;
 * when it cannot take focus (disabled while the browser answers a request, or inert), the first usable
 * control does, so the dialog is never left without a button to press.
 */
export default function Modal({ labelledBy, className = '', onCancel, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    const primary = dialog.querySelector('[data-autofocus="true"]');
    const target = focusTarget(primary, [...dialog.querySelectorAll(FOCUSABLE)]);
    if (target) target.focus();
    else dialog.focus();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={ref}
      className={'modal' + (className ? ' ' + className : '')}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.();
      }}
      onKeyDown={(event) => {
        const dialog = ref.current;
        if (event.key === 'Tab') {
          const controls = [...dialog.querySelectorAll(FOCUSABLE)].filter(isUsableControl);
          const first = controls[0], last = controls[controls.length - 1];
          if (!first) {
            event.preventDefault();
            dialog.focus();
          } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
            event.preventDefault();
            first.focus();
          }
          return;
        }
        if (event.key === 'Enter') {
          // The menus say "press Enter": it must not die because focus sits on the dialog itself
          // (a click on the backdrop, or a primary action that was disabled when the dialog opened).
          if (event.defaultPrevented || event.target !== dialog) return;
          const primary = dialog.querySelector('[data-autofocus="true"]');
          if (!isUsableControl(primary)) return;
          event.preventDefault();
          primary.click?.();
          return;
        }
        if (event.key !== 'Escape') return;
        // Fallback for engines where the dialog cancel event is not wired to React: Esc must never
        // leave a closed-but-mounted modal (and therefore no way back into the app).
        event.preventDefault();
        event.stopPropagation();
        onCancel?.();
      }}
    >
      {children}
    </dialog>
  );
}
