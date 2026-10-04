-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260821022656, name gate5_stadium_and_recap_foundation. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

insert into stadiums(franchise_id,environment_key)
select f.id,'neon_dome' from franchises f
where not exists(select 1 from stadiums s where s.franchise_id=f.id);

insert into stadium_features(code,display_name,zone,achievement_code,asset_key,active) values
('CHAOS_CROWN','Chaos Crown','exterior','CHAOS_GIANT_KILLER','stadium/chaos-crown',true),
('REDEMPTION_TROPHY','Redemption Trophy','exterior','REDEMPTION_CHAMPION','stadium/redemption-trophy',true),
('REVENGE_FLARES','Revenge Flares','entrance','REVENGE_COMPLETE','stadium/revenge-flares',true),
('GIANT_KILLER_HOLOGRAM','Giant Killer Hologram','exterior','GIANT_KILLER','stadium/giant-killer-hologram',true)
on conflict (code) do update set display_name=excluded.display_name,zone=excluded.zone,achievement_code=excluded.achievement_code,asset_key=excluded.asset_key,active=true;

create table if not exists recap_scripts (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null unique references matchups(id) on delete cascade,
  league_season_id uuid not null references league_seasons(id) on delete cascade,
  winner_season_franchise_id uuid references season_franchises(id),
  loser_season_franchise_id uuid references season_franchises(id),
  title text not null,
  summary text not null,
  format_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recap_scenes (
  id uuid primary key default gen_random_uuid(),
  recap_script_id uuid not null references recap_scripts(id) on delete cascade,
  scene_index integer not null,
  scene_kind text not null,
  duration_ms integer not null default 5000 check(duration_ms between 1000 and 15000),
  payload jsonb not null default '{}'::jsonb,
  unique(recap_script_id,scene_index)
);

create table if not exists recap_renders (
  id uuid primary key default gen_random_uuid(),
  recap_script_id uuid not null references recap_scripts(id) on delete cascade,
  aspect_ratio text not null default '16:9' check(aspect_ratio in ('16:9','9:16')),
  status text not null default 'pending' check(status in ('pending','rendering','ready','failed')),
  storage_key text,
  bytes bigint,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(recap_script_id,aspect_ratio)
);

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  recap_render_id uuid not null references recap_renders(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18),'hex'),
  enabled boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table recap_scripts enable row level security;
alter table recap_scenes enable row level security;
alter table recap_renders enable row level security;
alter table share_links enable row level security;

drop policy if exists league_member_read_recap_scripts on recap_scripts;
create policy league_member_read_recap_scripts on recap_scripts for select to authenticated using (
  exists(select 1 from league_seasons ls where ls.id=recap_scripts.league_season_id and is_league_member(ls.league_id))
);
drop policy if exists league_member_read_recap_scenes on recap_scenes;
create policy league_member_read_recap_scenes on recap_scenes for select to authenticated using (
  exists(select 1 from recap_scripts rs join league_seasons ls on ls.id=rs.league_season_id where rs.id=recap_scenes.recap_script_id and is_league_member(ls.league_id))
);
drop policy if exists league_member_read_recap_renders on recap_renders;
create policy league_member_read_recap_renders on recap_renders for select to authenticated using (
  exists(select 1 from recap_scripts rs join league_seasons ls on ls.id=rs.league_season_id where rs.id=recap_renders.recap_script_id and is_league_member(ls.league_id))
);
drop policy if exists owner_read_share_links on share_links;
create policy owner_read_share_links on share_links for select to authenticated using (
  exists(select 1 from recap_renders rr join recap_scripts rs on rs.id=rr.recap_script_id join league_seasons ls on ls.id=rs.league_season_id where rr.id=share_links.recap_render_id and is_league_member(ls.league_id))
);

grant select on recap_scripts,recap_scenes,recap_renders,share_links to authenticated;

