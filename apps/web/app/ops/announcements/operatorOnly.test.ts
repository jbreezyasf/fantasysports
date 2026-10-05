import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => {
  class RedirectSignal extends Error {
    constructor(public readonly to: string) { super(`REDIRECT:${to}`); }
  }
  return {
    RedirectSignal,
    user: null as null | { id: string; email?: string | null },
    staff: { data: null as null | { role: string }, error: null as null | { message: string } },
    adminThrows: false,
    writes: [] as string[],
    sends: [] as string[]
  };
});

vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new state.RedirectSignal(to); },
  unstable_rethrow: (error: unknown) => { if (error instanceof state.RedirectSignal) throw error; },
  notFound: () => { throw new Error('NOT_FOUND'); }
}));

vi.mock('../../../lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } })
}));

vi.mock('../../../lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (state.adminThrows) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured for this deployment.');
    const chain: Record<string, unknown> = {};
    let table = '';
    chain.from = (name: string) => { table = name; return chain; };
    for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit']) chain[method] = () => chain;
    for (const method of ['insert', 'update']) chain[method] = () => { state.writes.push(`${method}:${table}`); return chain; };
    chain.maybeSingle = async () => (table === 'ops_staff_roles' ? state.staff : { data: null, error: null });
    chain.single = async () => ({ data: { id: '5b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10' }, error: null });
    chain.then = (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null });
    chain.rpc = async (name: string) => { state.writes.push(`rpc:${name}`); return { data: null, error: null }; };
    return chain;
  }
}));

vi.mock('../../../lib/notifications/service', () => ({
  sendAnnouncement: async (input: { mode: string }) => {
    state.sends.push(input.mode);
    return { ok: false, code: 'sending_disabled', message: 'Sending is switched off.' };
  }
}));

import { OPS_ROLES, canSendAnnouncements, permissionsForRole } from '../../../lib/ops/permissionsCore';
import { requireAnnouncementOperator } from '../../../lib/ops/permissions';
import { cancelAnnouncement, createAnnouncementDraft, dryRunAnnouncement, saveAnnouncementDraft, sendLiveAnnouncement, sendTestAnnouncement } from './actions';
import OpsAnnouncementsPage from './page';
import OpsAnnouncementPage from './[notificationId]/page';

const ID = '5b0e6f0a-5c1d-4c59-9a55-2f3c0d1f4a10';

function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ notification_id: ID, confirm: 'SEND', expected_members: '0', seed: 'chaos-week-2026', ...fields })) data.set(key, value);
  return data;
}

async function redirectOf(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof state.RedirectSignal) return error.to;
    throw error;
  }
}

const everything: Array<[string, () => Promise<unknown>]> = [
  ['list page', () => OpsAnnouncementsPage({ searchParams: Promise.resolve({}) })],
  ['detail page', () => OpsAnnouncementPage({ params: Promise.resolve({ notificationId: ID }), searchParams: Promise.resolve({}) })],
  ['create draft', () => createAnnouncementDraft(form())],
  ['save draft', () => saveAnnouncementDraft(form())],
  ['cancel', () => cancelAnnouncement(form())],
  ['dry run', () => dryRunAnnouncement(form())],
  ['send test', () => sendTestAnnouncement(form())],
  ['send live', () => sendLiveAnnouncement(form())]
];

beforeEach(() => {
  state.user = null;
  state.staff = { data: null, error: null };
  state.adminThrows = false;
  state.writes = [];
  state.sends = [];
  vi.unstubAllEnvs();
  vi.stubEnv('OPS_SUPER_ADMIN_USER_IDS', '');
  vi.stubEnv('OPS_SUPER_ADMIN_EMAILS', '');
});

describe('announcements are operator-only', () => {
  it('grants the permission to super_admin and to no delegated role', () => {
    for (const role of OPS_ROLES) {
      expect(canSendAnnouncements(role)).toBe(role === 'super_admin');
      expect(permissionsForRole(role).includes('announcements.send')).toBe(role === 'super_admin');
    }
    expect(canSendAnnouncements(null)).toBe(false);
    expect(canSendAnnouncements(undefined)).toBe(false);
  });

  it('sends a signed-out visitor to login from every page and action, with no write and no send', async () => {
    for (const [name, run] of everything) expect(await redirectOf(run), name).toBe('/login?next=/ops/announcements');
    expect(state.writes).toEqual([]);
    expect(state.sends).toEqual([]);
  });

  it('turns away a league manager, every delegated ops role, an unknown role and a failed lookup', async () => {
    state.user = { id: 'user-1', email: 'manager@example.test' };
    const cases: Array<[string, () => void]> = [
      ['no staff row', () => { state.staff = { data: null, error: null }; }],
      ...OPS_ROLES.filter(role => role !== 'super_admin').map(role => [role, () => { state.staff = { data: { role }, error: null }; }] as [string, () => void]),
      ['unknown role', () => { state.staff = { data: { role: 'commissioner' }, error: null }; }],
      ['lookup error', () => { state.staff = { data: null, error: { message: 'boom' } }; }],
      ['no service role key', () => { state.adminThrows = true; }]
    ];
    for (const [label, arrange] of cases) {
      state.adminThrows = false;
      arrange();
      for (const [name, run] of everything) expect(await redirectOf(run), `${label} / ${name}`).toBe('/dashboard');
    }
    expect(state.writes).toEqual([]);
    expect(state.sends).toEqual([]);
  });

  it('lets a super_admin through, by staff row or by the owner allowlist', async () => {
    state.user = { id: 'owner-1', email: 'Owner@Example.test' };
    state.staff = { data: { role: 'super_admin' }, error: null };
    expect((await requireAnnouncementOperator()).role).toBe('super_admin');

    state.staff = { data: null, error: null };
    vi.stubEnv('OPS_SUPER_ADMIN_EMAILS', 'owner@example.test');
    expect((await requireAnnouncementOperator()).role).toBe('super_admin');
  });

  it('for an operator, a live send still needs the typed confirmation', async () => {
    state.user = { id: 'owner-1', email: 'owner@example.test' };
    state.staff = { data: { role: 'super_admin' }, error: null };
    const refused = await redirectOf(() => sendLiveAnnouncement(form({ confirm: 'send' })));
    expect(decodeURIComponent(refused ?? '')).toContain('Not sent. Type SEND');
    expect(state.sends).toEqual([]);
  });
});
