-- The Chaos Clause: the owner's playoff tiebreak (decided 2026-10-04).
--
-- Before this migration a level matchup was final with no winner, whatever the
-- week. For the postseason that broke the bracket (second_half_rehearsal.sql):
-- a tied quarterfinal made generate_postseason_week16 fail on a NOT NULL
-- column, a tied semifinal or redemption semifinal put a null franchise into
-- Week 17, and a tied final made close_league_season refuse forever.
--
-- The rule. When a POSTSEASON matchup (event_type playoff_qf, playoff_sf,
-- championship, redemption_sf, redemption_final; third_place is accepted too,
-- although no function creates it today) is level on points at finalization,
-- the winner is the first of:
--   1. the higher point total in the franchise's own Week 13 Chaos Week
--      matchup (event_type 'chaos') of the same league season;
--   2. the higher point total in its Week 10 Rivalry Week matchup
--      (event_type 'rivalry');
--   3. the higher postseason seed (lower seed number).
-- A step is skipped ("unavailable") when either franchise has no FINAL matchup
-- of that week and type, and falls through when the two totals are equal.
-- Regular-season ties are unchanged: they stay ties.
--
-- The scores of the game stay level. Only winner_season_franchise_id is set,
-- and how it was decided is recorded in matchups.context->'chaos_clause' and
-- in the matchup_final feed payload under the same key:
--   {"rule":"chaos_clause","version":1,
--    "decided_by":"chaos_week"|"rivalry_week"|"postseason_seed"|"unresolved",
--    "winner_season_franchise_id":<uuid or null>,
--    "steps":[{"step":"chaos_week","week":13,"home":131.40,"away":118.25,"outcome":"home"}, ...]}
-- "home"/"away" are the two sides of the tied postseason game; steps lists
-- every step that was looked at, in order, ending with the deciding one.
-- outcome is home, away, level or unavailable.
-- "unresolved" (no winner) only happens when a franchise has no row in
-- postseason_seeds. The game is then final and level exactly as before, and
-- system_advance_fantasy_season stops with a readable error.
--
-- Standings: a clause-decided game goes through the same branch as any other
-- won game (winner wins+1 and streak up, loser losses+1 and streak down, both
-- get the level points for/against; ties is not touched). Postseason results
-- are still added to the regular-season standings rows; that existing
-- behaviour is deliberately not changed here.
--
-- Idempotent: the decision is taken only inside the "p_finalize and not
-- already final" branch, under the row lock. Recomputing a final matchup never
-- re-evaluates the clause, the winner, the context or the standings.
--
-- RELATION TO EARLIER MIGRATIONS (both merged, neither applied to production
-- on 2026-10-04; production's last applied version is 20260918042128):
--   * 20261003040000_week_close_terminal_game_rule.sql: SUPERSEDED. This file
--     repeats its table, fantasy_week_close_status and grants verbatim (all
--     idempotent) and replaces recompute_matchup with that migration's text
--     plus the clause. Applying this file alone therefore also turns on the
--     canceled/postponed week-close rule.
--   * 20261003060000_system_advance_fantasy_season.sql: SUPERSEDED. This file
--     repeats the function and grants, changing only the tied-postseason stop.
--   Apply in timestamp order, or apply this file alone. Do NOT apply either of
--   those two AFTER this one: each would put back a definition without the
--   clause.
--   * No dependency on 20261003030000 or 20261003050000.
-- Not changed: the generators, initialize_postseason, close_league_season,
-- award_matchup_achievements, publish_finalized_league_week.

-- ---------------------------------------------------------------------------
-- 1. From 20261003040000, verbatim: the shared week-close rule.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. The Chaos Clause.
-- ---------------------------------------------------------------------------
create or replace function public.chaos_clause_applies(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select coalesce(p_event_type in ('playoff_qf', 'playoff_sf', 'championship', 'redemption_sf', 'redemption_final', 'third_place'), false);
$function$;

-- Reads only. p_home / p_away are the season franchises of the level game.
create or replace function public.chaos_clause_decision(
  p_league_season_id uuid,
  p_home_season_franchise_id uuid,
  p_away_season_franchise_id uuid
) returns jsonb
language plpgsql
stable
set search_path = public
as $function$
declare
  v_steps jsonb := '[]'::jsonb;
  v_step record;
  v_home numeric;
  v_away numeric;
  v_home_seed integer;
  v_away_seed integer;
  v_outcome text;
  v_decided text := 'unresolved';
  v_winner uuid;
begin
  for v_step in select * from (values (1, 'chaos_week', 13, 'chaos'), (2, 'rivalry_week', 10, 'rivalry')) s(ord, step, week, event_type) order by ord loop
    v_home := null; v_away := null;
    select case when m.home_season_franchise_id = p_home_season_franchise_id then m.home_points else m.away_points end into v_home
    from matchups m
    where m.league_season_id = p_league_season_id and m.week = v_step.week and m.event_type = v_step.event_type and m.is_final
      and p_home_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id)
    order by m.id limit 1;
    select case when m.home_season_franchise_id = p_away_season_franchise_id then m.home_points else m.away_points end into v_away
    from matchups m
    where m.league_season_id = p_league_season_id and m.week = v_step.week and m.event_type = v_step.event_type and m.is_final
      and p_away_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id)
    order by m.id limit 1;

    v_outcome := case when v_home is null or v_away is null then 'unavailable'
                      when v_home > v_away then 'home' when v_away > v_home then 'away' else 'level' end;
    v_steps := v_steps || jsonb_build_object('step', v_step.step, 'week', v_step.week, 'home', v_home, 'away', v_away, 'outcome', v_outcome);
    if v_outcome in ('home', 'away') then v_decided := v_step.step; exit; end if;
  end loop;

  if v_decided = 'unresolved' then
    select seed into v_home_seed from postseason_seeds where league_season_id = p_league_season_id and season_franchise_id = p_home_season_franchise_id;
    select seed into v_away_seed from postseason_seeds where league_season_id = p_league_season_id and season_franchise_id = p_away_season_franchise_id;
    v_outcome := case when v_home_seed is null or v_away_seed is null then 'unavailable'
                      when v_home_seed < v_away_seed then 'home' when v_away_seed < v_home_seed then 'away' else 'level' end;
    v_steps := v_steps || jsonb_build_object('step', 'postseason_seed', 'home', v_home_seed, 'away', v_away_seed, 'outcome', v_outcome);
    if v_outcome in ('home', 'away') then v_decided := 'postseason_seed'; end if;
  end if;

  if v_decided <> 'unresolved' then
    v_winner := case when v_outcome = 'home' then p_home_season_franchise_id else p_away_season_franchise_id end;
  end if;
  return jsonb_build_object('rule', 'chaos_clause', 'version', 1, 'decided_by', v_decided, 'winner_season_franchise_id', v_winner, 'steps', v_steps);
