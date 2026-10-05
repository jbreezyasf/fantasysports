-- Executable test for 20261004020000_chaos_week_rule_cards.sql.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/chaos_week_rule_cards.sql
--
-- Same table shapes, production function bodies and synthetic season as
-- second_half_rehearsal.sql and chaos_clause_tiebreak.sql, plus the tables the
-- lineup and waiver functions need (shapes from lineup_week_integrity.sql).
-- Migrations are loaded in timestamp order: 20261003030000, 20261004010000,
-- then this one. Before this one is loaded, the recompute_matchup of
-- 20261004010000 is renamed to recompute_matchup_before_cards, so every
-- recompute in this file can be run through BOTH versions and compared.
--
-- Every scenario runs in a transaction that is rolled back.

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
grant usage on schema auth to public;

create type public.game_state as enum ('scheduled','in_progress','final','postponed','canceled','delayed','suspended','unknown');
create type public.lineup_slot as enum ('QB','RB','WR','TE','FLEX','K','DST','BENCH','IR');
create type public.member_role as enum ('commissioner','manager');
create table public.fantasy_leagues (id uuid default gen_random_uuid() primary key, created_by uuid);
create table public.competition_seasons (id uuid default gen_random_uuid() primary key, competition_id uuid not null, season_year integer not null, starts_on date, ends_on date, late_entry_cutoff_at timestamp with time zone);
create table public.league_seasons (id uuid default gen_random_uuid() primary key, league_id uuid not null, competition_season_id uuid not null, status text default 'setup'::text not null, roster_config jsonb not null, scoring_profile_id uuid, trade_deadline_at timestamp with time zone, waiver_period_hours integer default 48 not null, is_current boolean default true not null, unique (league_id, competition_season_id));
create table public.league_members (id uuid default gen_random_uuid() primary key, league_id uuid not null, user_id uuid not null, role member_role default 'manager'::member_role not null, joined_at timestamp with time zone default now() not null, unique (league_id, user_id));
create table public.league_feed_events (id uuid default gen_random_uuid() primary key, league_id uuid not null, season_id uuid, actor_user_id uuid, event_type text not null, body text, payload jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);
create table public.franchises (id uuid default gen_random_uuid() primary key, league_id uuid not null, name text not null, abbreviation text, primary_color text, secondary_color text, established_year integer not null, created_at timestamp with time zone default now() not null, avatar_key text default 'classic'::text not null);
create table public.franchise_owners (franchise_id uuid not null, user_id uuid not null, starts_on date default CURRENT_DATE not null, ends_on date);
create table public.season_franchises (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, franchise_id uuid not null, draft_position integer, roster_locked_at timestamp with time zone, roster_lock_reason text, unique (league_season_id, franchise_id));
create table public.standings (league_season_id uuid not null, season_franchise_id uuid not null, wins integer default 0 not null, losses integer default 0 not null, ties integer default 0 not null, points_for numeric(10,2) default 0 not null, points_against numeric(10,2) default 0 not null, streak integer default 0 not null, primary key (league_season_id, season_franchise_id));
create table public.matchups (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, week integer not null, home_season_franchise_id uuid not null, away_season_franchise_id uuid not null, event_type text default 'circuit'::text not null, home_points numeric(8,2) default 0 not null, away_points numeric(8,2) default 0 not null, winner_season_franchise_id uuid, is_final boolean default false not null, context jsonb default '{}'::jsonb not null, result_source text default 'LIVE'::text not null, simulated_reason text, result_published_at timestamp with time zone, unique (league_season_id, week, home_season_franchise_id), unique (league_season_id, week, away_season_franchise_id));
create table public.rivalries (id uuid default gen_random_uuid() primary key, league_id uuid not null, franchise_a_id uuid not null, franchise_b_id uuid not null, designated boolean default false not null, rivalry_score numeric(8,2) default 0 not null, created_at timestamp with time zone default now() not null, check (franchise_a_id <> franchise_b_id));
create table public.postseason_seeds (league_season_id uuid not null, season_franchise_id uuid not null, seed integer not null check (seed >= 1 and seed <= 10), bracket text not null check (bracket = any (array['championship'::text, 'redemption'::text])), created_at timestamp with time zone default now() not null, primary key (league_season_id, season_franchise_id), unique (league_season_id, seed));
create table public.championships (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, bracket text not null check (bracket = any (array['championship'::text, 'redemption'::text])), winner_season_franchise_id uuid not null, runner_up_season_franchise_id uuid, final_matchup_id uuid, awarded_at timestamp with time zone default now() not null, unique (league_season_id, bracket));
create table public.achievements (id uuid default gen_random_uuid() primary key, code text not null unique, display_name text not null, description text, category text not null, unlock_rule jsonb default '{}'::jsonb not null, active boolean default true not null);
create table public.franchise_achievements (id uuid default gen_random_uuid() primary key, franchise_id uuid not null, league_season_id uuid, achievement_id uuid not null, week integer, earned_at timestamp with time zone default now() not null, payload jsonb default '{}'::jsonb not null);
create table public.real_games (id uuid default gen_random_uuid() primary key, competition_season_id uuid not null, provider_game_id text, week integer, home_team_id uuid, away_team_id uuid, starts_at timestamp with time zone not null, state game_state default 'scheduled'::game_state not null, home_score integer, away_score integer, updated_at timestamp with time zone default now() not null);
create table public.athletes (id uuid default gen_random_uuid() primary key, competition_id uuid not null, real_team_id uuid, display_name text not null, "position" text not null, active boolean default true not null, injury_status text, updated_at timestamp with time zone default now() not null);
create table public.lineups (id uuid default gen_random_uuid() primary key, season_franchise_id uuid not null, week integer not null, athlete_id uuid, slot lineup_slot not null, locked_at timestamp with time zone, real_team_id uuid, slot_index integer default 1 not null);
create unique index lineups_unique_slot_index on public.lineups (season_franchise_id, week, slot, slot_index);
create table public.lineup_move_audit (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, season_franchise_id uuid not null, actor_user_id uuid, week integer not null, slot lineup_slot not null, slot_index integer default 1 not null, previous_athlete_id uuid, previous_real_team_id uuid, new_athlete_id uuid, new_real_team_id uuid, outcome text default 'applied'::text not null, reason text, created_at timestamp with time zone default now() not null);
create table public.roster_entries (id uuid default gen_random_uuid() primary key, season_franchise_id uuid not null, athlete_id uuid, acquired_via text not null, added_at timestamp with time zone default now() not null, dropped_at timestamp with time zone, real_team_id uuid);
create table public.waiver_holds (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, athlete_id uuid, real_team_id uuid, source_roster_entry_id uuid, source_season_franchise_id uuid, starts_at timestamp with time zone default now() not null, clears_at timestamp with time zone not null, status text default 'open'::text not null, claimed_by_season_franchise_id uuid, resolved_at timestamp with time zone);
create table public.waiver_claims (id uuid default gen_random_uuid() primary key, waiver_hold_id uuid not null, season_franchise_id uuid not null, drop_roster_entry_id uuid, status text default 'pending'::text not null, priority_rank integer, created_at timestamp with time zone default now() not null, resolved_at timestamp with time zone, failure_reason text);
create table public.fantasy_player_scores (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, athlete_id uuid not null, game_id uuid not null, week integer not null, points numeric(8,2) not null, breakdown jsonb not null, calculated_at timestamp with time zone default now() not null);
create table public.fantasy_team_scores (id uuid default gen_random_uuid() primary key, league_season_id uuid not null, real_team_id uuid not null, game_id uuid not null, week integer not null, points numeric(8,2) not null, breakdown jsonb not null, calculated_at timestamp with time zone default now() not null);

-- Production definitions the migrations rely on but do not create.
create function public.is_league_member(target_league_id uuid) returns boolean language sql stable security definer set search_path to 'public'
as $function$ select exists(select 1 from league_members lm where lm.league_id=target_league_id and lm.user_id=auth.uid()) or exists(select 1 from fantasy_leagues fl where fl.id=target_league_id and fl.created_by=auth.uid()); $function$;
create function public.roster_asset_game_has_started(p_roster_entry_id uuid) returns boolean language sql stable as $$ select false $$;
create function public.evaluate_roster_integrity_drop(uuid, text) returns jsonb language sql stable as $$ select jsonb_build_object('allowed', true) $$;
create function public.consume_roster_integrity_override(uuid) returns uuid language sql as $$ select null::uuid $$;

\ir fixtures/production_season_functions.sql
\ir ../migrations/20261003030000_lineup_week_integrity.sql
\ir ../migrations/20261004010000_chaos_clause_tiebreak.sql
-- Keep the pre-cards recompute and waiver functions under other names for comparison.
alter function public.recompute_matchup(uuid, boolean) rename to recompute_matchup_before_cards;
alter function public.process_due_waivers(uuid) rename to process_due_waivers_before_cards;
\ir ../migrations/20261004020000_chaos_week_rule_cards.sql

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
-- Run a statement as a signed-in user; returns '' or the error text.
create function pg_temp.err_as(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  v := pg_temp.error_of(p_sql);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;

create temp table ids as select
  '00000000-0000-0000-0000-0000000000c1'::uuid as cs,
  '00000000-0000-0000-0000-0000000000a1'::uuid as league,
  '00000000-0000-0000-0000-0000000000b1'::uuid as ls,
  '00000000-0000-0000-0000-000000000001'::uuid as commissioner,
  '00000000-0000-0000-0000-0000000000e1'::uuid as t1, '00000000-0000-0000-0000-0000000000e2'::uuid as t2,
  '00000000-0000-0000-0000-0000000000e3'::uuid as t3, '00000000-0000-0000-0000-0000000000e4'::uuid as t4,
  '00000000-0000-0000-0000-00000000dead'::uuid as outsider;
create temp table teams as
  select n,
         ('00000000-0000-0000-0000-0000000f00' || lpad(n::text, 2, '0'))::uuid as franchise,
         ('00000000-0000-0000-0000-0000005f00' || lpad(n::text, 2, '0'))::uuid as sf,
         ('00000000-0000-0000-0000-000000a700' || lpad(n::text, 2, '0'))::uuid as athlete,
         ('00000000-0000-0000-0000-000000aa00' || lpad(n::text, 2, '0'))::uuid as manager
  from generate_series(1, 10) n;

insert into public.competition_seasons(id, competition_id, season_year) select cs, gen_random_uuid(), 2026 from ids;
insert into public.league_seasons(id, league_id, competition_season_id, roster_config) select ls, league, cs, '{"starters":{"QB":1,"RB":1,"TE":1,"K":1,"DST":1},"bench":3}'::jsonb from ids;
insert into public.league_members(league_id, user_id, role) select league, commissioner, 'commissioner' from ids;
insert into public.league_members(league_id, user_id, role) select (select league from ids), manager, 'manager' from teams;
insert into public.franchises(id, league_id, name, established_year) select franchise, (select league from ids), 'Franchise ' || n, 2026 from teams;
insert into public.franchise_owners(franchise_id, user_id) select franchise, manager from teams;
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

-- Everything a recompute may touch, with row ids and clock values left out so
-- that two runs of the same call can be compared.
create function pg_temp.snapshot(p_matchup uuid) returns jsonb language sql as $$
  select jsonb_build_object('matchup', to_jsonb(m),
    'standings', (select jsonb_agg(to_jsonb(s) order by s.season_franchise_id) from public.standings s where s.league_season_id = m.league_season_id),
    'feed', (select jsonb_agg(jsonb_build_object('type', f.event_type, 'body', f.body, 'payload', f.payload) order by f.event_type, f.payload::text) from public.league_feed_events f where f.event_type = 'matchup_final'),
    'achievements', (select jsonb_agg(jsonb_build_object('f', a.franchise_id, 'a', a.achievement_id, 'w', a.week, 'p', a.payload) order by a.franchise_id, a.week, a.achievement_id) from public.franchise_achievements a),
    'selections', (select jsonb_agg(to_jsonb(s) order by s.season_franchise_id) from public.chaos_card_selections s where s.matchup_id = m.id),
    'grants', (select count(*) from public.chaos_bounty_grants))
  from public.matchups m where m.id = p_matchup
$$;

-- recompute_matchup, run through BOTH versions. The version of 20261004010000
-- runs first in a subtransaction that is rolled back; then the new one runs for
-- real. With p_same the two must agree on the return value and on every row.
create temp table compared(n integer);
insert into compared values (0);
create function pg_temp.recompute(p_matchup uuid, p_finalize boolean, p_same boolean default true) returns jsonb language plpgsql as $$
declare v_old jsonb; v_old_state jsonb; v_new jsonb; v_new_state jsonb;
begin
  begin
    v_old := public.recompute_matchup_before_cards(p_matchup, p_finalize);
    v_old_state := pg_temp.snapshot(p_matchup);
    raise exception 'undo' using errcode = 'P9999';
  exception when sqlstate 'P9999' then null;
  end;
  v_new := public.recompute_matchup(p_matchup, p_finalize);
  v_new_state := pg_temp.snapshot(p_matchup);
  if p_same then
    if v_old is distinct from v_new then raise exception 'recompute return value differs for %: before % after %', p_matchup, v_old, v_new; end if;
    if v_old_state is distinct from v_new_state then raise exception 'recompute effects differ for %', p_matchup; end if;
    update compared set n = n + 1;
  end if;
  return jsonb_build_object('new', v_new, 'old', v_old, 'same', v_old is not distinct from v_new and v_old_state is not distinct from v_new_state);
end $$;
-- What the weekly job does when a week's real games are all final.
create function pg_temp.close_week(p_week integer, p_same boolean default true) returns integer language plpgsql as $$
declare m record; n integer := 0;
begin
  for m in select id from public.matchups where league_season_id = (select ls from ids) and week = p_week and not is_final order by id loop
    perform pg_temp.recompute(m.id, false, p_same);
    perform pg_temp.recompute(m.id, true, p_same);
    n := n + 1;
  end loop;
  return n;
end $$;
create function pg_temp.advance(p_week integer) returns jsonb language sql as
$$ select public.system_advance_fantasy_season((select ls from ids), p_week) $$;
create function pg_temp.standing(p_sf uuid) returns jsonb language sql as
$$ select to_jsonb(s) from public.standings s where league_season_id = (select ls from ids) and season_franchise_id = p_sf $$;
create function pg_temp.cards(p_matchup uuid) returns jsonb language sql as
$$ select context->'chaos_cards' from public.matchups where id = p_matchup $$;
create function pg_temp.points(p_matchup uuid) returns numeric[] language sql as
$$ select array[home_points, away_points] from public.matchups where id = p_matchup $$;
-- Fixture surgery: which card a matchup holds (the deal itself is tested separately).
create function pg_temp.force_card(p_matchup uuid, p_code text) returns void language sql as
$$ update public.chaos_card_draws set card_code = p_code where matchup_id = p_matchup $$;
-- The operator opts the league season in (docs/product/CHAOS_WEEK_RULE_CARDS.md,
-- section 5), then the system deals. Section 2b tests the deal WITHOUT the opt-in.
create function pg_temp.deal() returns jsonb language plpgsql as $$
begin
  update public.league_seasons set chaos_cards_enabled = true where id = (select ls from ids);
  return public.deal_chaos_week_cards((select ls from ids), 13);
end $$;
-- THE CLOCK. now() does not move inside a test transaction, so a kickoff is
-- simulated by moving the game's start into the past. The automatic rule keeps
-- a mark of the time it was last evaluated (chaos_card_auto_marks) and ignores
-- kickoffs at or before it; a mark written "now" by an earlier step of the same
-- scenario would wrongly sit AFTER the simulated kickoff. So the helpers that
-- move a kickoff into the past move every later mark to just before that
-- kickoff: exactly the state of a real week in which the rule was last
-- evaluated before the game started. Scenarios that test the mark itself use
-- pg_temp.kickoff_keeping_marks.
create function pg_temp.rewind_marks(p_before timestamptz) returns void language sql as
$$ update public.chaos_card_auto_marks set evaluated_through = p_before - interval '1 second' where evaluated_through >= p_before $$;
create function pg_temp.kickoff(p_home_team uuid) returns void language sql as
$$ update public.real_games set starts_at = now() - interval '1 hour', state = 'in_progress' where week = 13 and home_team_id = p_home_team;
   select pg_temp.rewind_marks(now() - interval '1 hour') $$;
create function pg_temp.finish_week13() returns void language sql as
$$ update public.real_games set starts_at = now() - interval '5 hours', state = 'final' where week = 13;
   select pg_temp.rewind_marks(now() - interval '5 hours') $$;

-- ---------------------------------------------------------------------------
-- Base: Weeks 1-12 final and Week 13 created, every recompute compared.
-- ---------------------------------------------------------------------------
select pg_temp.expect(pg_temp.as_commissioner(format('select public.generate_circuit_schedule(%L::uuid)', (select league from ids)))->>'status' = 'created', 'base: the Circuit is created');
select pg_temp.expect((select sum(pg_temp.close_week(w)) = 45 from generate_series(1, 9) w), 'base: Weeks 1-9 close; old and new recompute_matchup agree on every call');
select pg_temp.expect(pg_temp.advance(10)->'result'->>'status' = 'created' and pg_temp.close_week(10) = 5, 'base: Week 10 Rivalry');
select pg_temp.expect(pg_temp.advance(11)->'result'->>'status' = 'created' and pg_temp.close_week(11) = 5, 'base: Week 11 Revenge');
select pg_temp.expect(pg_temp.advance(12)->'result'->>'status' = 'created' and pg_temp.close_week(12) = 5, 'base: Week 12 Position');
select pg_temp.expect(pg_temp.advance(13)->'result'->>'status' = 'created', 'base: Week 13 Chaos generated by the system path');
select pg_temp.expect((select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_deals) and (select count(*) = 0 from public.league_feed_events where event_type = 'chaos_cards_dealt'),
  'flag off: generating Chaos Week deals NO cards and writes no card event');

-- The game used by the scoring scenarios: seed 1 (H, home) against seed 10 (A, away),
-- with full lineups, benches, positions and score breakdowns shaped like production.
select id as g, home_season_franchise_id as h, away_season_franchise_id as a from public.matchups where week = 13 and context->>'home_seed' = '1' \gset
select id as g5, home_season_franchise_id as h5, away_season_franchise_id as a5 from public.matchups where week = 13 and context->>'home_seed' = '5' \gset
select id as g3, home_season_franchise_id as h3, away_season_franchise_id as a3 from public.matchups where week = 13 and context->>'home_seed' = '3' \gset
select (select manager from teams where sf = :'h') as uh, (select manager from teams where sf = :'a') as ua \gset
select t1, t2, t3, t4, ls, outsider from ids \gset

create temp table cast_list(role text primary key, id uuid, pos text, team uuid, owner uuid, slot text, points numeric, breakdown jsonb);
insert into cast_list values
  ('hq',  gen_random_uuid(), 'QB', :'t1', :'h', 'QB', 20.00, '{"kicking":0,"passing":18.00,"rushing":4.00,"receiving":0.00,"two_point":0,"fumbles_lost":-2,"special_teams_td":0}'),
  ('hrb', gen_random_uuid(), 'RB', :'t1', :'h', 'RB', 12.50, '{"kicking":0,"passing":0.00,"rushing":9.50,"receiving":3.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('hte', gen_random_uuid(), 'TE', :'t3', :'h', 'TE',  8.00, '{"kicking":0,"passing":0.00,"rushing":0.00,"receiving":8.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('hk',  gen_random_uuid(), 'K',  :'t3', :'h', 'K',   9.00, '{"kicking":9,"passing":0.00,"rushing":0.00,"receiving":0.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('hb1', gen_random_uuid(), 'WR', :'t3', :'h', null, 15.00, '{"kicking":0,"passing":0.00,"rushing":0.00,"receiving":15.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('hb2', gen_random_uuid(), 'RB', :'t1', :'h', null,  6.00, '{"kicking":0,"passing":0.00,"rushing":6.00,"receiving":0.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('aq',  gen_random_uuid(), 'QB', :'t2', :'a', 'QB', 16.00, '{"kicking":0,"passing":16.00,"rushing":0.00,"receiving":0.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('arb', gen_random_uuid(), 'RB', :'t2', :'a', 'RB', 10.00, '{"kicking":0,"passing":0.00,"rushing":7.00,"receiving":3.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('ate', gen_random_uuid(), 'TE', :'t4', :'a', 'TE', 11.00, '{"kicking":0,"passing":0.00,"rushing":0.00,"receiving":11.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('ak',  gen_random_uuid(), 'K',  :'t4', :'a', 'K',   6.00, '{"kicking":6,"passing":0.00,"rushing":0.00,"receiving":0.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('ab1', gen_random_uuid(), 'WR', :'t4', :'a', null, 13.00, '{"kicking":0,"passing":0.00,"rushing":0.00,"receiving":13.00,"two_point":0,"fumbles_lost":0,"special_teams_td":0}'),
  ('fa',  gen_random_uuid(), 'WR', :'t4', null, null,  0.00, '{}');
select max(id::text) filter (where role = 'hq') as hq, max(id::text) filter (where role = 'hrb') as hrb, max(id::text) filter (where role = 'hte') as hte, max(id::text) filter (where role = 'hk') as hk,
       max(id::text) filter (where role = 'hb1') as hb1, max(id::text) filter (where role = 'hb2') as hb2, max(id::text) filter (where role = 'aq') as aq, max(id::text) filter (where role = 'arb') as arb,
       max(id::text) filter (where role = 'ate') as ate, max(id::text) filter (where role = 'ak') as ak, max(id::text) filter (where role = 'ab1') as ab1, max(id::text) filter (where role = 'fa') as fa from cast_list \gset

insert into public.athletes(id, competition_id, real_team_id, display_name, "position") select id, (select cs from ids), team, role, pos from cast_list;
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) select owner, id, 'draft' from cast_list where owner is not null;
insert into public.roster_entries(season_franchise_id, real_team_id, acquired_via) values (:'h', :'t1', 'draft'), (:'a', :'t2', 'draft');
delete from public.lineups where week = 13 and season_franchise_id in (:'h', :'a');
insert into public.lineups(season_franchise_id, week, athlete_id, slot) select owner, 13, id, slot::lineup_slot from cast_list where slot is not null;
insert into public.lineups(season_franchise_id, week, real_team_id, slot) values (:'h', 13, :'t1', 'DST'), (:'a', 13, :'t2', 'DST');
insert into public.fantasy_player_scores(league_season_id, athlete_id, game_id, week, points, breakdown) select :'ls', id, gen_random_uuid(), 13, points, breakdown from cast_list where owner is not null;
insert into public.fantasy_team_scores(league_season_id, real_team_id, game_id, week, points, breakdown) values
  (:'ls', :'t1', gen_random_uuid(), 13, 7.00, '{"sacks":3,"safeties":0,"touchdowns":0,"blocked_kicks":0,"interceptions":1,"points_allowed":17,"fumble_recoveries":0}'),
  (:'ls', :'t2', gen_random_uuid(), 13, -1.00, '{"sacks":1,"safeties":0,"touchdowns":0,"blocked_kicks":0,"interceptions":0,"points_allowed":38,"fumble_recoveries":0}');
-- Earlier weeks for the cast. Only the automatic captain reads them: no lineup of
-- Weeks 1-12 holds a cast player, so no matchup of the base season changes.
--   seed 1:  hq 40 / 18 / 22 / 20 (Weeks 9-12), hrb 20 / 20 (Weeks 11-12), hte 8 (Week 12), hk nothing, T1 D/ST 5 / 7 / 9
--   seed 10: aq 10 / 10 / 10, arb 8 / 8 / 8, ate 9 (Week 12), ak nothing, T2 D/ST 14 / 16 / 18
insert into public.fantasy_player_scores(league_season_id, athlete_id, game_id, week, points, breakdown)
  select :'ls', c.id, gen_random_uuid(), v.week, v.points, '{}'::jsonb
  from (values ('hq', 9, 40.00), ('hq', 10, 18.00), ('hq', 11, 22.00), ('hq', 12, 20.00), ('hrb', 11, 20.00), ('hrb', 12, 20.00), ('hte', 12, 8.00),
               ('aq', 10, 10.00), ('aq', 11, 10.00), ('aq', 12, 10.00), ('arb', 10, 8.00), ('arb', 11, 8.00), ('arb', 12, 8.00), ('ate', 12, 9.00)) v(role, week, points)
  join cast_list c on c.role = v.role;
insert into public.fantasy_team_scores(league_season_id, real_team_id, game_id, week, points, breakdown)
  select :'ls', v.team, gen_random_uuid(), v.week, v.points, '{}'::jsonb
  from (values (:'t1'::uuid, 10, 5.00), (:'t1'::uuid, 11, 7.00), (:'t1'::uuid, 12, 9.00), (:'t2'::uuid, 10, 14.00), (:'t2'::uuid, 11, 16.00), (:'t2'::uuid, 12, 18.00)) v(team, week, points);
-- Week 13 has not kicked off: T1-T2 plays in two days, T3-T4 in three.
delete from public.real_games where week = 13;
insert into public.real_games(competition_season_id, week, home_team_id, away_team_id, starts_at, state) values
  ((select cs from ids), 13, :'t1', :'t2', now() + interval '2 days', 'scheduled'), ((select cs from ids), 13, :'t3', :'t4', now() + interval '3 days', 'scheduled'),
  -- Week 18 is an open week, for "another week" checks (the fixture's Weeks 1-17 are over).
  ((select cs from ids), 18, :'t1', :'t2', now() + interval '30 days', 'scheduled');
grant select on public.league_seasons, public.matchups to authenticated;

select pg_temp.expect((public.chaos_card_side_score(:'g', :'h')) = '{"card_code":null,"kind":null,"base":56.50,"adjustments":[],"total":56.50}'::jsonb
  and (public.chaos_card_side_score(:'g', :'a')->>'base')::numeric = 42.00, 'fixture: base lineup totals are 56.50 (seed 1) and 42.00 (seed 10); no card, no adjustment lines');

-- ---------------------------------------------------------------------------
-- 1. No card dealt: a Chaos Week matchup scores and finalizes exactly as before.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = 'No rule card has been dealt to this matchup', 'no card: a selection is refused');
select pg_temp.expect((pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 2, %L, null)', :'h', 'RB', :'hb2'))) = '', 'no card: set_lineup_slot still moves a bench player into the lineup');
select pg_temp.expect((select count(*) = 1 from public.lineups where season_franchise_id = :'h' and week = 13 and athlete_id = :'hb2' and slot = 'RB' and slot_index = 2), 'no card: the lineup row is written');
-- The triggers on lineups and roster_entries find nothing to do without a selection card.
select pg_temp.kickoff(:'t1');
update public.roster_entries set dropped_at = now() where season_franchise_id = :'h' and athlete_id = :'hb1';
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) values (:'h', :'fa', 'free_agent');
delete from public.lineups where season_franchise_id = :'h' and week = 13 and athlete_id = :'hte';
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections) and (select count(*) = 0 from public.chaos_card_auto_marks) and (select count(*) = 0 from public.league_feed_events where event_type = 'chaos_raid'),
  'no card: lineup and roster changes after a kickoff (drop, add, lineup delete) record no selection, no evaluation mark and no feed event');
rollback;
begin;
select pg_temp.deal();
select pg_temp.force_card(d.matchup_id, 'TWIST_TE_DOUBLE') from public.chaos_card_draws d;
select pg_temp.force_card(:'g', 'BOUNTY');
select pg_temp.kickoff(:'t1');
update public.roster_entries set dropped_at = now() where season_franchise_id = :'h' and athlete_id = :'hb1';
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) values (:'h', :'fa', 'free_agent');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'TE')) = '' and public.recompute_matchup(:'g', false) is not null
  and (select count(*) = 0 from public.chaos_card_selections) and (select count(*) = 0 from public.chaos_card_auto_marks),
  'cards that take no selection (Bounty, twists): lineup and roster changes and scoring record no selection and no evaluation mark');
rollback;
begin;
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13) = 5, 'no card: all five Chaos Week games close; old and new recompute_matchup agree on return value, matchup, standings, feed and achievements');
select pg_temp.expect((select bool_and(not (context ? 'chaos_cards')) from public.matchups where week = 13) and pg_temp.points(:'g') = array[56.50, 42.00], 'no card: nothing about rule cards is written; the score is the lineup total');
select pg_temp.expect(public.chaos_clause_decision(:'ls', :'h', :'a')->'steps'->0 = '{"step":"chaos_week","week":13,"home":56.50,"away":42.00,"outcome":"home"}'::jsonb, 'no card: the Chaos Clause step has exactly its previous shape and values');
select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_grants), 'no card: no bounty is ever granted');
rollback;

