/**
 * Runs the partner's suit and the separation rule against the mission store a few times per second (issue #70).
 *
 * The partner is read only through `readPartner()`, which returns what the partner source reported for the last
 * frame: `{ id, color, state }` with a PartnerState (docs/PARTNER.md), or null without a partner. In the app this is
 * `engine.getPartner()`, so the scripted partner and a network partner (#53) feed the same code.
 *
 * The partner's O2 and battery come from the same suit model as the player's (src/sim/suitModel.js), fed by the
 * partner's own movement: speed and gradient are measured between ticks, as src/sim/suitRunner.js does for the player.
 *
 * Radio (plan section 4.2): with no GPS, the partner's position and suit reach the player by radio, which needs line
 * of sight. Given `lineOfSight` (the engine's terrain query), the runner checks the ray between the two suits with
 * radioLinkState (src/sim/radio.js). Without it, crew[0] keeps the last values received, `link` turns false and
 * `lastContactSec` says when they arrived. Range, bearing and the separation rule then use the last known position.
 *
 * Writes `crew[0]` and, only when the separation level changes, `alerts.partner-separation`.
 * Plain JavaScript: the store is any object with getState / setState. No React, no three.js.
 */
import { createSuitState, pathHome, stepSuit, suitReadout, walkCost } from './suitModel.js';
import { DEFAULT_HABITAT } from './replan.js';
import { radioLinkState } from './radio.js';
import { rangeBearing, SEPARATION_ALERT_ID, SEPARATION_RULE, separationAlert, separationLevel } from './partnerStatus.js';

export const PARTNER_TICK_MS = 250;

const SUIT_SOURCE = 'suit model (src/sim/suitModel.js) fed by the partner\'s own movement, as for the player';
const POSITION_SOURCE = 'player position and partner source position (scripted partner today); no GPS on Mars';

/** Live source entries the runner registers for the crew[0] values it writes. */
export const PARTNER_SOURCES = Object.freeze({
  'crew.0.rangeM': { tag: 'SIM', source: POSITION_SOURCE },
  'crew.0.bearingDeg': { tag: 'SIM', source: POSITION_SOURCE },
  'crew.0.oxygenPct': { tag: 'DERIVED', source: SUIT_SOURCE },
  'crew.0.batteryPct': { tag: 'DERIVED', source: SUIT_SOURCE + '; the effort share of the draw is SIM' },
  'crew.0.status': { tag: 'DERIVED', source: SUIT_SOURCE + '; thresholds SIM' },
  'crew.0.link': { tag: 'DERIVED', source: 'radio line of sight between the two suits on the HiRISE height map (src/sim/radio.js)' },
  'crew.0.separationLimitM': { tag: 'SIM', source: 'our rule: 100 m from the pair-walk mockup, caution from 80 m; hazards.json has no separation value' },
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {{ store: { getState: Function, setState: Function },
 *   readPartner: () => ({ id: string, color?: number[], state: object | null } | null),
 *   heightAt: (x: number, z: number) => number, constants: object, habitat?: { x: number, z: number },
 *   lineOfSight?: (a: { x: number, z: number }, b: { x: number, z: number }) => { clear: boolean },
 *   rule?: { limitM: number, cautionM: number, hysteresisM: number },
 *   now?: () => number, setInterval?: Function, clearInterval?: Function }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startPartnerRunner({
  store, readPartner, heightAt, constants: c, habitat = DEFAULT_HABITAT, rule = SEPARATION_RULE, lineOfSight = null,
  now = () => Date.now(), setInterval: si = setInterval, clearInterval: ci = clearInterval,
}) {
  let suit = createSuitState(c);
  let last = null;                    // { t, x, z } at the previous tick
  let speed = 0, gradient = 0;        // smoothed over about a second, as in the suit runner
  let walkback = { timeSec: 0, o2G: 0, distanceM: 0 }, walkbackKey = '';
  let level = 'nominal', present = false;
  let received = null;                // what last came over the radio: position, suit readout and mission time

  store.setState((s) => ({ sources: { ...s.sources, ...PARTNER_SOURCES } }));

  function clear() {
    store.setState((s) => ({ crew: s.crew.slice(1), alerts: { ...s.alerts, [SEPARATION_ALERT_ID]: null } }));
    present = false; last = null; level = 'nominal'; received = null;
  }

  function tick() {
    const partner = readPartner(), st = partner && partner.state;
    if (!st || !st.visible || !finite(st.x) || !finite(st.z)) { if (present) clear(); return; }
    const s = store.getState(), t = now();

    if (last) {
      const dtSec = Math.min(1, Math.max(0, (t - last.t) / 1000));
      if (dtSec > 0 && !s.mission.paused) {
        const run = Math.hypot(st.x - last.x, st.z - last.z), k = Math.min(1, dtSec);
        speed += (run / dtSec - speed) * k;
        if (run > 0.05) gradient += ((heightAt(st.x, st.z) - heightAt(last.x, last.z)) / run - gradient) * k;
        suit = stepSuit(suit, { dtSec, speedMs: speed, gradient }, c);
      }
    }
    last = { t, x: st.x, z: st.z };

    // the partner walks home straight to the habitat: it does not follow the player's route
    const key = Math.round(st.x) + ',' + Math.round(st.z);
    if (key !== walkbackKey) { walkbackKey = key; walkback = walkCost(pathHome(st, null, habitat), heightAt, c); }
    const r = suitReadout(suit, walkback, c, { elapsedSec: s.mission.elapsedSec });

    const nav = s.navigation, hasNav = finite(nav.x) && finite(nav.z);
    const link = !lineOfSight || !hasNav || radioLinkState({ point: nav, mast: { x: st.x, z: st.z }, lineOfSight }).clear;
    if (link) received = { x: st.x, z: st.z, r, atSec: s.mission.elapsedSec ?? 0 };
    if (!received) return;   // never heard from: nothing to show yet
    const rb = hasNav ? rangeBearing(nav, received) : null;
    const next = rb ? separationLevel(rb.rangeM, level, rule) : level;
    const id = partner.id || 'EV2', q = received.r;
    const entry = {
      id, name: id, color: partner.color || null, x: received.x, z: received.z,
      rangeM: rb ? rb.rangeM : null, bearingDeg: rb ? rb.bearingDeg : null,
      oxygenPct: q.oxygenPct, oxygenSec: q.oxygenSec, batteryPct: q.batteryPct, marginSec: q.marginSec, status: q.status,
      link, lastContactSec: received.atSec,
      separation: next, separationLimitM: rule.limitM, separationCautionM: rule.cautionM,
    };
    const changed = next !== level;
    level = next; present = true;
    store.setState((cur) => ({
      crew: [entry, ...cur.crew.slice(1)],
      ...(changed ? { alerts: { ...cur.alerts, [SEPARATION_ALERT_ID]: separationAlert(next, { partnerId: id, startedAtSec: cur.mission.elapsedSec ?? 0, rule }) } } : {}),
    }));
  }

  const timer = si(tick, PARTNER_TICK_MS);
  return { tick, stop: () => ci(timer) };
}
