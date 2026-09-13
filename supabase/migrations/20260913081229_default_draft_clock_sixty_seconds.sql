-- New standard drafts use a 60-second clock. Existing drafts keep the clock
-- chosen when they were created.
alter table public.drafts alter column pick_seconds set default 60;

create or replace function public.initialize_snake_draft(
  p_league_id uuid,
  p_pick_seconds integer default 60,
  p_starts_at timestamptz default null::timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
    select 1 from public.league_members
    where league_id = p_league_id and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  select coalesce(draft_min_franchises, 10) into v_required
  from public.fantasy_leagues where id = p_league_id;

  select ls.id into v_league_season
  from public.league_seasons ls
  join public.competition_seasons cs on cs.id = ls.competition_season_id
  where ls.league_id = p_league_id
  order by cs.season_year desc limit 1;
  if v_league_season is null then raise exception 'League season missing'; end if;

  perform public.assert_late_entry_open(v_league_season, 'Creating this draft');

  update public.league_seasons
  set late_start_status = case when late_start_status = 'FORMING' then 'DRAFT_READY' else late_start_status end
  where id = v_league_season;

  select count(*) into v_count from public.season_franchises where league_season_id = v_league_season;
  if v_count < v_required then
    raise exception 'Draft requires at least % claimed franchises; currently %', v_required, v_count;
  end if;

  if exists(select 1 from public.drafts where league_season_id = v_league_season) then
    select id into v_draft from public.drafts
    where league_season_id = v_league_season order by created_at desc limit 1;
    return jsonb_build_object('draft_id', v_draft, 'status', 'exists');
  end if;

  with randomized as (
    select id, row_number() over(order by random())::int as pos
    from public.season_franchises where league_season_id = v_league_season
  )
  update public.season_franchises sf set draft_position = r.pos
  from randomized r where sf.id = r.id;

  insert into public.drafts(league_season_id, status, draft_type, rounds, pick_seconds, current_pick, starts_at)
  values(v_league_season, 'scheduled', 'snake', 15, greatest(30, least(coalesce(p_pick_seconds, 60), 120)), 0, p_starts_at)
  returning id into v_draft;

  select array_agg(id order by draft_position) into v_rows
  from public.season_franchises where league_season_id = v_league_season;

  for v_round in 1..15 loop
    for v_slot in 1..v_count loop
      if mod(v_round, 2) = 1 then v_sf := v_rows[v_slot];
      else v_sf := v_rows[v_count + 1 - v_slot]; end if;
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