-- ---------------------------------------------------------------------------
-- 2. The deal.
-- ---------------------------------------------------------------------------
select pg_temp.expect(public.chaos_card_deal_order('big-exec-audit-seed-0001', (select array_agg(code order by code) from public.chaos_cards))
  = array['WILD_SLOT','TWIST_DST_DOUBLE','TWIST_TE_DOUBLE','TWIST_PASS_DOUBLE','RAID','TWIST_K_TRIPLE','TWIST_RUSH_DOUBLE','CAPTAIN','BOUNTY','TWIST_FUMBLE_TRIPLE'],
  'deal order: a fixed seed gives the order computed independently (sha256 in Node) outside the database');
select pg_temp.expect(public.chaos_card_deal_order('big-exec-audit-seed-0002', (select array_agg(code order by code) from public.chaos_cards))
  = array['TWIST_TE_DOUBLE','TWIST_DST_DOUBLE','TWIST_PASS_DOUBLE','TWIST_K_TRIPLE','TWIST_RUSH_DOUBLE','TWIST_FUMBLE_TRIPLE','RAID','CAPTAIN','BOUNTY','WILD_SLOT'],
  'deal order: a different seed gives a different, equally reproducible order');
select pg_temp.expect(public.chaos_card_deal_order('s', array['B','A','C']) = public.chaos_card_deal_order('s', array['C','B','A']), 'deal order: does not depend on the order the deck is passed in');
select pg_temp.expect((select count(*) = 10 and count(*) filter (where kind = 'twist') = 6 and bool_and(length(name_es) > 0 and length(rules_es) > 0 and length(rules_en) > 0) from public.chaos_cards), 'deck: 10 active cards (4 named cards, 6 scoring twists), each with English and Spanish name and rules');

-- ---------------------------------------------------------------------------
-- 2b. PER-LEAGUE-SEASON OPT-IN (owner decision 2026-10-04). The application
--     flag is not visible to the database; "flag on" here means the system path
--     asks for the deal, which is all the flag does. Without the opt-in the
--     deal is refused, nothing is written, and scoring is what it was.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.expect((select chaos_cards_enabled is false from public.league_seasons where id = :'ls') and (select column_default = 'false' and is_nullable = 'NO' from information_schema.columns where table_name = 'league_seasons' and column_name = 'chaos_cards_enabled'),
  'OPT-IN: league_seasons.chaos_cards_enabled exists, is not null, defaults to false, and the migration opted nobody in');
select pg_temp.expect(pg_temp.error_of(format('select public.deal_chaos_week_cards(%L, 13)', :'ls')) = 'Rule cards are not enabled for this league season', 'OPT-IN OFF: the system deal is REFUSED for a league season that is not opted in');
select pg_temp.expect((select count(*) = 0 from public.chaos_card_deals) and (select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.league_feed_events where event_type = 'chaos_cards_dealt') and public.audit_chaos_week_deal(:'ls', 13) = '{"dealt":false}'::jsonb,
  'OPT-IN OFF: no deal row, no draw, no feed event');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = 'No rule card has been dealt to this matchup'
  and public.chaos_auto_pick(:'g', :'h', 'wild_slot') is not null and public.chaos_lock_auto_selection(:'g', :'h') is null and (select count(*) = 0 from public.chaos_card_selections) and (select count(*) = 0 from public.chaos_card_auto_marks),
  'OPT-IN OFF: no selection can be made, and nothing is ever recorded or marked for the game');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13) = 5 and pg_temp.points(:'g') = array[56.50, 42.00] and (select bool_and(not (context ? 'chaos_cards')) from public.matchups where week = 13),
  'OPT-IN OFF: UNCHANGED SCORING. All five Chaos Week games close with old and new recompute_matchup agreeing on every return value and every row; 56.50 to 42.00; nothing about rule cards is written');
rollback;
begin;
-- Another league season being opted in changes nothing for this one.
insert into public.league_seasons(id, league_id, competition_season_id, roster_config, chaos_cards_enabled) values ('00000000-0000-0000-0000-0000000000b2', gen_random_uuid(), (select cs from ids), '{}'::jsonb, true);
select pg_temp.expect(pg_temp.error_of(format('select public.deal_chaos_week_cards(%L, 13)', :'ls')) = 'Rule cards are not enabled for this league season'
  and pg_temp.error_of('select public.deal_chaos_week_cards(''00000000-0000-0000-0000-0000000000b2'', 13)') = 'No Chaos Week matchups in week 13', 'OPT-IN is per league season: opting in one league season does not open another');
update public.league_seasons set chaos_cards_enabled = true where id = :'ls';
select pg_temp.expect(public.deal_chaos_week_cards(:'ls', 13)->>'status' = 'dealt', 'OPT-IN ON: the same call deals');
update public.league_seasons set chaos_cards_enabled = false where id = :'ls';
select pg_temp.expect(pg_temp.error_of(format('select public.deal_chaos_week_cards(%L, 13)', :'ls')) = 'Rule cards are not enabled for this league season' and (select count(*) = 5 from public.chaos_card_draws),
  'OPT-IN withdrawn after the deal: the deal function refuses again (it does not even report the existing deal); the cards already dealt are untouched');
rollback;

begin;
update public.league_seasons set chaos_cards_enabled = true where id = :'ls';
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.deal_chaos_week_cards(%L, 13)', :'ls')) = 'System use only', 'deal: a signed-in user cannot deal');
select pg_temp.expect(pg_temp.error_of(format('select public.deal_chaos_week_cards(%L, 12)', :'ls')) = 'No Chaos Week matchups in week 12', 'deal: refused for a week that is not Chaos Week');
savepoint started;
select pg_temp.kickoff(:'t1');
select pg_temp.expect(pg_temp.error_of(format('select public.deal_chaos_week_cards(%L, 13)', :'ls')) = 'Week 13 has already kicked off; rule cards can no longer be dealt', 'deal: refused once Week 13 has kicked off');
rollback to savepoint started;

select pg_temp.deal() as first_deal \gset
select pg_temp.expect(:'first_deal'::jsonb->>'status' = 'dealt' and jsonb_array_length(:'first_deal'::jsonb->'cards') = 5, 'deal: five matchups each get a card');
select pg_temp.expect((select count(*) = 5 and count(distinct card_code) = 5 and count(distinct seed) = 1 and bool_and(revealed_at is not null and inputs ? 'seed' and inputs ? 'deck' and inputs ? 'order') from public.chaos_card_draws),
  'deal: no card repeats within the league''s five games; every draw records the seed, deck and order and is revealed');
select pg_temp.expect((select array_agg(d.card_code order by d.deal_position) = (public.chaos_card_deal_order(x.seed, x.deck))[1:5] and length(x.seed) = 64
  from public.chaos_card_draws d join public.chaos_card_deals x on x.league_season_id = d.league_season_id and x.week = d.week group by x.seed, x.deck),
  'deal: the recorded cards are exactly what the stored seed and deck reproduce, in home-seed order');
select pg_temp.expect((select array_agg((m.context->>'home_seed')::int order by d.deal_position) = array[1,2,3,4,5] from public.chaos_card_draws d join public.matchups m on m.id = d.matchup_id), 'deal: position n is the game hosted by seed n');
select pg_temp.expect(public.audit_chaos_week_deal(:'ls', 13) @> '{"dealt":true,"matches":true,"repeats":0}', 'audit: the operator audit reproduces the deal and reports a match');
select pg_temp.expect((select count(*) = 1 and bool_and(body = 'Chaos Week rule cards are dealt' and jsonb_array_length(payload->'cards') = 5 and payload->'cards'->0 ? 'name_es') from public.league_feed_events where event_type = 'chaos_cards_dealt'), 'deal: one feed event announces the five cards');
create temp table deal_snap on commit drop as select (select jsonb_agg(to_jsonb(d) order by d.deal_position) from public.chaos_card_draws d) as draws, (select to_jsonb(x) from public.chaos_card_deals x) as deal;
select pg_temp.deal() as second_deal \gset
select pg_temp.expect(:'second_deal'::jsonb->>'status' = 'exists' and :'second_deal'::jsonb->'cards' = :'first_deal'::jsonb->'cards', 'idempotent: a second call returns the same cards with status exists');
select pg_temp.expect((select (select jsonb_agg(to_jsonb(d) order by d.deal_position) from public.chaos_card_draws d) = draws and (select to_jsonb(x) from public.chaos_card_deals x) = deal from deal_snap)
  and (select count(*) = 1 from public.league_feed_events where event_type = 'chaos_cards_dealt'), 'idempotent: no row changed, the seed is the same, and there is still one feed event');
savepoint tampered;
update public.chaos_card_draws set card_code = (select card_code from public.chaos_card_draws where deal_position = 2) where deal_position = 1;
select pg_temp.expect(public.audit_chaos_week_deal(:'ls', 13) @> '{"dealt":true,"matches":false,"repeats":1}', 'audit: a draw that does not follow from the seed is reported');
rollback to savepoint tampered;

-- RLS and privileges on the new tables.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'uh', true);
select pg_temp.expect((select count(*) = 5 from public.chaos_card_draws) and (select count(*) = 1 from public.chaos_card_deals) and (select count(*) = 10 from public.chaos_cards), 'RLS: a league member reads the league''s revealed draws, its deal and the catalog');
select set_config('request.jwt.claim.sub', :'outsider', true);
select pg_temp.expect((select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_deals) and (select count(*) = 0 from public.chaos_card_selections) and (select count(*) = 0 from public.chaos_bounty_grants), 'RLS: a user outside the league reads no draws, deals, selections or grants');
select set_config('request.jwt.claim.sub', :'uh', true);
select pg_temp.expect(pg_temp.error_of(format('insert into public.chaos_card_selections(matchup_id, season_franchise_id, card_code, athlete_id, source_season_franchise_id, selected_by) values (%L, %L, %L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq', :'h', :'uh')) like 'permission denied%'
  and pg_temp.error_of('update public.chaos_card_draws set card_code = ''RAID''') like 'permission denied%'
  and pg_temp.error_of('delete from public.chaos_bounty_grants') like 'permission denied%', 'privileges: authenticated cannot write the new tables directly');
reset role;
select set_config('request.jwt.claim.sub', '', true);
savepoint hidden;
update public.chaos_card_draws set revealed_at = null;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'uh', true);
select pg_temp.expect((select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_deals), 'RLS: an unrevealed draw is not readable, even by a member');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = 'No rule card has been dealt to this matchup'
  and public.chaos_card_side_score(:'g', :'h')->>'card_code' is null, 'unrevealed card: no selection, and the matchup scores as if no card existed');
