import { afterEach, describe, expect, it, vi } from 'vitest';
import { bootOnline, readRoomCode } from './onlineLink.js';

afterEach(() => vi.unstubAllGlobals());

describe('readRoomCode', () => {
  it('reads ?room= in any case', () => {
    expect(readRoomCode('?room=abcd')).toEqual({ code: 'ABCD' });
    expect(readRoomCode('?x=1&room=TEST')).toEqual({ code: 'TEST' });
    expect(readRoomCode('?room=ABIO')).toEqual({ invalid: 'ABIO' });
    expect(readRoomCode('')).toBeNull();
    expect(readRoomCode('?mock=1')).toBeNull();
  });
});

describe('bootOnline keeps the offline path offline', () => {
  function spies() {
    const WebSocket = vi.fn();
    const fetch = vi.fn(() => Promise.resolve(new Response('')));
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('fetch', fetch);
    return { WebSocket, fetch, load: vi.fn(), warn: vi.fn() };
  }

  it('without ?room= it never loads src/net, opens a socket or fetches /api/', () => {
    for (const search of ['', '?', '?mock=1', '?debug=1&lang=es', undefined]) {
      const s = spies();
      expect(bootOnline({ search, store: {}, load: s.load, warn: s.warn })).toBeNull();
      expect(s.load).not.toHaveBeenCalled();
      expect(s.WebSocket).not.toHaveBeenCalled();
      expect(s.fetch).not.toHaveBeenCalled();
      expect(s.warn).not.toHaveBeenCalled();
    }
  });

  it('with an invalid code it warns and still loads nothing', () => {
    const s = spies();
    expect(bootOnline({ search: '?room=IOIO', store: {}, load: s.load, warn: s.warn })).toBeNull();
    expect(s.warn).toHaveBeenCalledOnce();
    expect(s.load).not.toHaveBeenCalled();
    expect(s.WebSocket).not.toHaveBeenCalled();
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('with a valid code it loads src/net and starts online with the normalised code', async () => {
    const startOnline = vi.fn(() => 'handle');
    const store = {};
    const handle = await bootOnline({ search: '?room=test', store, load: () => Promise.resolve({ startOnline }) });
    expect(handle).toBe('handle');
    expect(startOnline).toHaveBeenCalledWith({ code: 'TEST', store });
  });
});
