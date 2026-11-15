// Worker entry. Static files are served from dist/ before this code runs; wrangler.jsonc sends only /api/*
// here (run_worker_first). The only route is the room WebSocket, GET /api/room/:code (docs/deploy.md, Rooms).
import { normalizeRoomCode } from '../src/net/protocol.js';

// The v1 migration in wrangler.jsonc creates this class, so the entry has to export it.
export { Room } from './room.js';

const ROOM_ROUTE = /^\/api\/room\/([^/]+)\/?$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const text = (status, body, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...headers } });

/**
 * A browser always sends Origin on a WebSocket upgrade. Allowed: the request's own host (production, every
 * preview host and `wrangler dev`), and, only when the Worker itself runs on localhost, a localhost Origin on
 * any port (the Vite dev server proxies /api with the browser's http://localhost:5173 Origin). A page served
 * from someone's localhost cannot open production or preview rooms. Missing or anything else: refused.
 */
export function originAllowed(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  let url;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const target = new URL(request.url);
  if (url.host === target.host) return true;
  return LOCAL_HOSTS.has(url.hostname) && LOCAL_HOSTS.has(target.hostname);
}

/**
 * Checks, in order: route (404), room code (400), method (405), Upgrade header (426), Origin (403). Then it
 * hands the request to the room's Durable Object, named by the upper-case code.
 */
export function handleRequest(request, ctx) {
  const match = ROOM_ROUTE.exec(new URL(request.url).pathname);
  if (!match) return text(404, 'Not found');
  let raw;
  try { raw = decodeURIComponent(match[1]); } catch { return text(400, 'Bad room code'); }
  const code = normalizeRoomCode(raw);
  if (!code) return text(400, 'Bad room code');
  if (request.method !== 'GET') return text(405, 'Method not allowed', { allow: 'GET' });
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return text(426, 'Expected a WebSocket upgrade', { upgrade: 'websocket' });
  if (!originAllowed(request)) return text(403, 'Origin not allowed');
  return ctx.exports.Room.getByName(code).fetch(request);
}

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, ctx);
  },
};
