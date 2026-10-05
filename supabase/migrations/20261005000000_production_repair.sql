-- PRODUCTION REPAIR, 2026-10-05. Run this ONE file. Safe to run more than once.
--
-- State it repairs (verified in production 2026-10-05 06:35 UTC):
--   * fantasy_week_close_status, chaos_clause_applies,
--     system_advance_fantasy_season and table fantasy_week_close_overrides do
--     not exist, so recompute_matchup cannot FINALIZE any matchup (live scoring
--     is unaffected; every week close fails).
--   * set_lineup_slot and process_due_waivers are back at their
--     20261003030000 text, because that file was run again after
--     20261004020000. They work, but lack the rule-card hooks.
--
-- Part A is 20261004010000 minus the two functions 20261004020000 supersedes.
-- Part B is set_lineup_slot and process_due_waivers verbatim from
-- 20261004020000.
--
-- Do not run 20261003030000 or 20261004010000 after this file: each rolls
-- functions back to older text.

-- =========================== PART A ========================================
-- ---------------------------------------------------------------------------
-- 1. From 20261003040000, verbatim: the shared week-close rule.
-- ---------------------------------------------------------------------------
create table if not exists public.fantasy_week_close_overrides (
  competition_season_id uuid not null references public.competition_seasons(id),
  week integer not null check (week between 1 and 18),
  reason text not null check (length(btrim(reason)) > 0),
  created_by text not null check (length(btrim(created_by)) > 0),
  created_at timestamptz not null default now(),
  primary key (competition_season_id, week)
);
alter table public.fantasy_week_close_overrides enable row level security;
revoke all on table public.fantasy_week_close_overrides from public, anon, authenticated;
grant select, insert, delete on table public.fantasy_week_close_overrides to service_role;

create or replace function public.fantasy_week_close_status(
  p_competition_season_id uuid,
  p_week integer
) returns jsonb
language sql
stable
set search_path = public
as $function$
  with counts as (
    select
      count(*) as games,
      count(*) filter (where rg.state = 'postponed') as postponed,
      count(*) filter (where rg.state <> 'postponed' and rg.starts_at > now()) as not_started,
      count(*) filter (where rg.state not in ('final', 'canceled', 'postponed')) as unfinished
    from public.real_games rg
    where rg.competition_season_id = p_competition_season_id and rg.week = p_week
  ), flags as (
    select c.*, exists (
      select 1 from public.fantasy_week_close_overrides o
      where o.competition_season_id = p_competition_season_id and o.week = p_week
    ) as has_override
    from counts c
  )
  select jsonb_build_object(
    'games', games,
    'not_started', not_started,
    'unfinished', unfinished,
    'postponed', postponed,
    'override', has_override,
    'override_applied', games > postponed and unfinished = 0 and not_started = 0 and postponed > 0 and has_override,
    'complete', games > postponed and unfinished = 0 and not_started = 0 and (postponed = 0 or has_override)
  )
  from flags;
$function$;

