-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820055012, name snake_draft_engine. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.initialize_snake_draft(p_league_id uuid, p_pick_seconds int default 90, p_starts_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_league_season uuid;
  v_count int;
  v_draft uuid;
  v_round int;
  v_slot int;
  v_pick int := 1;
  v_sf uuid;
  v_rows uuid[];
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if v_league_season is null then raise exception 'League season missing'; end if;
  select count(*) into v_count from season_franchises where league_season_id=v_league_season;
  if v_count <> 10 then raise exception 'Draft requires exactly 10 claimed franchises'; end if;
  if exists(select 1 from drafts where league_season_id=v_league_season) then
    select id into v_draft from drafts where league_season_id=v_league_season order by created_at desc limit 1;
    return jsonb_build_object('draft_id',v_draft,'status','exists');
  end if;

  with randomized as (
    select id, row_number() over(order by random())::int as pos
    from season_franchises where league_season_id=v_league_season
  )
  update season_franchises sf set draft_position=r.pos from randomized r where sf.id=r.id;

  insert into drafts(league_season_id,status,draft_type,rounds,pick_seconds,current_pick,starts_at)
  values(v_league_season,'scheduled','snake',15,greatest(30,least(coalesce(p_pick_seconds,90),300)),0,p_starts_at)
  returning id into v_draft;

  select array_agg(id order by draft_position) into v_rows from season_franchises where league_season_id=v_league_season;
  for v_round in 1..15 loop
    for v_slot in 1..10 loop
      if mod(v_round,2)=1 then v_sf := v_rows[v_slot]; else v_sf := v_rows[11-v_slot]; end if;
      insert into draft_picks(draft_id,pick_number,round_number,round_pick,season_franchise_id)
      values(v_draft,v_pick,v_round,v_slot,v_sf);
      v_pick := v_pick + 1;
    end loop;
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_league_season,v_user,'draft_order_set','Draft order has been set',jsonb_build_object('draft_id',v_draft));
  return jsonb_build_object('draft_id',v_draft,'status','created','picks',150);
end $$;
revoke all on function public.initialize_snake_draft(uuid,int,timestamptz) from public,anon;
grant execute on function public.initialize_snake_draft(uuid,int,timestamptz) to authenticated;

create or replace function public.start_draft(p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_user uuid:=auth.uid(); v_league uuid;
begin
  select ls.league_id into v_league from drafts d join league_seasons ls on ls.id=d.league_season_id where d.id=p_draft_id;
  if not exists(select 1 from league_members where league_id=v_league and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  update drafts set status='live', started_at=coalesce(started_at,now()), current_pick=case when current_pick=0 then 1 else current_pick end where id=p_draft_id and status in ('scheduled','paused');
  return jsonb_build_object('draft_id',p_draft_id,'status','live');
end $$;
revoke all on function public.start_draft(uuid) from public,anon;
grant execute on function public.start_draft(uuid) to authenticated;

create or replace function public.make_draft_pick(p_draft_id uuid, p_athlete_id uuid default null, p_real_team_id uuid default null, p_auto boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user uuid:=auth.uid(); v_draft drafts%rowtype; v_pick draft_picks%rowtype; v_franchise uuid; v_total int; v_league uuid;
begin
  if (p_athlete_id is null) = (p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;
  select * into v_draft from drafts where id=p_draft_id for update;
  if v_draft.id is null or v_draft.status<>'live' then raise exception 'Draft is not live'; end if;
  select * into v_pick from draft_picks where draft_id=p_draft_id and pick_number=v_draft.current_pick for update;
  if v_pick.id is null then raise exception 'Current pick missing'; end if;
  select f.id, f.league_id into v_franchise,v_league from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=v_pick.season_franchise_id;
  if not p_auto and not exists(select 1 from franchise_owners fo where fo.franchise_id=v_franchise and fo.user_id=v_user and fo.ends_on is null) then raise exception 'Not your pick'; end if;
  if p_athlete_id is not null and exists(select 1 from draft_picks where draft_id=p_draft_id and athlete_id=p_athlete_id and picked_at is not null) then raise exception 'Athlete already drafted'; end if;
  if p_real_team_id is not null and exists(select 1 from draft_picks where draft_id=p_draft_id and real_team_id=p_real_team_id and picked_at is not null) then raise exception 'D/ST already drafted'; end if;

  update draft_picks set athlete_id=p_athlete_id, real_team_id=p_real_team_id, is_auto_pick=p_auto, picked_at=now() where id=v_pick.id;
  insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via) values(v_pick.season_franchise_id,p_athlete_id,p_real_team_id,'draft');
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select ls.league_id,ls.id,v_user,'draft_pick','Draft pick made',jsonb_build_object('draft_id',p_draft_id,'pick_number',v_pick.pick_number,'athlete_id',p_athlete_id,'real_team_id',p_real_team_id,'season_franchise_id',v_pick.season_franchise_id) from league_seasons ls where ls.id=v_draft.league_season_id;

  select count(*) into v_total from draft_picks where draft_id=p_draft_id;
  if v_draft.current_pick >= v_total then
    update drafts set status='completed', completed_at=now() where id=p_draft_id;
  else
    update drafts set current_pick=current_pick+1 where id=p_draft_id;
  end if;
  return jsonb_build_object('pick_number',v_pick.pick_number,'season_franchise_id',v_pick.season_franchise_id,'complete',v_draft.current_pick>=v_total);
end $$;
revoke all on function public.make_draft_pick(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.make_draft_pick(uuid,uuid,uuid,boolean) to authenticated;

alter table drafts enable row level security;
alter table draft_picks enable row level security;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='drafts' and policyname='league_members_read_drafts') then
    create policy league_members_read_drafts on drafts for select to authenticated using (exists(select 1 from league_seasons ls join league_members lm on lm.league_id=ls.league_id where ls.id=drafts.league_season_id and lm.user_id=auth.uid()));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='draft_picks' and policyname='league_members_read_draft_picks') then
    create policy league_members_read_draft_picks on draft_picks for select to authenticated using (exists(select 1 from drafts d join league_seasons ls on ls.id=d.league_season_id join league_members lm on lm.league_id=ls.league_id where d.id=draft_picks.draft_id and lm.user_id=auth.uid()));
  end if;
end $$;
