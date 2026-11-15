import { describe, expect, it } from 'vitest';
import { waypointNumber } from './waypointNumber.js';

describe('waypointNumber', () => {
  it('numbers the start 0 and WP1 1, the same as the leg that ends there', () => {
    expect(waypointNumber(0)).toBe('0');
    expect(waypointNumber(1)).toBe('1');
    expect(waypointNumber(4)).toBe('4');
  });
});
