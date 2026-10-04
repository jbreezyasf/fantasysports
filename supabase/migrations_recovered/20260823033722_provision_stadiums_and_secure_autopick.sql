-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260823033722, name provision_stadiums_and_secure_autopick. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.provision_franchise_stadium()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.stadiums(franchise_id,environment_key)
  values(new.id,'starter')
  on conflict (franchise_id) do nothing;
  return new;
end
$$;

drop trigger if exists provision_franchise_stadium_after_insert on public.franchises;
create trigger provision_franchise_stadium_after_insert
after insert on public.franchises
for each row execute function public.provision_franchise_stadium();

insert into public.stadiums(franchise_id,environment_key)
select f.id,'starter'
from public.franchises f
left join public.stadiums s on s.franchise_id=f.id
where s.id is null
on conflict (franchise_id) do nothing;

create or replace function public.make_draft_pick(p_draft_id uuid, p_athlete_id uuid default null::uuid, p_real_team_id uuid default null::uuid, p_auto boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user uuid:=auth.uid(); v_draft drafts%rowtype; v_pick draft_picks%rowtype; v_franchise uuid; v_total int; v_league uuid;
begin
  if (p_athlete_id is null) = (p_real_team_id is null) then raise exception 'Choose exactly one athlete or D/ST'; end if;
  select * into v_draft from drafts where id=p_draft_id for update;
  if v_draft.id is null or v_draft.status<>'live' then raise exception 'Draft is not live'; end if;
  select * into v_pick from draft_picks where draft_id=p_draft_id and pick_number=v_draft.current_pick for update;
  if v_pick.id is null then raise exception 'Current pick missing'; end if;
  select f.id, f.league_id into v_franchise,v_league from season_franchises sf join franchises f on f.id=sf.franchise_id where sf.id=v_pick.season_franchise_id;
  if p_auto and v_user is not null and not exists(select 1 from league_members lm where lm.league_id=v_league and lm.user_id=v_user and lm.role='commissioner') then raise exception 'Only the commissioner or draft system can auto-pick'; end if;
  if not p_auto and not exists(select 1 from franchise_owners fo where fo.franchise_id=v_franchise and fo.user_id=v_user and fo.ends_on is null) then raise exception 'Not your pick'; end if;
  if p_athlete_id is not null and exists(select 1 from draft_picks where draft_id=p_draft_id and athlete_id=p_athlete_id and picked_at is not null) then raise exception 'Athlete already drafted'; end if;
  if p_real_team_id is not null and exists(select 1 from draft_picks where draft_id=p_draft_id and real_team_id=p_real_team_id and picked_at is not null) then raise exception 'D/ST already drafted'; end if;

  update draft_picks set athlete_id=p_athlete_id, real_team_id=p_real_team_id, is_auto_pick=p_auto, picked_at=now() where id=v_pick.id;
  insert into roster_entries(season_franchise_id,athlete_id,real_team_id,acquired_via) values(v_pick.season_franchise_id,p_athlete_id,p_real_team_id,'draft');
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select ls.league_id,ls.id,v_user,'draft_pick','Draft pick made',jsonb_build_object('draft_id',p_draft_id,'pick_number',v_pick.pick_number,'athlete_id',p_athlete_id,'real_team_id',p_real_team_id,'season_franchise_id',v_pick.season_franchise_id) from league_seasons ls where ls.id=v_draft.league_season_id;

  select count(*) into v_total from draft_picks where draft_id=p_draft_id;
  if v_draft.current_pick >= v_total then
    update drafts set status='completed', completed_at=now() where id=p_draft_id;
  else
    update drafts set current_pick=current_pick+1 where id=p_draft_id;
  end if;
  return jsonb_build_object('pick_number',v_pick.pick_number,'season_franchise_id',v_pick.season_franchise_id,'complete',v_draft.current_pick>=v_total);
end
$function$;

revoke all on function public.provision_franchise_stadium() from public;
grant execute on function public.provision_franchise_stadium() to postgres;
