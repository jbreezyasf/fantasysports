-- Replace remaining "latest season year" lookups with the explicit current-season resolver.
-- Dynamic replacement preserves the already-tested gameplay bodies while changing only season resolution.
do $migration$
declare
  fn text;
  def text;
  old_resolver text := 'select ls.id into v_ls from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;';
  new_resolver text := 'v_ls := public.current_league_season_id(p_league_id);';
begin
  foreach fn in array array[
    'generate_circuit_schedule','generate_rivalry_week','generate_revenge_week','generate_position_week',
    'generate_chaos_week','generate_judgment_week','initialize_postseason',
    'generate_postseason_week16','generate_postseason_week17'
  ] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=fn and p.prokind='f'
    limit 1;
    if def is null or position(old_resolver in def)=0 then
      raise exception 'Expected season resolver not found in %',fn;
    end if;
    def := replace(def,old_resolver,new_resolver);
    execute def;
  end loop;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='initialize_snake_draft' and p.prokind='f' limit 1;
  if def is null or position('select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;' in def)=0 then
    raise exception 'Expected season resolver not found in initialize_snake_draft';
  end if;
  def := replace(def,
    'select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;',
    'v_league_season := public.current_league_season_id(p_league_id);');
  execute def;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='accept_league_invite' and p.prokind='f' limit 1;
  if def is null or position('select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=v_invite.league_id order by cs.season_year desc limit 1;' in def)=0 then
    raise exception 'Expected season resolver not found in accept_league_invite';
  end if;
  def := replace(def,
    'select ls.id into v_league_season from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=v_invite.league_id order by cs.season_year desc limit 1;',
    'v_league_season := public.current_league_season_id(v_invite.league_id);');
  execute def;

  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='close_league_season' and p.prokind='f' limit 1;
  if def is null or position('select ls.id,ls.status into v_ls,v_status from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;' in def)=0 then
    raise exception 'Expected season resolver not found in close_league_season';
  end if;
  def := replace(def,
    'select ls.id,ls.status into v_ls,v_status from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;',
    'v_ls := public.current_league_season_id(p_league_id); select status into v_status from public.league_seasons where id=v_ls;');
  execute def;
end
$migration$;
