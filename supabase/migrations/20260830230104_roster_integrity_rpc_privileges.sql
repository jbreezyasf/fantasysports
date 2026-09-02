-- Explicitly remove PostgreSQL's default PUBLIC execute grant from
-- user-facing Roster Integrity RPCs. Authenticated users may invoke them;
-- each function still enforces manager/commissioner ownership internally.

revoke execute on function public.request_roster_integrity_review(uuid,text) from public,anon;
revoke execute on function public.resolve_roster_integrity_review(uuid,boolean,text) from public,anon;
revoke execute on function public.update_roster_integrity_settings(uuid,text,integer,integer,boolean,boolean) from public,anon;
revoke execute on function public.set_franchise_roster_lock(uuid,boolean,text) from public,anon;

grant execute on function public.request_roster_integrity_review(uuid,text) to authenticated;
grant execute on function public.resolve_roster_integrity_review(uuid,boolean,text) to authenticated;
grant execute on function public.update_roster_integrity_settings(uuid,text,integer,integer,boolean,boolean) to authenticated;
grant execute on function public.set_franchise_roster_lock(uuid,boolean,text) to authenticated;
