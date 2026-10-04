-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820055507, name circuit_schedule_and_lineup_engine. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.generate_circuit_schedule(p_league_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_ls uuid;
  teams uuid[];
  rotated uuid[];
  n int;
  wk int;
  i int;
  home_id uuid;
  away_id uuid;
  tmp uuid[];
  inserted_count int:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  select array_agg(id order by coalesce(draft_position,999),id) into teams from season_franchises where league_season_id=v_ls;
  n:=coalesce(array_length(teams,1),0);
  if n<>10 then raise exception 'Circuit schedule requires 10 franchises'; end if;
  if exists(select 1 from matchups where league_season_id=v_ls and week between 1 and 9) then return jsonb_build_object('status','exists','weeks',9); end if;
  rotated:=teams;
  for wk in 1..9 loop
    for i in 1..5 loop
      if mod(wk+i,2)=0 then home_id:=rotated[i]; away_id:=rotated[11-i]; else home_id:=rotated[11-i]; away_id:=rotated[i]; end if;
      insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type)
      values(v_ls,wk,home_id,away_id,'circuit');
      inserted_count:=inserted_count+1;
    end loop;
    tmp:=array[rotated[1],rotated[10]] || rotated[2:9];
    rotated:=tmp;
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_ls,v_user,'circuit_schedule_created','Weeks 1–9 Circuit schedule is set',jsonb_build_object('matchups',inserted_count));
  return jsonb_build_object('status','created','weeks',9,'matchups',inserted_count);
end $$;
revoke all on function public.generate_circuit_schedule(uuid) from public,anon;
grant execute on function public.generate_circuit_schedule(uuid) to authenticated;

create or replace function public.set_lineup_slot(p_season_franchise_id uuid,p_week int,p_slot lineup_slot,p_athlete_id uuid default null,p_real_team_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid();
  v_franchise uuid;
  v_league_season uuid;
  v_pos text;
  v_team uuid;
  v_game_start timestamptz;
  v_game_state game_state;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_week<1 or p_week>18 then raise exception 'Invalid week'; end if;
  if (p_athlete_id is null)=(p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;
  select sf.franchise_id,sf.league_season_id into v_franchise,v_league_season from season_franchises sf where sf.id=p_season_franchise_id;
  if not exists(select 1 from franchise_owners fo where fo.franchise_id=v_franchise and fo.user_id=v_user and fo.ends_on is null) then raise exception 'Not your franchise'; end if;

  if p_real_team_id is not null then
    if p_slot<>'DST' then raise exception 'Team defense can only be placed in D/ST'; end if;
    if not exists(select 1 from roster_entries where season_franchise_id=p_season_franchise_id and real_team_id=p_real_team_id and dropped_at is null) then raise exception 'D/ST is not on roster'; end if;
    v_team:=p_real_team_id;
  else
    select position,real_team_id into v_pos,v_team from athletes where id=p_athlete_id;
    if v_pos is null then raise exception 'Athlete not found'; end if;
    if not exists(select 1 from roster_entries where season_franchise_id=p_season_franchise_id and athlete_id=p_athlete_id and dropped_at is null) then raise exception 'Athlete is not on roster'; end if;
    if p_slot='QB' and v_pos<>'QB' then raise exception 'QB slot requires QB'; end if;
    if p_slot='RB' and v_pos<>'RB' then raise exception 'RB slot requires RB'; end if;
    if p_slot='WR' and v_pos<>'WR' then raise exception 'WR slot requires WR'; end if;
    if p_slot='TE' and v_pos<>'TE' then raise exception 'TE slot requires TE'; end if;
    if p_slot='K' and v_pos<>'K' then raise exception 'K slot requires kicker'; end if;
    if p_slot='FLEX' and v_pos not in ('RB','WR','TE') then raise exception 'FLEX requires RB, WR, or TE'; end if;
    if p_slot='DST' then raise exception 'D/ST requires team defense'; end if;
  end if;

  select rg.starts_at,rg.state into v_game_start,v_game_state
  from real_games rg join competition_seasons cs on cs.id=rg.competition_season_id
  where cs.id=(select competition_season_id from league_seasons where id=v_league_season)
    and rg.week=p_week and (rg.home_team_id=v_team or rg.away_team_id=v_team)
  limit 1;
  if v_game_start is not null and v_game_start<=now() and v_game_state in ('scheduled','in_progress') then raise exception 'This player/team is locked because its game has started'; end if;

  delete from lineups where season_franchise_id=p_season_franchise_id and week=p_week and slot=p_slot and ((p_slot not in ('RB','WR')) or true);
  delete from lineups where season_franchise_id=p_season_franchise_id and week=p_week and ((athlete_id=p_athlete_id and p_athlete_id is not null) or (real_team_id=p_real_team_id and p_real_team_id is not null));
  insert into lineups(season_franchise_id,week,athlete_id,real_team_id,slot) values(p_season_franchise_id,p_week,p_athlete_id,p_real_team_id,p_slot);
  return jsonb_build_object('status','set','slot',p_slot,'week',p_week);
end $$;
revoke all on function public.set_lineup_slot(uuid,int,lineup_slot,uuid,uuid) from public,anon;
grant execute on function public.set_lineup_slot(uuid,int,lineup_slot,uuid,uuid) to authenticated;

alter table lineups enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='lineups' and policyname='league_members_read_lineups') then
    create policy league_members_read_lineups on lineups for select to authenticated using (exists(select 1 from season_franchises sf join league_seasons ls on ls.id=sf.league_season_id join league_members lm on lm.league_id=ls.league_id where sf.id=lineups.season_franchise_id and lm.user_id=auth.uid()));
  end if;
end $$;
