/**
 * Missions (#265): what the crew's objective means for the EVA's events and for the on-screen beat lines.
 *
 * One concept: the objective the crew sets at the mission table (needs.objective, src/sim/missionNeeds.js) defines
 * the mission. There is no separate mission id in the store.
 * - 'sortie' is the first mission: a 55 m walk to one stop, with the dust storm and the radiation alert brought
 *   forward so a new player meets both in about three minutes of play.
 * - 'cheyava', 'bright-angel' and 'samples' (#352) are the full EVA: the storm at T+480 s and the radiation alert at
 *   T+720 s, exactly as the event files have always run them.
 *
 * The event files in src/sim/events/ say what each event is (timeline values, alert, planner request, end). This
 * module says when it starts in each mission (the trigger), and may compress its timeline for the first mission
 * (timelineScale). Both are data; every shortened time is SIM and carries a note (MISSION_SOURCES).
 *
 * The event runner (src/state/events.js) reads the mission once, from the objective locked at Begin EVA
 * (src/state/simulation.js). A change after Begin EVA changes nothing.
 *
 * Plain JavaScript with no React and no three.js.
 */

/** The first mission's science stop: the stops.json id the sortie objective plans (src/sim/missionNeeds.js). */
export const FIRST_STOP = 'sortie';

// Requirement data for the first mission. `{ stop, forSec }` is resolved by missionEventDefinitions into a place
// requirement around the stop's planned waypoint ({ area: { x, z, radius }, forSec }, src/sim/eventEngine.js): reached
// once is reached for good, so an accepted find on the way or a re-plan at the table cannot stand in for the stop (R5).
// `{ samplesAt }` counts the samples secured at the stop (sampling.samples within its radius, plus the scoop's reach):
// a sample taken on the way, at a find, does not count (N1).
const AT_STOP = Object.freeze({ stop: FIRST_STOP });
const SAMPLE_SECURED = Object.freeze({ samplesAt: FIRST_STOP, atLeast: 1, forSec: 3 });
/**
 * How far past the stop's radius a sample still counts as taken there: the scoop reaches about 1.5 m ahead. Metres.
 * One rule with the sampling tasks (#352, src/sim/taskProgress.js): a task's record counts within its place's radius
 * plus this.
 */
export const SAMPLE_REACH_M = 2;
// Within 10 m of the end area (25 m around the airlock): a crew on its way home, about 7 to 10 s before the area.
const NEAR_HOME = Object.freeze({ nearEndM: 10 });
const SCIENCE_DONE = Object.freeze({ anyOf: Object.freeze([SAMPLE_SECURED, Object.freeze({ stop: FIRST_STOP, forSec: 90 }), NEAR_HOME]) });

/**
 * The first mission's event schedule (SIM, our choice for #265). The sortie stop is about 55 s from the airlock at
 * 1.0 m/s (stops.json route_stops). The storm waits for the science at the stop, so a presenter is never interrupted
 * mid-sample, and the radiation alert follows it:
 * - requires: the crew has reached the stop (within the waypoint runner's arrival radius) and has secured a sample at
 *   the stop 3 s ago, or reached it 90 s ago without one, or is already on its way home (within 10 m of the end area);
 * - atSec: not before T+45 s, a little under the fastest jog to the stop and back toward the habitat;
 * - the radiation alert follows the storm by 15 s, or at once when the crew comes within 10 m of the end area first, so
 *   a crew that heads straight home still meets it before it is back (N14);
 * - latestSec: a crew that never reaches the stop still meets both events, at T+240 s and T+255 s;
 * - holdInsideEnd (storm): it does not start within 25 m of the airlock, where it would end at once, until latestSec;
 * - endMinSec: once started, each event plays at least 20 s before its end area (25 m around the airlock) ends it, so
 *   a crew that is already home still sees it (N14).
 * timelineScale compresses the event's timeline: the storm ramp from 90 s to 30 s, the 12-minute radiation profile to
 * 1 minute. The values (tau 0.45 to 8.0, RAD dose rates) are unchanged.
 */
const FIRST_EVENTS = Object.freeze({
  'dust-storm': Object.freeze({
    trigger: Object.freeze({
      type: 'missionTime',
      atSec: 45,
      requires: Object.freeze([AT_STOP, SCIENCE_DONE]),
      latestSec: 240,
      holdInsideEnd: true,
    }),
    timelineScale: 1 / 3,
    endMinSec: 20,
  }),
  radiation: Object.freeze({
    trigger: Object.freeze({
      type: 'missionTime',
      atSec: 45,
      requires: Object.freeze([
        AT_STOP,
        SCIENCE_DONE,
        Object.freeze({ event: 'dust-storm', afterSec: 0 }),
        Object.freeze({ anyOf: Object.freeze([Object.freeze({ event: 'dust-storm', afterSec: 15 }), NEAR_HOME]) }),
      ]),
      latestSec: 255,
    }),
    timelineScale: 1 / 12,
    endMinSec: 20,
  }),
});

