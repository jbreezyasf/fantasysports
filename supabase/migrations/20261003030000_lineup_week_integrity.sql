-- Lineup week integrity.
--
-- Two defects, both verified against production on 2026-10-02:
--
-- 1. set_lineup_slot accepted any week but decided locks from the single
--    "active" real-game week. Once every game of a week was final there was no
--    active week, so nothing was locked and the lineups of completed weeks could
--    be edited. During a live week, a past week's lineup could also be edited
--    with any player whose current-week game had not kicked off yet.
--
-- 2. claim_free_agent and process_due_waivers removed the dropped asset from
--    lineups "where locked_at is null". lineups.locked_at is never written
--    (0 of 657 production rows), so a drop erased that player from the
--    franchise's lineup history for every completed week as well.
--
-- Fix: lock decisions are made per lineup week, and a completed week is
-- read-only for managers and untouched by roster moves.

-- A week is closed when its real games are over, or when the league has
-- already finalized a matchup for it.
create or replace function public.lineup_week_is_closed(
  p_league_season_id uuid,
  p_week integer
) returns boolean
language sql
stable
set search_path = public
as $function$
  select
    exists (
      select 1
      from public.matchups m
      where m.league_season_id = p_league_season_id
        and m.week = p_week
        and m.is_final
    )
    or coalesce((
      select count(*) filter (
               where coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
             ) > 0
         and bool_and(
               coalesce(rg.state::text, 'unknown') in ('final', 'canceled', 'postponed')
             )
      from public.league_seasons ls
      join public.real_games rg
        on rg.competition_season_id = ls.competition_season_id
       and rg.week = p_week
      where ls.id = p_league_season_id
    ), false);
$function$;

-- Has this roster asset's real game in the given week kicked off?
-- Unlike roster_asset_game_has_started, this answers for the week being
-- edited rather than for whichever week happens to be live.
create or replace function public.roster_asset_week_game_has_started(
  p_roster_entry_id uuid,
  p_week integer
) returns boolean
language sql
stable
set search_path = public
as $function$
  select coalesce(exists (
    select 1
    from public.roster_entries re
    join public.season_franchises sf on sf.id = re.season_franchise_id
    join public.league_seasons ls on ls.id = sf.league_season_id
    left join public.athletes a on a.id = re.athlete_id
    join public.real_games rg
      on rg.competition_season_id = ls.competition_season_id
     and rg.week = p_week
     and (rg.home_team_id = coalesce(a.real_team_id, re.real_team_id)
       or rg.away_team_id = coalesce(a.real_team_id, re.real_team_id))
    where re.id = p_roster_entry_id
      and re.dropped_at is null
      and rg.starts_at <= now()
      and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
  ), false);
$function$;

