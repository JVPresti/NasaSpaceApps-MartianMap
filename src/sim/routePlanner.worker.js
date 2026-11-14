/**
 * Web Worker wrapper around the A* planner.
 *
 * The grid is sent once with `setGrid`; each `plan` request then only sends the
 * waypoints and options, so the 3D view keeps its own copy and the main thread
 * stays responsive.
 *
 * Request:  { type: 'setGrid', grid }
 *           { type: 'plan', id, waypoints, options }
 * Response: { type: 'gridReady' }
 *           { type: 'result', id, result }
 *           { type: 'error', id, message }
 */

import { planRoute } from './routePlanner.js';

let grid = null;

function reply(message) {
  self.postMessage(message);
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'setGrid') {
    grid = message.grid;
    reply({ type: 'gridReady' });
    return;
  }

  if (message.type !== 'plan') {
    reply({ type: 'error', id: message.id, message: `unknown message type: ${message.type}` });
    return;
  }

  if (!grid) {
    reply({ type: 'error', id: message.id, message: 'no grid: send setGrid before planning' });
    return;
  }

  try {
    const result = planRoute(grid, message.waypoints, message.options);
    reply({ type: 'result', id: message.id, result });
  } catch (error) {
    reply({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
  }
});