/** The full EVA's schedule: the times the event files ran before #265, unchanged (SIM, scripted). */
const FULL_EVENTS = Object.freeze({
  'dust-storm': Object.freeze({ trigger: Object.freeze({ type: 'missionTime', atSec: 480 }), timelineScale: 1 }),
  radiation: Object.freeze({ trigger: Object.freeze({ type: 'missionTime', atSec: 720 }), timelineScale: 1 }),
});

/**
 * One short line per beat of the first mission (#265): what it shows and which NASA data is behind it. `text` is an
 * i18n key (src/i18n/en.json, es.json). `event` links a beat to the event that opens it.
 */
const FIRST_BEATS = Object.freeze([
  Object.freeze({ id: 'plan', text: 'mission.beat.plan' }),
  Object.freeze({ id: 'walk', text: 'mission.beat.walk' }),
  // at the science stop until a sample is secured: what to do there (P3)
  Object.freeze({ id: 'stop', text: 'mission.beat.stop', stop: FIRST_STOP }),
  Object.freeze({ id: 'dust-storm', text: 'mission.beat.storm', event: 'dust-storm' }),
  Object.freeze({ id: 'radiation', text: 'mission.beat.radiation', event: 'radiation' }),
  Object.freeze({ id: 'debrief', text: 'mission.beat.debrief' }),
]);

export const MISSIONS = Object.freeze({
  first: Object.freeze({ id: 'first', objectives: Object.freeze(['sortie']), events: FIRST_EVENTS, beats: FIRST_BEATS }),
  // The full EVA keeps today's screens: no beat lines and no recap.
  // Collecting samples (#352) is a full EVA too: its schedule, no beats.
  full: Object.freeze({ id: 'full', objectives: Object.freeze(['cheyava', 'bright-angel', 'samples']), events: FULL_EVENTS, beats: Object.freeze([]) }),
});
export const MISSION_IDS = Object.freeze(Object.keys(MISSIONS));

/** The objective the start screen's main action opens, and the one its full-EVA choice opens (missionNeeds.js ids). */
export const FIRST_OBJECTIVE = 'sortie';
export const FULL_OBJECTIVE = 'cheyava';

/**
 * The mission an objective defines. 'sortie' (and anything unknown, the default needs' objective) is the first mission;
 * every other objective is the full EVA.
 * @param {string} [objective] needs.objective
 * @returns {{ id: 'first' | 'full', objectives: string[], events: Record<string, { trigger: object, timelineScale: number }>,
 *   beats: Array<{ id: string, text: string, event?: string }> }}
 */
export function missionForObjective(objective) {
  return MISSIONS.full.objectives.includes(objective) ? MISSIONS.full : MISSIONS.first;
}

/**
 * The trigger an event has in this objective's mission, or null when the mission does not schedule it (low oxygen
 * keeps its own threshold trigger).
 * @param {string} objective
 * @param {string} eventId
 * @returns {object | null}
 */
export function eventTrigger(objective, eventId) {
  return missionForObjective(objective).events[eventId]?.trigger ?? null;
}

/**
 * The earliest mission time (s) the event can start in this objective's mission: 45 s in the first mission (later
 * when its conditions hold later), 480 / 720 s in the full EVA. null when the mission does not schedule the event.
 * @param {string} objective
 * @param {string} eventId
 * @returns {number | null}
 */
export function eventStartSec(objective, eventId) {
  const trigger = eventTrigger(objective, eventId);
  return trigger?.type === 'missionTime' ? trigger.atSec : null;
}

/**
 * What the mission table can say about when an event starts (N5), read from the trigger data:
 * - earliestSec: not before this mission time (null for an event the mission does not schedule);
 * - latestSec: by this mission time at the latest, or null;
 * - afterStop: `{ stop, afterSampleSec, orAtStopSec }` when the event waits for the science at a stop: a sample
 *   secured there `afterSampleSec` ago, or `orAtStopSec` after first reaching the stop without one; null otherwise;
 * - afterEvent: `{ event, afterSec }` when it follows another event, or null;
 * - orNearHomeM: it starts sooner when the crew comes within this many metres of its end area on the way home, or null;
 * - holdsOutsideEnd: it waits until the crew is out of its end area (until latestSec);
 * - minDurationSec: once started it plays at least this long, or null.
 * The full EVA gives `{ earliestSec: 480 | 720, latestSec: null, afterStop: null, afterEvent: null, ... }`.
 * @param {string} objective
 * @param {string} eventId
 */
