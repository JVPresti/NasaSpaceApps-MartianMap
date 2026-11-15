import dustStorm from '../sim/events/dust-storm.json';
import lowOxygenWarning from '../sim/events/low-oxygen-warning.json';
import radiation from '../sim/events/radiation.json';

// The route an event re-planned (#265: each event shows its re-plan on the table). While an event's shelter route is
// the route (route.shelter, written by src/state/events.js), the table describes that route, from where the crew is to
// the shelter, and the alert that sent them there, instead of the plan approved before the EVA. Plain function.

/** The events whose alert re-plans the route to a shelter, by id: their label for the table. */
const EVENTS = new Map([dustStorm, radiation, lowOxygenWarning].map((event) => [event.id, event]));

/**
 * The event route on the table, or null when no event owns the route.
 * @param {{ shelter?: object | null, reason?: string | null, distanceM?: number | null, etaSec?: number | null,
 *   skipped?: string[] }} route the store's route
 * @param {Record<string, { eventId: string, text: string, level?: string, active?: boolean, startedAtSec?: number } | null>} alerts
 * @returns {{ shelter: { id?: string, name?: string, x: number, z: number }, eventId: string | null, label: string | null,
 *   alertText: string | null, level: string | null, distanceM: number | null, etaSec: number | null, skipped: string[] } | null}
 *   label: the event's name (English, from its event file; the table translates it); alertText: the alert the crew saw
 */
export function eventRouteOf(route, alerts) {
  if (!route?.shelter) return null;
  const active = Object.values(alerts ?? {}).filter((alert) => alert?.active);
  // The event that asked for this route is named in route.reason ("… (dust-storm)"); else the newest active alert.
  const named = active.find((alert) => typeof route.reason === 'string' && route.reason.endsWith(`(${alert.eventId})`));
  const alert = named ?? active.filter((entry) => EVENTS.has(entry.eventId)).sort((a, b) => (b.startedAtSec ?? 0) - (a.startedAtSec ?? 0))[0] ?? null;
  const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    shelter: route.shelter,
    eventId: alert?.eventId ?? null,
    label: alert ? EVENTS.get(alert.eventId)?.label ?? null : null,
    alertText: alert?.text ?? null,
    level: alert?.level ?? null,
    distanceM: finite(route.distanceM),
    etaSec: finite(route.etaSec),
    skipped: Array.isArray(route.skipped) ? route.skipped : [],
  };
}

/**
 * The shelter's code and name as the stop list shows them: "HAB · habitat airlock" → ["HAB", "habitat airlock"].
 * @param {{ id?: string, name?: string }} shelter
 * @returns {[string, string]}
 */
export function shelterLabel(shelter) {
  const name = typeof shelter?.name === 'string' ? shelter.name : '';
  if (name.includes(' · ')) {
    const [code, rest] = name.split(' · ');
    return [code, rest];
  }
  return [shelter?.id ?? 'HAB', name];
}