rollback to savepoint hidden;
select pg_temp.expect(not has_function_privilege('authenticated', 'public.deal_chaos_week_cards(uuid, integer)', 'execute') and not has_function_privilege('anon', 'public.deal_chaos_week_cards(uuid, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.chaos_card_side_score(uuid, uuid)', 'execute') and not has_function_privilege('authenticated', 'public.audit_chaos_week_deal(uuid, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.set_chaos_card_selection(uuid, uuid, text, uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.set_chaos_card_selection(uuid, uuid, text, uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.clear_chaos_card_selection(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.clear_chaos_card_selection(uuid, uuid)', 'execute')
  and has_function_privilege('service_role', 'public.deal_chaos_week_cards(uuid, integer)', 'execute'), 'privileges: only the service role deals, audits and scores; signed-in managers may call the two selection RPCs; anon nothing');
select pg_temp.expect(has_function_privilege('authenticated', 'public.chaos_auto_captain(uuid, uuid)', 'execute') and has_function_privilege('authenticated', 'public.chaos_captain_expected_points(uuid, integer, uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.chaos_auto_captain(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.chaos_captain_expected_points(uuid, integer, uuid, uuid)', 'execute')
  and not (select prosecdef from pg_proc where oid = 'public.chaos_auto_captain(uuid, uuid)'::regprocedure) and not (select prosecdef from pg_proc where oid = 'public.chaos_captain_expected_points(uuid, integer, uuid, uuid)'::regprocedure)
  and not has_function_privilege('authenticated', 'public.chaos_bounty_waiver_order(uuid, timestamptz)', 'execute') and not has_function_privilege('anon', 'public.chaos_bounty_waiver_order(uuid, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.chaos_lock_auto_captain(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.chaos_lock_auto_captain(uuid, uuid)', 'execute'),
  'privileges: signed-in managers may ask who the automatic captain would be (the two functions run with the caller''s rights, not the definer''s); anon may not; the bounty order and recording an automatic captain are for the service role');
select pg_temp.expect(has_function_privilege('authenticated', 'public.chaos_auto_pick(uuid, uuid, text)', 'execute') and not has_function_privilege('anon', 'public.chaos_auto_pick(uuid, uuid, text)', 'execute')
  and not (select prosecdef from pg_proc where oid = 'public.chaos_auto_pick(uuid, uuid, text)'::regprocedure)
  and not has_function_privilege('authenticated', 'public.chaos_lock_auto_selection(uuid, uuid)', 'execute') and not has_function_privilege('anon', 'public.chaos_lock_auto_selection(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.chaos_sync_selections(uuid)', 'execute') and not has_function_privilege('anon', 'public.chaos_sync_selections(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.chaos_cards_sync_on_change()', 'execute') and not has_function_privilege('anon', 'public.chaos_cards_sync_on_change()', 'execute')
  and has_function_privilege('service_role', 'public.chaos_lock_auto_selection(uuid, uuid)', 'execute') and has_function_privilege('service_role', 'public.chaos_sync_selections(uuid)', 'execute'),
  'privileges: signed-in managers may ask what the automatic Wild Slot or raid would be (caller''s rights); recording a selection, syncing a matchup and the trigger function are not callable by managers or anon');
select pg_temp.expect((select count(*) = 21 and bool_and(exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('chaos_asset_game_started','chaos_week_first_kickoff','chaos_lower_seed','chaos_card_deal_order','chaos_card_side_score','chaos_captain_expected_points','chaos_auto_captain','chaos_auto_pick','chaos_lock_auto_captain','chaos_lock_auto_selection','chaos_sync_selections','chaos_cards_sync_on_change','chaos_bounty_waiver_order','deal_chaos_week_cards','audit_chaos_week_deal','set_chaos_card_selection','clear_chaos_card_selection','chaos_clause_decision','recompute_matchup','set_lineup_slot','process_due_waivers')),
  'every function this migration creates or replaces has a fixed search_path');
select pg_temp.expect((select bool_and(c.relrowsecurity) and count(*) = 6 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('chaos_cards','chaos_card_deals','chaos_card_draws','chaos_card_selections','chaos_bounty_grants','chaos_card_auto_marks')), 'RLS is enabled on all six new tables');
select pg_temp.expect((select array_agg(t.tgrelid::regclass::text || ':' || t.tgname order by t.tgname) = array['roster_entries:chaos_cards_after_roster_drop', 'lineups:chaos_cards_before_lineup_change', 'roster_entries:chaos_cards_before_roster_change']
  from pg_trigger t where not t.tgisinternal and t.tgname like 'chaos_cards%'), 'triggers: exactly three, on roster_entries (before a change, after a drop) and lineups (before a change)');
set local role authenticated;
select set_config('request.jwt.claim.sub', :'uh', true);
select pg_temp.expect(pg_temp.error_of(format('insert into public.chaos_card_auto_marks(matchup_id, season_franchise_id, evaluated_through) values (%L, %L, now())', :'g', :'h')) like 'permission denied%'
  and pg_temp.error_of(format('update public.league_seasons set chaos_cards_enabled = true where id = %L', :'ls')) like 'permission denied%', 'privileges: authenticated cannot write the evaluation marks, and cannot opt a league season in');
reset role;
select set_config('request.jwt.claim.sub', '', true);
rollback;

-- A deck smaller than the number of games: cards repeat only after the deck is used up.
begin;
update public.chaos_cards set active = code in ('CAPTAIN', 'RAID', 'WILD_SLOT');
select pg_temp.deal();
select pg_temp.expect((select count(*) = 5 and count(distinct card_code) = 3 and count(distinct card_code) filter (where deal_position <= 3) = 3
  and (select card_code from public.chaos_card_draws where deal_position = 4) = (select card_code from public.chaos_card_draws where deal_position = 1)
  and (select card_code from public.chaos_card_draws where deal_position = 5) = (select card_code from public.chaos_card_draws where deal_position = 2) from public.chaos_card_draws),
  'small deck: three cards over five games are all used before any repeats, then the order starts again');
select pg_temp.expect(public.audit_chaos_week_deal(:'ls', 13) @> '{"matches":true,"repeats":2}', 'small deck: the audit still reproduces the deal');
rollback;

-- ---------------------------------------------------------------------------
-- 3. CAPTAIN.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(pg_temp.err_as(null, format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = 'Authentication required', 'captain: a caller who is not signed in is refused');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = 'Not your franchise', 'captain: the opponent cannot choose for a franchise they do not own');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g3', :'h', 'CAPTAIN', :'hq')) = 'Franchise is not in this matchup', 'captain: a franchise cannot choose in a matchup it is not playing');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = 'This matchup was dealt Captain, not WILD_SLOT', 'wrong card: a Wild Slot pick is refused in a matchup that was dealt Captain');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'RAID', :'ab1')) = 'This matchup was dealt Captain, not RAID', 'wrong card: a raid is refused in a matchup that was dealt Captain');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hb1')) = 'Your captain must be one of your Week 13 starters', 'captain: a bench player cannot be captain');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'aq')) = 'Your captain must be one of your Week 13 starters', 'captain: an opponent''s starter cannot be captain');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L)', :'g', :'h', 'CAPTAIN')) = 'Choose exactly one player or defense', 'captain: exactly one asset must be named');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = '', 'captain: seed 1 names a starter');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = '', 'captain: before kickoff the captain can be changed');
select pg_temp.expect((select count(*) = 1 and bool_and(athlete_id = :'hq' and locked_at is null and selected_by = :'uh') from public.chaos_card_selections where season_franchise_id = :'h'), 'captain: one selection row per franchise, holding the latest choice and who made it');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'CAPTAIN', :'ate')) = '', 'captain: seed 10 names a starter');
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ua', true);
select pg_temp.expect((select count(*) = 2 from public.chaos_card_selections), 'RLS: league members read both selections of a revealed card');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select pg_temp.kickoff(:'t1');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = 'Captain locked: your captain''s game has already started', 'LOCK captain: after the captain''s kickoff the captain cannot be changed');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = 'Selection locked: that player''s game has already started', 'LOCK captain: after kickoff the captain cannot be cleared either');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'CAPTAIN', :'aq')) = 'That player''s game has already started', 'LOCK captain: a starter whose game has kicked off cannot be named captain');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'CAPTAIN', :'ak')) = ''
  and pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'CAPTAIN', :'ate')) = '', 'captain: a manager whose captain has not kicked off can still switch between starters who have not kicked off');

select pg_temp.recompute(:'g', false, false) as live \gset
select pg_temp.expect(pg_temp.points(:'g') = array[76.50, 53.00], 'CAPTAIN score: 56.50 + 20.00 captain = 76.50; 42.00 + 11.00 captain = 53.00');
select pg_temp.expect(pg_temp.cards(:'g') = jsonb_build_object('version', 1, 'card_code', 'CAPTAIN', 'kind', 'captain',
  'home', jsonb_build_object('base', 56.50, 'adjustments', jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hq', 'real_team_id', null, 'points', 20.00)), 'total', 76.50),
  'away', jsonb_build_object('base', 42.00, 'adjustments', jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'ate', 'real_team_id', null, 'points', 11.00)), 'total', 53.00)),
  'CAPTAIN: matchups.context.chaos_cards holds base, each adjustment line and adjusted total for both sides');
select pg_temp.expect(:'live'::jsonb->'new'->'chaos_cards' = pg_temp.cards(:'g') and (:'live'::jsonb->'old'->>'home_points')::numeric = 56.50 and (:'live'::jsonb->'new'->>'home_points')::numeric = 76.50, 'CAPTAIN: recompute returns the same build-up; the pre-cards function would have returned the base total');
select pg_temp.expect((select points = 20.00 from public.fantasy_player_scores where athlete_id = :'hq' and week = 13) and (select points = 11.00 from public.fantasy_player_scores where athlete_id = :'ate' and week = 13), 'CAPTAIN: fantasy_player_scores is untouched (the captain''s own score is still 20.00)');
select pg_temp.expect((select locked_at is not null from public.chaos_card_selections where season_franchise_id = :'h') and (select locked_at is null from public.chaos_card_selections where season_franchise_id = :'a'), 'lock state: recompute stamps locked_at for the captain who has kicked off, not for the one who has not');

create temp table before_final on commit drop as select pg_temp.standing(:'h') as h, pg_temp.standing(:'a') as a;
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'CAPTAIN', :'ak')) = 'Chaos Week is complete; selections are closed', 'LOCK captain: once Week 13 games are over no selection can be made');
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'CAPTAIN: Week 13 closes');
select pg_temp.expect((select is_final and winner_season_franchise_id = :'h' and home_points = 76.50 and away_points = 53.00 from public.matchups where id = :'g'), 'CAPTAIN: final 76.50 to 53.00');
select pg_temp.expect((select (pg_temp.standing(:'h')->>'points_for')::numeric = (h->>'points_for')::numeric + 76.50 and (pg_temp.standing(:'h')->>'points_against')::numeric = (h->>'points_against')::numeric + 53.00 and (pg_temp.standing(:'h')->>'wins')::int = (h->>'wins')::int + 1
  and (pg_temp.standing(:'a')->>'points_for')::numeric = (a->>'points_for')::numeric + 53.00 and (pg_temp.standing(:'a')->>'points_against')::numeric = (a->>'points_against')::numeric + 76.50 and (pg_temp.standing(:'a')->>'losses')::int = (a->>'losses')::int + 1 from before_final),
  'STANDINGS: points for and against are the ADJUSTED totals (full stakes)');
select pg_temp.expect((select payload->'chaos_cards' = pg_temp.cards(:'g') and (payload->>'home_points')::numeric = 76.50 from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = :'g'), 'CAPTAIN: the matchup_final feed payload carries the build-up');
select pg_temp.expect(public.chaos_clause_decision(:'ls', :'h', :'a')->'steps'->0 = '{"step":"chaos_week","week":13,"home":56.50,"away":42.00,"outcome":"home","basis":"base_lineup_total","home_adjusted":76.50,"away_adjusted":53.00}'::jsonb,
  'CHAOS CLAUSE: the Chaos Week score it compares is the BASE lineup total (56.50, 42.00); the adjusted totals are recorded beside it');

create temp table snap on commit drop as select pg_temp.snapshot(:'g') as s;
select public.recompute_matchup(:'g', true), public.recompute_matchup(:'g', false);
select pg_temp.expect((select pg_temp.snapshot(:'g') = s from snap), 'STABLE: recompute after finalization (finalize true, then false) changes nothing: matchup, context, standings, feed, achievements, selections');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) <> '' and (select pg_temp.snapshot(:'g') = s from snap), 'STABLE: a finalized game''s selections cannot be cleared');
select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_grants where matchup_id = :'g'), 'CAPTAIN: no bounty is granted by another card');
rollback;

-- No captain named by one side; a captain moved out of the lineup; a D/ST captain.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, null, %L)', :'g', :'h', 'CAPTAIN', :'t1')) = '', 'captain: a starting D/ST can be captain');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[63.50, 41.00] and pg_temp.cards(:'g')->'home'->'adjustments' = jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', null, 'real_team_id', :'t1', 'points', 7.00))
  and pg_temp.cards(:'g')->'away'->'adjustments'->0 @> jsonb_build_object('effect', 'captain', 'automatic', true, 'athlete_id', null, 'real_team_id', :'t2', 'points', -1.00),
  'NO SELECTION (changed 2026-10-04): the side that names no captain gets the AUTOMATIC captain (its D/ST, average 16.00, which scored -1.00: 42.00 - 1.00 = 41.00); the named D/ST captain adds 7.00 and its line is not marked automatic');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hrb')) = '', 'captain: switch to the running back');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'RB', :'hb2')) = '', 'captain: the manager benches the captain before kickoff (normal lineup move)');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[70.00, 41.00] and (pg_temp.cards(:'g')->'home'->>'base')::numeric = 50.00 and jsonb_array_length(pg_temp.cards(:'g')->'home'->'adjustments') = 1
  and pg_temp.cards(:'g')->'home'->'adjustments'->0 @> jsonb_build_object('effect', 'captain', 'automatic', true, 'athlete_id', :'hq', 'points', 20.00),
  'captain moved to the bench (changed 2026-10-04): the named choice stops counting, the base follows the new lineup (56.50 - 12.50 + 6.00 = 50.00), and the AUTOMATIC captain takes over (hq, +20.00)');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = '', 'captain moved to the bench: that choice no longer counts, so before any kickoff another starter can be named');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[58.00, 41.00] and pg_temp.cards(:'g')->'home'->'adjustments' = jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hte', 'real_team_id', null, 'points', 8.00)),
  'new captain: 50.00 + 8.00; a NAMED captain replaces the automatic one even though the automatic one would have added more');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = '', 'captain: a captain who has not kicked off can be cleared');
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections), 'captain: clearing removes the selection row');
-- A named captain is benched and never replaced; then the automatic captain's game kicks off.
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = ''
  and pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'TE')) = '', 'benched captain: seed 1 names hte, then takes hte out of the lineup');
select pg_temp.kickoff(:'t1');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hk'))
  = 'Captain locked: no captain was named before your automatic captain''s game kicked off, so the automatic captain is fixed for the week',
  'benched captain: a named captain who left the lineup does not count, so the automatic captain locked at its kickoff and no other starter can be named');
select public.recompute_matchup(:'g', false);
select pg_temp.expect((select count(*) = 1 and bool_and(athlete_id = :'hq' and source = 'automatic' and selected_by is null and locked_at is not null) from public.chaos_card_selections where season_franchise_id = :'h')
  and pg_temp.points(:'g') = array[62.00, 41.00], 'benched captain: scoring replaces the row that no longer counts with the recorded automatic captain (base 50.00 - 8.00 = 42.00, + 20.00)');
rollback;

-- A postponed game never locks a selection and adds nothing. A withdrawn deal leaves no trace on an open game.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = '', 'postponed: the captain plays in the T3-T4 game');
update public.real_games set state = 'postponed', starts_at = now() - interval '1 hour' where week = 13 and home_team_id = :'t3';
delete from public.fantasy_player_scores where week = 13 and athlete_id = :'hte';
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[48.50, 41.00] and pg_temp.cards(:'g')->'home' = jsonb_build_object('base', 48.50, 'adjustments', jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hte', 'real_team_id', null, 'points', 0.00)), 'total', 48.50)
  and (select locked_at is null from public.chaos_card_selections where season_franchise_id = :'h'), 'POSTPONED: a NAMED captain whose game is postponed has no score, adds 0.00, is not locked, and is NOT replaced by the automatic captain');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = '', 'POSTPONED: the captain can still be changed to a starter whose game has not kicked off');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[68.50, 41.00], 'postponed: new captain counts (48.50 + 20.00)');
delete from public.chaos_card_deals;
select pg_temp.expect((select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_selections), 'withdrawn deal: deleting the deal row removes its draws and selections');
select pg_temp.recompute(:'g', false, false) as withdrawn \gset
select pg_temp.expect(pg_temp.points(:'g') = array[48.50, 42.00] and pg_temp.cards(:'g') is null and (:'withdrawn'::jsonb->'new') = (:'withdrawn'::jsonb->'old'), 'withdrawn deal: the next recompute scores the lineup total, removes the stale build-up, and returns what the pre-cards function returns');
rollback;

-- ---------------------------------------------------------------------------
-- 3b. AUTOMATIC CAPTAIN (owner decisions of 2026-10-04): chosen by average,
--     locked at kickoff, recorded once.
-- ---------------------------------------------------------------------------
-- The automatic captain row of a franchise, without clock values.
create function pg_temp.auto_row(p_matchup uuid, p_sf uuid) returns jsonb language sql as $$
  select jsonb_build_object('asset', coalesce(s.athlete_id, s.real_team_id), 'source', s.source, 'selected_by', s.selected_by, 'locked_at', s.locked_at, 'expected', s.details->'expected', 'basis', s.details->'basis',
    'compared', (select jsonb_agg(coalesce(x->>'athlete_id', x->>'real_team_id') order by ord) from jsonb_array_elements(s.details->'compared') with ordinality t(x, ord)))
  from public.chaos_card_selections s where s.matchup_id = p_matchup and s.season_franchise_id = p_sf
$$;
create function pg_temp.auto_pick(p_matchup uuid, p_sf uuid) returns text language sql as
$$ select coalesce(a->>'athlete_id', a->>'real_team_id') || case when a->>'locked_at' is null then ' preview' else ' locked' end from public.chaos_auto_captain(p_matchup, p_sf) a $$;
-- A bench receiver with the best average of the roster (30.00), for "a better starter is added".
create function pg_temp.give_hb1_history() returns void language sql as $$
  insert into public.fantasy_player_scores(league_season_id, athlete_id, game_id, week, points, breakdown)
  select (select ls from ids), (select id from cast_list where role = 'hb1'), gen_random_uuid(), w, 30.00, '{}'::jsonb from generate_series(10, 12) w
$$;
-- T1-T2 kicked off three hours ago, T3-T4 one hour ago (or only the first).
create function pg_temp.kickoff_keeping_marks(p_home_team uuid, p_hours_ago integer) returns timestamptz language sql as
$$ update public.real_games set starts_at = date_trunc('second', now()) - make_interval(hours => p_hours_ago), state = 'in_progress' where week = 13 and home_team_id = p_home_team returning starts_at $$;
create function pg_temp.kickoff_at(p_home_team uuid, p_hours_ago integer) returns timestamptz language sql as
$$ select pg_temp.rewind_marks(date_trunc('second', now()) - make_interval(hours => p_hours_ago)); select pg_temp.kickoff_keeping_marks(p_home_team, p_hours_ago) $$;

begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(public.chaos_captain_expected_points(:'ls', 13, :'hq', null) = '{"basis":"recent_average_v1","expected":20.00,"games":3,"weeks":[10,11,12],"season_total":100.00}'::jsonb,
  'expected points: the average of the THREE MOST RECENT scored weeks before Week 13 (18 + 22 + 20 over Weeks 10-12 = 20.00); Week 9 counts in the season total only');
