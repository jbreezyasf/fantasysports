-- A franchise can earn the same achievement type in multiple seasons, but a stadium feature unlocks once.
create or replace function public.sync_franchise_stadium_features(p_franchise_id uuid)
returns integer
language plpgsql
security definer
set search_path='public'
as $function$
declare
  v_stadium uuid;
  v_count int;
begin
  select id into v_stadium from public.stadiums where franchise_id=p_franchise_id;
  if v_stadium is null then
    insert into public.stadiums(franchise_id,environment_key)
    values(p_franchise_id,'neon_dome') returning id into v_stadium;
  end if;

  insert into public.franchise_stadium_features(stadium_id,stadium_feature_id,source_achievement_id)
  select distinct on (sf.id)
    v_stadium,sf.id,fa.id
  from public.franchise_achievements fa
  join public.achievements a on a.id=fa.achievement_id
  join public.stadium_features sf on sf.achievement_code=a.code and sf.active
  where fa.franchise_id=p_franchise_id
  order by sf.id,fa.earned_at,fa.id
  on conflict (stadium_id,stadium_feature_id) do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end
$function$;

revoke all on function public.sync_franchise_stadium_features(uuid) from public,anon,authenticated;
grant execute on function public.sync_franchise_stadium_features(uuid) to postgres,service_role;
