import 'server-only';
import { redirect } from 'next/navigation';
import { createAdminClient } from '../supabase/admin';
import { createClient } from '../supabase/server';
export { OPS_PERMISSIONS, OPS_ROLES, permissionsForRole, roleHasPermission } from './permissionsCore';
export type { OpsPermission, OpsRole };
import { OPS_ROLES, permissionsForRole, roleHasPermission, type OpsPermission, type OpsRole } from './permissionsCore';

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
