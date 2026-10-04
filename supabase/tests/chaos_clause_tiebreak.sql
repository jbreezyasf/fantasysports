-- Executable test for 20261004010000_chaos_clause_tiebreak.sql.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/chaos_clause_tiebreak.sql
--
-- Same tables, production function bodies and synthetic season as
-- second_half_rehearsal.sql. The migration is loaded directly on top of the
-- PRODUCTION functions, without 20261003040000 or 20261003060000, which is the
-- state production is in on 2026-10-04 (second_half_rehearsal.sql covers the
-- other order: both applied first). Every scenario runs in a transaction that
-- is rolled back, starting from: Weeks 1-14 final, postseason seeded, the four
-- Week 15 games created and still open.

\set ON_ERROR_STOP 1
set client_min_messages = error;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

-- Production definition of auth.uid().
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$;

create type public.game_state as enum ('scheduled','in_progress','final','postponed','canceled','delayed','suspended','unknown');
create type public.lineup_slot as enum ('QB','RB','WR','TE','FLEX','K','DST','BENCH','IR');
create type public.member_role as enum ('commissioner','manager');
create table public.competition_seasons (id uuid default gen_random_uuid() primary key, competition_id uuid not null, season_year integer not null, starts_on date, ends_on date, late_entry_cutoff_at timestamp with time zone);
create table public.league_seasons (id uuid default gen_random_uuid() primary key, league_id uuid not null, competition_season_id uuid not null, status text default 'setup'::text not null, roster_config jsonb not null, scoring_profile_id uuid, trade_deadline_at timestamp with time zone, waiver_period_hours integer default 48 not null, is_current boolean default true not null, unique (league_id, competition_season_id));
create table public.league_members (id uuid default gen_random_uuid() primary key, league_id uuid not null, user_id uuid not null, role member_role default 'manager'::member_role not null, joined_at timestamp with time zone default now() not null, unique (league_id, user_id));
create table public.league_feed_events (id uuid default gen_random_uuid() primary key, league_id uuid not null, season_id uuid, actor_user_id uuid, event_type text not null, body text, payload jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);
create table public.franchises (id uuid default gen_random_uuid() primary key, league_id uuid not null, name text not null, abbreviation text, primary_color text, secondary_color text, established_year integer not null, created_at timestamp with time zone default now() not null, avatar_key text default 'classic'::text not null);
create table public.season_franchises (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, franchise_id uuid not null, draft_position integer, roster_locked_at timestamp with time zone, roster_lock_reason text, unique (league_season_id, franchise_id));
create table public.standings (league_season_id uuid not null, season_franchise_id uuid not null, wins integer default 0 not null, losses integer default 0 not null, ties integer default 0 not null, points_for numeric(10,2) default 0 not null, points_against numeric(10,2) default 0 not null, streak integer default 0 not null, primary key (league_season_id, season_franchise_id));
create table public.matchups (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, week integer not null, home_season_franchise_id uuid not null, away_season_franchise_id uuid not null, event_type text default 'circuit'::text not null, home_points numeric(8,2) default 0 not null, away_points numeric(8,2) default 0 not null, winner_season_franchise_id uuid, is_final boolean default false not null, context jsonb default '{}'::jsonb not null, result_source text default 'LIVE'::text not null, simulated_reason text, result_published_at timestamp with time zone, unique (league_season_id, week, home_season_franchise_id), unique (league_season_id, week, away_season_franchise_id));
create table public.rivalries (id uuid default gen_random_uuid() primary key, league_id uuid not null, franchise_a_id uuid not null, franchise_b_id uuid not null, designated boolean default false not null, rivalry_score numeric(8,2) default 0 not null, created_at timestamp with time zone default now() not null, check (franchise_a_id <> franchise_b_id));
create table public.postseason_seeds (league_season_id uuid not null, season_franchise_id uuid not null, seed integer not null check (seed >= 1 and seed <= 10), bracket text not null check (bracket = any (array['championship'::text, 'redemption'::text])), created_at timestamp with time zone default now() not null, primary key (league_season_id, season_franchise_id), unique (league_season_id, seed));
create table public.championships (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, bracket text not null check (bracket = any (array['championship'::text, 'redemption'::text])), winner_season_franchise_id uuid not null, runner_up_season_franchise_id uuid, final_matchup_id uuid, awarded_at timestamp with time zone default now() not null, unique (league_season_id, bracket));
create table public.achievements (id uuid default gen_random_uuid() primary key, code text not null unique, display_name text not null, description text, category text not null, unlock_rule jsonb default '{}'::jsonb not null, active boolean default true not null);
create table public.franchise_achievements (id uuid default gen_random_uuid() primary key, franchise_id uuid not null, league_season_id uuid, achievement_id uuid not null, week integer, earned_at timestamp with time zone default now() not null, payload jsonb default '{}'::jsonb not null);
create table public.real_games (id uuid default gen_random_uuid() primary key, competition_season_id uuid not null, provider_game_id text, week integer, home_team_id uuid, away_team_id uuid, starts_at timestamp with time zone not null, state game_state default 'scheduled'::game_state not null, home_score integer, away_score integer, updated_at timestamp with time zone default now() not null);
create table public.lineups (id uuid default gen_random_uuid() primary key, season_franchise_id uuid not null, week integer not null, athlete_id uuid, slot lineup_slot not null, locked_at timestamp with time zone, real_team_id uuid, slot_index integer default 1 not null);
create table public.fantasy_player_scores (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, athlete_id uuid not null, game_id uuid not null, week integer not null, points numeric(8,2) not null, breakdown jsonb not null, calculated_at timestamp with time zone default now() not null);
create table public.fantasy_team_scores (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, real_team_id uuid not null, game_id uuid not null, week integer not null, points numeric(8,2) not null, breakdown jsonb not null, calculated_at timestamp with time zone default now() not null);


