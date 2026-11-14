const GROUPS = [
  {
    title: 'Walk',
    rows: [
      ['W A S D or arrows', 'Walk'],
      ['Shift', 'Jog'],
      ['Mouse', 'Look around while the pointer is captured'],
      ['Esc', 'Release the mouse and pause'],
      ['H', 'Open this help and pause'],
    ],
  },
  {
    title: 'Plan',
    rows: [
      ['Right-drag', 'Pan the map'],
      ['Scroll', 'Zoom in and out'],
      ['Esc', 'Pause and open the menu'],
    ],
  },
];

/** The shared controls reference, shown on the start screen and from the pause menu. */
export default function ControlsHelp() {
  return (
    <div className="controls-help">
      {GROUPS.map((group) => (
        <section key={group.title} className="controls-group">
          <h3>{group.title}</h3>
          <dl className="controls-list">
            {group.rows.map(([keys, action]) => (
              <div className="controls-row" key={keys}>
                <dt>{keys}</dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
