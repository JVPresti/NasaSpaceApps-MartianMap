import { describe, expect, it, vi } from 'vitest';
import { createQualityController } from './quality.js';

function deferredApply() {
  const calls = [];
  const gates = [];
  return {
    calls,
    gates,
    apply: (tier) => new Promise((resolve, reject) => {
      calls.push(tier);
      gates.push({ resolve, reject });
    }),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('quality controller', () => {
  it('serialises two quick changes and resolves both callers with the final tier', async () => {
    const queue = deferredApply();
    const controller = createQualityController({
      apply: queue.apply,
      detect: () => 'high',
      initialTier: 'high',
      initialAuto: true,
    });

    const first = controller.request('high');
    const second = controller.request('low');
    expect(queue.calls).toEqual(['high']);   // Low waits for High, it never interleaves

    queue.gates[0].resolve();
    await flush();
    expect(queue.calls).toEqual(['high', 'low']);

    queue.gates[1].resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual({ tier: 'low', auto: false, pending: false, error: null });
    expect(b).toEqual(a);
    expect(controller.get()).toEqual({ tier: 'low', auto: false, pending: false, error: null });
  });

  it('applies the detected tier for Auto and keeps automatic degradation enabled', async () => {
    const applied = [];
    const controller = createQualityController({
      apply: async (tier) => { applied.push(tier); },
      detect: () => 'low',
      initialTier: 'high',
      initialAuto: false,
    });

    await expect(controller.request('auto')).resolves.toMatchObject({ tier: 'low', auto: true, pending: false });
    expect(applied).toEqual(['low']);
    expect(controller.get().auto).toBe(true);
  });

  it('keeps the current scene and reports the error when a tier cannot be applied', async () => {
    const onError = vi.fn();
    const controller = createQualityController({
      apply: async () => { throw new Error('texture 404'); },
      detect: () => 'high',
      initialTier: 'high',
      initialAuto: true,
      onError,
    });

    const result = await controller.request('low');
    expect(result).toMatchObject({ tier: 'high', auto: false, pending: false });
    expect(result.error).toBe('texture 404');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controller.get().tier).toBe('high');
  });

  it('only degrades automatically while Auto is in charge, and turns Auto off afterwards', async () => {
    const applied = [];
    const controller = createQualityController({
      apply: async (tier) => { applied.push(tier); },
      detect: () => 'high',
      initialTier: 'high',
      initialAuto: true,
    });

    await expect(controller.degrade('low')).resolves.toMatchObject({ tier: 'low', auto: false });
    expect(applied).toEqual(['low']);

    await controller.degrade('low');   // manual now: no second apply
    expect(applied).toEqual(['low']);

    await controller.request('auto');
    expect(controller.get().auto).toBe(true);
    await controller.degrade('low');
    expect(applied).toEqual(['low', 'high', 'low']);
    expect(controller.get().auto).toBe(false);
  });

  it('rejects an unknown quality name', () => {
    const controller = createQualityController({ apply: async () => {}, initialTier: 'high' });
    expect(() => controller.request('ultra')).toThrow(/quality must be one of/);
  });

  it('resolves pending callers on dispose instead of leaving the menu spinning', async () => {
    const queue = deferredApply();
    const controller = createQualityController({ apply: queue.apply, initialTier: 'high' });

    const request = controller.request('low');
    controller.dispose();
    await expect(request).resolves.toMatchObject({ pending: false, error: 'engine disposed' });

    // The late texture completion must not update a disposed controller.
    queue.gates[0].resolve();
    await flush();
    expect(controller.get().pending).toBe(false);
  });
});
