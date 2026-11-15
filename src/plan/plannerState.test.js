import { describe, expect, it } from 'vitest';
import { DEFAULT_NEEDS } from '../sim/missionNeeds.js';
import {
  afterNeedsPlan, afterWaypointPlan, createLatestOnly, decidePlan, emptyPlannerMemory, needsPlanKey, needsPlanPending,
  plansFromNeeds,
} from './plannerState.js';

const SITE = { start: { name: 'HAB', x: 0, z: 0 }, stops: [{ id: 'sortie' }] };
const needs = (patch = {}) => ({ ...DEFAULT_NEEDS, locked: false, ...patch });
const input = (patch = {}) => ({
  enabled: true, ready: true, fromNeeds: true, needs: needs(), profile: 'fastest', nonce: 0, mastId: '',
  waypointsKey: 'HAB:535:574|S1:493:539', waypointCount: 2, findsRouteKey: null, ...patch,
});

describe('where the route comes from', () => {
  it('plans from the needs before the EVA, with a site to choose from; the waypoints once the needs are locked', () => {
    expect(plansFromNeeds(needs(), SITE)).toBe(true);
    expect(plansFromNeeds(needs({ locked: true }), SITE)).toBe(false);
    expect(plansFromNeeds(needs(), { ...SITE, stops: [] })).toBe(false);
    expect(plansFromNeeds(needs(), null)).toBe(false);
  });
});

describe('planning from the needs', () => {
  it('plans for needs the table has not planned, and nothing while disabled or loading', () => {
    const memory = emptyPlannerMemory();
    expect(decidePlan(input(), memory)).toMatchObject({ action: 'plan-needs', key: needsPlanKey({ needs: needs(), profile: 'fastest', nonce: 0, mastId: '' }) });
    expect(decidePlan(input({ enabled: false }), memory).action).toBe('none');
    expect(decidePlan(input({ ready: false }), memory).action).toBe('none');
  });

  it('plans again for a new need, a new profile, Re-plan or the mast, and not for the plan on the table', () => {
    const key = needsPlanKey({ needs: needs(), profile: 'fastest', nonce: 0, mastId: '' });
    const memory = afterNeedsPlan(emptyPlannerMemory(), { key, waypointsKey: input().waypointsKey, nonce: 0, mastId: '' });
    expect(decidePlan(input(), memory).action).toBe('none');
    expect(decidePlan(input({ needs: needs({ timeMin: 45 }) }), memory).action).toBe('plan-needs');
    expect(decidePlan(input({ profile: 'gentlest' }), memory).action).toBe('plan-needs');
    expect(decidePlan(input({ nonce: 1 }), memory).action).toBe('plan-needs');
    expect(decidePlan(input({ mastId: '544.9,-,581.5' }), memory).action).toBe('plan-needs');
  });

  it('puts the planned stops back when something else wrote route.waypoints', () => {
    const key = needsPlanKey({ needs: needs(), profile: 'fastest', nonce: 0, mastId: '' });
    const memory = afterNeedsPlan(emptyPlannerMemory(), { key, waypointsKey: input().waypointsKey, nonce: 0, mastId: '' });
    expect(decidePlan(input({ waypointsKey: 'HAB:520:600|WP1 · channel floor:330:300', waypointCount: 5 }), memory).action).toBe('restore-waypoints');
  });

  it('is pending from the moment the needs change, until their plan is on the table (N15)', () => {
    const key = needsPlanKey({ needs: needs(), profile: 'fastest', nonce: 0, mastId: '' });
    const changed = needsPlanKey({ needs: needs({ risk: 'bold' }), profile: 'fastest', nonce: 0, mastId: '' });
    expect(needsPlanPending({ fromNeeds: true, key: changed }, { needsKey: key })).toBe(true);
    expect(needsPlanPending({ fromNeeds: true, key }, { needsKey: key })).toBe(false);
    expect(needsPlanPending({ fromNeeds: false, key: changed }, { needsKey: key })).toBe(false);   // EVA under way
  });
});

