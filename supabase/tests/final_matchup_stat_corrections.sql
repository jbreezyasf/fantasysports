-- Executable test for 20261005010000_final_matchup_stat_corrections.sql.
--
-- Run against an EMPTY throwaway Postgres database, never production:
--
--   createdb big_exec_test
--   psql -v ON_ERROR_STOP=1 -d big_exec_test -f supabase/tests/final_matchup_stat_corrections.sql
--
-- Same tables, production function bodies and synthetic season as
-- chaos_clause_tiebreak.sql. Every scenario runs in a transaction that is
-- rolled back.

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
create table public.ops_audit_events (id uuid default gen_random_uuid() primary key, actor_user_id uuid, action text not null, target_type text not null, target_id text, metadata jsonb default '{}'::jsonb not null, created_at timestamp with time zone default now() not null);
\ir ../migrations/20261004010000_chaos_clause_tiebreak.sql
\ir ../migrations/20261005010000_final_matchup_stat_corrections.sql

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
select pg_temp.expect(pg_temp.close_week(14) = 5, 'base: Week 14 closes');
select pg_temp.expect(pg_temp.advance(15)->'result'->>'status' = 'created', 'base: postseason seeded, Week 15 created');

create function pg_temp.correct(p_week integer) returns jsonb language sql as
$$ select public.system_correct_final_matchups((select ls from ids), p_week) $$;
-- A franchise's starter scores this many points in a week (a late stat arriving).
create function pg_temp.set_score(p_sf uuid, p_week integer, p_points numeric) returns void language sql as
$$ update public.fantasy_player_scores s set points = p_points from teams t where t.sf = p_sf and s.athlete_id = t.athlete and s.week = p_week $$;
create function pg_temp.all_standings() returns jsonb language sql as
$$ select jsonb_agg(to_jsonb(s) order by s.season_franchise_id) from public.standings s $$;
-- Standings rebuilt independently from the final matchups (valid here: this league has no other source).
create function pg_temp.derived() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('sf', sf, 'w', w, 'l', l, 't', t, 'pf', pf, 'pa', pa) order by sf) from (
    select sf, sum(w) w, sum(l) l, sum(t) t, sum(pf) pf, sum(pa) pa from (
      select home_season_franchise_id sf, (winner_season_franchise_id = home_season_franchise_id)::int w, (winner_season_franchise_id = away_season_franchise_id)::int l, (winner_season_franchise_id is null)::int t, home_points pf, away_points pa from public.matchups where is_final
      union all
      select away_season_franchise_id, (winner_season_franchise_id = away_season_franchise_id)::int, (winner_season_franchise_id = home_season_franchise_id)::int, (winner_season_franchise_id is null)::int, away_points, home_points from public.matchups where is_final) x group by sf) y
$$;
create function pg_temp.stored() returns jsonb language sql as
$$ select jsonb_agg(jsonb_build_object('sf', season_franchise_id, 'w', wins, 'l', losses, 't', ties, 'pf', points_for, 'pa', points_against) order by season_franchise_id) from public.standings $$;
-- The streak a franchise should have, from its final games, newest first.
create function pg_temp.streak_of(p_sf uuid) returns integer language plpgsql as $$
declare r record; s integer := 0; o integer;
begin
  for r in select winner_season_franchise_id w from public.matchups where is_final and p_sf in (home_season_franchise_id, away_season_franchise_id) order by week desc loop
    o := case when r.w is null then 0 when r.w = p_sf then 1 else -1 end;
    if o = 0 then exit; elsif s = 0 then s := o; elsif sign(s) = o then s := s + o; else exit; end if;
  end loop;
  return s;
end $$;

select pg_temp.expect(pg_temp.stored() = pg_temp.derived(), 'base: stored standings equal the standings derived from final games');
select pg_temp.expect(not has_function_privilege('anon', 'public.system_correct_final_matchups(uuid, integer)', 'execute') and not has_function_privilege('authenticated', 'public.system_correct_final_matchups(uuid, integer)', 'execute')
  and has_function_privilege('service_role', 'public.system_correct_final_matchups(uuid, integer)', 'execute'), 'only the service role may run corrections');

