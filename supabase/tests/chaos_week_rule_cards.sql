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
create function pg_temp.deal() returns jsonb language sql as
$$ select public.deal_chaos_week_cards((select ls from ids), 13) $$;
create function pg_temp.kickoff(p_home_team uuid) returns void language sql as
$$ update public.real_games set starts_at = now() - interval '1 hour', state = 'in_progress' where week = 13 and home_team_id = p_home_team $$;
create function pg_temp.finish_week13() returns void language sql as
$$ update public.real_games set starts_at = now() - interval '5 hours', state = 'final' where week = 13 $$;

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
  = array['WILD_SLOT','TWIST_DST_DOUBLE','TWIST_TE_DOUBLE','TWIST_PASS_DOUBLE','RAID','UPSET_BOUNTY','TWIST_K_TRIPLE','TWIST_RUSH_DOUBLE','CAPTAIN','TWIST_FUMBLE_TRIPLE'],
  'deal order: a fixed seed gives the order computed independently (sha256 in Node) outside the database');
select pg_temp.expect(public.chaos_card_deal_order('big-exec-audit-seed-0002', (select array_agg(code order by code) from public.chaos_cards))
  = array['TWIST_TE_DOUBLE','TWIST_DST_DOUBLE','TWIST_PASS_DOUBLE','TWIST_K_TRIPLE','TWIST_RUSH_DOUBLE','TWIST_FUMBLE_TRIPLE','RAID','CAPTAIN','UPSET_BOUNTY','WILD_SLOT'],
  'deal order: a different seed gives a different, equally reproducible order');
select pg_temp.expect(public.chaos_card_deal_order('s', array['B','A','C']) = public.chaos_card_deal_order('s', array['C','B','A']), 'deal order: does not depend on the order the deck is passed in');
select pg_temp.expect((select count(*) = 10 and count(*) filter (where kind = 'twist') = 6 and bool_and(length(name_es) > 0 and length(rules_es) > 0 and length(rules_en) > 0) from public.chaos_cards), 'deck: 10 active cards (4 named cards, 6 scoring twists), each with English and Spanish name and rules');

begin;
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
select pg_temp.expect((select count(*) = 13 and bool_and(exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('chaos_asset_game_started','chaos_week_first_kickoff','chaos_lower_seed','chaos_card_deal_order','chaos_card_side_score','deal_chaos_week_cards','audit_chaos_week_deal','set_chaos_card_selection','clear_chaos_card_selection','chaos_clause_decision','recompute_matchup','set_lineup_slot','process_due_waivers')),
  'every function this migration creates or replaces has a fixed search_path');
select pg_temp.expect((select bool_and(c.relrowsecurity) and count(*) = 5 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relname in ('chaos_cards','chaos_card_deals','chaos_card_draws','chaos_card_selections','chaos_bounty_grants')), 'RLS is enabled on all five new tables');
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
select pg_temp.expect(pg_temp.points(:'g') = array[63.50, 42.00] and pg_temp.cards(:'g')->'away' = '{"base":42.00,"adjustments":[],"total":42.00}'::jsonb, 'NO SELECTION: the side that names no captain gets no bonus (42.00); D/ST captain adds 7.00');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hrb')) = '', 'captain: switch to the running back');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'RB', :'hb2')) = '', 'captain: the manager benches the captain before kickoff (normal lineup move)');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[50.00, 42.00] and pg_temp.cards(:'g')->'home' = '{"base":50.00,"adjustments":[],"total":50.00}'::jsonb, 'captain moved to the bench: no bonus, and the base follows the new lineup (56.50 - 12.50 + 6.00)');
select pg_temp.kickoff(:'t1');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = '', 'captain moved to the bench: that choice no longer counts, so a new captain who has not kicked off can still be named');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[58.00, 42.00], 'new captain: 50.00 + 8.00');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.clear_chaos_card_selection(%L, %L)', :'g', :'h')) = '', 'captain: a captain who has not kicked off can be cleared');
select pg_temp.expect((select count(*) = 0 from public.chaos_card_selections), 'captain: clearing removes the selection row');
rollback;

