import { t, translateText } from '../i18n/index.js';
import { useEffect, useState } from 'react';
import { fireEvent, listEvents } from '../state/events.js';
import './events.css';

const TOGGLE_KEY = '`';

/**
 * Debug strip for the demo: fire any registered event by hand. Shown in
 * development, or with ?debug=1 in a production build. Collapsed to a small
 * chip by default so it stays out of the demo; the chip or the ` key opens it.
 */
export default function EventDebug() {
  const [events, setEvents] = useState(() => listEvents());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setEvents(listEvents()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (event.key === TOGGLE_KEY && !event.ctrlKey && !event.metaKey && !event.altKey) setOpen((value) => !value);
      else if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={'event-debug' + (open ? ' open' : '')}>
      {open && (
        <div id="event-debug-list" className="event-debug-list" role="group" aria-label={t('ui.fire.an.event')}>
          {events.map((event) => (
            <button key={event.id} type="button" onClick={() => fireEvent(event.id)} title={translateText(event.label)}>
              {translateText(event.label)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className="event-debug-toggle"
        aria-expanded={open}
        aria-controls="event-debug-list"
        title={t('ui.event.debug.controls.key')}
        onClick={() => setOpen((value) => !value)}
      >{t('ui.events')}<kbd>`</kbd>
      </button>
    </div>
  );
}
