import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Runs public/sw.js inside a mocked ServiceWorkerGlobalScope.

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../public/sw.js'), 'utf8');
const ORIGIN = 'https://bigexecfs.com';

type Handler = (event: Record<string, unknown>) => void;

function boot(windows: Array<Record<string, unknown>> = []) {
  const handlers = new Map<string, Handler>();
  const cache = { addAll: vi.fn(async () => undefined) };
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => ['big-exec-shell-v0', 'big-exec-shell-v1']),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => 'cached-response')
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: { claim: vi.fn(async () => undefined), matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => ({ opened: true })) }
  };
  const fetch = vi.fn(async () => 'network-response');
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch);
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    const waits: Array<Promise<unknown>> = [];
    let response: Promise<unknown> | undefined;
    handlers.get(type)!({ ...event, waitUntil: (promise: Promise<unknown>) => waits.push(promise), respondWith: (promise: Promise<unknown>) => { response = promise; } });
    await Promise.all(waits);
    return { responded: response !== undefined, response: await response };
  };
  return { handlers, self, caches, cache, fetch, dispatch };
}

const pushEvent = (payload: unknown) => ({ data: payload === undefined ? null : { json: () => { if (typeof payload === 'string') throw new SyntaxError('not json'); return payload; } } });
const clickEvent = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });

let sw: ReturnType<typeof boot>;
beforeEach(() => { sw = boot(); });

describe('service worker: existing caching behaviour is unchanged', () => {
  it('still registers install, activate and fetch, and adds push and notificationclick', () => {
    expect([...sw.handlers.keys()]).toEqual(['install', 'activate', 'fetch', 'push', 'notificationclick']);
  });

  it('pre-caches only the brand assets on install and drops old caches on activate', async () => {
    await sw.dispatch('install', {});
    expect(sw.caches.open).toHaveBeenCalledWith('big-exec-shell-v1');
    expect(sw.cache.addAll).toHaveBeenCalledWith(['/icons/icon-192.png', '/icons/icon-512.png', '/brand/be-crown-mark-v1.webp']);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    await sw.dispatch('activate', {});
    expect(sw.caches.delete).toHaveBeenCalledTimes(1);
    expect(sw.caches.delete).toHaveBeenCalledWith('big-exec-shell-v0');
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });

  it('answers only same-origin GETs for brand assets and leaves every other request alone', async () => {
    const asset = await sw.dispatch('fetch', { request: { method: 'GET', url: `${ORIGIN}/icons/icon-192.png` } });
    expect(asset).toEqual({ responded: true, response: 'cached-response' });
    for (const request of [
      { method: 'GET', url: `${ORIGIN}/dashboard` },
      { method: 'GET', url: `${ORIGIN}/api/push/subscribe` },
      { method: 'POST', url: `${ORIGIN}/icons/icon-192.png` },
      { method: 'GET', url: 'https://elsewhere.example/icons/icon-192.png' }
    ]) expect((await sw.dispatch('fetch', { request })).responded).toBe(false);
  });
});

describe('service worker: push', () => {
  it('shows the notification from the payload with a same-origin URL', async () => {
    await sw.dispatch('push', pushEvent({ title: 'Chaos Week: new rules', body: 'Read the rules.', url: '/leagues/abc', tag: 'announcement-1', lang: 'en' }));
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Chaos Week: new rules', {
      body: 'Read the rules.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'announcement-1', lang: 'en', data: { url: `${ORIGIN}/leagues/abc` }
    });
  });

  it('falls back to a generic notice for an empty or non-JSON payload', async () => {
    for (const payload of [undefined, 'plain text', { body: 'no title' }]) await sw.dispatch('push', pushEvent(payload));
    expect(sw.self.registration.showNotification).toHaveBeenCalledTimes(3);
    for (const call of sw.self.registration.showNotification.mock.calls as unknown as Array<[string, { data: { url: string } }]>) {
      expect(call[0]).toBe('Big Exec Fantasy Sports');
      expect(call[1].data.url).toBe(`${ORIGIN}/dashboard`);
    }
  });

  it('never keeps a cross-origin URL from a payload', async () => {
    for (const url of ['https://evil.example/phish', '//evil.example', 'javascript:alert(1)']) await sw.dispatch('push', pushEvent({ title: 't', url }));
    for (const call of sw.self.registration.showNotification.mock.calls as unknown as Array<[string, { data: { url: string } }]>) expect(call[1].data.url).toBe(`${ORIGIN}/dashboard`);
  });
});

describe('service worker: notificationclick', () => {
  it('closes the notification and opens the target when no window is open', async () => {
    const event = clickEvent(`${ORIGIN}/leagues/abc`);
    await sw.dispatch('notificationclick', event);
    expect(event.notification.close).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/leagues/abc`);
  });

  it('focuses an open Big Exec window, navigating it to the target', async () => {
    const focused = { focus: vi.fn(async () => 'focused') };
    const open = { url: `${ORIGIN}/dashboard`, navigate: vi.fn(async () => focused), focus: vi.fn() };
    sw = boot([{ url: 'https://other.example/', focus: vi.fn() }, open]);
    await sw.dispatch('notificationclick', clickEvent(`${ORIGIN}/leagues/abc`));
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/leagues/abc`);
    expect(focused.focus).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('just focuses a window already on the target', async () => {
    const open = { url: `${ORIGIN}/leagues/abc`, navigate: vi.fn(), focus: vi.fn(async () => 'focused') };
    sw = boot([open]);
    await sw.dispatch('notificationclick', clickEvent(`${ORIGIN}/leagues/abc`));
    expect(open.navigate).not.toHaveBeenCalled();
    expect(open.focus).toHaveBeenCalled();
  });

  it('opens the dashboard instead of a cross-origin or missing URL, and opens a window if navigation fails', async () => {
    await sw.dispatch('notificationclick', clickEvent('https://evil.example/'));
    await sw.dispatch('notificationclick', { notification: { close: vi.fn(), data: null } });
    expect(sw.self.clients.openWindow.mock.calls).toEqual([[`${ORIGIN}/dashboard`], [`${ORIGIN}/dashboard`]]);

    const open = { url: `${ORIGIN}/dashboard`, navigate: vi.fn(async () => { throw new Error('cannot navigate'); }), focus: vi.fn() };
    sw = boot([open]);
    await sw.dispatch('notificationclick', clickEvent(`${ORIGIN}/leagues/abc`));
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/leagues/abc`);
  });
});
