import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PauseMenu from './PauseMenu.jsx';

const PROPS = {
  view: 'menu',
  mode: 'walk',
  busy: false,
  notice: null,
  focusToken: 0,
  quality: null,
  qualityBusy: false,
  qualityError: null,
  onResume: () => {},
  onRestartRequest: () => {},
  onRestartConfirm: () => {},
  onControls: () => {},
  onSources: () => {},
  onMenu: () => {},
  onQuality: () => {},
  onModeChange: () => {},
  onCancel: () => {},
};

// The dialog marks one button as its primary action; Modal focuses it, and PauseMenu focuses it again
// whenever it becomes usable, so Enter always has a button to press.
const primary = (html) => html.match(/<button[^>]*data-autofocus="true"[^>]*>([^<]*)<\/button>/);

describe('PauseMenu primary action', () => {
  it('marks Resume in the pause menu', () => {
    const match = primary(renderToStaticMarkup(<PauseMenu {...PROPS} />));
    expect(match?.[1]).toBe('Resume');
    expect(match?.[0]).not.toContain('disabled');
  });

  it('disables Resume while the browser answers a resume, so it is focused again when busy ends', () => {
    const match = primary(renderToStaticMarkup(<PauseMenu {...PROPS} busy />));
    expect(match?.[1]).toBe('Capturing the mouse…');
    expect(match?.[0]).toContain('disabled');
  });

  it('marks Back to pause menu in the controls help', () => {
    const match = primary(renderToStaticMarkup(<PauseMenu {...PROPS} view="controls" />));
    expect(match?.[1]).toBe('Back to pause menu');
  });

  it('marks Cancel in the restart confirmation, never the destructive action', () => {
    const match = primary(renderToStaticMarkup(<PauseMenu {...PROPS} view="restart" />));
    expect(match?.[1]).toBe('Cancel');
  });
});
