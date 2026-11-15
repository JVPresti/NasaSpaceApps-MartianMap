import { describe, expect, it } from 'vitest';
import { ROOM_CODE_PATTERN as LINK_PATTERN } from '../onlineLink.js';
import {
  BACKOFF_MS, CLOSE, MAX_MESSAGE_BYTES, MSG, ROOM_CODE_PATTERN, SEATS, decode, encode, normalizeRoomCode, utf8ByteLength, validate,
} from './protocol.js';

describe('room codes', () => {
  it('accepts four letters without I and O, in any case', () => {
    expect(normalizeRoomCode('abcd')).toBe('ABCD');
    expect(normalizeRoomCode(' TeSt ')).toBe('TEST');
    expect(normalizeRoomCode('ZZZZ')).toBe('ZZZZ');
    for (const bad of ['ABC', 'ABCDE', 'ABCI', 'OABC', 'AB1D', 'AB D', '', null, 1234, 'ÁBCD']) expect(normalizeRoomCode(bad), String(bad)).toBeNull();
  });

  it('has exactly 24 letters, so 331,776 codes', () => {
    const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((c) => ROOM_CODE_PATTERN.test(c.repeat(4)));
    expect(letters).toHaveLength(24);
    expect(letters).not.toContain('I');
    expect(letters).not.toContain('O');
  });

  it('matches the copy in src/onlineLink.js, which may not import src/net', () => {
    expect(LINK_PATTERN.source).toBe(ROOM_CODE_PATTERN.source);
    expect(LINK_PATTERN.flags).toBe(ROOM_CODE_PATTERN.flags);
  });
});

describe('constants', () => {
  it('match section 9.4', () => {
    expect(Object.values(MSG).sort()).toEqual(['case', 'crew', 'go', 'hello', 'mk', 'p', 'rt', 'smp', 'start', 't', 'tel', 'welcome']);
    expect(SEATS).toEqual({ surface: 4, habitat: 2 });
    expect(CLOSE).toMatchObject({ POLICY: 1008, TOO_BIG: 1009, ROOM_FULL: 4001, REPLACED: 4002, HELLO_FIRST: 4003 });
    expect(MAX_MESSAGE_BYTES).toBe(4096);
    expect(BACKOFF_MS).toEqual([500, 1000, 2000, 4000, 8000]);
  });
});

describe('encode and decode', () => {
  it('round-trips objects and rejects anything without a string type', () => {
    expect(decode(encode({ type: 't', c: 1 }))).toEqual({ type: 't', c: 1 });
    for (const bad of ['ping', '{', '[]', 'null', '{"type":3}', '"x"', undefined]) expect(decode(bad)).toBeNull();
  });

  it('counts UTF-8 bytes', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('🚀')).toBe(4);
    expect(utf8ByteLength('a🚀é')).toBe(new TextEncoder().encode('a🚀é').length);
  });
});

const entry = { id: 'a1', name: 'Ana', color: 0, role: 'surface', joinedAt: 1 };

