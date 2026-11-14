// Waypoint name in the route panel (#66). A waypoint with a science stop is a button that opens its card; any other
// waypoint stays plain text, so keyboard and screen reader users meet no control that does nothing.
import { stopForWaypoint } from '../data/stops.js';
import { stopHasContent } from './content.js';
import { PLAN_CARD_ID } from './StopCard.jsx';
import { toggleWaypoint, useStopSelection } from './selection.js';
import { useStops } from './useStops.js';

/** @param {{ name: string, className?: string }} props */
export default function WaypointName({ name, className = 'waypoint-name' }) {
  const stops = useStops();
  const open = useStopSelection((s) => s.waypoint === name);
  if (!stopHasContent(stopForWaypoint(stops, name))) {
    return <span className={className} title={name}>{name}</span>;
  }
  return (
    <button
      type="button"
      className={`${className} waypoint-select`}
      title={`${name} · science stop`}
      aria-expanded={open}
      aria-controls={open ? PLAN_CARD_ID : undefined}
      onClick={() => toggleWaypoint(name)}
    >
      {name}
    </button>
  );
}
