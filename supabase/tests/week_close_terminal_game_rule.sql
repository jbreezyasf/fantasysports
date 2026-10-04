-- Executable regression test for 20261003040000_week_close_terminal_game_rule.sql.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/week_close_terminal_game_rule.sql
--
-- Table shapes were generated from the production catalog on 2026-10-03
-- (columns, types and defaults only). award_matchup_achievements is stubbed
-- because it is not what this test exercises. The truth table below is the
-- same one asserted against the JavaScript rule in
-- tests/finalize-complete-football-weeks.test.mjs.

\set ON_ERROR_STOP 1
set client_min_messages = error;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create type public.game_state as enum ('scheduled','in_progress','final','postponed','canceled','delayed','suspended','unknown');
create type public.lineup_slot as enum ('QB','RB','WR','TE','FLEX','K','DST','BENCH','IR');
create type public.member_role as enum ('commissioner','manager');
create table public.competition_seasons (id uuid default gen_random_uuid() primary key, competition_id uuid not null, season_year integer not null, starts_on date, ends_on date, late_entry_cutoff_at timestamp with time zone);
create table public.league_seasons (id uuid default gen_random_uuid() not null, league_id uuid not null, competition_season_id uuid not null, status text default 'setup'::text not null, roster_config jsonb not null, scoring_profile_id uuid, trade_deadline_at timestamp with time zone, waiver_period_hours integer default 48 not null, is_current boolean default true not null);
create table public.league_members (id uuid default gen_random_uuid() not null, league_id uuid not null, user_id uuid not null, role member_role default 'manager'::member_role not null, joined_at timestamp with time zone default now() not null);
create table public.league_feed_events (id uuid default gen_random_uuid() not null, league_id uuid not null, season_id uuid, actor_user_id uuid, event_type text not null, body text, payload jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);
create table public.lineups (id uuid default gen_random_uuid() not null, season_franchise_id uuid not null, week integer not null, athlete_id uuid, slot lineup_slot not null, locked_at timestamp with time zone, real_team_id uuid, slot_index integer default 1 not null);
create table public.fantasy_player_scores (id uuid default gen_random_uuid() not null, league_season_id uuid not null, athlete_id uuid not null, game_id uuid not null, week integer not null, points numeric(8,2) not null, breakdown jsonb not null, calculated_at timestamp with time zone default now() not null);
create table public.fantasy_team_scores (id uuid default gen_random_uuid() not null, league_season_id uuid not null, real_team_id uuid not null, game_id uuid not null, week integer not null, points numeric(8,2) not null, breakdown jsonb not null, calculated_at timestamp with time zone default now() not null);
create table public.matchups (id uuid default gen_random_uuid() not null, league_season_id uuid not null, week integer not null, home_season_franchise_id uuid not null, away_season_franchise_id uuid not null, event_type text default 'circuit'::text not null, home_points numeric(8,2) default 0 not null, away_points numeric(8,2) default 0 not null, winner_season_franchise_id uuid, is_final boolean default false not null, context jsonb default '{}'::jsonb not null, result_source text default 'LIVE'::text not null, simulated_reason text, result_published_at timestamp with time zone);
create table public.real_games (id uuid default gen_random_uuid() not null, competition_season_id uuid not null, provider_game_id text, week integer, home_team_id uuid, away_team_id uuid, starts_at timestamp with time zone not null, state game_state default 'scheduled'::game_state not null, home_score integer, away_score integer, updated_at timestamp with time zone default now() not null);
create table public.standings (league_season_id uuid not null, season_franchise_id uuid not null, wins integer default 0 not null, losses integer default 0 not null, ties integer default 0 not null, points_for numeric(10,2) default 0 not null, points_against numeric(10,2) default 0 not null, streak integer default 0 not null);

create function public.award_matchup_achievements(uuid) returns jsonb
language sql as $$ select jsonb_build_object('status', 'ok', 'awards', 0) $$;

\ir ../migrations/20261003040000_week_close_terminal_game_rule.sql

create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAILED: %', p_label; end if;
  raise info 'ok - %', p_label;
end $$;

-- Runs a statement and reports the error message it raised ('' when it succeeded).
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return '';
exception when others then
  return sqlerrm;
end $$;

create temp table ids as select
  '00000000-0000-0000-0000-0000000000c1'::uuid as cs,
  '00000000-0000-0000-0000-0000000000a1'::uuid as league,
  '00000000-0000-0000-0000-0000000000b1'::uuid as ls,
  '00000000-0000-0000-0000-0000000005f1'::uuid as sf1, '00000000-0000-0000-0000-0000000005f2'::uuid as sf2,
  '00000000-0000-0000-0000-0000000000d1'::uuid as qb1, '00000000-0000-0000-0000-0000000000d2'::uuid as qb2,
  '00000000-0000-0000-0000-000000000001'::uuid as commissioner;