-- A postponed game never locks a selection and adds nothing. A withdrawn deal leaves no trace on an open game.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'CAPTAIN');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hte')) = '', 'postponed: the captain plays in the T3-T4 game');
update public.real_games set state = 'postponed', starts_at = now() - interval '1 hour' where week = 13 and home_team_id = :'t3';
delete from public.fantasy_player_scores where week = 13 and athlete_id = :'hte';
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[48.50, 42.00] and pg_temp.cards(:'g')->'home' = jsonb_build_object('base', 48.50, 'adjustments', jsonb_build_array(jsonb_build_object('effect', 'captain', 'athlete_id', :'hte', 'real_team_id', null, 'points', 0.00)), 'total', 48.50)
  and (select locked_at is null from public.chaos_card_selections where season_franchise_id = :'h'), 'POSTPONED: a captain whose game is postponed has no score, adds 0.00, and is not locked');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) = '', 'POSTPONED: the captain can still be changed to a starter whose game has not kicked off');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[68.50, 42.00], 'postponed: new captain counts (48.50 + 20.00)');
delete from public.chaos_card_deals;
select pg_temp.expect((select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_selections), 'withdrawn deal: deleting the deal row removes its draws and selections');
select pg_temp.recompute(:'g', false, false) as withdrawn \gset
select pg_temp.expect(pg_temp.points(:'g') = array[48.50, 42.00] and pg_temp.cards(:'g') is null and (:'withdrawn'::jsonb->'new') = (:'withdrawn'::jsonb->'old'), 'withdrawn deal: the next recompute scores the lineup total, removes the stale build-up, and returns what the pre-cards function returns');
rollback;

-- ---------------------------------------------------------------------------
-- 4. WILD SLOT.
-- ---------------------------------------------------------------------------
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

-- A kicked-off player cannot be picked; no pick means no points.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'WILD_SLOT');
select pg_temp.kickoff(:'t3');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb1')) = 'That player''s game has already started', 'LOCK wild slot: a player whose game has kicked off cannot be picked');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'WILD_SLOT', :'hb2')) = '', 'wild slot: a bench player whose game has not kicked off can still be picked');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[62.50, 42.00], 'NO SELECTION: 56.50 + 6.00 for the side that picked; 42.00 for the side that never picked');
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

-- No raid made: nothing happens.
begin;
select pg_temp.deal();
select pg_temp.force_card(:'g', 'RAID');
select public.recompute_matchup(:'g', false);
select pg_temp.expect(pg_temp.points(:'g') = array[56.50, 42.00] and pg_temp.cards(:'g')->>'card_code' = 'RAID' and pg_temp.cards(:'g')->'away'->'adjustments' = '[]'::jsonb, 'NO SELECTION: no raid made means base totals, and the card is still recorded');
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_lineup_slot(%L, 13, %L, 1, %L, null)', :'h', 'WR', :'hb1')) = '', 'no raid: the higher seed''s lineup is not restricted');
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
select pg_temp.expect(pg_temp.err_as(:'uh', format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g', :'h', 'CAPTAIN', :'hq')) like 'This matchup was dealt % not CAPTAIN', 'twist: a selection is refused in a matchup that was dealt another card');
select pg_temp.force_card(:'g', 'TWIST_TE_DOUBLE');
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
-- 7. UPSET BOUNTY and process_due_waivers. Uses the 5 v 6 game: seed 6 is the
--    lower seed, and seed 10 is the franchise that is normally first in line.
-- ---------------------------------------------------------------------------
begin;
select pg_temp.deal();
select pg_temp.force_card(d.matchup_id, 'TWIST_TE_DOUBLE') from public.chaos_card_draws d;
select pg_temp.force_card(:'g5', 'UPSET_BOUNTY');
select pg_temp.force_card(:'g3', 'UPSET_BOUNTY');
update public.real_games set starts_at = now() + interval '9 days', state = 'scheduled' where week = 14;
select starts_at as week14_kickoff from public.real_games where week = 14 \gset
-- The lower seeds of both bounty games win; in the 1 v 10 game seed 1 wins.
update public.fantasy_player_scores s set points = 150 from teams t where s.week = 13 and s.athlete_id = t.athlete and t.sf in (:'a5', :'a3');
update public.fantasy_player_scores s set points = 60 from teams t where s.week = 13 and s.athlete_id = t.athlete and t.sf in (:'h5', :'h3');
select public.recompute_matchup(:'g5', false);
select pg_temp.expect(pg_temp.points(:'g5') = array[60.00, 150.00] and pg_temp.cards(:'g5') @> '{"card_code":"UPSET_BOUNTY","kind":"bounty","home":{"adjustments":[]},"away":{"adjustments":[]}}' and not (pg_temp.cards(:'g5') ? 'bounty'), 'UPSET BOUNTY: the card changes no score, and nothing is granted while the game is open');
select pg_temp.expect(pg_temp.err_as((select manager from teams where sf = :'a5'), format('select public.set_chaos_card_selection(%L, %L, %L, %L)', :'g5', :'a5', 'UPSET_BOUNTY', :'fa')) = 'Upset Bounty needs no selection', 'UPSET BOUNTY: takes no selection');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'bounty: Week 13 closes');
select pg_temp.expect((select count(*) = 2 and bool_and(source_week = 13 and effective_until = :'week14_kickoff'::timestamptz and effective_from <= now()) and array_agg(season_franchise_id order by season_franchise_id) = (select array_agg(x order by x) from unnest(array[:'a5'::uuid, :'a3'::uuid]) x) from public.chaos_bounty_grants),
  'UPSET BOUNTY: each winning lower seed gets ONE recorded grant, in force until the last Week 14 kickoff');
select pg_temp.expect(pg_temp.cards(:'g5')->'bounty'->>'season_franchise_id' = :'a5' and (select count(*) = 2 from public.league_feed_events where event_type = 'chaos_bounty_granted'), 'UPSET BOUNTY: the grant is recorded on the matchup and announced in the feed');
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
select pg_temp.expect(pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[]) = :'normal_among_holders' and :'normal_among_holders' in (:'a5', :'a3'), 'UPSET BOUNTY honoured: a bounty holder is awarded the claim ahead of seed 10; between the two holders the normal rule decides');
select pg_temp.expect(pg_temp.claim_race(array[:'a', case when :'normal_among_holders' = :'a5' then :'a3' else :'a5' end]::uuid[]) <> :'a', 'UPSET BOUNTY honoured: the other holder also goes ahead of seed 10');
select pg_temp.expect(pg_temp.claim_race(array[:'a', :'h']::uuid[]) = pg_temp.claim_race(array[:'a', :'h']::uuid[], 'process_due_waivers_before_cards'), 'bounty: claims between franchises with no bounty are ordered exactly as before');
-- The week is over: the grant is no longer in force.
update public.chaos_bounty_grants set effective_from = now() - interval '8 days', effective_until = now() - interval '1 second';
select pg_temp.expect(pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[]) = :'a', 'UPSET BOUNTY lasts exactly one window: after effective_until the normal order is back (seed 10 first)');
update public.chaos_bounty_grants set effective_from = now() + interval '1 hour', effective_until = now() + interval '2 hours';
select pg_temp.expect(pg_temp.claim_race(array[:'a5', :'a3', :'a']::uuid[]) = :'a', 'UPSET BOUNTY: a grant that is not yet in force changes nothing either');
rollback;

