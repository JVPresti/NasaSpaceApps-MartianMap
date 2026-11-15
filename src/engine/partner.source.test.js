import { describe, expect, it } from 'vitest';
import { createPartner } from './partner.js';
import { createStaticPartner } from './partnerSource.js';

// The renderer's source handling only: no GPU and no model are needed for setSource and command.
function makePartner({ rocks = [] } = {}) {
  const ctx = {
    scene: {}, U: {}, assets: {}, view: { eye: { x: 0, z: 0 } }, terrain: { meshH: () => 0 },
    sys: {
      habitat: { root: null, zone: () => null, slide: (x0, z0, p) => p },
      rocks: { obstacles(p, out) { for (const r of rocks) out.push(r.x, r.z, r.x, r.z, r.r); return out; } },
    },
  };
  return { partner: createPartner(ctx), ctx };
}

describe('partner renderer: who drives the partner', () => {
  it('brings back the source chosen through engine.setPartnerSource when the engine places the crew again', () => {
    const { partner } = makePartner();
    const chosen = createStaticPartner({ id: 'EV2' }), scripted = createStaticPartner({ id: 'bench' });
    partner.setSource(scripted);
    expect(partner.source).toBe(scripted);
    partner.setSource(chosen, { chosen: true });
    partner.setSource(createStaticPartner({ id: 'bench again' }));   // placeAtAirlock at the EVA start or a restart
    expect(partner.source).toBe(chosen);
    partner.setSource(null, { chosen: true });                        // null hides it (a crew of one, #282) ...
    expect(partner.source).toBeNull();
    partner.setSource(scripted);                                      // ... and clears the choice: a restart brings the engine's own
    expect(partner.source).toBe(scripted);
  });

  it('gives a source the habitat zone and the walker collision in its world', () => {
    const { partner, ctx } = makePartner({ rocks: [{ x: 5, z: 0, r: 0.5 }] });
    let world = null;
    partner.setSource({ id: 'EV2', update: () => null, command: (name, w) => { world = w; return true; } }, { chosen: true });
    expect(partner.command('toggleCase')).toBe(true);
    expect(world.zone(0, 0)).toBeNull();
    const p = world.collide(4, 0, { x: 4.9, z: 0 });                  // a step into the rock ends outside it
    expect(Math.hypot(p.x - 5, p.z)).toBeCloseTo(0.8, 6);
    ctx.view.eye.x = 10;
    const q = world.collide(10.5, 0.2, { x: 10.2, z: 0.1 });         // and never inside the 0.9 m gap to the player
    expect(Math.hypot(q.x - 10, q.z)).toBeGreaterThanOrEqual(0.9 - 1e-9);
  });
});
