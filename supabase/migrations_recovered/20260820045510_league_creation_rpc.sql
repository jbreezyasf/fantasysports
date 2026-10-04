-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820045510, name league_creation_rpc. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.create_pro_football_league(p_name text, p_franchise_name text, p_abbreviation text default null, p_primary_color text default null, p_secondary_color text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_competition uuid;
  v_competition_season uuid;
  v_scoring uuid;
  v_league uuid;
  v_league_season uuid;
  v_franchise uuid;
  v_season_franchise uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'League name required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;

  select id into v_competition from competitions where code='pro_football';
  select id into v_competition_season from competition_seasons where competition_id=v_competition and season_year=2025;
  if v_competition_season is null then raise exception 'Pro Football reference season missing'; end if;
  select id into v_scoring from scoring_profiles where sport='football' and is_system_default=true order by created_at nulls last limit 1;

  insert into fantasy_leagues(name, created_by) values(trim(p_name), v_user) returning id into v_league;
  insert into league_members(league_id,user_id,role) values(v_league,v_user,'commissioner');
  insert into league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id)
  values(v_league,v_competition_season,'setup','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,v_scoring)
  returning id into v_league_season;
  insert into franchises(league_id,name,abbreviation,primary_color,secondary_color,established_year)
  values(v_league,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,extract(year from current_date)::int)
  returning id into v_franchise;
  insert into franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_league,v_league_season,v_user,'league_created','League created',jsonb_build_object('franchise_id',v_franchise));

  return jsonb_build_object('league_id',v_league,'league_season_id',v_league_season,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end $$;
revoke all on function public.create_pro_football_league(text,text,text,text,text) from public;
grant execute on function public.create_pro_football_league(text,text,text,text,text) to authenticated;
