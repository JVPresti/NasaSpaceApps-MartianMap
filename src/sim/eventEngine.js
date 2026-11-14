/**
 * Data-driven event engine.
 *
 * An event is a plain JSON definition: a trigger, a timeline of store changes,
 * an alert, an optional planner request and an optional end condition. The
 * engine owns no rendering and no clock: every decision comes from the mission
 * time and the position passed into `update()`, so two clients with the same
 * inputs see the same event start.
 *
 * The engine talks to a tiny store adapter with three methods:
 * `get(path)`, `set(path, value)` and `snapshot()`. The real Zustand store from
 * issue #6 plugs in through the same contract. `createMemoryStore` below is a
 * test and demo adapter only.
 *
 * See `docs/EVENT_ENGINE.md` for the full contract.
 */

const TRIGGER_TYPES = ['missionTime', 'area', 'threshold', 'manual']
const END_TYPES = ['duration', 'missionTime', 'area', 'threshold']
const ALERT_LEVELS = ['caution', 'warning', 'danger', 'info']
const PLANNER_TARGETS = ['nearestShelter', 'habitat']
const COMPARATORS = ['lt', 'lte', 'gt', 'gte']
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype'])
const STATUS = { idle: 'idle', active: 'active', ended: 'ended' }

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone)
  if (isPlainObject(value)) {
    const copy = {}
    for (const [key, item] of Object.entries(value)) copy[key] = deepClone(item)
    return copy
  }
  return value
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Object.keys(value)) deepFreeze(value[key])
  return Object.freeze(value)
}

function validatePath(path) {
  if (typeof path !== 'string' || path.trim() === '') return false
  return path.split('.').every((segment) => segment !== '' && !FORBIDDEN_PATH_SEGMENTS.has(segment))
}

function parsePath(path) {
  if (!validatePath(path)) {
    throw new TypeError(`store path must be a non-empty dot path, got "${String(path)}"`)
  }
  return path.split('.')
}

/**
 * Tiny in-memory store with dot paths, for tests and the demo only.
 *
 * The engine only needs `get`, `set` and `snapshot`; a real Zustand adapter
 * exposes the same three methods. Values should be JSON-like because the app
 * snapshot is serialisable.
 *
 * @param {object} [initial] Initial snapshot.
 * @returns {{ get: (path: string) => unknown, set: (path: string, value: unknown) => void, snapshot: () => object }}
 */
export function createMemoryStore(initial = {}) {
  if (!isPlainObject(initial)) {
    throw new TypeError('createMemoryStore: initial state must be an object')
  }

  let data = deepClone(initial)

  return {
    get(path) {
      let current = data
      for (const segment of parsePath(path)) {
        if (current === null || typeof current !== 'object') return undefined
        current = current[segment]
      }
      return current
    },

    set(path, value) {
      const segments = parsePath(path)
      let current = data
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index]
        if (!isPlainObject(current[segment])) current[segment] = {}
        current = current[segment]
      }
      current[segments[segments.length - 1]] = value
    },

    snapshot() {
      return deepClone(data)
    },
  }
}

function validateArea(area, field, errors) {
  if (!isFiniteNumber(area.x)) errors.push(`${field}.x must be a finite number of metres`)
  if (!isFiniteNumber(area.z)) errors.push(`${field}.z must be a finite number of metres`)
  if (!isFiniteNumber(area.radius) || area.radius <= 0) {
    errors.push(`${field}.radius must be a finite number of metres greater than 0`)
  }
}

function validateThreshold(threshold, field, errors) {
  if (!validatePath(threshold.path)) {
    errors.push(`${field}.path must be a non-empty dot path`)
  }
  if (!COMPARATORS.includes(threshold.op)) {
    errors.push(`${field}.op must be one of ${COMPARATORS.join(', ')}`)
  }
  if (!isFiniteNumber(threshold.value)) {
    errors.push(`${field}.value must be a finite number`)
  }
}

