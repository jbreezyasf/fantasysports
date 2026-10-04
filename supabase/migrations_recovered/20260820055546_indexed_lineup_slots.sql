-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820055546, name indexed_lineup_slots. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.lineups add column if not exists slot_index int not null default 1;
alter table public.lineups drop constraint if exists lineups_season_franchise_id_week_slot_athlete_id_key;
create unique index if not exists lineups_unique_slot_index on public.lineups(season_franchise_id,week,slot,slot_index);
create unique index if not exists lineups_unique_athlete_week on public.lineups(season_franchise_id,week,athlete_id) where athlete_id is not null;
create unique index if not exists lineups_unique_team_week on public.lineups(season_franchise_id,week,real_team_id) where real_team_id is not null;
alter table public.lineups add constraint lineup_slot_index_check check (slot_index>=1 and slot_index<=2);

create or replace function public.set_lineup_slot(p_season_franchise_id uuid,p_week int,p_slot lineup_slot,p_slot_index int default 1,p_athlete_id uuid default null,p_real_team_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid:=auth.uid(); v_franchise uuid; v_league_season uuid; v_pos text; v_team uuid; v_game_start timestamptz; v_game_state game_state;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_week<1 or p_week>18 then raise exception 'Invalid week'; end if;
  if p_slot_index<1 or p_slot_index>2 then raise exception 'Invalid slot index'; end if;
  if p_slot not in ('RB','WR') and p_slot_index<>1 then raise exception 'Only RB and WR use a second indexed slot'; end if;
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
  select rg.starts_at,rg.state into v_game_start,v_game_state from real_games rg where rg.competition_season_id=(select competition_season_id from league_seasons where id=v_league_season) and rg.week=p_week and (rg.home_team_id=v_team or rg.away_team_id=v_team) limit 1;
  if v_game_start is not null and v_game_start<=now() and v_game_state in ('scheduled','in_progress') then raise exception 'This player/team is locked because its game has started'; end if;
  delete from lineups where season_franchise_id=p_season_franchise_id and week=p_week and slot=p_slot and slot_index=p_slot_index;
  delete from lineups where season_franchise_id=p_season_franchise_id and week=p_week and ((athlete_id=p_athlete_id and p_athlete_id is not null) or (real_team_id=p_real_team_id and p_real_team_id is not null));
  insert into lineups(season_franchise_id,week,athlete_id,real_team_id,slot,slot_index) values(p_season_franchise_id,p_week,p_athlete_id,p_real_team_id,p_slot,p_slot_index);
  return jsonb_build_object('status','set','slot',p_slot,'slot_index',p_slot_index,'week',p_week);
end $$;
revoke all on function public.set_lineup_slot(uuid,int,lineup_slot,int,uuid,uuid) from public,anon;
grant execute on function public.set_lineup_slot(uuid,int,lineup_slot,int,uuid,uuid) to authenticated;
