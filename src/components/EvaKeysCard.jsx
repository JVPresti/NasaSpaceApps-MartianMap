import { t } from '../i18n/index.js';
import './evaKeysCard.css';

/** How long the card stays up after the EVA begins, in milliseconds. The fade-out is part of this time. */
export const EVA_KEYS_CARD_MS = 12000;

// The keys a player needs in the first minute of the walk. The full reference stays in the controls help (H, and
// Controls in the pause menu). Tokens follow ControlsHelp: longer than one character is a catalog key.
const ROWS = [
  [['W', 'A', 'S', 'D'], 'menu.help.walk'],
  [['menu.shift'], 'menu.jog'],
  [['menu.mouse'], 'menu.help.look'],
  [['R'], 'menu.help.wrist'],
  [['ui.esc'], 'menu.help.pause'],
  [['H'], 'menu.keys.card.all'],
];

const cap = (token) => (token.length > 1 ? t(token) : token);

/**
 * Key reminder shown when the EVA begins, in place of the old always-on hint bar. It never pauses the walk or takes
 * the pointer, and App unmounts it after EVA_KEYS_CARD_MS or as soon as the walk is paused.
 * @param {{ freeLook?: boolean }} props with drag-to-look the look row names the drag instead of the mouse
 */
export default function EvaKeysCard({ freeLook = false }) {
  return (
    <aside className="eva-keys-card" aria-label={t('menu.keys.card.title')} role="status">
      <h2>{t('menu.keys.card.title')}</h2>
      <dl>
        {ROWS.map(([keys, action]) => (
          <div className="eva-keys-row" key={action}>
            <dt>
              {(action === 'menu.help.look' && freeLook ? ['menu.help.key.drag'] : keys).map((token) => <kbd key={token}>{cap(token)}</kbd>)}
            </dt>
            <dd>{t(action)}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
