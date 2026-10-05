-- End-to-end rehearsal of a 10-team season from the Circuit through the
-- championship, using the REAL production season functions
-- (fixtures/production_season_functions.sql) driven the way the weekly job
-- drives them: recompute_matchup(..., true) to close each week, then
-- system_advance_fantasy_season for the next step (both as defined by
-- 20261004010000_chaos_clause_tiebreak.sql).
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/second_half_rehearsal.sql
--
-- What this is: proof that the function bodies, in this order, produce a
-- complete season on tables shaped like production (columns, defaults and the
-- primary/unique/check constraints the functions depend on, generated from the
-- production catalog on 2026-10-03).
-- What this is not: a production run. Foreign keys, RLS, triggers on other
-- tables, real scoring and real lineups are not reproduced; every franchise
-- starts one synthetic player with a synthetic score each week.

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
\ir ../migrations/20261003060000_system_advance_fantasy_season.sql

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

-- The fixture bodies are the production bodies: md5 of each whitespace-stripped
-- source, as computed in production on 2026-10-03.
select pg_temp.expect(
  (select count(*) from (values
    ('award_matchup_achievements','707fb3b081a9249485a4b4f7ff44b343'),
    ('close_league_season','e8c38c0fcb67db2ff76c2b8b2e98cfc6'),
    ('generate_chaos_week','9fa4755ab2408ccd0adac637b8d86654'),
    ('generate_circuit_schedule','dc1885f344a57353ec5e8eb93012f9b9'),
    ('generate_judgment_week','12238460d8f39c3d713148bb07a3ba43'),
    ('generate_position_week','41e12eae3a89b329c39d56ca5f788ab3'),
    ('generate_postseason_week16','e6899a1ea626aa601f6980c9a332e52e'),
    ('generate_postseason_week17','9fe0f5ce43e7735a77f9edd181187ad3'),
    ('generate_revenge_week','6627e4a4cc5d3ea4e0666d339f91b89d'),
    ('generate_rivalry_week','9b45da545542bfbb835ca33905518762'),
    ('initialize_postseason','e32c72618678055ee3760b9dd77989e9'),
    ('recompute_matchup','f565e6a8d5d0e4ca19707c979b73e290')
  ) expected(name, hash)
  join pg_proc p on p.proname = expected.name and p.pronamespace = 'public'::regnamespace
   and md5(regexp_replace(convert_from(convert_to(p.prosrc, 'UTF8'), 'UTF8'), '\s+', '', 'g')) = expected.hash) = 12,
  'all 12 fixture function bodies match their production hashes');

-- On top of the production bodies: the two earlier migrations, then the Chaos
-- Clause migration that supersedes both (20261004010000). From here on
-- recompute_matchup and system_advance_fantasy_season are the new definitions;
-- the ten generator and postseason functions are still production's.
\ir ../migrations/20261003040000_week_close_terminal_game_rule.sql
\ir ../migrations/20261004010000_chaos_clause_tiebreak.sql

-- ---------------------------------------------------------------------------
-- Fixture: one league, one commissioner, ten franchises, weeks 1-17 of real
-- games already final, one starter per franchise with a distinct score per
-- week (the franchise number is in the cents, so no two franchises can tie).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Weeks 1-9: the Circuit.
-- ---------------------------------------------------------------------------
select pg_temp.expect(pg_temp.error_of(format('select public.generate_rivalry_week(%L::uuid, 10)', (select league from ids))) = 'Commissioner access required',
  'PRODUCTION BEHAVIOUR: a generator called with no signed-in user (the cron job) is refused');
select pg_temp.expect(pg_temp.as_commissioner(format('select public.generate_circuit_schedule(%L::uuid)', (select league from ids)))->>'status' = 'created', 'commissioner creates the Circuit');
select pg_temp.expect((select count(*) = 45 from public.matchups), 'the Circuit is 45 matchups');
select pg_temp.expect((select count(*) = 45 from (select distinct least(home_season_franchise_id, away_season_franchise_id), greatest(home_season_franchise_id, away_season_franchise_id) from public.matchups) p), 'every pair of franchises meets exactly once in Weeks 1-9');