revoke execute on function public.lineup_week_is_closed(uuid, integer) from public, anon;
grant execute on function public.lineup_week_is_closed(uuid, integer) to authenticated, service_role;
revoke execute on function public.roster_asset_week_game_has_started(uuid, integer) from public, anon;
grant execute on function public.roster_asset_week_game_has_started(uuid, integer) to authenticated, service_role;

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
  v_pos text;
  v_previous_athlete uuid;
  v_previous_real_team uuid;
  v_previous_roster_entry uuid;
  v_incoming_roster_entry uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_week < 1 or p_week > 18 then raise exception 'Invalid week'; end if;
  if p_slot_index < 1 or p_slot_index > 2 then raise exception 'Invalid slot index'; end if;
  if p_slot not in ('RB', 'WR') and p_slot_index <> 1 then
    raise exception 'Only RB and WR use a second indexed slot';
  end if;
  if p_athlete_id is not null and p_real_team_id is not null then
    raise exception 'Choose only one athlete or D/ST';
  end if;

  select sf.franchise_id, sf.league_season_id
    into v_franchise, v_league_season
  from public.season_franchises sf
  where sf.id = p_season_franchise_id;

  if v_franchise is null then raise exception 'Franchise season not found'; end if;
  if not exists (
    select 1
    from public.franchise_owners fo
    where fo.franchise_id = v_franchise
      and fo.user_id = v_user
      and fo.ends_on is null
  ) then raise exception 'Not your franchise'; end if;

  -- A completed week is history. Without this, every lock released once the
  -- week's real games went final and past lineups became editable again.
  if public.lineup_week_is_closed(v_league_season, p_week) then
    raise exception 'Lineup locked: Week % is complete and can no longer be changed', p_week;
  end if;

  -- Advisory locking also serializes the initially-empty lineup case.
  perform pg_advisory_xact_lock(
    hashtextextended('lineup:' || p_season_franchise_id::text || ':' || p_week::text, 0)
  );
  perform 1
  from public.lineups
  where season_franchise_id = p_season_franchise_id and week = p_week
  for update;

  select l.athlete_id, l.real_team_id
    into v_previous_athlete, v_previous_real_team
  from public.lineups l
  where l.season_franchise_id = p_season_franchise_id
    and l.week = p_week
    and l.slot = p_slot
    and l.slot_index = p_slot_index;

  if v_previous_athlete is not distinct from p_athlete_id
     and v_previous_real_team is not distinct from p_real_team_id then
    return jsonb_build_object(
      'status', 'unchanged', 'slot', p_slot,
      'slot_index', p_slot_index, 'week', p_week
    );
  end if;

  if v_previous_athlete is not null or v_previous_real_team is not null then
    select re.id into v_previous_roster_entry
    from public.roster_entries re
    where re.season_franchise_id = p_season_franchise_id
      and re.dropped_at is null
      and (
        (v_previous_athlete is not null and re.athlete_id = v_previous_athlete)
        or (v_previous_real_team is not null and re.real_team_id = v_previous_real_team)
      )
    limit 1;

    if v_previous_roster_entry is not null
       and public.roster_asset_week_game_has_started(v_previous_roster_entry, p_week) then
      raise exception 'Lineup locked: the player or team currently in this slot has already started';
    end if;
  end if;

  if p_real_team_id is not null then
    if p_slot <> 'DST' then raise exception 'Team defense can only be placed in D/ST'; end if;
    select re.id into v_incoming_roster_entry
    from public.roster_entries re
    where re.season_franchise_id = p_season_franchise_id
      and re.real_team_id = p_real_team_id
      and re.dropped_at is null;
    if v_incoming_roster_entry is null then raise exception 'D/ST is not on roster'; end if;
  elsif p_athlete_id is not null then
    select a.position, re.id into v_pos, v_incoming_roster_entry
    from public.athletes a
    left join public.roster_entries re
      on re.athlete_id = a.id
     and re.season_franchise_id = p_season_franchise_id
     and re.dropped_at is null
    where a.id = p_athlete_id;

    if v_pos is null then raise exception 'Athlete not found'; end if;
    if v_incoming_roster_entry is null then raise exception 'Athlete is not on roster'; end if;
    if p_slot = 'QB' and v_pos <> 'QB' then raise exception 'QB slot requires QB'; end if;
    if p_slot = 'RB' and v_pos <> 'RB' then raise exception 'RB slot requires RB'; end if;
    if p_slot = 'WR' and v_pos <> 'WR' then raise exception 'WR slot requires WR'; end if;
    if p_slot = 'TE' and v_pos <> 'TE' then raise exception 'TE slot requires TE'; end if;
    if p_slot = 'K' and v_pos <> 'K' then raise exception 'K slot requires kicker'; end if;
    if p_slot = 'FLEX' and v_pos not in ('RB', 'WR', 'TE') then
      raise exception 'FLEX requires RB, WR, or TE';
    end if;
    if p_slot = 'DST' then raise exception 'D/ST requires team defense'; end if;
  end if;

  if v_incoming_roster_entry is not null
     and public.roster_asset_week_game_has_started(v_incoming_roster_entry, p_week) then
    raise exception 'Lineup locked: that player or team has already started';
  end if;

  delete from public.lineups
  where season_franchise_id = p_season_franchise_id
    and week = p_week
    and slot = p_slot
    and slot_index = p_slot_index;

  if p_athlete_id is not null or p_real_team_id is not null then
    delete from public.lineups
    where season_franchise_id = p_season_franchise_id
      and week = p_week
      and (
        (p_athlete_id is not null and athlete_id = p_athlete_id)
        or (p_real_team_id is not null and real_team_id = p_real_team_id)
      );

    insert into public.lineups(
      season_franchise_id, week, athlete_id, real_team_id, slot, slot_index
    ) values (
      p_season_franchise_id, p_week, p_athlete_id, p_real_team_id, p_slot, p_slot_index
    );
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

