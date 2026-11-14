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