revoke execute on function public.fantasy_week_close_status(uuid, integer) from public, anon;
grant execute on function public.fantasy_week_close_status(uuid, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The Chaos Clause.
-- ---------------------------------------------------------------------------
create or replace function public.chaos_clause_applies(p_event_type text)
returns boolean
language sql
immutable
set search_path = public
as $function$
  select coalesce(p_event_type in ('playoff_qf', 'playoff_sf', 'championship', 'redemption_sf', 'redemption_final', 'third_place'), false);
$function$;


revoke execute on function public.chaos_clause_applies(text) from public, anon, authenticated;
grant execute on function public.chaos_clause_applies(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. From 20261003060000: system_advance_fantasy_season. Only the tied
--    postseason stop changes (see the comment in the body).
-- ---------------------------------------------------------------------------
create or replace function public.system_advance_fantasy_season(
  p_league_season_id uuid,
  p_week integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_league uuid;
  v_latest uuid;
  v_commissioner uuid;
  v_previous_subject text := current_setting('request.jwt.claim.sub', true);
  v_step text;
  v_result jsonb;
  v_expected integer;
  v_found integer;
  v_distinct integer;
begin
  if auth.uid() is not null then raise exception 'System use only'; end if;
  if p_week is null or p_week < 10 or p_week > 18 then raise exception 'No automated season step for week %', p_week; end if;

  select league_id into v_league from league_seasons where id = p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;

  -- The season functions take a league and always act on its latest season.
  select ls.id into v_latest
  from league_seasons ls join competition_seasons cs on cs.id = ls.competition_season_id
  where ls.league_id = v_league order by cs.season_year desc limit 1;
  if v_latest is distinct from p_league_season_id then raise exception 'Not the latest season of its league'; end if;

  if (select count(*) from season_franchises where league_season_id = p_league_season_id) <> 10
     or (select count(*) from standings where league_season_id = p_league_season_id) <> 10 then
    raise exception 'Season automation requires 10 franchises with standings';
  end if;

  -- The step for week N is built from the results of week N-1.
  if not exists (select 1 from matchups where league_season_id = p_league_season_id and week = p_week - 1)
     or exists (select 1 from matchups where league_season_id = p_league_season_id and week = p_week - 1 and not is_final) then
    raise exception 'Week % must be final first', p_week - 1;
  end if;
  -- Postseason steps advance winners. Since the Chaos Clause, recompute_matchup
  -- gives a level postseason game a winner at finalization, so this is no longer
  -- the normal outcome of a tie. It stays as a defensive stop for a postseason
  -- game that is final with no winner anyway: one finalized before the clause
  -- was applied, or one the clause could not decide because a franchise has no
  -- postseason seed.
  if p_week >= 16 and exists (
    select 1 from matchups
    where league_season_id = p_league_season_id and is_final and winner_season_franchise_id is null
      and chaos_clause_applies(event_type)
  ) then
    raise exception 'A postseason matchup is final with no winner (the Chaos Clause could not decide it); a commissioner decision is required';
  end if;

  select user_id into v_commissioner from league_members
  where league_id = v_league and role = 'commissioner' order by joined_at, id limit 1;
  if v_commissioner is null then raise exception 'League has no commissioner'; end if;

  perform set_config('request.jwt.claim.sub', v_commissioner::text, true);
  case p_week
    when 10 then v_step := 'generate_rivalry_week';      v_expected := 5; v_result := generate_rivalry_week(v_league, 10);
    when 11 then v_step := 'generate_revenge_week';      v_expected := 5; v_result := generate_revenge_week(v_league, 11);
    when 12 then v_step := 'generate_position_week';     v_expected := 5; v_result := generate_position_week(v_league, 12);
    when 13 then v_step := 'generate_chaos_week';        v_expected := 5; v_result := generate_chaos_week(v_league, 13);
    when 14 then v_step := 'generate_judgment_week';     v_expected := 5; v_result := generate_judgment_week(v_league, 14);
    when 15 then v_step := 'initialize_postseason';      v_expected := 4; v_result := initialize_postseason(v_league);
    when 16 then v_step := 'generate_postseason_week16'; v_expected := 2; v_result := generate_postseason_week16(v_league);
    when 17 then v_step := 'generate_postseason_week17'; v_expected := 2; v_result := generate_postseason_week17(v_league);
    when 18 then v_step := 'close_league_season';        v_expected := null; v_result := close_league_season(v_league);
  end case;
  perform set_config('request.jwt.claim.sub', coalesce(v_previous_subject, ''), true);

  -- Refuse (and roll back) a schedule that is short or uses a franchise twice.
  if v_expected is not null then
    select count(*), count(distinct f) into v_found, v_distinct
    from matchups m cross join lateral (values (m.home_season_franchise_id), (m.away_season_franchise_id)) t(f)
    where m.league_season_id = p_league_season_id and m.week = p_week;
    if v_found <> v_expected * 2 or v_distinct <> v_found then
      raise exception '% produced an invalid Week % schedule (% franchise slots, % distinct, expected %)', v_step, p_week, v_found, v_distinct, v_expected * 2;
    end if;
  end if;

  return jsonb_build_object('week', p_week, 'step', v_step, 'result', v_result);
end
$function$;

revoke execute on function public.system_advance_fantasy_season(uuid, integer) from public, anon, authenticated;
grant execute on function public.system_advance_fantasy_season(uuid, integer) to service_role;

-- =========================== PART B ========================================
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

  -- Chaos Week CAPTAIN, WILD SLOT and RAID cards: if an automatic selection is
  -- due (its kickoff, or the raid deadline, has passed) but scoring has not
  -- recorded it yet, record it now, from the lineup as it is BEFORE this
  -- change. Both sides of the game, because the higher seed's lineup decides
  -- what the lower seed's automatic raid takes. No rows unless such a card was
  -- dealt. (The lineups trigger of section 5b would do the same at the first
  -- row this function changes; it is done here explicitly, before anything is read.)
  perform public.chaos_sync_selections(m.id)
  from public.matchups m
  join public.chaos_card_draws d on d.matchup_id = m.id
  join public.chaos_cards c on c.code = d.card_code and c.kind in ('captain', 'wild_slot', 'raid')
  where m.league_season_id = v_league_season and m.week = p_week and m.event_type = 'chaos' and not m.is_final
    and p_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id);

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

  -- Chaos Week rule cards. Both checks read chaos_card_selections, which is
  -- empty unless cards were dealt, so nothing changes for other weeks or leagues.
  if p_athlete_id is not null or p_real_team_id is not null then
    -- RAID: the raided player stays on this roster but cannot start that week.
    -- Not for a void raid, and not for a PENALTY raid: there the raided player
    -- is one of this franchise's starters, and it keeps starting and scoring him.
    if exists (
      select 1
      from public.chaos_card_selections s
      join public.chaos_cards c on c.code = s.card_code and c.kind = 'raid'
      join public.matchups m on m.id = s.matchup_id
      where m.league_season_id = v_league_season and m.week = p_week
        and s.voided_at is null and coalesce((s.details->>'penalty')::boolean, false) is not true
        and s.source_season_franchise_id = p_season_franchise_id
        and ((p_athlete_id is not null and s.athlete_id = p_athlete_id)
          or (p_real_team_id is not null and s.real_team_id = p_real_team_id))
    ) then
      raise exception 'Lineup locked: your Chaos Week opponent raided this player, so they cannot start for you in Week %', p_week;
    end if;
    -- WILD SLOT: a player cannot count as a starter and as the extra player.
    if exists (
      select 1
      from public.chaos_card_selections s
      join public.chaos_cards c on c.code = s.card_code and c.kind = 'wild_slot'
      join public.matchups m on m.id = s.matchup_id
      where m.league_season_id = v_league_season and m.week = p_week
        and s.voided_at is null
        and s.season_franchise_id = p_season_franchise_id
        and ((p_athlete_id is not null and s.athlete_id = p_athlete_id)
          or (p_real_team_id is not null and s.real_team_id = p_real_team_id))
    ) then
      raise exception 'That player is your Wild Slot pick. Clear the Wild Slot before moving them into the starting lineup';
    end if;
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
          -- Chaos Week BOUNTY: while a grant is in force the league's bounty order
          -- decides (chaos_bounty_waiver_order). With no grant in force that
          -- function returns no rows, this key is null for every claim, and the
          -- keys below decide exactly as before.
          bo.waiver_position asc nulls last,
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
        left join public.chaos_bounty_waiver_order(p_league_season_id) bo
          on bo.season_franchise_id = wc.season_franchise_id
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

revoke execute on function public.set_lineup_slot(
  uuid, integer, public.lineup_slot, integer, uuid, uuid
) from public, anon;
grant execute on function public.set_lineup_slot(
  uuid, integer, public.lineup_slot, integer, uuid, uuid
) to authenticated;
revoke execute on function public.process_due_waivers(uuid)
  from public, anon, authenticated;
grant execute on function public.process_due_waivers(uuid) to service_role;
