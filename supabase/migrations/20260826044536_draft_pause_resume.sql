-- Big Exec Draft Night: commissioner pause/resume with server-owned clock state.

alter table public.drafts
add column if not exists paused_at timestamptz,
add column if not exists paused_remaining_seconds integer;

create or replace function public.pause_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create or replace function public.start_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_league uuid;
  v_status text;
  v_deadline timestamptz;
  v_remaining integer;
begin
  select ls.league_id, d.status, d.paused_remaining_seconds
  into v_league, v_status, v_remaining
  from public.drafts d
  join public.league_seasons ls on ls.id = d.league_season_id
  where d.id = p_draft_id;

  if not exists (
    select 1 from public.league_members
    where league_id = v_league and user_id = v_user and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;

  update public.drafts
  set status = 'live',
      started_at = coalesce(started_at, now()),
      current_pick = case when current_pick = 0 then 1 else current_pick end,
      current_pick_deadline_at = now() + make_interval(secs => greatest(1, least(coalesce(v_remaining, pick_seconds, 90), 300))),
      paused_at = null,
      paused_remaining_seconds = null
  where id = p_draft_id and status in ('scheduled', 'paused')
  returning current_pick_deadline_at into v_deadline;

  if v_deadline is null then raise exception 'Draft cannot be started from status %', coalesce(v_status, 'missing'); end if;

  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  select
    ls.league_id,
    ls.id,
    v_user,
    case when v_status = 'paused' then 'draft_resumed' else 'draft_started' end,
    case when v_status = 'paused' then 'Draft resumed by commissioner' else 'Draft started by commissioner' end,
    jsonb_build_object('draft_id', p_draft_id, 'current_pick_deadline_at', v_deadline)
  from public.drafts d
  join public.league_seasons ls on ls.id = d.league_season_id
  where d.id = p_draft_id;

  return jsonb_build_object('draft_id', p_draft_id, 'status', 'live', 'current_pick_deadline_at', v_deadline);
end
$function$;

revoke execute on function public.pause_draft(uuid) from public, anon;
revoke execute on function public.start_draft(uuid) from public, anon;

grant execute on function public.pause_draft(uuid) to authenticated;
grant execute on function public.start_draft(uuid) to authenticated;
