-- functions.sql — Every function in schema public via pg_get_functiondef, ordered by name and argument list.
-- Generated: 2026-10-04T04:56:57Z (UTC) by scripts/db-schema-snapshot.mjs
-- Source: live Postgres catalog. Reference snapshot only; do NOT apply this file.

-- ===== functions: 86 object(s) =====
-- Query:
--   select (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text as ord,
--          pg_get_functiondef(p.oid) as text
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prokind in ('f','p')

-- accept_league_invite(p_invite_token uuid, p_franchise_name text, p_abbreviation text, p_primary_color text, p_secondary_color text, p_avatar_key text)
CREATE OR REPLACE FUNCTION public.accept_league_invite(p_invite_token uuid, p_franchise_name text, p_abbreviation text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_secondary_color text DEFAULT NULL::text, p_avatar_key text DEFAULT 'classic'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite public.league_invites%rowtype;
  v_league_season uuid;
  v_franchise uuid;
  v_season_franchise uuid;
  v_member_count int;
  v_capacity int;
  v_avatar_key text := coalesce(nullif(trim(p_avatar_key), ''), 'classic');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;
  if v_avatar_key not in ('classic', 'crown', 'tower', 'orbit') then raise exception 'Choose one of the available franchise avatar options'; end if;
  select lower(coalesce(email,'')) into v_email from auth.users where id=v_user;
  select * into v_invite from public.league_invites where invite_token=p_invite_token and status='pending' and expires_at>now() for update;
  if v_invite.id is null then raise exception 'Invite invalid or expired'; end if;
  if lower(v_invite.email) <> v_email then raise exception 'Invite email does not match signed-in account'; end if;
  if exists(select 1 from public.league_members where league_id=v_invite.league_id and user_id=v_user) then raise exception 'You are already a member of this league'; end if;
  select max_franchises into v_capacity from public.fantasy_leagues where id=v_invite.league_id;
  select count(*) into v_member_count from public.league_members where league_id=v_invite.league_id;
  if v_member_count >= coalesce(v_capacity,10) then raise exception 'League is full'; end if;
  select ls.id into v_league_season from public.league_seasons ls join public.competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=v_invite.league_id order by cs.season_year desc limit 1;
  if v_league_season is null then raise exception 'League season missing'; end if;
  perform public.assert_late_entry_open(v_league_season, 'Joining this league');
  insert into public.league_members(league_id,user_id,role) values(v_invite.league_id,v_user,'manager');
  insert into public.franchises(league_id,name,abbreviation,primary_color,secondary_color,avatar_key,established_year)
  values(v_invite.league_id,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,v_avatar_key,extract(year from current_date)::int) returning id into v_franchise;
  insert into public.franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into public.season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into public.standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  update public.league_invites set status='accepted', accepted_by=v_user, accepted_at=now() where id=v_invite.id;
  insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_invite.league_id,v_league_season,v_user,'manager_joined','A new franchise joined the league',jsonb_build_object('franchise_id',v_franchise,'avatar_key',v_avatar_key));
  return jsonb_build_object('league_id',v_invite.league_id,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end $function$;

-- activate_league_season(p_league_season_id uuid)
CREATE OR REPLACE FUNCTION public.activate_league_season(p_league_season_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_user uuid:=auth.uid(); v_league uuid; begin if v_user is null then raise exception 'Authentication required'; end if; select league_id into v_league from public.league_seasons where id=p_league_season_id; if v_league is null then raise exception 'League season not found'; end if; if not exists(select 1 from public.league_members where league_id=v_league and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if; update public.league_seasons set is_current=false where league_id=v_league and is_current; update public.league_seasons set is_current=true where id=p_league_season_id; return p_league_season_id; end $function$;

-- add_draft_queue_item(p_draft_id uuid, p_athlete_id uuid, p_real_team_id uuid)
CREATE OR REPLACE FUNCTION public.add_draft_queue_item(p_draft_id uuid, p_athlete_id uuid DEFAULT NULL::uuid, p_real_team_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_draft public.drafts%rowtype;
  v_season_franchise uuid;
  v_competition_id uuid;
  v_queue_id uuid;
  v_next_rank integer;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if (p_athlete_id is null) = (p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;

  select * into v_draft from public.drafts where id = p_draft_id;
  if v_draft.id is null then raise exception 'Draft not found'; end if;
  if v_draft.status = 'completed' then raise exception 'Draft is complete'; end if;

  select cs.competition_id into v_competition_id
  from public.league_seasons ls
  join public.competition_seasons cs on cs.id = ls.competition_season_id
  where ls.id = v_draft.league_season_id;
  if v_competition_id is null then raise exception 'Draft competition not found'; end if;

  select sf.id into v_season_franchise
  from public.season_franchises sf
  join public.franchise_owners fo on fo.franchise_id = sf.franchise_id
  where sf.league_season_id = v_draft.league_season_id
    and fo.user_id = v_user
    and fo.ends_on is null
  limit 1;

  if v_season_franchise is null then raise exception 'You do not own a franchise in this draft'; end if;

  if p_athlete_id is not null and not exists (
    select 1 from public.athletes
    where id = p_athlete_id
      and competition_id = v_competition_id
      and active = true
      and position in ('QB', 'RB', 'WR', 'TE', 'K')
  ) then raise exception 'Athlete is not draft eligible'; end if;

  if p_real_team_id is not null and not exists (
    select 1 from public.real_teams
    where id = p_real_team_id
      and competition_id = v_competition_id
  ) then raise exception 'D/ST is not draft eligible'; end if;

  if p_athlete_id is not null and exists (
    select 1 from public.draft_picks
    where draft_id = p_draft_id and athlete_id = p_athlete_id and picked_at is not null
  ) then raise exception 'Athlete already drafted'; end if;

  if p_real_team_id is not null and exists (
    select 1 from public.draft_picks
    where draft_id = p_draft_id and real_team_id = p_real_team_id and picked_at is not null
  ) then raise exception 'D/ST already drafted'; end if;

  perform pg_advisory_xact_lock(hashtextextended('draft_queue:' || p_draft_id::text || ':' || v_season_franchise::text, 0));

  select id into v_queue_id
  from public.draft_queues
  where draft_id = p_draft_id
    and season_franchise_id = v_season_franchise
    and ((p_athlete_id is not null and athlete_id = p_athlete_id)
      or (p_real_team_id is not null and real_team_id = p_real_team_id))
  limit 1;

  if v_queue_id is not null then return v_queue_id; end if;

  select coalesce(max(queue_rank), 0) + 1 into v_next_rank
  from public.draft_queues
  where draft_id = p_draft_id and season_franchise_id = v_season_franchise;

  insert into public.draft_queues(draft_id, season_franchise_id, athlete_id, real_team_id, queue_rank)
  values(p_draft_id, v_season_franchise, p_athlete_id, p_real_team_id, v_next_rank)
  returning id into v_queue_id;

  return v_queue_id;
end
$function$;

-- assert_late_entry_open(p_league_season_id uuid, p_context text)
CREATE OR REPLACE FUNCTION public.assert_late_entry_open(p_league_season_id uuid, p_context text DEFAULT 'late entry'::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cutoff timestamptz;
begin
  select public.effective_late_entry_cutoff(p_league_season_id) into v_cutoff;
  if v_cutoff is not null and now() >= v_cutoff then
    raise exception '% is closed for this season. The cutoff was %.', coalesce(nullif(trim(p_context), ''), 'Late entry'), v_cutoff;
  end if;
end;
$function$;

-- award_matchup_achievements(p_matchup_id uuid)
CREATE OR REPLACE FUNCTION public.award_matchup_achievements(p_matchup_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_inserted int:=0;
begin
  insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload)
  select sf.franchise_id,m.league_season_id,a.id,m.week,
         jsonb_build_object(
           'winner_seed',case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'home_seed')::int else (m.context->>'away_seed')::int end,
           'defeated_seed',case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'away_seed')::int else (m.context->>'home_seed')::int end,
           'matchup_id',m.id)
  from matchups m
  join season_franchises sf on sf.id=m.winner_season_franchise_id
  join achievements a on a.code='CHAOS_GIANT_KILLER'
  where m.id=p_matchup_id
    and m.is_final
    and m.event_type='chaos'
    and m.winner_season_franchise_id is not null
    and nullif(m.context->>'home_seed','') is not null
    and nullif(m.context->>'away_seed','') is not null
    and (case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'home_seed')::int else (m.context->>'away_seed')::int end)
        > (case when m.winner_season_franchise_id=m.home_season_franchise_id then (m.context->>'away_seed')::int else (m.context->>'home_seed')::int end)
    and not exists(
      select 1 from franchise_achievements fa
      where fa.franchise_id=sf.franchise_id and fa.league_season_id=m.league_season_id and fa.achievement_id=a.id and fa.week=m.week
    );
  get diagnostics v_inserted=row_count;
  return jsonb_build_object('status','ok','awards',v_inserted);
end $function$;

-- build_matchup_recap(p_matchup_id uuid)
CREATE OR REPLACE FUNCTION public.build_matchup_recap(p_matchup_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m matchups%rowtype;
  v_league uuid; v_script uuid; v_home_name text; v_away_name text; v_winner_name text; v_loser_name text;
  v_winner uuid; v_loser uuid; v_margin numeric; v_top_name text; v_top_points numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into m from matchups where id=p_matchup_id;
  if m.id is null then raise exception 'Matchup not found'; end if;
  if not m.is_final then raise exception 'Recap requires a final matchup'; end if;
  select league_id into v_league from league_seasons where id=m.league_season_id;
  if not is_league_member(v_league) then raise exception 'League access required'; end if;
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
  select coalesce(a.display_name,rt.display_name||' D/ST'), coalesce(fps.points,fts.points) into v_top_name,v_top_points
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
end
$function$;

-- calculate_pro_football_dst_scores(p_league_season_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.calculate_pro_football_dst_scores(p_league_season_id uuid, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count int;
begin
  if not exists (
    select 1 from league_seasons ls
    join competition_seasons cs on cs.id=ls.competition_season_id
    join competitions c on c.id=cs.competition_id
    where ls.id=p_league_season_id and c.code='pro_football'
  ) then raise exception 'Pro Football league season not found'; end if;

  insert into fantasy_team_scores(league_season_id,real_team_id,game_id,week,points,breakdown,calculated_at)
  select p_league_season_id,
         s.real_team_id,
         s.game_id,
         p_week,
         round(
           coalesce((s.raw_stats->>'def_sacks')::numeric,0)
           + coalesce((s.raw_stats->>'def_interceptions')::numeric,0)*2
           + coalesce((s.raw_stats->>'fumble_recovery_opp')::numeric,0)*2
           + (coalesce((s.raw_stats->>'def_tds')::numeric,0)+coalesce((s.raw_stats->>'fumble_recovery_tds')::numeric,0)+coalesce((s.raw_stats->>'special_teams_tds')::numeric,0))*6
           + coalesce((s.raw_stats->>'def_safeties')::numeric,0)*2
           + (coalesce((s.raw_stats->>'def_punt_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_pat_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_fg_blocks')::numeric,0))*2
           + case
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end)=0 then 10
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 1 and 6 then 7
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 7 and 13 then 4
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 14 and 20 then 1
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 21 and 27 then 0
               when (case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end) between 28 and 34 then -1
               else -4
             end,2),
         jsonb_build_object(
           'sacks',coalesce((s.raw_stats->>'def_sacks')::numeric,0),
           'interceptions',coalesce((s.raw_stats->>'def_interceptions')::numeric,0)*2,
           'fumble_recoveries',coalesce((s.raw_stats->>'fumble_recovery_opp')::numeric,0)*2,
           'touchdowns',(coalesce((s.raw_stats->>'def_tds')::numeric,0)+coalesce((s.raw_stats->>'fumble_recovery_tds')::numeric,0)+coalesce((s.raw_stats->>'special_teams_tds')::numeric,0))*6,
           'safeties',coalesce((s.raw_stats->>'def_safeties')::numeric,0)*2,
           'blocked_kicks',(coalesce((s.raw_stats->>'def_punt_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_pat_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_fg_blocks')::numeric,0))*2,
           'points_allowed',(case when g.home_team_id=s.real_team_id then g.away_score else g.home_score end)
         ), now()
  from real_team_game_stats s
  join real_games g on g.id=s.game_id
  join league_seasons ls on ls.id=p_league_season_id and ls.competition_season_id=g.competition_season_id
  where g.week=p_week
  on conflict (league_season_id,real_team_id,game_id)
  do update set points=excluded.points,breakdown=excluded.breakdown,calculated_at=excluded.calculated_at;

  get diagnostics v_count=row_count;
  return jsonb_build_object('status','ok','week',p_week,'scored_rows',v_count);
end $function$;

-- calculate_pro_football_player_scores(p_league_season_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.calculate_pro_football_player_scores(p_league_season_id uuid, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int;
begin
  if not exists (
    select 1 from league_seasons ls
    join competition_seasons cs on cs.id=ls.competition_season_id
    join competitions c on c.id=cs.competition_id
    where ls.id=p_league_season_id and c.code='pro_football'
  ) then raise exception 'Pro Football league season not found'; end if;

  insert into fantasy_player_scores(league_season_id,athlete_id,game_id,week,points,breakdown,calculated_at)
  select
    p_league_season_id,
    ags.athlete_id,
    ags.game_id,
    p_week,
    round((
      coalesce((ags.raw_stats->>'passing_yards')::numeric,0)/25
      + coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*6
      - coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2
      + coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)/10
      + coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6
      + coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5
      + coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)/10
      + coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6
      + (coalesce((ags.raw_stats->>'passing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'rushing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'receiving_2pt_conversions')::numeric,0))*2
      + coalesce((ags.raw_stats->>'special_teams_tds')::numeric,0)*6
      - (coalesce((ags.raw_stats->>'rushing_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'receiving_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'sack_fumbles_lost')::numeric,0))*2
      + coalesce((ags.raw_stats->>'fg_made_0_19')::numeric,0)*3
      + coalesce((ags.raw_stats->>'fg_made_20_29')::numeric,0)*3
      + coalesce((ags.raw_stats->>'fg_made_30_39')::numeric,0)*3
      + coalesce((ags.raw_stats->>'fg_made_40_49')::numeric,0)*4
      + coalesce((ags.raw_stats->>'fg_made_50_59')::numeric,0)*5
      + coalesce((ags.raw_stats->>'fg_made_60_')::numeric,0)*6
      + coalesce((ags.raw_stats->>'pat_made')::numeric,0)
    ),2),
    jsonb_build_object(
      'passing', round(coalesce((ags.raw_stats->>'passing_yards')::numeric,0)/25 + coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*6 - coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2,2),
      'rushing', round(coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)/10 + coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6,2),
      'receiving', round(coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5 + coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)/10 + coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6,2),
      'two_point', (coalesce((ags.raw_stats->>'passing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'rushing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'receiving_2pt_conversions')::numeric,0))*2,
      'fumbles_lost', (coalesce((ags.raw_stats->>'rushing_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'receiving_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'sack_fumbles_lost')::numeric,0))*-2,
      'special_teams_td', coalesce((ags.raw_stats->>'special_teams_tds')::numeric,0)*6,
      'kicking', coalesce((ags.raw_stats->>'fg_made_0_19')::numeric,0)*3 + coalesce((ags.raw_stats->>'fg_made_20_29')::numeric,0)*3 + coalesce((ags.raw_stats->>'fg_made_30_39')::numeric,0)*3 + coalesce((ags.raw_stats->>'fg_made_40_49')::numeric,0)*4 + coalesce((ags.raw_stats->>'fg_made_50_59')::numeric,0)*5 + coalesce((ags.raw_stats->>'fg_made_60_')::numeric,0)*6 + coalesce((ags.raw_stats->>'pat_made')::numeric,0)
    ),
    now()
  from athlete_game_stats ags
  join real_games g on g.id=ags.game_id
  join league_seasons ls on ls.id=p_league_season_id and ls.competition_season_id=g.competition_season_id
  where g.week=p_week
  on conflict (league_season_id,athlete_id,game_id)
  do update set points=excluded.points, breakdown=excluded.breakdown, calculated_at=excluded.calculated_at;

  get diagnostics v_count = row_count;
  return jsonb_build_object('status','ok','week',p_week,'scored_rows',v_count);
end
$function$;

-- calculate_pro_football_week_scores(p_league_season_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.calculate_pro_football_week_scores(p_league_season_id uuid, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p jsonb; d jsonb;
begin
  p:=public.calculate_pro_football_player_scores(p_league_season_id,p_week);
  d:=public.calculate_pro_football_dst_scores(p_league_season_id,p_week);
  return jsonb_build_object('status','ok','player_scores',p,'dst_scores',d);
end $function$;

-- claim_free_agent(p_season_franchise_id uuid, p_athlete_id uuid, p_real_team_id uuid, p_drop_roster_entry_id uuid)
CREATE OR REPLACE FUNCTION public.claim_free_agent(p_season_franchise_id uuid, p_athlete_id uuid DEFAULT NULL::uuid, p_real_team_id uuid DEFAULT NULL::uuid, p_drop_roster_entry_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid:=auth.uid(); v_league_season_id uuid; v_roster_config jsonb; v_roster_limit integer; v_active_count integer; v_new_id uuid;
  v_hold waiver_holds%rowtype; v_drop_athlete uuid; v_drop_team uuid; v_period integer;
  v_integrity jsonb; v_override uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in.'; end if;
  if ((p_athlete_id is not null)::int + (p_real_team_id is not null)::int)<>1 then raise exception 'Choose exactly one player or defense.'; end if;
  select sf.league_season_id,ls.roster_config,ls.waiver_period_hours into v_league_season_id,v_roster_config,v_period
  from season_franchises sf join franchises f on f.id=sf.franchise_id join franchise_owners fo on fo.franchise_id=f.id join league_seasons ls on ls.id=sf.league_season_id
  where sf.id=p_season_franchise_id and fo.user_id=v_user_id and fo.ends_on is null for update of sf;
  if v_league_season_id is null then raise exception 'You do not manage this franchise.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_league_season_id::text,0));
  select * into v_hold from waiver_holds where league_season_id=v_league_season_id and status='open' and ((p_athlete_id is not null and athlete_id=p_athlete_id) or (p_real_team_id is not null and real_team_id=p_real_team_id)) limit 1 for update;
  if v_hold.id is not null then
    if v_hold.clears_at>now() or exists(select 1 from waiver_claims where waiver_hold_id=v_hold.id and status='pending') then raise exception 'That asset is on waivers and must be claimed through the waiver process.'; end if;
    update waiver_holds set status='expired',resolved_at=now() where id=v_hold.id;
  end if;
  if exists (select 1 from roster_entries re join season_franchises sf on sf.id=re.season_franchise_id where sf.league_season_id=v_league_season_id and re.dropped_at is null and ((p_athlete_id is not null and re.athlete_id=p_athlete_id) or (p_real_team_id is not null and re.real_team_id=p_real_team_id))) then raise exception 'That asset is no longer available.'; end if;
  select count(*) into v_active_count from roster_entries where season_franchise_id=p_season_franchise_id and dropped_at is null;
  select coalesce(sum(value::int),0)+coalesce((v_roster_config->>'bench')::int,0) into v_roster_limit from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));
  if p_drop_roster_entry_id is null and v_active_count>=v_roster_limit then raise exception 'Your roster is full. Choose a player to drop.'; end if;
  if p_drop_roster_entry_id is not null then
    select athlete_id,real_team_id into v_drop_athlete,v_drop_team from roster_entries where id=p_drop_roster_entry_id and season_franchise_id=p_season_franchise_id and dropped_at is null for update;
    if not found then raise exception 'The player selected to drop is no longer on your roster.'; end if;
    if exists (select 1 from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is not null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team))) then raise exception 'That player is locked in a lineup and cannot be dropped.'; end if;

    v_integrity:=evaluate_roster_integrity_drop(p_drop_roster_entry_id,'free_agent_swap');
    if not coalesce((v_integrity->>'allowed')::boolean,false) then
      raise exception '%',coalesce(v_integrity->>'message','Roster Integrity blocked this drop.');
    end if;
    if v_integrity->>'override_id' is not null then v_override:=consume_roster_integrity_override(p_drop_roster_entry_id); end if;

    delete from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team));
    perform set_config('big_exec.roster_drop_context','free_agent_swap_prechecked',true);
    update roster_entries set dropped_at=now() where id=p_drop_roster_entry_id and dropped_at is null;
    perform set_config('big_exec.roster_drop_context','',true);
    insert into waiver_holds(league_season_id,athlete_id,real_team_id,source_roster_entry_id,source_season_franchise_id,clears_at) values(v_league_season_id,v_drop_athlete,v_drop_team,p_drop_roster_entry_id,p_season_franchise_id,now()+make_interval(hours=>v_period));
  end if;
  insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via) values(p_season_franchise_id,p_athlete_id,p_real_team_id,'free_agent') returning id into v_new_id;
  return v_new_id;
