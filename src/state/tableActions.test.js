import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage, t } from '../i18n/index.js';
import { setWristKeyOwner } from '../screens/wrist/ownership.js';
import { startEvaRunner } from './eva.js';
import { canEndEva, canOpenPlan, connectTableActions, END_EVA_KEY, OPEN_PLAN_KEY, tablePrompt } from './tableActions.js';
import { resetStore, useMissionStore } from './store.js';

function keyTarget() {
  const handlers = new Set();
  return {
    addEventListener: (type, fn) => handlers.add(fn),
    removeEventListener: (type, fn) => handlers.delete(fn),
    press: (code, extra = {}) => { const e = { code, preventDefault: vi.fn(), target: null, ...extra }; for (const fn of handlers) fn(e); return e; },
    handlers,
  };
}

/** A fake engine: the prompt it was given, and whether the player stands in the cabin ('main' or 'inner' zone). */
function fakeEngine(cabin = true) {
  const engine = { setHabitatPrompt: vi.fn(), inHabitatCabin: vi.fn(() => engine.cabin), cabin };
  return engine;
}

const PATH = [[535, 574], [520, 560]];
const atHabitat = (patch = {}) => useMissionStore.setState((s) => ({
  mode: 'walk', mission: { ...s.mission, paused: false }, route: { ...s.route, path: PATH },
  eva: { ...s.eva, phase: 'active', atHabitat: true, ...patch },
}));
const lastPrompt = (engine) => engine.setHabitatPrompt.mock.calls.at(-1)[0];
const rowTexts = (engine) => lastPrompt(engine).rows.map((r) => [r.key, r.text, r.dim]);
const connected = [];
const connect = (engine, options = {}) => {
  const target = keyTarget(), onOpenPlan = vi.fn(() => true);
  const actions = connectTableActions(engine, { onOpenPlan, store: useMissionStore, target, ...options });
  connected.push(actions);
  return { target, onOpenPlan, actions };
};

beforeEach(() => resetStore());
afterEach(() => {
  while (connected.length) connected.pop().disconnect();
  setWristKeyOwner(false);
  setLanguage('en');
});