select pg_temp.expect(public.chaos_captain_expected_points(:'ls', 13, :'hrb', null) = '{"basis":"recent_average_v1","expected":20.00,"games":2,"weeks":[11,12],"season_total":40.00}'::jsonb
  and public.chaos_captain_expected_points(:'ls', 13, :'hte', null) = '{"basis":"recent_average_v1","expected":8.00,"games":1,"weeks":[12],"season_total":8.00}'::jsonb,
  'expected points: fewer weeks are used when fewer exist (two, one)');
select pg_temp.expect(public.chaos_captain_expected_points(:'ls', 13, :'hk', null) = '{"basis":"recent_average_v1","expected":null,"games":0,"weeks":[],"season_total":0}'::jsonb,
  'expected points: a player with no earlier score has no average');
select pg_temp.expect(public.chaos_captain_expected_points(:'ls', 13, null, :'t1') = '{"basis":"recent_average_v1","expected":7.00,"games":3,"weeks":[10,11,12],"season_total":21.00}'::jsonb,
  'expected points: a D/ST is averaged from fantasy_team_scores in the same way');
select public.chaos_auto_captain(:'g', :'h') as auto_h \gset
select pg_temp.expect(:'auto_h'::jsonb @> jsonb_build_object('athlete_id', :'hq', 'real_team_id', null, 'basis', 'recent_average_v1', 'expected', 20.00, 'games', 3, 'season_total', 100.00, 'locked_at', null)
  and (:'auto_h'::jsonb->>'kickoff')::timestamptz = (select starts_at from public.real_games where week = 13 and home_team_id = :'t1'),
  'AUTOMATIC CAPTAIN preview: the starter with the highest average; hq and hrb tie on 20.00 and the higher SEASON TOTAL (100.00 over 40.00) decides; not locked before its kickoff');
select pg_temp.expect((select jsonb_agg(x - 'kickoff' order by ord) from jsonb_array_elements(:'auto_h'::jsonb->'compared') with ordinality t(x, ord)) = jsonb_build_array(
    jsonb_build_object('athlete_id', :'hq', 'real_team_id', null, 'expected', 20.00, 'games', 3, 'season_total', 100.00),
    jsonb_build_object('athlete_id', :'hrb', 'real_team_id', null, 'expected', 20.00, 'games', 2, 'season_total', 40.00),
    jsonb_build_object('athlete_id', :'hte', 'real_team_id', null, 'expected', 8.00, 'games', 1, 'season_total', 8.00),
    jsonb_build_object('athlete_id', null, 'real_team_id', :'t1', 'expected', 7.00, 'games', 3, 'season_total', 21.00),
    jsonb_build_object('athlete_id', :'hk', 'real_team_id', null, 'expected', null, 'games', 0, 'season_total', 0)),
  'AUTOMATIC CAPTAIN: every eligible starter is ranked and recorded; the kicker and the D/ST are eligible; the starter with no earlier score ranks LAST');
select pg_temp.expect(public.chaos_auto_captain(:'g', :'a') @> jsonb_build_object('athlete_id', null, 'real_team_id', :'t2', 'expected', 16.00, 'games', 3), 'AUTOMATIC CAPTAIN: a D/ST with the highest average is chosen like any starter');
select pg_temp.expect(public.chaos_auto_captain(:'g', :'h3') is null and public.chaos_auto_captain(:'g3', :'h') is null, 'automatic captain: nothing is returned for a franchise that is not in the matchup');

select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[76.50, 41.00], 'AUTOMATIC CAPTAIN score: neither manager named a captain; 56.50 + 20.00 = 76.50 and 42.00 - 1.00 = 41.00 (a negative automatic captain is doubled too)');
select pg_temp.expect(pg_temp.cards(:'g')->'home'->'adjustments' = jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hq', 'real_team_id', null, 'points', 20.00, 'automatic', true) || (:'auto_h'::jsonb - 'athlete_id' - 'real_team_id' - 'weeks')),
  'AUTOMATIC CAPTAIN: the adjustment line in matchups.context.chaos_cards says automatic: true and records the basis, the kickoff, and every average compared');
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections), 'BEFORE KICKOFF nothing is recorded: the automatic captain is only a preview');

-- No hindsight: Week 13 results do not move the choice.
savepoint hindsight;
update public.fantasy_player_scores set points = 0 where week = 13 and athlete_id = :'hq';
update public.fantasy_player_scores set points = 99 where week = 13 and athlete_id = :'hk';
select public.recompute_matchup(:'g', false);
select pg_temp.expect(public.chaos_auto_captain(:'g', :'h') = :'auto_h'::jsonb and pg_temp.points(:'g') = array[126.50, 41.00] and pg_temp.cards(:'g')->'home'->'adjustments'->0 @> jsonb_build_object('athlete_id', :'hq', 'automatic', true, 'points', 0.00),
  'NO HINDSIGHT: with the automatic captain scoring 0 and the kicker 99 in Week 13, the automatic captain is unchanged and adds 0.00 (36.50 + 99.00 - 9.00 = 126.50)');
rollback to savepoint hindsight;

-- Before the kickoff the preview follows the lineup.
savepoint lineup_change;
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'QB')) = '', 'automatic captain: the manager empties the QB slot');
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hrb' || ' preview', 'PREVIEW FOLLOWS THE LINEUP: with hq out, hrb is next');
rollback to savepoint lineup_change;

-- A named captain always wins; clearing brings the automatic one back.
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hk')) = '', 'named captain: before any kickoff seed 1 names the kicker, the lowest-ranked starter');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[65.50, 41.00] and pg_temp.cards(:'g')->'home'->'adjustments' = jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hk', 'real_team_id', null, 'points', 9.00)),
  'A NAMED CAPTAIN ALWAYS WINS: 56.50 + 9.00 = 65.50, one line, not marked automatic, although the automatic captain would have added 20.00');
select pg_temp.expect((select source = 'named' and selected_by = :'uh' and details is null from public.chaos_card_selections where season_franchise_id = :'h'), 'named captain: the row says named and who named it');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = '', 'named captain: cleared before kickoff');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[76.50, 41.00], 'automatic captain: back in force once the named captain is cleared');

-- POSTPONED: a starter whose game will not be played is skipped by the automatic rule.
savepoint auto_postponed;
update public.real_games set state = 'postponed' where week = 13 and home_team_id = :'t1';
delete from public.fantasy_player_scores where week = 13 and athlete_id = :'hq';
delete from public.fantasy_team_scores where week = 13 and real_team_id = :'t2';
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hte' || ' preview' and pg_temp.auto_pick(:'g', :'a') = :'ate' || ' preview'
  and (select array_agg(coalesce(x->>'athlete_id', x->>'real_team_id') order by ord) from jsonb_array_elements(public.chaos_auto_captain(:'g', :'h')->'compared') with ordinality t(x, ord)) = array[:'hte', :'hk'],
  'POSTPONED SKIPPED: with the T1-T2 game postponed, hq, hrb and the T1 D/ST are not eligible; the automatic captain is the best starter whose game will be played (hte; for seed 10, ate)');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[44.50, 54.00], 'postponed skipped: 36.50 + 8.00 and 43.00 + 11.00');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = '', 'postponed: a manager may still NAME a starter whose game is postponed');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[36.50, 54.00] and pg_temp.cards(:'g')->'home'->'adjustments' = jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hq', 'real_team_id', null, 'points', 0.00)), 'postponed: the NAMED captain is honoured as before and adds 0.00; the automatic rule does not replace it');
update public.real_games set state = 'canceled' where week = 13 and home_team_id = :'t3';
select pg_temp.expect(public.chaos_auto_captain(:'g', :'a') is null, 'canceled and postponed: with no starter whose game will be played there is no automatic captain');
rollback to savepoint auto_postponed;

-- Level on average and season total: the stable id order decides.
savepoint id_order;
delete from public.fantasy_player_scores where week < 13 and athlete_id in (:'aq', :'arb', :'ate', :'ak');
delete from public.fantasy_team_scores where week < 13 and real_team_id = :'t2';
select pg_temp.expect(coalesce(public.chaos_auto_captain(:'g', :'a')->>'athlete_id', public.chaos_auto_captain(:'g', :'a')->>'real_team_id') = (select min(x) from unnest(array[:'aq', :'arb', :'ate', :'ak', :'t2']::text[]) x)
  and public.chaos_auto_captain(:'g', :'a')->'expected' = 'null'::jsonb and public.chaos_auto_captain(:'g', :'a') = public.chaos_auto_captain(:'g', :'a'),
  'TIE-BREAK: with no earlier score for any starter (all level on average and season total) the smallest asset id, as text, is the automatic captain, every time');
rollback to savepoint id_order;

-- No starters: no automatic captain and no line.
savepoint no_starters;
delete from public.lineups where week = 13 and season_franchise_id = :'a';
select public.recompute_matchup(:'g', false);
select pg_temp.expect(public.chaos_auto_captain(:'g', :'a') is null and pg_temp.cards(:'g')->'away' = '{"base":0,"adjustments":[],"total":0}'::jsonb, 'automatic captain: a franchise with no starters has none, and no adjustment line');
rollback to savepoint no_starters;

-- Who may ask: production's read policies on the tables the function reads.
savepoint rls;
alter table public.lineups enable row level security;
alter table public.fantasy_player_scores enable row level security;
alter table public.fantasy_team_scores enable row level security;
alter table public.matchups enable row level security;
create policy member_read_lineups on public.lineups for select to authenticated using (exists (select 1 from season_franchises sf join league_seasons ls on ls.id = sf.league_season_id where sf.id = lineups.season_franchise_id and is_league_member(ls.league_id)));
create policy member_read_player_scores on public.fantasy_player_scores for select to authenticated using (exists (select 1 from league_seasons ls where ls.id = fantasy_player_scores.league_season_id and is_league_member(ls.league_id)));
create policy member_read_team_scores on public.fantasy_team_scores for select to authenticated using (exists (select 1 from league_seasons ls where ls.id = fantasy_team_scores.league_season_id and is_league_member(ls.league_id)));
create policy member_read_matchups on public.matchups for select to authenticated using (exists (select 1 from league_seasons ls where ls.id = matchups.league_season_id and is_league_member(ls.league_id)));
alter table public.roster_entries enable row level security;
create policy member_read_roster on public.roster_entries for select to authenticated using (exists (select 1 from season_franchises sf join league_seasons ls on ls.id = sf.league_season_id where sf.id = roster_entries.season_franchise_id and is_league_member(ls.league_id)));
grant select on public.lineups, public.fantasy_player_scores, public.fantasy_team_scores, public.season_franchises, public.athletes, public.real_games, public.roster_entries to authenticated;
select public.chaos_auto_pick(:'g', :'h', 'wild_slot') as auto_w, public.chaos_auto_pick(:'g', :'a', 'raid') as auto_r \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', :'ua', true);
select pg_temp.expect(public.chaos_auto_captain(:'g', :'h') = :'auto_h'::jsonb, 'RLS: a league member (here the opponent) gets the same automatic captain the scoring function uses');
select pg_temp.expect(:'auto_w'::jsonb->>'athlete_id' is not null and :'auto_r'::jsonb->>'athlete_id' is not null and public.chaos_auto_pick(:'g', :'h', 'wild_slot') = :'auto_w'::jsonb and public.chaos_auto_pick(:'g', :'a', 'raid') = :'auto_r'::jsonb,
  'RLS: a league member gets the same automatic Wild Slot player and automatic raid the scoring function uses (chaos_auto_pick runs with the caller''s rights)');
select set_config('request.jwt.claim.sub', :'outsider', true);
select pg_temp.expect(public.chaos_auto_captain(:'g', :'h') is null and (public.chaos_captain_expected_points(:'ls', 13, :'hq', null)->>'games')::int = 0, 'RLS: a user outside the league learns nothing (production read policies copied into this scenario)');
select pg_temp.expect(public.chaos_auto_pick(:'g', :'h', 'wild_slot') is null and public.chaos_auto_pick(:'g', :'a', 'raid') is null and (select count(*) = 0 from public.chaos_card_auto_marks), 'RLS: a user outside the league learns nothing about the automatic Wild Slot or raid either, and reads no evaluation mark');
reset role;
select set_config('request.jwt.claim.sub', '', true);
rollback to savepoint rls;

-- A better starter is added before any kickoff: the preview and the eventual lock follow the new lineup.
savepoint better_starter;
select pg_temp.give_hb1_history();
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hq' || ' preview', 'better starter: on the bench it does not count');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'better starter: the manager starts hb1 (average 30.00, plays in the later T3-T4 game)');
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hb1' || ' preview', 'CANDIDATE CHANGES: a higher-average starter added before any kickoff becomes the automatic captain');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hb1' || ' preview' and pg_temp.auto_row(:'g', :'h') is null, 'first kickoff: hq has kicked off but is outranked by hb1, who has not; nothing locks for seed 1');
select pg_temp.expect(pg_temp.auto_row(:'g', :'a') @> jsonb_build_object('asset', :'t2', 'source', 'automatic', 'selected_by', null) and (pg_temp.auto_row(:'g', :'a')->>'locked_at')::timestamptz = :'k1'::timestamptz, 'first kickoff: seed 10''s automatic captain (its D/ST, in that game) locks, with the kickoff as its lock time');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = ''
  and pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = '', 'before its automatic captain kicks off, seed 1 may still name (and clear) any starter who has not kicked off');
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') @> jsonb_build_object('asset', :'hb1', 'source', 'automatic', 'expected', 30.00) and (pg_temp.auto_row(:'g', :'h')->>'locked_at')::timestamptz = :'k3'::timestamptz
  and pg_temp.points(:'g') = array[86.50, 41.00], 'THE LOCK FOLLOWS THE NEW LINEUP: hb1 locks at its own kickoff (56.50 + 15.00 base, + 15.00 captain = 86.50)');
rollback to savepoint better_starter;

-- The lock.
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hq' || ' locked' and (select count(*) = 0 from public.chaos_card_selections), 'kickoff: the automatic captain is due to lock; scoring has not run, so nothing is recorded yet');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte'))
  = 'Captain locked: no captain was named before your automatic captain''s game kicked off, so the automatic captain is fixed for the week',
  'LOCK AT KICKOFF: after the automatic captain''s kickoff the manager CANNOT name a different starter, even one whose game has not started, and even before scoring has recorded the lock');

-- The job is late and the manager changes the lineup first: the lock is recorded from the lineup BEFORE the change.
savepoint lineup_first;
select pg_temp.give_hb1_history();
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'late job: after the kickoff the manager starts hb1 (average 30.00, not kicked off)');
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') @> jsonb_build_object('asset', :'hq', 'source', 'automatic') and (pg_temp.auto_row(:'g', :'h')->>'locked_at')::timestamptz = :'k1'::timestamptz
  and not (pg_temp.auto_row(:'g', :'h')->'compared' ? :'hb1'), 'LINEUP CHANGE AFTER THE KICKOFF, BEFORE SCORING: set_lineup_slot records the automatic captain (hq) from the lineup as it was before the change');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h')->>'asset' = :'hq' and pg_temp.points(:'g') = array[91.50, 41.00], 'late job: scoring keeps hq (56.50 + 15.00 base, + 20.00 captain); the better starter added afterwards does not take over');
rollback to savepoint lineup_first;

select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') = jsonb_build_object('asset', :'hq', 'source', 'automatic', 'selected_by', null, 'locked_at', :'k1'::timestamptz, 'expected', 20.00, 'basis', 'recent_average_v1', 'compared', jsonb_build_array(:'hq', :'hrb', :'hte', :'t1', :'hk')),
  'RECORDED: the first scoring run after the kickoff writes one selection row with source automatic, no user, the kickoff as lock time and the averages compared');
select pg_temp.expect(pg_temp.points(:'g') = array[76.50, 41.00] and pg_temp.cards(:'g')->'home'->'adjustments'->0 @> jsonb_build_object('effect', 'captain', 'athlete_id', :'hq', 'points', 20.00, 'automatic', true, 'locked_at', :'k1'::timestamptz, 'expected', 20.00),
  'recorded: the score line is read from the row and carries automatic: true and locked_at');
create temp table lock_snap on commit drop as select pg_temp.snapshot(:'g') as s, (select jsonb_agg(to_jsonb(x) order by x.season_franchise_id) from public.chaos_card_selections x) as rows;
select public.recompute_matchup(:'g', false), public.recompute_matchup(:'g', false);
select pg_temp.expect((select count(*) = 2 from public.chaos_card_selections) and (select pg_temp.snapshot(:'g') = s and (select jsonb_agg(to_jsonb(x) order by x.season_franchise_id) from public.chaos_card_selections x) = rows from lock_snap),
  'IDEMPOTENT: scoring run twice more after the lock leaves one row per franchise, unchanged, and the same result');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte'))
  = 'Captain locked: no captain was named before your automatic captain''s game kicked off, so the automatic captain is fixed for the week'
  and pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = 'Selection locked: that player''s game has already started',
  'LOCKED: with the automatic captain recorded, naming another starter and clearing are both refused');

-- Lineup changed after the lock: the captain does not move.
savepoint after_lock;
select pg_temp.give_hb1_history();
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '' and pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'TE')) = '', 'after the lock: the manager adds a better starter and empties another slot');
select public.recompute_matchup(:'g', false);
select pg_temp.expect((select (select to_jsonb(x) from public.chaos_card_selections x where x.season_franchise_id = :'h') = (select e from jsonb_array_elements(rows) e where e->>'season_franchise_id' = :'h') from lock_snap) and pg_temp.auto_row(:'g', :'h')->>'asset' = :'hq'
  and pg_temp.cards(:'g')->'home'->'adjustments'->0 @> jsonb_build_object('athlete_id', :'hq', 'points', 20.00, 'automatic', true) and jsonb_array_length(pg_temp.cards(:'g')->'home'->'adjustments') = 1 and pg_temp.points(:'g') = array[83.50, 41.00],
  'LINEUP CHANGED AFTER THE LOCK: the captain is still hq (+20.00); only the base follows the lineup (56.50 + 15.00 - 8.00 = 63.50)');
rollback to savepoint after_lock;

-- Final: the automatic captain is part of the result.
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'AUTOMATIC CAPTAIN: Week 13 closes');
select pg_temp.expect((select is_final and winner_season_franchise_id = :'h' and home_points = 76.50 and away_points = 41.00 from public.matchups where id = :'g')
  and pg_temp.cards(:'g')->'home'->'adjustments'->0->>'automatic' = 'true' and pg_temp.cards(:'g')->'away'->'adjustments'->0->>'automatic' = 'true',
  'AUTOMATIC CAPTAIN: final 76.50 to 41.00 with both automatic captains recorded');
select pg_temp.expect((select payload->'chaos_cards' = pg_temp.cards(:'g') from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = :'g'), 'AUTOMATIC CAPTAIN: the matchup_final feed payload carries the same record');
select pg_temp.expect(public.chaos_clause_decision(:'ls', :'h', :'a')->'steps'->0 = '{"step":"chaos_week","week":13,"home":56.50,"away":42.00,"outcome":"home","basis":"base_lineup_total","home_adjusted":76.50,"away_adjusted":41.00}'::jsonb,
  'CHAOS CLAUSE: still compares the base lineup totals, before the (automatic) captain is applied');
create temp table auto_snap on commit drop as select pg_temp.snapshot(:'g') as s;
select public.recompute_matchup(:'g', true), public.recompute_matchup(:'g', false);
select pg_temp.expect((select pg_temp.snapshot(:'g') = s from auto_snap), 'STABLE: recomputing the finalized game changes nothing about the automatic captain');
rollback;