revoke execute on function public.set_lineup_slot(
  uuid, integer, public.lineup_slot, integer, uuid, uuid
) from public, anon;
grant execute on function public.set_lineup_slot(
  uuid, integer, public.lineup_slot, integer, uuid, uuid
) to authenticated;

-- Roster moves keep completed weeks intact.
create or replace function public.claim_free_agent(
  p_season_franchise_id uuid,
  p_athlete_id uuid default null::uuid,
  p_real_team_id uuid default null::uuid,
  p_drop_roster_entry_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

    delete from lineups l where l.season_franchise_id=p_season_franchise_id and l.locked_at is null and not public.lineup_week_is_closed(v_league_season_id,l.week) and ((v_drop_athlete is not null and l.athlete_id=v_drop_athlete) or (v_drop_team is not null and l.real_team_id=v_drop_team));
    perform set_config('big_exec.roster_drop_context','free_agent_swap_prechecked',true);
    update roster_entries set dropped_at=now() where id=p_drop_roster_entry_id and dropped_at is null;
    perform set_config('big_exec.roster_drop_context','',true);
    insert into waiver_holds(league_season_id,athlete_id,real_team_id,source_roster_entry_id,source_season_franchise_id,clears_at) values(v_league_season_id,v_drop_athlete,v_drop_team,p_drop_roster_entry_id,p_season_franchise_id,now()+make_interval(hours=>v_period));
  end if;
  insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via) values(p_season_franchise_id,p_athlete_id,p_real_team_id,'free_agent') returning id into v_new_id;
  return v_new_id;
end
$function$;

