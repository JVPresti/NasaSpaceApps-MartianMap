import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { routeStopCandidates } from '../data/stops.js';
import { CREW_SETTINGS } from './missionNeeds.js';
import {
  checkTasks, COUNT_RANGE, DEFAULT_TASKS, MAX_TASKS, nextPointId, nextTaskId, normaliseTasks, patchTask, placeKey, POINT_IDS, POINT_RADIUS_M,
  resolvePlace, STOP_RADIUS_DEFAULT_M, TASK_KINDS, TASK_WORK_NOTES, TASK_WORK_SEC, taskWorkSec, tasksKey, withoutTask, withTask,
} from './sampleTasks.js';
import { ARRIVAL_RADIUS_M } from './waypointRunner.js';

const readJson = (path) => JSON.parse(readFileSync(fileURLToPath(new URL('../../' + path, import.meta.url)), 'utf8'));
const candidates = routeStopCandidates(readJson('public/data/stops.json'));

const stop = (stopId) => ({ type: 'stop', stopId });
const point = (id, x, z) => ({ type: 'point', id, x, z });
const task = (id, what, count, place) => ({ id, what, count, place });

describe('the task model', () => {
  it('offers three kinds, up to three tasks of one to three items, at three points at most', () => {
    expect(TASK_KINDS).toEqual(['photo', 'soil', 'rock']);
    expect(MAX_TASKS).toBe(3);
    expect(COUNT_RANGE).toEqual([1, 3]);
    expect(POINT_IDS).toEqual(['P1', 'P2', 'P3']);
    expect(POINT_RADIUS_M).toBe(8);
    expect(STOP_RADIUS_DEFAULT_M).toBe(ARRIVAL_RADIUS_M);
  });

  it('starts the goal with one rock sample at Bright Angel', () => {
    expect(DEFAULT_TASKS).toEqual([task('t1', 'rock', 1, stop('bright-angel'))]);
    expect(Object.isFrozen(DEFAULT_TASKS[0].place)).toBe(true);
  });

  it('keys a place by its stop id or its point id', () => {
    expect(placeKey(stop('bright-angel'))).toBe('bright-angel');
    expect(placeKey(point('P2', 1, 2))).toBe('P2');
  });
});

describe('checkTasks', () => {
  it('returns a clean copy: counts rounded and clamped, positions to the centimetre, extra fields dropped', () => {
    const input = [task('t1', 'soil', 2.6, point('P1', 10.12345, -3.456)), { ...task('t2', 'photo', 0, stop('sortie')), extra: 1 }];
    const out = checkTasks(input);
    expect(out).toEqual([task('t1', 'soil', 3, point('P1', 10.12, -3.46)), task('t2', 'photo', 1, stop('sortie'))]);
    expect(out[0]).not.toBe(input[0]);
    expect(checkTasks([task('t3', 'rock', 9, stop('cheyava-falls'))])[0].count).toBe(3);
  });

  it('refuses what the store must never hold', () => {
    expect(() => checkTasks(null)).toThrow(/array/);
    expect(() => checkTasks([1, 2, 3, 4].map((k) => task(`t${k}`, 'rock', 1, stop('sortie'))))).toThrow(/at most 3/);
    expect(() => checkTasks([task('t1', 'rock', 1, stop('sortie')), task('t1', 'soil', 1, stop('sortie'))])).toThrow(/duplicate/);
    expect(() => checkTasks([task('t4', 'rock', 1, stop('sortie'))])).toThrow(/task id/);
    expect(() => checkTasks([task('t1', 'sand', 1, stop('sortie'))])).toThrow(/what/);
    expect(() => checkTasks([task('t1', 'rock', Number.NaN, stop('sortie'))])).toThrow(/count/);
    expect(() => checkTasks([task('t1', 'rock', 1, null)])).toThrow(/place/);
    expect(() => checkTasks([task('t1', 'rock', 1, { type: 'stop', stopId: '' })])).toThrow(/stopId/);
    expect(() => checkTasks([task('t1', 'rock', 1, point('P4', 0, 0))])).toThrow(/point place/);
    expect(() => checkTasks([task('t1', 'rock', 1, point('P1', 0, Infinity))])).toThrow(/finite/);
    expect(() => checkTasks([task('t1', 'rock', 1, { type: 'area' })])).toThrow(/stop or point/);
  });

  it('lets two tasks share a point, never one point id at two positions', () => {
    expect(checkTasks([task('t1', 'rock', 1, point('P1', 5, 5)), task('t2', 'photo', 1, point('P1', 5.001, 5))])).toHaveLength(2);
    expect(() => checkTasks([task('t1', 'rock', 1, point('P1', 5, 5)), task('t2', 'photo', 1, point('P1', 6, 5))])).toThrow(/two positions/);
  });
});

describe('normaliseTasks (the planner input)', () => {
  it('plans the default task when the needs carry none, nothing for a non-list', () => {
    expect(normaliseTasks(undefined)).toEqual(DEFAULT_TASKS);
    expect(normaliseTasks(undefined)[0]).not.toBe(DEFAULT_TASKS[0]);
    expect(normaliseTasks(null)).toEqual([]);
    expect(normaliseTasks('rock')).toEqual([]);
    expect(normaliseTasks([])).toEqual([]);
  });

  it('keeps the valid entries only, the first three', () => {
    const list = [
      task('t1', 'rock', 1, stop('sortie')),
      task('t1', 'soil', 1, stop('sortie')),   // duplicate id
      task('t2', 'sand', 1, stop('sortie')),   // unknown kind
      task('t2', 'photo', 2, point('P1', 1, 1)),
      task('t3', 'soil', 1, point('P1', 9, 9)),   // P1 elsewhere
      task('t3', 'soil', 1, point('P2', 9, 9)),
      { id: 'x' },
    ];
    expect(normaliseTasks(list).map((entry) => entry.id)).toEqual(['t1', 't2', 't3']);
    expect(normaliseTasks(list)[2].place).toEqual(point('P2', 9, 9));
  });
});

