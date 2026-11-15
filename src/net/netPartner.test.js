import { describe, expect, it } from 'vitest';
import { assertPartnerState } from '../engine/partnerSource.js';
import { PLAYER_COLORS } from '../engine/crew.js';
import { createNetPartner, yawFromHeading } from './netPartner.js';
import { createPoseBuffer } from './poseSync.js';

const entry = { id: 'p-1', name: 'Bea', color: 3, role: 'surface', joinedAt: 0 };

describe('net partner', () => {
  it('is a partner source in the player colour, hidden until the first pose', () => {
    const buffer = createPoseBuffer();
    const src = createNetPartner({ entry, buffer, now: () => 0 });
    expect(src).toMatchObject({ id: 'p-1', name: 'Bea', color: PLAYER_COLORS[3] });
    expect(typeof src.update).toBe('function');
    const st = assertPartnerState(src.update(0.016, null));
    expect(st.visible).toBe(false);
  });

  it('returns a valid PartnerState from the buffered poses', () => {
    const buffer = createPoseBuffer();
    const clock = { ms: 0 };
    const src = createNetPartner({ entry, buffer, now: () => clock.ms });
    buffer.push({ type: 'p', x: 0, z: 0, h: 0, pt: 0, a: 'walk', hp: 0, ct: 0, ex: 1, ez: 2 }, 0);
    buffer.push({ type: 'p', x: 1, z: 0, h: Math.PI / 2, pt: 0, a: 'walk', hp: 0, ct: 200, ex: 2, ez: 2 }, 200);
    clock.ms = 250;
    const st = assertPartnerState(src.update(0.016, null));
    expect(st).toMatchObject({ visible: true, gait: 'walk', carrying: true, action: null, lampOn: undefined });
    expect(st.x).toBeCloseTo(0.5, 6);
    expect(st.speedMs).toBeCloseTo(5, 6);
    expect(src.radio()).toMatchObject({ name: 'Bea', x: 2, z: 2 });
  });

  it('maps the one-shot clip, the case and the lamp', () => {
    const buffer = createPoseBuffer();
    const src = createNetPartner({ entry, buffer, now: () => 1000 });
    buffer.push({ type: 'p', x: 0, z: 0, h: 0, pt: 0, a: 'idle', hp: 0, ct: 0, ac: 'case_set_down', at: 0.5, c: 0, l: 1 }, 0);
    const st = assertPartnerState(src.update(0.016, null));
    expect(st.action.name).toBe('case_set_down');
    expect(st.action.timeSec).toBeCloseTo(0.5 + 0.85, 6);   // held: the clip keeps running 850 ms past the sample
    expect(st).toMatchObject({ carrying: false, lampOn: true, gait: 'idle' });
  });

  it('turns the heading into the suit yaw: north faces -z, east faces +x', () => {
    const face = (h) => { const y = yawFromHeading(h); return [Math.round(Math.sin(y) * 1e6) / 1e6, Math.round(Math.cos(y) * 1e6) / 1e6]; };
    expect(face(0)).toEqual([0, -1]);
    expect(face(Math.PI / 2)).toEqual([1, 0]);
    expect(face(Math.PI)).toEqual([0, 1]);
  });
});
