import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const createClientMock = vi.hoisted(() => vi.fn(() => ({ admin: true })));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

describe('createAdminClient', () => {
  it('uses the checked-in public Supabase URL fallback for server-only admin access', async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
    vi.resetModules();

    const { createAdminClient } = await import('./admin');
    createAdminClient();

    expect(createClientMock).toHaveBeenCalledWith(
      'https://njjiqdqhmcbxblwhfade.supabase.co',
      'service-role-test-key',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });
});