select pg_temp.expect(pg_temp.advance_error(10) = 'Week 9 must be final first', 'Week 10 is not generated before Week 9 is final');
select pg_temp.expect(pg_temp.advance_error(9) = 'No automated season step for week 9' and pg_temp.advance_error(19) = 'No automated season step for week 19', 'only steps 10-18 exist');
select pg_temp.expect((select sum(pg_temp.close_week(w)) = 45 from generate_series(1, 9) w), 'Weeks 1-9 close');
select pg_temp.expect((select sum(wins) = 45 and sum(losses) = 45 and sum(ties) = 0 from public.standings), 'standings hold 45 results');
select pg_temp.expect(pg_temp.advance_error(11) = 'Week 10 must be final first', 'a step cannot be skipped');

-- A league with five separate designated rivalries (the shape production's
-- 10-Manager History Lab has) gets exactly those five games. Rolled back.
begin;
insert into public.rivalries(league_id, franchise_a_id, franchise_b_id, designated, rivalry_score)
  select (select league from ids), a.franchise, b.franchise, true, 100 - a.n from teams a join teams b on b.n = a.n + 5 where a.n <= 5;
select pg_temp.expect(pg_temp.advance(10)->'result'->>'status' = 'created' and pg_temp.week_shape(10, 'rivalry', 5), 'Week 10 with designated rivalries: 5 rivalry matchups');
select pg_temp.expect((select bool_and(exists (select 1 from teams a join teams b on b.n = a.n + 5 where a.sf = m.home_season_franchise_id and b.sf = m.away_season_franchise_id)) from public.matchups m where m.week = 10), 'each is a designated rivalry, franchise A at home');
rollback;

-- ---------------------------------------------------------------------------
-- Weeks 10-14: one generator per week, each built from the week before.
-- ---------------------------------------------------------------------------
select pg_temp.expect(pg_temp.advance(10) @> '{"step":"generate_rivalry_week","result":{"status":"created","matchups":5}}', 'Week 10: Rivalry Week generated by the system path');
select pg_temp.expect(pg_temp.week_shape(10, 'rivalry', 5), 'Week 10: 5 rivalry matchups, each franchise once');
select pg_temp.expect((select bool_and(exists (select 1 from public.matchups c where c.week <= 9 and c.home_season_franchise_id = m.home_season_franchise_id and c.away_season_franchise_id = m.away_season_franchise_id)) from public.matchups m where m.week = 10), 'Week 10 without designated rivalries: each game repeats a Circuit game, same home side');
select pg_temp.expect(pg_temp.advance(10)->'result'->>'status' = 'exists' and (select count(*) = 5 from public.matchups where week = 10), 'Week 10: running the step again changes nothing');
select pg_temp.expect(auth.uid() is null, 'the commissioner identity does not outlive the call');
select pg_temp.expect(pg_temp.close_week(10) = 5, 'Week 10 closes');

select pg_temp.expect(pg_temp.advance(11) @> '{"step":"generate_revenge_week","result":{"status":"created","matchups":5}}' and pg_temp.week_shape(11, 'revenge', 5), 'Week 11: 5 revenge matchups, each franchise once');
select pg_temp.expect((select bool_and(exists (select 1 from public.matchups p where p.week <= 10 and p.is_final and p.winner_season_franchise_id = m.away_season_franchise_id and m.home_season_franchise_id in (p.home_season_franchise_id, p.away_season_franchise_id))) from public.matchups m where m.week = 11), 'Week 11: every home side is hosting a franchise that beat it in Weeks 1-10');
select pg_temp.expect(pg_temp.advance(11)->'result'->>'status' = 'exists' and pg_temp.close_week(11) = 5, 'Week 11 is idempotent and closes');

