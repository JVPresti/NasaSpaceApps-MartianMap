import { describe, expect, it } from 'vitest'

import exampleEvent from './events/example-event.json'
import { createEventEngine, createMemoryStore, validateEvent } from './eventEngine.js'

function makeEvent(overrides = {}) {
  return {
    id: 'test-event',
    label: 'Test event',
    trigger: { type: 'manual' },
    timeline: [{ atSec: 0, set: { 'environment.testValue': 1 } }],
    alert: { level: 'warning', text: 'Test alert' },
    ...overrides,
  }
}

function setup(definitions, { initial, getMissionTime } = {}) {
  const store = createMemoryStore(initial)
  const replans = []
  const engine = createEventEngine({
    events: definitions,
    store,
    getMissionTime,
    requestReplan: (request) => replans.push(request),
  })
  return { engine, store, replans }
}

describe('event engine', () => {
  it('runs an event defined only in data from start to end', () => {
    const { engine, store, replans } = setup([exampleEvent])

    expect(engine.fire(exampleEvent.id)).toBe(true)

    expect(store.get(`alerts.${exampleEvent.id}`)).toMatchObject({
      id: exampleEvent.id,
      eventId: exampleEvent.id,
      level: 'caution',
      text: exampleEvent.alert.text,
      startedAtSec: 0,
      active: true,
    })
    expect(store.get('environment.dustOpacity')).toBe(0.1)
    expect(replans).toEqual([
      {
        eventId: exampleEvent.id,
        reason: exampleEvent.alert.text,
        target: 'nearestShelter',
        missionTimeSec: 0,
      },
    ])

    engine.update(5)
    expect(store.get('environment.dustOpacity')).toBe(0.2)

    engine.update(exampleEvent.end.afterSec)

    expect(store.get(`alerts.${exampleEvent.id}`)).toBeNull()
    expect(store.get('environment.dustOpacity')).toBe(0)
    expect(engine.getActive()).toEqual([])
  })

  it('starts a mission-time event exactly at atSec and requests one re-plan', () => {
    const event = makeEvent({
      id: 'clock-event',
      trigger: { type: 'missionTime', atSec: 300 },
      end: { type: 'duration', afterSec: 60 },
      planner: { action: 'replan', target: 'habitat' },
    })
    const { engine, store, replans } = setup([event])

    engine.update(299.9)
    expect(engine.getActive()).toEqual([])
    expect(store.get('alerts.clock-event')).toBeUndefined()

    engine.update(300)
    expect(engine.getActive()).toHaveLength(1)
    expect(engine.getActive()[0].startedAtSec).toBe(300)
    expect(replans).toHaveLength(1)

    engine.update(300)
    expect(replans).toHaveLength(1)
  })

  it('fires an area trigger inside the radius and not outside it', () => {
    const event = makeEvent({
      id: 'area-event',
      trigger: { type: 'area', x: 10, z: -20, radius: 40 },
      end: { type: 'duration', afterSec: 60 },
    })
    const { engine } = setup([event])

    engine.update(1, { x: 50.1, z: -20 })
    expect(engine.getActive()).toEqual([])

    engine.update(2, { x: 50, z: -20 })
    expect(engine.getActive()[0].id).toBe('area-event')
  })

  it('does not crash when an area trigger has no position yet', () => {
    const event = makeEvent({
      id: 'area-no-position',
      trigger: { type: 'area', x: 0, z: 0, radius: 40 },
    })
    const { engine } = setup([event])

    expect(() => engine.update(1)).not.toThrow()
    expect(() => engine.update(2, null)).not.toThrow()
    expect(engine.getActive()).toEqual([])
  })

  it('starts a threshold event when the store crosses the value', () => {
    const event = makeEvent({
      id: 'oxygen-event',
      trigger: { type: 'threshold', path: 'suit.oxygenSec', op: 'lt', value: 900 },
      end: { type: 'threshold', path: 'suit.oxygenSec', op: 'gte', value: 1200 },
    })
    const { engine, store } = setup([event], { initial: { suit: { oxygenSec: 1200 } } })

    engine.update(10)
    expect(engine.getActive()).toEqual([])

    store.set('suit.oxygenSec', 900)
    engine.update(11)
    expect(engine.getActive()).toEqual([])

    store.set('suit.oxygenSec', 899)
    engine.update(12)
    expect(engine.getActive()).toHaveLength(1)

    store.set('suit.oxygenSec', 1200)
    engine.update(13)
    expect(engine.getActive()).toEqual([])
    expect(store.get('alerts.oxygen-event')).toBeNull()
  })

  it('fires an event by hand and only once', () => {
    const event = makeEvent({ id: 'manual-event', end: { type: 'duration', afterSec: 30 } })
    const { engine } = setup([event])

    engine.update(500)
    expect(engine.getActive()).toEqual([])

    expect(engine.fire(event.id)).toBe(true)
    expect(engine.getActive()).toHaveLength(1)

    expect(engine.fire(event.id)).toBe(false)
    expect(engine.getActive()).toHaveLength(1)
  })

  it('uses the injected mission clock for a manual fire', () => {
    const event = makeEvent({ id: 'manual-clock', end: { type: 'duration', afterSec: 30 } })
    const { engine, store } = setup([event], { getMissionTime: () => 420 })

    engine.fire(event.id)

    expect(store.get('alerts.manual-clock').startedAtSec).toBe(420)
    expect(engine.getActive()[0].startedAtSec).toBe(420)
  })

  it('gives two engines the same result for the same mission time', () => {
    const event = makeEvent({
      id: 'deterministic-event',
      trigger: { type: 'missionTime', atSec: 120 },
      timeline: [
        { atSec: 0, set: { 'environment.value': 1 } },
        { atSec: 10, set: { 'environment.value': 2 } },
      ],
      end: { type: 'duration', afterSec: 30 },
      planner: { action: 'replan', target: 'nearestShelter' },
    })
    const first = setup([event])
    const second = setup([event])

    for (const missionTimeSec of [60, 119, 120, 130]) {
      first.engine.update(missionTimeSec)
      second.engine.update(missionTimeSec)
    }

    expect(first.engine.getActive()).toEqual(second.engine.getActive())
    expect(first.replans).toEqual(second.replans)
    expect(first.store.snapshot()).toEqual(second.store.snapshot())
  })

  it('is idempotent: no duplicate alerts, re-plans or timeline writes', () => {
    const event = makeEvent({
      id: 'idempotent-event',
      trigger: { type: 'missionTime', atSec: 100 },
      timeline: [
        { atSec: 0, set: { 'environment.value': 1 } },
        { atSec: 10, set: { 'environment.value': 2 } },
      ],
      end: { type: 'duration', afterSec: 100 },
      planner: { action: 'replan', target: 'habitat' },
    })
    const store = createMemoryStore()
    const replans = []
    let alertWrites = 0

    const engine = createEventEngine({
      events: [event],
      store,
      requestReplan: (request) => replans.push(request),
      writeAlert: (alert) => {
        alertWrites += 1
        store.set(`alerts.${alert.eventId}`, alert)
      },
    })

    engine.update(100)
    engine.update(100)
    engine.update(100)
    engine.update(110)

    expect(alertWrites).toBe(1)
    expect(replans).toHaveLength(1)

    store.set('environment.value', 99)
    engine.update(110)
    expect(store.get('environment.value')).toBe(99)
  })

  it('ends an event on request and applies endSet', () => {
    const event = makeEvent({
      id: 'forced-end',
      timeline: [{ atSec: 0, set: { 'environment.value': 1 } }],
      endSet: { 'environment.value': 0 },
    })
    const { engine, store } = setup([event])

    engine.fire(event.id)
    expect(store.get('environment.value')).toBe(1)

    expect(engine.end(event.id)).toBe(true)
    expect(store.get('environment.value')).toBe(0)
    expect(store.get('alerts.forced-end')).toBeNull()
    expect(engine.end(event.id)).toBe(false)
  })
})

