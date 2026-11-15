import { describe, expect, it } from 'vitest';
import { createReturnZoneClient } from './returnZoneClient.js';

/** A stand-in for returnZone.worker.js: records what it is sent; the test answers by hand. */
function fakeWorker() {
  const listeners = new Set();
  return {
    sent: [],
    terminated: false,
    addEventListener: (type, f) => type === 'message' && listeners.add(f),
    postMessage(message) { this.sent.push(message); },
    terminate() { this.terminated = true; },
    reply(data) { listeners.forEach((f) => f({ data })); },
  };
}

const grid = { n: 2, width: 2, depth: 2, heights: new Float32Array(4), blocked: new Uint8Array(4), cost: new Float32Array(4) };

describe('createReturnZoneClient', () => {
  it('sends only the grid fields the zone needs, and waits for gridReady before the first zone', async () => {
    const w = fakeWorker();
    const client = createReturnZoneClient({ workerFactory: () => w });
    client.setGrid(grid, { o2UsableG: 771 });
    expect(Object.keys(w.sent[0].grid).sort()).toEqual(['blocked', 'depth', 'heights', 'n', 'width']);
    const zone = client.compute({ home: { x: 0, z: 0 } });
    expect(w.sent).toHaveLength(1);   // held until the grid is in
    w.reply({ type: 'gridReady' });
    expect(w.sent[1]).toMatchObject({ type: 'zone', input: { home: { x: 0, z: 0 } } });
    w.reply({ type: 'result', id: w.sent[1].id, zone: { stats: { reachM: 10 } } });
    await expect(zone).resolves.toEqual({ stats: { reachM: 10 } });
  });

  it('keeps only the latest request while one runs: the replaced one resolves null', async () => {
    const w = fakeWorker();
    const client = createReturnZoneClient({ workerFactory: () => w });
    client.setGrid(grid, {});
    w.reply({ type: 'gridReady' });
    const first = client.compute({ n: 1 });
    const second = client.compute({ n: 2 });
    const third = client.compute({ n: 3 });
    await expect(second).resolves.toBeNull();
    expect(w.sent.filter((m) => m.type === 'zone')).toHaveLength(1);
    w.reply({ type: 'result', id: w.sent[1].id, zone: 'one' });
    await expect(first).resolves.toBe('one');
    expect(w.sent[2].input).toEqual({ n: 3 });
    w.reply({ type: 'error', id: w.sent[2].id, message: 'boom' });
    await expect(third).rejects.toThrow('boom');
  });

  it('ignores answers to other ids and resolves everything null on terminate', async () => {
    const w = fakeWorker();
    const client = createReturnZoneClient({ workerFactory: () => w });
    client.setGrid(grid, {});
    w.reply({ type: 'gridReady' });
    const running = client.compute({});
    w.reply({ type: 'result', id: 999, zone: 'stale' });
    client.terminate();
    await expect(running).resolves.toBeNull();
    expect(w.terminated).toBe(true);
    await expect(client.compute({})).resolves.toBeNull();
  });
});
