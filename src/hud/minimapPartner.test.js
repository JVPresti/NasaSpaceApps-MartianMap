import { describe, expect, it } from 'vitest';
import { crewCss } from './crewColor.js';
import { partnerMarker } from './minimapPartner.js';

// north-up map at 1 px per metre, centred on the origin, 100 px radius
const project = (x, z) => ({ x: 100 + x, y: 100 + z });

describe('partnerMarker', () => {
  it('places the partner in the suit colour inside the range', () => {
    const m = partnerMarker({ id: 'EV2', x: 30, z: -40, color: [1, 0.32, 0.03], link: true }, project, 100, 100, 100);
    expect(m).toMatchObject({ x: 130, y: 60, edge: false, lost: false, label: 'EV2', color: crewCss([1, 0.32, 0.03]) });
  });

  it('greys the marker at the last known position without radio line of sight', () => {
    const m = partnerMarker({ id: 'EV2', x: 10, z: 0, color: [1, 0.32, 0.03], link: false }, project, 100, 100, 100);
    expect(m).toMatchObject({ x: 110, y: 100, lost: true });
    expect(m.color).not.toBe(crewCss([1, 0.32, 0.03]));
  });

  it('puts a partner beyond the range on the rim, toward them', () => {
    const m = partnerMarker({ x: 300, z: 0 }, project, 100, 100, 100, 8);
    expect(m).toMatchObject({ x: 192, y: 100, edge: true });
    expect(m.angle).toBeCloseTo(0, 6);
  });

  it('returns null without a partner position', () => {
    expect(partnerMarker(null, project, 100, 100, 100)).toBeNull();
    expect(partnerMarker({ x: null, z: 0 }, project, 100, 100, 100)).toBeNull();
  });
});

describe('crewCss', () => {
  it('turns linear RGB into sRGB', () => {
    expect(crewCss([1, 0, 0])).toBe('rgb(255, 0, 0)');
    expect(crewCss([0.5, 0.5, 0.5])).toBe('rgb(188, 188, 188)');
    expect(crewCss('orange')).toBeNull();
  });
});
