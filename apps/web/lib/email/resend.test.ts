import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendTransactionalEmail } from './resend';

const message = { to: 'manager@example.test', subject: 'Subject', html: '<p>Hi</p>', text: 'Hi' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sendTransactionalEmail', () => {
  it('refuses without a key and does not call the provider', async () => {
    vi.stubEnv('RESEND_BIGEXEC_API_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await sendTransactionalEmail(message)).toEqual({ sent: false, reason: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes extra headers and the idempotency key to the provider', async () => {
    vi.stubEnv('RESEND_BIGEXEC_API_KEY', 'test-key-not-real');
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ id: 'email_1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const result = await sendTransactionalEmail({ ...message, idempotencyKey: 'k1', headers: { 'List-Unsubscribe': '<https://bigexecfs.com/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
    expect(result).toEqual({ sent: true, id: 'email_1' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k1');
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ['manager@example.test'], text: 'Hi', headers: { 'List-Unsubscribe': '<https://bigexecfs.com/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
  });

  it('omits the headers field when none are given, as the invite email always has', async () => {
    vi.stubEnv('RESEND_BIGEXEC_API_KEY', 'test-key-not-real');
    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await sendTransactionalEmail(message);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1].body))).not.toHaveProperty('headers');
  });

  it('returns provider_error for a rejection and for a network failure instead of throwing', async () => {
    vi.stubEnv('RESEND_BIGEXEC_API_KEY', 'test-key-not-real');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
    expect(await sendTransactionalEmail(message)).toEqual({ sent: false, reason: 'provider_error', status: 429, detail: 'rate limited' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed'); }));
    expect(await sendTransactionalEmail(message)).toEqual({ sent: false, reason: 'provider_error', status: null, detail: 'fetch failed' });
  });
});
