-- Lets the weekly job (service role) run the season steps that today only a
-- signed-in commissioner can run.
--
-- Production fact (2026-10-03): generate_rivalry_week, generate_revenge_week,
-- generate_position_week, generate_chaos_week, generate_judgment_week,
-- initialize_postseason, generate_postseason_week16,
-- generate_postseason_week17 and close_league_season all begin with
--   if not exists(select 1 from league_members where ... user_id=auth.uid()
--                 and role='commissioner') then raise 'Commissioner access required'
-- The scheduled job has no user (auth.uid() is null), so it cannot call them.
--
-- This function does not change any of those functions. It checks the
-- preconditions they do not check themselves, then calls the one that belongs
-- to the requested week AS the league's commissioner, by setting the request
-- subject for the remainder of the transaction only. Consequence: feed events
-- those functions write (Chaos Week, Judgment Week, season complete) carry the
-- commissioner as actor_user_id even though the job ran the step.
--
-- p_week is the step to run:
--   10 Rivalry, 11 Revenge, 12 Position, 13 Chaos, 14 Judgment,
--   15 postseason seeding + Week 15 games, 16 semifinals, 17 finals,
--   18 close the season (after the Week 17 finals).
--
-- Only the service role may execute it. scripts/advance-fantasy-season.mjs
-- treats "function not found" as "not available yet" and does nothing, so the
-- code may be deployed before this migration is applied.

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
  -- Postseason steps advance winners. A tied game has no winner and there is
  -- no tiebreak rule in the product, so a person has to decide.
  if p_week >= 16 and exists (
    select 1 from matchups
    where league_season_id = p_league_season_id and is_final and winner_season_franchise_id is null
      and ((week = 15 and event_type in ('playoff_qf', 'redemption_sf'))
        or (week = 16 and event_type = 'playoff_sf')
        or (week = 17 and event_type in ('championship', 'redemption_final')))
  ) then
    raise exception 'A postseason matchup ended in a tie; a commissioner decision is required';
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
