import { describe, expect, it } from 'vitest';
import { crewCss } from './crewColor.js';
import { drawPartners, partnerMarker } from './minimapPartner.js';
import { setLanguage } from '../i18n/index.js';

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

describe('crew markers (#53)', () => {
  it('a remote player behind a ridge greys out at the last position and reads last known', () => {
    const lost = { id: 'p-1', name: 'Bea', x: 10, z: 5, link: false, color: [0.1, 0.8, 0.3] };
    const m = partnerMarker(lost, project, 100, 100, 90);
    expect(m).toMatchObject({ x: 110, y: 105, lost: true, label: 'Bea' });
    expect(m.color).not.toBe(partnerMarker({ ...lost, link: true }, project, 100, 100, 90).color);
    const texts = [];
    const g = new Proxy({}, { get: (_, k) => (k === 'fillText' ? (s) => texts.push(s) : () => {}), set: () => true });
    setLanguage('en');
    drawPartners(g, [lost, { ...lost, name: 'Cy', link: true }], project, 100, 100, 90);
    expect(texts).toEqual(['Bea last known', 'Cy']);
    setLanguage('es');
    texts.length = 0;
    drawPartners(g, [lost], project, 100, 100, 90);
    expect(texts).toEqual(['Bea última posición']);
    setLanguage('en');
  });
});
