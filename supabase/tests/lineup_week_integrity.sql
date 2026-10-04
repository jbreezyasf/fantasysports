-- Executable regression test for 20261003030000_lineup_week_integrity.sql.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/lineup_week_integrity.sql
--
-- The table shapes below were generated from the production catalog on
-- 2026-10-02 (columns, types and defaults only). Roster Integrity is stubbed
-- to "allowed" because it is not what this test exercises.

\set ON_ERROR_STOP 1
set client_min_messages = warning;

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
create table public.athletes (id uuid default gen_random_uuid() not null, competition_id uuid not null, real_team_id uuid, display_name text not null, "position" text not null, active boolean default true not null, injury_status text, updated_at timestamp with time zone default now() not null);
create table public.franchise_owners (franchise_id uuid not null, user_id uuid not null, starts_on date default CURRENT_DATE not null, ends_on date);
create table public.franchises (id uuid default gen_random_uuid() not null, league_id uuid not null, name text not null, abbreviation text, primary_color text, secondary_color text, established_year integer not null, created_at timestamp with time zone default now() not null, avatar_key text default 'classic'::text not null);
create table public.league_feed_events (id uuid default gen_random_uuid() not null, league_id uuid not null, season_id uuid, actor_user_id uuid, event_type text not null, body text, payload jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);
create table public.league_seasons (id uuid default gen_random_uuid() not null, league_id uuid not null, competition_season_id uuid not null, status text default 'setup'::text not null, roster_config jsonb not null, scoring_profile_id uuid, trade_deadline_at timestamp with time zone, waiver_period_hours integer default 48 not null, is_current boolean default true not null);
create table public.lineup_move_audit (id uuid default gen_random_uuid() not null, league_season_id uuid not null, season_franchise_id uuid not null, actor_user_id uuid, week integer not null, slot lineup_slot not null, slot_index integer default 1 not null, previous_athlete_id uuid, previous_real_team_id uuid, new_athlete_id uuid, new_real_team_id uuid, outcome text default 'applied'::text not null, reason text, created_at timestamp with time zone default now() not null);
create table public.lineups (id uuid default gen_random_uuid() not null, season_franchise_id uuid not null, week integer not null, athlete_id uuid, slot lineup_slot not null, locked_at timestamp with time zone, real_team_id uuid, slot_index integer default 1 not null);
create unique index lineups_unique_slot_index on public.lineups (season_franchise_id, week, slot, slot_index);
create table public.matchups (id uuid default gen_random_uuid() not null, league_season_id uuid not null, week integer not null, home_season_franchise_id uuid not null, away_season_franchise_id uuid not null, event_type text default 'circuit'::text not null, home_points numeric(8,2) default 0 not null, away_points numeric(8,2) default 0 not null, winner_season_franchise_id uuid, is_final boolean default false not null, context jsonb default '{}'::jsonb not null, result_source text default 'LIVE'::text not null, simulated_reason text, result_published_at timestamp with time zone);
create table public.real_games (id uuid default gen_random_uuid() not null, competition_season_id uuid not null, provider_game_id text, week integer, home_team_id uuid, away_team_id uuid, starts_at timestamp with time zone not null, state game_state default 'scheduled'::game_state not null, home_score integer, away_score integer, updated_at timestamp with time zone default now() not null);
create table public.roster_entries (id uuid default gen_random_uuid() not null, season_franchise_id uuid not null, athlete_id uuid, acquired_via text not null, added_at timestamp with time zone default now() not null, dropped_at timestamp with time zone, real_team_id uuid);
create table public.season_franchises (id uuid default gen_random_uuid() not null, league_season_id uuid not null, franchise_id uuid not null, draft_position integer, roster_locked_at timestamp with time zone, roster_lock_reason text);
create table public.standings (league_season_id uuid not null, season_franchise_id uuid not null, wins integer default 0 not null, losses integer default 0 not null, ties integer default 0 not null, points_for numeric(10,2) default 0 not null, points_against numeric(10,2) default 0 not null, streak integer default 0 not null);
create table public.waiver_claims (id uuid default gen_random_uuid() not null, waiver_hold_id uuid not null, season_franchise_id uuid not null, drop_roster_entry_id uuid, status text default 'pending'::text not null, priority_rank integer, created_at timestamp with time zone default now() not null, resolved_at timestamp with time zone, failure_reason text);
create table public.waiver_holds (id uuid default gen_random_uuid() not null, league_season_id uuid not null, athlete_id uuid, real_team_id uuid, source_roster_entry_id uuid, source_season_franchise_id uuid, starts_at timestamp with time zone default now() not null, clears_at timestamp with time zone not null, status text default 'open'::text not null, claimed_by_season_franchise_id uuid, resolved_at timestamp with time zone);

