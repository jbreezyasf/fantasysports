-- Stat corrections for games that are already final.
--
-- Why: recompute_matchup decides the winner and writes the standings exactly
-- once, when a matchup is finalized. If a player's statistics arrive or change
-- afterwards (a provider stat correction, or the 2026 Weeks 2-4 gap where
-- players with no stored scoring-provider id were skipped), the matchup total,
-- the winner and the standings stay as they were.
--
-- system_correct_final_matchups(league season, week) re-totals every FINAL
-- matchup of that week from the current fantasy scores and, only where a total
-- changed:
--   - writes the new totals and, if the result changed, the new winner;
--   - moves the standings by the difference (points for / against always; the
--     win, loss or tie only when the result changed; the streak of the two
--     franchises is then rebuilt from their final games);
--   - records before and after in matchups.context.stat_corrections, in
--     ops_audit_events (action 'matchup_stat_correction') and in the league
--     feed (event 'matchup_corrected').
-- A matchup whose totals did not change is not touched, so the function can be
-- run any number of times.
--
-- Not revisited by a correction: achievements already awarded, a Chaos Week
-- bounty already granted, the published weekly recap, and later weeks that were
-- generated from the standings (playoff seeding). Those need a person.
--
-- Service role only. Safe to run more than once. Creates one function; changes
-- no existing function or table.

create or replace function public.system_correct_final_matchups(p_league_season_id uuid, p_week integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  m matchups%rowtype; v_new jsonb; v_home numeric; v_away numeric; v_winner uuid; v_clause jsonb; v_league uuid;
  v_result_changed boolean; v_entry jsonb; v_changes jsonb:='[]'::jsonb; v_checked integer:=0; v_sf uuid; v_streak integer; r record;
begin
  if auth.uid() is not null then raise exception 'Stat corrections are applied by the system only'; end if;
  select league_id into v_league from league_seasons where id=p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;

  for m in select * from matchups where league_season_id=p_league_season_id and week=p_week and is_final and result_source='LIVE' order by id for update loop
    v_checked:=v_checked+1;
    -- Re-total from the current scores (rule cards included). On a final matchup this only rewrites the two totals.
    v_new:=recompute_matchup(m.id,false);
    v_home:=round((v_new->>'home_points')::numeric,2); v_away:=round((v_new->>'away_points')::numeric,2);
    if v_home=m.home_points and v_away=m.away_points then continue; end if;

    v_clause:=null;
    if v_home>v_away then v_winner:=m.home_season_franchise_id;
    elsif v_away>v_home then v_winner:=m.away_season_franchise_id;
    else
      v_winner:=null;
      if chaos_clause_applies(m.event_type) then
        v_clause:=chaos_clause_decision(m.league_season_id,m.home_season_franchise_id,m.away_season_franchise_id);
        v_winner:=(v_clause->>'winner_season_franchise_id')::uuid;
      end if;
    end if;
    v_result_changed:=v_winner is distinct from m.winner_season_franchise_id;

    -- Standings: take the old result out, put the new one in.
    update standings s set
      points_for=points_for+case when s.season_franchise_id=m.home_season_franchise_id then v_home-m.home_points else v_away-m.away_points end,
      points_against=points_against+case when s.season_franchise_id=m.home_season_franchise_id then v_away-m.away_points else v_home-m.home_points end,
      wins=wins-(m.winner_season_franchise_id is not distinct from s.season_franchise_id)::int+(v_winner is not distinct from s.season_franchise_id)::int,
      losses=losses-(m.winner_season_franchise_id is not null and m.winner_season_franchise_id<>s.season_franchise_id)::int+(v_winner is not null and v_winner<>s.season_franchise_id)::int,
      ties=ties-(m.winner_season_franchise_id is null)::int+(v_winner is null)::int
    where s.league_season_id=m.league_season_id and s.season_franchise_id in (m.home_season_franchise_id,m.away_season_franchise_id);

    v_entry:=jsonb_build_object('corrected_at',now(),'week',m.week,
      'before',jsonb_build_object('home_points',m.home_points,'away_points',m.away_points,'winner_season_franchise_id',m.winner_season_franchise_id),
      'after',jsonb_build_object('home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner),
      'result_changed',v_result_changed);
    update matchups set home_points=v_home,away_points=v_away,winner_season_franchise_id=v_winner,
      -- The Chaos Clause note describes a level game: replaced when the corrected game is level, removed when it is not.
      context=(coalesce(context,'{}'::jsonb)-'chaos_clause')
        ||jsonb_build_object('stat_corrections',coalesce(context->'stat_corrections','[]'::jsonb)||jsonb_build_array(v_entry))
        ||case when v_clause is not null then jsonb_build_object('chaos_clause',v_clause) else '{}'::jsonb end
    where id=m.id;

    -- The streak is a run of results, so after a changed result it is rebuilt from the franchise's final games.
    if v_result_changed then
      foreach v_sf in array array[m.home_season_franchise_id,m.away_season_franchise_id] loop
        v_streak:=0;
        for r in select case when x.winner_season_franchise_id is null then 0 when x.winner_season_franchise_id=v_sf then 1 else -1 end as outcome
                 from matchups x where x.league_season_id=m.league_season_id and x.is_final and v_sf in (x.home_season_franchise_id,x.away_season_franchise_id) order by x.week desc, x.id desc loop
          if r.outcome=0 then exit;
          elsif v_streak=0 then v_streak:=r.outcome;
          elsif sign(v_streak)=r.outcome then v_streak:=v_streak+r.outcome;
          else exit; end if;
        end loop;
        update standings set streak=v_streak where league_season_id=m.league_season_id and season_franchise_id=v_sf;
      end loop;
    end if;

    insert into ops_audit_events(action,target_type,target_id,metadata) values('matchup_stat_correction','matchup',m.id::text,v_entry||jsonb_build_object('league_season_id',m.league_season_id));
    insert into league_feed_events(league_id,season_id,event_type,body,payload)
      values(v_league,m.league_season_id,'matchup_corrected',
        case when v_result_changed then 'Week '||m.week||' result changed after a stat correction' else 'Week '||m.week||' score updated after a stat correction' end,
        v_entry||jsonb_build_object('matchup_id',m.id));
    v_changes:=v_changes||jsonb_build_array(v_entry||jsonb_build_object('matchup_id',m.id));
  end loop;

  return jsonb_build_object('league_season_id',p_league_season_id,'week',p_week,'checked',v_checked,'corrected',jsonb_array_length(v_changes),
    'results_changed',(select count(*) from jsonb_array_elements(v_changes) e where (e->>'result_changed')::boolean),'changes',v_changes);
end $function$;

revoke all on function public.system_correct_final_matchups(uuid, integer) from public, anon, authenticated;
grant execute on function public.system_correct_final_matchups(uuid, integer) to service_role;
