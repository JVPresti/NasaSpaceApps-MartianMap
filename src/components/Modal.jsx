import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Native modal dialog: showModal() makes the page behind it inert, keeps Tab and Shift+Tab inside and
 * returns focus to the previous element on close. Esc is intercepted through the cancel event so each
 * menu can decide what "Back" means. The first element marked data-autofocus receives focus on open.
 */
export default function Modal({ labelledBy, className = '', onCancel, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    const target = dialog.querySelector('[data-autofocus="true"]') || dialog.querySelector(FOCUSABLE);
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
        if (event.key === 'Tab') {
          const dialog = ref.current;
          const controls = [...dialog.querySelectorAll(FOCUSABLE)]
            .filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'));
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
