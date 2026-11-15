import { describe, expect, it } from 'vitest';
import { modeSwitchAllowed } from './modeGuard.js';

describe('modeSwitchAllowed', () => {
  it('keeps M and gamepad Start at the table before Begin EVA', () => {
    expect(modeSwitchAllowed('walk', false)).toBe(false);
  });

  it('lets them switch both ways once the EVA has begun', () => {
    expect(modeSwitchAllowed('walk', true)).toBe(true);
    expect(modeSwitchAllowed('plan', true)).toBe(true);
  });

  it('always lets them open the table', () => {
    expect(modeSwitchAllowed('plan', false)).toBe(true);
  });
});