insert into public.competition_seasons(id, competition_id, season_year) select cs, gen_random_uuid(), 2026 from ids;
insert into public.league_seasons(id, league_id, competition_season_id, roster_config) select ls, league, cs, '{}'::jsonb from ids;
insert into public.league_members(league_id, user_id, role) select league, commissioner, 'commissioner' from ids;
insert into public.standings(league_season_id, season_franchise_id) select ls, sf1 from ids union all select ls, sf2 from ids;

-- Sets the games of a week to the given states, all kicked off two days ago.
create function pg_temp.set_week(p_week integer, variadic p_states text[]) returns void language plpgsql as $$
begin
  delete from public.real_games where week = p_week;
  insert into public.real_games(competition_season_id, week, starts_at, state)
  select (select cs from ids), p_week, now() - interval '2 days', s::public.game_state from unnest(p_states) s;
end $$;
create function pg_temp.complete(p_week integer) returns boolean language sql as
$$ select (public.fantasy_week_close_status((select cs from ids), p_week)->>'complete')::boolean $$;
create function pg_temp.override(p_week integer) returns void language sql as
$$ insert into public.fantasy_week_close_overrides(competition_season_id, week, reason, created_by) select cs, p_week, 'test: game will not be replayed this week', 'sql test' from ids $$;

-- ---------------------------------------------------------------------------
-- 1. The rule itself (same truth table as the JavaScript unit tests).
-- ---------------------------------------------------------------------------
select pg_temp.set_week(1, 'final', 'canceled');
select pg_temp.expect(pg_temp.complete(1), 'final + canceled is complete');
select pg_temp.set_week(1, 'canceled');
select pg_temp.expect(pg_temp.complete(1), 'a canceled-only week is complete');
select pg_temp.expect(not pg_temp.complete(9), 'a week with no games is never complete');

do $$ declare s text; begin
  foreach s in array array['scheduled','in_progress','delayed','suspended','unknown'] loop
    perform pg_temp.set_week(1, 'final', s);
    perform pg_temp.expect(not pg_temp.complete(1), 'final + ' || s || ' is not complete');
  end loop;
end $$;

select pg_temp.set_week(1, 'final', 'postponed');
select pg_temp.expect(not pg_temp.complete(1), 'a postponed game blocks without an override');
select pg_temp.override(1);
select pg_temp.expect(
  public.fantasy_week_close_status((select cs from ids), 1)
    = '{"games":2,"not_started":0,"unfinished":0,"postponed":1,"override":true,"override_applied":true,"complete":true}'::jsonb,
  'the override waives the postponed game and says so');
update public.real_games set starts_at = now() + interval '60 days' where week = 1 and state = 'postponed';
select pg_temp.expect(pg_temp.complete(1), 'a re-dated postponed game does not matter once overridden');

select pg_temp.set_week(1, 'final', 'postponed', 'in_progress');
select pg_temp.expect(not pg_temp.complete(1), 'the override only waives postponed games');
select pg_temp.set_week(1, 'postponed');
select pg_temp.expect(not pg_temp.complete(1), 'a week of only postponed games never closes');
select pg_temp.set_week(1, 'final', 'final');
select pg_temp.expect(not (public.fantasy_week_close_status((select cs from ids), 1)->>'override_applied')::boolean, 'an unused override is not reported as applied');
delete from public.fantasy_week_close_overrides;

select pg_temp.set_week(1, 'final', 'final');
update public.real_games set starts_at = now() + interval '1 day' where id = (select id from public.real_games where week = 1 limit 1);
select pg_temp.expect(not pg_temp.complete(1), 'a game before kickoff blocks even if the provider state says final');

-- ---------------------------------------------------------------------------
-- 2. recompute_matchup enforces that rule when finalizing.
--    One matchup per week; home scores 20.00, away scores 12.50.
-- ---------------------------------------------------------------------------
insert into public.matchups(id, league_season_id, week, home_season_franchise_id, away_season_franchise_id)
select ('00000000-0000-0000-0000-00000000aa0' || w)::uuid, ls, w, sf1, sf2 from ids, generate_series(2, 6) w;
insert into public.lineups(season_franchise_id, week, athlete_id, slot)
select sf1, w, qb1, 'QB'::public.lineup_slot from ids, generate_series(2, 6) w union all
select sf2, w, qb2, 'QB' from ids, generate_series(2, 6) w;
insert into public.fantasy_player_scores(league_season_id, athlete_id, game_id, week, points, breakdown)
select ls, qb1, gen_random_uuid(), w, 20.00, '{}'::jsonb from ids, generate_series(2, 6) w union all
select ls, qb2, gen_random_uuid(), w, 12.50, '{}'::jsonb from ids, generate_series(2, 6) w;