-- THE JOB WAS LATE: every starter has kicked off and no captain is recorded.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
savepoint late_first_game;
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections) and pg_temp.auto_pick(:'g', :'h') = :'hq' || ' locked', 'late job: both games have kicked off and nothing is recorded');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') @> jsonb_build_object('asset', :'hq', 'source', 'automatic') and (pg_temp.auto_row(:'g', :'h')->>'locked_at')::timestamptz = :'k1'::timestamptz
  and pg_temp.auto_row(:'g', :'a') @> jsonb_build_object('asset', :'t2') and (pg_temp.auto_row(:'g', :'a')->>'locked_at')::timestamptz = :'k1'::timestamptz,
  'LATE JOB, kickoff order: at the first kickoff the best-ranked starter (hq; for seed 10 its D/ST) was in that game, so it is the captain, locked at the FIRST kickoff');
select pg_temp.expect(pg_temp.points(:'g') = array[76.50, 41.00], 'late job: the same score as a job that ran on time');
rollback to savepoint late_first_game;
savepoint late_second_game;
select pg_temp.give_hb1_history();
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'late job: hb1 (average 30.00, later game) was started before any kickoff');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') @> jsonb_build_object('asset', :'hb1', 'source', 'automatic') and (pg_temp.auto_row(:'g', :'h')->>'locked_at')::timestamptz = :'k3'::timestamptz,
  'LATE JOB, kickoff order: at the first kickoff the best-ranked starter (hb1) had not kicked off, so nothing locked then; hb1 locked at the SECOND kickoff');
rollback to savepoint late_second_game;
rollback;

-- NO HINDSIGHT THROUGH A LATER CHANGE (found and closed 2026-10-04, third
-- round). The automatic rule is evaluated in kickoff order on the lineup as it
-- stood. Once a kickoff has passed with nothing to lock, a lineup change or a
-- cleared choice made AFTERWARDS must not hand the captaincy to a starter whose
-- game has already been played.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
savepoint bench_the_later_starter;
select pg_temp.give_hb1_history();
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'no hindsight fixture: before any kickoff the manager starts hb1 (average 30.00, later game), who outranks hq (20.00, first game)');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') is null and pg_temp.auto_pick(:'g', :'h') = :'hb1' || ' preview' and (select evaluated_through = now() from public.chaos_card_auto_marks where season_franchise_id = :'h'),
  'no hindsight fixture: scoring ran after the first kickoff; hq has played, nothing locked (hb1 outranks him and has not kicked off), and the evaluation mark is the time of that run');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'WR')) = '', 'no hindsight: now that hq''s game has been played, the manager benches hb1');
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hte' || ' preview' and pg_temp.auto_row(:'g', :'h') is null,
  'NO HINDSIGHT (captain): benching the better-ranked later starter does NOT make hq captain after the fact; the automatic captain is now the best-ranked starter whose game is still to come (hte)');
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') @> jsonb_build_object('asset', :'hte', 'source', 'automatic') and (pg_temp.auto_row(:'g', :'h')->>'locked_at')::timestamptz = :'k3'::timestamptz and pg_temp.points(:'g') = array[64.50, 41.00],
  'no hindsight (captain): hte locks at its own kickoff (56.50 + 8.00 = 64.50), not hq (+ 20.00)');
rollback to savepoint bench_the_later_starter;
savepoint name_then_clear;
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hk')) = '', 'no hindsight fixture: before any kickoff the manager names the kicker (later game) as captain');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = '', 'no hindsight: after hq''s game has been played, the manager clears the named captain');
select pg_temp.expect(pg_temp.auto_pick(:'g', :'h') = :'hte' || ' preview' and (select count(*) = 0 from public.chaos_card_selections where season_franchise_id = :'h'),
  'NO HINDSIGHT (captain): clearing a named captain after an earlier game does NOT make that game''s starter (hq) captain; the automatic captain is the best-ranked starter still to play (hte)');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hk')) = '', 'no hindsight: the manager may still name a starter who has not kicked off');
rollback to savepoint name_then_clear;
-- The gap that was open until 2026-10-04 ("a not-yet-started starter is dropped
-- between a kickoff and the recording of the lock"): the job is late, nothing
-- is recorded, and the better-ranked later starter is DROPPED (out of the
-- lineup first, then off the roster, as claim_free_agent and
-- process_due_waivers do it). The lineups trigger evaluates the rule on the
-- lineup as it stood, before the row goes.
savepoint drop_the_later_starter;
select pg_temp.give_hb1_history();
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'drop fixture: before any kickoff the manager starts hb1 (average 30.00, later game)');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections) and pg_temp.auto_pick(:'g', :'h') = :'hb1' || ' preview', 'drop fixture: the first game has kicked off, scoring has not run, nothing is recorded; hb1 (not kicked off) outranks hq');
delete from public.lineups where season_franchise_id = :'h' and week = 13 and athlete_id = :'hb1';
update public.roster_entries set dropped_at = now() where season_franchise_id = :'h' and athlete_id = :'hb1' and dropped_at is null;
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') is null and pg_temp.auto_pick(:'g', :'h') = :'hte' || ' preview',
  'A STARTER DROPPED BETWEEN A KICKOFF AND THE RECORDING OF THE LOCK: the rule was evaluated on the lineup as it stood (hb1 outranked hq, so nothing locked at the first kickoff); after the drop hq is NOT made captain after the fact, and the automatic captain is the best-ranked starter still to play (hte)');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.auto_row(:'g', :'h') is null and pg_temp.points(:'g') = array[64.50, 41.00], 'dropped starter: scoring records nothing for seed 1 yet (hte has not kicked off); 56.50 + 8.00 pending');
rollback to savepoint drop_the_later_starter;
rollback;

-- ---------------------------------------------------------------------------
-- 4. WILD SLOT.
-- ---------------------------------------------------------------------------
-- Three earlier weeks (10-12) at p_points each for a cast player: an average of p_points.
create function pg_temp.give_history(p_role text, p_points numeric) returns void language sql as $$
  insert into public.fantasy_player_scores(league_season_id, athlete_id, game_id, week, points, breakdown)
  select (select ls from ids), (select id from cast_list where role = p_role), gen_random_uuid(), w, p_points, '{}'::jsonb from generate_series(10, 12) w
$$;
-- A player leaves a roster the way claim_free_agent, process_due_waivers and
-- resolve_trade make him leave: out of the franchise's open lineups first, then
-- roster_entries.dropped_at is set. p_hours_ago places the drop on the
-- scenario's clock (kickoffs are simulated 3 hours and 1 hour ago), so
-- "dropped 6 hours ago" is before every kickoff and "2 hours ago" is between them.
create function pg_temp.drop_player(p_sf uuid, p_athlete uuid, p_hours_ago integer default 6) returns timestamptz language sql as $$
  delete from public.lineups where season_franchise_id = p_sf and athlete_id = p_athlete and week = 13;
  update public.roster_entries set dropped_at = date_trunc('second', now()) - make_interval(hours => p_hours_ago) where season_franchise_id = p_sf and athlete_id = p_athlete and dropped_at is null returning dropped_at
$$;
-- A selection row without ids of its own and without its long details.
create function pg_temp.sel(p_matchup uuid, p_sf uuid) returns jsonb language sql as $$
  select jsonb_build_object('asset', coalesce(s.athlete_id, s.real_team_id), 'source', s.source, 'from', s.source_season_franchise_id, 'selected_by', s.selected_by, 'locked_at', s.locked_at,
    'void', s.void_reason, 'voided_at', s.voided_at, 'penalty', coalesce((s.details->>'penalty')::boolean, false), 'replaced', s.details->'replaced'->>'athlete_id',
    'compared', (select jsonb_agg(coalesce(x->>'athlete_id', x->>'real_team_id') order by ord) from jsonb_array_elements(s.details->'compared') with ordinality t(x, ord)))
  from public.chaos_card_selections s where s.matchup_id = p_matchup and s.season_franchise_id = p_sf
$$;
-- What chaos_auto_pick answers: '<asset> preview|locked[ penalty]', or null.
create function pg_temp.pick(p_matchup uuid, p_sf uuid, p_kind text) returns text language sql as
$$ select coalesce(a->>'athlete_id', a->>'real_team_id') || case when a->>'locked_at' is null then ' preview' else ' locked' end || case when a->>'penalty' = 'true' then ' penalty' else '' end from public.chaos_auto_pick(p_matchup, p_sf, p_kind) a $$;
create function pg_temp.lines(p_matchup uuid, p_side text) returns jsonb language sql as
$$ select (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('effect', x->'effect', 'asset', coalesce(x->>'athlete_id', x->>'real_team_id'), 'points', x->'points', 'automatic', x->'automatic', 'penalty', nullif(x->'penalty', 'false'::jsonb), 'locked', case when x ? 'automatic' then x->>'locked_at' is not null end)) order by ord)
   from jsonb_array_elements(pg_temp.cards(p_matchup)->p_side->'adjustments') with ordinality t(x, ord)) $$;

begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = 'This matchup was dealt Wild Slot, not CAPTAIN', 'wrong card: a captain is refused in a matchup that was dealt Wild Slot');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hq')) = 'That player is already starting; the Wild Slot is for a player outside your starting lineup', 'LOCK wild slot: a player who is already starting is refused');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, null, %L)', :'g', :'h', 'WILD_SLOT', :'t1')) = 'That player is already starting; the Wild Slot is for a player outside your starting lineup', 'wild slot: the starting D/ST is refused too');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'ab1')) = 'Your Wild Slot player must be on your active roster', 'wild slot: a player on another roster is refused');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'fa')) = 'Your Wild Slot player must be on your active roster', 'wild slot: a free agent is refused');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = 'Not your franchise', 'NON-OWNER: refused');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = ''
  and pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = '', 'wild slot: seed 1 picks a bench player and changes it before kickoff');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'WILD_SLOT', :'ab1')) = '', 'wild slot: seed 10 picks a bench player');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = 'That player is your Wild Slot pick. Clear the Wild Slot before moving them into the starting lineup', 'wild slot: the pick cannot also be moved into the starting lineup');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 18, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'wild slot: the same player can be started in another week');

select pg_temp.kickoff(:'t3');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = 'Wild Slot locked: that player''s game has already started', 'LOCK wild slot: after the pick''s kickoff it cannot be changed');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = 'Selection locked: that player''s game has already started', 'LOCK wild slot: after kickoff it cannot be cleared');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'a')) = 'Selection locked: that player''s game has already started', 'LOCK wild slot: same for the other side');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[71.50, 55.00], 'WILD SLOT score: 56.50 + 15.00 = 71.50; 42.00 + 13.00 = 55.00');
select pg_temp.expect(pg_temp.cards(:'g')->'home' = jsonb_build_object('base', 56.50, 'adjustments', jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'athlete_id', :'hb1', 'real_team_id', null, 'points', 15.00)), 'total', 71.50), 'WILD SLOT: the adjustment line names the extra player and the points');
rollback;

-- A kicked-off player cannot be picked; a side that never picks gets the automatic Wild Slot.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
select pg_temp.give_history('hb2', 12.00);
select pg_temp.kickoff(:'t3');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = 'That player''s game has already started', 'LOCK wild slot: a player whose game has kicked off cannot be picked');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = '', 'wild slot: a bench player whose game has not kicked off can still be picked (the automatic pick, hb2, had not kicked off, so nothing had locked)');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[62.50, 55.00] and pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'ab1', 'source', 'automatic'),
  'NO SELECTION (changed 2026-10-04): 56.50 + 6.00 for the side that picked; the side that never picked gets the AUTOMATIC Wild Slot (ab1, its only non-starter, kicked off): 42.00 + 13.00 = 55.00');
rollback;

-- ---------------------------------------------------------------------------
-- 4b. WILD SLOT: void on drop, and the AUTOMATIC Wild Slot (owner decisions of
--     2026-10-04, third round). Seed 1's non-starters: hb1 (plays in the later
--     T3-T4 game, 15.00 in Week 13) and hb2 (plays in the first T1-T2 game,
--     6.00). Seed 10's only non-starter: ab1 (T3-T4 game, 13.00).
-- ---------------------------------------------------------------------------
-- VOID ON DROP, THEN RE-CHOOSE.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
select pg_temp.expect(pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb1' || ' preview' and pg_temp.pick(:'g', :'a', 'wild_slot') = :'ab1' || ' preview' and pg_temp.pick(:'g', :'h', 'raid') is null and pg_temp.pick(:'g', :'h', 'nonsense') is null,
  'AUTOMATIC WILD SLOT preview: the franchise''s best-ranked non-starter (hb1, average 30.00, over hb2, 12.00); seed 10''s is ab1');
select pg_temp.expect((select jsonb_agg(x - 'kickoff' order by ord) from jsonb_array_elements(public.chaos_auto_pick(:'g', :'h', 'wild_slot')->'compared') with ordinality t(x, ord)) = jsonb_build_array(
    jsonb_build_object('athlete_id', :'hb1', 'real_team_id', null, 'expected', 30.00, 'games', 3, 'season_total', 90.00),
    jsonb_build_object('athlete_id', :'hb2', 'real_team_id', null, 'expected', 12.00, 'games', 3, 'season_total', 36.00))
  and public.chaos_auto_pick(:'g', :'h', 'wild_slot') @> jsonb_build_object('basis', 'recent_average_v1', 'expected', 30.00, 'locked_at', null) and not (public.chaos_auto_pick(:'g', :'h', 'wild_slot') ? 'penalty'),
  'automatic wild slot: ranked by the SAME function as the automatic captain (recent_average_v1); only non-starters on the active roster are compared, no starter and no opponent');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = '', 'void: seed 1 names hb2 as its Wild Slot player');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[62.50, 55.00] and pg_temp.lines(:'g', 'home') = jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'asset', :'hb2', 'points', 6.00))
  and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'asset', :'ab1', 'points', 13.00, 'automatic', true, 'locked', false)),
  'void fixture: the NAMED pick wins over the automatic one (56.50 + 6.00, not + 15.00) and its line is not marked automatic; seed 10, which named nobody, shows its automatic pick as not yet locked');
select pg_temp.drop_player(:'h', :'hb2') as dropped_hb2 \gset
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hb2', 'source', 'named', 'void', 'dropped', 'voided_at', :'dropped_hb2'::timestamptz, 'locked_at', null),
  'VOID ON DROP: the moment the Wild Slot pick is dropped (before its kickoff) its row is marked void, with the time of the drop');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[71.50, 55.00] and pg_temp.lines(:'g', 'home') = jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'asset', :'hb1', 'points', 15.00, 'automatic', true, 'locked', false)),
  'VOID: the dropped pick adds NOTHING (no 6.00); until the manager chooses again the automatic rule applies to the roster as it now stands (hb1)');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = 'Your Wild Slot player must be on your active roster', 'void: the dropped player cannot be chosen again');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hte')) = 'That player is already starting; the Wild Slot is for a player outside your starting lineup', 'RE-CHOOSE under the normal rules: a starter is still refused');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'K')) = ''
  and pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hk')) = '', 'VOID THEN RE-CHOOSE: the manager benches the kicker and names him as the new Wild Slot player');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hk', 'source', 'named', 'selected_by', :'uh', 'void', null, 'voided_at', null) and (select count(*) = 1 from public.chaos_card_selections where season_franchise_id = :'h')
  and pg_temp.points(:'g') = array[56.50, 55.00] and pg_temp.lines(:'g', 'home') = jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'asset', :'hk', 'points', 9.00)),
  'RE-CHOSEN: one row, named, no longer void; base 56.50 - 9.00 = 47.50, + 9.00 for the new pick = 56.50; the automatic pick (hb1, + 15.00) does not replace a named one');
-- A drop AFTER the pick's game has been played does not void it.
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select pg_temp.drop_player(:'h', :'hk', 0);
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hk', 'void', null) and pg_temp.points(:'g') = array[56.50, 55.00],
  'NOT VOID: a pick dropped AFTER its own kickoff keeps counting (the points were earned while the player was on the roster)');
rollback;

-- VOID ON DROP, THEN AUTOMATIC. Also: a pick that is traded away is void in the same way.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = '', 'void then automatic: seed 1 names hb1');
-- hb1 leaves in a trade: dropped from seed 1's roster, added to another franchise's.
select pg_temp.drop_player(:'h', :'hb1') as traded_hb1 \gset
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) values (:'h3', :'hb1', 'trade');
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hb1', 'void', 'dropped', 'voided_at', :'traded_hb1'::timestamptz) and pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb2' || ' preview',
  'VOID: a Wild Slot pick that leaves the roster in a trade is void like a dropped one; the automatic pick is now hb2');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect(pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb2' || ' locked' and pg_temp.sel(:'g', :'h')->>'source' = 'named', 'void then automatic: hb2''s game kicks off with nothing chosen again; the automatic pick is due, scoring has not run');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'K')) = ''
  and pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hk'))
    = 'Wild Slot locked: no player was named before your automatic Wild Slot player''s game kicked off, so the automatic pick is fixed for the week',
  'LOCK AT KICKOFF: after the automatic Wild Slot player''s kickoff the manager cannot name anyone, even a player who has not kicked off; the lineup change before it recorded the lock');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h') = jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'k1'::timestamptz, 'void', null, 'voided_at', null, 'penalty', false, 'replaced', :'hb1', 'compared', jsonb_build_array(:'hb2')),
  'VOID THEN AUTOMATIC: the void row is replaced by ONE automatic row: hb2, source automatic, no user, locked at hb2''s kickoff, recording the pick it replaced and what was compared (the kicker benched afterwards is not in it)');
select pg_temp.expect(pg_temp.points(:'g') = array[53.50, 55.00] and pg_temp.lines(:'g', 'home') = jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'asset', :'hb2', 'points', 6.00, 'automatic', true, 'locked', true))
  and pg_temp.cards(:'g')->'home'->'adjustments'->0 @> jsonb_build_object('basis', 'recent_average_v1', 'expected', 12.00, 'locked_at', :'k1'::timestamptz) and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'wild_slot', 'asset', :'ab1', 'points', 13.00, 'automatic', true, 'locked', false)),
  'void then automatic, score: 56.50 - 9.00 (kicker benched) + 6.00 = 53.50; the line says automatic and locked');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = 'Selection locked: that player''s game has already started', 'automatic wild slot: it cannot be cleared');
rollback;

-- THE AUTOMATIC WILD SLOT LOCK, in kickoff order, on time and late.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
savepoint on_time;
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb1' || ' preview' and (select count(*) = 0 from public.chaos_card_selections) and pg_temp.points(:'g') = array[71.50, 55.00],
  'AUTOMATIC WILD SLOT, first kickoff: hb2 has kicked off but is outranked by hb1, who has not, so NOTHING locks and nothing is recorded');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = 'That player''s game has already started'
  and pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = '' and pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = '',
  'before its automatic pick kicks off, seed 1 may still name (and clear) a non-starter who has not kicked off, but not one who has');
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h') = jsonb_build_object('asset', :'hb1', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'k3'::timestamptz, 'void', null, 'voided_at', null, 'penalty', false, 'replaced', null, 'compared', jsonb_build_array(:'hb1', :'hb2'))
  and pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'ab1', 'source', 'automatic', 'locked_at', :'k3'::timestamptz) and pg_temp.points(:'g') = array[71.50, 55.00],
  'AUTOMATIC WILD SLOT, second kickoff: hb1 locks at ITS OWN kickoff, recorded with source automatic; seed 10''s ab1 locks at the same kickoff; 56.50 + 15.00 and 42.00 + 13.00');
