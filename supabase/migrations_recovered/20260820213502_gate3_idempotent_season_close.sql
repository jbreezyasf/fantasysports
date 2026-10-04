-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820213502, name gate3_idempotent_season_close. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create or replace function public.close_league_season(p_league_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_ls uuid; v_status text; champ matchups%rowtype; red matchups%rowtype; champ_franchise uuid; red_franchise uuid; ach uuid;
begin
  if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
  select ls.id,ls.status into v_ls,v_status from league_seasons ls join competition_seasons cs on cs.id=ls.competition_season_id where ls.league_id=p_league_id order by cs.season_year desc limit 1;
  if v_status='complete' and exists(select 1 from championships where league_season_id=v_ls and bracket='championship') then
    return jsonb_build_object('status','complete','league_season_id',v_ls,'already_closed',true,
      'champion',(select winner_season_franchise_id from championships where league_season_id=v_ls and bracket='championship'),
      'redemption_champion',(select winner_season_franchise_id from championships where league_season_id=v_ls and bracket='redemption'));
  end if;
  select * into champ from matchups where league_season_id=v_ls and week=17 and event_type='championship' and is_final limit 1;
  select * into red from matchups where league_season_id=v_ls and week=17 and event_type='redemption_final' and is_final limit 1;
  if champ.id is null or champ.winner_season_franchise_id is null then raise exception 'Championship final must be complete'; end if;
  if red.id is null or red.winner_season_franchise_id is null then raise exception 'Redemption final must be complete'; end if;
  insert into championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id)
  values(v_ls,'championship',champ.winner_season_franchise_id,case when champ.winner_season_franchise_id=champ.home_season_franchise_id then champ.away_season_franchise_id else champ.home_season_franchise_id end,champ.id)
  on conflict (league_season_id,bracket) do nothing;
  insert into championships(league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,final_matchup_id)
  values(v_ls,'redemption',red.winner_season_franchise_id,case when red.winner_season_franchise_id=red.home_season_franchise_id then red.away_season_franchise_id else red.home_season_franchise_id end,red.id)
  on conflict (league_season_id,bracket) do nothing;
  select franchise_id into champ_franchise from season_franchises where id=champ.winner_season_franchise_id;
  select franchise_id into red_franchise from season_franchises where id=red.winner_season_franchise_id;
  select id into ach from achievements where code='LEAGUE_CHAMPION';
  if ach is not null and not exists(select 1 from franchise_achievements where franchise_id=champ_franchise and league_season_id=v_ls and achievement_id=ach) then insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(champ_franchise,v_ls,ach,17,jsonb_build_object('bracket','championship','matchup_id',champ.id)); end if;
  select id into ach from achievements where code='REDEMPTION_CHAMPION';
  if ach is not null and not exists(select 1 from franchise_achievements where franchise_id=red_franchise and league_season_id=v_ls and achievement_id=ach) then insert into franchise_achievements(franchise_id,league_season_id,achievement_id,week,payload) values(red_franchise,v_ls,ach,17,jsonb_build_object('bracket','redemption','matchup_id',red.id,'next_season_reward','first_choice_snake_draft_slot')); end if;
  update league_seasons set status='complete' where id=v_ls;
  insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  select p_league_id,v_ls,v_user,'season_complete','Season complete',jsonb_build_object('champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id)
  where not exists(select 1 from league_feed_events where league_id=p_league_id and season_id=v_ls and event_type='season_complete');
  return jsonb_build_object('status','complete','league_season_id',v_ls,'already_closed',false,'champion',champ.winner_season_franchise_id,'redemption_champion',red.winner_season_franchise_id);
end $$;
