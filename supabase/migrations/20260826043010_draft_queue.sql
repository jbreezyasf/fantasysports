-- Big Exec Draft Night: personal manager queue.
-- The queue must survive refresh/reconnect and become the source for future
-- queue-first autopick behavior.

create table public.draft_queues (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id) on delete cascade,
  athlete_id uuid references public.athletes(id),
  real_team_id uuid references public.real_teams(id),
  queue_rank integer not null check (queue_rank > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (((athlete_id is not null)::int + (real_team_id is not null)::int) = 1)
);

create unique index draft_queues_athlete_unique
  on public.draft_queues(draft_id, season_franchise_id, athlete_id)
  where athlete_id is not null;

create unique index draft_queues_team_unique
  on public.draft_queues(draft_id, season_franchise_id, real_team_id)
  where real_team_id is not null;

create index draft_queues_owner_order_idx
  on public.draft_queues(draft_id, season_franchise_id, queue_rank, created_at);

alter table public.draft_queues enable row level security;

create policy draft_queue_owner_read on public.draft_queues
for select to authenticated
using (
  exists (
    select 1
    from public.season_franchises sf
    join public.franchise_owners fo on fo.franchise_id = sf.franchise_id
    where sf.id = draft_queues.season_franchise_id
      and fo.user_id = auth.uid()
      and fo.ends_on is null
  )
);

grant select on public.draft_queues to authenticated;

create or replace function public.touch_draft_queue_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end
$function$;

create trigger draft_queues_touch_updated_at
before update on public.draft_queues
for each row execute function public.touch_draft_queue_updated_at();

create or replace function public.add_draft_queue_item(
  p_draft_id uuid,
  p_athlete_id uuid default null,
  p_real_team_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create or replace function public.remove_draft_queue_item(
  p_draft_id uuid,
  p_queue_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create or replace function public.move_draft_queue_item(
  p_draft_id uuid,
  p_queue_item_id uuid,
  p_direction text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create or replace function public.remove_drafted_asset_from_queues()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

create trigger draft_picks_remove_queued_asset
after update of athlete_id, real_team_id, picked_at on public.draft_picks
for each row execute function public.remove_drafted_asset_from_queues();

revoke execute on function public.touch_draft_queue_updated_at() from public, anon, authenticated;
revoke execute on function public.remove_drafted_asset_from_queues() from public, anon, authenticated;
revoke execute on function public.add_draft_queue_item(uuid, uuid, uuid) from public, anon;
revoke execute on function public.remove_draft_queue_item(uuid, uuid) from public, anon;
revoke execute on function public.move_draft_queue_item(uuid, uuid, text) from public, anon;

grant execute on function public.add_draft_queue_item(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_draft_queue_item(uuid, uuid) to authenticated;
grant execute on function public.move_draft_queue_item(uuid, uuid, text) to authenticated;
