// Worker entry. Static files are served from dist/ before this code runs;
// wrangler.jsonc sends only /api/* here (run_worker_first). Rooms arrive in #52.
import { DurableObject } from 'cloudflare:workers';

// One Durable Object per room code. The v1 migration in wrangler.jsonc creates
// this class, so it has to be exported from the entry even before it does anything.
export class Room extends DurableObject {
  async fetch() {
    return new Response('Not found', { status: 404 });
  }
}

export default {
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};