end
$function$;

revoke execute on function public.chaos_clause_applies(text) from public, anon, authenticated;
revoke execute on function public.chaos_clause_decision(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.chaos_clause_applies(text) to service_role;
grant execute on function public.chaos_clause_decision(uuid, uuid, uuid) to service_role;

-- recompute_matchup: the text of 20261003040000 (production text of 2026-10-03
-- plus the shared week-close rule). Changes here: v_clause; the level branch
-- asks the clause for postseason games; the decision is written to
-- matchups.context and the feed payload, and returned.
CREATE OR REPLACE FUNCTION public.recompute_matchup(p_matchup_id uuid, p_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m matchups%rowtype; v_home numeric:=0; v_away numeric:=0; v_close jsonb; v_winner uuid; v_loser uuid; v_league uuid; v_clause jsonb;
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
    else
      v_winner:=null;
      -- The Chaos Clause: a level POSTSEASON game still gets a winner. Regular-season ties stay ties.
      if chaos_clause_applies(v_m.event_type) then
        v_clause:=chaos_clause_decision(v_m.league_season_id,v_m.home_season_franchise_id,v_m.away_season_franchise_id);
        v_winner:=(v_clause->>'winner_season_franchise_id')::uuid;
        if v_winner is not null then v_loser:=case when v_winner=v_m.home_season_franchise_id then v_m.away_season_franchise_id else v_m.home_season_franchise_id end; end if;
      end if;
    end if;
    update matchups set home_points=v_home,away_points=v_away,winner_season_franchise_id=v_winner,is_final=true,context=case when v_clause is null then context else coalesce(context,'{}'::jsonb)||jsonb_build_object('chaos_clause',v_clause) end where id=v_m.id;
    if v_winner is null then
      update standings set ties=ties+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=0 where league_season_id=v_m.league_season_id and season_franchise_id in (v_m.home_season_franchise_id,v_m.away_season_franchise_id);
    else
      update standings set wins=wins+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak>=0 then streak+1 else 1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_winner;
      update standings set losses=losses+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak<=0 then streak-1 else -1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_loser;
    end if;
    perform award_matchup_achievements(v_m.id);
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner)||case when (v_close->>'override_applied')::boolean then jsonb_build_object('postponed_game_override',true) else '{}'::jsonb end||case when v_clause is not null then jsonb_build_object('chaos_clause',v_clause) else '{}'::jsonb end);
  elsif v_m.is_final then v_winner:=v_m.winner_season_franchise_id; v_clause:=v_m.context->'chaos_clause'; end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',coalesce(v_winner,v_m.winner_season_franchise_id))||case when v_clause is not null then jsonb_build_object('chaos_clause',v_clause) else '{}'::jsonb end;