export function eventTiming(objective, eventId) {
  const scheduled = missionForObjective(objective).events[eventId];
  if (!scheduled) return null;
  const { trigger } = scheduled;
  const requires = trigger.requires ?? [];
  const stop = requires.find((r) => r.stop !== undefined && !r.forSec)?.stop ?? null;
  const anyOf = requires.filter((r) => Array.isArray(r.anyOf)).flatMap((r) => r.anyOf);
  const sample = anyOf.find((r) => r.samplesAt !== undefined);
  const atStop = anyOf.find((r) => r.stop !== undefined);
  const near = anyOf.find((r) => r.nearEndM !== undefined);
  const after = [...requires, ...anyOf].filter((r) => r.event !== undefined).sort((a, b) => b.afterSec - a.afterSec)[0];
  return {
    earliestSec: trigger.type === 'missionTime' ? trigger.atSec : null,
    latestSec: trigger.latestSec ?? null,
    afterStop: stop ? { stop, afterSampleSec: sample ? sample.forSec ?? 0 : null, orAtStopSec: atStop ? atStop.forSec ?? 0 : null } : null,
    afterEvent: after ? { event: after.event, afterSec: after.afterSec } : null,
    orNearHomeM: near ? near.nearEndM : null,
    holdsOutsideEnd: trigger.holdInsideEnd === true,
    minDurationSec: scheduled.endMinSec ?? null,
  };
}

/** Whether a requirement, or one inside its anyOf, names a stop that `stops` does not place. */
const missesStop = (requirement, stops) => (requirement.stop !== undefined && !stops?.[requirement.stop])
  || (requirement.samplesAt !== undefined && !stops?.[requirement.samplesAt])
  || (Array.isArray(requirement.anyOf) && requirement.anyOf.some((inner) => missesStop(inner, stops)));

/**
 * Turn the `{ stop, forSec }` requirements into place requirements around the planned stop. A requirement that names
 * a stop not on the route is left out whole (the event then keeps its time and its latest time).
 */
function resolveRequirements(requires, stops) {
  return requires.filter((requirement) => !missesStop(requirement, stops)).map((requirement) => {
    if (requirement.stop !== undefined) {
      const place = stops[requirement.stop];
      return { area: { x: place.x, z: place.z, radius: place.radius }, ...(requirement.forSec ? { forSec: requirement.forSec } : {}) };
    }
    if (requirement.samplesAt !== undefined) {
      const place = stops[requirement.samplesAt];
      return {
        path: 'sampling.samples', inArea: { x: place.x, z: place.z, radius: place.radius + SAMPLE_REACH_M },
        atLeast: requirement.atLeast ?? 1, ...(requirement.forSec ? { forSec: requirement.forSec } : {}),
      };
    }
    if (Array.isArray(requirement.anyOf)) return { anyOf: resolveRequirements(requirement.anyOf, stops) };
    return requirement;
  });
}

function scaleTimeline(timeline, scale) {
  if (scale === 1) return timeline;
  return timeline.map((entry) => ({ ...entry, atSec: Math.round(entry.atSec * scale * 100) / 100 }));
}

/**
 * The event definitions for this objective's mission: each definition the mission schedules gets the mission's trigger
 * (its stop requirements placed on `stops`), its compressed timeline and its minimum duration; the others (low oxygen)
 * are returned as they are. The input is not changed.
 * @param {string} objective
 * @param {Array<object>} definitions parsed event files
 * @param {{ stops?: Record<string, { x: number, z: number, radius: number }> }} [options] where each planned stop is,
 *   by stops.json id, and how close counts as reached (the event runner passes the route locked at Begin EVA). Without
 *   it the stop requirements are left out: the event keeps its time and its latest time.
 * @returns {Array<object>}
 */
export function missionEventDefinitions(objective, definitions, { stops = null } = {}) {
  const mission = missionForObjective(objective);
  return definitions.map((definition) => {
    const scheduled = mission.events[definition.id];
    if (!scheduled) return definition;
    const { requires, ...trigger } = scheduled.trigger;
    const resolved = requires ? resolveRequirements(requires, stops) : [];
    return {
      ...definition,
      trigger: resolved.length > 0 ? { ...trigger, requires: resolved } : trigger,
      timeline: scaleTimeline(definition.timeline ?? [], scheduled.timelineScale ?? 1),
      ...(scheduled.endMinSec && definition.end ? { end: { ...definition.end, minSec: scheduled.endMinSec } } : {}),
    };
  });
}

