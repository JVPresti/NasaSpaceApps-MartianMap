import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LABEL, labelLayout, screenScale, splitName } from './waypoints.js';

describe('waypoint labels', () => {
  it('draw the name at 12 CSS px or more', () => {
    expect(LABEL.title).toBeGreaterThanOrEqual(12);
    expect(LABEL.detail).toBeGreaterThanOrEqual(12);
    expect(LABEL.badgeFont).toBeGreaterThanOrEqual(12);
  });

  it('keep the same screen size at any camera distance and fit both lines', () => {
    const one = labelLayout({ titleW: 40, detailW: 0, twoLines: false });
    const two = labelLayout({ titleW: 40, detailW: 110, twoLines: true });
    expect(two.height).toBeGreaterThan(one.height);
    expect(two.pillH).toBeGreaterThanOrEqual(LABEL.title + LABEL.detail);
    expect(two.pillW).toBe(110 + LABEL.textX * 2);
    expect(two.badgeX).toBeLessThan(two.pillX);
  });

  it('scale a sizeAttenuation:false sprite to the requested pixel height', () => {
    const camera = new THREE.PerspectiveCamera(62, 1920 / 1080, 0.15, 30000);
    camera.updateProjectionMatrix();
    const yy = camera.projectionMatrix.elements[5];
    const { x, y } = screenScale(200, 30, yy, 1080);
    // three.js draws the sprite y * depth tall at that depth, which projects to y * yy NDC units.
    expect(y * yy * 1080 / 2).toBeCloseTo(30, 6);
    expect(x / y).toBeCloseTo(200 / 30, 6);
    // A viewport half as tall needs twice the scale to keep the label 30 px tall.
    expect(screenScale(200, 30, yy, 540).y).toBeCloseTo(y * 2, 6);
  });

  it('splits the name at the first middle dot', () => {
    expect(splitName('WP1 · channel floor')).toEqual({ title: 'WP1', detail: 'channel floor' });
    expect(splitName('HAB')).toEqual({ title: 'HAB', detail: '' });
  });
});