describe('tasksKey', () => {
  it('is empty for the other goals, so they plan as before', () => {
    expect(tasksKey({ objective: 'cheyava', tasks: [task('t1', 'rock', 1, stop('sortie'))] })).toBe('');
    expect(tasksKey(null)).toBe('');
  });

  it('changes with any task field', () => {
    const base = [task('t1', 'rock', 1, stop('bright-angel')), task('t2', 'soil', 2, point('P1', 1.5, 2))];
    const key = (list) => tasksKey({ objective: 'samples', tasks: list });
    expect(key(base)).toBe('t1:rock:1:bright-angel,t2:soil:2:P1@1.5:2');
    expect(key(undefined)).toBe('t1:rock:1:bright-angel');
    const variants = [
      patchTask(base, 't1', { what: 'photo' }), patchTask(base, 't1', { count: 2 }), patchTask(base, 't1', { place: stop('sortie') }),
      patchTask(base, 't2', { place: point('P1', 1.5, 2.5) }), withoutTask(base, 't1'), [...base].reverse(),
    ];
    expect(new Set([key(base), ...variants.map(key)]).size).toBe(variants.length + 1);
  });
});

describe('list edits', () => {
  it('gives the lowest free task and point ids', () => {
    expect(nextTaskId([])).toBe('t1');
    expect(nextTaskId([task('t1', 'rock', 1, stop('sortie')), task('t3', 'rock', 1, stop('sortie'))])).toBe('t2');
    expect(nextTaskId([1, 2, 3].map((k) => task(`t${k}`, 'rock', 1, stop('sortie'))))).toBeNull();
    expect(nextPointId([task('t1', 'rock', 1, point('P1', 0, 0)), task('t2', 'rock', 1, stop('sortie'))])).toBe('P2');
    expect(nextPointId([1, 2, 3].map((k) => task(`t${k}`, 'rock', 1, point(`P${k}`, k, k))))).toBeNull();
  });

  it('adds, changes and removes without touching the list it was given', () => {
    const one = Object.freeze([Object.freeze(task('t1', 'rock', 1, stop('sortie')))]);
    const two = withTask(one, { what: 'photo', count: 1, place: stop('cheyava-falls') });
    expect(two.map((entry) => entry.id)).toEqual(['t1', 't2']);
    expect(patchTask(two, 't2', { count: 3, id: 'nope' })[1]).toEqual(task('t2', 'photo', 3, stop('cheyava-falls')));
    expect(withoutTask(two, 't1').map((entry) => entry.id)).toEqual(['t2']);
    const full = withTask(withTask(two, { what: 'soil', count: 1, place: stop('sortie') }), { what: 'soil', count: 1, place: stop('sortie') });
    expect(full).toHaveLength(3);
    expect(one).toHaveLength(1);
  });
});

describe('work per task (SIM)', () => {
  it('plans 2, 4 and 8 min per item for a pair, times the count', () => {
    expect(TASK_WORK_SEC).toEqual({ photo: 120, soil: 240, rock: 480 });
    expect(taskWorkSec(task('t1', 'photo', 1))).toBe(120);
    expect(taskWorkSec(task('t1', 'soil', 2))).toBe(480);
    expect(taskWorkSec(task('t1', 'rock', 3))).toBe(1440);
  });

  it('takes 1.5 times as long for a solo crew', () => {
    expect(taskWorkSec(task('t1', 'rock', 1), CREW_SETTINGS[1].workFactor)).toBe(720);
    expect(taskWorkSec(task('t1', 'photo', 3), CREW_SETTINGS[1].workFactor)).toBe(540);
    expect(taskWorkSec(task('t1', 'soil', 1), CREW_SETTINGS[2].workFactor)).toBe(240);
  });

  it('says why each time is what it is', () => {
    for (const what of TASK_KINDS) expect(TASK_WORK_NOTES[what]).toMatch(new RegExp(`^${what} ${TASK_WORK_SEC[what]} s: `));
  });
});

describe('resolvePlace', () => {
  it('places a known stop at its stops.json position, with its radius, name and waypoint', () => {
    expect(resolvePlace(stop('sortie'), candidates)).toEqual({
      key: 'sortie', type: 'stop', stopId: 'sortie', x: 493, z: 539, radiusM: 8, label: 'Light-toned patch',
      waypoint: 'S1 · light-toned patch', reason: expect.objectContaining({ tag: 'SIM' }),
    });
    expect(resolvePlace(stop('bright-angel'), candidates)).toMatchObject({ x: -11, z: -50, radiusM: 2, label: 'Bright Angel', waypoint: 'WP3 · Bright Angel outcrop', reason: null });
  });

  it('takes the waypoint runner\'s 5 m for a stop without a radius, and nothing for a stop not in the list', () => {
    expect(resolvePlace(stop('x'), [{ id: 'x', name: 'X', waypoint: 'X', x: 1, z: 2 }]).radiusM).toBe(5);
    expect(resolvePlace(stop('olympus'), candidates)).toBeNull();
  });

  it('makes a clicked point an 8 m patch named by its id', () => {
    expect(resolvePlace(point('P2', 400, 520), candidates)).toEqual({
      key: 'P2', type: 'point', stopId: null, x: 400, z: 520, radiusM: 8, label: 'P2', waypoint: 'P2 · task point', reason: null,
    });
  });
});
