import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import StartScreen from './StartScreen.jsx';

const noop = () => {};

function render(props = {}) {
  return renderToStaticMarkup(
    <StartScreen busy={false} notice={null} onStart={noop} onSources={noop} {...props} />,
  );
}

/** The main action, so a test can read its label and its disabled state without depending on attribute order. */
function primary(html) {
  return html.match(/<button[^>]*class="start-primary"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
}

const loading = { status: 'loading', stage: 'ui.starting.the.engine', progress: 0.42, loaded: 5, total: 12 };

beforeEach(() => setLanguage('en'));

describe('StartScreen while the scene loads (#266)', () => {
  it('shows the intro at once with the progress on the main action, which stays unavailable', () => {
    const html = render({ scene: loading });
    const button = primary(html);

    expect(html).toContain('Cheyava Falls');
    expect(button).toContain('disabled');
    expect(button).toContain('Loading the scene… 42%');
    expect(button).toContain('aria-busy="true"');
    expect(html).toContain('start-progress');
    expect(html).toContain('scaleX(0.42)');
    expect(html).toContain('Starting the engine…');
  });

  it('keeps Controls and Sources usable during the load', () => {
    const html = render({ scene: loading });

    expect(html).toContain('>Controls</button>');
    expect(html).toContain('>Sources</button>');
    // Only the main action is disabled: both secondary buttons can be pressed and read.
    expect(html.match(/disabled/g)).toHaveLength(1);
  });

  it('enters the habitat once the scene is ready', () => {
    const html = render({ scene: { ...loading, status: 'ready', progress: 1 } });
    const button = primary(html);

    expect(button).not.toContain('disabled');
    expect(button).toContain('Enter the habitat');
    expect(html).not.toContain('start-progress');
    expect(html).not.toContain('start-status');
    expect(html).not.toContain('Starting the engine…');
  });

  it('keeps the busy label disabled after a start until the browser answers', () => {
    const html = render({ busy: true, scene: { ...loading, status: 'ready', progress: 1 } });
    const button = primary(html);

    expect(button).toContain('disabled');
    expect(button).toContain('Capturing the mouse…');   // the start click asks for the mouse: walking in the habitat needs it
    expect(primary(render({ busy: true, freeLook: true, scene: { ...loading, status: 'ready', progress: 1 } }))).toContain('Opening…');
  });

  it('offers drag-to-look after a refused capture', () => {
    const html = render({ lockFailed: true, onStartWithoutCapture: () => {}, scene: { ...loading, status: 'ready', progress: 1 } });
    expect(html).toContain('without mouse capture');
  });

  it('treats a missing scene as ready, for a caller that already has the engine', () => {
    const button = primary(render());

    expect(button).not.toContain('disabled');
    expect(button).toContain('Enter the habitat');
  });
});
