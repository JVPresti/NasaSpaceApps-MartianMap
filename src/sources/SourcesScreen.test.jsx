import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcesScreen, wrapFocus } from './SourcesScreen.jsx';
import { groupEntries, linkHost } from './credits.js';

const credits = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/data/credits.json', import.meta.url)), 'utf8'));
const html = renderToStaticMarkup(<SourcesScreen credits={credits} status="ready" onClose={() => {}} />);

// React escapes text and attributes; match against the same escaping.
const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

/** The markup of one entry card. */
function card(id) {
  const start = html.indexOf(`data-entry="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</li>', start));
}

describe('SourcesScreen', () => {
  it('renders every entry in credits.json with its name, provider, credit line, licence and link', () => {
    expect(credits.entries.length).toBeGreaterThan(0);
    for (const entry of credits.entries) {
      const markup = card(entry.id);
      expect(markup, entry.id).toContain(escape(entry.name));
      expect(markup, entry.id).toContain(escape(entry.provider));
      expect(markup, entry.id).toContain(escape(entry.credit_line));
      expect(markup, entry.id).toContain(escape(entry.license));
      expect(markup, entry.id).toContain(`href="${escape(entry.url)}" target="_blank" rel="noopener noreferrer"`);
    }
  });

  it('renders each entry once', () => {
    expect(html.match(/data-entry="/g)).toHaveLength(credits.entries.length);
  });

  it('renders the real, artistic and modelled statement before the list', () => {
    const first = html.indexOf('data-entry="');
    for (const [key, label] of [['real', 'Real'], ['artistic', 'Artistic'], ['modelled', 'Modelled']]) {
      const text = credits.statement[key];
      const at = html.indexOf(escape(text.slice(1)));
      expect(at, key).toBeGreaterThan(-1);
      expect(at, key).toBeLessThan(first);
      expect(html).toContain(`<dt>${label}</dt>`);
    }
  });

  it('groups entries under the kinds from credits.json', () => {
    for (const group of groupEntries(credits)) {
      expect(html).toContain(escape(group.label));
    }
    expect(groupEntries(credits).flatMap((g) => g.entries)).toHaveLength(credits.entries.length);
  });

  it('opens every link in a new tab without an opener', () => {
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(credits.entries.length);
    for (const a of anchors) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
    }
  });

  it('has a visible close button', () => {
    expect(html).toMatch(/<button[^>]*aria-label="Close sources"[^>]*>Close/);
  });

  it('shows a loading line before credits.json arrives', () => {
    const loading = renderToStaticMarkup(<SourcesScreen credits={null} status="loading" onClose={() => {}} />);
    expect(loading).toContain('Loading sources');
  });
});

describe('credits helpers', () => {
  it('puts entries with an unknown kind in an other group', () => {
    const groups = groupEntries({ kinds: [{ id: 'a', label: 'A' }], entries: [{ id: '1', kind: 'a' }, { id: '2', kind: 'zzz' }] });
    expect(groups.map((g) => g.id)).toEqual(['a', 'other']);
  });

  it('shortens a link to its host', () => {
    expect(linkHost('https://www.uahirise.org/dtm/x')).toBe('uahirise.org');
    expect(linkHost('not a url')).toBe('not a url');
  });
});

describe('wrapFocus', () => {
  // No DOM in this test environment: stand-ins with only what wrapFocus reads.
  const button = (name) => ({ name, focus: vi.fn() });
  const setup = (activeName) => {
    const items = [button('close'), button('link-1'), button('link-2')];
    const dialog = { querySelectorAll: () => items, contains: (el) => items.includes(el) };
    const active = items.find((i) => i.name === activeName) ?? { name: 'body' };
    vi.stubGlobal('document', { activeElement: active });
    return { items, dialog };
  };
  const tab = (shiftKey) => ({ shiftKey, preventDefault: vi.fn() });

  afterEach(() => vi.unstubAllGlobals());

  it('wraps Shift+Tab on the first item to the last', () => {
    const { items, dialog } = setup('close');
    const event = tab(true);
    wrapFocus(event, dialog);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(items[2].focus).toHaveBeenCalled();
  });

  it('wraps Tab on the last item to the first', () => {
    const { items, dialog } = setup('link-2');
    const event = tab(false);
    wrapFocus(event, dialog);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(items[0].focus).toHaveBeenCalled();
  });

  it('leaves Tab in the middle to the browser', () => {
    const { items, dialog } = setup('link-1');
    const event = tab(false);
    wrapFocus(event, dialog);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(items.some((i) => i.focus.mock.calls.length)).toBe(false);
  });

  it('pulls focus back in when it is outside the dialog', () => {
    const { items, dialog } = setup('nowhere');
    const event = tab(false);
    wrapFocus(event, dialog);
    expect(items[0].focus).toHaveBeenCalled();
  });
});
