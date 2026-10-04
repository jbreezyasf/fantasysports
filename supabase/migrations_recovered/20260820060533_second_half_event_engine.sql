-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820060533, name second_half_event_engine. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create table if not exists public.rivalries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  franchise_a_id uuid not null references public.franchises(id) on delete cascade,
  franchise_b_id uuid not null references public.franchises(id) on delete cascade,
  designated boolean not null default false,
  rivalry_score numeric(8,2) not null default 0,
  created_at timestamptz not null default now(),
  check (franchise_a_id<>franchise_b_id)
);
create unique index if not exists rivalries_unique_pair on public.rivalries(league_id,least(franchise_a_id,franchise_b_id),greatest(franchise_a_id,franchise_b_id));
alter table public.rivalries enable row level security;
create policy rivalries_member_read on public.rivalries for select to authenticated using (exists(select 1 from league_members lm where lm.league_id=rivalries.league_id and lm.user_id=auth.uid()));

create or replace function public.designate_rivalry(p_league_id uuid,p_franchise_a uuid,p_franchise_b uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 if not exists(select 1 from franchises where id=p_franchise_a and league_id=p_league_id) or not exists(select 1 from franchises where id=p_franchise_b and league_id=p_league_id) then raise exception 'Franchises must belong to league'; end if;
 insert into rivalries(league_id,franchise_a_id,franchise_b_id,designated,rivalry_score) values(p_league_id,p_franchise_a,p_franchise_b,true,100)
 on conflict (league_id,(least(franchise_a_id,franchise_b_id)),(greatest(franchise_a_id,franchise_b_id))) do update set designated=true,rivalry_score=greatest(rivalries.rivalry_score,100)
 returning id into v_id;
 return jsonb_build_object('rivalry_id',v_id);
end $$;
revoke all on function public.designate_rivalry(uuid,uuid,uuid) from public,anon;
grant execute on function public.designate_rivalry(uuid,uuid,uuid) to authenticated;

create or replace function public.generate_rivalry_week(p_league_id uuid,p_week int default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.generate_rivalry_week(uuid,int) from public,anon; grant execute on function public.generate_rivalry_week(uuid,int) to authenticated;

create or replace function public.generate_revenge_week(p_league_id uuid,p_week int default 11)
returns jsonb language plpgsql security definer set search_path=public as $$
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
end $$;
revoke all on function public.generate_revenge_week(uuid,int) from public,anon; grant execute on function public.generate_revenge_week(uuid,int) to authenticated;

create or replace function public.generate_position_week(p_league_id uuid,p_week int default 12)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_ls uuid; ranked uuid[]; i int;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then return jsonb_build_object('status','exists','week',p_week); end if;
 select array_agg(season_franchise_id order by wins desc,points_for desc,season_franchise_id) into ranked from standings where league_season_id=v_ls;
 if array_length(ranked,1)<>10 then raise exception 'Position Week requires 10 franchises'; end if;
 for i in 1..5 loop insert into matchups(league_season_id,week,home_season_franchise_id,away_season_franchise_id,event_type) values(v_ls,p_week,ranked[(i*2)-1],ranked[i*2],'position'); end loop;
 return jsonb_build_object('status','created','week',p_week,'matchups',5);
end $$;
revoke all on function public.generate_position_week(uuid,int) from public,anon; grant execute on function public.generate_position_week(uuid,int) to authenticated;
