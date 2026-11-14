// Mount point for the science stop card (#66), one per app. Plan mode: the card of the waypoint selected in the route
// panel. Walk mode: the card of a stop the player reaches, once per stop, until Enter, Esc or the close button.
// Arrival uses arrivedStop from src/data/stops.js with the player position in the store; #61 replaces it with the
// engine's arrival detection when it merges.
import { useCallback, useEffect, useState } from 'react';
import { stopForWaypoint } from '../data/stops.js';
import { useMissionStore } from '../state/store.js';
import { createArrivalTracker } from './content.js';
import { clearWaypoint, useStopSelection } from './selection.js';
import StopCard from './StopCard.jsx';
import { useStops } from './useStops.js';

/** Close on these keys. Esc only reaches the page while the mouse is free; Enter works while walking with the mouse locked. */
const CLOSE_KEYS = new Set(['Enter', 'NumpadEnter', 'Escape']);

function useCloseKeys(open, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (!CLOSE_KEYS.has(event.code)) return;
      // Enter and Esc inside the route panel's coordinate fields belong to those fields.
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select')) return;
      onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

function PlanStopCard({ stops }) {
  const selected = useStopSelection((s) => s.waypoint);
  const onRoute = useMissionStore((s) => s.route.waypoints.some((w) => w.name === selected));
  const stop = selected && onRoute ? stopForWaypoint(stops, selected) : null;
  useCloseKeys(!!stop, clearWaypoint);
  return <StopCard stop={stop} variant="plan" onClose={clearWaypoint} />;
}

function WalkStopCard({ stops, active }) {
  const [tracker] = useState(createArrivalTracker);
  const [stop, setStop] = useState(null);

  // Check arrival on every position update (5 per second, src/state/engineBridge.js) without re-rendering this
  // component for each one.
  useEffect(() => {
    if (!active) return undefined;
    const check = (state) => {
      const arrived = tracker.update(stops, state.navigation);
      if (arrived) setStop(arrived);
    };
    check(useMissionStore.getState());
    return useMissionStore.subscribe((state, prev) => {
      if (state.navigation !== prev.navigation) check(state);
    });
  }, [tracker, stops, active]);

  const close = useCallback(() => setStop(null), []);
  useCloseKeys(active && !!stop, close);
  return active ? <StopCard stop={stop} variant="walk" onClose={close} /> : null;
}

/** @param {{ mode: 'plan' | 'walk' }} props */
export default function ScienceStops({ mode }) {
  const stops = useStops();
  // Both stay mounted so the arrival tracker remembers which cards have opened across mode switches.
  return (
    <>
      {mode === 'plan' && <PlanStopCard stops={stops} />}
      <WalkStopCard stops={stops} active={mode === 'walk'} />
    </>
  );
}
