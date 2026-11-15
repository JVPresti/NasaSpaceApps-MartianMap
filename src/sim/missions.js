/**
 * Missions (#265): what the crew's objective means for the EVA's events and for the on-screen beat lines.
 *
 * One concept: the objective the crew sets at the mission table (needs.objective, src/sim/missionNeeds.js) defines
 * the mission. There is no separate mission id in the store.
 * - 'sortie' is the first mission: a 55 m walk to one stop, with the dust storm and the radiation alert brought
 *   forward so a new player meets both in about three minutes of play.
 * - 'cheyava' and 'bright-angel' are the full EVA: the storm at T+480 s and the radiation alert at T+720 s, exactly
 *   as the event files have always run them.
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

/** The waypoint index the waypoint runner moves past once the first stop after the airlock is reached. */
const FIRST_STOP_REACHED = Object.freeze({ path: 'route.nextIndex', op: 'gte', value: 2 });

/**
 * The first mission's event schedule (SIM, our choice for #265). At 1.0 m/s the sortie stop is about 55 s from the
 * airlock (stops.json route_stops), so a player who walks straight there has about 20 s at the stop before the storm
 * at T+75 s. The trigger conditions keep that order for faster and slower players:
 * - requires: the stop has been reached at least 20 s ago (route.nextIndex, written by the waypoint runner);
 * - latestSec: a player who never reaches the stop still meets the event at that time;
 * - holdInsideEnd: the event never starts inside its own end area (25 m around the airlock), where it would end within
 *   a second and never play again; it waits until the player is outside;
 * - the radiation alert also waits until the storm has run 15 s, so the two alerts come one after the other.
 * timelineScale compresses the event's timeline: the storm ramp from 90 s to 30 s, the 12-minute radiation profile to
 * 1 minute. The values (tau 0.45 to 8.0, RAD dose rates) are unchanged.
 */
const FIRST_EVENTS = Object.freeze({
  'dust-storm': Object.freeze({
    trigger: Object.freeze({
      type: 'missionTime',
      atSec: 75,
      requires: Object.freeze([Object.freeze({ ...FIRST_STOP_REACHED, forSec: 20 })]),
      latestSec: 180,
      holdInsideEnd: true,
    }),
    timelineScale: 1 / 3,
  }),
  radiation: Object.freeze({
    trigger: Object.freeze({
      type: 'missionTime',
      atSec: 95,
      requires: Object.freeze([
        Object.freeze({ ...FIRST_STOP_REACHED, forSec: 20 }),
        Object.freeze({ event: 'dust-storm', afterSec: 15 }),
      ]),
      latestSec: 210,
      holdInsideEnd: true,
    }),
    timelineScale: 1 / 12,
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
  Object.freeze({ id: 'dust-storm', text: 'mission.beat.storm', event: 'dust-storm' }),
  Object.freeze({ id: 'radiation', text: 'mission.beat.radiation', event: 'radiation' }),
  Object.freeze({ id: 'debrief', text: 'mission.beat.debrief' }),
]);

export const MISSIONS = Object.freeze({
  first: Object.freeze({ id: 'first', objectives: Object.freeze(['sortie']), events: FIRST_EVENTS, beats: FIRST_BEATS }),
  // The full EVA keeps today's screens: no beat lines and no recap.
  full: Object.freeze({ id: 'full', objectives: Object.freeze(['cheyava', 'bright-angel']), events: FULL_EVENTS, beats: Object.freeze([]) }),
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
 * The earliest mission time (s) the event can start in this objective's mission: 75 / 95 s in the first mission (later
 * when its conditions hold later), 480 / 720 s in the full EVA. null when the mission does not schedule the event.
 * @param {string} objective
 * @param {string} eventId
 * @returns {number | null}
 */
export function eventStartSec(objective, eventId) {
  const trigger = eventTrigger(objective, eventId);
  return trigger?.type === 'missionTime' ? trigger.atSec : null;
}

function scaleTimeline(timeline, scale) {
  if (scale === 1) return timeline;
  return timeline.map((entry) => ({ ...entry, atSec: Math.round(entry.atSec * scale * 100) / 100 }));
}

/**
 * The event definitions for this objective's mission: each definition the mission schedules gets the mission's trigger
 * and its compressed timeline; the others (low oxygen) are returned as they are. The input is not changed.
 * @param {string} objective
 * @param {Array<object>} definitions parsed event files
 * @returns {Array<object>}
 */
export function missionEventDefinitions(objective, definitions) {
  const mission = missionForObjective(objective);
  return definitions.map((definition) => {
    const scheduled = mission.events[definition.id];
    if (!scheduled) return definition;
    return {
      ...definition,
      trigger: scheduled.trigger,
      timeline: scaleTimeline(definition.timeline ?? [], scheduled.timelineScale ?? 1),
    };
  });
}

/**
 * The beat line to show now, or null. Pure: the caller passes what it reads from the store.
 * - at the mission table before Begin EVA: 'plan';
 * - in Walk: the radiation beat while its alert is active, else the storm beat while its alert is active, else the walk
 *   beat until the first event has started;
 * - the debrief beat is not returned here: the debrief shows the recap of every beat.
 * @param {ReturnType<typeof missionForObjective>} mission
 * @param {{ mode: 'plan' | 'walk', evaBegun: boolean, alerts?: object, events?: Array<{ type: string, eventId: string }> }} state
 * @returns {{ id: string, text: string, event?: string } | null}
 */
export function currentBeat(mission, { mode, evaBegun, alerts = {}, events = [] }) {
  const beat = (id) => mission.beats.find((entry) => entry.id === id) ?? null;
  if (!evaBegun) return mode === 'plan' ? beat('plan') : null;
  if (mode !== 'walk') return null;
  for (const id of ['radiation', 'dust-storm']) {
    const entry = beat(id);
    if (entry && alerts[entry.event]?.active) return entry;
  }
  const scheduled = Object.keys(mission.events);
  if (events.some((entry) => entry.type === 'start' && scheduled.includes(entry.eventId))) return null;
  return beat('walk');
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
    source: 'first mission: the storm starts at T+75 s, once the crew has been at the sortie stop 20 s (by T+180 s at the latest), never within 25 m of the airlock; ramp compressed from 90 s to 30 s. Tau values from hazards.json',
  }),
  [missionSourcePath('first', 'radiation')]: Object.freeze({
    tag: 'SIM', label: 'First mission timing', short: 'SIM · first mission',
    source: 'first mission: the radiation alert starts at T+95 s, 15 s after the storm and 20 s after the sortie stop (by T+210 s at the latest), never within 25 m of the airlock; the 12-minute RAD profile compressed to 1 minute. Dose rates from hazards.json (RAD, Gale)',
  }),
  [missionSourcePath('full', 'dust-storm')]: Object.freeze({
    tag: 'SIM', label: 'Scripted event time', short: 'SIM · scripted',
    source: 'full EVA: the storm starts at T+480 s (scripted); 90 s ramp from hazards.json dust.event.ramp_duration',
  }),
  [missionSourcePath('full', 'radiation')]: Object.freeze({
    tag: 'SIM', label: 'Scripted event time', short: 'SIM · scripted',
    source: 'full EVA: the radiation alert starts at T+720 s (scripted); the September 2017 RAD profile compressed to 12 minutes',
  }),
});