-- Nothing changed: nothing is written.
begin;
create temp table s0 on commit drop as select pg_temp.all_standings() s, (select jsonb_agg(to_jsonb(m) order by id) from public.matchups m) m, (select count(*) from public.league_feed_events) f, (select count(*) from public.ops_audit_events) a;
select pg_temp.correct(2) as r2, pg_temp.correct(3) as r3 \gset
select pg_temp.expect((:'r2'::jsonb->>'corrected')::int = 0 and (:'r2'::jsonb->>'checked')::int = 5 and (:'r3'::jsonb->>'corrected')::int = 0, 'no stat changed: five games checked, none corrected');
select pg_temp.expect((select s = pg_temp.all_standings() and m = (select jsonb_agg(to_jsonb(x) order by id) from public.matchups x) and f = (select count(*) from public.league_feed_events) and a = (select count(*) from public.ops_audit_events) from s0), 'no stat changed: standings, matchups, feed and audit are untouched');
rollback;

-- A signed-in user cannot run it, commissioner included.
begin;
select set_config('request.jwt.claim.sub', (select commissioner::text from ids), true);
select pg_temp.expect(pg_temp.error_of(format('select public.system_correct_final_matchups(%L::uuid, 2)', (select ls from ids))) like '%system only%', 'a commissioner cannot run a correction');
rollback;

-- The winner gains points (the Weeks 2-3 kicker case): totals and points move, the result does not.
begin;
select pg_temp.game(2, 'circuit') as g \gset
select winner_season_franchise_id as w, case when winner_season_franchise_id = home_season_franchise_id then away_season_franchise_id else home_season_franchise_id end as l,
       case when winner_season_franchise_id = home_season_franchise_id then home_points else away_points end as wp from public.matchups where id = :'g' \gset
create temp table b on commit drop as select pg_temp.standing(:'w') w, pg_temp.standing(:'l') l, (select jsonb_agg(to_jsonb(s) order by s.season_franchise_id) from public.standings s where s.season_franchise_id not in (:'w', :'l')) others;
select pg_temp.set_score(:'w', 2, :wp + 9);
select pg_temp.correct(2) as r \gset
select pg_temp.expect((:'r'::jsonb->>'corrected')::int = 1 and (:'r'::jsonb->>'results_changed')::int = 0, 'winner gains 9 points: one game corrected, no result changed');
select pg_temp.expect((select winner_season_franchise_id = :'w' and is_final and greatest(home_points, away_points) = :wp + 9 and jsonb_array_length(context->'stat_corrections') = 1 from public.matchups where id = :'g'), 'the matchup shows the new total, the same winner and one correction record');
select pg_temp.expect((select (pg_temp.standing(:'w')->>'points_for')::numeric = (w->>'points_for')::numeric + 9 and (pg_temp.standing(:'l')->>'points_against')::numeric = (l->>'points_against')::numeric + 9
  and pg_temp.standing(:'w') - 'points_for' = w - 'points_for' and pg_temp.standing(:'l') - 'points_against' = l - 'points_against' from b), 'standings: only points for (winner) and points against (loser) move, by 9');
select pg_temp.expect((select others = (select jsonb_agg(to_jsonb(s) order by s.season_franchise_id) from public.standings s where s.season_franchise_id not in (:'w', :'l')) from b), 'no other franchise is touched');
select pg_temp.expect(pg_temp.stored() = pg_temp.derived(), 'stored standings still equal the derived standings');
select pg_temp.expect((select count(*) = 1 from public.ops_audit_events where action = 'matchup_stat_correction' and target_id = :'g') and (select count(*) = 1 from public.league_feed_events where event_type = 'matchup_corrected' and payload->>'matchup_id' = :'g'), 'one audit record and one league feed entry');
select pg_temp.correct(2) as r \gset
select pg_temp.expect((:'r'::jsonb->>'corrected')::int = 0 and (select count(*) = 1 from public.ops_audit_events) and pg_temp.stored() = pg_temp.derived(), 'running it again changes nothing');
rollback;