-- Production definition of the live-week lock (unchanged by this migration).
create function public.roster_asset_game_has_started(p_roster_entry_id uuid)
returns boolean language sql stable set search_path = public as $fn$
  with asset as (
    select re.season_franchise_id, coalesce(a.real_team_id, re.real_team_id) as real_team_id, ls.competition_season_id
    from public.roster_entries re
    join public.season_franchises sf on sf.id = re.season_franchise_id
    join public.league_seasons ls on ls.id = sf.league_season_id
    left join public.athletes a on a.id = re.athlete_id
    where re.id = p_roster_entry_id and re.dropped_at is null
  ),
  active_week as (
    select rg.week from public.real_games rg
    join asset x on x.competition_season_id = rg.competition_season_id
    group by rg.week
    having min(rg.starts_at) <= now()
       and bool_or(coalesce(rg.state::text, 'unknown') not in ('final', 'canceled', 'postponed'))
    order by rg.week desc limit 1
  )
  select coalesce(exists (
    select 1 from asset x join active_week w on true
    join public.real_games rg on rg.competition_season_id = x.competition_season_id and rg.week = w.week
     and (rg.home_team_id = x.real_team_id or rg.away_team_id = x.real_team_id)
    where rg.starts_at <= now() and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
  ), false);
$fn$;

create function public.prevent_started_roster_asset_drop() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if old.dropped_at is not null or new.dropped_at is null then return new; end if;
  if public.roster_asset_game_has_started(old.id) then
    raise exception 'This roster asset is locked because its game has started';
  end if;
  return new;
end $fn$;
create trigger roster_entries_prevent_started_drop before update of dropped_at on public.roster_entries
  for each row execute function public.prevent_started_roster_asset_drop();

create function public.evaluate_roster_integrity_drop(uuid, text) returns jsonb
language sql stable as $$ select jsonb_build_object('allowed', true) $$;
create function public.consume_roster_integrity_override(uuid) returns uuid
language sql as $$ select null::uuid $$;

\ir ../migrations/20261003030000_lineup_week_integrity.sql

-- ---------------------------------------------------------------------------
-- Fixture: week 1 complete, week 2 live (T1-T2 kicked off, T3-T4 tomorrow),
-- week 3 in the future.
-- ---------------------------------------------------------------------------
create temp table ids as select
  '00000000-0000-0000-0000-0000000000c1'::uuid as cs,
  '00000000-0000-0000-0000-0000000000a1'::uuid as league,
  '00000000-0000-0000-0000-0000000000b1'::uuid as ls,
  '00000000-0000-0000-0000-0000000000f1'::uuid as f1, '00000000-0000-0000-0000-0000000000f2'::uuid as f2,
  '00000000-0000-0000-0000-0000000005f1'::uuid as sf1, '00000000-0000-0000-0000-0000000005f2'::uuid as sf2,
  '00000000-0000-0000-0000-000000000001'::uuid as u1, '00000000-0000-0000-0000-000000000002'::uuid as u2,
  '00000000-0000-0000-0000-0000000000e1'::uuid as t1, '00000000-0000-0000-0000-0000000000e2'::uuid as t2,
  '00000000-0000-0000-0000-0000000000e3'::uuid as t3, '00000000-0000-0000-0000-0000000000e4'::uuid as t4,
  '00000000-0000-0000-0000-0000000000d1'::uuid as qb_t1,   -- kicked off in week 2
  '00000000-0000-0000-0000-0000000000d2'::uuid as wr_t3,   -- plays tomorrow
  '00000000-0000-0000-0000-0000000000d3'::uuid as wr_t4,   -- plays tomorrow
  '00000000-0000-0000-0000-0000000000d4'::uuid as qb_t3,   -- plays tomorrow
  '00000000-0000-0000-0000-0000000000d9'::uuid as fa_wr;   -- free agent
