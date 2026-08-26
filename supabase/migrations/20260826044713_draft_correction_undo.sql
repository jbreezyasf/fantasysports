-- Big Exec Draft Night: commissioner correction/undo with audit trail.

create table if not exists public.draft_corrections (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  draft_pick_id uuid not null references public.draft_picks(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null check (action in ('undo_pick')),
  before_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.draft_corrections enable row level security;

create policy draft_corrections_member_read on public.draft_corrections
for select to authenticated
using (
  exists (
    select 1
    from public.drafts d
    join public.league_seasons ls on ls.id = d.league_season_id
    join public.league_members lm on lm.league_id = ls.league_id
    where d.id = draft_corrections.draft_id
      and lm.user_id = auth.uid()
  )
);

grant select on public.draft_corrections to authenticated;

create or replace function public.undo_last_draft_pick(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

revoke execute on function public.undo_last_draft_pick(uuid) from public, anon;
grant execute on function public.undo_last_draft_pick(uuid) to authenticated;