function validateTrigger(trigger, field, errors) {
  if (!isPlainObject(trigger)) {
    errors.push(`${field} must be an object`)
    return
  }
  if (!TRIGGER_TYPES.includes(trigger.type)) {
    errors.push(`${field}.type must be one of ${TRIGGER_TYPES.join(', ')}`)
    return
  }
  if (trigger.type === 'missionTime') {
    if (!isFiniteNumber(trigger.atSec) || trigger.atSec < 0) {
      errors.push(`${field}.atSec must be a finite number of seconds >= 0`)
    }
  } else if (trigger.type === 'area') {
    validateArea(trigger, field, errors)
  } else if (trigger.type === 'threshold') {
    validateThreshold(trigger, field, errors)
  }
}

function validateSetObject(values, field, errors) {
  if (!isPlainObject(values)) {
    errors.push(`${field} must be an object of store paths`)
    return
  }
  for (const [path, value] of Object.entries(values)) {
    if (!validatePath(path)) {
      errors.push(`${field}["${path}"] is not a valid dot path`)
    }
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      errors.push(`${field}["${path}"] must be a JSON value`)
    }
  }
}

function validateTimeline(timeline, errors) {
  if (!Array.isArray(timeline)) {
    errors.push('timeline must be an array')
    return
  }
  let previousAtSec = -Infinity
  timeline.forEach((entry, index) => {
    const field = `timeline[${index}]`
    if (!isPlainObject(entry)) {
      errors.push(`${field} must be an object`)
      return
    }
    if (!isFiniteNumber(entry.atSec)) {
      errors.push(`${field}.atSec must be a finite number of seconds`)
    } else {
      if (entry.atSec < previousAtSec) {
        errors.push(
          `${field}.atSec (${entry.atSec}) is before timeline[${index - 1}].atSec (${previousAtSec}); ` +
            'timeline entries must be ordered by atSec',
        )
      }
      previousAtSec = entry.atSec
    }
    if (!isPlainObject(entry.set) || Object.keys(entry.set).length === 0) {
      errors.push(`${field}.set must be a non-empty object of store paths`)
    } else {
      validateSetObject(entry.set, `${field}.set`, errors)
    }
  })
}

function validateAlert(alert, errors) {
  if (!isPlainObject(alert)) {
    errors.push('alert must be an object')
    return
  }
  if (!ALERT_LEVELS.includes(alert.level)) {
    errors.push(`alert.level must be one of ${ALERT_LEVELS.join(', ')}`)
  }
  if (typeof alert.text !== 'string' || alert.text.trim() === '') {
    errors.push('alert.text must be a non-empty string')
  }
}

function validatePlanner(planner, errors) {
  if (!isPlainObject(planner)) {
    errors.push('planner must be an object')
    return
  }
  if (planner.action !== 'replan') {
    errors.push('planner.action must be "replan"')
  }
  if (!PLANNER_TARGETS.includes(planner.target)) {
    errors.push(`planner.target must be one of ${PLANNER_TARGETS.join(', ')}`)
  }
}

function validateEnd(end, errors) {
  if (!isPlainObject(end)) {
    errors.push('end must be an object')
    return
  }
  if (!END_TYPES.includes(end.type)) {
    errors.push(`end.type must be one of ${END_TYPES.join(', ')}`)
    return
  }
  if (end.type === 'duration') {
    if (!isFiniteNumber(end.afterSec) || end.afterSec < 0) {
      errors.push('end.afterSec must be a finite number of seconds >= 0')
    }
  } else if (end.type === 'missionTime') {
    if (!isFiniteNumber(end.atSec) || end.atSec < 0) {
      errors.push('end.atSec must be a finite number of seconds >= 0')
    }
  } else if (end.type === 'area') {
    validateArea(end, 'end', errors)
  } else if (end.type === 'threshold') {
    validateThreshold(end, 'end', errors)
  }
}

