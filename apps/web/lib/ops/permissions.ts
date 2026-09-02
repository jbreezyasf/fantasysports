import 'server-only';
import { redirect } from 'next/navigation';
import { createAdminClient } from '../supabase/admin';
import { createClient } from '../supabase/server';

export const OPS_ROLES = ['super_admin', 'ops_manager', 'support', 'content_manager', 'read_only'] as const;
export type OpsRole = typeof OPS_ROLES[number];

export const OPS_PERMISSIONS = [
  'portal.access',
  'users.read',
  'leagues.read',
  'league_data.read',
  'data_health.read',
  'content.read',
  'content.draft',
  'audit.read',
  'staff.manage',
  'assistant_gm_usage.read'
] as const;
export type OpsPermission = typeof OPS_PERMISSIONS[number];

const rolePermissions: Record<OpsRole, ReadonlySet<OpsPermission>> = {
  super_admin: new Set(OPS_PERMISSIONS),
  ops_manager: new Set(['portal.access', 'users.read', 'leagues.read', 'league_data.read', 'data_health.read', 'audit.read', 'assistant_gm_usage.read']),
  support: new Set(['portal.access', 'users.read', 'leagues.read', 'league_data.read', 'audit.read']),
  content_manager: new Set(['portal.access', 'content.read', 'content.draft', 'audit.read']),
  read_only: new Set(['portal.access', 'users.read', 'leagues.read', 'league_data.read', 'data_health.read', 'audit.read'])
};

export type OpsSession = {
  user: { id: string; email?: string | null };
  role: OpsRole;
  permissions: OpsPermission[];
};

function parseList(value: string | undefined) {
  return new Set((value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
}

export function permissionsForRole(role: OpsRole) {
  return Array.from(rolePermissions[role]);
}

export function roleHasPermission(role: OpsRole, permission: OpsPermission) {
  return rolePermissions[role].has(permission);
}

export function roleFromEnv(user: { id: string; email?: string | null }) {
  const userIds = parseList(process.env.OPS_SUPER_ADMIN_USER_IDS);
  const emails = parseList(process.env.OPS_SUPER_ADMIN_EMAILS);
  return userIds.has(user.id.toLowerCase()) || emails.has((user.email ?? '').toLowerCase()) ? 'super_admin' satisfies OpsRole : null;
}

export async function getOpsSession(): Promise<OpsSession | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/ops');

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
