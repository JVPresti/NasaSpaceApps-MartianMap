import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MissionTable from './MissionTable.jsx';

// Server rendering with the store's initial state: no route yet, the planner still loading.
const planner = { status: 'loading', error: null, replan: () => {} };
const waypoints = [{ name: 'HAB', x: 0, z: 0 }, { name: 'Sortie', x: 40, z: 30 }];
const render = (props = {}) => renderToStaticMarkup(<MissionTable planner={planner} waypoints={waypoints} {...props} />);
const selectedTab = (html) => html.match(/id="table-tab-(\w+)"[^>]*aria-selected="true"/)?.[1];

describe('mission table', () => {
  it('opens on the Site step by default', () => {
    expect(selectedTab(render())).toBe('site');
  });

  it('opens on the step it is given, for the habitat table\'s Open plan', () => {
    const html = render({ initialTab: 'route' });
    expect(selectedTab(html)).toBe('route');
    expect(html).toContain('table-body-route');
  });

  it('falls back to the Site step for an unknown step', () => {
    expect(selectedTab(render({ initialTab: 'nowhere' }))).toBe('site');
  });

  it('times the hazards from the first sortie\'s mission, in seconds under two minutes (#265)', () => {
    const text = render({ initialTab: 'hazards' }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('75 s into the EVA');
    expect(text).toContain('95 s into the EVA');
    expect(text).toContain('in 30 s');   // the storm ramp, compressed for the first sortie
    expect(text).toContain('Shortened to 60 s for this EVA');
  });
});
