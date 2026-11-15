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

  it('times the hazards from the first sortie\'s mission as its triggers allow (#265, N5)', () => {
    const text = render({ initialTab: 'hazards' }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('Once your sample at the stop is secured, or after 90 s there; by 4 min into the EVA at the latest');
    expect(text).toContain('15 s after the dust storm, or sooner as you near the airlock; by 5 min into the EVA at the latest');
    expect(text).toContain('in 30 s');   // the storm ramp, compressed for the first sortie
    expect(text).toContain('Shortened to 60 s for this EVA');
    expect(text).toContain('The storm ends within 25 m of the airlock');
    expect(text).toContain('then it falls back to 10.0 µGy/h');
  });

  it('says the events are set once the EVA is under way (P2)', () => {
    const text = render({ initialTab: 'hazards', evaBegun: true }).replace(/<[^>]+>/g, ' ');
    expect(text).toContain('These are the events of this run, set before the EVA began.');
    expect(text).not.toContain('Choose the events');
  });

  it('shows the suit outside and the EVA under way on the Suit step (P2)', () => {
    const text = render({ initialTab: 'suit', evaBegun: true }).replace(/<[^>]+>/g, ' ');
    expect(text).toContain('Now, outside');
    expect(text).toContain('EVA under way');
    expect(text).not.toContain('No-go');
  });
});
