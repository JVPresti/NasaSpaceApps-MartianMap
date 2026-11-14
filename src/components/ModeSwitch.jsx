import { t } from '../i18n/index.js';
const MODES = [
  { id: 'plan', get label() { return t('ui.plan'); }, get title() { return t('ui.the.site.from.above.to.choose.a.route'); } },
  { id: 'walk', get label() { return t('ui.walk'); }, get title() { return t('ui.first.person.on.the.surface'); } },
];

/** Two-button segmented control for the app mode. */
export default function ModeSwitch({ mode, onChange }) {
  return (
    <div className="mode-switch" role="group" aria-label={t('ui.view.mode')}>
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
