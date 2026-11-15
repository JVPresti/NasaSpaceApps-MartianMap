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
 * Several partners (#53). Given `readPartners()` (engine.getPartners()), the runner keeps one entry per partner, in
 * order: `crew[0]` is the full partner, `crew[1]` and `crew[2]` the extra suits. A partner whose source has `radio()`
 * (a remote player, src/net/netPartner.js) reports its own position estimate and its O2 and battery (`tel`): the
 * entry uses those instead of the true position and the local suit model, and they too only arrive in line of sight.
 * The separation alert follows the nearest partner: walking with one teammate is not a separation.
 *
 * Writes `crew` and, only when the separation level changes, `alerts.partner-separation`.
 * Plain JavaScript: the store is any object with getState / setState. No React, no three.js.
 */
import { createSuitState, pathHome, stepSuit, suitReadout, walkCost } from './suitModel.js';
import { DEFAULT_HABITAT } from './replan.js';
import { radioLinkState } from './radio.js';
import { rangeBearing, SEPARATION_ALERT_ID, SEPARATION_RULE, separationAlert, separationLevel } from './partnerStatus.js';

export const PARTNER_TICK_MS = 250;
/** crew entries the runner registers source tags for: the full partner and two extra suits. */
export const MAX_CREW_ENTRIES = 3;

const SUIT_SOURCE = 'suit model (src/sim/suitModel.js) fed by the partner\'s own movement, as for the player';
const POSITION_SOURCE = 'player position and partner source position (scripted partner today); no GPS on Mars';
const RADIO_SOURCE = 'reported by the remote player\'s own suit over the room (tel every 5 s), received in radio line of sight';
const REPORTED_POSITION = 'the remote player\'s own position estimate (navigation drift, #42), received in radio line of sight; no GPS on Mars';

const sourcesFor = (i, radio) => ({
  [`crew.${i}.rangeM`]: { tag: 'SIM', source: radio ? REPORTED_POSITION : POSITION_SOURCE },
  [`crew.${i}.bearingDeg`]: { tag: 'SIM', source: radio ? REPORTED_POSITION : POSITION_SOURCE },
  [`crew.${i}.oxygenPct`]: radio ? { tag: 'SIM', source: RADIO_SOURCE } : { tag: 'DERIVED', source: SUIT_SOURCE },
  [`crew.${i}.batteryPct`]: radio ? { tag: 'SIM', source: RADIO_SOURCE } : { tag: 'DERIVED', source: SUIT_SOURCE + '; the effort share of the draw is SIM' },
  [`crew.${i}.status`]: { tag: 'DERIVED', source: SUIT_SOURCE + '; thresholds SIM' },
  [`crew.${i}.link`]: { tag: 'DERIVED', source: 'radio line of sight between the two suits on the HiRISE height map (src/sim/radio.js)' },
  [`crew.${i}.separationLimitM`]: { tag: 'SIM', source: 'our rule: 100 m from the pair-walk mockup, caution from 80 m; hazards.json has no separation value' },
});

/** Live source entries the runner registers for the crew values it writes (the scripted partner's). */
export const PARTNER_SOURCES = Object.freeze(Object.assign({}, ...Array.from({ length: MAX_CREW_ENTRIES }, (_, i) => sourcesFor(i, false))));

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const RANK = { nominal: 0, caution: 1, warning: 2 };

/**
 * @param {{ store: { getState: Function, setState: Function },
 *   readPartner?: () => ({ id: string, color?: number[], state: object | null } | null),
 *   readPartners?: () => Array<{ id: string, name?: string, color?: number[], state: object | null, radio?: object | null }>,
 *   heightAt: (x: number, z: number) => number, constants: object, habitat?: { x: number, z: number },
 *   lineOfSight?: (a: { x: number, z: number }, b: { x: number, z: number }) => { clear: boolean },
 *   rule?: { limitM: number, cautionM: number, hysteresisM: number },
 *   now?: () => number, setInterval?: Function, clearInterval?: Function }} options
 * @returns {{ tick: () => void, stop: () => void }}
 */
export function startPartnerRunner({
  store, readPartner, readPartners, heightAt, constants: c, habitat = DEFAULT_HABITAT, rule = SEPARATION_RULE, lineOfSight = null,
  now = () => Date.now(), setInterval: si = setInterval, clearInterval: ci = clearInterval,
}) {
  const read = readPartners || (() => { const p = readPartner(); return p ? [p] : []; });
  const tracks = new Map();   // id -> per-partner state
  let level = 'nominal', present = false;
  const kinds = [];           // per crew index: true when its values come over the radio, for the source tags

  store.setState((s) => ({ sources: { ...s.sources, ...PARTNER_SOURCES } }));

  function track(id) {
    if (!tracks.has(id)) {
      tracks.set(id, {
        suit: createSuitState(c), last: null, speed: 0, gradient: 0,
        walkback: { timeSec: 0, o2G: 0, distanceM: 0 }, walkbackKey: '', level: 'nominal',
        received: null,   // what last came over the radio: position, suit readout and mission time
      });
    }
    return tracks.get(id);
  }

  function clear() {
    store.setState((s) => ({ crew: [], alerts: { ...s.alerts, [SEPARATION_ALERT_ID]: null } }));
    present = false; level = 'nominal'; tracks.clear();
  }

  function step(partner, tr, s, t) {
    const st = partner.state;
    if (tr.last) {
      const dtSec = Math.min(1, Math.max(0, (t - tr.last.t) / 1000));
      if (dtSec > 0 && !s.mission.paused) {
        const run = Math.hypot(st.x - tr.last.x, st.z - tr.last.z), k = Math.min(1, dtSec);
        tr.speed += (run / dtSec - tr.speed) * k;
        if (run > 0.05) tr.gradient += ((heightAt(st.x, st.z) - heightAt(tr.last.x, tr.last.z)) / run - tr.gradient) * k;
        tr.suit = stepSuit(tr.suit, { dtSec, speedMs: tr.speed, gradient: tr.gradient }, c);
      }
    }
    tr.last = { t, x: st.x, z: st.z };

    // the partner walks home straight to the habitat: it does not follow the player's route
    const key = Math.round(st.x) + ',' + Math.round(st.z);
    if (key !== tr.walkbackKey) { tr.walkbackKey = key; tr.walkback = walkCost(pathHome(st, null, habitat), heightAt, c); }
    const r = { ...suitReadout(tr.suit, tr.walkback, c, { elapsedSec: s.mission.elapsedSec }) };
    const radio = partner.radio || null;
    if (radio) {   // a remote player reports their own suit and position estimate
      if (finite(radio.oxygenPct)) r.oxygenPct = radio.oxygenPct;
      if (finite(radio.batteryPct)) r.batteryPct = radio.batteryPct;
    }
    const pos = radio && finite(radio.x) && finite(radio.z) ? { x: radio.x, z: radio.z } : { x: st.x, z: st.z };

    const nav = s.navigation, hasNav = finite(nav.x) && finite(nav.z);
    const link = !lineOfSight || !hasNav || radioLinkState({ point: nav, mast: { x: st.x, z: st.z }, lineOfSight }).clear;
    if (link) tr.received = { x: pos.x, z: pos.z, r, atSec: s.mission.elapsedSec ?? 0 };
    if (!tr.received) return null;   // never heard from: nothing to show yet
    const rb = hasNav ? rangeBearing(nav, tr.received) : null;
    tr.level = rb ? separationLevel(rb.rangeM, tr.level, rule) : tr.level;
    const id = partner.id || 'EV2', q = tr.received.r;
    return {
      id, name: partner.name || id, color: partner.color || null, x: tr.received.x, z: tr.received.z,
      rangeM: rb ? rb.rangeM : null, bearingDeg: rb ? rb.bearingDeg : null,
      oxygenPct: q.oxygenPct, oxygenSec: q.oxygenSec, batteryPct: q.batteryPct, marginSec: q.marginSec, status: q.status,
      link, lastContactSec: tr.received.atSec,
      separation: tr.level, separationLimitM: rule.limitM, separationCautionM: rule.cautionM,
      ...(radio ? { remote: true } : {}),
    };
  }

  function tick() {
    const partners = read().filter((p) => p && p.state && p.state.visible && finite(p.state.x) && finite(p.state.z));
    if (!partners.length) { if (present) clear(); return; }
    const s = store.getState(), t = now();
    const ids = new Set(partners.map((p) => p.id || 'EV2'));
    for (const id of [...tracks.keys()]) if (!ids.has(id)) tracks.delete(id);
    const entries = [];
    for (const p of partners) {
      const e = step(p, track(p.id || 'EV2'), s, t);
      if (e) entries.push({ e, radio: !!p.radio });
    }
    if (!entries.length) { if (present) clear(); return; }

    // the nearest partner decides the separation alert
    let best = entries[0].e;
    for (const { e } of entries) if ((RANK[e.separation] ?? 0) < (RANK[best.separation] ?? 0) || (e.separation === best.separation && finite(e.rangeM) && !(e.rangeM >= best.rangeM))) best = e;
    const next = best.separation, changed = next !== level;
    level = next; present = true;

    const tags = {};
    entries.forEach(({ radio }, i) => { if (kinds[i] !== radio) { kinds[i] = radio; Object.assign(tags, sourcesFor(i, radio)); } });
    store.setState((cur) => ({
      crew: entries.map(({ e }) => e),
      ...(Object.keys(tags).length ? { sources: { ...cur.sources, ...tags } } : {}),
      ...(changed ? { alerts: { ...cur.alerts, [SEPARATION_ALERT_ID]: separationAlert(next, { partnerId: best.name || best.id, startedAtSec: cur.mission.elapsedSec ?? 0, rule }) } } : {}),
    }));
  }

  const timer = si(tick, PARTNER_TICK_MS);
  return { tick, stop: () => ci(timer) };
}
