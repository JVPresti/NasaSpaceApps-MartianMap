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

  // The cards no longer say when each event starts (#399); what happens still follows the first sortie's mission.
  it("describes the hazards as the first sortie's mission runs them, without a When row (#265, N5, #399)", () => {
    const text = render({ initialTab: 'hazards' }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).not.toContain('When');
    expect(text).not.toContain('After the sample at the science stop');
    expect(text).not.toContain('15 s after the dust storm');
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

    it('names the task at its place in every state of the walk: ahead after a re-plan, reached, skipped by an event', () => {
      samples();
      const walking = (route) => useMissionStore.setState((s) => ({ route: { ...s.route, ...route } }));
      const why = (html) => html.match(/<small class="table-stop-why">([^<]*)/g)?.map((m) => m.replace(/<[^>]+>/g, '')) ?? [];
      walking({ path: [[-5, -20], [-11, -50]] });   // the path left after a re-plan: no longer the planned profile's
      expect(why(render({ initialTab: 'route', waypoints: planned, evaBegun: true }))).toEqual(['For 1 rock sample · 8 min work']);
      walking({ visited: ['HAB', planned[1].name] });
      expect(why(render({ initialTab: 'route', waypoints: planned, evaBegun: true }))).toEqual(['For 1 rock sample']);
      walking({ visited: ['HAB'], skipped: [planned[1].name], shelter: { id: 'HAB', name: 'HAB · habitat airlock' } });
      const event = render({ initialTab: 'route', waypoints: planned, evaBegun: true });
      expect(event).toMatch(/<li class="dropped"><code>1<\/code><span class="table-stop-name">Bright Angel<\/span><span class="table-stop-dist">[^<]+<\/span><small class="table-stop-why">For 1 rock sample<\/small><\/li>/);
    });

    it('blanks the figures and asks for a task when the list is empty, on the Route and the Suit step', () => {
      useMissionStore.setState((s) => ({
        needs: { ...s.needs, objective: 'samples', tasks: [] },
        route: { ...s.route, path: null, waypoints: [planned[0]], distanceM: null, climbM: null, steepestSlopeDeg: null, etaSec: null, totals: null, planReasons: [{ code: 'no-tasks' }] },
      }));
      const failed = { ...planner, status: 'error', error: 'No route found' };
      const route = render({ initialTab: 'route', waypoints: [planned[0]], planner: failed });
      expect(route).toContain('<p class="table-note tone-warning">No sampling task yet: add one to plan a route.</p>');
      expect(route).not.toContain('No route found');
      expect(route.match(/<b>—<\/b>/g)).toHaveLength(4);
      const suit = render({ initialTab: 'suit', waypoints: [planned[0]], planner: failed });
      expect(suit).toContain('No sampling task yet: add one to plan a route.');
      expect(suit).not.toContain('No route found');
    });

    it('keeps the stop list, and no task control, for the other goals', () => {
      const html = render({ initialTab: 'route' });
      expect(html).toMatch(/<p class="table-label">Stops<\/p>/);
      expect(html).not.toContain('data-task-add');
      expect(html).not.toContain('class="table-map picking"');
    });
  });
});