create temp table wild_snap on commit drop as select pg_temp.snapshot(:'g') as s;
select public.recompute_matchup(:'g', false), public.recompute_matchup(:'g', false);
select pg_temp.expect((select pg_temp.snapshot(:'g') = s from wild_snap) and (select count(*) = 2 from public.chaos_card_selections), 'IDEMPOTENT: scoring run twice more leaves one automatic row per franchise, unchanged, and the same result');
-- No hindsight: Week 13 scores do not move the pick.
update public.fantasy_player_scores set points = 0 where week = 13 and athlete_id = :'hb1';
update public.fantasy_player_scores set points = 99 where week = 13 and athlete_id = :'hb2';
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h')->>'asset' = :'hb1' and pg_temp.points(:'g') = array[56.50, 55.00], 'NO HINDSIGHT: with hb1 scoring 0 and hb2 99 in Week 13 the automatic pick is still hb1 and adds 0.00');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'automatic wild slot: Week 13 closes');
select pg_temp.expect((select is_final and home_points = 56.50 and away_points = 55.00 from public.matchups where id = :'g')
  and (select payload->'chaos_cards' = pg_temp.cards(:'g') from public.league_feed_events where event_type = 'matchup_final' and payload->>'matchup_id' = :'g'), 'AUTOMATIC WILD SLOT: Week 13 closes with both automatic picks in the final build-up and in the feed');
create temp table wild_final on commit drop as select pg_temp.snapshot(:'g') as s;
select pg_temp.drop_player(:'h', :'hb1', 0);
select public.recompute_matchup(:'g', true), public.recompute_matchup(:'g', false);
select pg_temp.expect((select pg_temp.snapshot(:'g') = s from wild_final), 'STABLE: after the game is final, dropping the automatic pick and recomputing changes nothing');
rollback to savepoint on_time;

savepoint late_first;
select pg_temp.give_history('hb2', 30.00);
select pg_temp.give_history('hb1', 12.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections) and pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb2' || ' locked', 'late job: both games have kicked off and nothing is recorded');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'locked_at', :'k1'::timestamptz) and pg_temp.points(:'g') = array[62.50, 55.00],
  'LATE JOB, kickoff order: at the first kickoff the best-ranked non-starter (hb2) was in that game, so it is the Wild Slot player, locked at the FIRST kickoff (56.50 + 6.00), although hb1 would add more');
rollback to savepoint late_first;

savepoint late_second;
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.kickoff_at(:'t3', 1) as k3 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hb1', 'source', 'automatic', 'locked_at', :'k3'::timestamptz) and pg_temp.points(:'g') = array[71.50, 55.00],
  'LATE JOB, kickoff order: at the first kickoff the best-ranked non-starter (hb1) had not kicked off, so nothing locked then; hb1 locked at the SECOND kickoff');
rollback to savepoint late_second;

-- The job is late and the roster or lineup changes first: the lock is recorded from the state BEFORE the change.
savepoint late_lineup_first;
select pg_temp.give_history('hb2', 12.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'TE')) = '', 'late job: after the first kickoff the manager benches hte (average 8.00, not kicked off), which makes hte a non-starter');
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'locked_at', :'k1'::timestamptz, 'compared', jsonb_build_array(:'hb2', :'hb1')),
  'LINEUP CHANGE AFTER THE KICKOFF, BEFORE SCORING: set_lineup_slot records the automatic Wild Slot (hb2) from the lineup as it was before the change; hte is not among those compared');
rollback to savepoint late_lineup_first;
savepoint late_roster_first;
select pg_temp.give_history('hb2', 12.00);
select pg_temp.give_history('fa', 40.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) values (:'h', :'fa', 'free_agent');
select pg_temp.expect(pg_temp.sel(:'g', :'h') @> jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'locked_at', :'k1'::timestamptz, 'compared', jsonb_build_array(:'hb2', :'hb1')),
  'ROSTER CHANGE AFTER THE KICKOFF, BEFORE SCORING: adding a free agent with a better average (40.00) first records the automatic Wild Slot (hb2) from the roster as it was; the newcomer is not compared and does not take over');
rollback to savepoint late_roster_first;

-- NO HINDSIGHT through a later change. The rule was evaluated after the first
-- kickoff and nothing locked (hb1, the better-ranked, plays later). Dropping
-- hb1 afterwards must not hand the pick to hb2, whose game is already played.
savepoint no_retro;
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections) and (select evaluated_through = now() from public.chaos_card_auto_marks where season_franchise_id = :'h'), 'no hindsight fixture: scoring ran after the first kickoff; nothing locked for seed 1, and the evaluation mark is the time of that run');
select pg_temp.drop_player(:'h', :'hb1', 0);
select public.recompute_matchup(:'g', false);
select pg_temp.expect(public.chaos_auto_pick(:'g', :'h', 'wild_slot') is null and (select count(*) = 0 from public.chaos_card_selections where season_franchise_id = :'h') and pg_temp.lines(:'g', 'home') is null and (pg_temp.points(:'g'))[1] = 56.50,
  'NO HINDSIGHT: after hb2''s game has been played, dropping the better-ranked hb1 does NOT make hb2 the Wild Slot player; no eligible player is left whose game is still to come, so there is no bonus (56.50)');
rollback to savepoint no_retro;
rollback;

-- NO ELIGIBLE NON-STARTER: no Wild Slot bonus.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
savepoint none_at_all;
select pg_temp.drop_player(:'a', :'ab1');
select pg_temp.expect(public.chaos_auto_pick(:'g', :'a', 'wild_slot') is null, 'no eligible non-starter: with no player outside its starting lineup, seed 10 has no automatic Wild Slot');
select pg_temp.kickoff_at(:'t1', 3), pg_temp.kickoff_at(:'t3', 1);
select public.recompute_matchup(:'g', false);
select pg_temp.expect((pg_temp.points(:'g'))[2] = 42.00 and pg_temp.cards(:'g')->'away' = '{"base":42.00,"adjustments":[],"total":42.00}'::jsonb and (select count(*) = 0 from public.chaos_card_selections where season_franchise_id = :'a'),
  'NO ELIGIBLE NON-STARTER: no Wild Slot bonus: 42.00, no adjustment line, no row recorded');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'no eligible non-starter: Week 13 closes');
select pg_temp.expect((select is_final and away_points = 42.00 from public.matchups where id = :'g') and (select count(*) = 0 from public.chaos_card_selections where season_franchise_id = :'a'), 'no eligible non-starter: the game is final at 42.00 for seed 10');
rollback to savepoint none_at_all;
savepoint bye;
-- ab1's team has no Week 13 game (a bye): on the roster, not starting, but not eligible.
update public.athletes set real_team_id = '00000000-0000-0000-0000-0000000000e9' where id = :'ab1';
delete from public.fantasy_player_scores where week = 13 and athlete_id = :'ab1';
select pg_temp.expect(public.chaos_auto_pick(:'g', :'a', 'wild_slot') is null, 'BYE: a non-starter whose team has no Week 13 game is not eligible, so there is no automatic Wild Slot');
update public.athletes set real_team_id = :'t4' where id = :'ab1';
update public.real_games set state = 'postponed' where week = 13 and home_team_id = :'t3';
select pg_temp.expect(public.chaos_auto_pick(:'g', :'a', 'wild_slot') is null and pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb2' || ' preview', 'POSTPONED: a non-starter whose game is postponed is not eligible (seed 10: none; seed 1: hb2, whose game will be played, not hb1)');
update public.real_games set state = 'canceled' where week = 13 and home_team_id = :'t3';
select pg_temp.expect(public.chaos_auto_pick(:'g', :'a', 'wild_slot') is null and pg_temp.pick(:'g', :'h', 'wild_slot') = :'hb2' || ' preview', 'CANCELED: the same for a canceled game');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'WILD_SLOT', :'ab1')) = '', 'postponed or canceled: a manager may still NAME that player (it adds 0.00), as before');
rollback to savepoint bye;
rollback;

-- ---------------------------------------------------------------------------
-- 5. RAID.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
select pg_temp.expect(public.chaos_lower_seed(:'g') = :'a', 'raid fixture: the away side (seed 10) is the lower seed');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'RAID', :'ab1')) = 'Only the lower seed can raid', 'LOCK raid: a raid by the HIGHER seed is refused');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hq')) = 'You can only raid the bench: that player is in your opponent''s starting lineup', 'LOCK raid: a raid of a STARTER is refused');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, null, %L)', :'g', :'a', 'RAID', :'t1')) = 'You can only raid the bench: that player is in your opponent''s starting lineup', 'raid: the opponent''s starting D/ST is refused');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'ab1')) = 'That player is not on your opponent''s roster', 'raid: the raider''s own bench is not a target');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'fa')) = 'That player is not on your opponent''s roster', 'raid: a free agent is not a target');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = 'Not your franchise', 'NON-OWNER: the higher seed cannot raid on the lower seed''s behalf');
savepoint deadline;
select pg_temp.kickoff(:'t1');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = 'The raid deadline has passed: raids close at the first Week 13 kickoff', 'LOCK raid: a raid AFTER THE DEADLINE (first Week 13 kickoff) is refused, even for a player who has not kicked off');
rollback to savepoint deadline;
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = '', 'raid: the lower seed raids a bench player before the deadline');
select pg_temp.expect((select count(*) = 1 and bool_and(athlete_id = :'hb1' and source_season_franchise_id = :'h' and locked_at is not null) from public.chaos_card_selections), 'raid: the raid is recorded against the lender and locked at once');
select pg_temp.expect((select count(*) = 1 and bool_and(payload->>'raided_season_franchise_id' = :'h' and payload->>'athlete_id' = :'hb1') from public.league_feed_events where event_type = 'chaos_raid'), 'raid: a feed event tells the league (and the lender) who was raided');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb2')) = 'Your raid is already made and cannot be changed'
  and pg_temp.err_as(:'ua', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'a')) = 'Your raid is already made and cannot be changed', 'raid: one raid, and it cannot be changed or cleared');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = 'Lineup locked: your Chaos Week opponent raided this player, so they cannot start for you in Week 13', 'LOCK raid: the RAIDED PLAYER cannot be moved into the lender''s Week 13 starting lineup');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 2, %L, null)', :'h', 'RB', :'hb2')) = '' and pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 2, null, null)', :'h', 'RB')) = ''
  and pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 18, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'raid: the lender can still move other players, and can start the raided player in another week');
select pg_temp.expect((select count(*) = 1 from public.roster_entries where season_franchise_id = :'h' and athlete_id = :'hb1' and dropped_at is null) and (select count(*) = 0 from public.roster_entries where season_franchise_id = :'a' and athlete_id = :'hb1'), 'raid: the raided player stays on the lender''s roster');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 57.00], 'RAID score: the raider gets 42.00 + 15.00 = 57.00; the lender keeps 56.50');
select pg_temp.expect(pg_temp.cards(:'g')->'away' = jsonb_build_object('base', 42.00, 'adjustments', jsonb_build_array(jsonb_build_object('effect', 'raid', 'athlete_id', :'hb1', 'real_team_id', null, 'points', 15.00)), 'total', 57.00)
  and pg_temp.cards(:'g')->'home'->'adjustments' = '[]'::jsonb, 'RAID: the build-up shows the raided player on the raider''s side only');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'RAID: Week 13 closes');
select pg_temp.expect((select winner_season_franchise_id = :'a' and home_points = 56.50 and away_points = 57.00 from public.matchups where id = :'g'), 'RAID: the lower seed wins 57.00 to 56.50; the card decided the game');
select pg_temp.expect((select count(*) = 1 from public.franchise_achievements fa join public.achievements x on x.id = fa.achievement_id where x.code = 'CHAOS_GIANT_KILLER' and fa.week = 13 and fa.franchise_id = (select franchise from teams where sf = :'a')), 'RAID: the existing Chaos Giant Killer award follows the adjusted result');
select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_grants where matchup_id = :'g'), 'RAID: an upset under another card grants no bounty');
select pg_temp.expect(public.chaos_clause_decision(:'ls', :'h', :'a')->'steps'->0 @> '{"home":56.50,"away":42.00,"outcome":"home","away_adjusted":57.00}', 'CHAOS CLAUSE: base totals decide (56.50 beats 42.00) although the adjusted result went the other way');
rollback;

-- No raid made yet: nothing is recorded before the deadline; the build-up shows the raid the system would make.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
select pg_temp.give_history('hb1', 30.00);
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 57.00] and pg_temp.cards(:'g')->>'card_code' = 'RAID' and (select count(*) = 0 from public.chaos_card_selections)
  and jsonb_array_length(pg_temp.cards(:'g')->'away'->'adjustments') = 1 and pg_temp.cards(:'g')->'away'->'adjustments'->0 @> jsonb_build_object('effect', 'raid', 'athlete_id', :'hb1', 'points', 15.00, 'automatic', true, 'locked_at', null, 'penalty', false)
  and pg_temp.cards(:'g')->'home'->'adjustments' = '[]'::jsonb,
  'NO SELECTION (changed 2026-10-04): before the deadline no raid is recorded; the build-up carries the raid the system WOULD make (hb1, the best-ranked bench player, not locked)');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'no raid: before the deadline the higher seed''s lineup is not restricted');
rollback;

-- ---------------------------------------------------------------------------
-- 5b. RAID: the AUTOMATIC raid, the PENALTY, and a raid made void by a drop
--     (owner decisions of 2026-10-04, third round). Seed 10 (A) is the raider.
--     Seed 1 (H) lends: bench hb1 (later game, 15.00) and hb2 (first game,
--     6.00); starters ranked hq (20.00 over 100.00), hrb (20.00 over 40.00),
--     hte 8.00, T1 D/ST 7.00, hk none. The deadline is the T1-T2 kickoff.
-- ---------------------------------------------------------------------------
create function pg_temp.raid_events() returns jsonb language sql as
$$ select jsonb_agg(jsonb_build_object('asset', coalesce(payload->>'athlete_id', payload->>'real_team_id'), 'automatic', payload->'automatic', 'penalty', payload->'penalty', 'actor', actor_user_id) order by payload->>'automatic', payload->>'athlete_id') from public.league_feed_events where event_type = 'chaos_raid' $$;

-- THE AUTOMATIC RAID AT THE DEADLINE.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
select pg_temp.expect(pg_temp.pick(:'g', :'a', 'raid') = :'hb1' || ' preview' and pg_temp.pick(:'g', :'h', 'raid') is null
  and public.chaos_auto_pick(:'g', :'a', 'raid') @> jsonb_build_object('penalty', false, 'basis', 'recent_average_v1', 'expected', 30.00, 'locked_at', null)
  and (public.chaos_auto_pick(:'g', :'a', 'raid')->>'deadline')::timestamptz = (select starts_at from public.real_games where week = 13 and home_team_id = :'t1')
  and (select array_agg(x->>'athlete_id' order by ord) from jsonb_array_elements(public.chaos_auto_pick(:'g', :'a', 'raid')->'compared') with ordinality t(x, ord)) = array[:'hb1', :'hb2'],
  'AUTOMATIC RAID preview: the best-ranked player on the HIGHER seed''s bench (hb1, 30.00, over hb2, 12.00), same ranking function; its deadline is the first Week 13 kickoff; the higher seed has no raid');
savepoint on_time;
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect(pg_temp.pick(:'g', :'a', 'raid') = :'hb1' || ' locked' and (select count(*) = 0 from public.chaos_card_selections), 'deadline: the automatic raid is due; scoring has not run, so nothing is recorded yet');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb2')) = 'The raid deadline has passed: raids close at the first Week 13 kickoff', 'deadline: the raider can no longer choose');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'a') = jsonb_build_object('asset', :'hb1', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'k1'::timestamptz, 'void', null, 'voided_at', null, 'penalty', false, 'replaced', null, 'compared', jsonb_build_array(:'hb1', :'hb2'))
  and (select count(*) = 1 from public.chaos_card_selections),
  'AUTOMATIC RAID AT THE DEADLINE: with no raid made, the system raids the best-ranked bench player (hb1): one row, source automatic, no user, recorded against the lender, locked at the deadline');
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 57.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hb1', 'points', 15.00, 'automatic', true, 'locked', true)) and pg_temp.lines(:'g', 'home') is null,
  'automatic raid, score: the raider gets 42.00 + 15.00 = 57.00, the lender keeps 56.50; the line says automatic');
select pg_temp.expect(pg_temp.raid_events() = jsonb_build_array(jsonb_build_object('asset', :'hb1', 'automatic', true, 'penalty', false, 'actor', null)), 'automatic raid: one feed event tells the league, marked automatic, with no acting user');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = 'Lineup locked: your Chaos Week opponent raided this player, so they cannot start for you in Week 13', 'automatic raid: the raided player cannot start for the lender, as with a named raid');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'a')) = 'Your raid is already made and cannot be changed', 'automatic raid: it is final');
create temp table raid_snap on commit drop as select pg_temp.snapshot(:'g') as s;
select public.recompute_matchup(:'g', false), public.recompute_matchup(:'g', false);
select pg_temp.expect((select pg_temp.snapshot(:'g') = s from raid_snap) and jsonb_array_length(pg_temp.raid_events()) = 1, 'IDEMPOTENT: scoring run twice more records nothing new and announces nothing twice');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'automatic raid: Week 13 closes');
select pg_temp.expect((select is_final and winner_season_franchise_id = :'a' and home_points = 56.50 and away_points = 57.00 from public.matchups where id = :'g'), 'AUTOMATIC RAID: final 56.50 to 57.00; the lower seed wins on a raid it never made itself');
rollback to savepoint on_time;

-- The job is late and the lender moves first: the raid is recorded from the bench as it stood at the deadline.
savepoint late_lender_moves;
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = 'Lineup locked: your Chaos Week opponent raided this player, so they cannot start for you in Week 13',
  'LATE JOB: after the deadline the lender tries to start hb1 before scoring has run; the automatic raid is applied first and the move is refused');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'TE')) = '' and pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb1', 'source', 'automatic', 'locked_at', :'k1'::timestamptz, 'compared', jsonb_build_array(:'hb1', :'hb2')),
  'LATE JOB: any other lineup move by the lender first records the automatic raid from the bench as it was (hb1; hte, benched by this move, is not compared)');
rollback to savepoint late_lender_moves;
savepoint late_lender_adds;
select pg_temp.give_history('fa', 40.00);
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) values (:'h', :'fa', 'free_agent');
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb1', 'source', 'automatic', 'locked_at', :'k1'::timestamptz, 'compared', jsonb_build_array(:'hb1', :'hb2')),
  'LATE JOB: a player the lender adds after the deadline (average 40.00) is not raided; the raid is recorded from the bench as it stood, before the roster changes');
rollback to savepoint late_lender_adds;
-- A raid made in time always wins over the automatic one.
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb2')) = '', 'named raid: the raider takes hb2 before the deadline');
select pg_temp.kickoff_at(:'t1', 3);
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb2', 'source', 'named', 'selected_by', :'ua') and pg_temp.points(:'g') = array[56.50, 48.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hb2', 'points', 6.00)),
  'A NAMED RAID ALWAYS WINS: after the deadline it stands (42.00 + 6.00), although the automatic raid would have taken hb1');
rollback;

-- THE PENALTY: a higher seed with no eligible bench player is raided for its best-ranked starter.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
select pg_temp.drop_player(:'h', :'hb1'), pg_temp.drop_player(:'h', :'hb2');
select pg_temp.expect(pg_temp.pick(:'g', :'a', 'raid') = :'hq' || ' preview penalty'
  and (select array_agg(coalesce(x->>'athlete_id', x->>'real_team_id') order by ord) from jsonb_array_elements(public.chaos_auto_pick(:'g', :'a', 'raid')->'compared') with ordinality t(x, ord)) = array[:'hq', :'hrb', :'hte', :'t1', :'hk'],
  'PENALTY: the higher seed has dropped its whole bench, so the raid takes its best-ranked STARTER (hq: 20.00, season total 100.00 over hrb''s 40.00), ranked by the same function among all its starters');
