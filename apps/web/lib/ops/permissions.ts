import 'server-only';
import { redirect, unstable_rethrow } from 'next/navigation';
import { createAdminClient } from '../supabase/admin';
import { createClient } from '../supabase/server';
export { OPS_PERMISSIONS, OPS_ROLES, canManageProviderData, canSendAnnouncements, permissionsForRole, roleHasPermission } from './permissionsCore';
export type { OpsPermission, OpsRole };
import { OPS_ROLES, canManageProviderData, canSendAnnouncements, permissionsForRole, roleHasPermission, type OpsPermission, type OpsRole } from './permissionsCore';

export type OpsSession = {
  user: { id: string; email?: string | null };
  role: OpsRole;
  permissions: OpsPermission[];
};

function parseList(value: string | undefined) {
  return new Set((value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
}

export function roleFromEnv(user: { id: string; email?: string | null }) {
  const userIds = parseList(process.env.OPS_SUPER_ADMIN_USER_IDS);
  const emails = parseList(process.env.OPS_SUPER_ADMIN_EMAILS);
  return userIds.has(user.id.toLowerCase()) || emails.has((user.email ?? '').toLowerCase()) ? 'super_admin' satisfies OpsRole : null;
}

export async function getOpsSession(loginNext = '/ops'): Promise<OpsSession | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${loginNext}`);

  const envRole = roleFromEnv(user);
  if (envRole) return { user, role: envRole, permissions: permissionsForRole(envRole) };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const { data, error } = await admin
    .from('ops_staff_roles')
    .select('role')
    .eq('user_id', user.id)
    .is('disabled_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !OPS_ROLES.includes(data.role as OpsRole)) return null;
  const role = data.role as OpsRole;
  return { user, role, permissions: permissionsForRole(role) };
}

export async function requireOpsPermission(permission: OpsPermission) {
  const session = await getOpsSession();
  if (!session || !roleHasPermission(session.role, permission)) redirect('/dashboard');
  return session;
}

// Gate for provider-data management (/admin/data and its server actions). Fails closed:
// unauthenticated users go to login; a missing staff row, a disabled or unknown role, a
// non-owner role, or any lookup failure sends the caller to /dashboard without acting.
export async function requireProviderDataOperator(loginNext = '/admin/data') {
  let session: OpsSession | null = null;
  try {
    session = await getOpsSession(loginNext);
  } catch (error) {
    unstable_rethrow(error);
    session = null;
  }
  if (!session || !canManageProviderData(session.role)) redirect('/dashboard');
  return session;
}

// Gate for /ops/announcements and every one of its server actions. Fails closed in the same
// way as requireProviderDataOperator: only an enabled super_admin gets through.
export async function requireAnnouncementOperator(loginNext = '/ops/announcements') {
  let session: OpsSession | null = null;
  try {
    session = await getOpsSession(loginNext);
  } catch (error) {
    unstable_rethrow(error);
    session = null;
  }
  if (!session || !canSendAnnouncements(session.role)) redirect('/dashboard');
  return session;
}
