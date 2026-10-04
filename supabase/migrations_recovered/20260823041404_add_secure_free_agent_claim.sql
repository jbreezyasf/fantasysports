-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260823041404, name add_secure_free_agent_claim. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.claim_free_agent(
  p_season_franchise_id uuid,
  p_athlete_id uuid default null,
  p_real_team_id uuid default null,
  p_drop_roster_entry_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_season_id uuid;
  v_roster_config jsonb;
  v_roster_limit integer;
  v_active_count integer;
  v_new_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;
  if ((p_athlete_id is not null)::int + (p_real_team_id is not null)::int) <> 1 then
    raise exception 'Choose exactly one player or defense.';
  end if;

  select sf.league_season_id, ls.roster_config
    into v_league_season_id, v_roster_config
  from public.season_franchises sf
  join public.franchises f on f.id = sf.franchise_id
  join public.franchise_owners fo on fo.franchise_id = f.id
  join public.league_seasons ls on ls.id = sf.league_season_id
  where sf.id = p_season_franchise_id
    and fo.user_id = v_user_id
    and fo.ends_on is null
  for update of sf;

  if v_league_season_id is null then
    raise exception 'You do not manage this franchise.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_league_season_id::text, 0));

  if exists (
    select 1 from public.roster_entries re
    join public.season_franchises sf on sf.id = re.season_franchise_id
    where sf.league_season_id = v_league_season_id
      and re.dropped_at is null
      and ((p_athlete_id is not null and re.athlete_id = p_athlete_id)
        or (p_real_team_id is not null and re.real_team_id = p_real_team_id))
  ) then
    raise exception 'That asset is no longer available.';
  end if;

  select count(*) into v_active_count
  from public.roster_entries
  where season_franchise_id = p_season_franchise_id and dropped_at is null;

  select coalesce(sum(value::int),0) + coalesce((v_roster_config->>'bench')::int,0)
    into v_roster_limit
  from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));

  if p_drop_roster_entry_id is null and v_active_count >= v_roster_limit then
    raise exception 'Your roster is full. Choose a player to drop.';
  end if;

  if p_drop_roster_entry_id is not null then
    if exists (
      select 1 from public.lineups l
      join public.roster_entries re on re.id = p_drop_roster_entry_id
      where re.season_franchise_id = p_season_franchise_id
        and l.season_franchise_id = p_season_franchise_id
        and l.locked_at is not null
        and ((re.athlete_id is not null and l.athlete_id = re.athlete_id)
          or (re.real_team_id is not null and l.real_team_id = re.real_team_id))
    ) then
      raise exception 'That player is locked in a lineup and cannot be dropped.';
    end if;

    delete from public.lineups l
    using public.roster_entries re
    where re.id = p_drop_roster_entry_id
      and re.season_franchise_id = p_season_franchise_id
      and re.dropped_at is null
      and l.season_franchise_id = p_season_franchise_id
      and l.locked_at is null
      and ((re.athlete_id is not null and l.athlete_id = re.athlete_id)
        or (re.real_team_id is not null and l.real_team_id = re.real_team_id));

    update public.roster_entries
      set dropped_at = now()
    where id = p_drop_roster_entry_id
      and season_franchise_id = p_season_franchise_id
      and dropped_at is null;

    if not found then
      raise exception 'The player selected to drop is no longer on your roster.';
    end if;
  end if;

  insert into public.roster_entries(season_franchise_id, athlete_id, real_team_id, acquired_via)
  values (p_season_franchise_id, p_athlete_id, p_real_team_id, 'free_agent')
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke execute on function public.claim_free_agent(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.claim_free_agent(uuid,uuid,uuid,uuid) to authenticated;
