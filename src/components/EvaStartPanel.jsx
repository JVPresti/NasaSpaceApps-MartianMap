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
      <dl className="eva-start-keys">
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
      <p className="dialog-footnote">{t('menu.keys.note')}</p>
    </div>
  );
}
