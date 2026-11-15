import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../i18n/index.js';
import StartScreen from '../components/StartScreen.jsx';
import { presentLabel } from './entry.js';

const ready = { status: 'ready', stage: '', progress: 1, loaded: 12, total: 12 };
const render = () => renderToStaticMarkup(<StartScreen busy={false} notice={null} scene={ready} onStart={() => {}} onSources={() => {}} />);

describe('the start screen\'s Presentation button', () => {
  beforeEach(() => setLanguage('en'));

  it('sits in the action row beside Controls and Sources, in their button style', () => {
    const html = render();
    const row = html.match(/<div class="start-actions">[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? html;
    expect(row).toMatch(/<a class="ui-button ghost start-present" href="\?present=1">Presentation<\/a>/);
    expect(row.indexOf('start-present')).toBeGreaterThan(row.indexOf('Sources'));
  });

  it('is a link, so keyboard and touch reach it, and reads in the interface language', () => {
    setLanguage('es');
    expect(presentLabel()).toBe('Presentación');
    expect(render()).toContain('>Presentación</a>');
  });
});