describe('event validation', () => {
  it('accepts the example event', () => {
    expect(validateEvent(exampleEvent)).toEqual({ ok: true, errors: [] })
  })

  it('rejects a definition with missing required fields', () => {
    const result = validateEvent({})

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/id/)
    expect(result.errors.join(' ')).toMatch(/label/)
    expect(result.errors.join(' ')).toMatch(/trigger/)
    expect(result.errors.join(' ')).toMatch(/timeline/)
    expect(result.errors.join(' ')).toMatch(/alert/)
  })

  it('rejects unknown trigger types and bad trigger fields', () => {
    const unknownType = validateEvent(makeEvent({ trigger: { type: 'earthquake' } }))
    expect(unknownType.ok).toBe(false)
    expect(unknownType.errors.join(' ')).toMatch(/trigger\.type/)

    const badRadius = validateEvent(makeEvent({ trigger: { type: 'area', x: 0, z: 0, radius: 0 } }))
    expect(badRadius.ok).toBe(false)
    expect(badRadius.errors.join(' ')).toMatch(/radius/)

    const badOp = validateEvent(
      makeEvent({ trigger: { type: 'threshold', path: 'suit.oxygenSec', op: 'eq', value: 1 } }),
    )
    expect(badOp.ok).toBe(false)
    expect(badOp.errors.join(' ')).toMatch(/trigger\.op/)
  })

  it('rejects a timeline that is not ordered by atSec', () => {
    const result = validateEvent(
      makeEvent({
        timeline: [
          { atSec: 10, set: { 'environment.value': 1 } },
          { atSec: 5, set: { 'environment.value': 2 } },
        ],
      }),
    )

    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/ordered by atSec/)
  })

  it('rejects unknown alert levels and planner targets', () => {
    const badLevel = validateEvent(makeEvent({ alert: { level: 'critical', text: 'x' } }))
    expect(badLevel.ok).toBe(false)
    expect(badLevel.errors.join(' ')).toMatch(/alert\.level/)

    const badTarget = validateEvent(
      makeEvent({ planner: { action: 'replan', target: 'theMoon' } }),
    )
    expect(badTarget.ok).toBe(false)
    expect(badTarget.errors.join(' ')).toMatch(/planner\.target/)
  })

  it('throws a useful error when the engine receives an invalid event', () => {
    expect(() =>
      createEventEngine({
        events: [makeEvent({ trigger: { type: 'missionTime', atSec: -1 } })],
        store: createMemoryStore(),
      }),
    ).toThrow(/Invalid event definitions:[\s\S]*trigger\.atSec/)
  })

  it('throws a clear error for an unknown event id in fire or end', () => {
    const { engine } = setup([makeEvent()])

    expect(() => engine.fire('missing-event')).toThrow('Unknown event id "missing-event"')
    expect(() => engine.end('missing-event')).toThrow('Unknown event id "missing-event"')
  })
})