create function pg_temp.finalize_error(p_week integer) returns text language sql as
$$ select pg_temp.error_of(format('select public.recompute_matchup(%L::uuid, true)', '00000000-0000-0000-0000-00000000aa0' || p_week)) $$;
create function pg_temp.is_final(p_week integer) returns boolean language sql as
$$ select is_final from public.matchups where week = p_week $$;

-- Week 2: a canceled game no longer blocks (the production defect).
select pg_temp.set_week(2, 'final', 'final', 'canceled');
select pg_temp.expect(pg_temp.finalize_error(2) = '', 'finalize succeeds with a canceled game in the week');
select pg_temp.expect(pg_temp.is_final(2) and (select winner_season_franchise_id = (select sf1 from ids) and home_points = 20.00 and away_points = 12.50 from public.matchups where week = 2), 'matchup is final with the right winner and points');
select pg_temp.expect((select wins = 1 and losses = 0 and points_for = 20.00 and points_against = 12.50 and streak = 1 from public.standings where season_franchise_id = (select sf1 from ids)), 'winner standings updated once');
select pg_temp.expect((select wins = 0 and losses = 1 and points_for = 12.50 and streak = -1 from public.standings where season_franchise_id = (select sf2 from ids)), 'loser standings updated once');
select pg_temp.expect(pg_temp.finalize_error(2) = '' and (select wins = 1 from public.standings where season_franchise_id = (select sf1 from ids)), 'finalizing an already-final matchup does not count twice');
select pg_temp.expect((select count(*) = 1 and bool_and(not payload ? 'postponed_game_override') from public.league_feed_events where event_type = 'matchup_final'), 'one matchup_final event, no override marker');

-- Week 3: a postponed game blocks, the operator override releases it.
select pg_temp.set_week(3, 'final', 'postponed');
select pg_temp.expect(pg_temp.finalize_error(3) = 'Cannot finalize while real games are unfinished', 'finalize refuses a week with a postponed game');
select pg_temp.expect(not pg_temp.is_final(3), 'refused matchup stays open');
select pg_temp.expect((select home_points = 20.00 from public.matchups where week = 3) is not true, 'a refused finalize rolls back its score write too');
select public.recompute_matchup('00000000-0000-0000-0000-00000000aa03'::uuid, false);
select pg_temp.expect((select home_points = 20.00 and not is_final from public.matchups where week = 3), 'non-finalizing recompute still scores an open week');
select pg_temp.override(3);
select pg_temp.expect(pg_temp.finalize_error(3) = '' and pg_temp.is_final(3), 'finalize succeeds under the operator override');
select pg_temp.expect((select payload->>'postponed_game_override' = 'true' from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = '00000000-0000-0000-0000-00000000aa03'), 'the override is recorded on the matchup_final event');

-- Week 4: the override does not release a game that is still being played.
select pg_temp.set_week(4, 'final', 'postponed', 'in_progress');
select pg_temp.override(4);
select pg_temp.expect(pg_temp.finalize_error(4) = 'Cannot finalize while real games are unfinished' and not pg_temp.is_final(4), 'override does not release an in-progress game');

-- Week 5: scheduled games block; week 6: no games at all blocks.
select pg_temp.set_week(5, 'final', 'scheduled');
select pg_temp.expect(pg_temp.finalize_error(5) = 'Cannot finalize while real games are unfinished', 'finalize refuses a week with a scheduled game');
select pg_temp.expect(pg_temp.finalize_error(6) = 'Cannot finalize while real games are unfinished', 'finalize refuses a week with no games');

-- Permission checks are unchanged: a signed-in non-commissioner cannot finalize.
select pg_temp.set_week(5, 'final', 'final');
select set_config('test.uid', '00000000-0000-0000-0000-000000000099', false);
select pg_temp.expect(pg_temp.finalize_error(5) = 'League access required', 'a non-member cannot recompute');
select set_config('test.uid', (select commissioner::text from ids), false);
select pg_temp.expect(pg_temp.finalize_error(5) = '' and pg_temp.is_final(5), 'the commissioner path still finalizes');
select set_config('test.uid', '', false);

-- The override table is not reachable by app users.
select pg_temp.expect(not has_table_privilege('authenticated', 'public.fantasy_week_close_overrides', 'select')
  and not has_table_privilege('anon', 'public.fantasy_week_close_overrides', 'select')
  and has_table_privilege('service_role', 'public.fantasy_week_close_overrides', 'insert'), 'only the service role can read or write overrides');

\echo ALL WEEK CLOSE TERMINAL GAME RULE TESTS PASSED
