// Fake browser WebSocket for the client tests. The test drives it: open(), receive(), drop().
export function createSocketFactory() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.sent = [];
      this.closedWith = null;
      sockets.push(this);
    }
    send(data) {
      if (this.readyState !== 1) throw new Error('not open');
      this.sent.push(data);
    }
    close(code) {
      this.closedWith = code ?? null;
      this.readyState = 3;
    }
    // test controls
    open() { this.readyState = 1; this.onopen?.({}); }
    receive(msg) { this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) }); }
    drop(code = 1006, reason = '') { this.readyState = 3; this.onclose?.({ code, reason }); }
    fail() { this.readyState = 3; this.onerror?.({}); this.onclose?.({ code: 1006, reason: '' }); }
    json() { return this.sent.filter((d) => d !== 'ping').map((d) => JSON.parse(d)); }
  }
  return { FakeWebSocket, sockets, last: () => sockets[sockets.length - 1] };
}

export const welcomeFor = (id, extra = {}) => ({
  type: 'welcome', you: { id, color: 0, role: 'surface' },
  crew: [{ id, name: 'Crew 1', color: 0, role: 'surface', joinedAt: 1 }],
  startedAt: null, seed: null, now: 1, markers: [], samples: [], caseHolder: null, route: null, go: null, ...extra,
});
