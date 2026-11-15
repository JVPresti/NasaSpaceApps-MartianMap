import { describe, expect, it } from 'vitest';
import { SAMPLE_REACH_M } from './missions.js';
import { TASK_NEAR_M, taskProgress, taskRecords, tasksAt } from './taskProgress.js';

// Places as the planner resolves them (src/sim/sampleTasks.js resolvePlace): Bright Angel from stops.json (2 m radius)
// and a clicked point (8 m).
const BRIGHT_ANGEL = { key: 'bright-angel', type: 'stop', stopId: 'bright-angel', x: -11, z: -50, radiusM: 2, label: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', reason: null };
const P1 = { key: 'P1', type: 'point', stopId: null, x: 470, z: 560, radiusM: 8, label: 'P1', waypoint: 'P1 · task point', reason: null };
const task = (id, what, count, place, extra = {}) => ({ id, what, count, place, workSec: 0, kept: true, drop: null, ...extra });
const sample = (id, kind, x, z, atSec) => ({ id, kind, site: null, x, z, into: 'pouch', photo: false, texture: true, sealed: true, atSec });
const photo = (x, z, atSec) => ({ x, z, kind: 'ground', site: null, atSec });

describe('taskRecords', () => {
  it('reads photos from the photo log and samples by kind, oldest first', () => {
    const sampling = {
      samples: [sample(2, 'rock', 1, 1, 50), sample(1, 'ground', 2, 2, 40), sample(3, 'rock', 3, 3, 20)],
      photoLog: [photo(5, 5, 30), photo(6, 6, 10)],
    };
    expect(taskRecords('rock', sampling).map((r) => r.id)).toEqual([3, 2]);
    expect(taskRecords('soil', sampling).map((r) => r.id)).toEqual([1]);
    expect(taskRecords('photo', sampling).map((r) => r.atSec)).toEqual([10, 30]);
  });

  it('copes with a slice built before the photo log existed and with records without a time or a point', () => {
    expect(taskRecords('photo', { samples: [] })).toEqual([]);
    expect(taskRecords('rock', {})).toEqual([]);
    const records = taskRecords('rock', { samples: [sample(1, 'rock', 0, 0, null), sample(2, 'rock', 0, 0, 5), { id: 3, kind: 'rock', x: null, z: 0 }] });
    expect(records.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('taskProgress', () => {
  it('is done when the samples are secured inside the place radius plus the scoop reach, with the time and the distance', () => {
    const [row] = taskProgress([task('t1', 'rock', 1, BRIGHT_ANGEL)], { samples: [sample(1, 'rock', -11.6, -49.2, 750)] });
    expect(row).toMatchObject({ id: 't1', what: 'rock', count: 1, kept: true, here: 1, elsewhere: 0, state: 'done', atSec: 750 });
    expect(row.distanceM).toBeCloseTo(1, 6);
    expect(row.place).toEqual({ key: 'bright-angel', label: 'Bright Angel', x: -11, z: -50, radiusM: 2, waypoint: 'WP3 · Bright Angel outcrop' });
  });

  it('counts at the place up to radius + SAMPLE_REACH_M (2 m), and outside it as done elsewhere', () => {
    expect(SAMPLE_REACH_M).toBe(2);
    const edge = BRIGHT_ANGEL.radiusM + SAMPLE_REACH_M;
    const at = (dx) => taskProgress([task('t1', 'soil', 1, BRIGHT_ANGEL)], { samples: [sample(1, 'ground', BRIGHT_ANGEL.x + dx, BRIGHT_ANGEL.z, 100)] })[0];
    expect(at(edge)).toMatchObject({ here: 1, elsewhere: 0, state: 'done' });
    const far = at(edge + 0.01);
    expect(far).toMatchObject({ here: 0, elsewhere: 1, state: 'elsewhere', atSec: 100 });
    expect(far.distanceM).toBeCloseTo(edge + 0.01, 6);
  });

  it('stays open with what it has, and has no time or distance with nothing counted', () => {
    const rows = taskProgress([task('t1', 'rock', 2, P1), task('t2', 'photo', 1, BRIGHT_ANGEL)], { samples: [sample(1, 'rock', 472, 561, 300)], photoLog: [] });
    expect(rows[0]).toMatchObject({ here: 1, elsewhere: 0, state: 'open', atSec: null });
    expect(rows[0].distanceM).toBeCloseTo(Math.hypot(2, 1), 6);
    expect(rows[1]).toMatchObject({ here: 0, elsewhere: 0, state: 'open', atSec: null, distanceM: null });
  });

  it('takes records at each place first, so an earlier task cannot use a later task\'s sample as "elsewhere"', () => {
    // the rock at P1 is the oldest; a greedy count would give it to t1 (Bright Angel) and leave t2 open
    const samples = [sample(1, 'rock', 471, 559, 100), sample(2, 'rock', -11, -50, 200)];
    const rows = taskProgress([task('t1', 'rock', 1, BRIGHT_ANGEL), task('t2', 'rock', 1, P1)], { samples });
    expect(rows.map((r) => [r.state, r.here, r.elsewhere, r.atSec])).toEqual([['done', 1, 0, 200], ['done', 1, 0, 100]]);
  });

  it('counts each record once: the second pass fills what is missing, in list order, oldest first', () => {
    const samples = [sample(1, 'rock', -11, -50, 100), sample(2, 'rock', 200, 200, 150), sample(3, 'rock', 300, 300, 160)];
    const rows = taskProgress([task('t1', 'rock', 2, BRIGHT_ANGEL), task('t2', 'rock', 2, P1)], { samples });
    expect(rows[0]).toMatchObject({ here: 1, elsewhere: 1, state: 'elsewhere', atSec: 150 });
    expect(rows[0].distanceM).toBeCloseTo(Math.hypot(211, 250), 6);   // the farthest counted record
    expect(rows[1]).toMatchObject({ here: 0, elsewhere: 1, state: 'open', atSec: null });
  });

  it('shares the records of one place between two tasks in list order, and never mixes kinds', () => {
    const photoLog = [photo(-11, -50, 10), photo(-10, -50, 20), photo(-11, -51, 30)];
    const rows = taskProgress([task('t1', 'photo', 1, BRIGHT_ANGEL), task('t2', 'rock', 1, BRIGHT_ANGEL), task('t3', 'photo', 3, BRIGHT_ANGEL)], { samples: [sample(1, 'ground', -11, -50, 40)], photoLog });
    expect(rows.map((r) => [r.id, r.state, r.here])).toEqual([['t1', 'done', 1], ['t2', 'open', 0], ['t3', 'open', 2]]);
    expect(rows[0].atSec).toBe(10);
  });

  it('keeps a task left out of the plan, which still counts what was collected', () => {
    const dropped = task('t2', 'soil', 1, P1, { kept: false, drop: { limit: 'time', overSec: 120 } });
    const unknown = task('t3', 'rock', 1, null, { kept: false, drop: { limit: 'unreachable' } });
    const rows = taskProgress([dropped, unknown], { samples: [sample(1, 'ground', 470, 560, 90), sample(2, 'rock', 0, 0, 95)] });
    expect(rows[0]).toMatchObject({ kept: false, state: 'done', here: 1 });
    expect(rows[1]).toMatchObject({ kept: false, here: 0, elsewhere: 1, state: 'elsewhere', distanceM: null });
    expect(rows[1].place).toMatchObject({ x: null, z: null });
  });

  it('is empty without tasks', () => {
    expect(taskProgress([], { samples: [sample(1, 'rock', 0, 0, 1)] })).toEqual([]);
    expect(taskProgress(undefined, undefined)).toEqual([]);
  });
});

describe('tasksAt', () => {
  const rows = taskProgress([task('t1', 'rock', 1, BRIGHT_ANGEL), task('t2', 'soil', 1, P1)], {});

  it('gives the rows whose place is within its radius plus TASK_NEAR_M of the position', () => {
    expect(TASK_NEAR_M).toBe(8);
    expect(tasksAt(rows, { x: -11, z: -50 + 2 + 8 }).map((r) => r.id)).toEqual(['t1']);
    expect(tasksAt(rows, { x: -11, z: -50 + 2 + 8.1 })).toEqual([]);
    expect(tasksAt(rows, { x: 470 + 15, z: 560 }).map((r) => r.id)).toEqual(['t2']);
  });

  it('is empty without a position', () => {
    expect(tasksAt(rows, { x: null, z: null })).toEqual([]);
    expect(tasksAt(rows, null)).toEqual([]);
  });
});
