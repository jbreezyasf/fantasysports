export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export function staleStatus(updatedAt: string | null | undefined, warnHours: number, criticalHours: number, now = new Date()): HealthStatus {
  if (!updatedAt) return 'unknown';
  const updated = new Date(updatedAt).getTime();
  if (!Number.isFinite(updated)) return 'unknown';
  const hours = (now.getTime() - updated) / 36e5;
  if (hours >= criticalHours) return 'critical';
  if (hours >= warnHours) return 'warning';
  return 'healthy';
}

export function statusLabel(status: HealthStatus) {
  return status === 'healthy' ? 'Current' : status === 'warning' ? 'Stale' : status === 'critical' ? 'Critical' : 'Unknown';
}
