import { useState } from 'react';
import { t } from '../i18n/index.js';
import { saveCurrentRoute, saveEvaRoute, useMissionStore } from '../state/store.js';
import { keepInView } from './keepInView.js';
import './saveRoute.css';

// The save-route form (#357, #364): a name and a save button, shared by the mission table's Route step and the EVA
// debrief. Without a summary it saves the plan on the table; with one it saves the route the EVA just ended on and
// counts that EVA as the route's first run.

/**
 * @param {{ summary?: object | null, buttonClass?: string, className?: string }} props
 *   summary: the frozen EVA summary when saving from the debrief; the finished EVA becomes the saved route's first run.
 *   buttonClass: the button style of the place it sits in (the table and the debrief use different ones).
 */
export default function SaveRouteForm({ summary = null, buttonClass = 'table-secondary', className = '' }) {
  const canSave = useMissionStore((s) => Array.isArray(s.route?.path) && s.route.path.length >= 2);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(null);
  const save = () => {
    const entry = summary ? saveEvaRoute(name, summary) : saveCurrentRoute(name);
    if (!entry) return;
    setName('');
    setSaved(entry.name);
  };
  return (
    <div className={['save-route', className].filter(Boolean).join(' ')}>
      <form className="save-route-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <input
          value={name}
          maxLength={40}
          placeholder={t('savedRoutes.name.placeholder')}
          aria-label={t('savedRoutes.name')}
          onChange={(event) => { setName(event.target.value); setSaved(null); }}
          onFocus={(event) => keepInView(event.currentTarget)}
          enterKeyHint="done"
        />
        <button type="submit" className={buttonClass} disabled={!canSave || name.trim() === ''}>
          {t('savedRoutes.save')}
        </button>
      </form>
      {saved && <p className="save-route-saved" role="status">{t('savedRoutes.saved', { name: saved })}</p>}
    </div>
  );
}
