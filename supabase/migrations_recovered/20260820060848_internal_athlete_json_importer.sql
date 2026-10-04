-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820060848, name internal_athlete_json_importer. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.internal_import_athletes(p_competition_code text,p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_comp uuid; v_count int;
begin
  select id into v_comp from competitions where code=p_competition_code;
  if v_comp is null then raise exception 'Competition not found'; end if;
  insert into athletes(id,competition_id,real_team_id,display_name,position,active)
  select x.id,v_comp,x.real_team_id,x.display_name,x.position,coalesce(x.active,true)
  from jsonb_to_recordset(p_rows) as x(id uuid,real_team_id uuid,display_name text,position text,active boolean,provider text,provider_athlete_id text)
  on conflict(id) do update set real_team_id=excluded.real_team_id,display_name=excluded.display_name,position=excluded.position,active=excluded.active,updated_at=now();

  insert into athlete_provider_ids(athlete_id,provider,provider_athlete_id)
  select x.id,x.provider,x.provider_athlete_id
  from jsonb_to_recordset(p_rows) as x(id uuid,real_team_id uuid,display_name text,position text,active boolean,provider text,provider_athlete_id text)
  where x.provider is not null and x.provider_athlete_id is not null
  on conflict(provider,provider_athlete_id) do update set athlete_id=excluded.athlete_id;

  select count(*) into v_count from jsonb_array_elements(p_rows);
  return jsonb_build_object('imported',v_count);
end $$;
revoke all on function public.internal_import_athletes(text,jsonb) from public,anon,authenticated;
