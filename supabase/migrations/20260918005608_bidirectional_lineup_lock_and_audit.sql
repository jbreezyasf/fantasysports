-- P0 containment: lineup locks are bidirectional. Once an asset's real game
-- starts, it cannot enter or leave a weekly starting slot.

create table if not exists public.lineup_move_audit (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  week integer not null check (week between 1 and 18),
  slot public.lineup_slot not null,
  slot_index integer not null default 1,
  previous_athlete_id uuid references public.athletes(id),
  previous_real_team_id uuid references public.real_teams(id),
  new_athlete_id uuid references public.athletes(id),
  new_real_team_id uuid references public.real_teams(id),
  outcome text not null default 'applied' check (outcome in ('applied', 'restored')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists lineup_move_audit_franchise_week_created
  on public.lineup_move_audit (season_franchise_id, week, created_at desc);

alter table public.lineup_move_audit enable row level security;

create policy "owners and commissioners read lineup audit"
  on public.lineup_move_audit for select to authenticated
  using (
    exists (
      select 1
      from public.season_franchises sf
      join public.franchise_owners fo on fo.franchise_id = sf.franchise_id
      where sf.id = lineup_move_audit.season_franchise_id
        and fo.user_id = (select auth.uid())
        and fo.ends_on is null
    )
    or exists (
      select 1
      from public.league_seasons ls
      join public.league_members lm on lm.league_id = ls.league_id
      where ls.id = lineup_move_audit.league_season_id
        and lm.user_id = (select auth.uid())
        and lm.role = 'commissioner'
    )
  );

grant select on public.lineup_move_audit to authenticated;
revoke insert, update, delete on public.lineup_move_audit from public, anon, authenticated;

create or replace function public.set_lineup_slot(
  p_season_franchise_id uuid,
  p_week integer,
  p_slot public.lineup_slot,
  p_slot_index integer default 1,
  p_athlete_id uuid default null,
  p_real_team_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_franchise uuid;
  v_league_season uuid;
  v_competition_season uuid;
  v_pos text;
  v_incoming_team uuid;
  v_incoming_start timestamptz;
  v_incoming_state public.game_state;
  v_previous_athlete uuid;
  v_previous_real_team uuid;
  v_previous_team uuid;
  v_previous_start timestamptz;
  v_previous_state public.game_state;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_week < 1 or p_week > 18 then raise exception 'Invalid week'; end if;
  if p_slot_index < 1 or p_slot_index > 2 then raise exception 'Invalid slot index'; end if;
  if p_slot not in ('RB','WR') and p_slot_index <> 1 then raise exception 'Only RB and WR use a second indexed slot'; end if;
  if (p_athlete_id is null) = (p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;

  select sf.franchise_id, sf.league_season_id, ls.competition_season_id
    into v_franchise, v_league_season, v_competition_season
  from public.season_franchises sf
  join public.league_seasons ls on ls.id = sf.league_season_id
  where sf.id = p_season_franchise_id;
  if v_franchise is null then raise exception 'Franchise season not found'; end if;
  if not exists (
    select 1 from public.franchise_owners fo
    where fo.franchise_id = v_franchise and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'Not your franchise'; end if;

  -- Serialize all lineup changes for this franchise/week before evaluating
  -- either side of the move.
  perform 1 from public.lineups
  where season_franchise_id = p_season_franchise_id and week = p_week
  for update;

  select l.athlete_id, l.real_team_id
    into v_previous_athlete, v_previous_real_team
  from public.lineups l
  where l.season_franchise_id = p_season_franchise_id
    and l.week = p_week and l.slot = p_slot and l.slot_index = p_slot_index;

  if v_previous_athlete is not distinct from p_athlete_id
     and v_previous_real_team is not distinct from p_real_team_id then
    return jsonb_build_object('status','unchanged','slot',p_slot,'slot_index',p_slot_index,'week',p_week);
  end if;

  if p_real_team_id is not null then
    if p_slot <> 'DST' then raise exception 'Team defense can only be placed in D/ST'; end if;
    if not exists (
      select 1 from public.roster_entries
      where season_franchise_id = p_season_franchise_id
        and real_team_id = p_real_team_id and dropped_at is null
    ) then raise exception 'D/ST is not on roster'; end if;
    v_incoming_team := p_real_team_id;
  else
    select position, real_team_id into v_pos, v_incoming_team
    from public.athletes where id = p_athlete_id;
    if v_pos is null then raise exception 'Athlete not found'; end if;
    if not exists (
      select 1 from public.roster_entries
      where season_franchise_id = p_season_franchise_id
        and athlete_id = p_athlete_id and dropped_at is null
    ) then raise exception 'Athlete is not on roster'; end if;
    if p_slot = 'QB' and v_pos <> 'QB' then raise exception 'QB slot requires QB'; end if;
    if p_slot = 'RB' and v_pos <> 'RB' then raise exception 'RB slot requires RB'; end if;
    if p_slot = 'WR' and v_pos <> 'WR' then raise exception 'WR slot requires WR'; end if;
    if p_slot = 'TE' and v_pos <> 'TE' then raise exception 'TE slot requires TE'; end if;
    if p_slot = 'K' and v_pos <> 'K' then raise exception 'K slot requires kicker'; end if;
    if p_slot = 'FLEX' and v_pos not in ('RB','WR','TE') then raise exception 'FLEX requires RB, WR, or TE'; end if;
    if p_slot = 'DST' then raise exception 'D/ST requires team defense'; end if;
  end if;

  if v_previous_athlete is not null then
    select real_team_id into v_previous_team from public.athletes where id = v_previous_athlete;
  else
    v_previous_team := v_previous_real_team;
  end if;

  if v_previous_team is not null then
    select rg.starts_at, rg.state into v_previous_start, v_previous_state
    from public.real_games rg
    where rg.competition_season_id = v_competition_season
      and rg.week = p_week
      and (rg.home_team_id = v_previous_team or rg.away_team_id = v_previous_team)
    order by rg.starts_at
    limit 1;
    if v_previous_start is not null and v_previous_start <= now()
       and coalesce(v_previous_state::text, 'unknown') not in ('canceled','postponed') then
      raise exception 'Lineup locked: the player or team currently in this slot has already started';
    end if;
  end if;

  select rg.starts_at, rg.state into v_incoming_start, v_incoming_state
  from public.real_games rg
  where rg.competition_season_id = v_competition_season
    and rg.week = p_week
    and (rg.home_team_id = v_incoming_team or rg.away_team_id = v_incoming_team)
  order by rg.starts_at
  limit 1;
  if v_incoming_start is not null and v_incoming_start <= now()
     and coalesce(v_incoming_state::text, 'unknown') not in ('canceled','postponed') then
    raise exception 'Lineup locked: that player or team has already started';
  end if;

  delete from public.lineups
  where season_franchise_id = p_season_franchise_id and week = p_week
    and slot = p_slot and slot_index = p_slot_index;
  delete from public.lineups
  where season_franchise_id = p_season_franchise_id and week = p_week
    and ((athlete_id = p_athlete_id and p_athlete_id is not null)
      or (real_team_id = p_real_team_id and p_real_team_id is not null));
  insert into public.lineups(season_franchise_id, week, athlete_id, real_team_id, slot, slot_index)
  values (p_season_franchise_id, p_week, p_athlete_id, p_real_team_id, p_slot, p_slot_index);

  insert into public.lineup_move_audit(
    league_season_id, season_franchise_id, actor_user_id, week, slot, slot_index,
    previous_athlete_id, previous_real_team_id, new_athlete_id, new_real_team_id
  ) values (
    v_league_season, p_season_franchise_id, v_user, p_week, p_slot, p_slot_index,
    v_previous_athlete, v_previous_real_team, p_athlete_id, p_real_team_id
  );

  return jsonb_build_object('status','set','slot',p_slot,'slot_index',p_slot_index,'week',p_week);
end
$function$;

-- Preserve the legacy signature for older clients while routing it through the
-- same bidirectional lock and audit implementation.
create or replace function public.set_lineup_slot(
  p_season_franchise_id uuid,
  p_week integer,
  p_slot public.lineup_slot,
  p_athlete_id uuid default null,
  p_real_team_id uuid default null
) returns jsonb
language sql
security invoker
set search_path = public
as $function$
  select public.set_lineup_slot(
    p_season_franchise_id => p_season_franchise_id,
    p_week => p_week,
    p_slot => p_slot,
    p_slot_index => 1,
    p_athlete_id => p_athlete_id,
    p_real_team_id => p_real_team_id
  );
$function$;

revoke execute on function public.set_lineup_slot(uuid, integer, public.lineup_slot, integer, uuid, uuid) from public, anon;
revoke execute on function public.set_lineup_slot(uuid, integer, public.lineup_slot, uuid, uuid) from public, anon;
grant execute on function public.set_lineup_slot(uuid, integer, public.lineup_slot, integer, uuid, uuid) to authenticated;
grant execute on function public.set_lineup_slot(uuid, integer, public.lineup_slot, uuid, uuid) to authenticated;