end $function$;

-- ---------------------------------------------------------------------------
-- 3. From 20261003060000: system_advance_fantasy_season. Only the tied
--    postseason stop changes (see the comment in the body).
-- ---------------------------------------------------------------------------
create or replace function public.system_advance_fantasy_season(
  p_league_season_id uuid,
  p_week integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_league uuid;
  v_latest uuid;
  v_commissioner uuid;
  v_previous_subject text := current_setting('request.jwt.claim.sub', true);
  v_step text;
  v_result jsonb;
  v_expected integer;
  v_found integer;
  v_distinct integer;
begin
  if auth.uid() is not null then raise exception 'System use only'; end if;
  if p_week is null or p_week < 10 or p_week > 18 then raise exception 'No automated season step for week %', p_week; end if;

  select league_id into v_league from league_seasons where id = p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;

  -- The season functions take a league and always act on its latest season.
  select ls.id into v_latest
  from league_seasons ls join competition_seasons cs on cs.id = ls.competition_season_id
  where ls.league_id = v_league order by cs.season_year desc limit 1;
  if v_latest is distinct from p_league_season_id then raise exception 'Not the latest season of its league'; end if;

  if (select count(*) from season_franchises where league_season_id = p_league_season_id) <> 10
     or (select count(*) from standings where league_season_id = p_league_season_id) <> 10 then
    raise exception 'Season automation requires 10 franchises with standings';
  end if;

  -- The step for week N is built from the results of week N-1.
  if not exists (select 1 from matchups where league_season_id = p_league_season_id and week = p_week - 1)
     or exists (select 1 from matchups where league_season_id = p_league_season_id and week = p_week - 1 and not is_final) then
    raise exception 'Week % must be final first', p_week - 1;
  end if;
  -- Postseason steps advance winners. Since the Chaos Clause, recompute_matchup
  -- gives a level postseason game a winner at finalization, so this is no longer
  -- the normal outcome of a tie. It stays as a defensive stop for a postseason
  -- game that is final with no winner anyway: one finalized before the clause
  -- was applied, or one the clause could not decide because a franchise has no
  -- postseason seed.
  if p_week >= 16 and exists (
    select 1 from matchups
    where league_season_id = p_league_season_id and is_final and winner_season_franchise_id is null
      and chaos_clause_applies(event_type)
  ) then
    raise exception 'A postseason matchup is final with no winner (the Chaos Clause could not decide it); a commissioner decision is required';
  end if;

  select user_id into v_commissioner from league_members
  where league_id = v_league and role = 'commissioner' order by joined_at, id limit 1;
  if v_commissioner is null then raise exception 'League has no commissioner'; end if;

  perform set_config('request.jwt.claim.sub', v_commissioner::text, true);
  case p_week
    when 10 then v_step := 'generate_rivalry_week';      v_expected := 5; v_result := generate_rivalry_week(v_league, 10);
    when 11 then v_step := 'generate_revenge_week';      v_expected := 5; v_result := generate_revenge_week(v_league, 11);
    when 12 then v_step := 'generate_position_week';     v_expected := 5; v_result := generate_position_week(v_league, 12);
    when 13 then v_step := 'generate_chaos_week';        v_expected := 5; v_result := generate_chaos_week(v_league, 13);
    when 14 then v_step := 'generate_judgment_week';     v_expected := 5; v_result := generate_judgment_week(v_league, 14);
    when 15 then v_step := 'initialize_postseason';      v_expected := 4; v_result := initialize_postseason(v_league);
    when 16 then v_step := 'generate_postseason_week16'; v_expected := 2; v_result := generate_postseason_week16(v_league);
    when 17 then v_step := 'generate_postseason_week17'; v_expected := 2; v_result := generate_postseason_week17(v_league);
    when 18 then v_step := 'close_league_season';        v_expected := null; v_result := close_league_season(v_league);
  end case;
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_subject, ''), true);

  -- Refuse (and roll back) a schedule that is short or uses a franchise twice.
  if v_expected is not null then
    select count(*), count(distinct f) into v_found, v_distinct
    from matchups m cross join lateral (values (m.home_season_franchise_id), (m.away_season_franchise_id)) t(f)
    where m.league_season_id = p_league_season_id and m.week = p_week;
    if v_found <> v_expected * 2 or v_distinct <> v_found then
      raise exception '% produced an invalid Week % schedule (% franchise slots, % distinct, expected %)', v_step, p_week, v_found, v_distinct, v_expected * 2;
    end if;
  end if;

  return jsonb_build_object('week', p_week, 'step', v_step, 'result', v_result);
end
$function$;

revoke execute on function public.system_advance_fantasy_season(uuid, integer) from public, anon, authenticated;
grant execute on function public.system_advance_fantasy_season(uuid, integer) to service_role;
