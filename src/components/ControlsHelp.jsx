import { t } from '../i18n/index.js';

// Keys are drawn one cap at a time (#11), so a combination reads as the keys to press. A token longer than one
// character is a catalog key (Shift, Mouse, Click...), a single character is the key itself, and '/' separates two
// alternatives. Each entry of COLUMNS is one visual column, so every key fits the start screen and the pause menu at
// 1366 × 768 without scrolling (#199); narrower screens wrap the columns.
const COLUMNS = [
  [
    {
      title: 'menu.help.group.walking',
      rows: [
        [['W', 'A', 'S', 'D', '/', 'menu.help.key.arrows'], 'menu.help.walk'],
        [['menu.shift'], 'menu.jog'],
        [['menu.mouse'], 'menu.help.look'],
        [['ui.esc'], 'menu.help.release.pause'],
        [['H'], 'menu.help.this.help'],
        [['X'], 'menu.help.end.eva'],
      ],
    },
    {
      // src/App.jsx: E or a click while facing the table in the habitat opens it (habitat-first flow).
      // src/plan/MissionMap.jsx: wheel zoom, drag to move, double click to fit the route; Esc pauses the table.
      title: 'menu.help.group.table',
      rows: [
        [['E', '/', 'click'], 'menu.help.open.table'],
        [['menu.scroll'], 'menu.zoom.in.and.out'],
        [['menu.help.key.drag'], 'menu.help.pan'],
        [['menu.help.key.double.click'], 'menu.help.fit.route'],
        [['ui.esc'], 'menu.help.open.menu'],
      ],
    },
  ],
  [
    {
      // src/engine/sampling.js: click, KeyP, KeyE, KeyF, on the surface only. The HUD prompt names the action that applies now.
      title: 'menu.help.sampling.outside',
      rows: [
        [['click'], 'menu.help.collect'],
        [['P'], 'menu.help.photo'],
        [['E'], 'menu.help.stow'],
        [['F'], 'menu.help.case'],
      ],
    },
    {
      // src/components/shortcuts.js (L, Shift+L, 0: outside and at the mission table) and src/sources/sourcesStore.js (C).
      title: 'menu.help.layers.sources',
      rows: [
        [['L'], 'menu.help.layer.next'],
        [['menu.shift', 'L'], 'menu.help.layer.previous'],
        [['0'], 'menu.help.layer.image'],
        [['C'], 'ui.sources.188'],
      ],
    },
  ],
  [
    {
      // Walk only: src/finds/Finds.jsx (Q, Y, N), src/hud/PartnerPanel.jsx (T), src/state/slopeGrid.js (G) and
      // src/screens/wrist/keys.js (R, brackets, J/K, Enter). The wrist keys share one row so the help keeps the
      // start dialog height at 1366 x 768 (#199, #231).
      title: 'menu.help.finds.panels',
      rows: [
        [['Q'], 'menu.help.mark.find.hold'],
        [['Y', '/', 'N'], 'menu.help.add.or.dismiss'],
        [['T'], 'menu.help.partner.detail'],
        [['G'], 'menu.help.slope.grid'],
        [['R', 'menu.help.key.brackets', 'menu.help.key.jk', 'Enter'], 'menu.help.wrist'],
      ],
    },
  ],
];

const cap = (token) => (token.length > 1 ? t(token) : token);

/** The controls reference (#11 style), shown from the start screen, the mission table and the pause menu. */
export default function ControlsHelp() {
  return (
    <div className="controls-help">
      {COLUMNS.map((groups) => (
        <div className="controls-column" key={groups[0].title}>
          {groups.map((group) => (
            <section key={group.title} className="controls-group">
              <h3>{t(group.title)}</h3>
              <dl className="controls-list">
                {group.rows.map(([keys, action]) => (
                  <div className="controls-row" key={keys.join('+') + action}>
                    <dt>
                      {keys.map((token, k) => (token === '/'
                        ? <span key={k} className="controls-or">/</span>
                        : <kbd key={k}>{cap(token)}</kbd>))}
                    </dt>
                    <dd>{t(action)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The controls dialog content: title, the close action and the reference. `closeLabel` names where the close action
 * goes (back to the pause menu, or plain Close for the start screen and the mission table).
 * @param {{ titleId: string, onClose: () => void, closeRef?: import('react').Ref<HTMLButtonElement>, closeLabel?: string }} props
 */
export function ControlsPanel({ titleId, onClose, closeRef, closeLabel }) {
  return (
    <div className="dialog-body controls-panel">
      <div className="dialog-head">
        <div>
          <h2 id={titleId} className="dialog-title">{t('menu.help.title')}</h2>
        </div>
        <button type="button" className="ui-button ghost" ref={closeRef} data-autofocus="true" onClick={onClose}>
          {closeLabel ?? t('ui.close').trim()}
        </button>
      </div>
      <ControlsHelp />
      <p className="dialog-footnote">{t('menu.help.paused.note')}</p>
    </div>
  );
}