\ir fixtures/production_season_functions.sql
\ir ../migrations/20261004010000_chaos_clause_tiebreak.sql

create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAILED: %', p_label; end if;
  raise info 'ok - %', p_label;
end $$;
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
  '00000000-0000-0000-0000-000000000001'::uuid as commissioner;
create temp table teams as
  select n,
         ('00000000-0000-0000-0000-0000000f00' || lpad(n::text, 2, '0'))::uuid as franchise,
         ('00000000-0000-0000-0000-0000005f00' || lpad(n::text, 2, '0'))::uuid as sf,
         ('00000000-0000-0000-0000-000000a700' || lpad(n::text, 2, '0'))::uuid as athlete
  from generate_series(1, 10) n;

insert into public.competition_seasons(id, competition_id, season_year) select cs, gen_random_uuid(), 2026 from ids;
insert into public.league_seasons(id, league_id, competition_season_id, roster_config) select ls, league, cs, '{}'::jsonb from ids;
insert into public.league_members(league_id, user_id, role) select league, commissioner, 'commissioner' from ids;
insert into public.franchises(id, league_id, name, established_year) select franchise, (select league from ids), 'Franchise ' || n, 2026 from teams;
insert into public.season_franchises(id, league_season_id, franchise_id, draft_position) select sf, (select ls from ids), franchise, n from teams;
insert into public.standings(league_season_id, season_franchise_id) select (select ls from ids), sf from teams;
insert into public.achievements(code, display_name, category) values
  ('LEAGUE_CHAMPION', 'League Champion', 'season'), ('REDEMPTION_CHAMPION', 'Redemption Champion', 'season'), ('CHAOS_GIANT_KILLER', 'Chaos Giant Killer', 'event');
insert into public.real_games(competition_season_id, week, starts_at, state)
  select (select cs from ids), w, now() - interval '200 days' + (w || ' days')::interval, 'final' from generate_series(1, 17) w;
insert into public.lineups(season_franchise_id, week, athlete_id, slot)
  select sf, w, athlete, 'QB' from teams, generate_series(1, 17) w;
insert into public.fantasy_player_scores(league_season_id, athlete_id, game_id, week, points, breakdown)
  select (select ls from ids), athlete, gen_random_uuid(), w, 80 + ((n * 37 + w * 53 + n * w * 11) % 61) + n / 100.0, '{}'::jsonb
  from teams, generate_series(1, 17) w;

