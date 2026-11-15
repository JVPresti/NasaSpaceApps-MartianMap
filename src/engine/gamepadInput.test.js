import { describe, expect, it } from 'vitest';
import {
  PAD_BUTTONS, PAD_DEAD_ZONE, applyDeadZone, createGamepadPoller, readPad,
} from './gamepadInput.js';

// Standard mapping exposes 17 buttons; a fake keeps every index addressable like the real list.
const BUTTON_COUNT = 17;

/**
 * @param {{ id?: string, mapping?: string, axes?: number[], pressed?: number[] }} [options]
 * @returns {object} a fake standard-mapping pad
 */
function makePad({ id = 'Fake pad', mapping = 'standard', axes = [0, 0, 0, 0], pressed = [] } = {}) {
  const held = new Set(pressed);
  return {
    id,
    mapping,
    axes: axes.slice(),
    buttons: Array.from({ length: BUTTON_COUNT }, (_, index) => ({
      pressed: held.has(index),
      value: held.has(index) ? 1 : 0,
    })),
  };
}

describe('applyDeadZone', () => {
  it('returns 0 at the centre and anywhere inside the dead zone', () => {
    expect(applyDeadZone(0)).toBe(0);
    expect(applyDeadZone(0.01)).toBe(0);
    expect(applyDeadZone(PAD_DEAD_ZONE)).toBe(0);
    expect(applyDeadZone(-PAD_DEAD_ZONE)).toBe(0);
  });

  it('remaps the remaining travel back to the full range and keeps the sign', () => {
    expect(applyDeadZone(1)).toBe(1);
    expect(applyDeadZone(-1)).toBe(-1);
    expect(applyDeadZone(0.56, 0.12)).toBeCloseTo(0.5, 10);
    expect(applyDeadZone(-0.56, 0.12)).toBeCloseTo(-0.5, 10);
    expect(applyDeadZone(0.3, 0.1)).toBeCloseTo(0.2 / 0.9, 10);
  });

  it('clamps out-of-range values and maps non-finite input to 0', () => {
    expect(applyDeadZone(4)).toBe(1);
    expect(applyDeadZone(-4)).toBe(-1);
    expect(applyDeadZone(Number.NaN)).toBe(0);
    expect(applyDeadZone(Infinity)).toBe(0);
    expect(applyDeadZone(-Infinity)).toBe(0);
  });
});

