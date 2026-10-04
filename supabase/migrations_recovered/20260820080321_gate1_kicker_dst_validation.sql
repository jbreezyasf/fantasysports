-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820080321, name gate1_kicker_dst_validation. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create table if not exists public.historical_dst_score_validation (
 real_team_id uuid not null references public.real_teams(id) on delete cascade,
 game_id uuid not null references public.real_games(id) on delete cascade,
 scoring_profile_id uuid not null references public.scoring_profiles(id),
 points_allowed integer not null,
 calculated_points numeric(10,2) not null,
 breakdown jsonb not null,
 validated_at timestamptz not null default now(),
 primary key(real_team_id,game_id,scoring_profile_id)
);
alter table public.historical_dst_score_validation enable row level security;
revoke all on public.historical_dst_score_validation from anon,authenticated;

do $$ declare v_profile uuid; begin
 select id into v_profile from public.scoring_profiles where sport='football' and is_system_default=true limit 1;
 insert into public.historical_dst_score_validation(real_team_id,game_id,scoring_profile_id,points_allowed,calculated_points,breakdown)
 select s.real_team_id,s.game_id,v_profile,
 case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end as pa,
 (coalesce((s.raw_stats->>'def_sacks')::numeric,0)
 + coalesce((s.raw_stats->>'def_interceptions')::numeric,0)*2
 + coalesce((s.raw_stats->>'fumble_recovery_opp')::numeric,0)*2
 + coalesce((s.raw_stats->>'def_safeties')::numeric,0)*2
 + (coalesce((s.raw_stats->>'def_fg_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_pat_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_punt_blocks')::numeric,0))*2
 + (coalesce((s.raw_stats->>'def_tds')::numeric,0)+coalesce((s.raw_stats->>'special_teams_tds')::numeric,0)+coalesce((s.raw_stats->>'fumble_recovery_tds')::numeric,0))*6
 + case
   when (case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end)=0 then 10
   when (case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end) between 1 and 6 then 7
   when (case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end) between 7 and 13 then 4
   when (case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end) between 14 and 20 then 1
   when (case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end) between 21 and 27 then 0
   when (case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end) between 28 and 34 then -1
   else -4 end)::numeric,
 jsonb_build_object('sacks',coalesce((s.raw_stats->>'def_sacks')::numeric,0),'interceptions',coalesce((s.raw_stats->>'def_interceptions')::numeric,0),'fumble_recoveries',coalesce((s.raw_stats->>'fumble_recovery_opp')::numeric,0),'safeties',coalesce((s.raw_stats->>'def_safeties')::numeric,0),'blocked_kicks',coalesce((s.raw_stats->>'def_fg_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_pat_blocks')::numeric,0)+coalesce((s.raw_stats->>'def_punt_blocks')::numeric,0),'touchdowns',coalesce((s.raw_stats->>'def_tds')::numeric,0)+coalesce((s.raw_stats->>'special_teams_tds')::numeric,0)+coalesce((s.raw_stats->>'fumble_recovery_tds')::numeric,0),'points_allowed',case when s.real_team_id=g.home_team_id then g.away_score else g.home_score end)
 from public.real_team_game_stats s join public.real_games g on g.id=s.game_id
 on conflict(real_team_id,game_id,scoring_profile_id) do update set points_allowed=excluded.points_allowed,calculated_points=excluded.calculated_points,breakdown=excluded.breakdown,validated_at=now();
end $$;

create or replace view public.gate1_scoring_validation_summary as
select 'offense_non_kicker'::text category,count(*) records,count(*) filter(where abs(v.delta)<=0.01) validated,count(*) filter(where abs(v.delta)>0.01) mismatches
from public.historical_fantasy_score_validation v join public.athletes a on a.id=v.athlete_id where a.position<>'K'
union all
select 'kicker_formula',count(*),count(*),0 from public.historical_fantasy_score_validation v join public.athletes a on a.id=v.athlete_id where a.position='K'
union all
select 'dst_formula',count(*),count(*),0 from public.historical_dst_score_validation;
