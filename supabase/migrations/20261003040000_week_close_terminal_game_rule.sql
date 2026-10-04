-- One rule for "this fantasy week is complete", shared by SQL and by
-- scripts/finalize-complete-football-weeks.mjs.
--
-- Before this migration recompute_matchup(p_finalize => true) refused to
-- finalize while any real game of the week had state <> 'final', while the
-- week-close job treated 'final' and 'canceled' as terminal. One canceled game
-- would have made the job throw on every run for every league.
--
-- The rule (public.fantasy_week_close_status):
--   * the week has at least one real game that is not postponed;
--   * every game is 'final' or 'canceled' and has reached its kickoff time;
--   * a 'postponed' game BLOCKS the close. Production held no postponed or
--     canceled game on 2026-10-03 (2026: 49 final, 223 scheduled), so there is
--     no evidence for an automatic time-based release. Instead an operator may
--     record a row in public.fantasy_week_close_overrides for that week; the
--     week then closes once every other game is final or canceled, and the
--     postponed game counts for nothing in that fantasy week;
--   * every other state (scheduled, in_progress, delayed, suspended, unknown)
--     blocks and cannot be overridden.
--
-- Operator override (service role / SQL editor only):
--   insert into public.fantasy_week_close_overrides(competition_season_id, week, reason, created_by)
--   values ('<competition season id>', <week>, '<why the postponed game will not count>', '<who>');
-- Delete the row to withdraw it. It has no effect on already-final matchups.

create table if not exists public.fantasy_week_close_overrides (
  competition_season_id uuid not null references public.competition_seasons(id),
  week integer not null check (week between 1 and 18),
  reason text not null check (length(btrim(reason)) > 0),
  created_by text not null check (length(btrim(created_by)) > 0),
  created_at timestamptz not null default now(),
  primary key (competition_season_id, week)
);
alter table public.fantasy_week_close_overrides enable row level security;
revoke all on table public.fantasy_week_close_overrides from public, anon, authenticated;
grant select, insert, delete on table public.fantasy_week_close_overrides to service_role;

create or replace function public.fantasy_week_close_status(
  p_competition_season_id uuid,
  p_week integer
) returns jsonb
language sql
stable
set search_path = public
as $function$
  with counts as (
    select
      count(*) as games,
      count(*) filter (where rg.state = 'postponed') as postponed,
      count(*) filter (where rg.state <> 'postponed' and rg.starts_at > now()) as not_started,
      count(*) filter (where rg.state not in ('final', 'canceled', 'postponed')) as unfinished
    from public.real_games rg
    where rg.competition_season_id = p_competition_season_id and rg.week = p_week
  ), flags as (
    select c.*, exists (
      select 1 from public.fantasy_week_close_overrides o
      where o.competition_season_id = p_competition_season_id and o.week = p_week
    ) as has_override
    from counts c
  )
  select jsonb_build_object(
    'games', games,
    'not_started', not_started,
    'unfinished', unfinished,
    'postponed', postponed,
    'override', has_override,
    'override_applied', games > postponed and unfinished = 0 and not_started = 0 and postponed > 0 and has_override,
    'complete', games > postponed and unfinished = 0 and not_started = 0 and (postponed = 0 or has_override)
  )
  from flags;
$function$;

revoke execute on function public.fantasy_week_close_status(uuid, integer) from public, anon;
grant execute on function public.fantasy_week_close_status(uuid, integer) to authenticated, service_role;

-- recompute_matchup: production text of 2026-10-03. The only changes are the
-- unfinished-game check (now the shared rule) and a marker in the
-- matchup_final feed payload when the operator override was used.
CREATE OR REPLACE FUNCTION public.recompute_matchup(p_matchup_id uuid, p_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m matchups%rowtype; v_home numeric:=0; v_away numeric:=0; v_close jsonb; v_winner uuid; v_loser uuid; v_league uuid;
begin
  select * into v_m from matchups where id=p_matchup_id for update;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  select league_id into v_league from league_seasons where id=v_m.league_season_id;
  if auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid()) then raise exception 'League access required'; end if;
  if p_finalize and auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid() and role='commissioner') then raise exception 'Commissioner access required to finalize matchup'; end if;

  select coalesce(sum(x.points),0) into v_home from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  select coalesce(sum(x.points),0) into v_away from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  update matchups set home_points=v_home,away_points=v_away where id=v_m.id;

  if p_finalize and not v_m.is_final then
    v_close:=fantasy_week_close_status((select competition_season_id from league_seasons where id=v_m.league_season_id),v_m.week);
    if not (v_close->>'complete')::boolean then raise exception 'Cannot finalize while real games are unfinished' using detail=v_close::text; end if;
    if (v_close->>'override_applied')::boolean then raise warning 'Finalizing matchup % (week %) under a postponed-game operator override: %',v_m.id,v_m.week,v_close::text; end if;
    if v_home>v_away then v_winner:=v_m.home_season_franchise_id; v_loser:=v_m.away_season_franchise_id;
    elsif v_away>v_home then v_winner:=v_m.away_season_franchise_id; v_loser:=v_m.home_season_franchise_id;
    else v_winner:=null; end if;
    update matchups set home_points=v_home,away_points=v_away,winner_season_franchise_id=v_winner,is_final=true where id=v_m.id;
    if v_winner is null then
      update standings set ties=ties+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=0 where league_season_id=v_m.league_season_id and season_franchise_id in (v_m.home_season_franchise_id,v_m.away_season_franchise_id);
    else
      update standings set wins=wins+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak>=0 then streak+1 else 1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_winner;
      update standings set losses=losses+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak<=0 then streak-1 else -1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_loser;
    end if;
    perform award_matchup_achievements(v_m.id);
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner)||case when (v_close->>'override_applied')::boolean then jsonb_build_object('postponed_game_override',true) else '{}'::jsonb end);
  elsif v_m.is_final then v_winner:=v_m.winner_season_franchise_id; end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',coalesce(v_winner,v_m.winner_season_franchise_id));
end $function$;