describe('readPad', () => {
  it('reports a missing pad as neutral', () => {
    for (const pad of [null, undefined]) {
      const reading = readPad(pad);
      expect(reading.connected).toBe(false);
      expect(reading.id).toBeNull();
      expect(reading.mapping).toBe('');
      expect(reading.moveX).toBe(0);
      expect(reading.moveY).toBe(0);
      expect(reading.lookX).toBe(0);
      expect(reading.lookY).toBe(0);
      expect(reading.jog).toBe(false);
      expect(reading.modePressed).toBe(false);
      expect(reading.layerPrevPressed).toBe(false);
      expect(reading.layerNextPressed).toBe(false);
      expect(reading.modeDown).toBe(false);
      expect(reading.layerPrevDown).toBe(false);
      expect(reading.layerNextDown).toBe(false);
    }
  });

  it('ignores stick deflection inside the dead zone', () => {
    const pad = makePad({ axes: [0.1, -0.1, 0.05, 0.05] });
    const reading = readPad(pad);
    expect(reading.connected).toBe(true);
    expect(reading).toMatchObject({ moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
  });

  it('reports the left stick with forward positive and the right stick with down positive', () => {
    // Stick up is negative on the standard mapping; the walk input wants forward positive.
    expect(readPad(makePad({ axes: [0, -1, 0, 0] })).moveY).toBe(1);
    expect(readPad(makePad({ axes: [0, 1, 0, 0] })).moveY).toBe(-1);
    expect(readPad(makePad({ axes: [1, 0, 0, 0] })).moveX).toBe(1);
    expect(readPad(makePad({ axes: [-1, 0, 0, 0] })).moveX).toBe(-1);
    // Positive dy looks down, matching the engine's look(dx, dy).
    expect(readPad(makePad({ axes: [0, 0, 1, 0] })).lookX).toBe(1);
    expect(readPad(makePad({ axes: [0, 0, 0, 1] })).lookY).toBe(1);
    expect(readPad(makePad({ axes: [0, 0, 0, -1] })).lookY).toBe(-1);
  });

  it('clamps a diagonal push to a magnitude of 1 without changing its direction', () => {
    const reading = readPad(makePad({ axes: [1, -1, 1, 1] }));
    expect(Math.hypot(reading.moveX, reading.moveY)).toBeCloseTo(1, 10);
    expect(reading.moveX).toBeCloseTo(Math.SQRT1_2, 10);
    expect(reading.moveY).toBeCloseTo(Math.SQRT1_2, 10);
    expect(Math.hypot(reading.lookX, reading.lookY)).toBeCloseTo(1, 10);
    expect(reading.lookX).toBeCloseTo(Math.SQRT1_2, 10);
    expect(reading.lookY).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it('treats non-finite axes as 0', () => {
    const reading = readPad(makePad({ axes: [Number.NaN, Infinity, -Infinity, Number.NaN] }));
    expect(reading).toMatchObject({ moveX: 0, moveY: 0, lookX: 0, lookY: 0 });
    expect(Number.isFinite(reading.moveX)).toBe(true);
    expect(Number.isFinite(reading.lookY)).toBe(true);
  });

  it('reads L3 as jog and keeps the reported id and mapping', () => {
    const pad = makePad({ id: 'Pad X', mapping: '', pressed: [PAD_BUTTONS.jog] });
    const reading = readPad(pad);
    expect(reading.jog).toBe(true);
    expect(reading.id).toBe('Pad X');
    expect(reading.mapping).toBe('');
    expect(readPad(makePad()).jog).toBe(false);
  });

  it('does not reject a pad with a non-standard mapping', () => {
    const reading = readPad(makePad({ mapping: 'xinput', axes: [1, 0, 0, 0] }));
    expect(reading.connected).toBe(true);
    expect(reading.mapping).toBe('xinput');
    expect(reading.moveX).toBe(1);
  });

  it('fires each button once while held and again after a release', () => {
    const held = makePad({ pressed: [PAD_BUTTONS.layerNext] });

    const first = readPad(held);
    expect(first.layerNextPressed).toBe(true);
    expect(first.layerNextDown).toBe(true);

    const second = readPad(held, first);
    expect(second.layerNextPressed).toBe(false);
    expect(second.layerNextDown).toBe(true);

    const released = readPad(makePad(), second);
    expect(released.layerNextDown).toBe(false);
    expect(released.layerNextPressed).toBe(false);

    const again = readPad(held, released);
    expect(again.layerNextPressed).toBe(true);
  });

  it('accepts a partial or empty previous reading', () => {
    const held = makePad({ pressed: [PAD_BUTTONS.mode] });
    expect(readPad(held, {}).modePressed).toBe(true);
    expect(readPad(held, undefined).modePressed).toBe(true);
    expect(readPad(held, { modeDown: true }).modePressed).toBe(false);
    expect(readPad(held, { layerPrevDown: true }).modePressed).toBe(true);
  });

  it('treats a missing buttons array or a missing button entry as not pressed', () => {
    const noButtons = { id: 'Bare pad', mapping: '', axes: [0, 0, 0, 0] };
    const reading = readPad(noButtons);
    expect(reading.connected).toBe(true);
    expect(reading.jog).toBe(false);
    expect(reading.modeDown).toBe(false);
    expect(reading.layerPrevDown).toBe(false);
    expect(reading.layerNextDown).toBe(false);

    const short = { id: 'Short pad', mapping: 'standard', axes: [0, 0, 0, 0], buttons: [null, { pressed: true }] };
    expect(readPad(short).layerNextDown).toBe(false);
    expect(readPad(short).jog).toBe(false);
  });
});

describe('gamepad poller', () => {
  it('polls a neutral reading while no pad is connected', () => {
    const poller = createGamepadPoller({ getPads: () => [null, null] });
    expect(poller.poll()).toEqual({
      connected: false,
      moveX: 0,
      moveY: 0,
      lookX: 0,
      lookY: 0,
      jog: false,
      actions: [],
      used: false,
      firstUse: false,
    });
    expect(poller.isUsed()).toBe(false);
  });

  it('picks the first non-null pad in the list', () => {
    let pads = [null, undefined, makePad({ axes: [1, 0, 0, 0] }), makePad({ axes: [-1, 0, 0, 0] })];
    const poller = createGamepadPoller({ getPads: () => pads });
    expect(poller.poll().moveX).toBe(1);

    pads = [makePad({ axes: [0.5, 0, 0, 0] })];
    expect(poller.poll().moveX).toBeCloseTo(applyDeadZone(0.5), 10);
  });

  it('reports the rising edges in a fixed action order', () => {
    const pad = makePad({ pressed: [PAD_BUTTONS.mode, PAD_BUTTONS.layerNext, PAD_BUTTONS.layerPrev] });
    const poller = createGamepadPoller({ getPads: () => [pad] });
    expect(poller.poll().actions).toEqual(['mode', 'layer-prev', 'layer-next']);
    // Still held: no further edges.
    expect(poller.poll().actions).toEqual([]);
  });

  it('reports A and X once per press as the habitat table actions, on buttons no other action uses', () => {
    expect(PAD_BUTTONS.openPlan).toBe(0);
    expect(PAD_BUTTONS.endEva).toBe(2);
    const indices = Object.values(PAD_BUTTONS);
    expect(new Set(indices).size).toBe(indices.length);

    let pads = [makePad({ pressed: [PAD_BUTTONS.openPlan, PAD_BUTTONS.endEva] })];
    const poller = createGamepadPoller({ getPads: () => pads });
    const first = poller.poll();
    expect(first.actions).toEqual(['open-plan', 'end-eva']);
    expect(first.firstUse).toBe(true);
    expect(poller.poll().actions).toEqual([]);   // held
    pads = [makePad()];
    poller.poll();
    pads = [makePad({ pressed: [PAD_BUTTONS.endEva] })];
    expect(poller.poll().actions).toEqual(['end-eva']);
  });

  it('raises used once, stays used while connected and in use, and never repeats firstUse', () => {
    let pads = [makePad()];
    const poller = createGamepadPoller({ getPads: () => pads });

    const idle = poller.poll();
    expect(idle.used).toBe(false);
    expect(idle.firstUse).toBe(false);

    pads = [makePad({ axes: [0, -1, 0, 0] })];
    const first = poller.poll();
    expect(first.used).toBe(true);
    expect(first.firstUse).toBe(true);
    expect(poller.isUsed()).toBe(true);

    const second = poller.poll();
    expect(second.used).toBe(true);
    expect(second.firstUse).toBe(false);

    pads = [makePad()]; // connected but idle: the hint stays spent
    const quiet = poller.poll();
    expect(quiet.used).toBe(true);
    expect(quiet.firstUse).toBe(false);

    pads = [null]; // disconnect leaves `used` alone
    const gone = poller.poll();
    expect(gone.connected).toBe(false);
    expect(gone.used).toBe(true);
    expect(gone.firstUse).toBe(false);
  });

  it('counts a mapped button press as use', () => {
    const poller = createGamepadPoller({ getPads: () => [makePad({ pressed: [PAD_BUTTONS.mode] })] });
    const result = poller.poll();
    expect(result.used).toBe(true);
    expect(result.firstUse).toBe(true);
    expect(result.actions).toEqual(['mode']);
  });

  it('reports jog from L3', () => {
    const poller = createGamepadPoller({ getPads: () => [makePad({ pressed: [PAD_BUTTONS.jog] })] });
    expect(poller.poll().jog).toBe(true);
  });

  it('reset forgets a held button so it can fire again on resume', () => {
    const held = makePad({ pressed: [PAD_BUTTONS.mode] });
    const poller = createGamepadPoller({ getPads: () => [held] });

    expect(poller.poll().actions).toEqual(['mode']);
    expect(poller.poll().actions).toEqual([]);

    poller.reset();
    expect(poller.isUsed()).toBe(false);

    const resumed = poller.poll();
    expect(resumed.actions).toEqual(['mode']);
    expect(resumed.used).toBe(true);
    expect(resumed.firstUse).toBe(true);
  });

  it('reset zeroes the output while no pad is connected', () => {
    let pads = [makePad({ axes: [1, 0, 0, 0], pressed: [PAD_BUTTONS.jog] })];
    const poller = createGamepadPoller({ getPads: () => pads });
    poller.poll();

    poller.reset();
    pads = [null];
    expect(poller.poll()).toMatchObject({ moveX: 0, moveY: 0, jog: false, actions: [], used: false, firstUse: false });
  });

  it('does not throw when getPads returns null, garbage or a broken pad', () => {
    const results = [null, undefined, 0, 'nope', {}, [null, undefined], [{}], [{ axes: null, buttons: null }]];
    for (const value of results) {
      const poller = createGamepadPoller({ getPads: () => value });
      expect(() => poller.poll()).not.toThrow();
    }

    const broken = createGamepadPoller({ getPads: () => [{ axes: null, buttons: null }] });
    const reading = broken.poll();
    expect(reading.connected).toBe(true);
    expect(reading).toMatchObject({ moveX: 0, moveY: 0, lookX: 0, lookY: 0, jog: false, actions: [] });

    const refusing = createGamepadPoller({
      getPads: () => {
        throw new Error('gamepad access denied');
      },
    });
    expect(() => refusing.poll()).not.toThrow();
    expect(refusing.poll().connected).toBe(false);
  });
});
