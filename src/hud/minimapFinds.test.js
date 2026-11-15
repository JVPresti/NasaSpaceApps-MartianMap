import { describe, expect, it } from 'vitest';
import { findColor, findMarkers } from './minimapFinds.js';

const identity = (x, z) => ({ x, y: z });

describe('minimap finds', () => {
  it('colours a find by its status and verdict', () => {
    expect(findColor({ status: 'pricing' })).toBe('#ffc56b');
    expect(findColor({ status: 'priced', detour: { verdict: 'go' } })).toBe('#8fe9b8');
    expect(findColor({ status: 'priced', detour: { verdict: 'no-go' } })).toBe('#ff6a4d');
    expect(findColor({ status: 'accepted', detour: { verdict: 'no-go' } })).toBe('#9fd8ee');
  });

  it('keeps a far find on the rim instead of dropping it', () => {
    const [near, far] = findMarkers([{ x: 60, z: 50, label: 'M01' }, { x: 500, z: 50, label: 'M02' }], identity, 50, 50, 40, 5);
    expect(near).toMatchObject({ x: 60, y: 50, edge: false, label: 'M01' });
    expect(far).toMatchObject({ x: 85, y: 50, edge: true });
  });

  it('skips entries without a position and accepted finds, which the waypoint markers show', () => {
    expect(findMarkers([{ label: 'M01' }, null, { x: 1, z: 1, label: 'M02', status: 'accepted' }], identity, 0, 0, 40)).toEqual([]);
  });
});