revoke execute on function public.claim_free_agent(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.claim_free_agent(uuid, uuid, uuid, uuid) to authenticated;

create or replace function public.process_due_waivers(p_league_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hold public.waiver_holds%rowtype;
  v_claim record;
  v_roster_config jsonb;
  v_roster_limit integer;
  v_active_count integer;
  v_drop_athlete uuid;
  v_drop_team uuid;
  v_period integer;
  v_league uuid;
  v_winner uuid;
  v_processed integer := 0;
  v_claimed integer := 0;
  v_integrity jsonb;
  v_override uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('waivers:' || p_league_season_id::text, 0));
  select roster_config, waiver_period_hours, league_id
    into v_roster_config, v_period, v_league
  from public.league_seasons
  where id = p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;

  select coalesce(sum(value::int), 0) + coalesce((v_roster_config->>'bench')::int, 0)
    into v_roster_limit
  from jsonb_each_text(coalesce(v_roster_config->'starters', '{}'::jsonb));

  for v_hold in
    select *
    from public.waiver_holds
    where league_season_id = p_league_season_id
      and status = 'open'
      and clears_at <= now()
    order by clears_at, id
    for update skip locked
  loop
    v_processed := v_processed + 1;
    v_winner := null;

    if exists (
      select 1
      from public.roster_entries re
      join public.season_franchises sf on sf.id = re.season_franchise_id
      where sf.league_season_id = p_league_season_id
        and re.dropped_at is null
        and ((v_hold.athlete_id is not null and re.athlete_id = v_hold.athlete_id)
          or (v_hold.real_team_id is not null and re.real_team_id = v_hold.real_team_id))
    ) then
      update public.waiver_claims
      set status = 'failed', resolved_at = now(), failure_reason = 'Asset is no longer available'
      where waiver_hold_id = v_hold.id and status = 'pending';
      update public.waiver_holds set status = 'expired', resolved_at = now() where id = v_hold.id;
      continue;
    end if;

    for v_claim in
      with ranked as (
        select wc.*, row_number() over (order by
          case when (s.wins+s.losses+s.ties)=0 then 0 else 1 end asc,
          case when (s.wins+s.losses+s.ties)=0 then sf.draft_position end desc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then (s.wins + 0.5*s.ties)::numeric/(s.wins+s.losses+s.ties) end asc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then s.points_for end asc nulls last,
          wc.created_at asc, wc.id asc
        ) as calculated_priority
        from public.waiver_claims wc
        join public.season_franchises sf on sf.id = wc.season_franchise_id
        join public.standings s
          on s.league_season_id = p_league_season_id
         and s.season_franchise_id = wc.season_franchise_id
        where wc.waiver_hold_id = v_hold.id and wc.status = 'pending'
      )
      select * from ranked order by calculated_priority
    loop
      update public.waiver_claims
      set priority_rank = v_claim.calculated_priority
      where id = v_claim.id;

      select count(*) into v_active_count
      from public.roster_entries
      where season_franchise_id = v_claim.season_franchise_id and dropped_at is null;

      if v_active_count >= v_roster_limit and v_claim.drop_roster_entry_id is null then
        update public.waiver_claims
        set status = 'failed', resolved_at = now(), failure_reason = 'Roster is full and no drop was selected'
        where id = v_claim.id;
        continue;
      end if;

      v_drop_athlete := null;
      v_drop_team := null;
      if v_claim.drop_roster_entry_id is not null then
        select athlete_id, real_team_id into v_drop_athlete, v_drop_team
        from public.roster_entries
        where id = v_claim.drop_roster_entry_id
          and season_franchise_id = v_claim.season_franchise_id
          and dropped_at is null
        for update;

        if not found then
          update public.waiver_claims
          set status = 'failed', resolved_at = now(), failure_reason = 'Selected drop is no longer on roster'
          where id = v_claim.id;
          continue;
        end if;

        if public.roster_asset_game_has_started(v_claim.drop_roster_entry_id) then
          update public.waiver_claims
          set status = 'failed', resolved_at = now(),
              failure_reason = 'Selected drop is locked because their game has started'
          where id = v_claim.id;
          continue;
        end if;

        v_integrity := public.evaluate_roster_integrity_drop(v_claim.drop_roster_entry_id, 'waiver_award');
        if not coalesce((v_integrity->>'allowed')::boolean, false) then
          update public.waiver_claims
          set status = 'failed', resolved_at = now(),
              failure_reason = coalesce(v_integrity->>'message', 'Roster Integrity blocked the selected drop')
          where id = v_claim.id;
          continue;
        end if;
        if v_integrity->>'override_id' is not null then
          v_override := public.consume_roster_integrity_override(v_claim.drop_roster_entry_id);
        end if;

        delete from public.lineups l
        where l.season_franchise_id = v_claim.season_franchise_id
          and l.locked_at is null
          and not public.lineup_week_is_closed(p_league_season_id, l.week)
          and ((v_drop_athlete is not null and l.athlete_id = v_drop_athlete)
            or (v_drop_team is not null and l.real_team_id = v_drop_team));
        perform set_config('big_exec.roster_drop_context', 'waiver_award_prechecked', true);
        update public.roster_entries
        set dropped_at = now()
        where id = v_claim.drop_roster_entry_id and dropped_at is null;
        perform set_config('big_exec.roster_drop_context', '', true);
        insert into public.waiver_holds(
          league_season_id, athlete_id, real_team_id, source_roster_entry_id,
          source_season_franchise_id, clears_at
        ) values (
          p_league_season_id, v_drop_athlete, v_drop_team, v_claim.drop_roster_entry_id,
          v_claim.season_franchise_id, now() + make_interval(hours => v_period)
        );
      end if;

      insert into public.roster_entries(season_franchise_id, athlete_id, real_team_id, acquired_via)
      values (v_claim.season_franchise_id, v_hold.athlete_id, v_hold.real_team_id, 'waiver');
      v_winner := v_claim.season_franchise_id;
      update public.waiver_claims set status = 'won', resolved_at = now(), failure_reason = null where id = v_claim.id;
      update public.waiver_claims set status = 'lost', resolved_at = now() where waiver_hold_id = v_hold.id and status = 'pending' and id <> v_claim.id;
      update public.waiver_holds set status = 'claimed', claimed_by_season_franchise_id = v_winner, resolved_at = now() where id = v_hold.id;
      insert into public.league_feed_events(league_id, season_id, event_type, body, payload)
      values (v_league, p_league_season_id, 'waiver_claimed', 'Waiver claim awarded',
        jsonb_build_object('waiver_hold_id', v_hold.id, 'winner_season_franchise_id', v_winner,
          'athlete_id', v_hold.athlete_id, 'real_team_id', v_hold.real_team_id));
      v_claimed := v_claimed + 1;
      exit;
    end loop;

    if v_winner is null then
      update public.waiver_holds set status = 'expired', resolved_at = now()
      where id = v_hold.id and status = 'open';
    end if;
  end loop;

  return jsonb_build_object('status', 'ok', 'processed', v_processed, 'claimed', v_claimed);
end
$function$;

revoke execute on function public.process_due_waivers(uuid)
  from public, anon, authenticated;
grant execute on function public.process_due_waivers(uuid) to service_role;
