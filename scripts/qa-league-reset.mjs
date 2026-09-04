#!/usr/bin/env node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const FIXTURE_VERSION = 'big_exec_qa_10_manager_history_v1';
const LEAGUE_NAME = 'BIG EXEC QA 10-MANAGER HISTORY LAB';
const EMAILS = [
  'juanita.brazziel+qa-commissioner@gmail.com',
  'juanita.brazziel+qa-manager-01@gmail.com',
  'juanita.brazziel+qa-manager-02@gmail.com',
  'juanita.brazziel+qa-manager-03@gmail.com',
  'juanita.brazziel+qa-manager-04@gmail.com',
  'juanita.brazziel+qa-manager-05@gmail.com',
  'juanita.brazziel+qa-manager-06@gmail.com',
  'juanita.brazziel+qa-manager-07@gmail.com',
  'juanita.brazziel+qa-manager-08@gmail.com',
  'juanita.brazziel+qa-manager-09@gmail.com',
];

const sqlStringArray = (values) => `array[${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(',')}]::text[]`;

const sql = `
begin;

do $$
declare
  v_expected_emails text[] := ${sqlStringArray(EMAILS)};
  v_found integer;
  v_missing text;
begin
  select count(*) into v_found from auth.users where email = any(v_expected_emails);
  if v_found <> 10 then
    select string_agg(email, ', ' order by email) into v_missing
    from unnest(v_expected_emails) email
    where not exists (select 1 from auth.users u where u.email = email);
    raise exception 'Expected 10 existing QA Auth users for %, found %. Missing: %', '${FIXTURE_VERSION}', v_found, coalesce(v_missing, 'unknown');
  end if;
end $$;

create temp table qa_actor_input(
  actor_index integer primary key,
  email text not null,
  label text not null,
  role member_role not null,
  franchise_name text not null,
  abbreviation text not null,
  primary_color text not null,
  secondary_color text not null
) on commit drop;

insert into qa_actor_input values
  (0,'${EMAILS[0]}','Commissioner','commissioner','Crown City Dynasty','CCD','#D4AF37','#111111'),
  (1,'${EMAILS[1]}','Manager01','manager','Riverfront Renegades','RFR','#2563EB','#F8FAFC'),
  (2,'${EMAILS[2]}','Manager02','manager','Summit Operators','SMO','#059669','#ECFDF5'),
  (3,'${EMAILS[3]}','Manager03','manager','Midnight Brokers','MDB','#7C3AED','#F5F3FF'),
  (4,'${EMAILS[4]}','Manager04','manager','Ironwood Index','IWI','#DC2626','#FFF7ED'),
  (5,'${EMAILS[5]}','Manager05','manager','Harbor Kings','HBK','#0891B2','#F0FDFA'),
  (6,'${EMAILS[6]}','Manager06','manager','Atlas Afterburn','ATA','#EA580C','#FFFBEB'),
  (7,'${EMAILS[7]}','Manager07','manager','Liberty Ledger','LBL','#4F46E5','#EEF2FF'),
  (8,'${EMAILS[8]}','Manager08','manager','Victory Vault','VVL','#16A34A','#F7FEE7'),
  (9,'${EMAILS[9]}','Manager09','manager','Basement Boardroom','BSB','#6B7280','#F9FAFB');

create temp table qa_actors as
select i.*, u.id as user_id
from qa_actor_input i
join auth.users u on u.email = i.email;

insert into public.user_profiles(user_id, display_name, avatar_key)
select user_id, label, 'qa_fixture'
from qa_actors
on conflict (user_id) do update set display_name = excluded.display_name, avatar_key = excluded.avatar_key, updated_at = now();

do $$
declare
  v_league_ids uuid[];
begin
  select array_agg(id) into v_league_ids from public.fantasy_leagues where name = '${LEAGUE_NAME.replaceAll("'", "''")}';
  if v_league_ids is null then
    return;
  end if;

  if to_regclass('public.recap_scenes') is not null then
    delete from public.recap_scenes where recap_script_id in (select id from public.recap_scripts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  end if;
  if to_regclass('public.recap_render_jobs') is not null then
    delete from public.recap_render_jobs where recap_script_id in (select id from public.recap_scripts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  end if;
  if to_regclass('public.recap_scripts') is not null then
    delete from public.recap_scripts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  end if;
  if to_regclass('public.generated_messages') is not null then
    delete from public.generated_messages where matchup_id in (select id from public.matchups where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  end if;
  if to_regclass('public.feed_reactions') is not null then
    delete from public.feed_reactions where event_id in (select id from public.league_feed_events where league_id = any(v_league_ids));
  end if;
  if to_regclass('public.story_events') is not null then
    delete from public.story_events where league_id = any(v_league_ids);
  end if;
  if to_regclass('public.weekly_awards') is not null then
    delete from public.weekly_awards where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  end if;
  if to_regclass('public.roster_integrity_overrides') is not null then
    delete from public.roster_integrity_overrides where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  end if;
  if to_regclass('public.roster_integrity_reviews') is not null then
    delete from public.roster_integrity_reviews where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  end if;
  if to_regclass('public.roster_integrity_audit') is not null then
    delete from public.roster_integrity_audit where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  end if;
  if to_regclass('public.postseason_seeds') is not null then
    delete from public.postseason_seeds where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  end if;
  delete from public.trade_messages where trade_id in (select id from public.trades where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  delete from public.trade_items where trade_id in (select id from public.trades where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  delete from public.trades where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.waiver_claims where waiver_hold_id in (select id from public.waiver_holds where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  delete from public.waiver_holds where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.lineups where season_franchise_id in (select id from public.season_franchises where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  delete from public.roster_entries where season_franchise_id in (select id from public.season_franchises where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  if to_regclass('public.draft_queues') is not null then
    delete from public.draft_queues where draft_id in (select id from public.drafts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  end if;
  if to_regclass('public.draft_corrections') is not null then
    delete from public.draft_corrections where draft_id in (select id from public.drafts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  end if;
  delete from public.draft_picks where draft_id in (select id from public.drafts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids)));
  delete from public.drafts where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.championships where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.matchups where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.standings where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.franchise_stadium_features where stadium_id in (select s.id from public.stadiums s join public.franchises f on f.id = s.franchise_id where f.league_id = any(v_league_ids));
  delete from public.franchise_achievements where franchise_id in (select id from public.franchises where league_id = any(v_league_ids));
  delete from public.stadiums where franchise_id in (select id from public.franchises where league_id = any(v_league_ids));
  delete from public.rivalries where league_id = any(v_league_ids);
  delete from public.season_franchises where league_season_id in (select id from public.league_seasons where league_id = any(v_league_ids));
  delete from public.league_feed_events where league_id = any(v_league_ids);
  delete from public.franchise_owners where franchise_id in (select id from public.franchises where league_id = any(v_league_ids));
  delete from public.franchises where league_id = any(v_league_ids);
  delete from public.league_members where league_id = any(v_league_ids);
  delete from public.league_seasons where league_id = any(v_league_ids);
  delete from public.fantasy_leagues where id = any(v_league_ids);
end $$;

create temp table qa_refs(league_id uuid, competition_id uuid, scoring_profile_id uuid) on commit drop;

create temp table qa_new_league as
with inserted as (
  insert into public.fantasy_leagues(name, created_by, draft_min_franchises, max_franchises)
  select '${LEAGUE_NAME.replaceAll("'", "''")}', user_id, 10, 10 from qa_actors where actor_index = 0
  returning id
)
select id from inserted;

insert into qa_refs(league_id, competition_id, scoring_profile_id)
select qnl.id, c.id, sp.id
from qa_new_league qnl
cross join public.competitions c
left join lateral (
  select id from public.scoring_profiles
  where is_system_default = true
  order by name
  limit 1
) sp on true
where c.code = 'pro_football'
limit 1;

do $$
begin
  if not exists (select 1 from qa_refs where competition_id is not null) then
    raise exception 'Cannot build QA league: pro_football competition not found';
  end if;
end $$;

insert into public.competition_seasons(competition_id, season_year, starts_on, ends_on)
select r.competition_id, y, make_date(y, 9, 1), make_date(y + 1, 1, 31)
from qa_refs r, generate_series(2021, 2026) y
where not exists (
  select 1 from public.competition_seasons cs
  where cs.competition_id = r.competition_id and cs.season_year = y
);

create temp table qa_league_seasons as
with inserted as (
  insert into public.league_seasons(
    league_id,
    competition_season_id,
    status,
    roster_config,
    scoring_profile_id,
    trade_deadline_at,
    waiver_period_hours,
    is_current,
    roster_integrity_mode,
    roster_integrity_bulk_drop_limit,
    roster_integrity_bulk_window_hours,
    roster_integrity_protect_core_assets,
    roster_integrity_lock_eliminated
  )
  select
    r.league_id,
    cs.id,
    case when cs.season_year = 2026 then 'setup' else 'complete' end,
    '{"slots":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1,"BENCH":6},"fixture":"${FIXTURE_VERSION}"}'::jsonb,
    r.scoring_profile_id,
    make_timestamptz(cs.season_year, 11, 10, 12, 0, 0, 'America/Chicago'),
    48,
    cs.season_year = 2026,
    'automatic',
    3,
    24,
    true,
    true
  from qa_refs r
  join public.competition_seasons cs on cs.competition_id = r.competition_id and cs.season_year between 2021 and 2026
  returning id, league_id, competition_season_id, is_current
)
select id, league_id, competition_season_id, is_current from inserted;

alter table qa_league_seasons add column season_year integer;
update qa_league_seasons q
set season_year = cs.season_year
from public.competition_seasons cs
where cs.id = q.competition_season_id;

create temp table qa_franchises as
with inserted as (
  insert into public.franchises(league_id, name, abbreviation, primary_color, secondary_color, established_year)
  select r.league_id, a.franchise_name, a.abbreviation, a.primary_color, a.secondary_color, 2021
  from qa_refs r
  join qa_actors a on true
  order by a.actor_index
  returning id, league_id, name, abbreviation
)
select id, league_id, name, abbreviation from inserted;

alter table qa_franchises add column actor_index integer;
update qa_franchises f
set actor_index = a.actor_index
from qa_actors a
where a.franchise_name = f.name;

insert into public.league_members(league_id, user_id, role, joined_at)
select r.league_id, a.user_id, a.role, now()
from qa_refs r
join qa_actors a on true;

insert into public.franchise_owners(franchise_id, user_id, starts_on, ends_on)
select f.id, a.user_id, date '2021-01-01', null
from qa_franchises f
join qa_actors a using(actor_index);

insert into public.stadiums(franchise_id, environment_key)
select id, 'starter' from qa_franchises
on conflict (franchise_id) do nothing;

create temp table qa_season_franchises as
with inserted as (
  insert into public.season_franchises(league_season_id, franchise_id, draft_position)
  select ls.id, f.id, f.actor_index + 1
  from qa_league_seasons ls
  join qa_franchises f on true
  returning id, league_season_id, franchise_id, draft_position
)
select id, league_season_id, franchise_id, draft_position from inserted;

alter table qa_season_franchises add column actor_index integer;
alter table qa_season_franchises add column season_year integer;
update qa_season_franchises sf
set actor_index = f.actor_index, season_year = ls.season_year
from qa_franchises f, qa_league_seasons ls
where f.id = sf.franchise_id and ls.id = sf.league_season_id;

create temp table qa_results(season_year integer, actor_index integer, wins integer, losses integer, ties integer, points_for numeric, points_against numeric, seed integer, final_finish integer) on commit drop;
insert into qa_results values
  (2021,0,11,3,0,1694.4,1458.2,1,1),(2021,1,9,5,0,1587.6,1498.9,2,2),(2021,2,8,6,0,1512.8,1501.1,3,4),(2021,3,8,6,0,1505.5,1488.4,4,3),(2021,4,7,7,0,1460.9,1472.8,5,5),(2021,5,7,7,0,1449.2,1468.3,6,6),(2021,6,6,8,0,1402.4,1495.2,7,7),(2021,7,6,8,0,1398.7,1502.6,8,8),(2021,8,5,9,0,1340.3,1535.8,9,9),(2021,9,3,11,0,1268.5,1598.8,10,10),
  (2022,0,10,4,0,1651.0,1452.3,1,3),(2022,1,8,6,0,1510.2,1508.9,4,5),(2022,2,11,3,0,1712.6,1411.0,2,1),(2022,3,9,5,0,1601.8,1472.2,3,2),(2022,4,7,7,0,1490.4,1496.8,5,4),(2022,5,6,8,0,1391.4,1522.1,7,7),(2022,6,7,7,0,1430.9,1488.2,6,6),(2022,7,5,9,0,1328.2,1550.5,8,8),(2022,8,4,10,0,1301.7,1588.1,9,9),(2022,9,3,11,0,1248.9,1616.3,10,10),
  (2023,0,12,2,0,1744.1,1399.4,1,1),(2023,1,9,5,0,1594.6,1482.0,3,3),(2023,2,8,6,0,1522.3,1496.2,5,5),(2023,3,10,4,0,1668.2,1440.9,2,2),(2023,4,8,6,0,1508.7,1502.3,4,4),(2023,5,6,8,0,1384.9,1538.6,8,8),(2023,6,7,7,0,1450.0,1498.0,6,6),(2023,7,6,8,0,1400.5,1530.4,7,7),(2023,8,4,10,0,1289.7,1591.6,9,10),(2023,9,4,10,0,1308.3,1589.9,10,9),
  (2024,0,9,5,0,1602.1,1501.0,4,4),(2024,1,10,4,0,1655.3,1474.8,2,2),(2024,2,8,6,0,1519.9,1514.4,5,5),(2024,3,11,3,0,1701.4,1408.5,1,3),(2024,4,9,5,0,1588.8,1480.7,3,1),(2024,5,7,7,0,1456.1,1500.2,6,6),(2024,6,6,8,0,1408.2,1535.0,7,7),(2024,7,5,9,0,1342.6,1571.3,8,8),(2024,8,4,10,0,1316.2,1600.5,9,9),(2024,9,1,13,0,1189.4,1666.8,10,10),
  (2025,0,10,4,0,1666.6,1471.1,2,2),(2025,1,8,6,0,1520.5,1516.4,5,5),(2025,2,7,7,0,1495.5,1520.6,6,6),(2025,3,12,2,0,1752.0,1399.7,1,1),(2025,4,8,6,0,1508.4,1511.0,4,4),(2025,5,9,5,0,1600.8,1481.8,3,3),(2025,6,6,8,0,1420.2,1540.9,7,7),(2025,7,5,9,0,1366.2,1570.0,8,8),(2025,8,6,8,0,1414.4,1545.3,9,9),(2025,9,3,11,0,1262.6,1630.4,10,10),
  (2026,0,0,0,0,0,0,1,0),(2026,1,0,0,0,0,0,2,0),(2026,2,0,0,0,0,0,3,0),(2026,3,0,0,0,0,0,4,0),(2026,4,0,0,0,0,0,5,0),(2026,5,0,0,0,0,0,6,0),(2026,6,0,0,0,0,0,7,0),(2026,7,0,0,0,0,0,8,0),(2026,8,0,0,0,0,0,9,0),(2026,9,0,0,0,0,0,10,0);

insert into public.standings(league_season_id, season_franchise_id, wins, losses, ties, points_for, points_against, streak)
select sf.league_season_id, sf.id, r.wins, r.losses, r.ties, r.points_for, r.points_against,
  case when r.actor_index in (0,3,4) then 3 when r.actor_index = 9 then -6 else 1 end
from qa_season_franchises sf
join qa_results r on r.season_year = sf.season_year and r.actor_index = sf.actor_index;

create temp table qa_week_pairs(week integer, event_type text, home_actor integer, away_actor integer) on commit drop;
insert into qa_week_pairs values
  (1,'circuit',0,9),(1,'circuit',1,8),(1,'circuit',2,7),(1,'circuit',3,6),(1,'circuit',4,5),
  (2,'circuit',0,8),(2,'circuit',9,7),(2,'circuit',1,6),(2,'circuit',2,5),(2,'circuit',3,4),
  (3,'circuit',0,7),(3,'circuit',8,6),(3,'circuit',9,5),(3,'circuit',1,4),(3,'circuit',2,3),
  (4,'circuit',0,6),(4,'circuit',7,5),(4,'circuit',8,4),(4,'circuit',9,3),(4,'circuit',1,2),
  (5,'circuit',0,5),(5,'circuit',6,4),(5,'circuit',7,3),(5,'circuit',8,2),(5,'circuit',9,1),
  (6,'circuit',0,4),(6,'circuit',5,3),(6,'circuit',6,2),(6,'circuit',7,1),(6,'circuit',8,9),
  (7,'circuit',0,3),(7,'circuit',4,2),(7,'circuit',5,1),(7,'circuit',6,9),(7,'circuit',7,8),
  (8,'circuit',0,2),(8,'circuit',3,1),(8,'circuit',4,9),(8,'circuit',5,8),(8,'circuit',6,7),
  (9,'circuit',0,1),(9,'circuit',2,9),(9,'circuit',3,8),(9,'circuit',4,7),(9,'circuit',5,6),
  (10,'rivalry',0,3),(10,'rivalry',1,4),(10,'rivalry',2,5),(10,'rivalry',6,9),(10,'rivalry',7,8),
  (11,'revenge',9,0),(11,'revenge',3,2),(11,'revenge',4,1),(11,'revenge',5,8),(11,'revenge',6,7),
  (12,'position',0,1),(12,'position',2,3),(12,'position',4,5),(12,'position',6,7),(12,'position',8,9),
  (13,'chaos',0,9),(13,'chaos',1,8),(13,'chaos',2,7),(13,'chaos',3,6),(13,'chaos',4,5),
  (14,'judgment',0,3),(14,'judgment',1,2),(14,'judgment',4,5),(14,'judgment',6,7),(14,'judgment',8,9),
  (15,'playoff_qf',2,5),(15,'playoff_qf',3,4),(15,'redemption_sf',6,9),(15,'redemption_sf',7,8),
  (16,'playoff_sf',0,4),(16,'playoff_sf',1,2),
  (17,'championship',0,3),(17,'redemption_final',6,8);

create temp table qa_matchups as
with inserted as (
  insert into public.matchups(league_season_id, week, home_season_franchise_id, away_season_franchise_id, event_type, home_points, away_points, winner_season_franchise_id, is_final, context)
  select
    h.league_season_id,
    p.week,
    h.id,
    a.id,
    p.event_type,
    case
      when ls.season_year = 2026 then 0
      when p.week = 13 and p.away_actor = 9 and ls.season_year in (2024, 2025) then 101.4
      else round((102 + ((ls.season_year - 2020) * 2) + (p.home_actor * 3.7) + (p.week * 1.9))::numeric, 2)
    end,
    case
      when ls.season_year = 2026 then 0
      when p.week = 13 and p.away_actor = 9 and ls.season_year in (2024, 2025) then 103.2
      else round((98 + ((ls.season_year - 2020) * 1.7) + (p.away_actor * 3.1) + (p.week * 1.6))::numeric, 2)
    end,
    null::uuid,
    ls.season_year <> 2026,
    jsonb_build_object('fixture','${FIXTURE_VERSION}','synthetic',true,'season_year',ls.season_year,'story',
      case
        when p.week = 13 and p.away_actor = 9 and ls.season_year in (2024, 2025) then 'Giant Killer / Chaos upset'
        when p.week = 10 then 'Designated rivalry'
        when p.event_type = 'championship' then 'Championship result'
        when p.event_type = 'redemption_final' then 'Redemption result'
        else 'Synthetic QA matchup'
      end
    )
  from qa_week_pairs p
  join qa_league_seasons ls on true
  join qa_season_franchises h on h.season_year = ls.season_year and h.actor_index = p.home_actor
  join qa_season_franchises a on a.season_year = ls.season_year and a.actor_index = p.away_actor
  where ls.season_year between 2021 and 2025
  returning id, league_season_id, week, home_season_franchise_id, away_season_franchise_id, home_points, away_points, event_type
)
select id, league_season_id, week, home_season_franchise_id, away_season_franchise_id, home_points, away_points, event_type from inserted;

update public.matchups m
set winner_season_franchise_id = case
  when m.home_points = m.away_points then null
  when m.home_points > m.away_points then m.home_season_franchise_id
  else m.away_season_franchise_id
end
where m.id in (select id from qa_matchups) and m.is_final;

insert into public.rivalries(league_id, franchise_a_id, franchise_b_id, designated, rivalry_score)
select r.league_id, fa.id, fb.id, true,
  case when p.a = 0 and p.b = 3 then 100 when p.a = 6 and p.b = 9 then 85 else 75 end
from qa_refs r
join (values (0,3),(1,4),(2,5),(6,9),(7,8)) p(a,b) on true
join qa_franchises fa on fa.actor_index = p.a
join qa_franchises fb on fb.actor_index = p.b;

create temp table qa_titles(season_year integer, champion_actor integer, runner_actor integer, redemption_actor integer, redemption_runner_actor integer) on commit drop;
insert into qa_titles values
  (2021,0,1,6,9),
  (2022,2,3,7,8),
  (2023,0,3,6,8),
  (2024,4,1,8,9),
  (2025,3,0,6,8);

insert into public.championships(league_season_id, bracket, winner_season_franchise_id, runner_up_season_franchise_id, final_matchup_id, awarded_at)
select ls.id, 'championship', w.id, r.id,
  (select m.id from qa_matchups m where m.league_season_id = ls.id and m.event_type = 'championship' limit 1),
  make_timestamptz(t.season_year, 12, 30, 12, 0, 0, 'America/Chicago')
from qa_titles t
join qa_league_seasons ls on ls.season_year = t.season_year
join qa_season_franchises w on w.season_year = t.season_year and w.actor_index = t.champion_actor
join qa_season_franchises r on r.season_year = t.season_year and r.actor_index = t.runner_actor;

insert into public.championships(league_season_id, bracket, winner_season_franchise_id, runner_up_season_franchise_id, final_matchup_id, awarded_at)
select ls.id, 'redemption', w.id, r.id,
  (select m.id from qa_matchups m where m.league_season_id = ls.id and m.event_type = 'redemption_final' limit 1),
  make_timestamptz(t.season_year, 12, 30, 12, 5, 0, 'America/Chicago')
from qa_titles t
join qa_league_seasons ls on ls.season_year = t.season_year
join qa_season_franchises w on w.season_year = t.season_year and w.actor_index = t.redemption_actor
join qa_season_franchises r on r.season_year = t.season_year and r.actor_index = t.redemption_runner_actor;

insert into public.franchise_achievements(franchise_id, league_season_id, achievement_id, week, earned_at, payload)
select sf.franchise_id, sf.league_season_id, ach.id, 17, make_timestamptz(sf.season_year,12,30,12,0,0,'America/Chicago'),
  jsonb_build_object('fixture','${FIXTURE_VERSION}','synthetic',true,'season_year',sf.season_year)
from qa_titles t
join qa_season_franchises sf on sf.season_year = t.season_year and sf.actor_index = t.champion_actor
join public.achievements ach on ach.code = 'LEAGUE_CHAMPION';

insert into public.franchise_achievements(franchise_id, league_season_id, achievement_id, week, earned_at, payload)
select sf.franchise_id, sf.league_season_id, ach.id, 13, make_timestamptz(sf.season_year,12,1,12,0,0,'America/Chicago'),
  jsonb_build_object('fixture','${FIXTURE_VERSION}','synthetic',true,'season_year',sf.season_year,'story','Giant Killer / Chaos upset')
from qa_season_franchises sf
join public.achievements ach on ach.code in ('GIANT_KILLER','CHAOS_WIN')
where sf.actor_index = 9 and sf.season_year in (2024, 2025);

insert into public.franchise_achievements(franchise_id, league_season_id, achievement_id, week, earned_at, payload)
select sf.franchise_id, sf.league_season_id, ach.id, 10, make_timestamptz(sf.season_year,11,20,12,0,0,'America/Chicago'),
  jsonb_build_object('fixture','${FIXTURE_VERSION}','synthetic',true,'season_year',sf.season_year,'story','repeat rivalry win')
from qa_season_franchises sf
join public.achievements ach on ach.code = 'RIVALRY_WIN'
where sf.actor_index in (0,1,6) and sf.season_year between 2021 and 2025;

insert into public.franchise_stadium_features(stadium_id, stadium_feature_id, unlocked_at, source_achievement_id)
select s.id, stf.id, fa.earned_at, fa.id
from public.franchise_achievements fa
join public.achievements a on a.id = fa.achievement_id
join public.stadiums s on s.franchise_id = fa.franchise_id
join public.stadium_features stf on stf.achievement_code = a.code
where fa.payload->>'fixture' = '${FIXTURE_VERSION}'
on conflict do nothing;

insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload, created_at)
select r.league_id, ls.id, null, 'qa_fixture_history',
  'Synthetic QA history loaded for ' || ls.season_year || '. This is not real NFL history.',
  jsonb_build_object('fixture','${FIXTURE_VERSION}','synthetic',true,'season_year',ls.season_year),
  make_timestamptz(ls.season_year,12,31,9,0,0,'America/Chicago')
from qa_refs r
join qa_league_seasons ls on true;

create temp table qa_drafts as
with inserted as (
  insert into public.drafts(league_season_id, status, draft_type, rounds, pick_seconds, current_pick, starts_at)
  select id, 'scheduled', 'snake', 15, 30, 1, now() + interval '1 hour'
  from qa_league_seasons
  where season_year = 2026
  returning id, league_season_id
)
select id, league_season_id from inserted;

insert into public.draft_picks(draft_id, pick_number, round_number, round_pick, season_franchise_id)
select d.id, pick.pick_number, pick.round_number, pick.round_pick, sf.id
from qa_drafts d
join lateral (
  select n as pick_number,
         ((n - 1) / 10) + 1 as round_number,
         ((n - 1) % 10) + 1 as round_pick
  from generate_series(1, 150) n
) pick on true
join qa_season_franchises sf on sf.season_year = 2026 and sf.draft_position = case when pick.round_number % 2 = 1 then pick.round_pick else 11 - pick.round_pick end;

with summary as (
  select
    (select league_id from qa_refs limit 1) as league_id,
    (select count(*) from qa_actors) as users,
    (select count(*) from qa_franchises) as franchises,
    (select count(*) from qa_league_seasons) as seasons,
    (select count(*) from qa_season_franchises) as season_franchises,
    (select count(*) from public.matchups where league_season_id in (select id from qa_league_seasons)) as matchups,
    (select count(*) from public.rivalries where league_id = (select league_id from qa_refs limit 1)) as rivalries,
    (select count(*) from public.championships where league_season_id in (select id from qa_league_seasons)) as championships,
    (select count(*) from public.draft_picks where draft_id in (select id from qa_drafts)) as draft_picks
)
select jsonb_pretty(to_jsonb(summary)) as qa_fixture_summary from summary;

commit;
`;

// --print-sql emits the exact statement this script would run, so the reset can
// be applied through another authenticated path (for example the Supabase MCP
// connection) without hand-writing production SQL.
if (process.argv.includes('--print-sql')) {
  process.stdout.write(sql);
  process.exit(0);
}

const tempDir = await mkdtemp(join(tmpdir(), 'big-exec-qa-reset-'));
const file = join(tempDir, 'reset.sql');

try {
  await writeFile(file, sql, 'utf8');
  const result = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '--file', file], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