describe('trigger conditions for the first mission (#265)', () => {
  const HOME = { x: 0, z: 0 }
  const OUT = { x: 60, z: 0 }
  const homeEnd = { type: 'area', x: 0, z: 0, radius: 25 }

  it('holds a due event while the position is inside its own end area, then starts it outside', () => {
    const event = makeEvent({ trigger: { type: 'missionTime', atSec: 75, holdInsideEnd: true }, end: homeEnd })
    const { engine } = setup([event])

    expect(engine.update(80, HOME).started).toEqual([])
    expect(engine.update(120, { x: 10, z: 10 }).started).toEqual([])
    // Without the hold it would start and end in the same update and never play again.
    expect(engine.update(121, OUT).started).toEqual(['test-event'])
    expect(engine.getActive().map((active) => active.id)).toEqual(['test-event'])
    expect(engine.update(140, HOME).ended).toEqual(['test-event'])
  })

  it('starts and ends at once inside the end area without the hold, as the full EVA always did', () => {
    const event = makeEvent({ trigger: { type: 'missionTime', atSec: 75 }, end: homeEnd })
    const { engine } = setup([event])
    expect(engine.update(80, HOME)).toEqual({ started: ['test-event'], ended: ['test-event'] })
  })

  it('waits until a store threshold has held for forSec', () => {
    const event = makeEvent({
      trigger: { type: 'missionTime', atSec: 75, requires: [{ path: 'route.nextIndex', op: 'gte', value: 2, forSec: 20 }] },
    })
    const { engine, store } = setup([event], { initial: { route: { nextIndex: 1 } } })

    expect(engine.update(90).started).toEqual([])   // due, but the stop is not reached yet
    store.set('route.nextIndex', 2)                  // the stop is reached at T+100
    expect(engine.update(100).started).toEqual([])
    expect(engine.update(119).started).toEqual([])
    expect(engine.update(120).started).toEqual(['test-event'])
  })

  it('counts forSec from the first time the threshold held, so an early arrival keeps atSec', () => {
    const event = makeEvent({
      trigger: { type: 'missionTime', atSec: 75, requires: [{ path: 'route.nextIndex', op: 'gte', value: 2, forSec: 20 }] },
    })
    const { engine } = setup([event], { initial: { route: { nextIndex: 2 } } })
    expect(engine.update(40).started).toEqual([])
    expect(engine.update(74).started).toEqual([])
    expect(engine.update(75).started).toEqual(['test-event'])
  })

  it('waits until another event has run afterSec, and ignores an event this engine does not run', () => {
    const storm = makeEvent({ id: 'storm', trigger: { type: 'missionTime', atSec: 75 } })
    const radiation = makeEvent({ id: 'radiation', trigger: { type: 'missionTime', atSec: 80, requires: [{ event: 'storm', afterSec: 15 }] } })
    const { engine } = setup([storm, radiation])
    expect(engine.update(85).started).toEqual(['storm'])
    expect(engine.update(99).started).toEqual([])
    expect(engine.update(100).started).toEqual(['radiation'])

    const alone = setup([radiation])   // the storm switched off at the mission table
    expect(alone.engine.update(80).started).toEqual(['radiation'])
  })

  it('starts at latestSec even when a requirement never holds, and from then on even inside the end area', () => {
    const event = makeEvent({
      trigger: { type: 'missionTime', atSec: 75, requires: [{ path: 'route.nextIndex', op: 'gte', value: 2 }], latestSec: 180, holdInsideEnd: true },
      end: { ...homeEnd, minSec: 20 },
    })
    const { engine } = setup([event], { initial: { route: { nextIndex: 1 } } })
    expect(engine.update(100, HOME).started).toEqual([])
    expect(engine.update(179, OUT).started).toEqual([])
    // A crew that never leaves the end area still meets the event, and it plays its minimum time (N14).
    expect(engine.update(180, HOME)).toEqual({ started: ['test-event'], ended: [] })
    expect(engine.update(199, HOME).ended).toEqual([])
    expect(engine.update(200, HOME).ended).toEqual(['test-event'])
  })

  it('keeps an event requirement after latestSec, so two late events still come in order', () => {
    const storm = makeEvent({ id: 'storm', trigger: { type: 'missionTime', atSec: 75, latestSec: 180, holdInsideEnd: true }, end: homeEnd })
    const radiation = makeEvent({
      id: 'radiation',
      trigger: { type: 'missionTime', atSec: 95, requires: [{ event: 'storm', afterSec: 15 }], latestSec: 210, holdInsideEnd: true },
      end: homeEnd,
    })
    const { engine } = setup([storm, radiation])
    expect(engine.update(179, HOME).started).toEqual([])
    expect(engine.update(180, HOME).started).toEqual(['storm'])       // its latestSec, inside the end area
    expect(engine.update(209, HOME).started).toEqual([])              // 15 s after the storm, but still held inside
    expect(engine.update(210, HOME).started).toEqual(['radiation'])   // its own latestSec
  })

  it('holds an event inside its end area only until latestSec', () => {
    const event = makeEvent({ trigger: { type: 'missionTime', atSec: 75, latestSec: 120, holdInsideEnd: true }, end: homeEnd })
    const { engine } = setup([event])
    expect(engine.update(100, HOME).started).toEqual([])
    expect(engine.update(120, HOME).started).toEqual(['test-event'])
  })

  it('counts a place reached for good: leaving it, or a re-plan, changes nothing (R5)', () => {
    const STOP = { x: 60, z: 0, radius: 5 }
    const event = makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: [{ area: STOP, forSec: 20 }] } })
    const { engine } = setup([event])
    expect(engine.update(50, { x: 30, z: 0 }).started).toEqual([])    // a find on the way: not the stop
    expect(engine.update(80, { x: 30, z: 0 }).started).toEqual([])    // due, the stop not reached
    expect(engine.update(90, { x: 58, z: 1 }).started).toEqual([])    // at the stop from T+90
    expect(engine.update(100, { x: 40, z: 0 }).started).toEqual([])   // walked away again
    expect(engine.update(110, { x: 40, z: 0 }).started).toEqual(['test-event'])
  })

  it('starts with any one of anyOf: a sample secured, or long enough at the stop', () => {
    const STOP = { x: 60, z: 0, radius: 5 }
    const trigger = {
      type: 'missionTime', atSec: 75,
      requires: [{ area: STOP }, { anyOf: [{ path: 'sampling.count', op: 'gte', value: 1, forSec: 3 }, { area: STOP, forSec: 90 }] }],
    }
    const sampled = setup([makeEvent({ trigger })], { initial: { sampling: { count: 0 } } })
    expect(sampled.engine.update(60, { x: 60, z: 0 }).started).toEqual([])   // at the stop at T+60
    expect(sampled.engine.update(100, { x: 60, z: 0 }).started).toEqual([])  // still sampling
    sampled.store.set('sampling.count', 1)                                   // secured at T+110
    expect(sampled.engine.update(110, { x: 60, z: 0 }).started).toEqual([])
    expect(sampled.engine.update(113, { x: 60, z: 0 }).started).toEqual(['test-event'])

    const idle = setup([makeEvent({ trigger })], { initial: { sampling: { count: 0 } } })
    expect(idle.engine.update(60, { x: 60, z: 0 }).started).toEqual([])
    expect(idle.engine.update(149, { x: 60, z: 0 }).started).toEqual([])
    expect(idle.engine.update(150, { x: 60, z: 0 }).started).toEqual(['test-event'])   // 90 s at the stop, no sample
  })

  it('starts on the way home, before the end area, with nearEndM; anyOf may hold an event requirement', () => {
    const storm = makeEvent({ id: 'storm', trigger: { type: 'missionTime', atSec: 10 } })
    const radiation = makeEvent({
      id: 'radiation',
      trigger: { type: 'missionTime', atSec: 10, requires: [{ event: 'storm', afterSec: 0 }, { anyOf: [{ event: 'storm', afterSec: 15 }, { nearEndM: 10 }] }] },
      end: homeEnd,
    })
    const { engine } = setup([storm, radiation])
    expect(engine.update(10, { x: 50, z: 0 }).started).toEqual(['storm'])
    expect(engine.update(14, { x: 40, z: 0 }).started).toEqual([])       // 40 m out, 4 s after the storm
    expect(engine.update(18, { x: 34, z: 0 }).started).toEqual(['radiation'])   // within 25 + 10 m: before the end area
  })

  it('counts list entries inside an area: a sample taken elsewhere does not count (N1)', () => {
    const STOP = { x: 60, z: 0, radius: 10 }
    const event = makeEvent({ trigger: { type: 'missionTime', atSec: 0, requires: [{ path: 'sampling.samples', inArea: STOP, atLeast: 1, forSec: 3 }] } })
    const { engine, store } = setup([event], { initial: { sampling: { samples: [{ x: 20, z: 0 }] } } })   // a sample at a find
    expect(engine.update(50).started).toEqual([])
    store.set('sampling.samples', [{ x: 20, z: 0 }, { x: 61, z: 1 }])   // a sample at the stop at T+60
    expect(engine.update(60).started).toEqual([])
    expect(engine.update(63).started).toEqual(['test-event'])
    expect(validateEvent(makeEvent({ trigger: { type: 'manual', requires: [{ path: 'a.b', inArea: { x: 0, z: 0, radius: 1 }, atLeast: 0 }] } })).errors)
      .toContain('trigger.requires[0].atLeast must be a whole number >= 1')
  })

  it('does not end an event before end.minSec', () => {
    const event = makeEvent({ trigger: { type: 'missionTime', atSec: 10 }, end: { ...homeEnd, minSec: 20 } })
    const { engine } = setup([event])
    expect(engine.update(10, HOME)).toEqual({ started: ['test-event'], ended: [] })
    expect(engine.update(29, HOME).ended).toEqual([])
    expect(engine.update(30, HOME).ended).toEqual(['test-event'])
  })

  it('never starts a manual event from latestSec', () => {
    const { engine } = setup([makeEvent({ trigger: { type: 'manual', latestSec: 10 } })])
    expect(engine.update(20).started).toEqual([])
  })

  it('validates the new trigger fields', () => {
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, holdInsideEnd: true } })).errors)
      .toContain('trigger.holdInsideEnd needs an end of type "area"')
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, latestSec: 10 } })).errors)
      .toContain('trigger.latestSec must not be before trigger.atSec')
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: [{ event: 'x', afterSec: -1 }] } })).errors)
      .toContain('trigger.requires[0].afterSec must be a finite number of seconds >= 0')
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: [{ path: 'a.b', op: 'eq', value: 1 }] } })).ok)
      .toBe(false)
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: {} } })).errors)
      .toContain('trigger.requires must be an array')
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: [{ anyOf: [] }] } })).errors)
      .toContain('trigger.requires[0].anyOf must be a non-empty array')
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: [{ nearEndM: 5 }] } })).errors)
      .toContain('a nearEndM requirement needs an end of type "area"')
    expect(validateEvent(makeEvent({ trigger: { type: 'missionTime', atSec: 75, requires: [{ area: { x: 0, z: 0, radius: 0 } }] } })).errors)
      .toContain('trigger.requires[0].area.radius must be a finite number of metres greater than 0')
    expect(validateEvent(makeEvent({ trigger: { type: 'manual' }, end: { type: 'duration', afterSec: 5, minSec: -1 } })).errors)
      .toContain('end.minSec must be a finite number of seconds >= 0')
  })
})
