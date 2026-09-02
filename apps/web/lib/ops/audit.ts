import 'server-only';

type AuditClient = {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

export async function recordOpsAuditEvent(
  admin: AuditClient,
  input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await admin.from('ops_audit_events').insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {}
  });
  if (error) return { recorded: false, error: error.message ?? 'Ops audit event was not recorded.' };
  return { recorded: true, error: null };
}
