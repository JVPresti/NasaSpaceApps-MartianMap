import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetStore, useMissionStore } from '../state/store.js';
import MissionTable from './MissionTable.jsx';

// Server rendering with the store's state: the initial one (no route yet, the planner still loading) unless a test sets
// another. Zustand's server render otherwise always uses the creation-time state.
vi.mock('../state/store.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, useMissionStore: Object.assign((selector) => selector(original.useMissionStore.getState()), original.useMissionStore) };
});

afterEach(() => resetStore());

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
    expect(text).toContain('After the sample at the science stop');
    expect(text).toContain('15 s after the dust storm');
    expect(text).not.toContain('45 s into the EVA');
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

  describe('Collect samples (#352)', () => {
    const tasks = [{ id: 't1', what: 'rock', count: 1, place: { type: 'stop', stopId: 'bright-angel' } }];
    const path = [[0, 0], [-11, -50]];
    const planned = [{ name: 'HAB', x: 0, z: 0 }, { name: 'WP3 · Bright Angel outcrop', label: 'Bright Angel', x: -11, z: -50, workSec: 480, stopId: 'bright-angel', place: 'bright-angel', tasks: ['t1'], required: true }];
    const samples = () => useMissionStore.setState((s) => ({
      needs: { ...s.needs, objective: 'samples', tasks },
      route: {
        ...s.route, path, waypoints: planned, profiles: { fastest: { ok: true, path } }, legs: [{ distanceM: 51, workSec: 480 }],
        stops: [{ id: 'bright-angel', name: 'Bright Angel', waypoint: planned[1].name, place: 'bright-angel', tasks: ['t1'], required: true }],
        tasks: [{ id: 't1', what: 'rock', count: 1, kept: true, drop: null, workSec: 480 }],
      },
    }));

    it('puts the task list in the place of the stop list until the EVA begins', () => {
      samples();
      const html = render({ initialTab: 'route', waypoints: planned });
      expect(html).toContain('data-task-add=""');
      expect(html).toContain('data-task-where="t1"');
      expect(html).not.toMatch(/<p class="table-label">Stops<\/p>/);
    });

    it('shows the stop list again once the EVA has begun, each task place saying what it is for', () => {
      samples();
      const html = render({ initialTab: 'route', waypoints: planned, evaBegun: true });
      expect(html).not.toContain('data-task-add');
      expect(html).toMatch(/<p class="table-label">Stops<\/p>/);
      expect(html).toContain('For 1 rock sample · 8 min work');
    });

    it('keeps the stop list, and no task control, for the other goals', () => {
      const html = render({ initialTab: 'route' });
      expect(html).toMatch(/<p class="table-label">Stops<\/p>/);
      expect(html).not.toContain('data-task-add');
      expect(html).not.toContain('class="table-map picking"');
    });
  });
});