create or replace function sync_franchise_stadium_features(p_franchise_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_stadium uuid; v_count int;
begin
  select id into v_stadium from stadiums where franchise_id=p_franchise_id;
  if v_stadium is null then
    insert into stadiums(franchise_id,environment_key) values(p_franchise_id,'neon_dome') returning id into v_stadium;
  end if;
  insert into franchise_stadium_features(stadium_id,stadium_feature_id,source_achievement_id)
  select v_stadium,sf.id,fa.id
  from franchise_achievements fa
  join achievements a on a.id=fa.achievement_id
  join stadium_features sf on sf.achievement_code=a.code and sf.active
  where fa.franchise_id=p_franchise_id
  and not exists(select 1 from franchise_stadium_features x where x.stadium_id=v_stadium and x.stadium_feature_id=sf.id and x.source_achievement_id=fa.id);
  get diagnostics v_count=row_count;
  return v_count;
end $$;

grant execute on function sync_franchise_stadium_features(uuid) to authenticated;

create or replace function build_matchup_recap(p_matchup_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  m matchups%rowtype;
  v_league uuid; v_script uuid; v_home_name text; v_away_name text; v_winner_name text; v_loser_name text;
  v_winner uuid; v_loser uuid; v_margin numeric; v_top_name text; v_top_points numeric;
begin
  select * into m from matchups where id=p_matchup_id;
  if m.id is null then raise exception 'Matchup not found'; end if;
  if not m.is_final then raise exception 'Recap requires a final matchup'; end if;
  select league_id into v_league from league_seasons where id=m.league_season_id;
  if auth.uid() is not null and not is_league_member(v_league) then raise exception 'League access required'; end if;
  v_winner:=m.winner_season_franchise_id;
  if v_winner is null then v_loser:=null;
  elsif v_winner=m.home_season_franchise_id then v_loser:=m.away_season_franchise_id;
  else v_loser:=m.home_season_franchise_id; end if;
  select f.name into v_home_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=m.home_season_franchise_id;
  select f.name into v_away_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=m.away_season_franchise_id;
  if v_winner is not null then
    select f.name into v_winner_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=v_winner;
    select f.name into v_loser_name from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=v_loser;
  end if;
  v_margin:=abs(m.home_points-m.away_points);
  select coalesce(a.display_name,rt.name||' D/ST'), coalesce(fps.points,fts.points) into v_top_name,v_top_points
  from lineups l
  left join athletes a on a.id=l.athlete_id
  left join real_teams rt on rt.id=l.real_team_id
  left join fantasy_player_scores fps on fps.league_season_id=m.league_season_id and fps.week=m.week and fps.athlete_id=l.athlete_id
  left join fantasy_team_scores fts on fts.league_season_id=m.league_season_id and fts.week=m.week and fts.real_team_id=l.real_team_id
  where l.week=m.week and l.season_franchise_id in (m.home_season_franchise_id,m.away_season_franchise_id) and l.slot<>'BENCH'
  order by coalesce(fps.points,fts.points,0) desc nulls last limit 1;
  insert into recap_scripts(matchup_id,league_season_id,winner_season_franchise_id,loser_season_franchise_id,title,summary,updated_at)
  values(m.id,m.league_season_id,v_winner,v_loser,
    case when v_winner is null then 'Dead Heat: '||v_home_name||' vs '||v_away_name else v_winner_name||' Takes Week '||m.week end,
    case when v_winner is null then v_home_name||' and '||v_away_name||' finished level at '||m.home_points||'.' else v_winner_name||' defeated '||v_loser_name||' by '||v_margin||' points.' end,
    now())
  on conflict(matchup_id) do update set winner_season_franchise_id=excluded.winner_season_franchise_id,loser_season_franchise_id=excluded.loser_season_franchise_id,title=excluded.title,summary=excluded.summary,updated_at=now()
  returning id into v_script;
  delete from recap_scenes where recap_script_id=v_script;
  insert into recap_scenes(recap_script_id,scene_index,scene_kind,duration_ms,payload) values
  (v_script,1,'stadium_open',4500,jsonb_build_object('week',m.week,'home',v_home_name,'away',v_away_name,'event_type',m.event_type)),
  (v_script,2,'score_reveal',5000,jsonb_build_object('home',v_home_name,'away',v_away_name,'home_points',m.home_points,'away_points',m.away_points)),
  (v_script,3,'arcade_star',6500,jsonb_build_object('name',coalesce(v_top_name,'Top Performer'),'points',coalesce(v_top_points,0),'effect','plasma_burst')),
  (v_script,4,'winner_moment',6500,jsonb_build_object('winner',coalesce(v_winner_name,'TIE'),'loser',v_loser_name,'margin',v_margin,'effect',case when v_margin>=25 then 'meteor_mode' when v_margin>=10 then 'laser_storm' else 'last_second_portal' end)),
  (v_script,5,'final_card',4500,jsonb_build_object('title',case when v_winner is null then 'TIE GAME' else v_winner_name||' WINS' end,'home_points',m.home_points,'away_points',m.away_points));
  insert into recap_renders(recap_script_id,aspect_ratio,status) values(v_script,'16:9','pending'),(v_script,'9:16','pending') on conflict(recap_script_id,aspect_ratio) do nothing;
  return v_script;
end $$;

grant execute on function build_matchup_recap(uuid) to authenticated;

select sync_franchise_stadium_features(f.id) from franchises f;