create temp table rank_before as select 12 as week, pg_temp.ranked() as r;
select pg_temp.expect(pg_temp.advance(12) @> '{"step":"generate_position_week","result":{"status":"created"}}' and pg_temp.week_shape(12, 'position', 5), 'Week 12: 5 position matchups, each franchise once');
select pg_temp.expect(pg_temp.pairs(12) = (select array_agg(r[2*i-1] || '>' || r[2*i] order by r[2*i-1]) from rank_before, generate_series(1, 5) i where week = 12), 'Week 12 pairs standings 1v2 3v4 5v6 7v8 9v10, higher rank at home');
select pg_temp.expect(pg_temp.advance(12)->'result'->>'status' = 'exists' and pg_temp.close_week(12) = 5, 'Week 12 is idempotent and closes');

insert into rank_before select 13, pg_temp.ranked();
select pg_temp.expect(pg_temp.advance(13) @> '{"step":"generate_chaos_week","result":{"status":"created"}}' and pg_temp.week_shape(13, 'chaos', 5), 'Week 13: 5 chaos matchups, each franchise once');
select pg_temp.expect(pg_temp.pairs(13) = (select array_agg(r[i] || '>' || r[11-i] order by r[i]) from rank_before, generate_series(1, 5) i where week = 13), 'Week 13 pairs standings 1v10 2v9 3v8 4v7 5v6, higher rank at home');
select pg_temp.expect((select bool_and((context->>'home_seed')::int + (context->>'away_seed')::int = 11) from public.matchups where week = 13), 'Week 13 matchups record their seeds');
select pg_temp.expect(pg_temp.advance(13)->'result'->>'status' = 'exists' and pg_temp.close_week(13) = 5, 'Week 13 is idempotent and closes');
select pg_temp.expect((select count(*) from public.franchise_achievements fa join public.achievements a on a.id = fa.achievement_id where a.code = 'CHAOS_GIANT_KILLER')
  = (select count(*) from public.matchups where week = 13 and winner_season_franchise_id = away_season_franchise_id), 'every lower seed that won in Chaos Week earned CHAOS_GIANT_KILLER');

insert into rank_before select 14, pg_temp.ranked();
select pg_temp.expect(pg_temp.advance(14) @> '{"step":"generate_judgment_week","result":{"status":"created"}}' and pg_temp.week_shape(14, 'judgment', 5), 'Week 14: 5 judgment matchups, each franchise once');
select pg_temp.expect(pg_temp.pairs(14) = (select array_agg(r[a] || '>' || r[b] order by r[a]) from rank_before, (values (1,4),(2,3),(5,6),(7,8),(9,10)) p(a,b) where week = 14), 'Week 14 pairs standings 1v4 2v3 5v6 7v8 9v10');
select pg_temp.expect(pg_temp.advance_error(15) = 'Week 14 must be final first', 'the postseason is not seeded before Week 14 is final');
select pg_temp.expect(pg_temp.advance(14)->'result'->>'status' = 'exists' and pg_temp.close_week(14) = 5, 'Week 14 is idempotent and closes');
select pg_temp.expect((select count(*) = 70 and bool_and(is_final) from public.matchups) and (select sum(wins) = 70 from public.standings), 'the regular season is 70 final matchups');

-- ---------------------------------------------------------------------------
-- Weeks 15-17: postseason, then season close.
-- ---------------------------------------------------------------------------
insert into rank_before select 15, pg_temp.ranked();
select pg_temp.expect(pg_temp.advance(15) @> '{"step":"initialize_postseason","result":{"status":"created","week15_matchups":4}}', 'Week 15: postseason seeded by the system path');
select pg_temp.expect((select count(*) = 10 and count(*) filter (where bracket = 'championship' and seed <= 6) = 6 and count(*) filter (where bracket = 'redemption' and seed >= 7) = 4 from public.postseason_seeds), 'seeds 1-6 championship bracket, 7-10 redemption bracket');
select pg_temp.expect((select bool_and(ps.season_franchise_id = r[ps.seed]) from public.postseason_seeds ps, rank_before where week = 15), 'seeds are the standings order after Week 14');
select pg_temp.expect(pg_temp.pairs(15) = (select array_agg(r[a] || '>' || r[b] order by r[a]) from rank_before, (values (3,6),(4,5),(7,10),(8,9)) p(a,b) where week = 15)
  and (select count(*) filter (where event_type = 'playoff_qf') = 2 and count(*) filter (where event_type = 'redemption_sf') = 2 from public.matchups where week = 15), 'Week 15: quarterfinals 3v6 4v5, redemption semifinals 7v10 8v9; seeds 1 and 2 have no game');
