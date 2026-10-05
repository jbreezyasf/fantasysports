-- Prerequisites for week close, the Chaos Clause and Weeks 10-17 automation.
--
-- Why this file exists. 20261004020000_chaos_week_rule_cards.sql was applied to
-- production on 2026-10-05 without 20261004010000_chaos_clause_tiebreak.sql
-- having been applied first (the operator was told, wrongly, that the rule-card
-- file replaced it). The rule-card file replaces recompute_matchup and
-- chaos_clause_decision but does not repeat the objects below, which
-- recompute_matchup calls when it FINALIZES a matchup. Until they exist, live
-- scoring works but every week close fails with
-- "function fantasy_week_close_status(uuid, integer) does not exist".
--
-- This file is 20261004010000 verbatim, minus the two functions that
-- 20261004020000 supersedes (recompute_matchup, chaos_clause_decision), so it
-- is safe to run after 20261004020000 and is idempotent. Running 20261004010000
-- itself now would roll those two functions back to their older text.
--
-- On a database built from scratch in timestamp order every statement here is
-- a no-op repeat.

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


revoke execute on function public.chaos_clause_applies(text) from public, anon, authenticated;
grant execute on function public.chaos_clause_applies(text) to service_role;

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
