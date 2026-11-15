import { t } from '../i18n/index.js';

// Each entry is one visual column; each column holds groups of [key, action] rows. Three columns fit the start
// screen at 1366 × 768 without scrolling (#199); the narrower pause dialog wraps the third column under the others.
// Descriptions stay at a few words so every row is one line.
const COLUMNS = [
  [
    {
      title: 'ui.walk',
      rows: [
        ['menu.help.key.wasd', 'ui.walk'],
        ['menu.shift', 'menu.jog'],
        ['menu.mouse', 'menu.help.look'],
        ['ui.esc', 'menu.help.pause'],
        ['menu.h', 'menu.help.this.help'],
      ],
    },
    {
      // src/App.jsx: E or a click while facing the mission table opens it; Begin EVA on the table goes out.
      title: 'menu.help.habitat',
      rows: [
        ['menu.help.key.e', 'menu.help.open.table'],
        ['click', 'menu.help.open.table'],
      ],
    },
  ],
  [
    {
      // src/engine/sampling.js: click, KeyP, KeyE, KeyF, on the surface only. The HUD prompt names the action that applies now.
      title: 'menu.help.sampling.outside',
      rows: [
        ['click', 'menu.help.collect'],
        ['menu.help.key.p', 'menu.help.photo'],
        ['menu.help.key.e', 'menu.help.stow'],
        ['menu.help.key.f', 'menu.help.case'],
      ],
    },
    {
      // src/components/shortcuts.js (L, Shift+L, 0: outside and at the mission table) and src/sources/sourcesStore.js (C).
      title: 'menu.help.layers.sources',
      rows: [
        ['menu.help.key.l', 'menu.help.layer.cycle'],
        ['menu.help.key.0', 'menu.help.layer.none'],
        ['menu.help.key.c', 'ui.sources.188'],
      ],
    },
  ],
  [
    {
      // Walk only: src/finds/Finds.jsx (Q, Y, N), src/hud/PartnerPanel.jsx (T), src/state/slopeGrid.js (G) and
      // src/screens/wrist/keys.js (R; the wrist screen lists its own page and row keys).
      title: 'menu.help.finds.panels',
      rows: [
        ['menu.q.hold.2.s', 'menu.help.mark.find'],
        ['menu.y.n', 'menu.help.add.or.dismiss'],
        ['menu.t', 'menu.help.partner.detail'],
        ['menu.help.key.g', 'menu.help.slope.grid'],
        ['menu.help.key.r', 'menu.help.wrist'],
      ],
    },
  ],
];

/** The shared controls reference, shown on the start screen and from the pause menu. */
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
                  <div className="controls-row" key={keys}>
                    <dt>{t(keys)}</dt>
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