-- The higher seed wins, or the game is level: no bounty.
begin;
select pg_temp.deal();
select pg_temp.force_card(d.matchup_id, 'UPSET_BOUNTY') from public.chaos_card_draws d;
update public.fantasy_player_scores s set points = 100 from teams t where s.week = 13 and s.athlete_id = t.athlete and t.sf in (:'h3', :'a3');
select pg_temp.finish_week13();
select pg_temp.expect(pg_temp.close_week(13, false) = 5, 'bounty fixture: Week 13 closes with every game under Upset Bounty');
select pg_temp.expect((select winner_season_franchise_id = :'h' from public.matchups where id = :'g') and (select winner_season_franchise_id is null and is_final from public.matchups where id = :'g3'), 'bounty fixture: seed 1 beats seed 10, and the 3 v 8 game is level');
select pg_temp.expect((select count(*) = 0 from public.chaos_bounty_grants where matchup_id in (:'g', :'g3')) and not (pg_temp.cards(:'g') ? 'bounty'), 'UPSET BOUNTY: no grant when the higher seed wins or the game is tied');
select pg_temp.expect((select count(*) = (select count(*) from public.matchups m where m.week = 13 and m.winner_season_franchise_id = public.chaos_lower_seed(m.id)) from public.chaos_bounty_grants), 'UPSET BOUNTY: grants exist for exactly the games a lower seed won');
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

select pg_temp.expect((select n = 120 from compared), 'equivalence: 120 recompute_matchup calls of the base season (Weeks 1-12, open and finalizing) were run through both versions with identical results; the rolled-back scenarios compared 20 more (Week 13 with no card, Week 14 with cards dealt)');
select pg_temp.expect((select count(*) = 65 and count(*) filter (where is_final) = 60 from public.matchups) and (select count(*) = 0 from public.chaos_card_draws) and (select count(*) = 0 from public.chaos_card_selections) and (select count(*) = 0 from public.chaos_bounty_grants),
  'every scenario rolled back: the base state is intact and holds no cards');

\echo ALL CHAOS WEEK RULE CARD TESTS PASSED