select pg_temp.expect((select status = 'postseason' from public.league_seasons), 'league season status is postseason');
select pg_temp.expect(pg_temp.advance(15)->'result'->>'status' = 'exists' and (select count(*) = 4 from public.matchups where week = 15), 'Week 15 step is idempotent');
select pg_temp.expect(pg_temp.advance_error(16) = 'Week 15 must be final first', 'semifinals wait for Week 15');

-- A tied quarterfinal used to be final with no winner, and production's
-- generate_postseason_week16 then failed on a NOT NULL column. With the Chaos
-- Clause the game gets a winner at finalization (details and every other case:
-- chaos_clause_tiebreak.sql). Rolled back.
begin;
update public.fantasy_player_scores s set points = 100 from public.matchups m, teams t
  where m.week = 15 and m.event_type = 'playoff_qf' and s.week = 15 and s.athlete_id = t.athlete and t.sf in (m.home_season_franchise_id, m.away_season_franchise_id);
select pg_temp.close_week(15);
select pg_temp.expect((select count(*) = 2 from public.matchups where week = 15 and event_type = 'playoff_qf' and is_final and home_points = away_points and winner_season_franchise_id is not null and context->'chaos_clause'->>'decided_by' = 'chaos_week'), 'a tied playoff game is final, level on points, with a winner decided by the Chaos Clause');
select pg_temp.expect(pg_temp.advance(16) @> '{"step":"generate_postseason_week16","result":{"status":"created","matchups":2}}' and pg_temp.week_shape(16, 'playoff_sf', 2), 'Week 16 generates after tied quarterfinals');
rollback;

select pg_temp.expect(pg_temp.close_week(15) = 4, 'Week 15 closes');
select pg_temp.expect(pg_temp.advance(16) @> '{"step":"generate_postseason_week16","result":{"status":"created","matchups":2,"redemption_status":"rest_week"}}' and pg_temp.week_shape(16, 'playoff_sf', 2), 'Week 16: 2 semifinals; the redemption bracket rests');
select pg_temp.expect((select count(*) = 2 from public.matchups m join public.postseason_seeds h on h.season_franchise_id = m.home_season_franchise_id and h.seed in (1, 2)
  join public.matchups q on q.week = 15 and q.event_type = 'playoff_qf' and q.winner_season_franchise_id = m.away_season_franchise_id where m.week = 16), 'seeds 1 and 2 host the two quarterfinal winners');
select pg_temp.expect((select (m.context->>'opponent_seed')::int = (select max(ps.seed) from public.postseason_seeds ps join public.matchups q on q.week = 15 and q.event_type = 'playoff_qf' and q.winner_season_franchise_id = ps.season_franchise_id)
  from public.matchups m join public.postseason_seeds h on h.season_franchise_id = m.home_season_franchise_id and h.seed = 1 where m.week = 16), 'seed 1 plays the lower-seeded quarterfinal winner');
select pg_temp.expect(pg_temp.advance(16)->'result'->>'status' = 'exists' and pg_temp.close_week(16) = 2, 'Week 16 is idempotent and closes');

