import { describe, expect, it } from 'vitest';
import { OPS_ROLES, permissionsForRole, roleHasPermission } from './permissionsCore';

describe('ops permissions', () => {
  it('includes a limited IT staff role for future delegated technical work', () => {
    expect(OPS_ROLES).toContain('it_staff');
    expect(roleHasPermission('it_staff', 'portal.access')).toBe(true);
    expect(roleHasPermission('it_staff', 'technical_issues.read')).toBe(true);
    expect(roleHasPermission('it_staff', 'technical_artifacts.upload')).toBe(true);
    expect(roleHasPermission('it_staff', 'technical_changes.propose')).toBe(true);
    expect(roleHasPermission('it_staff', 'rollback.read')).toBe(true);
  });

  it('does not give IT staff owner-only authority or destructive delete capability', () => {
    const permissions = permissionsForRole('it_staff');
    expect(permissions).not.toContain('staff.manage');
    expect(permissions).not.toContain('data.delete');
    expect(permissions).not.toContain('deployment.delete');
  });
});
