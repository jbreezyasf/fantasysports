-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820212949, name gate3_postseason_engine. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.matchups add column if not exists context jsonb not null default '{}'::jsonb;

create table if not exists public.postseason_seeds (
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id) on delete cascade,
  seed integer not null check (seed between 1 and 10),
  bracket text not null check (bracket in ('championship','redemption')),
  created_at timestamptz not null default now(),
  primary key (league_season_id, season_franchise_id),
  unique (league_season_id, seed)
);

create table if not exists public.championships (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  bracket text not null check (bracket in ('championship','redemption')),
  winner_season_franchise_id uuid not null references public.season_franchises(id),
  runner_up_season_franchise_id uuid references public.season_franchises(id),
  final_matchup_id uuid references public.matchups(id),
  awarded_at timestamptz not null default now(),
  unique (league_season_id, bracket)
);

alter table public.postseason_seeds enable row level security;
alter table public.championships enable row level security;
grant select on public.postseason_seeds, public.championships to authenticated;

drop policy if exists member_read_postseason_seeds on public.postseason_seeds;
create policy member_read_postseason_seeds on public.postseason_seeds for select to authenticated using (
  exists(select 1 from public.league_seasons ls where ls.id=postseason_seeds.league_season_id and public.is_league_member(ls.league_id))
);
drop policy if exists member_read_championships on public.championships;
create policy member_read_championships on public.championships for select to authenticated using (
  exists(select 1 from public.league_seasons ls where ls.id=championships.league_season_id and public.is_league_member(ls.league_id))
);

insert into public.achievements(code,display_name,description,category,unlock_rule)
select 'CHAOS_GIANT_KILLER','Chaos Giant Killer','Upset a higher-ranked franchise during Chaos Week.','season_event','{"week":13,"event_type":"chaos"}'::jsonb
where not exists(select 1 from public.achievements where code='CHAOS_GIANT_KILLER');
insert into public.achievements(code,display_name,description,category,unlock_rule)
select 'REDEMPTION_CHAMPION','Redemption Champion','Win the secondary postseason tournament.','postseason','{"bracket":"redemption"}'::jsonb
where not exists(select 1 from public.achievements where code='REDEMPTION_CHAMPION');
insert into public.achievements(code,display_name,description,category,unlock_rule)
select 'LEAGUE_CHAMPION','League Champion','Win the Big Exec league championship.','championship','{"bracket":"championship"}'::jsonb
where not exists(select 1 from public.achievements where code='LEAGUE_CHAMPION');

create or replace function public.generate_chaos_week(p_league_id uuid, p_week integer default 13)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;

create or replace function public.generate_judgment_week(p_league_id uuid, p_week integer default 14)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;

create or replace function public.initialize_postseason(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;

create or replace function public.generate_postseason_week16(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;

create or replace function public.generate_postseason_week17(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
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
end $$;

create or replace function public.close_league_season(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_ls uuid; champ matchups%rowtype; red matchups%rowtype; champ_franchise uuid; red_franchise uuid; ach uuid;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
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
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'season_complete','Season complete',jsonb_build_object('champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id));
  return jsonb_build_object('status','complete','league_season_id',v_ls,'champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id);
end $$;
