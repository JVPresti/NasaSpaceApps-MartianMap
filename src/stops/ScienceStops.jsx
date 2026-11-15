// Science stop card mounts (#66). Plan mode: PlanStopCard sits in the centre column of the Plan layout
// (src/plan/PlanMode.jsx) and shows the waypoint selected in the route panel. Walk mode: WalkStopCard (src/App.jsx)
// opens the card of each stop the waypoint runner (#139) marks as visited, once per stop, until Enter, Esc or the
// close button.
import { useCallback, useEffect, useState } from 'react';
import { stopForWaypoint } from '../data/stops.js';
import { useMissionStore } from '../state/store.js';
import { wristOwnsKeys } from '../screens/wrist/ownership.js';
import { isCloseKey } from './closeKeys.js';
import { createArrivalTracker } from './content.js';
import { clearWaypoint, useStopSelection } from './selection.js';
import StopCard from './StopCard.jsx';
import { useStops } from './useStops.js';

function useCloseKeys(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (isCloseKey(event, { blocked: wristOwnsKeys() })) onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

/** The card of the waypoint selected in the route panel. PlanMode unmounts it outside Plan mode. */
export function PlanStopCard() {
  const stops = useStops();
  const selected = useStopSelection((s) => s.waypoint);
  const onRoute = useMissionStore((s) => s.route.waypoints.some((w) => w.name === selected));
  const stop = selected && onRoute ? stopForWaypoint(stops, selected) : null;
  useCloseKeys(!!stop, clearWaypoint);
  useEffect(() => clearWaypoint, []);   // leaving Plan mode closes the card, so it does not reappear on return
  return <StopCard stop={stop} variant="plan" onClose={clearWaypoint} />;
}

/**
 * The card of a stop the astronaut has reached. Stays mounted in both modes so the tracker remembers which cards
 * have opened; it shows and listens only while `active`.
 * @param {{ active: boolean }} props
 */
export function WalkStopCard({ active }) {
  const stops = useStops();
  const [tracker] = useState(createArrivalTracker);
  const [stop, setStop] = useState(null);

  // route.visited changes only on arrival or re-plan, so this never runs at the 5 Hz position rate.
  useEffect(() => {
    if (!active) return undefined;
    const check = (state) => {
      const arrived = tracker.update(stops, state.route.visited);
      if (arrived) setStop(arrived);
    };
    check(useMissionStore.getState());
    const unsubscribe = useMissionStore.subscribe((state, prev) => {
      if (state.route.visited !== prev.route.visited) check(state);
    });
    return () => {
      unsubscribe();
      setStop(null);   // leaving Walk mode closes the card; the tracker still knows it was shown
    };
  }, [tracker, stops, active]);

  const close = useCallback(() => setStop(null), []);
  useCloseKeys(active && !!stop, close);
  return active ? <StopCard stop={stop} variant="walk" onClose={close} /> : null;
}
