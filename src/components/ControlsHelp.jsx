// Keys are listed one cap at a time, so a combination reads as the keys to press.
const GROUPS = [
  {
    title: 'Walking',
    rows: [
      [['W', 'A', 'S', 'D'], 'Walk'],
      [['Shift'], 'Jog'],
      [['Mouse'], 'Look around'],
      [['Esc'], 'Release the mouse and pause'],
      [['H'], 'Open this help'],
    ],
  },
  {
    title: 'Mission table',
    rows: [
      [['L'], 'Next map layer'],
      [['Shift', 'L'], 'Previous map layer'],
      [['0'], 'Image only'],
      [['C'], 'Sources'],
      [['Esc'], 'Open the menu'],
    ],
  },
];

/** The controls reference (#11 style), shown from the start screen, the mission table and the pause menu. */
export default function ControlsHelp() {
  return (
    <div className="controls-help">
      {GROUPS.map((group) => (
        <section key={group.title} className="controls-group">
          <h3>{group.title}</h3>
          <dl className="controls-list">
            {group.rows.map(([keys, action]) => (
              <div className="controls-row" key={keys.join('+') + action}>
                <dt>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

/**
 * The controls dialog content: title, Close and the reference.
 * @param {{ titleId: string, onClose: () => void, closeRef?: import('react').Ref<HTMLButtonElement> }} props
 */
export function ControlsPanel({ titleId, onClose, closeRef }) {
  return (
    <div className="dialog-body controls-panel">
      <div className="dialog-head">
        <div>
          <h2 id={titleId} className="dialog-title">How to move</h2>
        </div>
        <button type="button" className="ui-button ghost" ref={closeRef} data-autofocus="true" onClick={onClose}>Close</button>
      </div>
      <ControlsHelp />
      <p className="dialog-footnote">The mission clock and the suit stay paused while this is open.</p>
    </div>
  );
}
