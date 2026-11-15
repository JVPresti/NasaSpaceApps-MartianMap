import { describe, expect, it } from 'vitest';
import { showsOfflineNotice } from './onlineNotice.js';

describe('offline notice (#53, plan section 9.7)', () => {
  it('shows only for a room link that gave up or lost its seat', () => {
    expect(showsOfflineNotice({ code: null, status: 'off' })).toBe(false);
    expect(showsOfflineNotice({ code: 'ABCD', status: 'connecting' })).toBe(false);
    expect(showsOfflineNotice({ code: 'ABCD', status: 'open' })).toBe(false);
    expect(showsOfflineNotice({ code: 'ABCD', status: 'offline' })).toBe(true);
    expect(showsOfflineNotice({ code: 'ABCD', status: 'closed' })).toBe(true);
    expect(showsOfflineNotice(undefined)).toBe(false);
  });
});