describe('the habitat table actions (#244)', () => {
  it('ends the EVA only during the EVA, back at the habitat, walking with the mission running', () => {
    expect(canEndEva(useMissionStore.getState())).toBe(false);
    atHabitat();
    expect(canEndEva(useMissionStore.getState())).toBe(true);
    useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true } }));
    expect(canEndEva(useMissionStore.getState())).toBe(false);
  });

  it('shows both actions over the table and finishes the EVA on X in the cabin', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan, actions } = connect(engine);
    expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith(null);   // the table in Plan: nothing to offer
    target.press('KeyX');
    expect(useMissionStore.getState().eva.endRequested).toBe(false);

    atHabitat();
    expect(rowTexts(engine)).toEqual([
      [OPEN_PLAN_KEY, t('tableprompt.open.plan'), false],
      [END_EVA_KEY, t('tableprompt.finish.eva'), false],
    ]);
    target.press('KeyX', { repeat: true });
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
    const e = target.press('KeyX');
    expect(useMissionStore.getState().eva.endRequested).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onOpenPlan).not.toHaveBeenCalled();

    actions.disconnect();
    connected.length = 0;
    expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith(null);
    expect(target.handlers.size).toBe(0);
  });

  it('opens the plan on E in the cabin', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan } = connect(engine);
    atHabitat();
    const e = target.press('KeyE');
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
  });

  it('with no plan yet reads "Make a plan" and still opens the table', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan } = connect(engine);
    atHabitat();
    useMissionStore.setState((s) => ({ route: { ...s.route, path: null } }));
    expect(rowTexts(engine)[0]).toEqual([OPEN_PLAN_KEY, t('tableprompt.make.plan'), false]);
    target.press('KeyE');
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it('with no EVA in progress dims the second row, says so, and X does nothing', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan } = connect(engine);
    atHabitat({ phase: 'ready', atHabitat: false });   // e.g. the EVA runner never started
    expect(rowTexts(engine)).toEqual([
      [OPEN_PLAN_KEY, t('tableprompt.open.plan'), false],
      [END_EVA_KEY, t('tableprompt.no.eva'), true],
    ]);
    const e = target.press('KeyX');
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    target.press('KeyE');
    expect(onOpenPlan).toHaveBeenCalledTimes(1);   // the plan still opens
  });

  it('acts only in the cabin, where the prompt shows: not on the steps, porch, airlock or the circle outside', () => {
    const engine = fakeEngine(false);
    const { target, onOpenPlan, actions } = connect(engine);
    atHabitat();   // eva.atHabitat is also true on the steps, the porch, in the airlock and within 5 m outside
    expect(target.press('KeyX').preventDefault).not.toHaveBeenCalled();
    expect(target.press('KeyE').preventDefault).not.toHaveBeenCalled();
    actions.padAction('end-eva');
    actions.padAction('open-plan');
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
    expect(onOpenPlan).not.toHaveBeenCalled();

    engine.cabin = true;   // walks into the cabin
    target.press('KeyE');
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it('still finishes the EVA from the cabin when shelters.json failed to load', () => {
    // simulation.js then starts the runner without the HAB entry: only the habitat's walk zones count as back
    const runner = startEvaRunner({
      store: useMissionStore, habitat: null, habitatZoneAt: () => 'main', setInterval: () => 0, clearInterval: () => {},
    });
    try {
      const engine = fakeEngine();
      const { target } = connect(engine);
      useMissionStore.setState((s) => ({ mode: 'walk', mission: { ...s.mission, paused: false, elapsedSec: 60 }, navigation: { ...s.navigation, x: 541, z: 582 } }));
      runner.tick();
      expect(useMissionStore.getState().eva).toMatchObject({ phase: 'active', atHabitat: true });
      expect(rowTexts(engine)[1]).toEqual([END_EVA_KEY, t('tableprompt.finish.eva'), false]);
      target.press('KeyX');
      runner.tick();
      expect(useMissionStore.getState().eva.phase).toBe('ended');
      expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith(null);   // the debrief: mission paused, no prompt
    } finally {
      runner.stop();
    }
  });

  it('ignores a paused mission, Plan, key repeat, modifier keys and typing in a field', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan } = connect(engine);
    atHabitat();
    for (const extra of [{ repeat: true }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } }, { target: { isContentEditable: true } }]) {
      target.press('KeyE', extra);
      target.press('KeyX', extra);
    }
    expect(onOpenPlan).not.toHaveBeenCalled();
    expect(useMissionStore.getState().eva.endRequested).toBe(false);

    useMissionStore.setState((s) => ({ mission: { ...s.mission, paused: true } }));
    expect(engine.setHabitatPrompt).toHaveBeenLastCalledWith(null);
    expect(canOpenPlan(useMissionStore.getState())).toBe(false);
    target.press('KeyE'); target.press('KeyX');
    useMissionStore.setState((s) => ({ mode: 'plan', mission: { ...s.mission, paused: false } }));
    expect(tablePrompt(useMissionStore.getState())).toBeNull();
    target.press('KeyE'); target.press('KeyX');
    expect(onOpenPlan).not.toHaveBeenCalled();
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
  });

  it('leaves E and X to the wrist screen while it is up (#231)', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan, actions } = connect(engine);
    atHabitat();
    setWristKeyOwner(true);
    expect(target.press('KeyX').preventDefault).not.toHaveBeenCalled();
    target.press('KeyE');
    expect(actions.padAction('open-plan')).toBe(true);   // still the table's, so the app never sees it
    expect(useMissionStore.getState().eva.endRequested).toBe(false);
    expect(onOpenPlan).not.toHaveBeenCalled();
    setWristKeyOwner(false);
    target.press('KeyX');
    expect(useMissionStore.getState().eva.endRequested).toBe(true);
  });

  it('leaves E to the sample while the scoop is busy, and dims Open plan until then', () => {
    const engine = fakeEngine();
    const { target, onOpenPlan } = connect(engine);
    atHabitat();
    useMissionStore.setState((s) => ({ sampling: { ...s.sampling, status: { phase: 'holding' } } }));   // sampling.js stows on E
    expect(rowTexts(engine)[0]).toEqual([OPEN_PLAN_KEY, t('tableprompt.open.plan'), true]);
    target.press('KeyE');
    useMissionStore.setState((s) => ({ sampling: { ...s.sampling, status: { phase: 'stowing' } } }));   // the stow ran first
    target.press('KeyE');
    expect(onOpenPlan).not.toHaveBeenCalled();
    useMissionStore.setState((s) => ({ sampling: { ...s.sampling, status: { phase: 'idle' } } }));
    expect(rowTexts(engine)[0][2]).toBe(false);
    target.press('KeyE');
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it('takes the gamepad A and X in the cabin like E and X, and passes every other pad action on', () => {
    const engine = fakeEngine();
    const { onOpenPlan, actions } = connect(engine);
    atHabitat();
    expect(actions.padAction('mode')).toBe(false);
    expect(actions.padAction('layer-next')).toBe(false);
    expect(actions.padAction('open-plan')).toBe(true);
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(actions.padAction('end-eva')).toBe(true);
    expect(useMissionStore.getState().eva.endRequested).toBe(true);
  });

  it('does not claim E when the app could not open the table', () => {
    const engine = fakeEngine(), refuse = vi.fn(() => false);   // the app is busy, or not playing
    const { target } = connect(engine, { onOpenPlan: refuse });
    atHabitat();
    expect(target.press('KeyE').preventDefault).not.toHaveBeenCalled();
    expect(refuse).toHaveBeenCalledTimes(1);
  });

  it('redraws the prompt in the chosen language', () => {
    const engine = fakeEngine();
    connect(engine);
    atHabitat();
    setLanguage('es');
    expect(rowTexts(engine)).toEqual([
      [OPEN_PLAN_KEY, 'Abrir el plan', false],
      [END_EVA_KEY, 'Terminar la EVA', false],
    ]);
  });
});