grant select on ids to public;

insert into public.league_seasons(id, league_id, competition_season_id, roster_config)
  select ls, league, cs, '{"starters":{"QB":1,"WR":2},"bench":1}'::jsonb from ids;
insert into public.franchises(id, league_id, name, established_year) select f1, league, 'One', 2026 from ids union all select f2, league, 'Two', 2026 from ids;
insert into public.season_franchises(id, league_season_id, franchise_id, draft_position) select sf1, ls, f1, 1 from ids union all select sf2, ls, f2, 2 from ids;
insert into public.franchise_owners(franchise_id, user_id) select f1, u1 from ids union all select f2, u2 from ids;
insert into public.standings(league_season_id, season_franchise_id) select ls, sf1 from ids union all select ls, sf2 from ids;
insert into public.athletes(id, competition_id, real_team_id, display_name, "position")
  select qb_t1, cs, t1, 'QB T1', 'QB' from ids union all
  select wr_t3, cs, t3, 'WR T3', 'WR' from ids union all
  select wr_t4, cs, t4, 'WR T4', 'WR' from ids union all
  select qb_t3, cs, t3, 'QB T3', 'QB' from ids union all
  select fa_wr, cs, t4, 'FA WR', 'WR' from ids;
insert into public.roster_entries(season_franchise_id, athlete_id, acquired_via)
  select sf1, qb_t1, 'draft' from ids union all select sf1, wr_t3, 'draft' from ids union all
  select sf1, wr_t4, 'draft' from ids union all select sf1, qb_t3, 'draft' from ids;
insert into public.real_games(competition_season_id, week, home_team_id, away_team_id, starts_at, state)
  select cs, 1, t1, t2, now() - interval '8 days', 'final'::game_state from ids union all
  select cs, 1, t3, t4, now() - interval '7 days', 'final' from ids union all
  select cs, 2, t1, t2, now() - interval '1 hour', 'in_progress' from ids union all
  select cs, 2, t3, t4, now() + interval '1 day', 'scheduled' from ids union all
  select cs, 3, t1, t2, now() + interval '7 days', 'scheduled' from ids union all
  select cs, 3, t3, t4, now() + interval '8 days', 'scheduled' from ids;
insert into public.lineups(season_franchise_id, week, athlete_id, slot, slot_index)
  select sf1, 1, qb_t3, 'QB'::lineup_slot, 1 from ids union all select sf1, 1, wr_t3, 'WR', 1 from ids union all
  select sf1, 2, qb_t1, 'QB', 1 from ids union all select sf1, 2, wr_t3, 'WR', 1 from ids union all
  select sf1, 3, wr_t3, 'WR', 1 from ids;

