import { describe, expect, it, vi } from 'vitest';
import { createPointerLock } from './pointerLock.js';

function fakeDocument() {
  const doc = new EventTarget();
  doc.pointerLockElement = null;
  doc.exits = 0;
  doc.exitPointerLock = () => {
    doc.exits += 1;
    doc.pointerLockElement = null;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  return doc;
}

function fakeElement(doc, behavior = 'legacy') {
  const element = {
    requests: 0,
    requestPointerLock: vi.fn(() => {
      element.requests += 1;
      if (behavior === 'throw') throw new Error('denied');
      if (behavior === 'reject') return Promise.reject(new Error('denied'));
      if (behavior === 'resolve-before-change') {
        doc.pointerLockElement = element;
        return Promise.resolve();
      }
      if (behavior === 'resolve-early') return Promise.resolve();   // resolves before the element is locked
      return undefined;
    }),
  };
  return element;
}

function grant(doc, element) {
  doc.pointerLockElement = element;
  doc.dispatchEvent(new Event('pointerlockchange'));
}

function deny(doc) {
  doc.dispatchEvent(new Event('pointerlockerror'));
}

describe('pointer lock controller', () => {
  it('supports the legacy void request through the change event', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    const request = lock.request();
    expect(lock.isLocked()).toBe(false);
    grant(doc, element);

    await expect(request).resolves.toBe(true);
    expect(lock.isLocked()).toBe(true);
    expect(changes).toEqual([true]);

    lock.release();
    expect(doc.exits).toBe(1);
    expect(lock.isLocked()).toBe(false);
    expect(changes).toEqual([true, false]);
    lock.dispose();
  });

  it('does not report success when the promise resolves before the lock is real', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc, 'resolve-early');
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    const request = lock.request();
    let settled = 'pending';
    request.then((value) => { settled = value; });
    await Promise.resolve();
    await Promise.resolve();
    // The browser promise is done, but pointerLockElement is not: no success yet, no early notification.
    expect(settled).toBe('pending');
    expect(lock.isLocked()).toBe(false);
    expect(changes).toEqual([]);

    grant(doc, element);   // the real grant arrives through the change event
    await expect(request).resolves.toBe(true);
    expect(lock.isLocked()).toBe(true);
    expect(changes).toEqual([true]);
    lock.dispose();
  });

  it('supports a promise-returning request that resolves before the change event', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc, 'resolve-before-change');
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    await expect(lock.request()).resolves.toBe(true);
    expect(lock.isLocked()).toBe(true);
    // The promise already reported the lock; the later change event must not report it twice.
    expect(changes).toEqual([true]);
    lock.dispose();
  });

  it('returns false when the request rejects or throws', async () => {
    const rejectingDoc = fakeDocument();
    const rejecting = createPointerLock({
      document: rejectingDoc,
      element: fakeElement(rejectingDoc, 'reject'),
      timeoutMs: 0,
    });
    await expect(rejecting.request()).resolves.toBe(false);
    expect(rejecting.isLocked()).toBe(false);
    rejecting.dispose();

    const throwingDoc = fakeDocument();
    const throwing = createPointerLock({
      document: throwingDoc,
      element: fakeElement(throwingDoc, 'throw'),
      timeoutMs: 0,
    });
    await expect(throwing.request()).resolves.toBe(false);
    throwing.dispose();
  });

  it('settles false at once when requestPointerLock is missing, so the menu can offer drag-to-look (#197)', async () => {
    const doc = fakeDocument();
    const schedule = vi.fn(() => 1);
    const changes = [];
    const lock = createPointerLock({ document: doc, element: {}, setTimeout: schedule, onChange: (on) => changes.push(on) });

    await expect(lock.request()).resolves.toBe(false);
    await expect(lock.request()).resolves.toBe(false);
    expect(schedule).not.toHaveBeenCalled();   // no 3 s watchdog wait before the fallback appears
    expect(lock.isWanted()).toBe(false);
    expect(changes).toEqual([]);
    lock.dispose();
  });

  it('leaves no pending request after a denial, so a retry asks the browser again (#197)', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0 });

    const first = lock.request();
    deny(doc);
    await expect(first).resolves.toBe(false);
    expect(lock.isWanted()).toBe(false);

    const second = lock.request();
    expect(element.requests).toBe(2);
    grant(doc, element);
    await expect(second).resolves.toBe(true);
    lock.dispose();
  });

  it('reports a browser pointer-lock error without pretending the lock succeeded', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    const request = lock.request();
    deny(doc);
    await expect(request).resolves.toBe(false);
    expect(lock.isLocked()).toBe(false);
    expect(changes).toEqual([]);
    lock.dispose();
  });

  it('shares one in-flight request and settles every concurrent caller', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0 });

    const first = lock.request();
    const second = lock.request();
    expect(element.requests).toBe(1);
    expect(second).toBe(first);

    grant(doc, element);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    lock.dispose();
  });

  it('resolves an already locked request at once without a second browser request', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0 });

    grant(doc, element);   // external lock (for example, another caller)
    // Nobody asked for it in this controller: it is released as an unwanted lock.
    expect(doc.exits).toBe(1);
    doc.pointerLockElement = element;   // simulate the browser refusing to exit instantly
    await expect(lock.request()).resolves.toBe(true);
    expect(element.requests).toBe(0);
    lock.dispose();
  });

  it('times out safely and releases a late lock instead of resuming behind a menu', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    let fireTimeout = null;
    const clear = vi.fn();
    const changes = [];
    const lock = createPointerLock({
      document: doc,
      element,
      timeoutMs: 10,
      setTimeout: (fn) => { fireTimeout = fn; return 5; },
      clearTimeout: clear,
      onChange: (on) => changes.push(on),
    });

    const request = lock.request();
    fireTimeout();
    await expect(request).resolves.toBe(false);
    expect(changes).toEqual([]);

    grant(doc, element);
    expect(doc.exits).toBe(1);
    // The unwanted lock must not produce a "locked" notification.
    expect(changes).toEqual([]);
    lock.dispose();
  });

  it('release cancels a pending request and dispose removes the listeners', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    const request = lock.request();
    lock.release();
    await expect(request).resolves.toBe(false);

    grant(doc, element);
    expect(doc.exits).toBe(1);
    expect(changes).toEqual([]);

    lock.dispose();
    // After dispose an external change is no longer relayed.
    doc.pointerLockElement = element;
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(changes).toEqual([]);
    expect(doc.exits).toBe(1);
  });

  it('cancels a pending promise request and releases a late grant', async () => {
    const doc = fakeDocument();
    let resolveBrowser = null;
    const element = {
      requestPointerLock: vi.fn(() => new Promise((resolve) => { resolveBrowser = resolve; })),
    };
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    const request = lock.request();
    lock.release();   // for example, Plan opened while the browser was still answering
    await expect(request).resolves.toBe(false);

    resolveBrowser();   // the browser answers after the interface stopped waiting
    await Promise.resolve();
    expect(lock.isLocked()).toBe(false);
    expect(changes).toEqual([]);

    grant(doc, element);   // and then grants the lock late: it must be released, not reported
    expect(doc.exits).toBe(1);
    expect(changes).toEqual([]);
    lock.dispose();
  });

  it('reports an external unlock, which is how Esc reaches the app', async () => {
    const doc = fakeDocument();
    const element = fakeElement(doc);
    const changes = [];
    const lock = createPointerLock({ document: doc, element, timeoutMs: 0, onChange: (on) => changes.push(on) });

    const request = lock.request();
    grant(doc, element);
    await request;
    expect(changes).toEqual([true]);

    doc.pointerLockElement = null;   // the browser handled Esc; no exitPointerLock call here
    doc.dispatchEvent(new Event('pointerlockchange'));
    expect(changes).toEqual([true, false]);
    lock.dispose();
  });
});
