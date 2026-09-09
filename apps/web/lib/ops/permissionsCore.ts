export const OPS_ROLES = ['super_admin', 'ops_manager', 'support', 'content_manager', 'it_staff', 'read_only'] as const;
export type OpsRole = typeof OPS_ROLES[number];

export const OPS_PERMISSIONS = [
  'portal.access',
  'users.read',
  'leagues.read',
  'league_data.read',
  'data_health.read',
  'content.read',
  'content.draft',
  'technical_issues.read',
  'technical_artifacts.upload',
  'technical_changes.propose',
  'rollback.read',
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
  it_staff: new Set(['portal.access', 'users.read', 'leagues.read', 'league_data.read', 'data_health.read', 'technical_issues.read', 'technical_artifacts.upload', 'technical_changes.propose', 'rollback.read', 'audit.read']),
  read_only: new Set(['portal.access', 'users.read', 'leagues.read', 'league_data.read', 'data_health.read', 'audit.read'])
};

export function permissionsForRole(role: OpsRole) {
  return Array.from(rolePermissions[role]);
}

export function roleHasPermission(role: OpsRole, permission: OpsPermission) {
  return rolePermissions[role].has(permission);
}