create function pg_temp.expect_error(p_sql text, p_like text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ilike p_like then raise notice 'PASS %', p_label; return; end if;
    raise exception 'FAIL %: wrong error: %', p_label, sqlerrm;
  end;
  raise exception 'FAIL %: statement succeeded but should have been rejected', p_label;
end $$;
create function pg_temp.expect(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'PASS %', p_label; else raise exception 'FAIL %', p_label; end if;
end $$;

set client_min_messages = notice;
select set_config('test.uid', (select u1::text from ids), false);

-- Completed week: no edits, even with players whose live-week game has not started.
select pg_temp.expect_error(
  format($q$select public.set_lineup_slot('%s', 1, 'QB', 1, null, null)$q$, (select sf1 from ids)),
  '%Week 1 is complete%', 'completed week cannot be cleared');
select pg_temp.expect_error(
  format($q$select public.set_lineup_slot('%s', 1, 'WR', 2, '%s', null)$q$, (select sf1 from ids), (select wr_t4 from ids)),
  '%Week 1 is complete%', 'completed week cannot gain a starter');

-- Live week: kicked-off player is locked both ways, others still movable.
select pg_temp.expect_error(
  format($q$select public.set_lineup_slot('%s', 2, 'QB', 1, '%s', null)$q$, (select sf1 from ids), (select qb_t3 from ids)),
  '%currently in this slot has already started%', 'live week: started starter cannot be benched');
select pg_temp.expect(
  (public.set_lineup_slot((select sf1 from ids), 2, 'WR', 1, (select wr_t4 from ids), null)->>'status') = 'set',
  'live week: not-yet-started players can still be swapped');

-- Future week: this week's kickoff does not lock next week's lineup.
select pg_temp.expect(
  (public.set_lineup_slot((select sf1 from ids), 3, 'QB', 1, (select qb_t1 from ids), null)->>'status') = 'set',
  'future week: a player who kicked off this week can be set for next week');

-- Ownership is still enforced.
select set_config('test.uid', (select u2::text from ids), false);
select pg_temp.expect_error(
  format($q$select public.set_lineup_slot('%s', 3, 'QB', 1, null, null)$q$, (select sf1 from ids)),
  '%Not your franchise%', 'another manager cannot edit the lineup');
select set_config('test.uid', (select u1::text from ids), false);

-- Between weeks: every week-2 game is final, week 3 has not started.
update public.real_games set state = 'final', starts_at = now() - interval '2 hours' where week = 2;
select pg_temp.expect_error(
  format($q$select public.set_lineup_slot('%s', 2, 'WR', 1, '%s', null)$q$, (select sf1 from ids), (select wr_t3 from ids)),
  '%Week 2 is complete%', 'between weeks: the week just played is locked');
select pg_temp.expect(
  (public.set_lineup_slot((select sf1 from ids), 3, 'WR', 2, (select wr_t4 from ids), null)->>'status') = 'set',
  'between weeks: next week is editable');

-- A drop keeps completed weeks and clears only open weeks.
select pg_temp.expect(
  public.claim_free_agent((select sf1 from ids), (select fa_wr from ids), null,
    (select re.id from public.roster_entries re, ids where re.athlete_id = ids.wr_t3 and re.dropped_at is null)) is not null,
  'free-agent swap succeeds between weeks');
select pg_temp.expect(
  (select count(*) from public.lineups l, ids where l.athlete_id = ids.wr_t3 and l.week = 1) = 1,
  'drop keeps the dropped player in the completed week 1 lineup');
select pg_temp.expect(
  (select count(*) from public.lineups l, ids where l.athlete_id = ids.wr_t3 and l.week = 3) = 0,
  'drop removes the dropped player from the open week 3 lineup');

-- Same rule when the drop happens through a waiver award.
insert into public.waiver_claims(waiver_hold_id, season_franchise_id, drop_roster_entry_id)
  select wh.id, ids.sf1, re.id
  from public.waiver_holds wh, ids, public.roster_entries re
  where wh.athlete_id = ids.wr_t3 and re.athlete_id = ids.wr_t4 and re.dropped_at is null;
update public.waiver_holds set clears_at = now() - interval '1 minute';
select pg_temp.expect(
  (public.process_due_waivers((select ls from ids))->>'claimed')::int = 1, 'waiver claim is awarded');
select pg_temp.expect(
  (select count(*) from public.lineups l, ids where l.athlete_id = ids.wr_t4 and l.week = 2) = 1,
  'waiver drop keeps the dropped player in the completed week 2 lineup');
select pg_temp.expect(
  (select count(*) from public.lineups l, ids where l.athlete_id = ids.wr_t4 and l.week = 3) = 0,
  'waiver drop removes the dropped player from the open week 3 lineup');

-- A league-finalized matchup closes the week even if real games are not final.
insert into public.matchups(league_season_id, week, home_season_franchise_id, away_season_franchise_id, is_final)
  select ls, 3, sf1, sf2, true from ids;
select pg_temp.expect_error(
  format($q$select public.set_lineup_slot('%s', 3, 'QB', 1, null, null)$q$, (select sf1 from ids)),
  '%Week 3 is complete%', 'a finalized league matchup locks that week');

-- A week whose only games are postponed or canceled is not treated as complete.
insert into public.real_games(competition_season_id, week, home_team_id, away_team_id, starts_at, state)
  select cs, 4, t1, t2, now() - interval '1 hour', 'postponed'::game_state from ids;
select pg_temp.expect(not public.lineup_week_is_closed((select ls from ids), 4), 'postponed-only week stays open');
select pg_temp.expect(not public.lineup_week_is_closed((select ls from ids), 9), 'week with no games stays open');

\echo ALL LINEUP WEEK INTEGRITY TESTS PASSED
