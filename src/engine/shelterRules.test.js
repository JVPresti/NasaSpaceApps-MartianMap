import { describe, expect, it } from 'vitest';
import { formatDistance, labelMode, validShelter } from './shelterRules.js';

describe('shelter label distance', () => {
  it('rounds to 5 m below 1 km', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(312)).toBe('310 m');
    expect(formatDistance(997.6)).toBe('1000 m');
  });
  it('switches to km with one decimal from 1 km', () => {
    expect(formatDistance(1000)).toBe('1.0 km');
    expect(formatDistance(1260)).toBe('1.3 km');
  });
  it('shows nothing for a missing distance', () => {
    expect(formatDistance(NaN)).toBe('');
  });
});

describe('validShelter', () => {
  it('accepts an entry of shelters.json', () => {
    expect(validShelter({ id: 'HAB', name: 'HAB · habitat airlock', type: 'habitat', x: 535.1, z: 574.1, protection: 'full' })).toBe(true);
  });
  it('rejects missing or non-finite coordinates', () => {
    expect(validShelter(null)).toBe(false);
    expect(validShelter({ x: 1 })).toBe(false);
    expect(validShelter({ x: 1, z: Infinity })).toBe(false);
  });
});

describe('labelMode', () => {
  it('stays compact far away unless the player looks at it', () => {
    expect(labelMode(300, 0.8)).toBe('compact');
    expect(labelMode(300, 0.1)).toBe('full');
  });
  it('shows the full label close by and hides it next to the shelter', () => {
    expect(labelMode(60, 0.9)).toBe('full');
    expect(labelMode(10, 0)).toBe('hidden');
  });
  it('treats a marker behind the camera as not looked at', () => {
    expect(labelMode(300, Infinity)).toBe('compact');
  });
});
