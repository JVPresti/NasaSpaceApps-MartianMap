/**
 * One remote surface player as a partner source (docs/PARTNER.md, #53).
 *
 * update() returns the PartnerState drawn from the player's pose buffer (src/net/poseSync.js), 150 ms behind
 * real time. The suit colour is the player's slot in PLAYER_COLORS. radio() is what the player reports over
 * the radio: name, their own position estimate (ex, ez, the navigation estimate of #42) and the O2 and
 * battery of their last `tel`. The partner runner (src/sim/partnerRunner.js) uses it for the team panel and
 * the map marker.
 */
import { PLAYER_COLORS } from '../engine/crew.js';

/** The suit yaw for a heading clockwise from north (radians): 0 faces south (+z), north is -z. */
export const yawFromHeading = (h) => Math.atan2(Math.sin(Math.PI - h), Math.cos(Math.PI - h));

/**
 * @param {{ entry: { id: string, name: string, color: number }, buffer: { sample: (nowMs: number) => object | null },
 *   telemetry?: () => ({ oxygenPct: number, batteryPct: number } | null), now?: () => number }} options
 */
export function createNetPartner({ entry, buffer, telemetry = () => null, now = () => Date.now() }) {
  const slot = Number.isInteger(entry.color) ? entry.color : 1;
  const color = PLAYER_COLORS[slot] || PLAYER_COLORS[1];
  let last = null;
  return {
    id: entry.id,
    name: entry.name,
    slot,
    color,
    update() {
      const s = buffer.sample(now());
      if (!s) {
        return { visible: false, x: 0, z: 0, yaw: 0, gait: 'idle', speedMs: 0, action: null, carrying: true, lampOn: undefined };
      }
      last = s;
      const carrying = s.c !== 0;
      return {
        visible: true,
        x: s.x, z: s.z, yaw: yawFromHeading(s.h),
        gait: s.a === 'walk' ? 'walk' : 'idle',
        speedMs: Number.isFinite(s.speedMs) ? s.speedMs : 0,
        action: s.ac ? { name: s.ac, timeSec: s.at + (s.actionAgeMs || 0) / 1000, carryingAfter: carrying } : null,
        carrying,
        lampOn: s.l === undefined ? undefined : s.l === 1,
      };
    },
    radio() {
      const tel = telemetry();
      return {
        name: entry.name,
        x: last && Number.isFinite(last.ex) ? last.ex : undefined,
        z: last && Number.isFinite(last.ez) ? last.ez : undefined,
        oxygenPct: tel ? tel.oxygenPct : undefined,
        batteryPct: tel ? tel.batteryPct : undefined,
      };
    },
  };
}
