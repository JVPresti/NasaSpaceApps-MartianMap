// A 2 hour EVA with the partner patrolling the whole time: the player's way back must still be on the ground (#46).
import { describe, expect, it } from 'vitest';
import { simulateEva } from '../../scripts/eva-prints.mjs';

describe('boot prints over a whole EVA', () => {
  it('keeps every outbound print of the player after 2 hours next to the patrolling partner', () => {
    const r = simulateEva({ hours: 2 });
    expect(r.backStartedMin).toBeLessThan(120);
    expect(r.outbound.prints).toBeGreaterThan(1800);              // 944 m of route at one print per 0.5 m
    expect(r.outbound.stillThere).toBe(r.outbound.prints);
    expect(r.player.kept).toBeLessThan(r.player.capacity);      // the player's ring never wrapped
    expect(r.partner.kept).toBeLessThan(r.partner.offered / 10); // the patrol line does not keep stacking prints
    expect(r.oldSharedRing.stillThere).toBe(0);                  // what the single 5000-print ring of #141 kept
  });
});
