import { describe, expect, it } from 'vitest';
import { tipAfterTap } from './sourceTagTap.js';

describe('tipAfterTap', () => {
  it('opens closed details on a tap and closes open ones on the next', () => {
    expect(tipAfterTap(false, 'touch')).toBe('open');
    expect(tipAfterTap(true, 'touch')).toBe('close');
  });
  it('leaves a mouse or a pen to hover and focus', () => {
    expect(tipAfterTap(false, 'mouse')).toBeNull();
    expect(tipAfterTap(true, 'pen')).toBeNull();
  });
});
