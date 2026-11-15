import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, action, boundCodes, codeOf, keyForCode, touchBarActions } from './actions.js';
import { sendKey } from './sendKey.js';

const SRC = join(import.meta.dirname, '..');

/** Keys bound in src that are not player actions, each with the reason. */
const NOT_ACTIONS = {
  '`': 'EventDebug: the developer event panel, only with ?events=debug',
};

const KEY_CODE = /^(Key[A-Z]|Digit\d|Numpad\w+|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|Shift(Left|Right)|Escape|Enter|Tab|Space|Spacebar|Page(Up|Down)|F\d{1,2})$/;

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

/** Every key a handler in src compares against: quoted key codes anywhere, and `key === '<x>'` values. */
function keysInSource() {
  const found = new Map();
  const add = (value, file) => { if (!found.has(value)) found.set(value, file); };
  for (const file of sources(SRC)) {
    if (file.includes(join('src', 'input'))) continue;   // the list itself
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/'([^'\n]{1,12})'/g)) if (KEY_CODE.test(m[1])) add(m[1], file);
    for (const m of text.matchAll(/\b(?:e|ev|event)\.key\s*[!=]==?\s*'([^']+)'/g)) add(m[1], file);
    for (const m of text.matchAll(/\bk\s*[!=]==?\s*'(.)'/g)) add(m[1], file);   // src/present/control.js reads e.key into k
    for (const m of text.matchAll(/TOGGLE_KEY\s*=\s*'([^']+)'/g)) add(m[1], file);
  }
  return found;
}

describe('the action list (#365)', () => {
  const covered = new Set([...boundCodes(), ...ACTIONS.flatMap((a) => a.keys ?? [])]);
  const lower = new Set([...covered].map((k) => k.toLowerCase()));

  it('has an entry for every key a handler in src listens for', () => {
    const missing = [];
    for (const [key, file] of keysInSource()) {
      if (covered.has(key) || lower.has(key.toLowerCase()) || key in NOT_ACTIONS) continue;
      missing.push(`${key} (${file.slice(SRC.length + 1)})`);
    }
    expect(missing).toEqual([]);
  });

  it('gives every action a touch control', () => {
    for (const a of ACTIONS) {
      expect(['button', 'stick', 'gesture', 'dialog', 'browser'], a.id).toContain(a.touch);
      if (a.touch === 'button') expect(a.when, a.id).toBeTruthy();
      else expect(a.note ?? a.touch, a.id).toBeTruthy();
      expect(a.label, a.id).toMatch(/^touch\./);
    }
  });

  it('puts every button action on the bar in at least one situation', () => {
    const shown = new Set();
    const all = { click: 'collect', photo: 'photo', stow: 'stow', case: 'pour' };
    for (const mode of ['walk', 'plan']) for (const stage of ['habitat', 'eva']) for (const inCabin of [false, true]) for (const wristOpen of [false, true]) {
      const { main, more } = touchBarActions({ mode, stage, inCabin, wristOpen, sampling: { actions: all } });
      for (const a of [...main, ...more]) shown.add(a.id);
    }
    const buttons = ACTIONS.filter((a) => a.touch === 'button').map((a) => a.id);
    expect(buttons.filter((id) => !shown.has(id))).toEqual([]);
  });

  it('shows the cabin actions in the cabin and the wrist keys only with the wrist up', () => {
    const ids = (now) => { const r = touchBarActions(now); return [...r.main, ...r.more].map((a) => a.id); };
    const cabin = ids({ mode: 'walk', stage: 'habitat', inCabin: true });
    expect(cabin).toEqual(expect.arrayContaining(['pause', 'mode', 'open-plan', 'end-eva']));
    expect(cabin).not.toContain('photo');
    const wrist = ids({ mode: 'walk', stage: 'eva', wristOpen: true });
    expect(wrist).toEqual(expect.arrayContaining(['wrist', 'wrist-next-page', 'wrist-confirm']));
    expect(wrist).not.toContain('partner');
    expect(ids({ mode: 'plan', stage: 'eva' })).toEqual(['pause']);
  });

  it('shows a sampling button only when its input does something now', () => {
    const ids = (actions) => touchBarActions({ mode: 'walk', stage: 'eva', sampling: { actions } }).main.map((a) => a.id);
    expect(ids({ click: null, photo: null, stow: null, case: null })).not.toContain('sample');
    expect(ids({ click: 'collect', photo: 'photo', stow: null, case: null })).toEqual(expect.arrayContaining(['sample', 'photo']));
    expect(ids({ click: null, photo: null, stow: 'stow', case: null })).toContain('stow');
  });

  it('names codes and keys', () => {
    expect(codeOf('find')).toBe('KeyQ');
    expect(keyForCode('KeyM')).toBe('m');
    expect(keyForCode('Digit0')).toBe('0');
    expect(keyForCode('BracketLeft')).toBe('[');
    expect(() => action('nope')).toThrow();
  });
});

describe('sendKey (#365)', () => {
  class FakeKeyboardEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } }

  it('dispatches the action key with its code and key value', () => {
    const target = { dispatchEvent: vi.fn() };
    sendKey('mode', 'keydown', { target, KeyboardEventClass: FakeKeyboardEvent });
    sendKey('pause', 'keyup', { target, KeyboardEventClass: FakeKeyboardEvent });
    sendKey('wrist-confirm', 'keydown', { target, KeyboardEventClass: FakeKeyboardEvent });
    const [m, p, w] = target.dispatchEvent.mock.calls.map((c) => c[0]);
    expect(m).toMatchObject({ type: 'keydown', code: 'KeyM', key: 'm', bubbles: true });
    expect(p).toMatchObject({ type: 'keyup', code: 'Escape', key: 'Escape' });
    expect(w).toMatchObject({ code: 'Enter', key: 'Enter' });
  });

  it('refuses an action without a key', () => {
    expect(() => sendKey('sample', 'keydown', { target: { dispatchEvent() {} }, KeyboardEventClass: FakeKeyboardEvent })).toThrow();
  });
});
