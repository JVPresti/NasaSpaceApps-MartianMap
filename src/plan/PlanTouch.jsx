import { t } from '../i18n/index.js';
import { sendKey } from '../input/sendKey.js';
import { SHEET, planSheet, usePlanSheet } from './planSheet.js';

// Touch controls of the mission table (#365). Both buttons are hidden by planMobile.css unless the pointer is coarse
// or the window is narrow, so a desktop table looks as before.

/** Folds the step's panels away so the map fills the table, and brings them back. Sits on the map's lower edge. */
export function PlanSheetToggle() {
  const sheet = usePlanSheet();
  const open = sheet === SHEET.OPEN;
  return (
    <button type="button" className="plan-sheet-toggle" aria-expanded={open} aria-controls="table-body" onClick={planSheet.toggle}>
      <i aria-hidden="true" />
      {open ? t('plan.sheet.map') : t('plan.sheet.open')}
    </button>
  );
}

/** Opens the pause menu, as Esc does: a phone has no Esc key. */
export function PlanMenuButton() {
  return (
    <button type="button" className="plan-menu-button" onClick={() => sendKey('pause')}>
      {t('touch.pause')}
    </button>
  );
}

/** Back to the walk during the EVA, as M does (the table has no Back to the habitat button then). */
export function PlanWalkButton() {
  return (
    <button type="button" className="plan-menu-button plan-walk-button" onClick={() => sendKey('mode')}>
      {t('ui.walk')}
    </button>
  );
}