/**
 * Validate one event definition without side effects.
 *
 * @param {unknown} definition Parsed event JSON.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateEvent(definition) {
  const errors = []

  if (!isPlainObject(definition)) {
    return { ok: false, errors: ['event must be a non-null object'] }
  }

  if (typeof definition.id !== 'string' || !ID_PATTERN.test(definition.id)) {
    errors.push('id must be a string of letters, digits, "_" or "-", starting with a letter or digit')
  }
  if (typeof definition.label !== 'string' || definition.label.trim() === '') {
    errors.push('label must be a non-empty string')
  }

  if (definition.trigger === undefined) {
    errors.push('trigger is required')
  } else {
    validateTrigger(definition.trigger, 'trigger', errors)
  }

  if (definition.timeline === undefined) {
    errors.push('timeline is required (use an empty array for an alert-only event)')
  } else {
    validateTimeline(definition.timeline, errors)
  }

  if (definition.alert === undefined) {
    errors.push('alert is required')
  } else {
    validateAlert(definition.alert, errors)
  }

  if (definition.planner !== undefined) validatePlanner(definition.planner, errors)
  if (definition.end !== undefined) validateEnd(definition.end, errors)
  if (definition.endSet !== undefined) validateSetObject(definition.endSet, 'endSet', errors)

  return { ok: errors.length === 0, errors }
}

function hasPosition(position) {
  return isPlainObject(position) && isFiniteNumber(position.x) && isFiniteNumber(position.z)
}

function isInsideArea(area, position) {
  if (!hasPosition(position)) return false
  const dx = position.x - area.x
  const dz = position.z - area.z
  return Math.sqrt(dx * dx + dz * dz) <= area.radius
}

function compare(value, op, threshold) {
  if (!isFiniteNumber(value) || !isFiniteNumber(threshold)) return false
  if (op === 'lt') return value < threshold
  if (op === 'lte') return value <= threshold
  if (op === 'gt') return value > threshold
  if (op === 'gte') return value >= threshold
  return false
}

function thresholdPasses(threshold, store) {
  return compare(store.get(threshold.path), threshold.op, threshold.value)
}

function triggerPasses(trigger, missionTimeSec, position, store) {
  if (trigger.type === 'missionTime') return missionTimeSec >= trigger.atSec
  if (trigger.type === 'area') return isInsideArea(trigger, position)
  if (trigger.type === 'threshold') return thresholdPasses(trigger, store)
  return false
}

function assertStore(store) {
  if (store === null || typeof store !== 'object') {
    throw new TypeError('createEventEngine: store is required')
  }
  for (const method of ['get', 'set', 'snapshot']) {
    if (typeof store[method] !== 'function') {
      throw new TypeError(`createEventEngine: store.${method} must be a function`)
    }
  }
}

function assertOptionalFunction(value, name) {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`createEventEngine: ${name} must be a function when provided`)
  }
}

/**
 * Create an event engine.
 *
 * @param {object} options
 * @param {object[]} options.events Event definitions (already parsed JSON).
 * @param {{ get: Function, set: Function, snapshot: Function }} options.store Store adapter.
 * @param {() => number} [options.getMissionTime] Current mission time for manual `fire()`/`end()`.
 * Defaults to the last time passed to `update()`.
 * @param {(request: { eventId: string, reason: string, target: string, missionTimeSec: number }) => void} [options.requestReplan]
 * Called once when an event with a planner block starts.
 * @param {(alert: object) => void} [options.writeAlert] Override the default `alerts.<eventId>` write.
 * @param {(eventId: string, alert: object) => void} [options.clearAlert] Override the default `null` write.
 * @param {(entry: { type: 'start' | 'end', eventId: string, missionTimeSec: number }) => void} [options.log]
 * Optional diagnostics callback; the engine never logs to the console.
 * @returns {object} Engine with `update`, `fire`, `end`, `getActive` and `listEvents`.
 */