create function pg_temp.as_commissioner(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', (select commissioner::text from ids), true);
  execute p_sql into v;
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;
-- What the weekly job does when a week's real games are all final.
create function pg_temp.close_week(p_week integer) returns integer language plpgsql as $$
declare m record; n integer := 0;
begin
  for m in select id from public.matchups where league_season_id = (select ls from ids) and week = p_week and not is_final order by id loop
    perform public.recompute_matchup(m.id, true); n := n + 1;
  end loop;
  return n;
end $$;
create function pg_temp.advance(p_week integer) returns jsonb language sql as
$$ select public.system_advance_fantasy_season((select ls from ids), p_week) $$;
create function pg_temp.advance_error(p_week integer) returns text language sql as
$$ select pg_temp.error_of(format('select public.system_advance_fantasy_season(%L::uuid, %s)', (select ls from ids), p_week)) $$;
-- Standings order exactly as the generators compute it.
create function pg_temp.ranked() returns uuid[] language sql as
$$ select array_agg(season_franchise_id order by wins desc, points_for desc, season_franchise_id) from public.standings where league_season_id = (select ls from ids) $$;
create function pg_temp.pairs(p_week integer) returns text[] language sql as
$$ select array_agg(home_season_franchise_id || '>' || away_season_franchise_id order by home_season_franchise_id) from public.matchups where league_season_id = (select ls from ids) and week = p_week $$;
create function pg_temp.week_shape(p_week integer, p_event text, p_matchups integer) returns boolean language sql as $$
  select count(*) = p_matchups and count(*) filter (where m.event_type = p_event) = p_matchups
     and (select count(distinct f) from public.matchups x cross join lateral (values (x.home_season_franchise_id), (x.away_season_franchise_id)) t(f)
          where x.league_season_id = (select ls from ids) and x.week = p_week) = p_matchups * 2
  from public.matchups m where m.league_season_id = (select ls from ids) and m.week = p_week
$$;


-- Test helpers ---------------------------------------------------------------
-- The one matchup of a week and event type, by position (lowest id first).
create function pg_temp.game(p_week integer, p_event text, p_nth integer default 1) returns uuid language sql as
$$ select id from public.matchups where league_season_id = (select ls from ids) and week = p_week and event_type = p_event order by id offset p_nth - 1 limit 1 $$;
-- Both starters of a matchup score 100.00 that week: the game will finish level.
create function pg_temp.make_level(p_matchup uuid) returns void language sql as $$
  update public.fantasy_player_scores s set points = 100 from public.matchups m, teams t
  where m.id = p_matchup and s.week = m.week and s.athlete_id = t.athlete and t.sf in (m.home_season_franchise_id, m.away_season_franchise_id)
$$;
-- A franchise's finalized points in its game of a given week and type.
create function pg_temp.week_points(p_sf uuid, p_week integer, p_event text) returns numeric language sql as $$
  select case when home_season_franchise_id = p_sf then home_points else away_points end from public.matchups
  where league_season_id = (select ls from ids) and week = p_week and event_type = p_event and is_final and p_sf in (home_season_franchise_id, away_season_franchise_id)
$$;
-- Overwrite a franchise's points in an already-final regular-season game (fixture surgery).
create function pg_temp.set_week_points(p_sf uuid, p_week integer, p_points numeric) returns void language sql as $$
  update public.matchups set home_points = case when home_season_franchise_id = p_sf then p_points else home_points end,
                             away_points = case when away_season_franchise_id = p_sf then p_points else away_points end
  where league_season_id = (select ls from ids) and week = p_week and p_sf in (home_season_franchise_id, away_season_franchise_id)
$$;
create function pg_temp.seed_of(p_sf uuid) returns integer language sql as
$$ select seed from public.postseason_seeds where league_season_id = (select ls from ids) and season_franchise_id = p_sf $$;
create function pg_temp.standing(p_sf uuid) returns jsonb language sql as
$$ select to_jsonb(s) from public.standings s where league_season_id = (select ls from ids) and season_franchise_id = p_sf $$;
-- The side the ladder should pick for a level game, computed independently of the migration.
create function pg_temp.expected_winner(p_matchup uuid, p_week integer, p_event text) returns uuid language sql as $$
  select case when pg_temp.week_points(home_season_franchise_id, p_week, p_event) > pg_temp.week_points(away_season_franchise_id, p_week, p_event) then home_season_franchise_id
              when pg_temp.week_points(home_season_franchise_id, p_week, p_event) < pg_temp.week_points(away_season_franchise_id, p_week, p_event) then away_season_franchise_id end
  from public.matchups where id = p_matchup
$$;
create function pg_temp.clause(p_matchup uuid) returns jsonb language sql as
$$ select context->'chaos_clause' from public.matchups where id = p_matchup $$;
-- Everything recompute may touch for one matchup, as one comparable value.
create function pg_temp.snapshot(p_matchup uuid) returns jsonb language sql as $$
  select jsonb_build_object('matchup', to_jsonb(m),
    'standings', (select jsonb_agg(to_jsonb(s) order by s.season_franchise_id) from public.standings s where s.league_season_id = m.league_season_id),
    'feed', (select count(*) from public.league_feed_events where event_type = 'matchup_final'),
    'achievements', (select count(*) from public.franchise_achievements))
  from public.matchups m where m.id = p_matchup
$$;

-- Base state ------------------------------------------------------------------
select pg_temp.expect(pg_temp.as_commissioner(format('select public.generate_circuit_schedule(%L::uuid)', (select league from ids)))->>'status' = 'created', 'base: the Circuit is created');
select pg_temp.expect((select sum(pg_temp.close_week(w)) = 45 from generate_series(1, 9) w), 'base: Weeks 1-9 close through the new recompute_matchup');
select pg_temp.expect(pg_temp.advance(10)->'result'->>'status' = 'created' and pg_temp.close_week(10) = 5, 'base: Week 10 Rivalry');
select pg_temp.expect(pg_temp.advance(11)->'result'->>'status' = 'created' and pg_temp.close_week(11) = 5, 'base: Week 11 Revenge');
select pg_temp.expect(pg_temp.advance(12)->'result'->>'status' = 'created' and pg_temp.close_week(12) = 5, 'base: Week 12 Position');
select pg_temp.expect(pg_temp.advance(13)->'result'->>'status' = 'created' and pg_temp.close_week(13) = 5, 'base: Week 13 Chaos');
select pg_temp.expect(pg_temp.advance(14)->'result'->>'status' = 'created', 'base: Week 14 Judgment generated');

-- A REGULAR-SEASON tie stays a tie (Week 14, event_type judgment).
begin;
select pg_temp.game(14, 'judgment') as g \gset
select home_season_franchise_id as h, away_season_franchise_id as a from public.matchups where id = :'g' \gset
create temp table before_tie on commit drop as select pg_temp.standing(:'h') as h, pg_temp.standing(:'a') as a;
select pg_temp.make_level(:'g');
select pg_temp.expect(pg_temp.close_week(14) = 5, 'regular season: Week 14 closes with a level game in it');
select pg_temp.expect((select is_final and winner_season_franchise_id is null and home_points = 100 and away_points = 100 from public.matchups where id = :'g'), 'regular season: a level game is final with NO winner');
select pg_temp.expect(pg_temp.clause(:'g') is null, 'regular season: nothing about the Chaos Clause is recorded on the matchup');
select pg_temp.expect((select (pg_temp.standing(:'h')->>'ties')::int = (h->>'ties')::int + 1 and (pg_temp.standing(:'h')->>'wins') = (h->>'wins') and (pg_temp.standing(:'h')->>'losses') = (h->>'losses')
  and (pg_temp.standing(:'a')->>'ties')::int = (a->>'ties')::int + 1 and (pg_temp.standing(:'a')->>'wins') = (a->>'wins') and (pg_temp.standing(:'a')->>'losses') = (a->>'losses') from before_tie), 'regular season: both franchises get a tie, no win and no loss');
select pg_temp.expect((select not (payload ? 'chaos_clause') and payload->>'winner_season_franchise_id' is null from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = :'g'), 'regular season: the feed event has no winner and no clause');
rollback;

select pg_temp.expect(pg_temp.close_week(14) = 5 and (select sum(ties) = 0 from public.standings), 'base: Week 14 closes, no ties in the standings');
select pg_temp.expect(pg_temp.advance(15)->'result'->>'status' = 'created', 'base: postseason seeded, Week 15 created');
select pg_temp.expect((select count(distinct points) = 10 from (select pg_temp.week_points(sf, 13, 'chaos') points from teams) x)
  and (select count(distinct points) = 10 from (select pg_temp.week_points(sf, 10, 'rivalry') points from teams) x), 'base: all ten Chaos Week scores differ, and all ten Rivalry Week scores differ');

-- ---------------------------------------------------------------------------
-- 1. One whole postseason in which EVERY game finishes level.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.game(15, 'playoff_qf', 1) as qf1, pg_temp.game(15, 'playoff_qf', 2) as qf2, pg_temp.game(15, 'redemption_sf', 1) as rs1, pg_temp.game(15, 'redemption_sf', 2) as rs2 \gset
select home_season_franchise_id as qh, away_season_franchise_id as qa from public.matchups where id = :'qf1' \gset
select pg_temp.expected_winner(:'qf1', 13, 'chaos') as qw \gset
select case when :'qw' = :'qh' then :'qa' else :'qh' end as ql \gset
create temp table before_qf on commit drop as select pg_temp.standing(:'qw') as w, pg_temp.standing(:'ql') as l;
select pg_temp.make_level(m.id) from public.matchups m where m.week = 15;
select pg_temp.expect(pg_temp.close_week(15) = 4, 'Week 15 closes with all four games level');
select pg_temp.expect((select bool_and(is_final and home_points = 100 and away_points = 100) from public.matchups where week = 15), 'the scores stay level: 100.00 to 100.00 in all four games');

select pg_temp.expect((select winner_season_franchise_id = :'qw' from public.matchups where id = :'qf1'), 'tied QUARTERFINAL: the winner is the franchise with the higher Chaos Week score');
select pg_temp.expect(pg_temp.clause(:'qf1') @> jsonb_build_object('rule', 'chaos_clause', 'decided_by', 'chaos_week', 'winner_season_franchise_id', :'qw')
  and jsonb_array_length(pg_temp.clause(:'qf1')->'steps') = 1, 'tied quarterfinal: matchups.context records chaos_week as the single step used');
select pg_temp.expect((pg_temp.clause(:'qf1')->'steps'->0->>'home')::numeric = pg_temp.week_points(:'qh', 13, 'chaos')
  and (pg_temp.clause(:'qf1')->'steps'->0->>'away')::numeric = pg_temp.week_points(:'qa', 13, 'chaos')
  and pg_temp.clause(:'qf1')->'steps'->0->>'outcome' = case when :'qw' = :'qh' then 'home' else 'away' end
  and pg_temp.clause(:'qf1')->'steps'->0->>'home' ~ '^\d+\.\d\d$', 'tied quarterfinal: both Chaos Week totals are recorded, with two decimals');
select pg_temp.expect((select payload->'chaos_clause' = pg_temp.clause(:'qf1') and payload->>'winner_season_franchise_id' = :'qw' and (payload->>'home_points')::numeric = 100 and (payload->>'away_points')::numeric = 100
  from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = :'qf1'), 'tied quarterfinal: the matchup_final feed payload carries the same record');
select pg_temp.expect((select (pg_temp.standing(:'qw')->>'wins')::int = (w->>'wins')::int + 1 and pg_temp.standing(:'qw')->>'losses' = w->>'losses' and pg_temp.standing(:'qw')->>'ties' = '0'
  and (pg_temp.standing(:'qw')->>'points_for')::numeric = (w->>'points_for')::numeric + 100 and (pg_temp.standing(:'qw')->>'points_against')::numeric = (w->>'points_against')::numeric + 100
  and (pg_temp.standing(:'qw')->>'streak')::int = case when (w->>'streak')::int >= 0 then (w->>'streak')::int + 1 else 1 end
  and (pg_temp.standing(:'ql')->>'losses')::int = (l->>'losses')::int + 1 and pg_temp.standing(:'ql')->>'wins' = l->>'wins' and pg_temp.standing(:'ql')->>'ties' = '0'
  and (pg_temp.standing(:'ql')->>'streak')::int = case when (l->>'streak')::int <= 0 then (l->>'streak')::int - 1 else -1 end from before_qf),
  'standings: a clause-decided game counts exactly like a won game (win and streak for the winner, loss for the loser, no tie)');

-- Recomputing a finalized matchup changes nothing, even if the Chaos Week row is later different.
create temp table snap on commit drop as select pg_temp.snapshot(:'qf1') as s;
select pg_temp.expect(public.recompute_matchup(:'qf1', true) @> jsonb_build_object('is_final', true, 'winner_season_franchise_id', :'qw', 'chaos_clause', pg_temp.clause(:'qf1'))
  and public.recompute_matchup(:'qf1', false)->>'winner_season_franchise_id' = :'qw', 'recompute after finalization returns the same winner and record');
select pg_temp.expect((select pg_temp.snapshot(:'qf1') = s from snap), 'recompute after finalization (finalize true, then false): matchup, standings, feed and achievements are unchanged');
savepoint later_change;
select pg_temp.set_week_points(:'qw', 13, 0);
select public.recompute_matchup(:'qf1', true);
select pg_temp.expect((select winner_season_franchise_id = :'qw' from public.matchups where id = :'qf1') and (select pg_temp.clause(:'qf1') = s->'matchup'->'context'->'chaos_clause' from snap), 'a later change to the Chaos Week row does not re-decide a finalized game');
rollback to savepoint later_change;

select pg_temp.expect((select winner_season_franchise_id = pg_temp.expected_winner(:'qf2', 13, 'chaos') from public.matchups where id = :'qf2'), 'the other tied quarterfinal is decided the same way');
select pg_temp.expect((select bool_and(m.winner_season_franchise_id = pg_temp.expected_winner(m.id, 13, 'chaos') and m.context->'chaos_clause'->>'decided_by' = 'chaos_week') from public.matchups m where m.id in (:'rs1', :'rs2')), 'tied REDEMPTION semifinals: decided by Chaos Week score');

select pg_temp.expect(pg_temp.advance(16) @> '{"step":"generate_postseason_week16","result":{"status":"created","matchups":2}}', 'Week 16 generates after tied quarterfinals (this failed with a NOT NULL error before)');
select pg_temp.expect((select count(*) = 2 and array_agg(away_season_franchise_id order by away_season_franchise_id) = (select array_agg(winner_season_franchise_id order by winner_season_franchise_id) from public.matchups where id in (:'qf1', :'qf2'))
  and bool_and(pg_temp.seed_of(home_season_franchise_id) in (1, 2)) from public.matchups where week = 16 and event_type = 'playoff_sf'), 'Week 16: seeds 1 and 2 host the two clause-decided quarterfinal winners');
select pg_temp.expect((select pg_temp.seed_of(m.away_season_franchise_id) = (select max(pg_temp.seed_of(winner_season_franchise_id)) from public.matchups where id in (:'qf1', :'qf2'))
  from public.matchups m where m.week = 16 and pg_temp.seed_of(m.home_season_franchise_id) = 1), 'Week 16: seed 1 plays the lower-seeded quarterfinal winner');

select pg_temp.make_level(m.id) from public.matchups m where m.week = 16;
select pg_temp.expect(pg_temp.close_week(16) = 2, 'Week 16 closes with both semifinals level');
select pg_temp.expect((select bool_and(m.home_points = m.away_points and m.winner_season_franchise_id = pg_temp.expected_winner(m.id, 13, 'chaos') and m.context->'chaos_clause'->>'decided_by' = 'chaos_week') from public.matchups m where m.week = 16), 'tied SEMIFINALS: decided by Chaos Week score');
select pg_temp.expect(pg_temp.advance(17) @> '{"step":"generate_postseason_week17","result":{"status":"created","matchups":2}}', 'Week 17 generates after tied semifinals and tied redemption semifinals');
select pg_temp.expect((select array[home_season_franchise_id, away_season_franchise_id] <@ (select array_agg(winner_season_franchise_id) from public.matchups where week = 16) from public.matchups where week = 17 and event_type = 'championship')
  and (select array[home_season_franchise_id, away_season_franchise_id] <@ array[(select winner_season_franchise_id from public.matchups where id = :'rs1'), (select winner_season_franchise_id from public.matchups where id = :'rs2')] from public.matchups where week = 17 and event_type = 'redemption_final'), 'Week 17: both finals are between the clause-decided winners');

select pg_temp.make_level(m.id) from public.matchups m where m.week = 17;
select pg_temp.expect(pg_temp.close_week(17) = 2, 'Week 17 closes with both finals level');
select pg_temp.expect((select bool_and(m.home_points = m.away_points and m.winner_season_franchise_id = pg_temp.expected_winner(m.id, 13, 'chaos') and m.context->'chaos_clause'->>'decided_by' = 'chaos_week') from public.matchups m where m.week = 17), 'tied CHAMPIONSHIP and tied REDEMPTION FINAL: decided by Chaos Week score');
select pg_temp.expect(pg_temp.advance(18) @> '{"step":"close_league_season","result":{"status":"complete","already_closed":false}}', 'the season closes after a tied championship (close_league_season refused forever before)');
select pg_temp.expect((select count(*) = 2 from public.championships c join public.matchups m on m.id = c.final_matchup_id and m.winner_season_franchise_id = c.winner_season_franchise_id and m.home_points = m.away_points)
  and (select status = 'complete' from public.league_seasons), 'both champions are the clause-decided winners; the season is complete');
select pg_temp.expect((select count(*) = 8 and bool_and(winner_season_franchise_id is not null) and bool_and(context ? 'chaos_clause') from public.matchups where week >= 15)
  and (select sum(wins) = 78 and sum(losses) = 78 and sum(ties) = 0 from public.standings)
  and (select count(*) = 8 from public.league_feed_events where event_type = 'matchup_final' and payload ? 'chaos_clause'), 'all 8 postseason games have a winner; standings hold 78 wins, 78 losses, 0 ties; 8 feed events carry the clause');
rollback;

-- ---------------------------------------------------------------------------
-- 2. The ladder. Each case ties quarterfinal 1 (home is the better seed).
-- ---------------------------------------------------------------------------
select pg_temp.game(15, 'playoff_qf', 1) as qf \gset
select home_season_franchise_id as h, away_season_franchise_id as a from public.matchups where id = :'qf' \gset
select pg_temp.expect(pg_temp.seed_of(:'h') < pg_temp.seed_of(:'a'), 'ladder fixture: the home side of the quarterfinal is the better seed');

-- Chaos scores level, so Rivalry Week decides. The away side is given the higher Rivalry score.
begin;
select pg_temp.set_week_points(:'h', 13, 120.50), pg_temp.set_week_points(:'a', 13, 120.50), pg_temp.set_week_points(:'h', 10, 95.25), pg_temp.set_week_points(:'a', 10, 131.40);
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect((select winner_season_franchise_id = :'a' and home_points = away_points from public.matchups where id = :'qf'), 'Chaos scores level: the higher Rivalry Week score wins (here the lower seed, away)');
select pg_temp.expect(pg_temp.clause(:'qf')->>'decided_by' = 'rivalry_week' and pg_temp.clause(:'qf')->'steps' = '[{"step":"chaos_week","week":13,"home":120.50,"away":120.50,"outcome":"level"},{"step":"rivalry_week","week":10,"home":95.25,"away":131.40,"outcome":"away"}]'::jsonb, 'Chaos level: both compared steps and all four values are recorded');
rollback;

-- Chaos and Rivalry both level, so the higher seed wins.
begin;
select pg_temp.set_week_points(:'h', 13, 120.50), pg_temp.set_week_points(:'a', 13, 120.50), pg_temp.set_week_points(:'h', 10, 99.99), pg_temp.set_week_points(:'a', 10, 99.99);
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect((select winner_season_franchise_id = :'h' from public.matchups where id = :'qf') and pg_temp.clause(:'qf')->>'decided_by' = 'postseason_seed', 'Chaos and Rivalry both level: the higher seed wins');
select pg_temp.expect(pg_temp.clause(:'qf')->'steps' = jsonb_build_array(
  '{"step":"chaos_week","week":13,"home":120.50,"away":120.50,"outcome":"level"}'::jsonb, '{"step":"rivalry_week","week":10,"home":99.99,"away":99.99,"outcome":"level"}'::jsonb,
  jsonb_build_object('step', 'postseason_seed', 'home', pg_temp.seed_of(:'h'), 'away', pg_temp.seed_of(:'a'), 'outcome', 'home')), 'both level: all three steps are recorded, with both seeds');
rollback;

-- Higher seed on the AWAY side still wins the last step (Week 17 home side is not chosen by seed).
begin;
update public.matchups set home_season_franchise_id = :'a', away_season_franchise_id = :'h' where id = :'qf';
delete from public.matchups where week in (10, 13);
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect((select winner_season_franchise_id = :'h' and winner_season_franchise_id = away_season_franchise_id from public.matchups where id = :'qf') and pg_temp.clause(:'qf')->'steps'->2->>'outcome' = 'away', 'seed step: the lower seed number wins from the away side too');
rollback;

-- Chaos Week missing for ONE franchise: that step is unavailable, Rivalry decides.
begin;
select pg_temp.week_points(:'h', 13, 'chaos') as h13 \gset
delete from public.matchups where week = 13 and :'a' in (home_season_franchise_id, away_season_franchise_id);
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect((select winner_season_franchise_id = pg_temp.expected_winner(:'qf', 10, 'rivalry') from public.matchups where id = :'qf') and pg_temp.clause(:'qf')->>'decided_by' = 'rivalry_week', 'Chaos Week missing for one franchise: falls through to Rivalry Week');
select pg_temp.expect(pg_temp.clause(:'qf')->'steps'->0 @> '{"step":"chaos_week","outcome":"unavailable","away":null}' and (pg_temp.clause(:'qf')->'steps'->0->>'home')::numeric = :h13, 'Chaos Week missing: the step is recorded as unavailable with the one score that exists');
rollback;

-- Chaos Week exists but is NOT FINAL: unavailable as well.
begin;
update public.matchups set is_final = false where week = 13;
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect(pg_temp.clause(:'qf')->'steps'->0->>'outcome' = 'unavailable' and pg_temp.clause(:'qf')->>'decided_by' = 'rivalry_week', 'Chaos Week not final: unavailable, Rivalry Week decides');
rollback;

-- A Week 13 game that is not a Chaos Week game does not count.
begin;
update public.matchups set event_type = 'circuit' where week = 13;
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect(pg_temp.clause(:'qf')->'steps'->0->>'outcome' = 'unavailable' and pg_temp.clause(:'qf')->>'decided_by' = 'rivalry_week', 'a Week 13 game with another event type is not a Chaos Week score');
rollback;

-- Neither week exists (late-start or test league): straight to the seed.
begin;
delete from public.matchups where week in (10, 13);
select pg_temp.make_level(:'qf');
select public.recompute_matchup(:'qf', true);
select pg_temp.expect((select winner_season_franchise_id = :'h' from public.matchups where id = :'qf') and pg_temp.clause(:'qf')->>'decided_by' = 'postseason_seed'
  and pg_temp.clause(:'qf')->'steps'->0->>'outcome' = 'unavailable' and pg_temp.clause(:'qf')->'steps'->1->>'outcome' = 'unavailable', 'Chaos and Rivalry Weeks both missing: the higher seed wins');
rollback;

-- Defensive: no seeds either. The game stays level and the system path stops with a reason.
begin;
delete from public.matchups where week in (10, 13);
delete from public.postseason_seeds where season_franchise_id = :'a';
select pg_temp.make_level(:'qf');
select pg_temp.expect(pg_temp.close_week(15) = 4, 'no seed: Week 15 still closes');
select pg_temp.expect((select is_final and winner_season_franchise_id is null from public.matchups where id = :'qf') and pg_temp.clause(:'qf') @> '{"decided_by":"unresolved","winner_season_franchise_id":null}'
  and (select (pg_temp.standing(:'h')->>'ties')::int = 1), 'no seed for a franchise: the game is final and level as before, recorded as unresolved');
select pg_temp.expect(pg_temp.advance_error(16) = 'A postseason matchup is final with no winner (the Chaos Clause could not decide it); a commissioner decision is required', 'defensive stop: the system path refuses to advance past a postseason game with no winner');
rollback;

-- A postseason game that is NOT level is untouched by the clause.
begin;
select public.recompute_matchup(:'qf', true);
select pg_temp.expect((select winner_season_franchise_id is not null and home_points <> away_points and not (context ? 'chaos_clause') from public.matchups where id = :'qf')
  and (select not (payload ? 'chaos_clause') from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = :'qf'), 'a postseason game won on points records no clause');
rollback;

-- Which event types the clause covers, and who may call the helpers.
select pg_temp.expect((select bool_and(public.chaos_clause_applies(e)) from unnest(array['playoff_qf','playoff_sf','championship','redemption_sf','redemption_final','third_place']) e)
  and (select not bool_or(public.chaos_clause_applies(e)) from unnest(array['circuit','rivalry','revenge','position','chaos','judgment','circuit_test',null]) e), 'the clause covers every postseason event type and no regular-season one');
select pg_temp.expect(not has_function_privilege('anon', 'public.chaos_clause_decision(uuid, uuid, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.chaos_clause_decision(uuid, uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.chaos_clause_decision(uuid, uuid, uuid)', 'execute'), 'only the service role may call the clause helper directly');
select pg_temp.expect((select count(*) = 74 and count(*) filter (where is_final) = 70 from public.matchups) and (select count(*) = 70 from public.league_feed_events where event_type = 'matchup_final'), 'every scenario rolled back: the base state is intact');

\echo ALL CHAOS CLAUSE TIEBREAK TESTS PASSED
