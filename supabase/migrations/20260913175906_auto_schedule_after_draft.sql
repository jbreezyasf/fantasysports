-- A completed 10-franchise draft must immediately create the core schedule.
-- This internal trigger path also covers drafts completed by unattended autopick.
create or replace function public.create_circuit_schedule_after_draft()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_league_id uuid;
  v_teams uuid[];
  v_rotated uuid[];
  v_temp uuid[];
  v_week integer;
  v_pair integer;
  v_home uuid;
  v_away uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select league_id into v_league_id from public.league_seasons where id = new.league_season_id;
  if v_league_id is null or exists(select 1 from public.matchups where league_season_id = new.league_season_id and week between 1 and 9) then return new; end if;
  select array_agg(id order by coalesce(draft_position, 999), id) into v_teams from public.season_franchises where league_season_id = new.league_season_id;
  if coalesce(array_length(v_teams, 1), 0) <> 10 then return new; end if;
  v_rotated := v_teams;
  for v_week in 1..9 loop
    for v_pair in 1..5 loop
      if mod(v_week + v_pair, 2) = 0 then v_home := v_rotated[v_pair]; v_away := v_rotated[11-v_pair];
      else v_home := v_rotated[11-v_pair]; v_away := v_rotated[v_pair]; end if;
      insert into public.matchups(league_season_id, week, home_season_franchise_id, away_season_franchise_id, event_type)
      values(new.league_season_id, v_week, v_home, v_away, 'circuit');
    end loop;
    v_temp := array[v_rotated[1], v_rotated[10]] || v_rotated[2:9];
    v_rotated := v_temp;
  end loop;
  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  values(v_league_id, new.league_season_id, null, 'circuit_schedule_created', 'Weeks 1–9 Circuit schedule is set', jsonb_build_object('matchups', 45, 'draft_id', new.id));
  return new;
end
$function$;

revoke all on function public.create_circuit_schedule_after_draft() from public, anon, authenticated;
grant execute on function public.create_circuit_schedule_after_draft() to service_role;

drop trigger if exists drafts_create_circuit_schedule on public.drafts;
create trigger drafts_create_circuit_schedule
after update of status on public.drafts
for each row
when (new.status = 'completed' and old.status is distinct from new.status)
execute function public.create_circuit_schedule_after_draft();
