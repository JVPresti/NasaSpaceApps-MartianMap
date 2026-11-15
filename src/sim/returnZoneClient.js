/**
 * Main-thread client for returnZone.worker.js.
 *
 *   const zones = createReturnZoneClient();
 *   zones.setGrid(costGrid, constants);
 *   const zone = await zones.compute({ home, from, suit: { o2G, elapsedSec }, evaLimitSec, modifiers });
 *
 * Only the latest request matters: a request made while one is running replaces any request still waiting, and the
 * one it replaces resolves with null. No React and no three.js.
 */

/**
 * @param {{ workerFactory?: () => Worker }} [options]
 * @returns {{ setGrid: (grid: object, constants: object) => void, compute: (input: object) => Promise<object | null>,
 *   terminate: () => void }}
 */
export function createReturnZoneClient({ workerFactory } = {}) {
  const worker = workerFactory ? workerFactory() : new Worker(new URL('./returnZone.worker.js', import.meta.url), { type: 'module' });
  let nextId = 1, running = null, waiting = null, ready = false, terminated = false;

  function send(request) {
    running = request;
    worker.postMessage({ type: 'zone', id: request.id, input: request.input });
  }

  worker.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'gridReady') {
      ready = true;
      if (!running && waiting) { const next = waiting; waiting = null; send(next); }
      return;
    }
    if (!running || message.id !== running.id) return;
    const done = running;
    running = null;
    if (message.type === 'error') done.reject(new Error(message.message));
    else done.resolve(message.zone);
    if (waiting) { const next = waiting; waiting = null; send(next); }
  });

  return {
    setGrid(grid, constants) {
      const { n, width, depth, heights, blocked } = grid;
      worker.postMessage({ type: 'setGrid', grid: { n, width, depth, heights, blocked }, constants });
    },
    compute(input) {
      if (terminated) return Promise.resolve(null);
      return new Promise((resolve, reject) => {
        const request = { id: nextId++, input, resolve, reject };
        if (waiting) waiting.resolve(null);
        if (running || !ready) waiting = request;
        else send(request);
      });
    },
    terminate() {
      terminated = true;
      worker.terminate();
      running?.resolve(null);
      waiting?.resolve(null);
      running = null; waiting = null;
    },
  };
}
