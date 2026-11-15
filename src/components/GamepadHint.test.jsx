import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import GamepadHint from './GamepadHint.jsx';

// React Server rendering never runs effects, so this checks the pre-use state of the component (#103).
const render = (engine) => renderToStaticMarkup(<GamepadHint engine={engine} />);

describe('GamepadHint', () => {
  it('renders nothing before a gamepad has been used', () => {
    expect(render(null)).toBe('');
    expect(render(undefined)).toBe('');
    expect(render({})).toBe('');
  });

  it('tolerates a missing or malformed subscription without throwing', () => {
    expect(() => render({ subscribeGamepad: true })).not.toThrow();
    expect(render({ subscribeGamepad: true })).toBe('');
    expect(render({ subscribeGamepad: () => {} })).toBe('');
  });

  it('does not subscribe while server rendering', () => {
    const subscribeGamepad = vi.fn(() => () => {});
    expect(render({ subscribeGamepad })).toBe('');
    expect(subscribeGamepad).not.toHaveBeenCalled();
  });
});