end
$function$;

-- claim_recap_render(p_worker_id text, p_provider text)
CREATE OR REPLACE FUNCTION public.claim_recap_render(p_worker_id text, p_provider text DEFAULT 'self_hosted'::text)
 RETURNS recap_renders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.recap_renders;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service role required';
  end if;
  select * into v_job
  from public.recap_renders
  where status = 'pending' and renderer_provider = p_provider
  order by created_at
  for update skip locked
  limit 1;
  if v_job.id is null then return null; end if;
  update public.recap_renders
  set status='rendering', worker_id=p_worker_id, started_at=now(), attempts=attempts+1, error_message=null
  where id=v_job.id
  returning * into v_job;
  return v_job;
end;
$function$;

-- claim_share_league_invite(p_invite_token uuid)
CREATE OR REPLACE FUNCTION public.claim_share_league_invite(p_invite_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_master public.league_invites%rowtype;
  v_capacity int;
  v_member_count int;
  v_existing public.league_invites%rowtype;
  v_claim_id uuid;
  v_claim_token uuid := gen_random_uuid();
  v_current_season uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select lower(coalesce(u.email, '')) into v_email
  from auth.users u
  where u.id = v_user;

  if coalesce(v_email, '') = '' then
    raise exception 'Your account needs an email address before claiming this invite';
  end if;

  select *
    into v_master
  from public.league_invites li
  where li.invite_token = p_invite_token
    and li.status = 'pending'
    and li.expires_at > now()
    and li.email like 'share+%@bigexecfs.local'
  for update;

  if v_master.id is null then
    return null;
  end if;

  select id into v_current_season
  from public.league_seasons
  where league_id = v_master.league_id
    and is_current = true
  limit 1;
  if v_current_season is null then
    raise exception 'Current league season missing';
  end if;
  perform public.assert_late_entry_open(v_current_season, 'Claiming this invite');

  if exists (
    select 1
    from public.league_members lm
    where lm.league_id = v_master.league_id
      and lm.user_id = v_user
  ) then
    raise exception 'You are already a member of this league';
  end if;

  select max_franchises into v_capacity from public.fantasy_leagues where id = v_master.league_id;
  select count(*) into v_member_count from public.league_members where league_id = v_master.league_id;
  if v_member_count >= coalesce(v_capacity, 10) then
    raise exception 'League is full';
  end if;

  select *
    into v_existing
  from public.league_invites li
  where li.league_id = v_master.league_id
    and li.status = 'pending'
    and lower(li.email) = v_email
    and li.email not like 'share+%@bigexecfs.local'
    and li.expires_at > now()
  order by li.created_at desc
  limit 1;

  if v_existing.id is not null then
    return v_existing.invite_token;
  end if;

  insert into public.league_invites(league_id, invited_by, email, invite_token, status, expires_at)
  values (v_master.league_id, v_master.invited_by, v_email, v_claim_token, 'pending', v_master.expires_at)
  returning id into v_claim_id;

  return v_claim_token;
end;
$function$;

-- close_league_season(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.close_league_season(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; v_status text; champ matchups%rowtype; red matchups%rowtype; champ_franchise uuid; red_franchise uuid; ach uuid;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id,ls.status into v_ls,v_status from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if v_status='complete' and exists(select 1 from championships where league_season_id=v_ls and bracket='championship') then
    return jsonb_build_object('status','complete','league_season_id',v_ls,'already_closed',true,
      'champion',(select winner_season_franchise_id from championships where league_season_id=v_ls and bracket='championship'),
      'redemption_champion',(select winner_season_franchise_id from championships where league_season_id=v_ls and bracket='redemption'));
  end if;
  select * into champ from matchups where league_season_id=v_ls and week=17 and event_type='championship' and is_final limit 1;
  select * into red from matchups where league_season_id=v_ls and week=17 and event_type='redemption_final' and is_final limit 1;
  if champ.id is null or champ.winner_season_franchise_id is null then raise exception 'Championship final must be complete'; end if;
  if red.id is null or red.winner_season_franchise_id is null then raise exception 'Redemption final must be complete'; end if;
  insert into championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id)
  values(v_ls,'championship',champ.winner_season_franchise_id,case when champ.winner_season_franchise_id=champ.home_season_franchise_id then champ.away_season_franchise_id else champ.home_season_franchise_id end,champ.id)
  on conflict (league_season_id,bracket) do nothing;
  insert into championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id)
  values(v_ls,'redemption',red.winner_season_franchise_id,case when red.winner_season_franchise_id=red.home_season_franchise_id then red.away_season_franchise_id else red.home_season_franchise_id end,red.id)
  on conflict (league_season_id,bracket) do nothing;
  select franchise_id into champ_franchise from season_franchises where id=champ.winner_season_franchise_id;
  select franchise_id into red_franchise from season_franchises where id=red.winner_season_franchise_id;
  select id into ach from achievements where code='LEAGUE_CHAMPION';
  if ach is not null and not exists(select 1 from franchise_achievements where franchise_id=champ_franchise and league_season_id=v_ls and achievement_id=ach) then insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(champ_franchise,v_ls,ach,17,jsonb_build_object('bracket','championship','matchup_id',champ.id)); end if;
  select id into ach from achievements where code='REDEMPTION_CHAMPION';
  if ach is not null and not exists(select 1 from franchise_achievements where franchise_id=red_franchise and league_season_id=v_ls and achievement_id=ach) then insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(red_franchise,v_ls,ach,17,jsonb_build_object('bracket','redemption','matchup_id',red.id,'next_season_reward','first_choice_snake_draft_slot')); end if;
  update league_seasons set status='complete' where id=v_ls;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select p_league_id,v_ls,v_user,'season_complete','Season complete',jsonb_build_object('champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id)
  where not exists(select 1 from league_feed_events where league_id=p_league_id and season_id=v_ls and event_type='season_complete');
  return jsonb_build_object('status','complete','league_season_id',v_ls,'already_closed',false,'champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id);
end $function$;

-- commissioner_remove_pre_draft_franchise(p_league_id uuid, p_franchise_id uuid)
CREATE OR REPLACE FUNCTION public.commissioner_remove_pre_draft_franchise(p_league_id uuid, p_franchise_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user uuid := auth.uid();
  v_target_user uuid;
  v_current_season uuid;
  v_season_franchise uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = v_user
      and lm.role = 'commissioner'
  ) then
    raise exception 'Only the league commissioner can remove a franchise';
  end if;

  select user_id into v_target_user
  from public.franchise_owners
  where franchise_id = p_franchise_id
    and ends_on is null
  limit 1;

  if v_target_user is null then
    raise exception 'Active franchise owner not found';
  end if;

  if v_target_user = v_user then
    raise exception 'Commissioner cannot remove their own franchise from this control';
  end if;

  if not exists (
    select 1
    from public.franchises f
    where f.id = p_franchise_id
      and f.league_id = p_league_id
  ) then
    raise exception 'Franchise is not in this league';
  end if;

  select id into v_current_season
  from public.league_seasons
  where league_id = p_league_id
    and is_current = true
  limit 1;

  if v_current_season is null then
    raise exception 'Current league season missing';
  end if;

  if exists (
    select 1
    from public.drafts d
    where d.league_season_id = v_current_season
      and d.status <> 'scheduled'
  ) then
    raise exception 'Managers can only be removed before the draft starts';
  end if;

  if exists (
    select 1
    from public.draft_picks dp
    join public.drafts d on d.id = dp.draft_id
    where d.league_season_id = v_current_season
  ) then
    raise exception 'Managers can only be removed before draft picks exist';
  end if;

  select id into v_season_franchise
  from public.season_franchises
  where league_season_id = v_current_season
    and franchise_id = p_franchise_id;

  if v_season_franchise is not null then
    delete from public.standings where season_franchise_id = v_season_franchise;
    delete from public.season_franchises where id = v_season_franchise;
  end if;

  update public.franchise_owners
  set ends_on = current_date
  where franchise_id = p_franchise_id
    and user_id = v_target_user
    and ends_on is null;

  delete from public.league_members
  where league_id = p_league_id
    and user_id = v_target_user
    and role <> 'commissioner';

  delete from public.franchises
  where id = p_franchise_id
    and league_id = p_league_id;

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  values (
    p_league_id,
    v_current_season,
    v_user,
    'manager_removed',
    'A franchise seat was reopened by the commissioner',
    jsonb_build_object('franchise_id', p_franchise_id, 'removed_user_id', v_target_user)
  );

  return true;
end;
$function$;

-- complete_recap_render(p_render_id uuid, p_storage_key text, p_bytes bigint, p_duration_ms integer, p_provider_job_id text)
CREATE OR REPLACE FUNCTION public.complete_recap_render(p_render_id uuid, p_storage_key text, p_bytes bigint, p_duration_ms integer, p_provider_job_id text DEFAULT NULL::text)
 RETURNS recap_renders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_job public.recap_renders;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  update public.recap_renders set status='ready', storage_key=p_storage_key, bytes=p_bytes, duration_ms=p_duration_ms,
    provider_job_id=coalesce(p_provider_job_id,provider_job_id), completed_at=now(), error_message=null
  where id=p_render_id returning * into v_job;
  return v_job;
end;
$function$;

-- consume_roster_integrity_override(p_roster_entry_id uuid)
CREATE OR REPLACE FUNCTION public.consume_roster_integrity_override(p_roster_entry_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  select id into v_id from roster_integrity_overrides
  where roster_entry_id=p_roster_entry_id and consumed_at is null and expires_at>now()
  order by approved_at desc limit 1 for update;
  if v_id is not null then
    update roster_integrity_overrides set consumed_at=now() where id=v_id;
  end if;
  return v_id;
end
$function$;

-- create_circuit_schedule_after_draft()
CREATE OR REPLACE FUNCTION public.create_circuit_schedule_after_draft()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_league_id uuid;
  v_teams uuid[];
  v_rotated uuid[];
  v_temp uuid[];
  v_week integer;
  v_pair integer;
  v_home uuid;
  v_away uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select league_id into v_league_id from public.league_seasons where id = new.league_season_id;
  if v_league_id is null or exists(select 1 from public.matchups where league_season_id = new.league_season_id and week between 1 and 9) then return new; end if;
  select array_agg(id order by coalesce(draft_position, 999), id) into v_teams from public.season_franchises where league_season_id = new.league_season_id;
  if coalesce(array_length(v_teams, 1), 0) <> 10 then return new; end if;
  v_rotated := v_teams;
  for v_week in 1..9 loop
    for v_pair in 1..5 loop
      if mod(v_week + v_pair, 2) = 0 then v_home := v_rotated[v_pair]; v_away := v_rotated[11-v_pair];
      else v_home := v_rotated[11-v_pair]; v_away := v_rotated[v_pair]; end if;
      insert into public.matchups(league_season_id, week, home_season_franchise_id, away_season_franchise_id, event_type)
      values(new.league_season_id, v_week, v_home, v_away, 'circuit');
    end loop;
    v_temp := array[v_rotated[1], v_rotated[10]] || v_rotated[2:9];
    v_rotated := v_temp;
  end loop;
  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  values(v_league_id, new.league_season_id, null, 'circuit_schedule_created', 'Weeks 1–9 Circuit schedule is set', jsonb_build_object('matchups', 45, 'draft_id', new.id));
  return new;
end
$function$;

-- create_league_invite(p_league_id uuid, p_email text)
CREATE OR REPLACE FUNCTION public.create_league_invite(p_league_id uuid, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_token uuid := gen_random_uuid();
  v_invite_id uuid;
  v_email text := lower(trim(p_email));
  v_active_count int;
  v_capacity int;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if v_email is null or v_email = '' then raise exception 'Email required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select max_franchises into v_capacity from fantasy_leagues where id=p_league_id;
  select count(*) into v_active_count from league_members where league_id=p_league_id;
  if v_active_count >= coalesce(v_capacity,10) then raise exception 'League is full'; end if;
  if exists(select 1 from league_invites where league_id=p_league_id and lower(email)=v_email and status='pending' and expires_at > now()) then
    select id, invite_token into v_invite_id, v_token from league_invites where league_id=p_league_id and lower(email)=v_email and status='pending' and expires_at > now() order by created_at desc limit 1;
  else
    insert into league_invites(league_id, invited_by, email, invite_token, status, expires_at)
    values(p_league_id, v_user, v_email, v_token, 'pending', now() + interval '14 days') returning id into v_invite_id;
  end if;
  return jsonb_build_object('invite_id',v_invite_id,'invite_token',v_token,'email',v_email);
end $function$;

-- create_league_share_invite(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.create_league_share_invite(p_league_id uuid)
 RETURNS TABLE(invite_id uuid, invite_token uuid, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_user uuid := auth.uid();
  v_existing public.league_invites%rowtype;
  v_token uuid := gen_random_uuid();
  v_email text := concat('share+', replace(v_token::text, '-', ''), '@bigexecfs.local');
  v_invite_id uuid;
  v_member_count int;
  v_capacity int;
  v_current_season uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = v_user
      and lm.role = 'commissioner'
  ) then
    raise exception 'Only the league commissioner can create invite links';
  end if;

  select id into v_current_season
  from public.league_seasons
  where league_id = p_league_id
    and is_current = true
  limit 1;
  if v_current_season is null then
    raise exception 'Current league season missing';
  end if;
  perform public.assert_late_entry_open(v_current_season, 'Creating invite links for this league');

  select max_franchises into v_capacity from public.fantasy_leagues where id = p_league_id;
  select count(*) into v_member_count from public.league_members where league_id = p_league_id;
  if v_member_count >= coalesce(v_capacity, 10) then
    raise exception 'League is full';
  end if;

  select *
    into v_existing
  from public.league_invites li
  where li.league_id = p_league_id
    and li.status = 'pending'
    and li.expires_at > now()
    and li.email like 'share+%@bigexecfs.local'
  order by li.created_at desc
  limit 1;

  if v_existing.id is not null then
    return query select v_existing.id, v_existing.invite_token, v_existing.email;
    return;
  end if;

  insert into public.league_invites(league_id, invited_by, email, invite_token, status, expires_at)
  values (p_league_id, v_user, v_email, v_token, 'pending', now() + interval '14 days')
  returning id into v_invite_id;

  return query select v_invite_id, v_token, v_email;
end;
$function$;

-- create_pro_football_league(p_name text, p_franchise_name text, p_abbreviation text, p_primary_color text, p_secondary_color text, p_avatar_key text)
CREATE OR REPLACE FUNCTION public.create_pro_football_league(p_name text, p_franchise_name text, p_abbreviation text DEFAULT NULL::text, p_primary_color text DEFAULT NULL::text, p_secondary_color text DEFAULT NULL::text, p_avatar_key text DEFAULT 'classic'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_competition uuid;
  v_competition_season uuid;
  v_season_year integer;
  v_scoring uuid;
  v_league uuid;
  v_league_season uuid;
  v_franchise uuid;
  v_season_franchise uuid;
  v_trade_deadline timestamptz;
  v_late_cutoff timestamptz;
  v_avatar_key text := coalesce(nullif(trim(p_avatar_key), ''), 'classic');
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'League name required'; end if;
  if nullif(trim(p_franchise_name),'') is null then raise exception 'Franchise name required'; end if;
  if v_avatar_key not in ('classic', 'crown', 'tower', 'orbit') then raise exception 'Choose one of the available franchise avatar options'; end if;

  select id into v_competition from public.competitions where code='pro_football';
  select cs.id, cs.season_year, cs.late_entry_cutoff_at
    into v_competition_season, v_season_year, v_late_cutoff
  from public.competition_seasons cs
  where cs.competition_id=v_competition
  order by cs.season_year desc
  limit 1;
  if v_competition_season is null then raise exception 'Pro Football season missing'; end if;

  if v_season_year = 2026 then
    v_trade_deadline := timestamptz '2026-11-10 21:00:00+00';
  end if;
  if coalesce(v_late_cutoff, v_trade_deadline) is not null and now() >= least(coalesce(v_late_cutoff, v_trade_deadline), coalesce(v_trade_deadline, v_late_cutoff)) then
    raise exception 'New Pro Football league creation is closed for this season. The cutoff was %.', least(coalesce(v_late_cutoff, v_trade_deadline), coalesce(v_trade_deadline, v_late_cutoff));
  end if;

  select id into v_scoring from public.scoring_profiles where sport='football' and is_system_default=true limit 1;
  if v_scoring is null then raise exception 'Default football scoring profile missing'; end if;

  insert into public.fantasy_leagues(name, created_by) values(trim(p_name), v_user) returning id into v_league;
  insert into public.league_members(league_id,user_id,role) values(v_league,v_user,'commissioner');
  insert into public.league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id,trade_deadline_at,late_start_status)
  values(v_league,v_competition_season,'setup','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,v_scoring,v_trade_deadline,'FORMING')
  returning id into v_league_season;
  insert into public.franchises(league_id,name,abbreviation,primary_color,secondary_color,avatar_key,established_year)
  values(v_league,trim(p_franchise_name),upper(nullif(trim(p_abbreviation),'')),p_primary_color,p_secondary_color,v_avatar_key,extract(year from current_date)::int)
  returning id into v_franchise;
  insert into public.franchise_owners(franchise_id,user_id) values(v_franchise,v_user);
  insert into public.season_franchises(league_season_id,franchise_id) values(v_league_season,v_franchise) returning id into v_season_franchise;
  insert into public.standings(league_season_id,season_franchise_id) values(v_league_season,v_season_franchise);
  insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_league,v_league_season,v_user,'league_created','League created',jsonb_build_object('franchise_id',v_franchise,'avatar_key',v_avatar_key));

  return jsonb_build_object('league_id',v_league,'league_season_id',v_league_season,'franchise_id',v_franchise,'season_franchise_id',v_season_franchise);
end
$function$;

-- create_trade_proposal(p_league_season_id uuid, p_to_season_franchise_id uuid, p_offer_athlete_ids uuid[], p_request_athlete_ids uuid[], p_offer_team_ids uuid[], p_request_team_ids uuid[])
CREATE OR REPLACE FUNCTION public.create_trade_proposal(p_league_season_id uuid, p_to_season_franchise_id uuid, p_offer_athlete_ids uuid[] DEFAULT '{}'::uuid[], p_request_athlete_ids uuid[] DEFAULT '{}'::uuid[], p_offer_team_ids uuid[] DEFAULT '{}'::uuid[], p_request_team_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_from uuid;
  v_trade uuid;
  v_league uuid;
  v_deadline timestamptz;
  x uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select ls.league_id, ls.trade_deadline_at into v_league, v_deadline from league_seasons ls where ls.id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  if v_deadline is not null and now() >= v_deadline then raise exception 'The trade deadline has passed. Trades are closed for this season.'; end if;

  select sf.id into v_from from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.league_season_id=p_league_season_id and fo.user_id=v_user and fo.ends_on is null limit 1;
  if v_from is null then raise exception 'You do not own a franchise in this season'; end if;
  if p_to_season_franchise_id=v_from then raise exception 'Cannot trade with your own franchise'; end if;
  if not exists(select 1 from season_franchises where id=p_to_season_franchise_id and league_season_id=p_league_season_id) then raise exception 'Trade partner not in this league season'; end if;
  if coalesce(array_length(p_offer_athlete_ids,1),0)+coalesce(array_length(p_request_athlete_ids,1),0)+coalesce(array_length(p_offer_team_ids,1),0)+coalesce(array_length(p_request_team_ids,1),0)=0 then raise exception 'Trade must contain at least one asset'; end if;
  foreach x in array p_offer_athlete_ids loop if not exists(select 1 from roster_entries where season_franchise_id=v_from and athlete_id=x and dropped_at is null) then raise exception 'Offered athlete is no longer on your roster'; end if; end loop;
  foreach x in array p_request_athlete_ids loop if not exists(select 1 from roster_entries where season_franchise_id=p_to_season_franchise_id and athlete_id=x and dropped_at is null) then raise exception 'Requested athlete is no longer on partner roster'; end if; end loop;
  foreach x in array p_offer_team_ids loop if not exists(select 1 from roster_entries where season_franchise_id=v_from and real_team_id=x and dropped_at is null) then raise exception 'Offered D/ST is no longer on your roster'; end if; end loop;
  foreach x in array p_request_team_ids loop if not exists(select 1 from roster_entries where season_franchise_id=p_to_season_franchise_id and real_team_id=x and dropped_at is null) then raise exception 'Requested D/ST is no longer on partner roster'; end if; end loop;
  insert into trades(league_season_id,proposed_by_franchise_id,proposed_to_franchise_id,status) values(p_league_season_id,v_from,p_to_season_franchise_id,'proposed') returning id into v_trade;
  foreach x in array p_offer_athlete_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id) values(v_trade,v_from,p_to_season_franchise_id,x); end loop;
  foreach x in array p_request_athlete_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id) values(v_trade,p_to_season_franchise_id,v_from,x); end loop;
  foreach x in array p_offer_team_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,real_team_id) values(v_trade,v_from,p_to_season_franchise_id,x); end loop;
  foreach x in array p_request_team_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,real_team_id) values(v_trade,p_to_season_franchise_id,v_from,x); end loop;
  insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts) values(v_league,p_league_season_id,'trade',v_trade,'trade_proposed',jsonb_build_object('from',v_from,'to',p_to_season_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=v_trade)));
  return jsonb_build_object('status','proposed','trade_id',v_trade);
end
$function$;

-- current_league_season_id(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.current_league_season_id(p_league_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$ select ls.id from public.league_seasons ls where ls.league_id=p_league_id and ls.is_current limit 1 $function$;

-- designate_rivalry(p_league_id uuid, p_franchise_a uuid, p_franchise_b uuid)
CREATE OR REPLACE FUNCTION public.designate_rivalry(p_league_id uuid, p_franchise_a uuid, p_franchise_b uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 if not exists(select 1 from franchises where id=p_franchise_a and league_id=p_league_id) or not exists(select 1 from franchises where id=p_franchise_b and league_id=p_league_id) then raise exception 'Franchises must belong to league'; end if;
 insert into rivalries(league_id,franchise_a_id,franchise_b_id,designated,rivalry_score) values(p_league_id,p_franchise_a,p_franchise_b,true,100)
 on conflict (league_id,(least(franchise_a_id,franchise_b_id)),(greatest(franchise_a_id,franchise_b_id))) do update set designated=true,rivalry_score=greatest(rivalries.rivalry_score,100)
 returning id into v_id;
 return jsonb_build_object('rivalry_id',v_id);
end $function$;

-- draft_autopick_candidate(p_draft_id uuid, p_competition_id uuid, p_positions text[])
CREATE OR REPLACE FUNCTION public.draft_autopick_candidate(p_draft_id uuid, p_competition_id uuid, p_positions text[] DEFAULT NULL::text[])
 RETURNS TABLE(athlete_id uuid, real_team_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with latest_value_seasons as (
    select distinct dhv.season_year
    from public.draft_historical_values dhv
    where dhv.competition_id = p_competition_id
    order by dhv.season_year desc
    limit 5
  ),
  preferred_season_values as (
    select asset_type, athlete_id, real_team_id, position, season_year, points
    from (
      select
        dhv.*,
        row_number() over (
          partition by dhv.asset_type, dhv.athlete_id, dhv.real_team_id, dhv.season_year
          order by case dhv.source
            when 'balldontlie' then 1
            when 'sportradar' then 2
            when 'existing_fantasy_scores' then 3
            else 9
          end,
          dhv.imported_at desc
        ) as source_rank
      from public.draft_historical_values dhv
      join latest_value_seasons recent on recent.season_year = dhv.season_year
      where dhv.competition_id = p_competition_id
    ) ranked_sources
    where source_rank = 1
  ),
  asset_points as (
    select
      psv.asset_type,
      psv.athlete_id,
      psv.real_team_id,
      psv.position,
      avg(psv.points) as points
    from preferred_season_values psv
    group by psv.asset_type, psv.athlete_id, psv.real_team_id, psv.position
  ),
  ranked_points as (
    select
      asset_points.*,
      row_number() over (partition by position order by points desc) as position_row,
      count(*) over (partition by position) as position_count
    from asset_points
  ),
  replacement_rank(position, rank_number) as (
    values
      ('QB', 12),
      ('RB', 36),
      ('WR', 48),
      ('TE', 12),
      ('D/ST', 12),
      ('K', 12)
  ),
  baselines as (
    select
      rp.position,
      coalesce(
        max(rp.points) filter (where rp.position_row = rr.rank_number),
        case when max(rp.position_count) >= 5 then min(rp.points) else 0 end
      ) as baseline
    from ranked_points rp
    left join replacement_rank rr on rr.position = rp.position
    group by rp.position
  ),
  position_priors as (
    select position, round((percentile_cont(0.5) within group (order by points) * case position
      when 'RB' then 0.62
      when 'WR' then 0.58
      when 'QB' then 0.56
      when 'TE' then 0.54
      when 'K' then 0.72
      when 'D/ST' then 0.72
      else 0.5
    end)::numeric, 2) as points
    from asset_points
    group by position
  ),
  emergency_priors(position, points) as (
    values
      ('RB', 58.90::numeric),
      ('WR', 51.00::numeric),
      ('QB', 47.04::numeric),
      ('TE', 30.24::numeric),
      ('D/ST', 34.56::numeric),
      ('K', 31.68::numeric)
  ),
  ranked as (
    select
      a.id as athlete_id,
      null::uuid as real_team_id,
      coalesce(ap.points, pp.points, ep.points, 0) - coalesce(b.baseline, 0) as score,
      case a.position when 'RB' then 1 when 'WR' then 2 when 'QB' then 3 when 'TE' then 4 when 'K' then 6 else 99 end as position_order,
      case when ap.points is null then 1 else 0 end as prior_order,
      a.id as tiebreak
    from public.athletes a
    left join asset_points ap on ap.athlete_id = a.id and ap.asset_type = 'athlete'
    left join position_priors pp on pp.position = a.position
    left join emergency_priors ep on ep.position = a.position
    left join baselines b on b.position = a.position
    where a.competition_id = p_competition_id
      and a.active = true
      and a.position in ('QB', 'RB', 'WR', 'TE', 'K')
      and (p_positions is null or a.position = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.athlete_id = a.id and dp.picked_at is not null
      )
    union all
    select
      null::uuid as athlete_id,
      rt.id as real_team_id,
      coalesce(ap.points, pp.points, ep.points, 0) - coalesce(b.baseline, 0) as score,
      5 as position_order,
      case when ap.points is null then 1 else 0 end as prior_order,
      rt.id as tiebreak
    from public.real_teams rt
    left join asset_points ap on ap.real_team_id = rt.id and ap.asset_type = 'team_defense'
    left join position_priors pp on pp.position = 'D/ST'
    left join emergency_priors ep on ep.position = 'D/ST'
    left join baselines b on b.position = 'D/ST'
    where rt.competition_id = p_competition_id
      and rt.active = true
      and (p_positions is null or 'DST' = any(p_positions) or 'D/ST' = any(p_positions))
      and not exists (
        select 1 from public.draft_picks dp
        where dp.draft_id = p_draft_id and dp.real_team_id = rt.id and dp.picked_at is not null
      )
  )
  select ranked.athlete_id, ranked.real_team_id
  from ranked
  order by ranked.score desc, ranked.prior_order, ranked.position_order, ranked.tiebreak
  limit 1
$function$;

-- draft_roster_needs(p_season_franchise_id uuid)
CREATE OR REPLACE FUNCTION public.draft_roster_needs(p_season_franchise_id uuid)
 RETURNS TABLE(need_position text, deficit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg jsonb;
  v_req jsonb;
  v_have jsonb;
  v_rb_have integer; v_wr_have integer; v_te_have integer;
  v_rb_req integer;  v_wr_req integer;  v_te_req integer;  v_flex_req integer;
  v_flex_deficit integer;
  v_pos text;
  v_req_n integer;
  v_have_n integer;
begin
  select ls.roster_config into v_cfg
  from public.season_franchises sf
  join public.league_seasons ls on ls.id = sf.league_season_id
  where sf.id = p_season_franchise_id;

  -- Accept either shape; unknown or missing keys fall back to defaults.
  v_req := coalesce(v_cfg -> 'starters', v_cfg -> 'slots', '{}'::jsonb);

  -- Current active roster, DST represented by real_team_id.
  select coalesce(jsonb_object_agg(pos, n), '{}'::jsonb) into v_have
  from (
    select case when re.real_team_id is not null then 'DST' else coalesce(a.position, 'UNKNOWN') end as pos, count(*)::int as n
    from public.roster_entries re
    left join public.athletes a on a.id = re.athlete_id
    where re.season_franchise_id = p_season_franchise_id
      and re.dropped_at is null
    group by 1
  ) counts;

  -- Explicit minimums.
  foreach v_pos in array array['QB','RB','WR','TE','K','DST'] loop
    v_req_n := coalesce((v_req ->> v_pos)::int,
                        case v_pos when 'RB' then 2 when 'WR' then 2 else 1 end);
    v_have_n := coalesce((v_have ->> v_pos)::int, 0);
    if v_req_n - v_have_n > 0 then
      need_position := v_pos;
      deficit := v_req_n - v_have_n;
      return next;
    end if;
  end loop;

  -- FLEX: one more RB/WR/TE beyond the explicit minimums. Reported against each
  -- of the three positions with the same deficit so any of them satisfies it.
  v_rb_req := coalesce((v_req ->> 'RB')::int, 2);
  v_wr_req := coalesce((v_req ->> 'WR')::int, 2);
  v_te_req := coalesce((v_req ->> 'TE')::int, 1);
  v_flex_req := coalesce((v_req ->> 'FLEX')::int, 1);
  v_rb_have := coalesce((v_have ->> 'RB')::int, 0);
  v_wr_have := coalesce((v_have ->> 'WR')::int, 0);
  v_te_have := coalesce((v_have ->> 'TE')::int, 0);

  v_flex_deficit := (v_rb_req + v_wr_req + v_te_req + v_flex_req)
                    - (v_rb_have + v_wr_have + v_te_have);
  -- Only the portion not already covered by the explicit RB/WR/TE deficits above.
  v_flex_deficit := v_flex_deficit
                    - greatest(0, v_rb_req - v_rb_have)
                    - greatest(0, v_wr_req - v_wr_have)
                    - greatest(0, v_te_req - v_te_have);
  if v_flex_deficit > 0 then
    foreach v_pos in array array['RB','WR','TE'] loop
      need_position := v_pos || '_FLEX';
      deficit := v_flex_deficit;
      return next;
    end loop;
  end if;

  return;
end
$function$;

-- effective_late_entry_cutoff(p_league_season_id uuid)
CREATE OR REPLACE FUNCTION public.effective_late_entry_cutoff(p_league_season_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select least(
    coalesce(cs.late_entry_cutoff_at, ls.trade_deadline_at),
    coalesce(ls.trade_deadline_at, cs.late_entry_cutoff_at)
  )
  from public.league_seasons ls
  join public.competition_seasons cs on cs.id = ls.competition_season_id
  where ls.id = p_league_season_id
$function$;

-- enforce_roster_integrity_drop()
CREATE OR REPLACE FUNCTION public.enforce_roster_integrity_drop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_context text:=nullif(current_setting('big_exec.roster_drop_context',true),'');
  v_decision jsonb;
  v_override uuid;
begin
  if old.dropped_at is not null or new.dropped_at is null then return new; end if;

  if v_context in ('free_agent_swap_prechecked','waiver_award_prechecked','commissioner_override_prechecked') then
    return new;
  end if;

  v_decision:=evaluate_roster_integrity_drop(old.id,coalesce(v_context,'direct'));
  if not coalesce((v_decision->>'allowed')::boolean,false) then
    raise exception '%',coalesce(v_decision->>'message','Roster Integrity blocked this drop.');
  end if;

  if v_decision->>'override_id' is not null then
    v_override:=consume_roster_integrity_override(old.id);
  end if;
  return new;
end
$function$;

-- evaluate_roster_integrity_drop(p_roster_entry_id uuid, p_context text)
CREATE OR REPLACE FUNCTION public.evaluate_roster_integrity_drop(p_roster_entry_id uuid, p_context text DEFAULT 'direct'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_entry roster_entries%rowtype; v_sf season_franchises%rowtype; v_ls league_seasons%rowtype; v_recent_drops integer:=0; v_override uuid; v_protected boolean:=false; v_message text; begin select * into v_entry from roster_entries where id=p_roster_entry_id; if v_entry.id is null or v_entry.dropped_at is not null then return jsonb_build_object('allowed',false,'reason_code','missing_asset','message','Roster asset is no longer active.'); end if; select * into v_sf from season_franchises where id=v_entry.season_franchise_id; select * into v_ls from league_seasons where id=v_sf.league_season_id; if v_ls.id is null then return jsonb_build_object('allowed',false,'reason_code','missing_season','message','League season not found.'); end if; if v_ls.trade_deadline_at is null or now()<v_ls.trade_deadline_at or v_ls.roster_integrity_mode='open' then return jsonb_build_object('allowed',true,'reason_code','not_active','mode',v_ls.roster_integrity_mode); end if; select id into v_override from roster_integrity_overrides where roster_entry_id=p_roster_entry_id and consumed_at is null and expires_at>now() order by approved_at desc limit 1; if v_override is not null then return jsonb_build_object('allowed',true,'reason_code','commissioner_override','override_id',v_override,'mode',v_ls.roster_integrity_mode); end if; if v_ls.roster_integrity_lock_eliminated and v_sf.roster_locked_at is not null then v_message:='This franchise roster is locked for the remainder of the season.'; return jsonb_build_object('allowed',false,'reason_code','franchise_locked','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode); end if; if v_ls.roster_integrity_mode='commissioner_review' then v_message:='This league requires commissioner approval for every roster release after the trade deadline.'; return jsonb_build_object('allowed',false,'reason_code','commissioner_review_required','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode); end if; if v_ls.roster_integrity_protect_core_assets then v_protected:=roster_integrity_asset_is_protected(p_roster_entry_id); if v_protected then v_message:='This core roster asset is protected after the trade deadline. Commissioner approval is required to release it.'; return jsonb_build_object('allowed',false,'reason_code','protected_asset','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode); end if; end if; select count(*) into v_recent_drops from roster_entries where season_franchise_id=v_entry.season_franchise_id and dropped_at is not null and dropped_at>=now()-make_interval(hours=>v_ls.roster_integrity_bulk_window_hours); if v_recent_drops>=v_ls.roster_integrity_bulk_drop_limit then v_message:=format('Roster Integrity blocked this move because the franchise already made %s drops in the last %s hours. Commissioner approval is required.',v_recent_drops,v_ls.roster_integrity_bulk_window_hours); return jsonb_build_object('allowed',false,'reason_code','bulk_drop_limit','message',v_message,'requires_review',true,'recent_drops',v_recent_drops,'mode',v_ls.roster_integrity_mode); end if; if coalesce(p_context,'direct')='direct' then v_message:='Standalone player releases are protected after the trade deadline. Use Free Agency/Waivers for a replacement move or request commissioner approval.'; return jsonb_build_object('allowed',false,'reason_code','standalone_drop','message',v_message,'requires_review',true,'mode',v_ls.roster_integrity_mode); end if; return jsonb_build_object('allowed',true,'reason_code','normal_replacement','mode',v_ls.roster_integrity_mode,'recent_drops',v_recent_drops); end $function$;

-- fail_recap_render(p_render_id uuid, p_error text)
CREATE OR REPLACE FUNCTION public.fail_recap_render(p_render_id uuid, p_error text)
 RETURNS recap_renders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_job public.recap_renders;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  update public.recap_renders set status=case when attempts < 3 then 'pending' else 'failed' end,
    error_message=left(p_error,2000), worker_id=null
  where id=p_render_id returning * into v_job;
  return v_job;
end;
$function$;

-- generate_chaos_week(p_league_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.generate_chaos_week(p_league_id uuid, p_week integer DEFAULT 13)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int; n int;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
  select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
  n:=coalesce(array_length(ranked,1),0); if n<>10 then raise exception 'Chaos Week requires 10 franchises'; end if;
  for i in 1..5 loop
    insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context)
    values(v_ls,p_week,ranked[i],ranked[11-i],'chaos',jsonb_build_object('home_seed',i,'away_seed',11-i,'format','standings_inversion'));
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'chaos_week_created','Chaos Week is set',jsonb_build_object('week',p_week,'format','1v10 2v9 3v8 4v7 5v6'));
  return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $function$;

-- generate_circuit_schedule(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.generate_circuit_schedule(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_ls uuid;
  teams uuid[];
  rotated uuid[];
  n int;
  wk int;
  i int;
  home_id uuid;
  away_id uuid;
  tmp uuid[];
  inserted_count int:=0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  select array_agg(id order by coalesce(draft_position,999),id) into teams from season_franchises where league_season_id=v_ls;
  n:=coalesce(array_length(teams,1),0);
  if n<>10 then raise exception 'Circuit schedule requires 10 franchises'; end if;
  if exists(select 1 from matchups where league_season_id=v_ls and week between 1 and 9) then return jsonb_build_object('status','exists','weeks',9); end if;
  rotated:=teams;
  for wk in 1..9 loop
    for i in 1..5 loop
      if mod(wk+i,2)=0 then home_id:=rotated[i]; away_id:=rotated[11-i]; else home_id:=rotated[11-i]; away_id:=rotated[i]; end if;
      insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type)
      values(v_ls,wk,home_id,away_id,'circuit');
      inserted_count:=inserted_count+1;
    end loop;
    tmp:=array[rotated[1],rotated[10]] || rotated[2:9];
    rotated:=tmp;
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_ls,v_user,'circuit_schedule_created','Weeks 1–9 Circuit schedule is set',jsonb_build_object('matchups',inserted_count));
  return jsonb_build_object('status','created','weeks',9,'matchups',inserted_count);
end $function$;

-- generate_judgment_week(p_league_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.generate_judgment_week(p_league_id uuid, p_week integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; pairs int[][]:=array[[1,4],[2,3],[5,6],[7,8],[9,10]]; i int;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
  select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
  if coalesce(array_length(ranked,1),0)<>10 then raise exception 'Judgment Week requires 10 franchises'; end if;
  for i in 1..5 loop
    insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context)
    values(v_ls,p_week,ranked[pairs[i][1]],ranked[pairs[i][2]],'judgment',jsonb_build_object('home_seed',pairs[i][1],'away_seed',pairs[i][2],'format','playoff_consequence'));
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'judgment_week_created','Judgment Week is set',jsonb_build_object('week',p_week,'format','1v4 2v3 5v6 7v8 9v10'));
  return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $function$;

-- generate_position_week(p_league_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.generate_position_week(p_league_id uuid, p_week integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
 select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
 if array_length(ranked,1)<>10 then raise exception 'Position Week requires 10 franchises'; end if;
 for i in 1..5 loop insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,ranked[(i*2)-1],ranked[i*2],'position'); end loop;
 return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $function$;

-- generate_postseason_week16(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.generate_postseason_week16(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; seed1 uuid; seed2 uuid; qfw uuid[]; qfseeds int[]; low_w uuid; high_w uuid;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=16 and event_type='playoff_sf') then return jsonb_build_object('status','exists','week',16); end if;
  if (select count(*) from matchups where league_season_id=v_ls and week=15 and event_type='playoff_qf' and is_final)<>2 then raise exception 'Both Week 15 championship quarterfinals must be final'; end if;
  select season_franchise_id into seed1 from postseason_seeds where league_season_id=v_ls and seed=1;
  select season_franchise_id into seed2 from postseason_seeds where league_season_id=v_ls and seed=2;
  select array_agg(m.winner_season_franchise_id order by ps.seed desc), array_agg(ps.seed order by ps.seed desc) into qfw,qfseeds
  from matchups m join postseason_seeds ps on ps.league_season_id=v_ls and ps.season_franchise_id=m.winner_season_franchise_id where m.league_season_id=v_ls and m.week=15 and m.event_type='playoff_qf';
  low_w:=qfw[1]; high_w:=qfw[2];
  insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context) values
    (v_ls,16,seed1,low_w,'playoff_sf',jsonb_build_object('seed1',1,'opponent_seed',qfseeds[1])),
    (v_ls,16,seed2,high_w,'playoff_sf',jsonb_build_object('seed1',2,'opponent_seed',qfseeds[2]));
  return jsonb_build_object('status','created','week',16,'matchups',2,'redemption_status','rest_week');
end $function$;

-- generate_postseason_week17(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.generate_postseason_week17(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; sfw uuid[]; redw uuid[];
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from matchups where league_season_id=v_ls and week=17 and event_type in ('championship','redemption_final')) then return jsonb_build_object('status','exists','week',17); end if;
  if (select count(*) from matchups where league_season_id=v_ls and week=16 and event_type='playoff_sf' and is_final)<>2 then raise exception 'Both Week 16 championship semifinals must be final'; end if;
  if (select count(*) from matchups where league_season_id=v_ls and week=15 and event_type='redemption_sf' and is_final)<>2 then raise exception 'Both Redemption semifinals must be final'; end if;
  select array_agg(winner_season_franchise_id order by id) into sfw from matchups where league_season_id=v_ls and week=16 and event_type='playoff_sf';
  select array_agg(winner_season_franchise_id order by id) into redw from matchups where league_season_id=v_ls and week=15 and event_type='redemption_sf';
  insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values
    (v_ls,17,sfw[1],sfw[2],'championship'),(v_ls,17,redw[1],redw[2],'redemption_final');
  return jsonb_build_object('status','created','week',17,'matchups',2);
end $function$;

-- generate_revenge_week(p_league_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.generate_revenge_week(p_league_id uuid, p_week integer DEFAULT 11)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; rec record; used uuid[]:='{}'; inserted int:=0;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
 -- Prioritize completed losses that were closest, then rivalry losses.
 for rec in
   select case when winner_season_franchise_id=home_season_franchise_id then away_season_franchise_id else home_season_franchise_id end loser,
          winner_season_franchise_id winner, abs(home_points-away_points) margin, week
   from matchups where league_season_id=v_ls and week between 1 and 10 and is_final and winner_season_franchise_id is not null
   order by abs(home_points-away_points),week desc
 loop
   if inserted>=5 then exit; end if;
   if not(rec.loser=any(used)) and not(rec.winner=any(used)) then
     insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,rec.loser,rec.winner,'revenge');
     used:=array_append(array_append(used,rec.loser),rec.winner); inserted:=inserted+1;
   end if;
 end loop;
 -- If not all teams have a completed loss, pair remaining teams by current standings order.
 for rec in select s.season_franchise_id from standings s where s.league_season_id=v_ls and not(s.season_franchise_id=any(used)) order by s.wins desc,s.points_for desc loop
   if inserted>=5 then exit; end if;
   if array_length(used,1) is null or not(rec.season_franchise_id=any(used)) then
     if (select count(*) from season_franchises sf where sf.league_season_id=v_ls and not(sf.id=any(used)))>=2 then
       if not exists(select 1 from matchups where league_season_id=v_ls and week=p_week and (home_season_franchise_id=rec.season_franchise_id or away_season_franchise_id=rec.season_franchise_id)) then
         -- pick next unmatched opponent
         insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type)
         select v_ls,p_week,rec.season_franchise_id,sf.id,'revenge' from season_franchises sf where sf.league_season_id=v_ls and sf.id<>rec.season_franchise_id and not(sf.id=any(used)) order by sf.id limit 1;
         if found then used:=array_append(used,rec.season_franchise_id); select away_season_franchise_id into rec.winner from matchups where league_season_id=v_ls and week=p_week and home_season_franchise_id=rec.season_franchise_id; used:=array_append(used,rec.winner); inserted:=inserted+1; end if;
       end if;
     end if;
   end if;
 end loop;
 return jsonb_build_object('status','created','week',p_week,'matchups',inserted);
end $function$;

-- generate_rivalry_week(p_league_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.generate_rivalry_week(p_league_id uuid, p_week integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; rec record; used uuid[]:='{}'; a_sf uuid; b_sf uuid; inserted int:=0;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;

 -- First use commissioner-designated rivalries.
 for rec in select * from rivalries where league_id=p_league_id and designated order by rivalry_score desc,created_at loop
   select id into a_sf from season_franchises where league_season_id=v_ls and franchise_id=rec.franchise_a_id;
   select id into b_sf from season_franchises where league_season_id=v_ls and franchise_id=rec.franchise_b_id;
   if a_sf is not null and b_sf is not null and not(a_sf=any(used)) and not(b_sf=any(used)) then
     insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,a_sf,b_sf,'rivalry');
     used:=array_append(array_append(used,a_sf),b_sf); inserted:=inserted+1;
   end if;
 end loop;

 -- Fill remaining pairs using closest Circuit games first, then deterministic standings IDs.
 for rec in
   select m.home_season_franchise_id a,m.away_season_franchise_id b,abs(m.home_points-m.away_points) margin
   from matchups m where m.league_season_id=v_ls and m.week between 1 and 9
   order by case when m.is_final then 0 else 1 end,abs(m.home_points-m.away_points),m.week desc
 loop
   if inserted>=5 then exit; end if;
   if not(rec.a=any(used)) and not(rec.b=any(used)) then
     insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,rec.a,rec.b,'rivalry');
     used:=array_append(array_append(used,rec.a),rec.b); inserted:=inserted+1;
   end if;
 end loop;
 if inserted<5 then
   for rec in select id from season_franchises where league_season_id=v_ls and not(id=any(used)) order by id loop
     if a_sf is null or a_sf=any(used) then a_sf:=rec.id; else b_sf:=rec.id; insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,a_sf,b_sf,'rivalry'); used:=array_append(array_append(used,a_sf),b_sf); inserted:=inserted+1; a_sf:=null; b_sf:=null; end if;
   end loop;
 end if;
 return jsonb_build_object('status','created','week',p_week,'matchups',inserted);
end $function$;

-- generate_weekly_awards(p_league_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.generate_weekly_awards(p_league_id uuid, p_week integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_user uuid:=auth.uid(); v_ls uuid; rec record; v_count int:=0; begin if not exists(select 1 from public.league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if; v_ls:=public.current_league_season_id(p_league_id); if v_ls is null then raise exception 'Current league season not found'; end if; if not exists(select 1 from public.matchups where league_season_id=v_ls and week=p_week) then raise exception 'No matchups for this week'; end if; if exists(select 1 from public.matchups where league_season_id=v_ls and week=p_week and not is_final) then raise exception 'All matchups must be final before awards'; end if; select season_franchise_id,points into rec from (select home_season_franchise_id season_franchise_id,home_points points from public.matchups where league_season_id=v_ls and week=p_week union all select away_season_franchise_id,away_points from public.matchups where league_season_id=v_ls and week=p_week) x order by points desc,season_franchise_id limit 1; insert into public.weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload) values(v_ls,p_week,'highest_score','Highest Score',rec.season_franchise_id,jsonb_build_object('points',rec.points)) on conflict do nothing; if found then v_count:=v_count+1; end if; select winner_season_franchise_id,abs(home_points-away_points) margin into rec from public.matchups where league_season_id=v_ls and week=p_week and winner_season_franchise_id is not null order by abs(home_points-away_points) desc,id limit 1; if rec.winner_season_franchise_id is not null then insert into public.weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload) values(v_ls,p_week,'biggest_blowout','Biggest Blowout',rec.winner_season_franchise_id,jsonb_build_object('margin',rec.margin)) on conflict do nothing; if found then v_count:=v_count+1; end if; end if; select winner_season_franchise_id,abs(home_points-away_points) margin into rec from public.matchups where league_season_id=v_ls and week=p_week and winner_season_franchise_id is not null order by abs(home_points-away_points),id limit 1; if rec.winner_season_franchise_id is not null then insert into public.weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload) values(v_ls,p_week,'closest_win','Closest Win',rec.winner_season_franchise_id,jsonb_build_object('margin',rec.margin)) on conflict do nothing; if found then v_count:=v_count+1; end if; end if; insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) select p_league_id,v_ls,v_user,'weekly_awards','Week '||p_week||' awards are in',jsonb_build_object('week',p_week,'awards',jsonb_agg(jsonb_build_object('code',code,'title',title,'winner',winner_season_franchise_id,'payload',payload))) from public.weekly_awards where league_season_id=v_ls and week=p_week and not exists(select 1 from public.league_feed_events e where e.league_id=p_league_id and e.season_id=v_ls and e.event_type='weekly_awards' and (e.payload->>'week')::int=p_week) group by league_season_id; return jsonb_build_object('status','ok','week',p_week,'awards',(select count(*) from public.weekly_awards where league_season_id=v_ls and week=p_week)); end $function$;

-- get_public_league_invite(p_invite_token uuid)
CREATE OR REPLACE FUNCTION public.get_public_league_invite(p_invite_token uuid)
 RETURNS TABLE(league_id uuid, league_name text, status text, expires_at timestamp with time zone, draft_min_franchises integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select li.league_id, fl.name, li.status, li.expires_at, coalesce(fl.draft_min_franchises,10)
  from league_invites li
  join fantasy_leagues fl on fl.id=li.league_id
  where li.invite_token=p_invite_token
    and li.status='pending'
    and li.expires_at>now()
  limit 1;
$function$;

-- get_public_league_invite_v2(p_invite_token uuid)
CREATE OR REPLACE FUNCTION public.get_public_league_invite_v2(p_invite_token uuid)
 RETURNS TABLE(league_id uuid, league_name text, invite_kind text, status text, expires_at timestamp with time zone, remaining_claims integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    li.league_id,
    fl.name as league_name,
    case when li.email like 'share+%@bigexecfs.local' then 'share' else 'email' end as invite_kind,
    li.status::text,
    li.expires_at,
    greatest(0, coalesce(fl.max_franchises, 10) - (
      select count(*)::int
      from public.league_members lm
      where lm.league_id = li.league_id
    )) as remaining_claims
  from public.league_invites li
  join public.fantasy_leagues fl on fl.id = li.league_id
  where li.invite_token = p_invite_token
    and li.status = 'pending'
    and li.expires_at > now()
    and greatest(0, coalesce(fl.max_franchises, 10) - (
      select count(*)::int
      from public.league_members lm
      where lm.league_id = li.league_id
    )) > 0
  limit 1;
$function$;

-- handle_new_user_profile()
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_profiles(user_id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(coalesce(new.email,''),'@',1)))
  on conflict (user_id) do nothing;
  return new;
end $function$;

-- initialize_postseason(p_league_id uuid)
CREATE OR REPLACE FUNCTION public.initialize_postseason(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if exists(select 1 from postseason_seeds where league_season_id=v_ls) then return jsonb_build_object('status','exists','league_season_id',v_ls); end if;
  if exists(select 1 from matchups where league_season_id=v_ls and week=14 and not is_final) then raise exception 'Judgment Week must be final before postseason seeding'; end if;
  select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
  if coalesce(array_length(ranked,1),0)<>10 then raise exception 'Postseason requires 10 franchises'; end if;
  for i in 1..10 loop insert into postseason_seeds(league_season_id,season_franchise_id,seed,bracket) values(v_ls,ranked[i],i,case when i<=6 then 'championship' else 'redemption' end); end loop;
  insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,context) values
    (v_ls,15,ranked[3],ranked[6],'playoff_qf',jsonb_build_object('seeds',jsonb_build_array(3,6))),
    (v_ls,15,ranked[4],ranked[5],'playoff_qf',jsonb_build_object('seeds',jsonb_build_array(4,5))),
    (v_ls,15,ranked[7],ranked[10],'redemption_sf',jsonb_build_object('seeds',jsonb_build_array(7,10))),
    (v_ls,15,ranked[8],ranked[9],'redemption_sf',jsonb_build_object('seeds',jsonb_build_array(8,9)));
  update league_seasons set status='postseason' where id=v_ls;
  return jsonb_build_object('status','created','league_season_id',v_ls,'championship_seeds',6,'redemption_seeds',4,'week15_matchups',4);
end $function$;

-- initialize_snake_draft(p_league_id uuid, p_pick_seconds integer, p_starts_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.initialize_snake_draft(p_league_id uuid, p_pick_seconds integer DEFAULT 90, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_league_season uuid;
  v_count int;
  v_required int;
  v_draft uuid;
  v_round int;
  v_slot int;
  v_pick int := 1;
  v_sf uuid;
  v_rows uuid[];
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(
    select 1
    from public.league_members
    where league_id = p_league_id
      and user_id = v_user
      and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  select coalesce(draft_min_franchises, 10) into v_required
  from public.fantasy_leagues
  where id = p_league_id;

  select ls.id into v_league_season
  from public.league_seasons ls
  join public.competition_seasons cs on cs.id = ls.competition_season_id
  where ls.league_id = p_league_id
  order by cs.season_year desc
  limit 1;
  if v_league_season is null then raise exception 'League season missing'; end if;

  perform public.assert_late_entry_open(v_league_season, 'Creating this draft');

  update public.league_seasons
  set late_start_status = case when late_start_status = 'FORMING' then 'DRAFT_READY' else late_start_status end
  where id = v_league_season;

  select count(*) into v_count
  from public.season_franchises
  where league_season_id = v_league_season;
  if v_count < v_required then
    raise exception 'Draft requires at least % claimed franchises; currently %', v_required, v_count;
  end if;

  if exists(select 1 from public.drafts where league_season_id = v_league_season) then
    select id into v_draft
    from public.drafts
    where league_season_id = v_league_season
    order by created_at desc
    limit 1;
    return jsonb_build_object('draft_id', v_draft, 'status', 'exists');
  end if;

  with randomized as (
    select id, row_number() over(order by random())::int as pos
    from public.season_franchises
    where league_season_id = v_league_season
  )
  update public.season_franchises sf
  set draft_position = r.pos
  from randomized r
  where sf.id = r.id;

  insert into public.drafts(league_season_id, status, draft_type, rounds, pick_seconds, current_pick, starts_at)
  values(v_league_season, 'scheduled', 'snake', 15, greatest(30, least(coalesce(p_pick_seconds, 90), 300)), 0, p_starts_at)
  returning id into v_draft;

  select array_agg(id order by draft_position) into v_rows
  from public.season_franchises
  where league_season_id = v_league_season;

  for v_round in 1..15 loop
    for v_slot in 1..v_count loop
      if mod(v_round, 2) = 1 then
        v_sf := v_rows[v_slot];
      else
        v_sf := v_rows[v_count + 1 - v_slot];
      end if;
      insert into public.draft_picks(draft_id, pick_number, round_number, round_pick, season_franchise_id)
      values(v_draft, v_pick, v_round, v_slot, v_sf);
      v_pick := v_pick + 1;
    end loop;
  end loop;

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  values(p_league_id, v_league_season, v_user, 'draft_order_set', 'Draft order has been set', jsonb_build_object('draft_id', v_draft, 'franchise_count', v_count));

  return jsonb_build_object('draft_id', v_draft, 'status', 'created', 'picks', 15 * v_count, 'franchise_count', v_count);
end
$function$;

-- internal_import_athletes(p_competition_code text, p_rows jsonb)
CREATE OR REPLACE FUNCTION public.internal_import_athletes(p_competition_code text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_comp uuid; v_count int;
begin
  select id into v_comp from competitions where code=p_competition_code;
  if v_comp is null then raise exception 'Competition not found'; end if;
  insert into athletes(id,competition_id,real_team_id,display_name,position,active)
  select x.id,v_comp,x.real_team_id,x.display_name,x.position,coalesce(x.active,true)
  from jsonb_to_recordset(p_rows) as x(id uuid,real_team_id uuid,display_name text,position text,active boolean,provider text,provider_athlete_id text)
  on conflict(id) do update set real_team_id=excluded.real_team_id,display_name=excluded.display_name,position=excluded.position,active=excluded.active,updated_at=now();

  insert into athlete_provider_ids(athlete_id,provider,provider_athlete_id)
  select x.id,x.provider,x.provider_athlete_id
  from jsonb_to_recordset(p_rows) as x(id uuid,real_team_id uuid,display_name text,position text,active boolean,provider text,provider_athlete_id text)
  where x.provider is not null and x.provider_athlete_id is not null
  on conflict(provider,provider_athlete_id) do update set athlete_id=excluded.athlete_id;

  select count(*) into v_count from jsonb_array_elements(p_rows);
  return jsonb_build_object('imported',v_count);
end $function$;

-- invite_matches_current_user(p_invite_token uuid)
CREATE OR REPLACE FUNCTION public.invite_matches_current_user(p_invite_token uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.league_invites li
    join auth.users u on u.id = auth.uid()
    where li.invite_token = p_invite_token
      and li.status = 'pending'
      and li.expires_at > now()
      and lower(li.email) = lower(coalesce(u.email,''))
  );
$function$;

-- is_league_member(target_league_id uuid)
CREATE OR REPLACE FUNCTION public.is_league_member(target_league_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from league_members lm where lm.league_id=target_league_id and lm.user_id=auth.uid()) or exists(select 1 from fantasy_leagues fl where fl.id=target_league_id and fl.created_by=auth.uid()); $function$;

-- make_draft_pick(p_draft_id uuid, p_athlete_id uuid, p_real_team_id uuid, p_auto boolean)
CREATE OR REPLACE FUNCTION public.make_draft_pick(p_draft_id uuid, p_athlete_id uuid DEFAULT NULL::uuid, p_real_team_id uuid DEFAULT NULL::uuid, p_auto boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_draft public.drafts%rowtype;
  v_pick public.draft_picks%rowtype;
  v_franchise uuid;
  v_total int;
  v_league uuid;
  v_competition_id uuid;
  v_next_deadline timestamptz;
begin
  if (p_athlete_id is null) = (p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;

  select * into v_draft from public.drafts where id = p_draft_id for update;
  if v_draft.id is null or v_draft.status <> 'live' then raise exception 'Draft is not live'; end if;

  select * into v_pick
  from public.draft_picks
  where draft_id = p_draft_id and pick_number = v_draft.current_pick
  for update;
  if v_pick.id is null then raise exception 'Current pick missing'; end if;

  select f.id, f.league_id, cs.competition_id
  into v_franchise, v_league, v_competition_id
  from public.season_franchises sf
  join public.franchises f on f.id = sf.franchise_id
  join public.league_seasons ls on ls.id = v_draft.league_season_id
  join public.competition_seasons cs on cs.id = ls.competition_season_id
  where sf.id = v_pick.season_franchise_id;

  if p_auto and v_user is not null and not exists (
    select 1 from public.league_members lm
    where lm.league_id = v_league and lm.user_id = v_user and lm.role = 'commissioner'
  ) then raise exception 'Only the commissioner or draft system can auto-pick'; end if;

  if not p_auto and not exists (
    select 1 from public.franchise_owners fo
    where fo.franchise_id = v_franchise and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'Not your pick'; end if;

  if not p_auto and v_draft.current_pick_deadline_at is not null and now() > v_draft.current_pick_deadline_at then
    raise exception 'Pick clock expired';
  end if;

  if p_athlete_id is not null and not exists (
    select 1 from public.athletes
    where id = p_athlete_id
      and competition_id = v_competition_id
      and active = true
      and position in ('QB', 'RB', 'WR', 'TE', 'K')
  ) then raise exception 'Athlete is not draft eligible'; end if;

  if p_real_team_id is not null and not exists (
    select 1 from public.real_teams
    where id = p_real_team_id
      and competition_id = v_competition_id
  ) then raise exception 'D/ST is not draft eligible'; end if;

  if p_athlete_id is not null and exists (
    select 1 from public.draft_picks
    where draft_id = p_draft_id and athlete_id = p_athlete_id and picked_at is not null
  ) then raise exception 'Athlete already drafted'; end if;

  if p_real_team_id is not null and exists (
    select 1 from public.draft_picks
    where draft_id = p_draft_id and real_team_id = p_real_team_id and picked_at is not null
  ) then raise exception 'D/ST already drafted'; end if;

  update public.draft_picks
  set athlete_id = p_athlete_id,
      real_team_id = p_real_team_id,
      is_auto_pick = p_auto,
      picked_at = now()
  where id = v_pick.id;

  insert into public.roster_entries(season_franchise_id, athlete_id, real_team_id, acquired_via)
  values(v_pick.season_franchise_id, p_athlete_id, p_real_team_id, 'draft');

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  select
    ls.league_id,
    ls.id,
    v_user,
    case when p_auto then 'draft_auto_pick' else 'draft_pick' end,
    case when p_auto then 'Draft clock expired; autopick made' else 'Draft pick made' end,
    jsonb_build_object(
      'draft_id', p_draft_id,
      'pick_number', v_pick.pick_number,
      'athlete_id', p_athlete_id,
      'real_team_id', p_real_team_id,
      'season_franchise_id', v_pick.season_franchise_id
    )
  from public.league_seasons ls
  where ls.id = v_draft.league_season_id;

  select count(*) into v_total from public.draft_picks where draft_id = p_draft_id;
  if v_draft.current_pick >= v_total then
    update public.drafts
    set status = 'completed',
        completed_at = now(),
        current_pick_deadline_at = null
    where id = p_draft_id;
  else
    v_next_deadline := now() + make_interval(secs => greatest(30, least(coalesce(v_draft.pick_seconds, 90), 300)));
    update public.drafts
    set current_pick = current_pick + 1,
        current_pick_deadline_at = v_next_deadline
    where id = p_draft_id;
  end if;

  return jsonb_build_object(
    'pick_number', v_pick.pick_number,
    'season_franchise_id', v_pick.season_franchise_id,
    'auto', p_auto,
    'complete', v_draft.current_pick >= v_total
  );
end
$function$;

-- mark_late_start_after_draft(p_league_season_id uuid)
CREATE OR REPLACE FUNCTION public.mark_late_start_after_draft(p_league_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resolution record;
begin
  select * into v_resolution
  from public.resolve_late_start_activation(p_league_season_id)
  limit 1;

  update public.league_seasons
  set activation_week = v_resolution.activation_week,
      late_start_status = v_resolution.late_start_status
  where id = p_league_season_id;

  if cardinality(coalesce(v_resolution.simulated_weeks, '{}'::integer[])) > 0 then
    insert into public.historical_backfill_runs(
      league_season_id,
      idempotency_key,
      simulated_weeks,
      activation_week,
      status,
      created_by
    )
    values (
      p_league_season_id,
      'late-start:' || p_league_season_id::text || ':' || array_to_string(v_resolution.simulated_weeks, ','),
      v_resolution.simulated_weeks,
      v_resolution.activation_week,
      'pending',
      auth.uid()
    )
    on conflict (league_season_id, idempotency_key)
    do update set
      simulated_weeks = excluded.simulated_weeks,
      activation_week = excluded.activation_week,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'league_season_id', p_league_season_id,
    'activation_week', v_resolution.activation_week,
    'simulated_weeks', v_resolution.simulated_weeks,
    'late_start_status', v_resolution.late_start_status
  );
end;
$function$;

-- move_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid, p_direction text)
CREATE OR REPLACE FUNCTION public.move_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid, p_direction text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_item public.draft_queues%rowtype;
  v_swap public.draft_queues%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_direction not in ('up', 'down') then raise exception 'Unsupported queue movement'; end if;

  select * into v_item
  from public.draft_queues
  where id = p_queue_item_id and draft_id = p_draft_id
  for update;

  if v_item.id is null then raise exception 'Queue item not found'; end if;
  if not exists (
    select 1
    from public.season_franchises sf
    join public.franchise_owners fo on fo.franchise_id = sf.franchise_id
    where sf.id = v_item.season_franchise_id
      and fo.user_id = v_user
      and fo.ends_on is null
  ) then raise exception 'You do not own this queue item'; end if;

  perform pg_advisory_xact_lock(hashtextextended('draft_queue:' || p_draft_id::text || ':' || v_item.season_franchise_id::text, 0));

  if p_direction = 'up' then
    select * into v_swap
    from public.draft_queues
    where draft_id = p_draft_id
      and season_franchise_id = v_item.season_franchise_id
      and queue_rank < v_item.queue_rank
    order by queue_rank desc, created_at desc, id desc
    limit 1
    for update;
  else
    select * into v_swap
    from public.draft_queues
    where draft_id = p_draft_id
      and season_franchise_id = v_item.season_franchise_id
      and queue_rank > v_item.queue_rank
    order by queue_rank asc, created_at asc, id asc
    limit 1
    for update;
  end if;

  if v_swap.id is null then return v_item.id; end if;

  update public.draft_queues set queue_rank = v_swap.queue_rank where id = v_item.id;
  update public.draft_queues set queue_rank = v_item.queue_rank where id = v_swap.id;

  return v_item.id;
end
$function$;

-- pause_draft(p_draft_id uuid)
CREATE OR REPLACE FUNCTION public.pause_draft(p_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_league uuid;
  v_remaining integer;
begin
  select ls.league_id into v_league
  from public.drafts d
  join public.league_seasons ls on ls.id = d.league_season_id
  where d.id = p_draft_id;

  if not exists (
    select 1 from public.league_members
    where league_id = v_league and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  update public.drafts
  set status = 'paused',
      paused_at = now(),
      paused_remaining_seconds = greatest(
        0,
        coalesce(
          ceil(extract(epoch from (current_pick_deadline_at - now())))::integer,
          greatest(30, least(coalesce(pick_seconds, 90), 300))
        )
      ),
      current_pick_deadline_at = null
  where id = p_draft_id and status = 'live'
  returning paused_remaining_seconds into v_remaining;

  if v_remaining is null then raise exception 'Draft is not live'; end if;

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  select ls.league_id, ls.id, v_user, 'draft_paused', 'Draft paused by commissioner', jsonb_build_object('draft_id', p_draft_id, 'remaining_seconds', v_remaining)
  from public.drafts d
  join public.league_seasons ls on ls.id = d.league_season_id
  where d.id = p_draft_id;

  return jsonb_build_object('draft_id', p_draft_id, 'status', 'paused', 'remaining_seconds', v_remaining);
end
$function$;

-- post_draft_completion_letter()
CREATE OR REPLACE FUNCTION public.post_draft_completion_letter()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_league_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select league_id into v_league_id from public.league_seasons where id = new.league_season_id;
  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  select v_league_id, new.league_season_id, null, 'draft_completed',
    E'Dear Franchise Managers,\n\nCongratulations. The draft is complete, your franchises are built, and a new Big Exec season is officially underway. Every pick is now part of your team’s story.\n\nThank you for showing up, making the calls, and competing together. Set your lineups, watch the waiver wire, talk your talk, and take care of business each week.\n\nLet’s have a great season—and get ready for some football.\n\n— Big Exec Fantasy Sports',
    jsonb_build_object('draft_id', new.id, 'letter', true)
  where v_league_id is not null and not exists (
    select 1 from public.league_feed_events event
    where event.event_type = 'draft_completed' and event.payload->>'draft_id' = new.id::text
  );
  return new;
end
$function$;

-- post_generated_message(p_message_id uuid, p_body text)
CREATE OR REPLACE FUNCTION public.post_generated_message(p_message_id uuid, p_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); gm generated_messages%rowtype; v_event uuid; v_body text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select * into gm from generated_messages where id=p_message_id and requested_by=v_user;
 if gm.id is null then raise exception 'Generated message not found'; end if;
 if not is_league_member(gm.league_id) then raise exception 'League access required'; end if;
 v_body:=trim(coalesce(nullif(p_body,''),gm.body));
 if char_length(v_body)<1 or char_length(v_body)>1200 then raise exception 'Post must be between 1 and 1200 characters'; end if;
 insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
 values(gm.league_id,gm.league_season_id,v_user,'postgame_talk',v_body,jsonb_build_object('tone',gm.tone,'provider',gm.provider,'matchup_id',gm.matchup_id,'generated_message_id',gm.id)) returning id into v_event;
 return jsonb_build_object('status','posted','event_id',v_event,'league_id',gm.league_id);
end $function$;

-- post_locker_room_message(p_league_id uuid, p_body text)
CREATE OR REPLACE FUNCTION public.post_locker_room_message(p_league_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_user uuid:=auth.uid(); v_event uuid; v_body text:=trim(p_body); v_ls uuid; begin if v_user is null then raise exception 'Authentication required'; end if; if not public.is_league_member(p_league_id) then raise exception 'League access required'; end if; if v_body is null or char_length(v_body)<1 or char_length(v_body)>1000 then raise exception 'Message must be between 1 and 1000 characters'; end if; v_ls:=public.current_league_season_id(p_league_id); if v_ls is null then raise exception 'Current league season not found'; end if; insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'locker_room_message',v_body,'{}') returning id into v_event; return jsonb_build_object('status','posted','event_id',v_event); end $function$;

-- post_trade_message(p_trade_id uuid, p_body text)
CREATE OR REPLACE FUNCTION public.post_trade_message(p_trade_id uuid, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_body text:=trim(p_body); v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if v_body is null or char_length(v_body)<1 or char_length(v_body)>1000 then raise exception 'Message must be between 1 and 1000 characters'; end if;
 if not exists(select 1 from trades t where t.id=p_trade_id and t.status='proposed' and (
   exists(select 1 from season_franchises a join franchise_owners fa on fa.franchise_id=a.franchise_id where a.id=t.proposed_by_franchise_id and fa.user_id=v_user and fa.ends_on is null)
   or exists(select 1 from season_franchises b join franchise_owners fb on fb.franchise_id=b.franchise_id where b.id=t.proposed_to_franchise_id and fb.user_id=v_user and fb.ends_on is null))) then raise exception 'Trade room access required'; end if;
 insert into trade_messages(trade_id,user_id,body) values(p_trade_id,v_user,v_body) returning id into v_id;
 return jsonb_build_object('status','posted','message_id',v_id);
end $function$;

-- prevent_beta_feedback_submission_changes()
CREATE OR REPLACE FUNCTION public.prevent_beta_feedback_submission_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  raise exception 'Raw beta feedback submissions are immutable';
end;
$function$;

-- prevent_started_roster_asset_drop()
CREATE OR REPLACE FUNCTION public.prevent_started_roster_asset_drop()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.dropped_at is not null or new.dropped_at is null then return new; end if;
  if public.roster_asset_game_has_started(old.id) then
    raise exception 'This roster asset is locked because its game has started';
  end if;
  return new;
end
$function$;

-- process_all_due_waivers()
CREATE OR REPLACE FUNCTION public.process_all_due_waivers()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_ls record; v_result jsonb; v_leagues integer:=0; v_processed integer:=0;
begin
  for v_ls in select distinct league_season_id from waiver_holds where status='open' and clears_at<=now() loop
    v_result:=process_due_waivers(v_ls.league_season_id); v_leagues:=v_leagues+1; v_processed:=v_processed+coalesce((v_result->>'processed')::integer,0);
  end loop;
  return jsonb_build_object('status','ok','league_seasons',v_leagues,'processed',v_processed);
end $function$;

-- process_due_waivers(p_league_season_id uuid)
CREATE OR REPLACE FUNCTION public.process_due_waivers(p_league_season_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hold public.waiver_holds%rowtype; v_claim record; v_roster_config jsonb;
  v_roster_limit integer; v_active_count integer; v_drop_athlete uuid; v_drop_team uuid;
  v_period integer; v_league uuid; v_winner uuid; v_processed integer := 0;
  v_claimed integer := 0; v_integrity jsonb; v_override uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('waivers:' || p_league_season_id::text, 0));
  select roster_config, waiver_period_hours, league_id into v_roster_config, v_period, v_league
  from public.league_seasons where id = p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  select coalesce(sum(value::int),0)+coalesce((v_roster_config->>'bench')::int,0)
  into v_roster_limit from jsonb_each_text(coalesce(v_roster_config->'starters','{}'::jsonb));

  for v_hold in select * from public.waiver_holds
    where league_season_id=p_league_season_id and status='open' and clears_at<=now()
    order by clears_at,id for update skip locked
  loop
    v_processed:=v_processed+1; v_winner:=null;
    if exists (
      select 1 from public.roster_entries re join public.season_franchises sf on sf.id=re.season_franchise_id
      where sf.league_season_id=p_league_season_id and re.dropped_at is null
        and ((v_hold.athlete_id is not null and re.athlete_id=v_hold.athlete_id)
          or (v_hold.real_team_id is not null and re.real_team_id=v_hold.real_team_id))
    ) then
      update public.waiver_claims set status='failed',resolved_at=now(),failure_reason='Asset is no longer available'
      where waiver_hold_id=v_hold.id and status='pending';
      update public.waiver_holds set status='expired',resolved_at=now() where id=v_hold.id;
      continue;
    end if;

    for v_claim in
      with ranked as (
        select wc.*, row_number() over (order by
          case when (s.wins+s.losses+s.ties)=0 then 0 else 1 end asc,
          case when (s.wins+s.losses+s.ties)=0 then sf.draft_position end desc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then (s.wins+0.5*s.ties)::numeric/(s.wins+s.losses+s.ties) end asc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then s.points_for end asc nulls last,
          wc.created_at asc,wc.id asc) as calculated_priority
        from public.waiver_claims wc
        join public.season_franchises sf on sf.id=wc.season_franchise_id
        join public.standings s on s.league_season_id=p_league_season_id and s.season_franchise_id=wc.season_franchise_id
        where wc.waiver_hold_id=v_hold.id and wc.status='pending'
      ) select * from ranked order by calculated_priority
    loop
      update public.waiver_claims set priority_rank=v_claim.calculated_priority where id=v_claim.id;
      select count(*) into v_active_count from public.roster_entries
      where season_franchise_id=v_claim.season_franchise_id and dropped_at is null;
      if v_active_count>=v_roster_limit and v_claim.drop_roster_entry_id is null then
        update public.waiver_claims set status='failed',resolved_at=now(),
          failure_reason='Roster is full and no drop was selected' where id=v_claim.id;
        continue;
      end if;

      v_drop_athlete:=null; v_drop_team:=null;
      if v_claim.drop_roster_entry_id is not null then
        select athlete_id,real_team_id into v_drop_athlete,v_drop_team
        from public.roster_entries where id=v_claim.drop_roster_entry_id
          and season_franchise_id=v_claim.season_franchise_id and dropped_at is null for update;
        if not found then
          update public.waiver_claims set status='failed',resolved_at=now(),
            failure_reason='Selected drop is no longer on roster' where id=v_claim.id;
          continue;
        end if;
        if public.roster_asset_game_has_started(v_claim.drop_roster_entry_id) then
          update public.waiver_claims set status='failed',resolved_at=now(),
            failure_reason='Selected drop is locked because their game has started' where id=v_claim.id;
          continue;
        end if;

        v_integrity:=public.evaluate_roster_integrity_drop(v_claim.drop_roster_entry_id,'waiver_award');
        if not coalesce((v_integrity->>'allowed')::boolean,false) then
          update public.waiver_claims set status='failed',resolved_at=now(),
            failure_reason=coalesce(v_integrity->>'message','Roster Integrity blocked the selected drop')
          where id=v_claim.id;
          continue;
        end if;
        if v_integrity->>'override_id' is not null then
          v_override:=public.consume_roster_integrity_override(v_claim.drop_roster_entry_id);
        end if;

        delete from public.lineups l where l.season_franchise_id=v_claim.season_franchise_id
          and l.locked_at is null and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete)
            or (v_drop_team is not null and l.real_team_id=v_drop_team));
        perform set_config('big_exec.roster_drop_context','waiver_award_prechecked',true);
        update public.roster_entries set dropped_at=now()
        where id=v_claim.drop_roster_entry_id and dropped_at is null;
        perform set_config('big_exec.roster_drop_context','',true);
        insert into public.waiver_holds(league_season_id,athlete_id,real_team_id,
          source_roster_entry_id,source_season_franchise_id,clears_at)
        values(p_league_season_id,v_drop_athlete,v_drop_team,v_claim.drop_roster_entry_id,
          v_claim.season_franchise_id,now()+make_interval(hours=>v_period));
      end if;

      insert into public.roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via)
      values(v_claim.season_franchise_id,v_hold.athlete_id,v_hold.real_team_id,'waiver');
      v_winner:=v_claim.season_franchise_id;
      update public.waiver_claims set status='won',resolved_at=now(),failure_reason=null where id=v_claim.id;
      update public.waiver_claims set status='lost',resolved_at=now()
        where waiver_hold_id=v_hold.id and status='pending' and id<>v_claim.id;
      update public.waiver_holds set status='claimed',claimed_by_season_franchise_id=v_winner,
        resolved_at=now() where id=v_hold.id;
      insert into public.league_feed_events(league_id,season_id,event_type,body,payload)
      values(v_league,p_league_season_id,'waiver_claimed','Waiver claim awarded',
        jsonb_build_object('waiver_hold_id',v_hold.id,'winner_season_franchise_id',v_winner,
          'athlete_id',v_hold.athlete_id,'real_team_id',v_hold.real_team_id));
      v_claimed:=v_claimed+1; exit;
    end loop;
    if v_winner is null then
      update public.waiver_holds set status='expired',resolved_at=now()
      where id=v_hold.id and status='open';
    end if;
  end loop;
  return jsonb_build_object('status','ok','processed',v_processed,'claimed',v_claimed);
end
$function$;

-- process_expired_draft_picks(p_draft_id uuid, p_limit integer)
CREATE OR REPLACE FUNCTION public.process_expired_draft_picks(p_draft_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_processed integer := 0;
  v_draft record;
  v_pick public.draft_picks%rowtype;
  v_athlete_id uuid;
  v_real_team_id uuid;
  v_result jsonb;
  v_needed_positions text[];
  v_unmet_deficit integer;
  v_remaining_picks integer;
begin
  if v_user is not null then
    if p_draft_id is null then raise exception 'Draft id required'; end if;
    if not exists (
      select 1
      from public.drafts d
      join public.league_seasons ls on ls.id = d.league_season_id
      join public.league_members lm on lm.league_id = ls.league_id
      where d.id = p_draft_id
        and lm.user_id = v_user
    ) then raise exception 'League member access required'; end if;
  end if;

  for v_draft in
    select d.id, d.league_season_id, d.current_pick, cs.competition_id
    from public.drafts d
    join public.league_seasons ls on ls.id = d.league_season_id
    join public.competition_seasons cs on cs.id = ls.competition_season_id
    where d.status = 'live'
      and d.current_pick_deadline_at is not null
      and d.current_pick_deadline_at <= now()
      and (p_draft_id is null or d.id = p_draft_id)
    order by d.current_pick_deadline_at, d.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    perform pg_advisory_xact_lock(hashtextextended('draft_autopick:' || v_draft.id::text, 0));

    select * into v_pick
    from public.draft_picks
    where draft_id = v_draft.id and pick_number = v_draft.current_pick and picked_at is null
    for update;

    if v_pick.id is null then
      continue;
    end if;

    v_athlete_id := null;
    v_real_team_id := null;

    select q.athlete_id, q.real_team_id
    into v_athlete_id, v_real_team_id
    from public.draft_queues q
    left join public.athletes a on a.id = q.athlete_id
    left join public.real_teams rt on rt.id = q.real_team_id
    where q.draft_id = v_draft.id
      and q.season_franchise_id = v_pick.season_franchise_id
      and ((q.athlete_id is not null
          and a.competition_id = v_draft.competition_id
          and a.active = true
          and a.position in ('QB', 'RB', 'WR', 'TE', 'K')
          and not exists (
            select 1 from public.draft_picks dp
            where dp.draft_id = v_draft.id and dp.athlete_id = q.athlete_id and dp.picked_at is not null
          ))
        or (q.real_team_id is not null
          and rt.competition_id = v_draft.competition_id
          and not exists (
            select 1 from public.draft_picks dp
            where dp.draft_id = v_draft.id and dp.real_team_id = q.real_team_id and dp.picked_at is not null
          )))
    order by q.queue_rank, q.created_at, q.id
    limit 1;

    if v_athlete_id is null and v_real_team_id is null then
      select
        coalesce(array_agg(distinct replace(n.need_position, '_FLEX', '')), '{}'::text[]),
        coalesce(sum(case when n.need_position like '%\_FLEX' then 0 else n.deficit end), 0)
          + coalesce(max(case when n.need_position like '%\_FLEX' then n.deficit else 0 end), 0)
      into v_needed_positions, v_unmet_deficit
      from public.draft_roster_needs(v_pick.season_franchise_id) n;

      select count(*) into v_remaining_picks
      from public.draft_picks dp
      where dp.draft_id = v_draft.id
        and dp.season_franchise_id = v_pick.season_franchise_id
        and dp.picked_at is null;

      if v_unmet_deficit > 0 and v_unmet_deficit >= v_remaining_picks then
        select c.athlete_id, c.real_team_id
        into v_athlete_id, v_real_team_id
        from public.draft_autopick_candidate(v_draft.id, v_draft.competition_id, v_needed_positions) c;
      end if;

      if v_athlete_id is null and v_real_team_id is null then
        select c.athlete_id, c.real_team_id
        into v_athlete_id, v_real_team_id
        from public.draft_autopick_candidate(v_draft.id, v_draft.competition_id, null) c;
      end if;
    end if;

    if v_athlete_id is null and v_real_team_id is null then
      raise exception 'No legal draft asset available for autopick';
    end if;

    v_result := public.make_draft_pick(v_draft.id, v_athlete_id, v_real_team_id, true);
    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object('processed', v_processed);
end
$function$;

-- provision_franchise_stadium()
CREATE OR REPLACE FUNCTION public.provision_franchise_stadium()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into public.stadiums(franchise_id,environment_key)
  values(new.id,'starter')
  on conflict (franchise_id) do nothing;
  return new;
end
$function$;

-- publish_finalized_league_week(p_league_season_id uuid, p_week integer)
CREATE OR REPLACE FUNCTION public.publish_finalized_league_week(p_league_season_id uuid, p_week integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_league_id uuid;
  v_matchup_count integer;
  v_open_count integer;
  v_script_id uuid;
  v_top recap_matchup_moments%rowtype;
  v_moments jsonb;
begin
  select league_id into v_league_id
  from league_seasons where id = p_league_season_id;
  if v_league_id is null then raise exception 'League season not found'; end if;

  select count(*), count(*) filter (where not is_final)
    into v_matchup_count, v_open_count
  from matchups
  where league_season_id = p_league_season_id and week = p_week;
  if v_matchup_count = 0 or v_open_count > 0 then return null; end if;

  insert into recap_matchup_moments(
    league_season_id, matchup_id, week, story_score, selection_reason, title, facts, updated_at
  )
  select
    m.league_season_id,
    m.id,
    m.week,
    greatest(0, 50 - abs(m.home_points - m.away_points))
      + greatest(m.home_points, m.away_points) / 10,
    case
      when abs(m.home_points - m.away_points) <= 3 then 'closest_finish'
      when greatest(m.home_points, m.away_points) >= 150 then 'elite_team_score'
      when abs(m.home_points - m.away_points) >= 40 then 'decisive_result'
      else 'week_result'
    end,
    case
      when m.winner_season_franchise_id is null then hf.name || ' and ' || af.name || ' finish level'
      when m.winner_season_franchise_id = m.home_season_franchise_id then hf.name || ' defeats ' || af.name
      else af.name || ' defeats ' || hf.name
    end,
    jsonb_build_object(
      'home_name', hf.name, 'away_name', af.name,
      'home_points', m.home_points, 'away_points', m.away_points,
      'winner_season_franchise_id', m.winner_season_franchise_id,
      'margin', abs(m.home_points - m.away_points),
      'event_type', m.event_type
    ),
    now()
  from matchups m
  join season_franchises hsf on hsf.id = m.home_season_franchise_id
  join franchises hf on hf.id = hsf.franchise_id
  join season_franchises asf on asf.id = m.away_season_franchise_id
  join franchises af on af.id = asf.franchise_id
  where m.league_season_id = p_league_season_id and m.week = p_week and m.is_final
  on conflict (matchup_id) do update set
    story_score = excluded.story_score,
    selection_reason = excluded.selection_reason,
    title = excluded.title,
    facts = excluded.facts,
    updated_at = now();

  select * into v_top
  from recap_matchup_moments
  where league_season_id = p_league_season_id and week = p_week
  order by story_score desc, matchup_id
  limit 1;

  select jsonb_agg(jsonb_build_object(
    'matchup_id', ranked.matchup_id,
    'story_score', ranked.story_score,
    'selection_reason', ranked.selection_reason,
    'title', ranked.title,
    'facts', ranked.facts
  ) order by ranked.story_score desc, ranked.matchup_id)
  into v_moments
  from (
    select * from recap_matchup_moments
    where league_season_id = p_league_season_id and week = p_week
    order by story_score desc, matchup_id
    limit 5
  ) ranked;

  insert into recap_scripts(
    matchup_id, league_season_id, title, summary, format_version,
    recap_kind, week, story_score, selection_reason, updated_at
  ) values (
    null, p_league_season_id, 'Week ' || p_week || ': League in Review',
    v_top.title || ' led the week at ' || (v_top.facts->>'home_points') || '–' || (v_top.facts->>'away_points') || '.',
    2, 'league_week', p_week, v_top.story_score, v_top.selection_reason, now()
  )
  on conflict (league_season_id, week) where recap_kind = 'league_week'
  do update set title = excluded.title, summary = excluded.summary,
    story_score = excluded.story_score, selection_reason = excluded.selection_reason, updated_at = now()
  returning id into v_script_id;

  delete from recap_scenes where recap_script_id = v_script_id;
  insert into recap_scenes(recap_script_id, scene_index, scene_kind, duration_ms, payload) values
    (v_script_id, 1, 'stadium_open', 4000, jsonb_build_object('week', p_week, 'home', 'BIG EXEC', 'away', 'WEEK ' || p_week, 'event_type', 'league_week')),
    (v_script_id, 2, 'score_reveal', 5000, jsonb_build_object('home', v_top.facts->>'home_name', 'away', v_top.facts->>'away_name', 'home_points', v_top.facts->>'home_points', 'away_points', v_top.facts->>'away_points', 'moments', v_moments)),
    (v_script_id, 3, 'winner_moment', 6500, jsonb_build_object('winner', v_top.title, 'loser', '', 'margin', v_top.facts->>'margin', 'effect', 'exec_celebration')),
    (v_script_id, 4, 'final_card', 4500, jsonb_build_object('title', 'WEEK ' || p_week || ' FINAL', 'matchups', v_matchup_count));

  insert into recap_renders(recap_script_id, aspect_ratio, status)
  values (v_script_id, '16:9', 'pending'), (v_script_id, '9:16', 'pending')
  on conflict(recap_script_id, aspect_ratio) do nothing;

  insert into league_news_stories(
    league_id, league_season_id, week, source_type, source_key,
    prominence, headline, dek, href, facts
  ) values (
    v_league_id, p_league_season_id, p_week, 'weekly_recap',
    p_league_season_id::text || ':' || p_week::text, 'headline',
    'Week ' || p_week || ' is final',
    v_top.title || '. The league-wide recap is being prepared from the strongest verified moments across every matchup.',
    '/recaps/' || v_script_id::text,
    jsonb_build_object('recap_script_id', v_script_id, 'moments', v_moments)
  )
  on conflict (league_id, source_type, source_key) do update set
    headline = excluded.headline, dek = excluded.dek, href = excluded.href,
    facts = excluded.facts, published_at = now();

  return v_script_id;
end
$function$;

-- rebuild_five_season_history_lab(p_owner_user_id uuid)
CREATE OR REPLACE FUNCTION public.rebuild_five_season_history_lab(p_owner_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k constant text:='big_exec_five_season_history_v1'; old_league uuid; comp uuid; scoring uuid; league uuid; ls uuid; current_ls uuid; cs uuid; u uuid; synthetic uuid[]:='{}'; f uuid[]:='{}'; sf uuid[]; rank_sf uuid[]; rank_idx int[]; leaders int[]:=array[1,2,3,1,4]; wins int[]:=array[11,10,9,8,7,6,6,5,4,4]; names text[]:=array['Ironclad Syndicate','Neon Kings','Blacktop Empire','Gold Standard','Midnight Boardroom','Apex Authority','Velvet Hammers','Crown District','Fourth Quarter','Legacy House']; abbr text[]:=array['IRON','NEON','BLKT','GOLD','MIDN','APEX','VLVT','CRWN','4QTR','LGCY']; pri text[]:=array['#D9B43B','#9B7BFF','#E76F51','#F2C94C','#4169E1','#00A6A6','#B76E79','#E0B94E','#FF7A00','#9A7B4F']; sec text[]:=array['#08090A','#0B0B0C','#101114','#121212','#080A12','#091313','#160D10','#0B0B0C','#111111','#F5F1E8']; y int; yr int; i int; a int; b int; leader int; hp numeric; ap numeric; win_sf uuid; lose_sf uuid; mid uuid; final_id uuid; red_id uuid; ach uuid; script_id uuid;
begin
if not exists(select 1 from auth.users where id=p_owner_user_id) then raise exception 'Owner auth user not found'; end if; select league_id into old_league from public.qa_fixture_leagues where fixture_key=k; if old_league is not null then delete from public.fantasy_leagues where id=old_league; end if; for u in select user_id from public.qa_fixture_users where fixture_key=k loop delete from auth.users where id=u; end loop; delete from public.qa_fixture_users where fixture_key=k; delete from public.qa_fixture_leagues where fixture_key=k;
select id into comp from public.competitions where code='pro_football'; select id into scoring from public.scoring_profiles where sport='football' and is_system_default limit 1; if comp is null or scoring is null then raise exception 'Pro Football foundation missing'; end if; for yr in 2021..2026 loop insert into public.competition_seasons(competition_id,season_year) values(comp,yr) on conflict(competition_id,season_year) do nothing; end loop;
insert into public.fantasy_leagues(name,created_by,draft_min_franchises,max_franchises) values('Big Exec Five-Year History Lab',p_owner_user_id,10,10) returning id into league; insert into public.qa_fixture_leagues(fixture_key,league_id) values(k,league); insert into public.league_members(league_id,user_id,role) values(league,p_owner_user_id,'commissioner');
for i in 2..10 loop u:=gen_random_uuid(); insert into auth.users(id,aud,role,raw_app_meta_data,raw_user_meta_data,is_sso_user,is_anonymous,created_at,updated_at) values(u,'authenticated','authenticated',jsonb_build_object('provider','history_lab','providers',jsonb_build_array(),'big_exec_history_lab',true),jsonb_build_object('display_name','History Manager '||i),false,false,now(),now()); insert into public.qa_fixture_users(fixture_key,user_id) values(k,u); synthetic:=array_append(synthetic,u); insert into public.user_profiles(user_id,display_name) values(u,'History Manager '||i) on conflict(user_id) do update set display_name=excluded.display_name,updated_at=now(); insert into public.league_members(league_id,user_id,role) values(league,u,'manager'); end loop;
for i in 1..10 loop insert into public.franchises(league_id,name,abbreviation,primary_color,secondary_color,established_year) values(league,names[i],abbr[i],pri[i],sec[i],2021) returning id into u; f:=array_append(f,u); insert into public.stadiums(franchise_id,environment_key) values(u,'neon_dome') on conflict(franchise_id) do nothing; insert into public.franchise_owners(franchise_id,user_id,starts_on) values(u,case when i=1 then p_owner_user_id else synthetic[i-1] end,'2021-08-01'); end loop; for i in 1..5 loop insert into public.rivalries(league_id,franchise_a_id,franchise_b_id,designated,rivalry_score) values(league,f[2*i-1],f[2*i],true,100-i*7); end loop;
for y in 1..5 loop yr:=2020+y; leader:=leaders[y]; select id into cs from public.competition_seasons where competition_id=comp and season_year=yr; insert into public.league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id,trade_deadline_at,waiver_period_hours,is_current) values(league,cs,'complete','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,scoring,make_timestamptz(yr,11,10,21,0,0,'UTC'),48,false) returning id into ls; sf:='{}'; rank_idx:='{}'; rank_sf:='{}'; for i in 1..10 loop rank_idx:=array_append(rank_idx,mod(leader+i-2,10)+1); end loop; for i in 1..10 loop insert into public.season_franchises(league_season_id,franchise_id,draft_position) values(ls,f[i],mod(i+y-2,10)+1) returning id into u; sf:=array_append(sf,u); end loop; for i in 1..10 loop rank_sf:=array_append(rank_sf,sf[rank_idx[i]]); end loop; for i in 1..10 loop insert into public.standings(league_season_id,season_franchise_id,wins,losses,ties,points_for,points_against,streak) values(ls,rank_sf[i],wins[i],14-wins[i],0,1900-i*47+y*11,1600+i*39-y*7,case when i<=3 then 2 else -1 end); insert into public.postseason_seeds(league_season_id,season_franchise_id,seed,bracket) values(ls,rank_sf[i],i,case when i<=6 then 'championship' else 'redemption' end); end loop;
for i in 1..5 loop a:=2*i-1; b:=2*i; if mod(y+i,2)=0 then hp:=124+i+y/10.0; ap:=116+i; win_sf:=sf[a]; lose_sf:=sf[b]; else hp:=112+i; ap:=126+i+y/10.0; win_sf:=sf[b]; lose_sf:=sf[a]; end if; insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context) values(ls,10,sf[a],sf[b],'rivalry',hp,ap,win_sf,true,jsonb_build_object('designated',true,'fixture','history_lab')) returning id into mid; select id into ach from public.achievements where code='RIVALRY_WIN'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,10,jsonb_build_object('matchup_id',mid,'opponent',lose_sf)); end loop;
for i in 1..5 loop a:=2*i-1; b:=2*i; if mod(y+i,2)=0 then hp:=109+i; ap:=130+i; win_sf:=sf[b]; lose_sf:=sf[a]; else hp:=131+i; ap:=108+i; win_sf:=sf[a]; lose_sf:=sf[b]; end if; insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context) values(ls,11,sf[a],sf[b],'revenge',hp,ap,win_sf,true,jsonb_build_object('fixture','history_lab')) returning id into mid; select id into ach from public.achievements where code='REVENGE_COMPLETE'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,11,jsonb_build_object('matchup_id',mid,'opponent',lose_sf)); end loop;
for i in 1..5 loop if i=1 then hp:=104+y; ap:=137+y; win_sf:=rank_sf[10]; else hp:=133-i+y/10.0; ap:=101+i; win_sf:=rank_sf[i]; end if; insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context) values(ls,13,rank_sf[i],rank_sf[11-i],'chaos',hp,ap,win_sf,true,jsonb_build_object('home_seed',i,'away_seed',11-i,'format','standings_inversion')) returning id into mid; if i=1 then select id into ach from public.achievements where code='CHAOS_GIANT_KILLER'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,13,jsonb_build_object('matchup_id',mid,'winner_seed',10,'defeated_seed',1)); select id into ach from public.achievements where code='GIANT_KILLER'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values((select franchise_id from public.season_franchises where id=win_sf),ls,ach,13,jsonb_build_object('matchup_id',mid,'winner_seed',10,'defeated_seed',1)); end if; end loop;
insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context) values(ls,17,rank_sf[1],rank_sf[3],'championship',142+y,126,rank_sf[1],true,jsonb_build_object('fixture','history_lab')) returning id into final_id; insert into public.matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type,home_points,away_points,winner_season_franchise_id,is_final,context) values(ls,17,rank_sf[7],rank_sf[8],'redemption_final',132+y,121,rank_sf[7],true,jsonb_build_object('fixture','history_lab')) returning id into red_id; insert into public.championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id,awarded_at) values(ls,'championship',rank_sf[1],rank_sf[3],final_id,make_timestamptz(yr,12,31,18,0,0,'UTC')),(ls,'redemption',rank_sf[7],rank_sf[8],red_id,make_timestamptz(yr,12,31,18,5,0,'UTC')); select id into ach from public.achievements where code='LEAGUE_CHAMPION'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,earned_at,payload) values((select franchise_id from public.season_franchises where id=rank_sf[1]),ls,ach,17,make_timestamptz(yr,12,31,18,0,0,'UTC'),jsonb_build_object('matchup_id',final_id,'season_year',yr)); select id into ach from public.achievements where code='REDEMPTION_CHAMPION'; insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,earned_at,payload) values((select franchise_id from public.season_franchises where id=rank_sf[7]),ls,ach,17,make_timestamptz(yr,12,31,18,5,0,'UTC'),jsonb_build_object('matchup_id',red_id,'season_year',yr)); if y=1 then select id into ach from public.achievements where code='FIRST_WIN'; for i in 1..10 loop insert into public.franchise_achievements(franchise_id,league_season_id,achievement_id,week,earned_at,payload) values(f[i],ls,ach,1,make_timestamptz(yr,9,15,12,0,0,'UTC'),jsonb_build_object('fixture',true)); end loop; end if;
insert into public.recap_scripts(matchup_id,league_season_id,winner_season_franchise_id,loser_season_franchise_id,title,summary,created_at,updated_at) values(final_id,ls,rank_sf[1],rank_sf[3],yr||' Championship: '||(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[1]),'A permanent Big Exec championship memory.',make_timestamptz(yr,12,31,18,10,0,'UTC'),make_timestamptz(yr,12,31,18,10,0,'UTC')) returning id into script_id; insert into public.recap_scenes(recap_script_id,scene_index,scene_kind,duration_ms,payload) values(script_id,1,'stadium_open',4500,jsonb_build_object('week',17,'event_type','championship','home',(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[1]),'away',(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[3]))),(script_id,2,'score_reveal',5000,jsonb_build_object('home_points',142+y,'away_points',126)),(script_id,3,'winner_moment',6500,jsonb_build_object('winner',(select f2.name from public.season_franchises s2 join public.franchises f2 on f2.id=s2.franchise_id where s2.id=rank_sf[1]),'margin',16+y,'effect','laser_storm')),(script_id,4,'final_card',4500,jsonb_build_object('title',yr||' LEAGUE CHAMPION','home_points',142+y,'away_points',126)); insert into public.story_events(league_id,league_season_id,source_type,source_id,event_type,facts,created_at) values(league,ls,'season',ls,'season_complete',jsonb_build_object('season_year',yr,'champion',rank_sf[1],'redemption_champion',rank_sf[7]),make_timestamptz(yr,12,31,19,0,0,'UTC')),(league,ls,'matchup',final_id,'championship_memory',jsonb_build_object('season_year',yr,'winner',rank_sf[1]),make_timestamptz(yr,12,31,19,5,0,'UTC')); end loop;
select id into cs from public.competition_seasons where competition_id=comp and season_year=2026; insert into public.league_seasons(league_id,competition_season_id,status,roster_config,scoring_profile_id,trade_deadline_at,waiver_period_hours,is_current) values(league,cs,'setup','{"starters":{"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1,"K":1,"DST":1},"bench":6,"ir":1}'::jsonb,scoring,'2026-11-10 21:00:00+00',48,true) returning id into current_ls; for i in 1..10 loop insert into public.season_franchises(league_season_id,franchise_id,draft_position) values(current_ls,f[i],i) returning id into u; insert into public.standings(league_season_id,season_franchise_id) values(current_ls,u); perform public.sync_franchise_stadium_features(f[i]); end loop; insert into public.story_events(league_id,league_season_id,source_type,source_id,event_type,facts) values(league,current_ls,'season',current_ls,'new_season_open',jsonb_build_object('season_year',2026,'history_years',5)); insert into public.league_feed_events(league_id,season_id,event_type,body,payload) values(league,current_ls,'new_season','2026 is open. Five seasons of receipts came with you.',jsonb_build_object('history_years',5)); return jsonb_build_object('fixture_key',k,'league_id',league,'current_league_season_id',current_ls,'members',(select count(*) from public.league_members where league_id=league),'franchises',(select count(*) from public.franchises where league_id=league),'historical_seasons',(select count(*) from public.league_seasons where league_id=league and not is_current),'championships',(select count(*) from public.championships c join public.league_seasons l on l.id=c.league_season_id where l.league_id=league),'matchups',(select count(*) from public.matchups m join public.league_seasons l on l.id=m.league_season_id where l.league_id=league)); end $function$;

-- recompute_matchup(p_matchup_id uuid, p_finalize boolean)
CREATE OR REPLACE FUNCTION public.recompute_matchup(p_matchup_id uuid, p_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m matchups%rowtype; v_home numeric:=0; v_away numeric:=0; v_unfinished int:=0; v_winner uuid; v_loser uuid; v_league uuid;
begin
  select * into v_m from matchups where id=p_matchup_id for update;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  select league_id into v_league from league_seasons where id=v_m.league_season_id;
  if auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid()) then raise exception 'League access required'; end if;
  if p_finalize and auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid() and role='commissioner') then raise exception 'Commissioner access required to finalize matchup'; end if;

  select coalesce(sum(x.points),0) into v_home from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  select coalesce(sum(x.points),0) into v_away from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  update matchups set home_points=v_home,away_points=v_away where id=v_m.id;

  if p_finalize and not v_m.is_final then
    select count(*) into v_unfinished from real_games rg where rg.competition_season_id=(select competition_season_id from league_seasons where id=v_m.league_season_id) and rg.week=v_m.week and rg.state<>'final';
    if v_unfinished>0 then raise exception 'Cannot finalize while real games are unfinished'; end if;
    if v_home>v_away then v_winner:=v_m.home_season_franchise_id; v_loser:=v_m.away_season_franchise_id;
    elsif v_away>v_home then v_winner:=v_m.away_season_franchise_id; v_loser:=v_m.home_season_franchise_id;
    else v_winner:=null; end if;
    update matchups set home_points=v_home,away_points=v_away,winner_season_franchise_id=v_winner,is_final=true where id=v_m.id;
    if v_winner is null then
      update standings set ties=ties+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=0 where league_season_id=v_m.league_season_id and season_franchise_id in (v_m.home_season_franchise_id,v_m.away_season_franchise_id);
    else
      update standings set wins=wins+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak>=0 then streak+1 else 1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_winner;
      update standings set losses=losses+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak<=0 then streak-1 else -1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_loser;
    end if;
    perform award_matchup_achievements(v_m.id);
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner));
  elsif v_m.is_final then v_winner:=v_m.winner_season_franchise_id; end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',coalesce(v_winner,v_m.winner_season_franchise_id));
end $function$;

-- record_generated_message(p_matchup_id uuid, p_tone text, p_body text, p_provider text)
CREATE OR REPLACE FUNCTION public.record_generated_message(p_matchup_id uuid, p_tone text, p_body text, p_provider text DEFAULT 'template'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_league uuid; v_ls uuid; v_story uuid; v_message uuid; v_body text:=trim(p_body); v_tone text:=lower(trim(p_tone));
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if v_tone not in ('respect','playful','petty','savage') then raise exception 'Unsupported tone'; end if;
 if v_body is null or char_length(v_body)<1 or char_length(v_body)>1200 then raise exception 'Generated message must be between 1 and 1200 characters'; end if;
 select ls.league_id,m.league_season_id into v_league,v_ls from matchups m join league_seasons ls on ls.id=m.league_season_id where m.id=p_matchup_id and m.is_final;
 if v_league is null then raise exception 'Final matchup not found'; end if;
 if not is_league_member(v_league) then raise exception 'League access required'; end if;
 insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts)
 select v_league,v_ls,'matchup',m.id,'postgame_talk_requested',jsonb_build_object('week',m.week,'home_points',m.home_points,'away_points',m.away_points,'winner_season_franchise_id',m.winner_season_franchise_id,'home_season_franchise_id',m.home_season_franchise_id,'away_season_franchise_id',m.away_season_franchise_id)
 from matchups m where m.id=p_matchup_id returning id into v_story;
 insert into generated_messages(league_id,league_season_id,source_event_id,requested_by,tone,body,provider,matchup_id)
 values(v_league,v_ls,v_story,v_user,v_tone,v_body,left(coalesce(nullif(trim(p_provider),''),'template'),64),p_matchup_id) returning id into v_message;
 return jsonb_build_object('status','recorded','message_id',v_message);
end $function$;

-- record_late_start_draft_completion()
CREATE OR REPLACE FUNCTION public.record_late_start_draft_completion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    perform public.mark_late_start_after_draft(new.league_season_id);
  end if;
  return new;
end;
$function$;

-- remove_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid)
CREATE OR REPLACE FUNCTION public.remove_draft_queue_item(p_draft_id uuid, p_queue_item_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_item public.draft_queues%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_item
  from public.draft_queues
  where id = p_queue_item_id and draft_id = p_draft_id
  for update;

  if v_item.id is null then raise exception 'Queue item not found'; end if;
  if not exists (
    select 1
    from public.season_franchises sf
    join public.franchise_owners fo on fo.franchise_id = sf.franchise_id
    where sf.id = v_item.season_franchise_id
      and fo.user_id = v_user
      and fo.ends_on is null
  ) then raise exception 'You do not own this queue item'; end if;

  delete from public.draft_queues where id = v_item.id;

  with ordered as (
    select id, row_number() over (order by queue_rank, created_at, id) as next_rank
    from public.draft_queues
    where draft_id = p_draft_id and season_franchise_id = v_item.season_franchise_id
  )
  update public.draft_queues dq
  set queue_rank = ordered.next_rank
  from ordered
  where dq.id = ordered.id;

  return v_item.id;
end
$function$;

-- remove_drafted_asset_from_queues()
CREATE OR REPLACE FUNCTION public.remove_drafted_asset_from_queues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.picked_at is null then return new; end if;

  with removed as (
    delete from public.draft_queues
    where draft_id = new.draft_id
      and ((new.athlete_id is not null and athlete_id = new.athlete_id)
        or (new.real_team_id is not null and real_team_id = new.real_team_id))
    returning draft_id, season_franchise_id
  ),
  affected as (
    select distinct draft_id, season_franchise_id from removed
  ),
  ordered as (
    select
      dq.id,
      row_number() over (
        partition by dq.draft_id, dq.season_franchise_id
        order by dq.queue_rank, dq.created_at, dq.id
      ) as next_rank
    from public.draft_queues dq
    join affected on affected.draft_id = dq.draft_id
      and affected.season_franchise_id = dq.season_franchise_id
  )
  update public.draft_queues dq
  set queue_rank = ordered.next_rank
  from ordered
  where dq.id = ordered.id;

  return new;
end
$function$;

-- request_roster_integrity_review(p_roster_entry_id uuid, p_manager_note text)
CREATE OR REPLACE FUNCTION public.request_roster_integrity_review(p_roster_entry_id uuid, p_manager_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_sf uuid;
  v_ls uuid;
  v_decision jsonb;
  v_review uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select re.season_franchise_id,sf.league_season_id into v_sf,v_ls
  from roster_entries re
  join season_franchises sf on sf.id=re.season_franchise_id
  join franchise_owners fo on fo.franchise_id=sf.franchise_id
  where re.id=p_roster_entry_id and re.dropped_at is null
    and fo.user_id=v_user and fo.ends_on is null;
  if v_sf is null then raise exception 'You do not manage this roster asset'; end if;

  v_decision:=evaluate_roster_integrity_drop(p_roster_entry_id,'direct');
  if coalesce((v_decision->>'allowed')::boolean,false) then
    raise exception 'This roster asset does not currently require commissioner review';
  end if;

  insert into roster_integrity_reviews(
    league_season_id,season_franchise_id,roster_entry_id,requested_by,
    reason_code,reason_detail,manager_note,status
  ) values(
    v_ls,v_sf,p_roster_entry_id,v_user,
    coalesce(v_decision->>'reason_code','roster_integrity'),
    coalesce(v_decision->>'message','Commissioner review requested.'),
    nullif(trim(coalesce(p_manager_note,'')),''),'pending'
  )
  on conflict (roster_entry_id) where status='pending'
  do update set manager_note=excluded.manager_note,requested_at=now(),reason_code=excluded.reason_code,reason_detail=excluded.reason_detail
  returning id into v_review;

  insert into roster_integrity_audit(league_season_id,season_franchise_id,roster_entry_id,actor_id,event_type,detail)
  values(v_ls,v_sf,p_roster_entry_id,v_user,'review_requested',jsonb_build_object('review_id',v_review,'reason_code',v_decision->>'reason_code'));

  return v_review;
end
$function$;

-- resolve_late_start_activation(p_league_season_id uuid)
CREATE OR REPLACE FUNCTION public.resolve_late_start_activation(p_league_season_id uuid)
 RETURNS TABLE(activation_week integer, simulated_weeks integer[], late_start_status text, first_started_week integer, first_unstarted_week integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_competition_season uuid;
  v_started_week integer;
  v_unstarted_week integer;
  v_activation_week integer;
  v_simulated integer[];
  v_status text;
begin
  select ls.competition_season_id into v_competition_season
  from public.league_seasons ls
  where ls.id = p_league_season_id;

  if v_competition_season is null then
    raise exception 'League season not found';
  end if;

  select min(g.week) into v_started_week
  from public.real_games g
  where g.competition_season_id = v_competition_season
    and g.starts_at <= now();

  if v_started_week is null then
    select min(g.week) into v_unstarted_week
    from public.real_games g
    where g.competition_season_id = v_competition_season
      and g.starts_at > now();
    v_activation_week := coalesce(v_unstarted_week, 1);
    v_simulated := '{}'::integer[];
    v_status := 'DRAFT_READY';
  else
    select min(g.week) into v_unstarted_week
    from public.real_games g
    where g.competition_season_id = v_competition_season
      and g.week > v_started_week;
    v_activation_week := coalesce(v_unstarted_week, v_started_week + 1);
    select coalesce(array_agg(distinct g.week order by g.week), '{}'::integer[])
      into v_simulated
    from public.real_games g
    where g.competition_season_id = v_competition_season
      and g.week < v_activation_week
      and g.starts_at <= now();
    v_status := case when cardinality(v_simulated) > 0 then 'BACKFILL_PENDING' else 'ACTIVE' end;
  end if;

  return query select v_activation_week, v_simulated, v_status, v_started_week, v_unstarted_week;
end;
$function$;

-- resolve_roster_integrity_review(p_review_id uuid, p_approve boolean, p_note text)
CREATE OR REPLACE FUNCTION public.resolve_roster_integrity_review(p_review_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_review roster_integrity_reviews%rowtype;
  v_league uuid;
  v_override uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_review from roster_integrity_reviews where id=p_review_id for update;
  if v_review.id is null then raise exception 'Review request not found'; end if;
  if v_review.status<>'pending' then raise exception 'This review has already been resolved'; end if;
  select league_id into v_league from league_seasons where id=v_review.league_season_id;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner permission required';
  end if;

  update roster_integrity_reviews
  set status=case when p_approve then 'approved' else 'rejected' end,
      resolved_by=v_user,resolved_at=now(),decision_note=nullif(trim(coalesce(p_note,'')),'')
  where id=v_review.id;

  if p_approve then
    insert into roster_integrity_overrides(
      league_season_id,season_franchise_id,roster_entry_id,review_id,approved_by,note
    ) values(
      v_review.league_season_id,v_review.season_franchise_id,v_review.roster_entry_id,v_review.id,v_user,nullif(trim(coalesce(p_note,'')),'')
    ) returning id into v_override;
  end if;

  insert into roster_integrity_audit(league_season_id,season_franchise_id,roster_entry_id,actor_id,event_type,detail)
  values(v_review.league_season_id,v_review.season_franchise_id,v_review.roster_entry_id,v_user,
    case when p_approve then 'review_approved' else 'review_rejected' end,
    jsonb_build_object('review_id',v_review.id,'override_id',v_override,'note',nullif(trim(coalesce(p_note,'')),'')));

  return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end,'override_id',v_override);
end
$function$;

-- resolve_trade(p_trade_id uuid, p_action text)
CREATE OR REPLACE FUNCTION public.resolve_trade(p_trade_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  t trades%rowtype;
  v_league uuid;
  v_deadline timestamptz;
  v_last_final int:=0;
  item record;
  v_owner_from boolean;
  v_owner_to boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into t from trades where id=p_trade_id for update;
  if t.id is null then raise exception 'Trade not found'; end if;
  if t.status<>'proposed' then return jsonb_build_object('status',t.status,'already_resolved',true); end if;
  select ls.league_id, ls.trade_deadline_at into v_league, v_deadline from league_seasons ls where ls.id=t.league_season_id;

  select exists(select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=t.proposed_by_franchise_id and fo.user_id=v_user and fo.ends_on is null) into v_owner_from;
  select exists(select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=t.proposed_to_franchise_id and fo.user_id=v_user and fo.ends_on is null) into v_owner_to;
  if p_action='cancel' then if not v_owner_from then raise exception 'Only proposer can cancel'; end if; update trades set status='cancelled',resolved_at=now() where id=t.id; return jsonb_build_object('status','cancelled'); end if;
  if p_action='reject' then if not v_owner_to then raise exception 'Only recipient can reject'; end if; update trades set status='rejected',resolved_at=now() where id=t.id; return jsonb_build_object('status','rejected'); end if;
  if p_action<>'accept' then raise exception 'Unsupported trade action'; end if;
  if not v_owner_to then raise exception 'Only recipient can accept'; end if;
  if v_deadline is not null and now() >= v_deadline then raise exception 'The trade deadline has passed. This offer can no longer be accepted.'; end if;

  for item in select * from trade_items where trade_id=t.id loop
    if item.athlete_id is not null and not exists(select 1 from roster_entries where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and dropped_at is null) then raise exception 'Trade asset changed before acceptance'; end if;
    if item.real_team_id is not null and not exists(select 1 from roster_entries where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and dropped_at is null) then raise exception 'Trade asset changed before acceptance'; end if;
  end loop;
  select coalesce(max(week),0) into v_last_final from matchups where league_season_id=t.league_season_id and is_final;
  for item in select * from trade_items where trade_id=t.id loop
    if item.athlete_id is not null then
      update roster_entries set dropped_at=now() where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and dropped_at is null;
      insert into roster_entries(season_franchise_id,athlete_id,acquired_via) values(item.to_season_franchise_id,item.athlete_id,'trade');
      delete from lineups where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and week>v_last_final;
    else
      update roster_entries set dropped_at=now() where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and dropped_at is null;
      insert into roster_entries(season_franchise_id,real_team_id,acquired_via) values(item.to_season_franchise_id,item.real_team_id,'trade');
      delete from lineups where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and week>v_last_final;
    end if;
  end loop;
  update trades set status='accepted',resolved_at=now() where id=t.id;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(v_league,t.league_season_id,v_user,'trade_accepted','Trade accepted',jsonb_build_object('trade_id',t.id,'from',t.proposed_by_franchise_id,'to',t.proposed_to_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=t.id)));
  insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts)
  values(v_league,t.league_season_id,'trade',t.id,'trade_accepted',jsonb_build_object('from',t.proposed_by_franchise_id,'to',t.proposed_to_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=t.id)));
  return jsonb_build_object('status','accepted','trade_id',t.id);
end
$function$;

-- rls_auto_enable()
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- roster_asset_game_has_started(p_roster_entry_id uuid)
CREATE OR REPLACE FUNCTION public.roster_asset_game_has_started(p_roster_entry_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with asset as (
    select re.season_franchise_id,
      coalesce(a.real_team_id, re.real_team_id) as real_team_id,
      ls.competition_season_id
    from public.roster_entries re
    join public.season_franchises sf on sf.id = re.season_franchise_id
    join public.league_seasons ls on ls.id = sf.league_season_id
    left join public.athletes a on a.id = re.athlete_id
    where re.id = p_roster_entry_id and re.dropped_at is null
  ),
  active_week as (
    select rg.week
    from public.real_games rg
    join asset x on x.competition_season_id = rg.competition_season_id
    group by rg.week
    having min(rg.starts_at) <= now()
       and bool_or(coalesce(rg.state::text, 'unknown') not in ('final', 'canceled', 'postponed'))
    order by rg.week desc limit 1
  )
  select coalesce(exists (
    select 1 from asset x join active_week w on true
    join public.real_games rg
      on rg.competition_season_id = x.competition_season_id
     and rg.week = w.week
     and (rg.home_team_id = x.real_team_id or rg.away_team_id = x.real_team_id)
    where rg.starts_at <= now()
      and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
  ), false);
$function$;

-- roster_integrity_asset_is_protected(p_roster_entry_id uuid)
CREATE OR REPLACE FUNCTION public.roster_integrity_asset_is_protected(p_roster_entry_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_league_season_id uuid;
  v_athlete_id uuid;
  v_real_team_id uuid;
  v_position text;
  v_rank integer;
  v_threshold integer;
begin
  select sf.league_season_id,re.athlete_id,re.real_team_id
    into v_league_season_id,v_athlete_id,v_real_team_id
  from roster_entries re
  join season_franchises sf on sf.id=re.season_franchise_id
  where re.id=p_roster_entry_id and re.dropped_at is null;

  if v_league_season_id is null then return false; end if;

  if v_athlete_id is not null then
    select position into v_position from athletes where id=v_athlete_id;
    v_threshold:=case v_position
      when 'QB' then 12
      when 'RB' then 30
      when 'WR' then 40
      when 'TE' then 15
      when 'K' then 12
      else 0
    end;
    if v_threshold=0 then return false; end if;

    with totals as (
      select fps.athlete_id,sum(fps.points) total_points
      from fantasy_player_scores fps
      join athletes a on a.id=fps.athlete_id
      where fps.league_season_id=v_league_season_id and a.position=v_position
      group by fps.athlete_id
    ), ranked as (
      select athlete_id,row_number() over(order by total_points desc,athlete_id) rank_no
      from totals
    )
    select rank_no into v_rank from ranked where athlete_id=v_athlete_id;

    return coalesce(v_rank<=v_threshold,false);
  end if;

  if v_real_team_id is not null then
    with totals as (
      select fts.real_team_id,sum(fts.points) total_points
      from fantasy_team_scores fts
      where fts.league_season_id=v_league_season_id
      group by fts.real_team_id
    ), ranked as (
      select real_team_id,row_number() over(order by total_points desc,real_team_id) rank_no
      from totals
    )
    select rank_no into v_rank from ranked where real_team_id=v_real_team_id;
    return coalesce(v_rank<=12,false);
  end if;

  return false;
end
$function$;

-- set_franchise_roster_lock(p_season_franchise_id uuid, p_locked boolean, p_reason text)
CREATE OR REPLACE FUNCTION public.set_franchise_roster_lock(p_season_franchise_id uuid, p_locked boolean, p_reason text DEFAULT 'Eliminated from Championship and Redemption competition'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_ls uuid;
  v_league uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select sf.league_season_id,ls.league_id into v_ls,v_league
  from season_franchises sf join league_seasons ls on ls.id=sf.league_season_id
  where sf.id=p_season_franchise_id;
  if v_ls is null then raise exception 'Franchise season not found'; end if;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner permission required';
  end if;

  update season_franchises
  set roster_locked_at=case when p_locked then now() else null end,
      roster_lock_reason=case when p_locked then coalesce(nullif(trim(p_reason),''),'Season competition complete') else null end
  where id=p_season_franchise_id;

  insert into roster_integrity_audit(league_season_id,season_franchise_id,actor_id,event_type,detail)
  values(v_ls,p_season_franchise_id,v_user,case when p_locked then 'franchise_locked' else 'franchise_unlocked' end,
    jsonb_build_object('reason',case when p_locked then p_reason else null end));
  return jsonb_build_object('status','ok','locked',p_locked);
end
$function$;

-- set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_athlete_id uuid, p_real_team_id uuid)
CREATE OR REPLACE FUNCTION public.set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_athlete_id uuid DEFAULT NULL::uuid, p_real_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select public.set_lineup_slot(
    p_season_franchise_id => p_season_franchise_id,
    p_week => p_week,
    p_slot => p_slot,
    p_slot_index => 1,
    p_athlete_id => p_athlete_id,
    p_real_team_id => p_real_team_id
  );
$function$;

-- set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_slot_index integer, p_athlete_id uuid, p_real_team_id uuid)
CREATE OR REPLACE FUNCTION public.set_lineup_slot(p_season_franchise_id uuid, p_week integer, p_slot lineup_slot, p_slot_index integer DEFAULT 1, p_athlete_id uuid DEFAULT NULL::uuid, p_real_team_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_franchise uuid;
  v_league_season uuid;
  v_pos text;
  v_previous_athlete uuid;
  v_previous_real_team uuid;
  v_previous_roster_entry uuid;
  v_incoming_roster_entry uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_week < 1 or p_week > 18 then raise exception 'Invalid week'; end if;
  if p_slot_index < 1 or p_slot_index > 2 then raise exception 'Invalid slot index'; end if;
  if p_slot not in ('RB', 'WR') and p_slot_index <> 1 then raise exception 'Only RB and WR use a second indexed slot'; end if;
  if p_athlete_id is not null and p_real_team_id is not null then raise exception 'Choose only one athlete or D/ST'; end if;
  select sf.franchise_id, sf.league_season_id into v_franchise, v_league_season
  from public.season_franchises sf where sf.id = p_season_franchise_id;
  if v_franchise is null then raise exception 'Franchise season not found'; end if;
  if not exists (
    select 1 from public.franchise_owners fo
    where fo.franchise_id = v_franchise and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'Not your franchise'; end if;

  perform pg_advisory_xact_lock(hashtextextended('lineup:' || p_season_franchise_id::text || ':' || p_week::text, 0));
  perform 1 from public.lineups
  where season_franchise_id = p_season_franchise_id and week = p_week for update;

  select l.athlete_id, l.real_team_id into v_previous_athlete, v_previous_real_team
  from public.lineups l
  where l.season_franchise_id = p_season_franchise_id and l.week = p_week
    and l.slot = p_slot and l.slot_index = p_slot_index;

  if v_previous_athlete is not distinct from p_athlete_id
     and v_previous_real_team is not distinct from p_real_team_id then
    return jsonb_build_object('status','unchanged','slot',p_slot,'slot_index',p_slot_index,'week',p_week);
  end if;

  if v_previous_athlete is not null or v_previous_real_team is not null then
    select re.id into v_previous_roster_entry from public.roster_entries re
    where re.season_franchise_id = p_season_franchise_id and re.dropped_at is null
      and ((v_previous_athlete is not null and re.athlete_id = v_previous_athlete)
        or (v_previous_real_team is not null and re.real_team_id = v_previous_real_team))
    limit 1;
    if v_previous_roster_entry is not null
       and public.roster_asset_game_has_started(v_previous_roster_entry) then
      raise exception 'Lineup locked: the player or team currently in this slot has already started';
    end if;
  end if;

  if p_real_team_id is not null then
    if p_slot <> 'DST' then raise exception 'Team defense can only be placed in D/ST'; end if;
    select re.id into v_incoming_roster_entry from public.roster_entries re
    where re.season_franchise_id = p_season_franchise_id
      and re.real_team_id = p_real_team_id and re.dropped_at is null;
    if v_incoming_roster_entry is null then raise exception 'D/ST is not on roster'; end if;
  elsif p_athlete_id is not null then
    select a.position, re.id into v_pos, v_incoming_roster_entry
    from public.athletes a
    left join public.roster_entries re on re.athlete_id = a.id
      and re.season_franchise_id = p_season_franchise_id and re.dropped_at is null
    where a.id = p_athlete_id;
    if v_pos is null then raise exception 'Athlete not found'; end if;
    if v_incoming_roster_entry is null then raise exception 'Athlete is not on roster'; end if;
    if p_slot = 'QB' and v_pos <> 'QB' then raise exception 'QB slot requires QB'; end if;
    if p_slot = 'RB' and v_pos <> 'RB' then raise exception 'RB slot requires RB'; end if;
    if p_slot = 'WR' and v_pos <> 'WR' then raise exception 'WR slot requires WR'; end if;
    if p_slot = 'TE' and v_pos <> 'TE' then raise exception 'TE slot requires TE'; end if;
    if p_slot = 'K' and v_pos <> 'K' then raise exception 'K slot requires kicker'; end if;
    if p_slot = 'FLEX' and v_pos not in ('RB','WR','TE') then raise exception 'FLEX requires RB, WR, or TE'; end if;
    if p_slot = 'DST' then raise exception 'D/ST requires team defense'; end if;
  end if;

  if v_incoming_roster_entry is not null
     and public.roster_asset_game_has_started(v_incoming_roster_entry) then
    raise exception 'Lineup locked: that player or team has already started';
  end if;

  delete from public.lineups where season_franchise_id = p_season_franchise_id
    and week = p_week and slot = p_slot and slot_index = p_slot_index;
  if p_athlete_id is not null or p_real_team_id is not null then
    delete from public.lineups where season_franchise_id = p_season_franchise_id and week = p_week
      and ((p_athlete_id is not null and athlete_id = p_athlete_id)
        or (p_real_team_id is not null and real_team_id = p_real_team_id));
    insert into public.lineups(season_franchise_id, week, athlete_id, real_team_id, slot, slot_index)
    values (p_season_franchise_id, p_week, p_athlete_id, p_real_team_id, p_slot, p_slot_index);
  end if;

  insert into public.lineup_move_audit(
    league_season_id, season_franchise_id, actor_user_id, week, slot, slot_index,
    previous_athlete_id, previous_real_team_id, new_athlete_id, new_real_team_id
  ) values (
    v_league_season, p_season_franchise_id, v_user, p_week, p_slot, p_slot_index,
    v_previous_athlete, v_previous_real_team, p_athlete_id, p_real_team_id
  );
  return jsonb_build_object(
    'status', case when p_athlete_id is null and p_real_team_id is null then 'cleared' else 'set' end,
    'slot', p_slot, 'slot_index', p_slot_index, 'week', p_week
  );
end
$function$;

-- set_trade_deadline(p_league_id uuid, p_deadline timestamp with time zone)
CREATE OR REPLACE FUNCTION public.set_trade_deadline(p_league_id uuid, p_deadline timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_user uuid:=auth.uid(); v_ls uuid; v_existing timestamptz; begin if v_user is null then raise exception 'Authentication required'; end if; if not exists(select 1 from public.league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if; if p_deadline is null or p_deadline<=now() then raise exception 'Trade deadline must be in the future'; end if; v_ls:=public.current_league_season_id(p_league_id); if v_ls is null then raise exception 'Current league season not found'; end if; select trade_deadline_at into v_existing from public.league_seasons where id=v_ls; if v_existing is not null and v_existing<=now() then raise exception 'A passed trade deadline cannot be reopened'; end if; update public.league_seasons set trade_deadline_at=p_deadline where id=v_ls; insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'trade_deadline_set','Trade deadline set',jsonb_build_object('trade_deadline_at',p_deadline)); return p_deadline; end $function$;

-- start_draft(p_draft_id uuid)
CREATE OR REPLACE FUNCTION public.start_draft(p_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_league uuid;
  v_league_season uuid;
  v_deadline timestamptz;
begin
  select ls.league_id, ls.id into v_league, v_league_season
  from public.drafts d
  join public.league_seasons ls on ls.id = d.league_season_id
  where d.id = p_draft_id;

  if not exists (
    select 1 from public.league_members
    where league_id = v_league and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  perform public.assert_late_entry_open(v_league_season, 'Starting this draft');

  update public.league_seasons
  set late_start_status = 'DRAFT_IN_PROGRESS'
  where id = v_league_season
    and late_start_status in ('FORMING', 'DRAFT_READY');

  update public.drafts
  set status = 'live',
      started_at = coalesce(started_at, now()),
      current_pick = case when current_pick = 0 then 1 else current_pick end,
      current_pick_deadline_at = now() + make_interval(secs => greatest(30, least(coalesce(pick_seconds, 90), 300)))
  where id = p_draft_id and status in ('scheduled', 'paused')
  returning current_pick_deadline_at into v_deadline;

  return jsonb_build_object('draft_id', p_draft_id, 'status', 'live', 'current_pick_deadline_at', v_deadline);
end
$function$;

-- submit_waiver_claim(p_waiver_hold_id uuid, p_season_franchise_id uuid, p_drop_roster_entry_id uuid)
CREATE OR REPLACE FUNCTION public.submit_waiver_claim(p_waiver_hold_id uuid, p_season_franchise_id uuid, p_drop_roster_entry_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_hold public.waiver_holds%rowtype;
  v_claim uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_hold from public.waiver_holds where id = p_waiver_hold_id for update;
  if v_hold.id is null or v_hold.status <> 'open' then raise exception 'This player is no longer on waivers'; end if;
  if v_hold.clears_at <= now() then raise exception 'The waiver window has closed and is awaiting processing'; end if;
  if not exists (
    select 1 from public.season_franchises sf
    join public.franchise_owners fo on fo.franchise_id = sf.franchise_id
    where sf.id = p_season_franchise_id
      and sf.league_season_id = v_hold.league_season_id
      and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'You do not manage this franchise'; end if;
  if v_hold.source_season_franchise_id = p_season_franchise_id then
    raise exception 'A franchise cannot reclaim its own dropped player during the initial waiver period';
  end if;
  if p_drop_roster_entry_id is not null and not exists (
    select 1 from public.roster_entries
    where id = p_drop_roster_entry_id and season_franchise_id = p_season_franchise_id and dropped_at is null
  ) then raise exception 'The selected drop is no longer on your roster'; end if;
  if p_drop_roster_entry_id is not null
     and public.roster_asset_game_has_started(p_drop_roster_entry_id) then
    raise exception 'The selected drop is locked because their game has started';
  end if;
  insert into public.waiver_claims(waiver_hold_id, season_franchise_id, drop_roster_entry_id, status)
  values (p_waiver_hold_id, p_season_franchise_id, p_drop_roster_entry_id, 'pending')
  on conflict (waiver_hold_id, season_franchise_id)
  do update set drop_roster_entry_id = excluded.drop_roster_entry_id, status = 'pending',
    resolved_at = null, failure_reason = null
  returning id into v_claim;
  return v_claim;
end
$function$;

-- sync_franchise_stadium_features(p_franchise_id uuid)
CREATE OR REPLACE FUNCTION public.sync_franchise_stadium_features(p_franchise_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_stadium uuid; v_count int; begin select id into v_stadium from public.stadiums where franchise_id=p_franchise_id; if v_stadium is null then insert into public.stadiums(franchise_id,environment_key) values(p_franchise_id,'neon_dome') returning id into v_stadium; end if; insert into public.franchise_stadium_features(stadium_id,stadium_feature_id,source_achievement_id) select distinct on (sf.id) v_stadium,sf.id,fa.id from public.franchise_achievements fa join public.achievements a on a.id=fa.achievement_id join public.stadium_features sf on sf.achievement_code=a.code and sf.active where fa.franchise_id=p_franchise_id order by sf.id,fa.earned_at,fa.id on conflict (stadium_id,stadium_feature_id) do nothing; get diagnostics v_count=row_count; return v_count; end $function$;

-- toggle_feed_reaction(p_event_id uuid, p_reaction text)
CREATE OR REPLACE FUNCTION public.toggle_feed_reaction(p_event_id uuid, p_reaction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_league uuid; v_reaction text:=trim(p_reaction); v_deleted int;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select league_id into v_league from league_feed_events where id=p_event_id;
 if v_league is null or not is_league_member(v_league) then raise exception 'League access required'; end if;
 if v_reaction not in ('🔥','😂','👀','👏','💀','🏆') then raise exception 'Unsupported reaction'; end if;
 delete from feed_reactions where event_id=p_event_id and user_id=v_user and reaction=v_reaction;
 get diagnostics v_deleted=row_count;
 if v_deleted>0 then return jsonb_build_object('status','removed','reaction',v_reaction); end if;
 insert into feed_reactions(event_id,user_id,reaction) values(p_event_id,v_user,v_reaction);
 return jsonb_build_object('status','added','reaction',v_reaction);
end $function$;

-- touch_draft_queue_updated_at()
CREATE OR REPLACE FUNCTION public.touch_draft_queue_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

-- undo_last_draft_pick(p_draft_id uuid)
CREATE OR REPLACE FUNCTION public.undo_last_draft_pick(p_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_draft public.drafts%rowtype;
  v_pick public.draft_picks%rowtype;
  v_league uuid;
  v_deadline timestamptz;
begin
  select * into v_draft
  from public.drafts
  where id = p_draft_id
  for update;

  if v_draft.id is null then raise exception 'Draft not found'; end if;
  if v_draft.status not in ('live', 'paused', 'completed') then raise exception 'Draft correction is not available'; end if;

  select ls.league_id into v_league
  from public.league_seasons ls
  where ls.id = v_draft.league_season_id;

  if not exists (
    select 1 from public.league_members
    where league_id = v_league and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  select * into v_pick
  from public.draft_picks
  where draft_id = p_draft_id and picked_at is not null
  order by pick_number desc
  limit 1
  for update;

  if v_pick.id is null then raise exception 'No completed pick to undo'; end if;

  insert into public.draft_corrections(draft_id, draft_pick_id, actor_user_id, action, before_payload)
  values(
    p_draft_id,
    v_pick.id,
    v_user,
    'undo_pick',
    jsonb_build_object(
      'pick_number', v_pick.pick_number,
      'round_number', v_pick.round_number,
      'round_pick', v_pick.round_pick,
      'season_franchise_id', v_pick.season_franchise_id,
      'athlete_id', v_pick.athlete_id,
      'real_team_id', v_pick.real_team_id,
      'is_auto_pick', v_pick.is_auto_pick,
      'picked_at', v_pick.picked_at
    )
  );

  update public.roster_entries
  set dropped_at = now()
  where season_franchise_id = v_pick.season_franchise_id
    and acquired_via = 'draft'
    and dropped_at is null
    and ((v_pick.athlete_id is not null and athlete_id = v_pick.athlete_id)
      or (v_pick.real_team_id is not null and real_team_id = v_pick.real_team_id));

  update public.draft_picks
  set athlete_id = null,
      real_team_id = null,
      is_auto_pick = false,
      picked_at = null
  where id = v_pick.id;

  v_deadline := case
    when v_draft.status = 'paused' then null
    else now() + make_interval(secs => greatest(30, least(coalesce(v_draft.pick_seconds, 90), 300)))
  end;

  update public.drafts
  set status = case when status = 'completed' then 'live' else status end,
      completed_at = case when status = 'completed' then null else completed_at end,
      current_pick = v_pick.pick_number,
      current_pick_deadline_at = v_deadline,
      paused_remaining_seconds = case
        when status = 'paused' then greatest(30, least(coalesce(pick_seconds, 90), 300))
        else paused_remaining_seconds
      end
  where id = p_draft_id;

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  values(
    v_league,
    v_draft.league_season_id,
    v_user,
    'draft_pick_undone',
    'Draft pick undone by commissioner',
    jsonb_build_object('draft_id', p_draft_id, 'pick_number', v_pick.pick_number, 'draft_pick_id', v_pick.id)
  );

  return jsonb_build_object('draft_id', p_draft_id, 'undone_pick_number', v_pick.pick_number, 'current_pick_deadline_at', v_deadline);
end
$function$;

-- update_roster_integrity_settings(p_league_season_id uuid, p_mode text, p_bulk_drop_limit integer, p_bulk_window_hours integer, p_protect_core_assets boolean, p_lock_eliminated boolean)
CREATE OR REPLACE FUNCTION public.update_roster_integrity_settings(p_league_season_id uuid, p_mode text, p_bulk_drop_limit integer, p_bulk_window_hours integer, p_protect_core_assets boolean, p_lock_eliminated boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_league uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('automatic','commissioner_review','open') then raise exception 'Invalid Roster Integrity mode'; end if;
  if p_bulk_drop_limit not between 1 and 10 then raise exception 'Bulk drop limit must be between 1 and 10'; end if;
  if p_bulk_window_hours not between 1 and 168 then raise exception 'Bulk window must be between 1 and 168 hours'; end if;
  select league_id into v_league from league_seasons where id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then
    raise exception 'Commissioner permission required';
  end if;

  update league_seasons
  set roster_integrity_mode=p_mode,
      roster_integrity_bulk_drop_limit=p_bulk_drop_limit,
      roster_integrity_bulk_window_hours=p_bulk_window_hours,
      roster_integrity_protect_core_assets=p_protect_core_assets,
      roster_integrity_lock_eliminated=p_lock_eliminated
  where id=p_league_season_id;

  insert into roster_integrity_audit(league_season_id,actor_id,event_type,detail)
  values(p_league_season_id,v_user,'settings_changed',jsonb_build_object(
    'mode',p_mode,'bulk_drop_limit',p_bulk_drop_limit,'bulk_window_hours',p_bulk_window_hours,
    'protect_core_assets',p_protect_core_assets,'lock_eliminated',p_lock_eliminated
  ));
  return jsonb_build_object('status','ok','mode',p_mode);
end
$function$;

-- withdraw_waiver_claim(p_waiver_claim_id uuid)
CREATE OR REPLACE FUNCTION public.withdraw_waiver_claim(p_waiver_claim_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_user uuid:=auth.uid(); v_claim waiver_claims%rowtype;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into v_claim from waiver_claims where id=p_waiver_claim_id for update;
  if v_claim.id is null then raise exception 'Waiver claim not found'; end if;
  if v_claim.status<>'pending' then raise exception 'Only pending claims can be withdrawn'; end if;
  if not exists (select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=v_claim.season_franchise_id and fo.user_id=v_user and fo.ends_on is null) then raise exception 'You do not own this waiver claim'; end if;
  update waiver_claims set status='withdrawn',resolved_at=now() where id=v_claim.id;
  return v_claim.id;
end $function$;