describe('validators', () => {
  it('hello: needs version, id, name and role; colour optional; cleans the name', () => {
    const ok = validate({ type: 'hello', v: 1, id: 'a1', name: '  Ana\u0007 ', role: 'surface', color: 2, extra: 1 });
    expect(ok).toEqual({ type: 'hello', v: 1, id: 'a1', name: 'Ana', role: 'surface', color: 2 });
    expect(validate({ type: 'hello', v: 1, id: 'a1', name: 'A', role: 'habitat' })).toEqual({ type: 'hello', v: 1, id: 'a1', name: 'A', role: 'habitat' });
    for (const bad of [
      { v: 2, id: 'a', name: 'A', role: 'surface' },
      { v: 1, id: 'a b', name: 'A', role: 'surface' },
      { v: 1, id: 'x'.repeat(65), name: 'A', role: 'surface' },
      { v: 1, id: 'a', name: ' ', role: 'surface' },
      { v: 1, id: 'a', name: 'A', role: 'pilot' },
      { v: 1, id: 'a', name: 'A', role: 'surface', color: 4 },
    ]) expect(validate({ type: 'hello', ...bad }), JSON.stringify(bad)).toBeNull();
    expect(validate({ type: 'hello', v: 1, id: 'a', name: 'x'.repeat(50), role: 'surface' }).name).toHaveLength(32);
  });

  it('welcome and crew', () => {
    const welcome = { type: 'welcome', you: { id: 'a1', color: 0, role: 'surface' }, crew: [entry], startedAt: null, seed: null, now: 5, markers: [], samples: [], caseHolder: null, route: null };
    expect(validate(welcome)).toEqual(welcome);
    expect(validate({ ...welcome, seed: -1 })).toBeNull();
    expect(validate({ ...welcome, crew: [{ ...entry, color: null }] })).toBeNull();
    expect(validate({ type: 'crew', op: 'join', p: entry })).toEqual({ type: 'crew', op: 'join', p: entry });
    expect(validate({ type: 'crew', op: 'leave', p: { ...entry, role: 'habitat', color: null } })).not.toBeNull();
    expect(validate({ type: 'crew', op: 'kick', p: entry })).toBeNull();
  });

  it('start and t, both directions', () => {
    expect(validate({ type: 'start', junk: 1 })).toEqual({ type: 'start' });
    expect(validate({ type: 'start', startedAt: 10, seed: 4294967295 })).toEqual({ type: 'start', startedAt: 10, seed: 4294967295 });
    expect(validate({ type: 'start', startedAt: 10 })).toBeNull();
    expect(validate({ type: 't', c: 1.5 })).toEqual({ type: 't', c: 1.5 });
    expect(validate({ type: 't', c: 1, s: 2 })).toEqual({ type: 't', c: 1, s: 2 });
    expect(validate({ type: 't', c: Infinity })).toBeNull();
  });

  it('reserved types for M2 to M4', () => {
    expect(validate({ type: 'p', x: 1, z: 2, h: 3, pt: 0, a: 'walk', hp: 0, ct: 9 })).toEqual({ type: 'p', x: 1, z: 2, h: 3, pt: 0, a: 'walk', hp: 0, ct: 9 });
    expect(validate({ type: 'p', x: 1, z: 2, h: 3, pt: 0, a: 1, hp: 0, ct: 9, id: 'b' }).id).toBe('b');
    expect(validate({ type: 'p', x: 1, z: 2, h: 3, pt: 0, a: 1, hp: 0 })).toBeNull();
    expect(validate({ type: 'tel', o2: 80, bat: 70 })).toEqual({ type: 'tel', o2: 80, bat: 70 });
    expect(validate({ type: 'mk', cid: 'c1', kind: 'find', x: 1, z: 2, label: 'x' })).toEqual({ type: 'mk', cid: 'c1', kind: 'find', x: 1, z: 2, label: 'x' });
    expect(validate({ type: 'mk', cid: 'c1', kind: 'find', x: 1, z: 2, id: 3, author: 'a', at: 5 })).toMatchObject({ id: 3, author: 'a', at: 5, label: '' });
    expect(validate({ type: 'mk', cid: 'c1', kind: 'rock', x: 1, z: 2 })).toBeNull();
    expect(validate({ type: 'smp', sid: 's1' })).toEqual({ type: 'smp', sid: 's1' });
    expect(validate({ type: 'smp', sid: 's1', by: 'a', at: 1, ok: false })).toEqual({ type: 'smp', sid: 's1', by: 'a', at: 1, ok: false });
    expect(validate({ type: 'case', holder: null })).toEqual({ type: 'case', holder: null });
    expect(validate({ type: 'case' })).toBeNull();
    expect(validate({ type: 'rt', pts: [[1, 2], [3, -4]] })).toEqual({ type: 'rt', pts: [[1, 2], [3, -4]] });
    expect(validate({ type: 'rt', pts: Array.from({ length: 201 }, () => [0, 0]) })).toBeNull();
    expect(validate({ type: 'rt', pts: [[1.5, 2]] })).toBeNull();
    expect(validate({ type: 'go', go: false, why: 'dust' })).toEqual({ type: 'go', go: false, why: 'dust' });
    expect(validate({ type: 'go', go: 'yes' })).toBeNull();
  });

  it('unknown types are null', () => {
    expect(validate({ type: 'nope' })).toBeNull();
    expect(validate({ type: 'toString' })).toBeNull();
    expect(validate(null)).toBeNull();
  });
});