describe('planning the waypoints once the EVA has begun', () => {
  const locked = (patch = {}) => input({ fromNeeds: false, needs: needs({ locked: true }), ...patch });
  const key = needsPlanKey({ needs: needs(), profile: 'fastest', nonce: 0, mastId: '' });
  const atLock = afterNeedsPlan(emptyPlannerMemory(), { key, waypointsKey: input().waypointsKey, nonce: 0, mastId: '' });

  it('plans nothing when the EVA begins: the needs plan on the table is already the waypoints\' route', () => {
    expect(decidePlan(locked(), atLock).action).toBe('none');
  });

  it('refreshes only the comparison when the mast arrives for the route on the table', () => {
    const decision = decidePlan(locked({ mastId: '544.9,-,581.5' }), atLock);
    expect(decision).toMatchObject({ action: 'refresh-mast', planId: `0|${input().waypointsKey}` });
    expect(decision.memory.lastMast).toBe('544.9,-,581.5');
    expect(decidePlan(locked({ mastId: '544.9,-,581.5' }), decision.memory).action).toBe('none');
  });

  it('takes the route a find already re-planned in Walk, once, and plans a later change in full', () => {
    const withFind = 'HAB:535:574|M01 · find:500:550|S1:493:539';
    const decision = decidePlan(locked({ waypointsKey: withFind, waypointCount: 3, findsRouteKey: withFind }), atLock);
    expect(decision.action).toBe('consume-find');
    expect(decidePlan(locked({ waypointsKey: withFind, waypointCount: 3 }), decision.memory).action).toBe('none');
    // Re-plan at the table plans in full even with the find's key still set
    expect(decidePlan(locked({ waypointsKey: withFind, waypointCount: 3, findsRouteKey: withFind, nonce: 1 }), decision.memory).action).toBe('plan-waypoints');
  });

  it('plans again a waypoint plan that was cancelled before it landed', () => {
    const changed = 'HAB:535:574|X:1:1';
    const first = decidePlan(locked({ waypointsKey: changed }), atLock);
    expect(first.action).toBe('plan-waypoints');
    // the table closed for Walk before the answer: nothing applied, so the same waypoints plan again
    expect(decidePlan(locked({ waypointsKey: changed }), first.memory).action).toBe('plan-waypoints');
    const landed = afterWaypointPlan(first.memory, first.planId);
    expect(decidePlan(locked({ waypointsKey: changed }), landed).action).toBe('none');
  });

  it('drops a Re-plan while a shelter route is the route, and does not replay it after the event (B1)', () => {
    const replan = decidePlan(locked({ nonce: 1, sheltered: true }), atLock);
    expect(replan.action).toBe('none');
    expect(decidePlan(locked({ nonce: 1 }), replan.memory).action).toBe('none');   // the event is over: nothing replays
    expect(decidePlan(locked({ nonce: 2 }), replan.memory).action).toBe('plan-waypoints');   // a Re-plan after it plans
    // a find's waypoints during the event are not planned either, and a cancelled plan is not re-planned
    expect(decidePlan(locked({ waypointsKey: 'HAB:535:574|X:1:1', sheltered: true }), atLock).action).toBe('none');
    const cancelled = decidePlan(locked({ waypointsKey: 'HAB:535:574|X:1:1' }), atLock);
    expect(decidePlan(locked({ waypointsKey: 'HAB:535:574|X:1:1', sheltered: true }), cancelled.memory).action).toBe('none');
    // the comparison refresh writes no path, so it still goes through
    expect(decidePlan(locked({ mastId: '544.9,-,581.5', sheltered: true }), atLock).action).toBe('refresh-mast');
  });

  it('plans nothing for fewer than two waypoints', () => {
    expect(decidePlan(locked({ waypointCount: 1, waypointsKey: 'HAB:0:0' }), atLock).action).toBe('none');
  });
});

describe('one planner request in flight (N16)', () => {
  /** A job whose promise the test resolves. */
  function job(name, log) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return {
      name, resolve, reject,
      run: () => { log.push('run ' + name); return promise; },
      done: (result) => log.push('done ' + name + ' ' + result),
      failed: (error) => log.push('failed ' + name + ' ' + error.message),
    };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('sends only the newest of the jobs asked for while one runs, and drops the stale answer', async () => {
    const log = [];
    const queue = createLatestOnly();
    const a = job('a', log), b = job('b', log), c = job('c', log);
    queue.request(a);
    queue.request(b);
    queue.request(c);
    expect(log).toEqual(['run a']);
    expect(queue.busy()).toBe(true);
    a.resolve(1);
    await settle();
    expect(log).toEqual(['run a', 'run c']);   // a's answer is stale (c waits), b never runs
    c.resolve(3);
    await settle();
    expect(log).toEqual(['run a', 'run c', 'done c 3']);
    expect(queue.busy()).toBe(false);
  });

  it('drops the answer of a cancelled job and reports a failure of the newest', async () => {
    const log = [];
    const queue = createLatestOnly();
    const a = job('a', log), b = job('b', log);
    const cancelA = queue.request(a);
    cancelA();
    a.resolve(1);
    await settle();
    expect(log).toEqual(['run a']);
    queue.request(b);
    b.reject(new Error('route planner terminated'));
    await settle();
    expect(log).toEqual(['run a', 'run b', 'failed b route planner terminated']);
  });

  it('never runs a job cancelled while it waited', async () => {
    const log = [];
    const queue = createLatestOnly();
    const a = job('a', log), b = job('b', log);
    queue.request(a);
    const cancelB = queue.request(b);
    cancelB();
    a.resolve(1);
    await settle();
    expect(log).toEqual(['run a', 'done a 1']);
  });
});
