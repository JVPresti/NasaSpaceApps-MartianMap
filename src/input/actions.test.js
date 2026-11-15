import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ACTIONS, action, codeOf, keyForCode, touchBarActions } from './actions.js';
import { holdKey, sendKey } from './sendKey.js';

const SRC = join(import.meta.dirname, '..');

/**
 * Keys a file listens for that are not player actions, by `file:key`, each with the reason. Reviewed by hand: adding a
 * line here is a decision, not a fix for a failing test.
 */
const NOT_ACTIONS = {
  'src/events/EventDebug.jsx:`': 'the developer event panel, only in development or with ?debug=1',
  'src/events/EventDebug.jsx:Escape': 'closes the developer event panel, which has its own toggle button',
  'src/present/control.js:F5': 'the presentation passes it to the browser: reload',
  'src/present/control.js:F11': 'the presentation passes it to the browser; a phone has no F11, and Walk has Full screen in the More menu',
  'src/present/control.js:F12': 'the presentation passes it to the browser: developer tools, not needed on a phone',
};

/**
 * Actions whose touch control has not landed yet, by id, each with the reason. Empty this as each control lands; the
 * test fails if an entry here has its control already, so the list cannot go stale.
 */
const PENDING = {
  'present-next': 'tap and swipe arrive with #373; the touch row in the PR checklist tracks it',
  'present-back': 'swipe arrives with #373; the on-screen Back button follows once it merges',
  'present-exit': 'the on-screen Exit button follows once #373 merges',
  'present-language': 'the on-screen Language button follows once #373 merges',
};

const KEY_CODE = /^(Key[A-Z]|Digit\d|Numpad\w+|Arrow(Up|Down|Left|Right)|Bracket(Left|Right)|Shift(Left|Right)|Escape|Enter|Tab|Space|Spacebar|Page(Up|Down)|F\d{1,2})$/;
const ROOT = join(SRC, '..');
const rel = (path) => relative(ROOT, path).split(sep).join('/');

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(js|jsx)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

/** Every (file, key) pair a handler in src compares against: quoted key codes, and `e.key === '<x>'` values. */
function keysInSource() {
  const pairs = new Set();
  for (const file of sources(SRC)) {
    if (file.includes(join('src', 'input'))) continue;   // the list itself
    const text = readFileSync(file, 'utf8'), name = rel(file);
    for (const m of text.matchAll(/'([^'\n]{1,12})'/g)) if (KEY_CODE.test(m[1])) pairs.add(`${name}:${m[1]}`);
    for (const m of text.matchAll(/\b(?:e|ev|event)\.key\s*[!=]==?\s*'([^']+)'/g)) pairs.add(`${name}:${m[1]}`);
    for (const m of text.matchAll(/\bk\s*[!=]==?\s*'(.)'/g)) pairs.add(`${name}:${m[1]}`);   // src/present/control.js reads e.key into k
    for (const m of text.matchAll(/TOGGLE_KEY\s*=\s*'([^']+)'/g)) pairs.add(`${name}:${m[1]}`);
  }
  return pairs;
}

/** Source text without comments, so a control must be real code, never a line that only talks about it. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** True when an action of `file` binds `key`, as a code or a key value (a letter in either case). */
function bound(file, key) {
  return ACTIONS.some((a) => a.files.includes(file)
    && [...a.codes, ...(a.keys ?? [])].some((k) => k === key || k.toLowerCase() === key.toLowerCase()));
}

describe('the action list (#365)', () => {
  it('pairs every key a file listens for with an action of that file', () => {
    const pairs = keysInSource();
    expect(pairs.size).toBeGreaterThan(20);   // the scan finds the handlers at all
    const missing = [...pairs].filter((p) => {
      const i = p.lastIndexOf(':');
      return !bound(p.slice(0, i), p.slice(i + 1)) && !(p in NOT_ACTIONS);
    });
    expect(missing).toEqual([]);
  });

  it('names only files that exist, and every exemption still matches a key in its file', () => {
    for (const a of ACTIONS) for (const f of a.files) expect(existsSync(join(ROOT, f)), `${a.id}: ${f}`).toBe(true);
    const pairs = keysInSource();
    for (const p of Object.keys(NOT_ACTIONS)) expect(pairs.has(p), p).toBe(true);
  });

  it('gives every action a touch control that exists, or a pending reason', () => {
    for (const a of ACTIONS) {
      expect(['button', 'stick', 'gesture', 'dialog'], a.id).toContain(a.touch);
      expect(a.label, a.id).toMatch(/^touch\./);
      if (a.touch === 'button') {
        expect(a.when, a.id).toBeTruthy();
        continue;
      }
      expect(a.control?.file && a.control?.has, `${a.id} names no control`).toBeTruthy();
      const path = join(ROOT, a.control.file);
      const has = existsSync(path) && code(readFileSync(path, 'utf8')).includes(a.control.has);
      if (a.id in PENDING) expect(has, `${a.id} is listed as pending but its control exists: remove it from PENDING`).toBe(false);
      else expect(has, `${a.id}: ${a.control.file} has no "${a.control.has}"`).toBe(true);
    }
    for (const id of Object.keys(PENDING)) expect(() => action(id)).not.toThrow();
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
    expect(ids({ mode: 'walk', stage: 'egress', inCabin: true })).toEqual(['pause']);   // the airlock cycle
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

describe('holdKey (#365)', () => {
  it('sends one keydown per press and one keyup per release, however many release events arrive', () => {
    const sent = [];
    const h = holdKey((id, type) => sent.push(`${type}:${id}`));
    expect(h.release()).toBe(false);
    expect(h.press('find')).toBe(true);
    expect(h.press('find')).toBe(false);   // a second pointerdown while held
    expect(h.release()).toBe(true);        // pointerup
    expect(h.release()).toBe(false);       // then pointercancel
    expect(sent).toEqual(['keydown:find', 'keyup:find']);
  });
});

describe('the control check reads code, not comments (#365)', () => {
  it('ignores a control that only a comment mentions', () => {
    expect(code('// onClick={onClose}\nconst a = 1;')).not.toContain('onClick={onClose}');
    expect(code('/* onPointerUp={up} */ x')).not.toContain('onPointerUp');
    expect(code('{/* id={`table-tab-${item.id}`} */}<b />')).not.toContain('table-tab-');
    expect(code("fetch('http://x/y'); <a onClick={go} />")).toContain('onClick={go}');
  });
});
