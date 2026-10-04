-- triggers.sql — Triggers on public tables, then triggers on other schemas that execute a public function.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== triggers: 10 object(s) =====
-- Query:
--   select (c.relname || '.' || t.tgname)::text as ord, pg_get_triggerdef(t.oid, true) || ';' as text
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and not t.tgisinternal

-- beta_feedback_submissions.beta_feedback_submissions_immutable_delete
CREATE TRIGGER beta_feedback_submissions_immutable_delete BEFORE DELETE ON beta_feedback_submissions FOR EACH ROW EXECUTE FUNCTION prevent_beta_feedback_submission_changes();

-- beta_feedback_submissions.beta_feedback_submissions_immutable_update
CREATE TRIGGER beta_feedback_submissions_immutable_update BEFORE UPDATE ON beta_feedback_submissions FOR EACH ROW EXECUTE FUNCTION prevent_beta_feedback_submission_changes();

-- draft_picks.draft_picks_remove_queued_asset
CREATE TRIGGER draft_picks_remove_queued_asset AFTER UPDATE OF athlete_id, real_team_id, picked_at ON draft_picks FOR EACH ROW EXECUTE FUNCTION remove_drafted_asset_from_queues();

-- draft_queues.draft_queues_touch_updated_at
CREATE TRIGGER draft_queues_touch_updated_at BEFORE UPDATE ON draft_queues FOR EACH ROW EXECUTE FUNCTION touch_draft_queue_updated_at();

-- drafts.drafts_create_circuit_schedule
CREATE TRIGGER drafts_create_circuit_schedule AFTER UPDATE OF status ON drafts FOR EACH ROW WHEN (new.status = 'completed'::text AND old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION create_circuit_schedule_after_draft();

-- drafts.drafts_late_start_completion
CREATE TRIGGER drafts_late_start_completion AFTER UPDATE OF status ON drafts FOR EACH ROW EXECUTE FUNCTION record_late_start_draft_completion();

-- drafts.drafts_post_completion_letter
CREATE TRIGGER drafts_post_completion_letter AFTER UPDATE OF status ON drafts FOR EACH ROW WHEN (new.status = 'completed'::text AND old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION post_draft_completion_letter();

-- franchises.provision_franchise_stadium_after_insert
CREATE TRIGGER provision_franchise_stadium_after_insert AFTER INSERT ON franchises FOR EACH ROW EXECUTE FUNCTION provision_franchise_stadium();

-- roster_entries.roster_entries_prevent_started_drop
CREATE TRIGGER roster_entries_prevent_started_drop BEFORE UPDATE OF dropped_at ON roster_entries FOR EACH ROW EXECUTE FUNCTION prevent_started_roster_asset_drop();

-- roster_entries.roster_entries_roster_integrity
CREATE TRIGGER roster_entries_roster_integrity BEFORE UPDATE OF dropped_at ON roster_entries FOR EACH ROW EXECUTE FUNCTION enforce_roster_integrity_drop();

-- ===== triggers_external: 1 object(s) =====
-- Query:
--   select (n.nspname || '.' || c.relname || '.' || t.tgname)::text as ord, pg_get_triggerdef(t.oid, true) || ';' as text
--   from pg_trigger t
--   join pg_class c on c.oid = t.tgrelid
--   join pg_namespace n on n.oid = c.relnamespace
--   join pg_proc p on p.oid = t.tgfoid
--   join pg_namespace pn on pn.oid = p.pronamespace
--   where pn.nspname = 'public' and n.nspname <> 'public' and not t.tgisinternal

-- auth.users.on_auth_user_created_profile
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile();