savepoint manual_penalty;
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hrb')) = 'Your opponent has no eligible bench player, so the raid takes their best-ranked starter. Only that starter can be raided'
  and pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, null, %L)', :'g', :'a', 'RAID', :'t1')) = 'Your opponent has no eligible bench player, so the raid takes their best-ranked starter. Only that starter can be raided'
  and pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'fa')) = 'Your opponent has no eligible bench player, so the raid takes their best-ranked starter. Only that starter can be raided',
  'PENALTY, manual: any other starter (or anyone else) is refused, with the reason');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hq')) = '', 'PENALTY, manual: the raider takes exactly that starter');
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hq', 'source', 'named', 'from', :'h', 'selected_by', :'ua', 'penalty', true, 'void', null) and (select locked_at is not null from public.chaos_card_selections where season_franchise_id = :'a')
  and pg_temp.raid_events() = jsonb_build_array(jsonb_build_object('asset', :'hq', 'automatic', false, 'penalty', true, 'actor', :'ua')),
  'PENALTY, manual: the raid is recorded as named, marked penalty, final at once, and announced as a penalty raid');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 62.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hq', 'points', 20.00, 'penalty', true)) and pg_temp.lines(:'g', 'home') is null
  and (pg_temp.cards(:'g')->'home'->>'base')::numeric = 56.50,
  'PENALTY, effect: the raider adds the starter''s 20.00 (42.00 + 20.00 = 62.00); the higher seed KEEPS him in its lineup and still scores him (56.50, no line)');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, null, null)', :'h', 'QB')) = '' and pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'QB', :'hq')) = '',
  'PENALTY: the taken starter is not locked out of the higher seed''s lineup (it may bench him and start him again before his kickoff)');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hrb')) = 'Your raid is already made and cannot be changed', 'PENALTY, manual: one raid, final');
rollback to savepoint manual_penalty;
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'a') = jsonb_build_object('asset', :'hq', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'k1'::timestamptz, 'void', null, 'voided_at', null, 'penalty', true, 'replaced', null, 'compared', jsonb_build_array(:'hq', :'hrb', :'hte', :'t1', :'hk')),
  'PENALTY, automatic: with no raid made and no bench to raid, at the deadline the system takes the best-ranked starter (hq), recorded as automatic and penalty');
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 62.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hq', 'points', 20.00, 'automatic', true, 'penalty', true, 'locked', true)) and pg_temp.lines(:'g', 'home') is null
  and pg_temp.raid_events() = jsonb_build_array(jsonb_build_object('asset', :'hq', 'automatic', true, 'penalty', true, 'actor', null)),
  'PENALTY, automatic, effect: 42.00 + 20.00 = 62.00 for the raider; 56.50 for the higher seed, which still scores him; announced as an automatic penalty raid');
rollback;
-- The penalty also applies when the bench is not empty but holds nobody whose game will be played.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
update public.athletes set real_team_id = '00000000-0000-0000-0000-0000000000e9' where id in (:'hb1', :'hb2');
select pg_temp.expect(pg_temp.pick(:'g', :'a', 'raid') = :'hq' || ' preview penalty', 'PENALTY: a bench made only of players on a bye (no Week 13 game) holds no ELIGIBLE player, so the penalty applies');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = 'Your opponent has no eligible bench player, so the raid takes their best-ranked starter. Only that starter can be raided', 'penalty: a bye player on that bench cannot be raided instead');
update public.athletes set real_team_id = :'t1' where id = :'hb2';
select pg_temp.expect(pg_temp.pick(:'g', :'a', 'raid') = :'hb2' || ' preview', 'no penalty: one eligible bench player is enough; the automatic raid takes him, never a starter');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hq')) = 'You can only raid the bench: that player is in your opponent''s starting lineup', 'no penalty: with an eligible bench player, a starter cannot be raided');
rollback;

-- THE RAIDED PLAYER IS DROPPED BY THE LENDER.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
select pg_temp.give_history('hb1', 30.00);
select pg_temp.give_history('hb2', 12.00);
savepoint before_deadline;
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = '', 'raid void: the raider takes hb1 before the deadline');
select pg_temp.drop_player(:'h', :'hb1') as dropped_hb1 \gset
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb1', 'source', 'named', 'void', 'dropped', 'voided_at', :'dropped_hb1'::timestamptz),
  'RAID VOID, BEFORE THE DEADLINE: the lender drops the raided player before his kickoff; the raid row is marked void at once');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 48.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hb2', 'points', 6.00, 'automatic', true, 'locked', false)),
  'raid void: the dropped player adds nothing; the build-up shows the raid the system would now make (hb2), not locked');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = 'That player is not on your opponent''s roster'
  and pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hq')) = 'You can only raid the bench: that player is in your opponent''s starting lineup',
  'RAID VOID, BEFORE THE DEADLINE: the raider may choose again, from the lender''s bench AS IT NOW STANDS (not the dropped player, not a starter)');
savepoint rechoose;
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb2')) = '', 'RAID VOID THEN RE-CHOOSE: the raider takes hb2');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb2', 'source', 'named', 'selected_by', :'ua', 'void', null, 'voided_at', null, 'penalty', false) and (select count(*) = 1 from public.chaos_card_selections)
  and pg_temp.points(:'g') = array[56.50, 48.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hb2', 'points', 6.00))
  and pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb2')) = 'Your raid is already made and cannot be changed',
  're-chosen: one row, named, not void, final again; 42.00 + 6.00 = 48.00');
rollback to savepoint rechoose;
-- The raider does not choose again: the automatic raid at the deadline.
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.sel(:'g', :'a') = jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'k1'::timestamptz, 'void', null, 'voided_at', null, 'penalty', false, 'replaced', :'hb1', 'compared', jsonb_build_array(:'hb2'))
  and pg_temp.points(:'g') = array[56.50, 48.00],
  'RAID VOID THEN AUTOMATIC: with no new choice by the deadline the system raids the best-ranked player of the bench as it stands then (hb2), at the deadline, recording the raid it replaced');
rollback to savepoint before_deadline;

savepoint after_deadline;
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = '', 'raid void after the deadline: the raider takes hb1 (later game) in time');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select public.recompute_matchup(:'g', false);
select pg_temp.drop_player(:'h', :'hb1', 2) as dropped_hb1 \gset
select pg_temp.expect(pg_temp.sel(:'g', :'a') = jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'dropped_hb1'::timestamptz, 'void', null, 'voided_at', null, 'penalty', false, 'replaced', :'hb1', 'compared', jsonb_build_array(:'hb2'))
  and :'dropped_hb1'::timestamptz > :'k1'::timestamptz,
  'RAID VOID, AFTER THE DEADLINE: the lender drops the raided player after the deadline and before his kickoff; the automatic rule applies AT ONCE, in the same statement as the drop: hb2, the best-ranked player of the bench as it then stands, locked at the time of the drop');
select pg_temp.expect(pg_temp.raid_events() = jsonb_build_array(jsonb_build_object('asset', :'hb1', 'automatic', false, 'penalty', false, 'actor', :'ua'), jsonb_build_object('asset', :'hb2', 'automatic', true, 'penalty', false, 'actor', null)), 'raid void after the deadline: the replacement raid is announced');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 48.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hb2', 'points', 6.00, 'automatic', true, 'locked', true))
  and pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb2')) = 'The raid deadline has passed: raids close at the first Week 13 kickoff',
  'raid void after the deadline: 42.00 + 6.00 = 48.00 (hb2 had already kicked off; the ranking reads nothing from Week 13); the raider cannot choose after the deadline');
-- A raided player dropped AFTER his own kickoff: the raid stands.
select pg_temp.drop_player(:'h', :'hb2', 0) as dropped_hb2 \gset
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb2', 'source', 'automatic', 'void', null), 'not void: hb2 is dropped AFTER his own kickoff, so the raid of hb2 stands');
rollback to savepoint after_deadline;

savepoint after_deadline_penalty;
select pg_temp.drop_player(:'h', :'hb2');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = '', 'void into penalty: the lender keeps one bench player (hb1), and the raider takes him');
select pg_temp.kickoff_at(:'t1', 3) as k1 \gset
select pg_temp.drop_player(:'h', :'hb1', 2) as dropped_hb1 \gset
select pg_temp.expect(pg_temp.sel(:'g', :'a') = jsonb_build_object('asset', :'hq', 'source', 'automatic', 'from', :'h', 'selected_by', null, 'locked_at', :'dropped_hb1'::timestamptz, 'void', null, 'voided_at', null, 'penalty', true, 'replaced', :'hb1', 'compared', jsonb_build_array(:'hq', :'hrb', :'hte', :'t1', :'hk')),
  'RAID VOID, AFTER THE DEADLINE, INTO THE PENALTY: the lender drops its last bench player to dodge the raid; at once the raid takes its best-ranked starter (hq) instead');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 62.00] and pg_temp.lines(:'g', 'away') = jsonb_build_array(jsonb_build_object('effect', 'raid', 'asset', :'hq', 'points', 20.00, 'automatic', true, 'penalty', true, 'locked', true)),
  'void into penalty, score: the raider gets 42.00 + 20.00 = 62.00 instead of the 15.00 the dodged raid would have added; the higher seed still scores hq (56.50)');
rollback to savepoint after_deadline_penalty;

-- The same through the real waiver function of this migration: the lender wins a claim and drops the raided player with it.
savepoint real_waiver_drop;
select pg_temp.give_history('fa', 40.00);
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'hb1')) = '', 'waiver drop: the raider takes hb1');
with hold as (insert into public.waiver_holds(league_season_id, athlete_id, clears_at) values (:'ls', :'fa', now() - interval '1 minute') returning id)
insert into public.waiver_claims(waiver_hold_id, season_franchise_id, drop_roster_entry_id) select hold.id, :'h', (select id from public.roster_entries where season_franchise_id = :'h' and athlete_id = :'hb1' and dropped_at is null) from hold;
select pg_temp.expect(public.process_due_waivers(:'ls') @> '{"status":"ok","claimed":1}', 'waiver drop: process_due_waivers awards the lender a free agent and drops hb1');
select pg_temp.expect(pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'hb1', 'source', 'named', 'void', 'dropped') and (select count(*) = 1 from public.roster_entries where season_franchise_id = :'h' and athlete_id = :'fa' and dropped_at is null)
  and pg_temp.pick(:'g', :'a', 'raid') = :'fa' || ' preview',
  'RAID VOID through process_due_waivers: the raid is void as soon as the waiver award drops the raided player; the raider chooses again from the bench as it now stands, which includes the player the lender just added (the automatic raid would take him)');
select pg_temp.expect(pg_temp.err_as(:'ua', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'a', 'RAID', :'fa')) = '' and pg_temp.sel(:'g', :'a') @> jsonb_build_object('asset', :'fa', 'source', 'named', 'void', null), 'waiver drop: the raider takes the newly added player');
rollback to savepoint real_waiver_drop;

-- The triggers FAIL OPEN: if the card bookkeeping raises, the roster or lineup change still goes through.
savepoint fail_open;
create or replace function public.chaos_sync_selections(p_matchup_id uuid) returns void language plpgsql set search_path = public as $$ begin raise exception 'simulated failure in the card bookkeeping'; end $$;
select pg_temp.kickoff_at(:'t1', 3);
update public.roster_entries set dropped_at = now() where season_franchise_id = :'h' and athlete_id = :'hb1' and dropped_at is null;
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via) values (:'h', :'fa', 'free_agent');
delete from public.lineups where season_franchise_id = :'h' and week = 13 and athlete_id = :'hte';
select pg_temp.expect((select count(*) = 1 from public.roster_entries where season_franchise_id = :'h' and athlete_id = :'hb1' and dropped_at is not null) and (select count(*) = 1 from public.roster_entries where season_franchise_id = :'h' and athlete_id = :'fa' and dropped_at is null)
  and (select count(*) = 0 from public.lineups where season_franchise_id = :'h' and week = 13 and athlete_id = :'hte') and (select count(*) = 0 from public.chaos_card_selections),
  'FAIL OPEN: with the card bookkeeping raising an error, a drop, an add and a lineup delete in a RAID game past its deadline all go through (the failure is a database WARNING); nothing is recorded by the failed calls');
select pg_temp.expect(pg_temp.error_of(format('select public.recompute_matchup(%L, false)', :'g')) = 'simulated failure in the card bookkeeping', 'fail open is for the triggers only: scoring itself does not hide the failure');
rollback to savepoint fail_open;
rollback;

-- ---------------------------------------------------------------------------
-- 6. Scoring twists. Same starters, same rule on both sides.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.deal();
create temp table twist_expected(code text, home numeric, away numeric, home_lines integer, away_lines integer, note text) on commit drop;
insert into twist_expected values
  ('TWIST_TE_DOUBLE',     64.50, 53.00, 1, 1, 'tight ends double: +8.00, +11.00'),
  ('TWIST_K_TRIPLE',      74.50, 54.00, 1, 1, 'kickers triple: +18.00, +12.00'),
  ('TWIST_DST_DOUBLE',    63.50, 41.00, 1, 1, 'D/ST double: +7.00, and a negative D/ST doubles too: -1.00'),
  ('TWIST_RUSH_DOUBLE',   70.00, 49.00, 2, 1, 'rushing double: +4.00 +9.50, +7.00'),
  ('TWIST_PASS_DOUBLE',   74.50, 58.00, 1, 1, 'passing double: +18.00, +16.00'),
  ('TWIST_FUMBLE_TRIPLE', 52.50, 42.00, 1, 0, 'fumbles lost triple: -4.00 more, nothing for a side with no fumble');
-- The card is forced BEFORE the check: the deal is random, and one deal in ten gives this game Captain (which made this check fail at random before 2026-10-04).
select pg_temp.force_card(:'g', 'TWIST_TE_DOUBLE');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = 'This matchup was dealt Tight End Takeover, not CAPTAIN', 'twist: a selection is refused in a matchup that was dealt another card');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'TWIST_TE_DOUBLE', :'hte')) = 'Tight End Takeover needs no selection', 'twist: a twist card takes no selection');
create function pg_temp.twist_result(p_matchup uuid, p_code text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.force_card(p_matchup, p_code);
  v := public.recompute_matchup(p_matchup, false);
  return jsonb_build_object('returned', jsonb_build_array(v->'home_points', v->'away_points'), 'stored', (select to_jsonb(pg_temp.points(p_matchup))),
    'bases', jsonb_build_array(pg_temp.cards(p_matchup)->'home'->'base', pg_temp.cards(p_matchup)->'away'->'base'),
    'lines', jsonb_build_array(jsonb_array_length(pg_temp.cards(p_matchup)->'home'->'adjustments'), jsonb_array_length(pg_temp.cards(p_matchup)->'away'->'adjustments')),
    'kind', pg_temp.cards(p_matchup)->'kind', 'code', pg_temp.cards(p_matchup)->'card_code');
end $$;
select pg_temp.expect(pg_temp.twist_result(:'g', t.code) = jsonb_build_object('returned', jsonb_build_array(t.home, t.away), 'stored', jsonb_build_array(t.home, t.away),
    'bases', jsonb_build_array(56.50, 42.00), 'lines', jsonb_build_array(t.home_lines, t.away_lines), 'kind', 'twist', 'code', t.code),
  format('TWIST %s: %s to %s, bases still 56.50 and 42.00 (%s)', t.code, t.home, t.away, t.note))
from twist_expected t order by t.code;
select pg_temp.force_card(:'g', 'TWIST_RUSH_DOUBLE');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.cards(:'g')->'home'->'adjustments' = jsonb_build_array(
  jsonb_build_object('effect', 'twist', 'athlete_id', :'hq', 'real_team_id', null, 'points', 4.00), jsonb_build_object('effect', 'twist', 'athlete_id', :'hrb', 'real_team_id', null, 'points', 9.50)), 'TWIST lines: one line per affected starter, in lineup order, bench players never included');
select pg_temp.force_card(:'g', 'TWIST_DST_DOUBLE');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.cards(:'g')->'away'->'adjustments' = jsonb_build_array(jsonb_build_object('effect', 'twist', 'athlete_id', null, 'real_team_id', :'t2', 'points', -1.00)), 'TWIST lines: a D/ST line names the team');
select pg_temp.expect((select sum(points) = 126.50 from public.fantasy_player_scores where week = 13 and athlete_id in (select id from cast_list)) and (select sum(points) = 6.00 from public.fantasy_team_scores where week = 13), 'TWISTS: fantasy_player_scores and fantasy_team_scores are unchanged after all six');
-- A draw attached to a game that is not a Chaos Week game is ignored.
update public.matchups set event_type = 'circuit' where id = :'g';
select pg_temp.expect((pg_temp.recompute(:'g', false, false)->'new'->>'home_points')::numeric = 56.50 and public.chaos_card_side_score(:'g', :'h')->>'card_code' is null, 'only event_type chaos is ever adjusted');
rollback;

-- ---------------------------------------------------------------------------
-- 7. BOUNTY and process_due_waivers. Uses the 5 v 6 and 3 v 8 games: seeds 6
--    and 8 are lower seeds, and seed 10 is the franchise normally first in line.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.deal();
select pg_temp.force_card(d.matchup_id, 'TWIST_TE_DOUBLE') from public.chaos_card_draws d;
select pg_temp.force_card(:'g5', 'BOUNTY');
select pg_temp.force_card(:'g3', 'BOUNTY');
update public.real_games set starts_at = now() + interval '9 days', state = 'scheduled' where week = 14;
update public.real_games set starts_at = now() + interval '16 days', state = 'scheduled' where week = 15;
select starts_at as week14_kickoff from public.real_games where week = 14 \gset
select starts_at as week15_kickoff from public.real_games where week = 15 \gset
-- The lower seeds of both bounty games win; in the 1 v 10 game seed 1 wins.
update public.fantasy_player_scores s set points = 150 from teams t where s.week = 13 and s.athlete_id = t.athlete and t.sf in (:'a5', :'a3');
update public.fantasy_player_scores s set points = 60 from teams t where s.week = 13 and s.athlete_id = t.athlete and t.sf in (:'h5', :'h3');
select public.recompute_matchup(:'g5', false);
select pg_temp.expect(pg_temp.points(:'g5') = array[60.00, 150.00] and pg_temp.cards(:'g5') @> '{"card_code":"BOUNTY","kind":"bounty","home":{"adjustments":[]},"away":{"adjustments":[]}}' and not (pg_temp.cards(:'g5') ? 'bounty'), 'BOUNTY: the card changes no score, and nothing is granted while the game is open');
select pg_temp.expect(pg_temp.err_as((select manager from teams where sf = :'a5'), format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g5', :'a5', 'BOUNTY', :'fa')) = 'Bounty needs no selection', 'BOUNTY: takes no selection');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'bounty: Week 13 closes');
select pg_temp.expect((select count(*) = 2 and bool_and(grant_kind = 'first' and source_week = 13 and effective_until = :'week14_kickoff'::timestamptz and effective_from <= now()) and array_agg(season_franchise_id order by season_franchise_id) = (select array_agg(x order by x) from unnest(array[:'a5'::uuid, :'a3'::uuid]) x) from public.chaos_bounty_grants),
  'BOUNTY, lower seed wins: each winning lower seed gets ONE recorded grant of kind first, in force until the last Week 14 kickoff');
select pg_temp.expect(pg_temp.cards(:'g5')->'bounty' @> jsonb_build_object('season_franchise_id', :'a5', 'grant', 'first') and (select count(*) = 2 and bool_and(body = 'Bounty earned' and payload->>'grant' = 'first') from public.league_feed_events where event_type = 'chaos_bounty_granted'), 'BOUNTY: the grant and its kind are recorded on the matchup and announced in the feed');
select public.recompute_matchup(:'g5', true), public.recompute_matchup(:'g5', false);
select pg_temp.expect((select count(*) = 2 from public.chaos_bounty_grants) and (select count(*) = 2 from public.league_feed_events where event_type = 'chaos_bounty_granted') and pg_temp.cards(:'g5')->'bounty'->>'season_franchise_id' = :'a5', 'STABLE: recomputing the finalized bounty game grants nothing twice and keeps the record');

-- Three claims on one free agent: seed 10 (normally first), and the two bounty holders.
create function pg_temp.claim_race(p_claimants uuid[], p_fn text default 'process_due_waivers') returns uuid language plpgsql as $$
declare v_hold uuid; v_winner uuid;
begin
  insert into public.waiver_holds(league_season_id, athlete_id, clears_at) values ((select ls from ids), (select id from cast_list where role = 'fa'), now() - interval '1 minute') returning id into v_hold;
  insert into public.waiver_claims(waiver_hold_id, season_franchise_id, created_at) select v_hold, c, now() - interval '1 hour' + (ord || ' minutes')::interval from unnest(p_claimants) with ordinality as t(c, ord);
  execute format('select public.%I($1)', p_fn) using (select ls from ids);
  select claimed_by_season_franchise_id into v_winner from public.waiver_holds where id = v_hold;
  -- Put the player back so the next race starts clean.
  delete from public.roster_entries where athlete_id = (select id from cast_list where role = 'fa');
  return v_winner;
end $$;
select pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[], 'process_due_waivers_before_cards') as normal_first \gset
select pg_temp.claim_race(array[:'a5', :'a3']::uuid[], 'process_due_waivers_before_cards') as normal_among_holders \gset
select pg_temp.expect(:'normal_first' = :'a', 'waiver fixture: by the normal inverse-standings rule seed 10 is first of the three');
select pg_temp.expect(pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[]) = :'normal_among_holders' and :'normal_among_holders' in (:'a5', :'a3'), 'BOUNTY honoured: a lower-seed winner is awarded the claim ahead of seed 10; between the two holders the normal rule decides');
select pg_temp.expect(pg_temp.claim_race(array[:'a', case when :'normal_among_holders' = :'a5' then :'a3' else :'a5' end]::uuid[]) <> :'a', 'BOUNTY honoured: the other holder also goes ahead of seed 10');
select pg_temp.expect(pg_temp.claim_race(array[:'a', :'h']::uuid[]) = pg_temp.claim_race(array[:'a', :'h']::uuid[], 'process_due_waivers_before_cards'), 'bounty: claims between franchises with no bounty keep their normal order');
-- THE BOUNTY WINDOW IS WEEK 14 ONLY (owner decision 2026-10-04). The grant ends
-- at the last Week 14 kickoff; Week 15's first game is a week later.
select pg_temp.expect((select bool_and(effective_until = :'week14_kickoff'::timestamptz and effective_until < :'week15_kickoff'::timestamptz) from public.chaos_bounty_grants)
  and :'week14_kickoff'::timestamptz = (select max(starts_at) from public.real_games where week = 14) and :'week15_kickoff'::timestamptz = (select min(starts_at) from public.real_games where week = 15),
  'BOUNTY WINDOW: every grant ends exactly at the last Week 14 kickoff, before Week 15 begins');