export function createEventEngine(options) {
  if (!isPlainObject(options)) {
    throw new TypeError('createEventEngine: expected an options object')
  }

  const { events, store, getMissionTime, requestReplan, writeAlert, clearAlert, log } = options

  if (!Array.isArray(events)) {
    throw new TypeError('createEventEngine: events must be an array')
  }
  assertStore(store)
  assertOptionalFunction(getMissionTime, 'getMissionTime')
  assertOptionalFunction(requestReplan, 'requestReplan')
  assertOptionalFunction(writeAlert, 'writeAlert')
  assertOptionalFunction(clearAlert, 'clearAlert')
  assertOptionalFunction(log, 'log')

  const definitions = []
  const definitionErrors = []
  const seenIds = new Set()

  events.forEach((definition, index) => {
    const result = validateEvent(definition)
    const idPart = typeof definition?.id === 'string' && definition.id ? ` "${definition.id}"` : ''
    const context = `events[${index}]${idPart}`

    if (!result.ok) {
      for (const message of result.errors) definitionErrors.push(`${context}: ${message}`)
      return
    }
    if (seenIds.has(definition.id)) {
      definitionErrors.push(`${context}: duplicate event id`)
      return
    }
    seenIds.add(definition.id)
    definitions.push(deepFreeze(deepClone(definition)))
  })

  if (definitionErrors.length > 0) {
    throw new Error(`Invalid event definitions:\n- ${definitionErrors.join('\n- ')}`)
  }

  const states = new Map(
    definitions.map((definition) => [
      definition.id,
      { status: STATUS.idle, startedAtSec: null, nextTimelineIndex: 0, alert: null },
    ]),
  )

  let lastMissionTimeSec = 0
  const resolveMissionTime =
    getMissionTime ?? (() => lastMissionTimeSec)

  function readMissionTime() {
    const missionTimeSec = resolveMissionTime()
    if (!isFiniteNumber(missionTimeSec) || missionTimeSec < 0) {
      throw new TypeError('getMissionTime must return a finite number of seconds >= 0')
    }
    return missionTimeSec
  }

  function findDefinition(eventId) {
    const definition = definitions.find((item) => item.id === eventId)
    if (!definition) throw new Error(`Unknown event id "${String(eventId)}"`)
    return definition
  }

  function applySet(values) {
    for (const [path, value] of Object.entries(values)) store.set(path, value)
  }

  function applyTimeline(definition, state, elapsedSec) {
    while (state.nextTimelineIndex < definition.timeline.length) {
      const entry = definition.timeline[state.nextTimelineIndex]
      if (entry.atSec > elapsedSec) break
      applySet(entry.set)
      state.nextTimelineIndex += 1
    }
  }

  function publishAlert(definition, startedAtSec) {
    const alert = {
      id: definition.id,
      eventId: definition.id,
      level: definition.alert.level,
      text: definition.alert.text,
      startedAtSec,
      active: true,
    }
    if (writeAlert) writeAlert(alert)
    else store.set(`alerts.${definition.id}`, alert)
    return alert
  }

  function withdrawAlert(definition, alert) {
    if (clearAlert) clearAlert(definition.id, alert)
    else store.set(`alerts.${definition.id}`, null)
  }

  function startEvent(definition, missionTimeSec) {
    const state = states.get(definition.id)
    if (state.status !== STATUS.idle) return false

    state.status = STATUS.active
    state.startedAtSec = missionTimeSec
    state.nextTimelineIndex = 0
    state.alert = publishAlert(definition, missionTimeSec)

    applyTimeline(definition, state, 0)

    if (definition.planner) {
      requestReplan?.({
        eventId: definition.id,
        reason: definition.alert.text,
        target: definition.planner.target,
        missionTimeSec,
      })
    }

    log?.({ type: 'start', eventId: definition.id, missionTimeSec })
    return true
  }

  function shouldEnd(definition, state, missionTimeSec, position) {
    const end = definition.end
    if (!end) return false
    if (end.type === 'duration') return missionTimeSec - state.startedAtSec >= end.afterSec
    if (end.type === 'missionTime') return missionTimeSec >= end.atSec
    if (end.type === 'area') return isInsideArea(end, position)
    if (end.type === 'threshold') return thresholdPasses(end, store)
    return false
  }

  function endEvent(definition, state, missionTimeSec) {
    if (state.status !== STATUS.active) return false

    if (definition.endSet) applySet(definition.endSet)
    withdrawAlert(definition, state.alert)

    state.status = STATUS.ended
    state.alert = null
    log?.({ type: 'end', eventId: definition.id, missionTimeSec })
    return true
  }

  /**
   * Evaluate triggers, timelines and end conditions.
   *
   * Store changes made by an event are visible to threshold triggers on the
   * next update, not in the same one. Calling `update()` again with the same
   * mission time and position changes nothing.
   *
   * @param {number} missionTimeSec Seconds from the start of the EVA.
   * @param {{ x: number, z: number }} [position] Position in metres (x east, z south).
   * @returns {{ started: string[], ended: string[] }} Ids that changed state in this update.
   */
  function update(missionTimeSec, position) {
    if (!isFiniteNumber(missionTimeSec) || missionTimeSec < 0) {
      throw new TypeError('update: missionTimeSec must be a finite number of seconds >= 0')
    }
    lastMissionTimeSec = missionTimeSec

    const started = []
    const ended = []

    // Phase 1: decide every idle trigger from the store as it was at the start
    // of this update, then start them. No event can change another trigger
    // mid-frame, which keeps one update deterministic.
    const toStart = definitions.filter((definition) => {
      const state = states.get(definition.id)
      return state.status === STATUS.idle && triggerPasses(definition.trigger, missionTimeSec, position, store)
    })
    for (const definition of toStart) {
      if (startEvent(definition, missionTimeSec)) started.push(definition.id)
    }

    // Phase 2: advance timelines and check end conditions.
    for (const definition of definitions) {
      const state = states.get(definition.id)
      if (state.status !== STATUS.active) continue

      applyTimeline(definition, state, missionTimeSec - state.startedAtSec)

      if (shouldEnd(definition, state, missionTimeSec, position)) {
        if (endEvent(definition, state, missionTimeSec)) ended.push(definition.id)
      }
    }

    return { started, ended }
  }

  /**
   * Start an event by hand, bypassing its trigger. Useful for the demo debug
   * control. Events run at most once; firing an active or ended event does
   * nothing.
   *
   * @param {string} eventId
   * @returns {boolean} True when the event started.
   */
  function fire(eventId) {
    const definition = findDefinition(eventId)
    const state = states.get(definition.id)
    if (state.status !== STATUS.idle) return false
    const missionTimeSec = readMissionTime()
    if (missionTimeSec > lastMissionTimeSec) lastMissionTimeSec = missionTimeSec
    return startEvent(definition, missionTimeSec)
  }

  /**
   * End an active event immediately. Unknown ids throw; inactive events are a
   * no-op so debug buttons are safe to press twice.
   *
   * @param {string} eventId
   * @returns {boolean} True when the event was active and is now ended.
   */
  function end(eventId) {
    const definition = findDefinition(eventId)
    const state = states.get(definition.id)
    if (state.status !== STATUS.active) return false
    const missionTimeSec = readMissionTime()
    if (missionTimeSec > lastMissionTimeSec) lastMissionTimeSec = missionTimeSec
    return endEvent(definition, state, missionTimeSec)
  }

  /**
   * Active events in definition order, with elapsed time and the alert that
   * was written to the store.
   *
   * @returns {Array<{ id: string, label: string, startedAtSec: number, elapsedSec: number, alert: object | null }>}
   */
  function getActive() {
    const active = []
    for (const definition of definitions) {
      const state = states.get(definition.id)
      if (state.status !== STATUS.active) continue
      active.push({
        id: definition.id,
        label: definition.label,
        startedAtSec: state.startedAtSec,
        elapsedSec: Math.max(0, lastMissionTimeSec - state.startedAtSec),
        alert: state.alert ? { ...state.alert } : null,
      })
    }
    return active
  }

  /**
   * Id, label and trigger of every registered event, for a debug menu.
   *
   * @returns {Array<{ id: string, label: string, trigger: object }>}
   */
  function listEvents() {
    return definitions.map((definition) => ({
      id: definition.id,
      label: definition.label,
      trigger: deepClone(definition.trigger),
    }))
  }

  return { update, fire, end, getActive, listEvents }
}
