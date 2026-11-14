import { useEffect, useState } from 'react';
import { fireEvent, listEvents } from '../state/events.js';
import './events.css';

/**
 * Debug strip for the demo: fire any registered event by hand. Shown in
 * development, or with ?debug=1 in a production build.
 */
export default function EventDebug() {
  const [events, setEvents] = useState(() => listEvents());

  useEffect(() => {
    const timer = setInterval(() => setEvents(listEvents()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="event-debug" aria-label="Event debug controls">
      <span className="event-debug-label">Events</span>
      {events.map((event) => (
        <button key={event.id} type="button" onClick={() => fireEvent(event.id)} title={event.label}>
          {event.label}
        </button>
      ))}
    </div>
  );
}
