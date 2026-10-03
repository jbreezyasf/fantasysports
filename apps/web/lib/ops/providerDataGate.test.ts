import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public readonly to: string) {
      super(`REDIRECT:${to}`);
    }
  }
  return {
    RedirectSignal,
    user: null as null | { id: string; email?: string | null },
    staff: { data: null as null | { role: string }, error: null as null | { message: string } },
    staffThrows: false,
    adminThrows: false,
    staffQueries: 0
  };
});

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new state.RedirectSignal(to);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof state.RedirectSignal) throw error;
  }
}));

vi.mock('../supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } })
}));

vi.mock('../supabase/admin', () => ({
  createAdminClient: () => {
    if (state.adminThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured for this deployment.');
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'select', 'eq', 'is', 'order', 'limit']) chain[method] = () => chain;
    chain.maybeSingle = async () => {
      state.staffQueries += 1;
      if (state.staffThrows) throw new Error('network down');
      return state.staff;
    };
    return chain;
  }
}));

import { requireProviderDataOperator } from './permissions';
import { OPS_ROLES, canManageProviderData } from './permissionsCore';

async function outcome() {
  try {
    const session = await requireProviderDataOperator();
    return { allowed: true as const, session };
  } catch (error) {
    if (error instanceof state.RedirectSignal) return { allowed: false as const, to: error.to };
    throw error;
  }
}

describe('provider data operator gate', () => {
  beforeEach(() => {
    state.user = { id: 'user-1', email: 'manager@example.com' };
    state.staff = { data: null, error: null };
    state.staffThrows = false;
    state.adminThrows = false;
    state.staffQueries = 0;
    delete process.env.OPS_SUPER_ADMIN_EMAILS;
    delete process.env.OPS_SUPER_ADMIN_USER_IDS;
  });

  it('allows an operator with an active super_admin staff row', async () => {
    state.staff = { data: { role: 'super_admin' }, error: null };
    const result = await outcome();
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.session.user.id).toBe('user-1');
  });

  it('allows an operator configured through the owner environment allowlist', async () => {
    process.env.OPS_SUPER_ADMIN_USER_IDS = 'user-1';
    expect((await outcome()).allowed).toBe(true);
  });

  it('denies a league commissioner who has no staff role', async () => {
    // Commissioner status lives in league_members and is never consulted by the gate.
    state.staff = { data: null, error: null };
    expect(await outcome()).toEqual({ allowed: false, to: '/dashboard' });
    expect(state.staffQueries).toBe(1);
  });

  it('denies delegated staff roles that are not owner-level', async () => {
    for (const role of OPS_ROLES.filter(candidate => candidate !== 'super_admin')) {
      state.staff = { data: { role }, error: null };
      expect(await outcome()).toEqual({ allowed: false, to: '/dashboard' });
    }
  });

  it('denies an unknown role value', async () => {
    state.staff = { data: { role: 'commissioner' }, error: null };
    expect(await outcome()).toEqual({ allowed: false, to: '/dashboard' });
  });

  it('sends an unauthenticated user to login without consulting staff roles', async () => {
    state.user = null;
    expect(await outcome()).toEqual({ allowed: false, to: '/login?next=/admin/data' });
    expect(state.staffQueries).toBe(0);
  });

  it('denies when the staff lookup returns an error', async () => {
    state.staff = { data: { role: 'super_admin' }, error: { message: 'relation does not exist' } };
    expect(await outcome()).toEqual({ allowed: false, to: '/dashboard' });
  });

  it('denies when the staff lookup throws', async () => {
    state.staffThrows = true;
    expect(await outcome()).toEqual({ allowed: false, to: '/dashboard' });
  });

  it('denies when the service-role client cannot be created', async () => {
    state.adminThrows = true;
    expect(await outcome()).toEqual({ allowed: false, to: '/dashboard' });
  });

  it('only treats super_admin as able to manage provider data', () => {
    expect(canManageProviderData('super_admin')).toBe(true);
    expect(canManageProviderData(null)).toBe(false);
    expect(canManageProviderData(undefined)).toBe(false);
    expect(OPS_ROLES.filter(role => canManageProviderData(role))).toEqual(['super_admin']);
  });
});

describe('admin data boundary', () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../app/admin/data');
  const actions = readFileSync(join(dir, 'actions.ts'), 'utf8');
  const page = readFileSync(join(dir, 'page.tsx'), 'utf8');

  it('re-checks the operator gate inside every exported server action before the admin client', () => {
    const bodies = actions.split(/export async function /).slice(1);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      const gate = body.indexOf('await providerDataOperator()');
      expect(gate).toBeGreaterThan(-1);
      expect(gate).toBeLessThan(body.indexOf('createAdminClient()'));
    }
    expect(actions).toContain('await requireProviderDataOperator()');
  });

  it('gates the page on the operator check and never on commissioner role', () => {
    expect(page).toContain('await requireProviderDataOperator()');
    for (const source of [page, actions]) {
      expect(source).not.toMatch(/\.eq\('role',\s*'commissioner'\)/);
    }
  });
});