-- The loser gains enough to win: the result flips.
begin;
select pg_temp.game(3, 'circuit') as g \gset
select winner_season_franchise_id as w, case when winner_season_franchise_id = home_season_franchise_id then away_season_franchise_id else home_season_franchise_id end as l,
       greatest(home_points, away_points) as wp from public.matchups where id = :'g' \gset
create temp table b on commit drop as select pg_temp.standing(:'w') w, pg_temp.standing(:'l') l;
select pg_temp.set_score(:'l', 3, :wp + 1);
select pg_temp.correct(3) as r \gset
select pg_temp.expect((:'r'::jsonb->>'corrected')::int = 1 and (:'r'::jsonb->>'results_changed')::int = 1, 'loser now outscores the winner: one result changed');
select pg_temp.expect((select winner_season_franchise_id = :'l' from public.matchups where id = :'g'), 'the matchup winner is now the other franchise');
select pg_temp.expect((select (pg_temp.standing(:'w')->>'wins')::int = (w->>'wins')::int - 1 and (pg_temp.standing(:'w')->>'losses')::int = (w->>'losses')::int + 1
  and (pg_temp.standing(:'l')->>'wins')::int = (l->>'wins')::int + 1 and (pg_temp.standing(:'l')->>'losses')::int = (l->>'losses')::int - 1 from b), 'standings: the win and the loss swap');
select pg_temp.expect(pg_temp.stored() = pg_temp.derived(), 'stored standings equal the derived standings after a flipped result');
select pg_temp.expect((pg_temp.standing(:'w')->>'streak')::int = pg_temp.streak_of(:'w') and (pg_temp.standing(:'l')->>'streak')::int = pg_temp.streak_of(:'l'), 'both streaks are rebuilt from the final games');
select pg_temp.expect((select body like '%result changed%' from public.league_feed_events where event_type = 'matchup_corrected'), 'the feed entry says the result changed');
rollback;

-- A regular-season game becomes level: a tie, no winner.
begin;
select pg_temp.game(4, 'circuit') as g \gset
select home_season_franchise_id as h, away_season_franchise_id as a from public.matchups where id = :'g' \gset
select pg_temp.make_level(:'g');
select pg_temp.correct(4) as r \gset
select pg_temp.expect((:'r'::jsonb->>'results_changed')::int = 1 and (select winner_season_franchise_id is null and home_points = 100 and away_points = 100 from public.matchups where id = :'g'), 'corrected to level in the regular season: no winner');
select pg_temp.expect((pg_temp.standing(:'h')->>'ties')::int = 1 and (pg_temp.standing(:'a')->>'ties')::int = 1 and pg_temp.stored() = pg_temp.derived() and (pg_temp.standing(:'h')->>'streak')::int = pg_temp.streak_of(:'h'), 'both get a tie; standings and streak agree with the games');
rollback;

-- An open week is never touched.
begin;
select pg_temp.set_score(sf, 15, 500) from teams where n = 1;
select pg_temp.correct(15) as r \gset
select pg_temp.expect((:'r'::jsonb->>'checked')::int = 0 and (select bool_and(not is_final and home_points = 0 and away_points = 0) from public.matchups where week = 15), 'a week that is not final is skipped');
rollback;

-- A postseason game corrected to level is decided by the Chaos Clause.
begin;
select pg_temp.expect(pg_temp.close_week(15) = 4, 'Week 15 closes');
select pg_temp.game(15, 'playoff_qf') as g \gset
select pg_temp.make_level(:'g');
select pg_temp.correct(15) as r \gset
select pg_temp.expect((select winner_season_franchise_id is not null and winner_season_franchise_id = (context->'chaos_clause'->>'winner_season_franchise_id')::uuid and home_points = away_points from public.matchups where id = :'g'), 'a quarterfinal corrected to level gets its winner from the Chaos Clause, recorded on the matchup');
rollback;

select pg_temp.expect((select count(*) = 0 from public.ops_audit_events) and (select count(*) = 0 from public.league_feed_events where event_type = 'matchup_corrected') and pg_temp.stored() = pg_temp.derived(), 'every scenario rolled back: the base state is intact');

\echo ALL STAT CORRECTION TESTS PASSED
