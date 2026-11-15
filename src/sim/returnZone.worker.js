/**
 * Web Worker around the return zone (returnZone.js), so the two Dijkstra passes never block the 3D view or React.
 *
 * Request:  { type: 'setGrid', grid, constants }   grid: { n, width, depth, heights, blocked } of the cost grid;
 *             constants: suitConstantsFromHazards
 *           { type: 'zone', id, input }   input: computeReturnZone's input without grid and constants
 * Response: { type: 'gridReady' }
 *           { type: 'result', id, zone }   the zone's typed arrays are transferred, not copied
 *           { type: 'error', id, message }
 */

import { computeReturnZone } from './returnZone.js';

let grid = null, constants = null;

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'setGrid') {
    grid = message.grid;
    constants = message.constants;
    self.postMessage({ type: 'gridReady' });
    return;
  }
  if (message.type !== 'zone') {
    self.postMessage({ type: 'error', id: message.id, message: `unknown message type: ${message.type}` });
    return;
  }
  if (!grid || !constants) {
    self.postMessage({ type: 'error', id: message.id, message: 'no grid: send setGrid first' });
    return;
  }
  try {
    const zone = computeReturnZone({ ...message.input, grid, constants, now: () => performance.now() });
    const buffers = [zone.state, zone.marginSec, zone.toSec, zone.homeSec, zone.toO2G, zone.homeO2G].map((a) => a.buffer);
    self.postMessage({ type: 'result', id: message.id, zone }, buffers);
  } catch (error) {
    self.postMessage({ type: 'error', id: message.id, message: error instanceof Error ? error.message : String(error) });
  }
});
