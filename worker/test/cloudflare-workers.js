// Stand-in for the `cloudflare:workers` runtime module in vitest (alias in vite.config.js).
// The real DurableObject base class stores ctx and env the same way.
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