select pg_temp.expect(pg_temp.advance(17) @> '{"step":"generate_postseason_week17","result":{"status":"created","matchups":2}}', 'Week 17 generated by the system path');
select pg_temp.expect((select count(*) = 2 and count(*) filter (where event_type = 'championship') = 1 and count(*) filter (where event_type = 'redemption_final') = 1 from public.matchups where week = 17), 'Week 17: one championship, one redemption final');
select pg_temp.expect((select array[home_season_franchise_id, away_season_franchise_id] <@ (select array_agg(winner_season_franchise_id) from public.matchups where week = 16) from public.matchups where week = 17 and event_type = 'championship')
  and (select array[home_season_franchise_id, away_season_franchise_id] <@ (select array_agg(winner_season_franchise_id) from public.matchups where week = 15 and event_type = 'redemption_sf') from public.matchups where week = 17 and event_type = 'redemption_final'), 'the finals are between the semifinal winners of each bracket');
select pg_temp.expect(pg_temp.advance_error(18) = 'Week 17 must be final first', 'the season is not closed before the finals are final');
select pg_temp.expect(pg_temp.advance(17)->'result'->>'status' = 'exists' and pg_temp.close_week(17) = 2, 'Week 17 is idempotent and closes');

select pg_temp.expect(pg_temp.advance(18) @> '{"step":"close_league_season","result":{"status":"complete","already_closed":false}}', 'season closed by the system path');
select pg_temp.expect((select status = 'complete' from public.league_seasons), 'league season status is complete');
select pg_temp.expect((select count(*) = 2 from public.championships c join public.matchups m on m.id = c.final_matchup_id and m.week = 17 and m.winner_season_franchise_id = c.winner_season_franchise_id
  and c.runner_up_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id) and c.runner_up_season_franchise_id <> c.winner_season_franchise_id
  and ((c.bracket = 'championship' and m.event_type = 'championship') or (c.bracket = 'redemption' and m.event_type = 'redemption_final'))), 'both champions recorded with runner-up and final matchup');
select pg_temp.expect((select count(*) = 2 from public.franchise_achievements fa join public.achievements a on a.id = fa.achievement_id where a.code in ('LEAGUE_CHAMPION', 'REDEMPTION_CHAMPION') and fa.week = 17), 'LEAGUE_CHAMPION and REDEMPTION_CHAMPION awarded');
select pg_temp.expect((select count(*) = 1 from public.league_feed_events where event_type = 'season_complete'), 'one season_complete feed event');
select pg_temp.expect(pg_temp.advance(18)->'result'->>'already_closed' = 'true'
  and (select count(*) = 2 from public.championships) and (select count(*) = 1 from public.league_feed_events where event_type = 'season_complete')
  and (select count(*) = 2 from public.franchise_achievements fa join public.achievements a on a.id = fa.achievement_id where a.code in ('LEAGUE_CHAMPION', 'REDEMPTION_CHAMPION')), 'closing again changes nothing');

-- Whole-season totals.
select pg_temp.expect((select count(*) = 78 and bool_and(is_final) and bool_and(winner_season_franchise_id is not null) from public.matchups), '78 matchups, all final with a winner (45 + 25 + 4 + 2 + 2)');
select pg_temp.expect((select sum(wins) = 78 and sum(losses) = 78 from public.standings), 'PRODUCTION BEHAVIOUR: postseason results are added to the same standings rows as the regular season');
select pg_temp.expect((select count(*) = 78 from public.league_feed_events where event_type = 'matchup_final'), 'one matchup_final feed event per matchup');
select pg_temp.expect((select count(*) = 3 and bool_and(actor_user_id = (select commissioner from ids)) from public.league_feed_events where event_type in ('chaos_week_created', 'judgment_week_created', 'season_complete')), 'feed events written by automated steps name the commissioner as actor');

-- Who may run the system path.
select pg_temp.expect(has_function_privilege('service_role', 'public.system_advance_fantasy_season(uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.system_advance_fantasy_season(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.system_advance_fantasy_season(uuid, integer)', 'execute'), 'only the service role may execute the system path');
begin;
select set_config('request.jwt.claim.sub', (select commissioner::text from ids), true);
select pg_temp.expect(pg_temp.advance_error(18) = 'System use only', 'a signed-in user is refused even if granted execute');
rollback;

\echo ALL SECOND HALF REHEARSAL TESTS PASSED