/**
 * The beat line to show now, or null. Pure: the caller passes what it reads from the store.
 * - at the mission table before Begin EVA: 'plan';
 * - in Walk: the radiation beat while its alert is active, else the storm beat while its alert is active; before the
 *   first event, the stop beat at the science stop until a sample is secured (`atStop`, `samples`), nothing once it is,
 *   and the walk beat otherwise;
 * - the debrief beat is not returned here: the debrief shows the recap of every beat.
 * @param {ReturnType<typeof missionForObjective>} mission
 * @param {{ mode: 'plan' | 'walk', evaBegun: boolean, alerts?: object, events?: Array<{ type: string, eventId: string }>,
 *   atStop?: boolean, samples?: number }} state
 * @returns {{ id: string, text: string, event?: string, stop?: string } | null}
 */
export function currentBeat(mission, { mode, evaBegun, alerts = {}, events = [], atStop = false, samples = 0 }) {
  const beat = (id) => mission.beats.find((entry) => entry.id === id) ?? null;
  if (!evaBegun) return mode === 'plan' ? beat('plan') : null;
  if (mode !== 'walk') return null;
  for (const id of ['radiation', 'dust-storm']) {
    const entry = beat(id);
    if (entry && alerts[entry.event]?.active) return entry;
  }
  const scheduled = Object.keys(mission.events);
  if (events.some((entry) => entry.type === 'start' && scheduled.includes(entry.eventId))) return null;
  const stop = beat('stop');
  if (stop && samples >= 1) return null;
  if (stop && atStop) return stop;
  return beat('walk');
}

/** How close to the science stop's planned waypoint its beat line shows: a little more than its arrival radius. Metres. */
export const STOP_BEAT_RADIUS_M = 12;

/**
 * Whether the crew is at the mission's science stop, for its beat line: within STOP_BEAT_RADIUS_M of the planned
 * waypoint with that stops.json id, measured from the position the suit reports (the estimate, as the HUD).
 * @param {{ stop?: string } | undefined} stopBeat the mission's stop beat
 * @param {Array<{ stopId?: string, x: number, z: number }>} waypoints
 * @param {{ x?: number | null, z?: number | null }} position
 */
export function atStopOf(stopBeat, waypoints, position) {
  const waypoint = stopBeat?.stop ? (waypoints ?? []).find((w) => w?.stopId === stopBeat.stop) : null;
  if (!waypoint || !Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return false;
  return Math.hypot(waypoint.x - position.x, waypoint.z - position.z) <= STOP_BEAT_RADIUS_M;
}

/** Registry path of the SIM note on an event's timing in a mission (src/data/provenance.js define). */
export const missionSourcePath = (missionId, eventId) => `missions.${missionId}.${eventId}`;

/**
 * Provenance of every event time and compression above (#265: shortened times are tagged SIM). src/state/events.js
 * registers them with provenance.define.
 */
export const MISSION_SOURCES = Object.freeze({
  [missionSourcePath('first', 'dust-storm')]: Object.freeze({
    tag: 'SIM', label: 'First mission timing', short: 'SIM · first mission',
    source: 'first mission: the storm starts 3 s after the crew secures a sample at the sortie stop (or 90 s after first reaching the stop without one, or as it turns home), not before T+45 s and by T+240 s at the latest, outside 25 m of the airlock; ramp compressed from 90 s to 30 s; plays at least 20 s. Tau values from hazards.json',
  }),
  [missionSourcePath('first', 'radiation')]: Object.freeze({
    tag: 'SIM', label: 'First mission timing', short: 'SIM · first mission',
    source: 'first mission: the radiation alert starts 15 s after the storm, or sooner when the crew nears the habitat (by T+255 s at the latest); the 12-minute RAD profile compressed to 1 minute; plays at least 20 s. Start and peak dose rates from hazards.json (RAD, Gale), our steps between them',
  }),
  [missionSourcePath('full', 'dust-storm')]: Object.freeze({
    tag: 'SIM', label: 'Scripted event time', short: 'SIM · scripted',
    source: 'full EVA: the storm starts at T+480 s (scripted); 90 s ramp from hazards.json dust.event.ramp_duration',
  }),
  [missionSourcePath('full', 'radiation')]: Object.freeze({
    tag: 'SIM', label: 'Scripted event time', short: 'SIM · scripted',
    source: 'full EVA: the radiation alert starts at T+720 s (scripted); the September 2017 RAD profile compressed to 12 minutes, its measured start and peak rates with our steps between them',
  }),
});
