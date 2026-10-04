-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820141529, name configurable_draft_min_franchises. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.fantasy_leagues add column if not exists draft_min_franchises integer not null default 10 check (draft_min_franchises between 2 and 20);

create or replace function public.initialize_snake_draft(p_league_id uuid, p_pick_seconds integer default 90, p_starts_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
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
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select coalesce(draft_min_franchises,10) into v_required from fantasy_leagues where id=p_league_id;
  select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if v_league_season is null then raise exception 'League season missing'; end if;
  select count(*) into v_count from season_franchises where league_season_id=v_league_season;
  if v_count < v_required then raise exception 'Draft requires at least % claimed franchises; currently %', v_required, v_count; end if;
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
    for v_slot in 1..v_count loop
      if mod(v_round,2)=1 then v_sf := v_rows[v_slot]; else v_sf := v_rows[v_count+1-v_slot]; end if;
      insert into draft_picks(draft_id,pick_number,round_number,round_pick,season_franchise_id)
      values(v_draft,v_pick,v_round,v_slot,v_sf);
      v_pick := v_pick + 1;
    end loop;
  end loop;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_league_season,v_user,'draft_order_set','Draft order has been set',jsonb_build_object('draft_id',v_draft,'franchise_count',v_count));
  return jsonb_build_object('draft_id',v_draft,'status','created','picks',15*v_count,'franchise_count',v_count);
end $$;
