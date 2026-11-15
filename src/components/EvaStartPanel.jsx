import { t } from '../i18n/index.js';
import './evaStartPanel.css';

// The keys a player needs in the first minute of the walk. The full reference stays in the controls help (H, and
// Controls in the pause menu). Tokens follow ControlsHelp: longer than one character is a catalog key.
const ROWS = [
  [['W', 'A', 'S', 'D'], 'menu.help.walk'],
  [['menu.shift'], 'menu.jog'],
  [['menu.mouse'], 'menu.help.look'],
  [['R'], 'menu.help.wrist'],
  [['ui.esc'], 'menu.help.pause'],
  [['H'], 'menu.keys.all'],
];

// The same first minute on a touch screen (#365): what each finger and touch bar button does. menuMobile.css shows
// these rows instead of the keys on a coarse pointer.
const TOUCH_ROWS = [
  ['touch.walk', 'controls.touch.walk'],
  ['touch.look', 'controls.touch.look'],
  ['touch.map', 'controls.touch.map'],
  ['touch.pause', 'controls.touch.pause.eva'],
  ['touch.wrist', 'controls.touch.wrist'],
  ['touch.sample', 'controls.touch.sample'],
  ['touch.more', 'controls.touch.more'],
];

const cap = (token) => (token.length > 1 ? t(token) : token);

/**
 * The view that opens the EVA, in the pause dialog (PAUSE_VIEW.KEYS), styled like the controls help. Begin EVA lands
 * here in Walk with the mission paused; Start walking is the click that captures the mouse and starts the clock.
 * @param {{ titleId: string, freeLook?: boolean, busy?: boolean, onStart: () => void,
 *   startRef?: import('react').Ref<HTMLButtonElement> }} props
 */
export default function EvaStartPanel({ titleId, freeLook = false, busy = false, onStart, startRef }) {
  return (
    <div className="dialog-body eva-start-panel">
      <p className="dialog-kicker">{t('menu.keys.kicker')}</p>
      <h2 id={titleId} className="dialog-title">{t('menu.keys.title')}</h2>
      <dl className="eva-start-keys controls-touch-list touch-only">
        {TOUCH_ROWS.map(([name, text]) => (
          <div key={name}>
            <dt>{t(name)}</dt>
            <dd>{t(text)}</dd>
          </div>
        ))}
      </dl>
      <dl className="eva-start-keys keys-only">
        {ROWS.map(([keys, action]) => (
          <div className="eva-start-row" key={action}>
            <dt>
              {(action === 'menu.help.look' && freeLook ? ['menu.help.key.drag'] : keys).map((token) => <kbd key={token}>{cap(token)}</kbd>)}
            </dt>
            <dd>{t(action)}</dd>
          </div>
        ))}
      </dl>
      <div className="menu-actions">
        <button type="button" className="ui-button primary menu-resume" ref={startRef} data-autofocus="true" onClick={onStart} disabled={busy}>
          {busy && !freeLook ? t('menu.capturing.the.mouse') : t('menu.keys.start')}
        </button>
      </div>
      <p className="dialog-footnote keys-only">{t('menu.keys.note')}</p>
      <p className="dialog-footnote touch-only">{t('controls.touch.eva.note')}</p>
    </div>
  );
}
