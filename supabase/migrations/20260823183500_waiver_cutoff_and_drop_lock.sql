-- Waiver claims must close when the published waiver window closes.
create or replace function public.submit_waiver_claim(
  p_waiver_hold_id uuid,
  p_season_franchise_id uuid,
  p_drop_roster_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid();
  v_hold waiver_holds%rowtype;
  v_claim uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  select * into v_hold from waiver_holds where id=p_waiver_hold_id for update;
  if v_hold.id is null or v_hold.status<>'open' then raise exception 'This player is no longer on waivers'; end if;
  if v_hold.clears_at<=now() then raise exception 'The waiver window has closed and is awaiting processing'; end if;

  if not exists (
    select 1 from season_franchises sf
    join franchise_owners fo on fo.franchise_id=sf.franchise_id
    where sf.id=p_season_franchise_id
      and sf.league_season_id=v_hold.league_season_id
      and fo.user_id=v_user
      and fo.ends_on is null
  ) then raise exception 'You do not manage this franchise'; end if;

  if v_hold.source_season_franchise_id=p_season_franchise_id then
    raise exception 'A franchise cannot reclaim its own dropped player during the initial waiver period';
  end if;

  if p_drop_roster_entry_id is not null and not exists (
    select 1 from roster_entries
    where id=p_drop_roster_entry_id
      and season_franchise_id=p_season_franchise_id
      and dropped_at is null
  ) then raise exception 'The selected drop is no longer on your roster'; end if;

  insert into waiver_claims(waiver_hold_id,season_franchise_id,drop_roster_entry_id,status)
  values(p_waiver_hold_id,p_season_franchise_id,p_drop_roster_entry_id,'pending')
  on conflict(waiver_hold_id,season_franchise_id)
  do update set drop_roster_entry_id=excluded.drop_roster_entry_id,status='pending',resolved_at=null,failure_reason=null
  returning id into v_claim;

  return v_claim;
end
$function$;

-- Enforce roster transaction locks at the table boundary. `lineups.locked_at`
-- is not currently populated by a scheduler, so relying on that column alone
-- would allow an in-progress starter to be dropped.
create or replace function public.prevent_started_roster_asset_drop()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_league_season uuid;
  v_team uuid;
begin
  if old.dropped_at is not null or new.dropped_at is null then return new; end if;

  select league_season_id into v_league_season
  from season_franchises where id=old.season_franchise_id;

  if old.athlete_id is not null then
    select real_team_id into v_team from athletes where id=old.athlete_id;
  else
    v_team:=old.real_team_id;
  end if;

  if v_team is not null and exists (
    select 1
    from lineups l
    join league_seasons ls on ls.id=v_league_season
    join real_games rg on rg.competition_season_id=ls.competition_season_id
      and rg.week=l.week
      and (rg.home_team_id=v_team or rg.away_team_id=v_team)
    where l.season_franchise_id=old.season_franchise_id
      and ((old.athlete_id is not null and l.athlete_id=old.athlete_id)
        or (old.real_team_id is not null and l.real_team_id=old.real_team_id))
      and rg.starts_at<=now()
      and rg.state in ('scheduled','in_progress')
  ) then
    raise exception 'This roster asset is locked because its game has started';
  end if;

  return new;
end
$function$;

drop trigger if exists roster_entries_prevent_started_drop on public.roster_entries;
create trigger roster_entries_prevent_started_drop
before update of dropped_at on public.roster_entries
for each row execute function public.prevent_started_roster_asset_drop();

revoke execute on function public.prevent_started_roster_asset_drop() from public,anon,authenticated;
