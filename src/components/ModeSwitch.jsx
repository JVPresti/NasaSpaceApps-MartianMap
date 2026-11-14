const MODES = [
  { id: 'plan', label: 'Plan', title: 'The site from above, to choose a route' },
  { id: 'walk', label: 'Walk', title: 'First person on the surface' },
];

/** Two-button segmented control for the app mode. */
export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mode-switch" role="group" aria-label="View mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          title={`${m.label} (M) — ${m.title}`}
          aria-keyshortcuts="M"
          aria-pressed={mode === m.id}
          className={mode === m.id ? 'on' : undefined}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
