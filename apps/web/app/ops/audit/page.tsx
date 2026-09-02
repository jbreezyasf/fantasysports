import { createAdminClient } from '../../../lib/supabase/admin';
import { recordOpsAuditEvent } from '../../../lib/ops/audit';
import { loadOpsAudit } from '../../../lib/ops/data';
import { requireOpsPermission } from '../../../lib/ops/permissions';

export default async function OpsAuditPage() {
  const session = await requireOpsPermission('audit.read');
  const data = await loadOpsAudit();
  await recordOpsAuditEvent(createAdminClient(), { actorUserId: session.user.id, action: 'ops.view_audit', targetType: 'ops_audit_events' });

  return (
    <>
      <section className="opsHero compactHero">
        <p className="eyebrow">AUDIT</p>
        <h1>Portal activity</h1>
        <p>Internal read trail for sensitive portal views and future ops actions.</p>
      </section>
      {data.error && <p className="errorNotice" role="alert">Audit table unavailable: {data.error}</p>}
      <section className="opsPanel">
        <div className="opsSectionHead"><div><p className="eyebrow">RECENT EVENTS</p><h2>Ops audit log</h2></div><span>{data.events.length}</span></div>
        <div className="opsList">
          {data.events.map((event: { id: string; actor_user_id: string | null; action: string; target_type: string; target_id: string | null; created_at: string }) => (
            <div className="opsRow" key={event.id}>
              <div><span>{new Date(event.created_at).toLocaleString()}</span><strong>{event.action}</strong><small>{event.target_type}{event.target_id ? ` / ${event.target_id}` : ''}</small></div>
              <b className="mono">{event.actor_user_id?.slice(0, 8) ?? 'system'}</b>
            </div>
          ))}
          {!data.events.length && !data.error && <p className="opsEmpty">No ops audit events recorded yet.</p>}
        </div>
      </section>
    </>
  );
}
