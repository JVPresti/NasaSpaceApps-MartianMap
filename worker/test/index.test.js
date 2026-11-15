import { describe, expect, it, vi } from 'vitest';
import worker, { Room, handleRequest, originAllowed } from '../index.js';
import { Room as RoomClass } from '../room.js';

const HOST = 'https://martian-map.example.workers.dev';

function request(path, { method = 'GET', upgrade = 'websocket', origin = HOST, url = HOST } = {}) {
  const headers = new Headers();
  if (upgrade) headers.set('Upgrade', upgrade);
  if (origin) headers.set('Origin', origin);
  return new Request(url + path, { method, headers });
}

function fakeCtx() {
  const names = [];
  const forwarded = [];
  const ctx = {
    exports: {
      Room: {
        getByName(name) {
          names.push(name);
          return { fetch: (req) => { forwarded.push(req); return new Response('to room ' + name); } };
        },
      },
    },
  };
  return { ctx, names, forwarded };
}

describe('worker entry', () => {
  it('exports the Room class for the v1 migration', () => {
    expect(Room).toBe(RoomClass);
  });

  it('forwards a valid upgrade to the room named by the upper-case code', async () => {
    const { ctx, names, forwarded } = fakeCtx();
    const req = request('/api/room/abcd');
    const res = await worker.fetch(req, {}, ctx);
    expect(await res.text()).toBe('to room ABCD');
    expect(names).toEqual(['ABCD']);
    expect(forwarded).toEqual([req]);
  });

  it('rejects a bad code with 400 and never reaches a room', async () => {
    const { ctx, names } = fakeCtx();
    for (const code of ['ABC', 'ABCDE', 'ABIO', 'AB1D', 'AB%20D', 'A%E0BC']) {
      expect((await handleRequest(request('/api/room/' + code), ctx)).status, code).toBe(400);
    }
    expect(names).toEqual([]);
  });

  it('rejects a wrong method with 405 and a request without Upgrade with 426', async () => {
    const { ctx, names } = fakeCtx();
    const post = await handleRequest(request('/api/room/ABCD', { method: 'POST' }), ctx);
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
    const plain = await handleRequest(request('/api/room/ABCD', { upgrade: null }), ctx);
    expect(plain.status).toBe(426);
    expect(plain.headers.get('upgrade')).toBe('websocket');
    expect(names).toEqual([]);
  });

  it('rejects a missing or foreign Origin with 403', async () => {
    const { ctx, names } = fakeCtx();
    for (const origin of [null, 'https://evil.example', 'null', 'https://martian-map.example.workers.dev.evil.example', 'file:///x']) {
      expect((await handleRequest(request('/api/room/ABCD', { origin }), ctx)).status, String(origin)).toBe(403);
    }
    expect(names).toEqual([]);
  });

  it('answers 404 for anything else under /api', async () => {
    const { ctx } = fakeCtx();
    for (const path of ['/api', '/api/', '/api/rooms/ABCD', '/api/room/ABCD/x', '/api/room/']) {
      expect((await handleRequest(request(path), ctx)).status, path).toBe(404);
    }
  });

  it('allows the same host, preview hosts and localhost on any port', () => {
    const allowed = (origin, url) => originAllowed(request('/api/room/ABCD', { origin, url }));
    expect(allowed(HOST, HOST)).toBe(true);
    expect(allowed('https://abc123-martian-map.example.workers.dev', 'https://abc123-martian-map.example.workers.dev')).toBe(true);
    expect(allowed('http://localhost:5173', 'http://localhost:8787')).toBe(true);
    expect(allowed('http://127.0.0.1:4173', HOST)).toBe(true);
    expect(allowed('http://localhost:8787', 'http://localhost:8787')).toBe(true);
    expect(allowed('https://other.workers.dev', HOST)).toBe(false);
  });

  it('does not call the room for a refused request', async () => {
    const getByName = vi.fn();
    await handleRequest(request('/api/room/ABCD', { origin: 'https://evil.example' }), { exports: { Room: { getByName } } });
    expect(getByName).not.toHaveBeenCalled();
  });
});