select pg_temp.expect((select count(*) = 10 and count(*) filter (where grant_kind = 'first') = 2 from public.chaos_bounty_waiver_order(:'ls', :'week14_kickoff'::timestamptz - interval '1 second'))
  and (select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls', :'week14_kickoff'::timestamptz))
  and (select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls', :'week14_kickoff'::timestamptz + interval '2 days'))
  and (select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls', :'week15_kickoff'::timestamptz - interval '1 hour'))
  and (select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls', :'week15_kickoff'::timestamptz + interval '1 day')),
  'BOUNTY WINDOW: the bounty order exists up to one second before the last Week 14 kickoff, and at no time from that kickoff on: not between Week 14 and Week 15, and not in Week 15');
-- Week 15 on the clock: the same grants, with the whole schedule ten days further in the past (the last Week 14 kickoff was yesterday).
update public.chaos_bounty_grants set effective_from = effective_from - interval '10 days', effective_until = effective_until - interval '10 days';
select pg_temp.expect((select bool_and(effective_until = :'week14_kickoff'::timestamptz - interval '10 days' and effective_until < now()) from public.chaos_bounty_grants) and (select count(*) = 2 from public.chaos_bounty_grants)
  and pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[]) = :'a' and (select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls')),
  'BOUNTY GRANT IGNORED IN WEEK 15: with both grants still on record, a waiver run after the last Week 14 kickoff uses the normal order (seed 10 first) and there is no bounty order');
update public.chaos_bounty_grants set effective_from = now() + interval '1 hour', effective_until = now() + interval '2 hours';
select pg_temp.expect(pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[]) = :'a' and (select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls')), 'BOUNTY: a grant that is not yet in force changes nothing either');
rollback;

-- The higher seed wins: it is paid too. A level game pays nobody.
begin;
select pg_temp.deal();
select pg_temp.force_card(d.matchup_id, 'BOUNTY') from public.chaos_card_draws d;
update public.fantasy_player_scores s set points = 100 from teams t where s.week = 13 and s.athlete_id = t.athlete and t.sf in (:'h3', :'a3');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'bounty fixture: Week 13 closes with every game under Bounty');
select pg_temp.expect((select winner_season_franchise_id = :'h' from public.matchups where id = :'g') and (select winner_season_franchise_id is null and is_final from public.matchups where id = :'g3'), 'bounty fixture: seed 1 beats seed 10, and the 3 v 8 game is level');
select pg_temp.expect((select count(*) = 1 and bool_and(season_franchise_id = :'h' and grant_kind = 'up_three' and source_week = 13) from public.chaos_bounty_grants where matchup_id = :'g')
  and pg_temp.cards(:'g')->'bounty' @> jsonb_build_object('season_franchise_id', :'h', 'grant', 'up_three')
  and (select count(*) = 1 from public.league_feed_events where event_type = 'chaos_bounty_granted' and payload->>'matchup_id' = :'g' and payload->>'grant' = 'up_three'),
  'BOUNTY, higher seed wins: the winning HIGHER seed gets one grant of kind up_three, recorded on the matchup and in the feed');
select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_grants where matchup_id = :'g3') and not (pg_temp.cards(:'g3') ? 'bounty'), 'BOUNTY, tie: a level Bounty game pays nobody');
select pg_temp.expect((select count(*) = 4 and count(*) = (select count(*) from public.matchups m where m.week = 13 and m.winner_season_franchise_id is not null)
    and bool_and(g.season_franchise_id = m.winner_season_franchise_id and g.grant_kind = case when m.winner_season_franchise_id = public.chaos_lower_seed(m.id) then 'first' else 'up_three' end)
  from public.chaos_bounty_grants g join public.matchups m on m.id = g.matchup_id),
  'BOUNTY: one grant per game that had a winner, always to the winner, first for a lower seed and up_three for a higher seed');
select public.recompute_matchup(:'g', true), public.recompute_matchup(:'g', false);
select pg_temp.expect((select count(*) = 4 from public.chaos_bounty_grants) and (select count(*) = 4 from public.league_feed_events where event_type = 'chaos_bounty_granted'), 'STABLE: recomputing a finalized higher-seed bounty game grants nothing twice');
rollback;

-- The exact Week 14 waiver order. Fixture surgery: the standings are set so the
-- NORMAL order is known (N1 claims first ... N10 last: N-n has n wins), and
-- grants are inserted directly. Every franchise claims the same free agent with
-- a roster limit of 0, so every claim fails "roster is full" and
-- process_due_waivers writes its priority_rank for all ten.
begin;
create temp table n on commit drop as select row_number() over (order by sf)::int as pos, sf from teams;
update public.standings s set wins = n.pos, losses = 13 - n.pos, ties = 0, points_for = 1000 from n where s.season_franchise_id = n.sf;
update public.league_seasons set roster_config = '{"starters":{},"bench":0}'::jsonb;
create function pg_temp.grant_bounty(p_pos integer, p_kind text) returns void language sql as $$
  insert into public.chaos_bounty_grants(league_season_id, season_franchise_id, matchup_id, source_week, grant_kind, effective_from, effective_until)
  select (select ls from ids), n.sf, (select m.id from public.matchups m where m.week = 13 and not exists (select 1 from public.chaos_bounty_grants g where g.matchup_id = m.id) order by m.id limit 1),
    13, p_kind, now() - interval '1 hour', now() + interval '7 days'
  from n where n.pos = p_pos
$$;
-- The order process_due_waivers gives ten claims, as normal positions. Claims are filed in REVERSE normal order.
create function pg_temp.waiver_ranks(p_fn text default 'process_due_waivers') returns integer[] language plpgsql as $$
declare v_hold uuid; v integer[];
begin
  insert into public.waiver_holds(league_season_id, athlete_id, clears_at) values ((select ls from ids), (select id from cast_list where role = 'fa'), now() - interval '1 minute') returning id into v_hold;
  insert into public.waiver_claims(waiver_hold_id, season_franchise_id, created_at) select v_hold, n.sf, now() - interval '1 hour' - (n.pos || ' minutes')::interval from n;
  execute format('select public.%I($1)', p_fn) using (select ls from ids);
  select array_agg(n.pos order by wc.priority_rank) into v from public.waiver_claims wc join n on n.sf = wc.season_franchise_id where wc.waiver_hold_id = v_hold and wc.priority_rank is not null and wc.status = 'failed';
  return v;
end $$;
create function pg_temp.bounty_order() returns integer[] language sql as
$$ select array_agg(n.pos order by o.waiver_position) from public.chaos_bounty_waiver_order((select ls from ids)) o join n on n.sf = o.season_franchise_id $$;

select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls')), 'bounty order: with no grant there is no bounty order at all');
select pg_temp.expect(pg_temp.waiver_ranks() = array[1,2,3,4,5,6,7,8,9,10] and pg_temp.waiver_ranks('process_due_waivers_before_cards') = array[1,2,3,4,5,6,7,8,9,10],
  'NO GRANTS: process_due_waivers ranks all ten claims in the normal order, exactly as the function of 20261003030000 does');

savepoint one_each;
select pg_temp.grant_bounty(8, 'first'), pg_temp.grant_bounty(6, 'up_three');
select pg_temp.expect(pg_temp.bounty_order() = array[8,1,2,6,3,4,5,7,9,10], 'BOUNTY ORDER, one upset winner (N8) and one favourite winner (N6) in a 10-team league: N8, N1, N2, N6, N3, N4, N5, N7, N9, N10');
select pg_temp.expect(pg_temp.waiver_ranks() = array[8,1,2,6,3,4,5,7,9,10], 'process_due_waivers HONOURS BOTH GRANT KINDS: ten claims are ranked N8, N1, N2, N6, N3, N4, N5, N7, N9, N10');
select pg_temp.expect(pg_temp.waiver_ranks('process_due_waivers_before_cards') = array[1,2,3,4,5,6,7,8,9,10], 'fixture check: the pre-cards function still gives the normal order for the same claims');
select pg_temp.expect((select array_agg(row(o.normal_position, o.grant_kind)::text order by o.waiver_position) = array['(8,first)','(1,)','(2,)','(6,up_three)','(3,)','(4,)','(5,)','(7,)','(9,)','(10,)'] from public.chaos_bounty_waiver_order(:'ls') o),
  'bounty order: each row reports the normal position and the grant kind');
update public.chaos_bounty_grants set effective_from = now() - interval '8 days', effective_until = now() - interval '1 second';
select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_waiver_order(:'ls')) and pg_temp.waiver_ranks() = array[1,2,3,4,5,6,7,8,9,10], 'ONE WEEK ONLY: once both grants have run out, process_due_waivers is back to the normal order');
rollback to savepoint one_each;

savepoint adjacent;
select pg_temp.grant_bounty(5, 'up_three'), pg_temp.grant_bounty(6, 'up_three');
select pg_temp.expect(pg_temp.bounty_order() = array[1,5,6,2,3,4,7,8,9,10] and pg_temp.waiver_ranks() = array[1,5,6,2,3,4,7,8,9,10],
  'BOUNTY ORDER, two favourite winners adjacent in the order (N5, N6): N1, N5, N6, N2, N3, N4, N7, N8, N9, N10 (each moves up three; N5 is processed first and stays ahead of N6)');
rollback to savepoint adjacent;

savepoint near_top;
select pg_temp.grant_bounty(2, 'up_three');
select pg_temp.expect(pg_temp.bounty_order() = array[2,1,3,4,5,6,7,8,9,10], 'bounty order: a favourite winner already in the top three (N2) moves to first when no lower-seed winner holds a bounty');
select pg_temp.grant_bounty(9, 'first');
select pg_temp.expect(pg_temp.bounty_order() = array[9,2,1,3,4,5,6,7,8,10] and pg_temp.waiver_ranks() = array[9,2,1,3,4,5,6,7,8,10], 'bounty order: it does NOT pass a lower-seed bounty winner (N9 first, then N2)');
rollback to savepoint near_top;

savepoint several;
select pg_temp.grant_bounty(9, 'first'), pg_temp.grant_bounty(4, 'first'), pg_temp.grant_bounty(10, 'up_three'), pg_temp.grant_bounty(3, 'up_three'), pg_temp.grant_bounty(7, 'up_three');
-- first: N4, N9. Rest: 1,2,3,5,6,7,8,10. N3 (third) to the top: 3,1,2,5,6,7,8,10. N7 (sixth) up three: 3,1,7,2,5,6,8,10. N10 (eighth) up three: 3,1,7,2,10,5,6,8.
select pg_temp.expect(pg_temp.bounty_order() = array[4,9,3,1,7,2,10,5,6,8] and pg_temp.waiver_ranks() = array[4,9,3,1,7,2,10,5,6,8],
  'BOUNTY ORDER, five grants: lower-seed winners first in normal order (N4, N9), then the rest with N3, N7, N10 each moved up three in normal-order sequence: N3, N1, N7, N2, N10, N5, N6, N8');
select pg_temp.expect(pg_temp.bounty_order() = pg_temp.bounty_order(), 'bounty order: deterministic');
rollback to savepoint several;

-- Level standings: with no grant, claim time decides exactly as before.
savepoint level;
update public.standings set wins = 6, losses = 7, ties = 0, points_for = 1000;
select pg_temp.expect(pg_temp.waiver_ranks() = array[10,9,8,7,6,5,4,3,2,1] and pg_temp.waiver_ranks('process_due_waivers_before_cards') = array[10,9,8,7,6,5,4,3,2,1], 'NO GRANTS, level standings: the earliest claim goes first in both versions (claims were filed in reverse order)');
rollback to savepoint level;
rollback;

-- The natural standings of the fixture, no surgery: both versions rank ten claims identically.
begin;
create temp table n on commit drop as select row_number() over (order by sf)::int as pos, sf from teams;
update public.league_seasons set roster_config = '{"starters":{},"bench":0}'::jsonb;
create function pg_temp.natural_ranks(p_fn text) returns uuid[] language plpgsql as $$
declare v_hold uuid; v uuid[];
begin
  insert into public.waiver_holds(league_season_id, athlete_id, clears_at) values ((select ls from ids), (select id from cast_list where role = 'fa'), now() - interval '1 minute') returning id into v_hold;
  insert into public.waiver_claims(waiver_hold_id, season_franchise_id, created_at) select v_hold, n.sf, now() - interval '1 hour' + (((n.pos * 7) % 10) || ' minutes')::interval from n;
  execute format('select public.%I($1)', p_fn) using (select ls from ids);
  select array_agg(wc.season_franchise_id order by wc.priority_rank) into v from public.waiver_claims wc where wc.waiver_hold_id = v_hold and wc.priority_rank is not null;
  return v;
end $$;
select pg_temp.expect(cardinality(pg_temp.natural_ranks('process_due_waivers')) = 10 and pg_temp.natural_ranks('process_due_waivers') = pg_temp.natural_ranks('process_due_waivers_before_cards'),
  'NO GRANTS, the fixture''s real standings after Week 12: process_due_waivers ranks all ten claims exactly as the function of 20261003030000 does');
rollback;

-- ---------------------------------------------------------------------------
-- 8. Other weeks and the postseason with cards dealt.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = '', 'season: seed 1 names a captain');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'season: Chaos Week closes with cards');
select pg_temp.expect(pg_temp.advance(14)->'result'->>'status' = 'created' and pg_temp.close_week(14) = 5, 'NON-CHAOS WEEK: Week 14 closes; old and new recompute_matchup agree on every call although cards exist in the league');
select pg_temp.expect((select bool_and(not (context ? 'chaos_cards')) from public.matchups where week <> 13), 'NON-CHAOS WEEKS: no matchup outside Week 13 carries anything about rule cards');
select pg_temp.expect(pg_temp.advance(15)->'result'->>'status' = 'created', 'season: postseason seeded from standings that include the adjusted Chaos Week totals');

-- A level quarterfinal between two franchises whose Chaos Week ORDER differs
-- between base and adjusted totals (fixture surgery on their Week 13 rows).
select id as qf, home_season_franchise_id as qh, away_season_franchise_id as qa from public.matchups where week = 15 and event_type = 'playoff_qf' order by id limit 1 \gset
update public.matchups m set
  home_points = case when m.home_season_franchise_id = :'qh' then 150 when m.home_season_franchise_id = :'qa' then 120 else m.home_points end,
  away_points = case when m.away_season_franchise_id = :'qh' then 150 when m.away_season_franchise_id = :'qa' then 120 else m.away_points end
  where m.week = 13 and (:'qh' in (m.home_season_franchise_id, m.away_season_franchise_id) or :'qa' in (m.home_season_franchise_id, m.away_season_franchise_id));
update public.matchups m set context = jsonb_set(m.context, array['chaos_cards', case when m.home_season_franchise_id = :'qh' then 'home' else 'away' end, 'base'], '90.00') where m.week = 13 and :'qh' in (m.home_season_franchise_id, m.away_season_franchise_id);
update public.matchups m set context = jsonb_set(m.context, array['chaos_cards', case when m.home_season_franchise_id = :'qa' then 'home' else 'away' end, 'base'], '100.00') where m.week = 13 and :'qa' in (m.home_season_franchise_id, m.away_season_franchise_id);
update public.fantasy_player_scores s set points = 100 from teams t where s.week = 15 and s.athlete_id = t.athlete and t.sf in (:'qh', :'qa');
select pg_temp.recompute(:'qf', true, false) as tied \gset
select pg_temp.expect((select is_final and home_points = away_points and winner_season_franchise_id = :'qa' from public.matchups where id = :'qf'), 'CHAOS CLAUSE: a level quarterfinal goes to the franchise with the higher BASE Chaos Week total (100.00 over 90.00), not the higher adjusted total (120.00 against 150.00)');
select pg_temp.expect((select context->'chaos_clause'->'steps'->0 = '{"step":"chaos_week","week":13,"home":90.00,"away":100.00,"outcome":"away","basis":"base_lineup_total","home_adjusted":150.00,"away_adjusted":120.00}'::jsonb and context->'chaos_clause'->>'decided_by' = 'chaos_week' from public.matchups where id = :'qf'),
  'CHAOS CLAUSE: the step records the basis and both numbers for both sides');
select pg_temp.expect(pg_temp.close_week(15, false) = 3 and pg_temp.advance(16)->'result'->>'status' = 'created', 'season: Week 15 closes and Week 16 is generated');
rollback;

select pg_temp.expect((select n = 120 from compared), 'equivalence: 120 recompute_matchup calls of the base season (Weeks 1-12, open and finalizing) were run through both versions with identical results; the rolled-back scenarios compared 30 more (Week 13 with no card, Week 13 with the league season not opted in, Week 14 with cards dealt)');
select pg_temp.expect((select count(*) = 65 and count(*) filter (where is_final) = 60 from public.matchups) and (select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_selections) and (select count(*) = 0 from public.chaos_bounty_grants),
  'every scenario rolled back: the base state is intact and holds no cards');

\echo ALL CHAOS WEEK RULE CARD TESTS PASSED
