-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820075905, name historical_half_ppr_validation. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create table if not exists public.historical_fantasy_score_validation (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  game_id uuid not null references public.real_games(id) on delete cascade,
  scoring_profile_id uuid not null references public.scoring_profiles(id),
  calculated_points numeric(10,2) not null,
  provider_standard_points numeric(10,2),
  provider_ppr_points numeric(10,2),
  expected_half_ppr_points numeric(10,2),
  delta numeric(10,2),
  breakdown jsonb not null,
  validated_at timestamptz not null default now(),
  primary key (athlete_id, game_id, scoring_profile_id)
);
alter table public.historical_fantasy_score_validation enable row level security;
revoke all on public.historical_fantasy_score_validation from anon, authenticated;

do $$
declare v_profile uuid;
begin
 select id into v_profile from public.scoring_profiles where sport='football' and is_system_default=true limit 1;
 insert into public.historical_fantasy_score_validation(
   athlete_id,game_id,scoring_profile_id,calculated_points,provider_standard_points,provider_ppr_points,expected_half_ppr_points,delta,breakdown
 )
 select ags.athlete_id, ags.game_id, v_profile,
   round((
     coalesce((ags.raw_stats->>'passing_yards')::numeric,0)*0.04 +
     coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*4 -
     coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2 +
     coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)*0.1 +
     coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6 +
     coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5 +
     coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)*0.1 +
     coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6 +
     (coalesce((ags.raw_stats->>'passing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'rushing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'receiving_2pt_conversions')::numeric,0))*2 -
     (coalesce((ags.raw_stats->>'sack_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'rushing_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'receiving_fumbles_lost')::numeric,0))*2 +
     (coalesce((ags.raw_stats->>'fg_made_0_19')::numeric,0)+coalesce((ags.raw_stats->>'fg_made_20_29')::numeric,0)+coalesce((ags.raw_stats->>'fg_made_30_39')::numeric,0))*3 +
     coalesce((ags.raw_stats->>'fg_made_40_49')::numeric,0)*4 +
     (coalesce((ags.raw_stats->>'fg_made_50_59')::numeric,0)+coalesce((ags.raw_stats->>'fg_made_60_')::numeric,0))*5 +
     coalesce((ags.raw_stats->>'pat_made')::numeric,0)
   ),2),
   nullif(ags.raw_stats->>'fantasy_points','')::numeric,
   nullif(ags.raw_stats->>'fantasy_points_ppr','')::numeric,
   case when ags.raw_stats ? 'fantasy_points' and ags.raw_stats ? 'fantasy_points_ppr' then round(((ags.raw_stats->>'fantasy_points')::numeric + (ags.raw_stats->>'fantasy_points_ppr')::numeric)/2,2) end,
   case when ags.raw_stats ? 'fantasy_points' and ags.raw_stats ? 'fantasy_points_ppr' then round((
     coalesce((ags.raw_stats->>'passing_yards')::numeric,0)*0.04 + coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*4 - coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2 + coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)*0.1 + coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6 + coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5 + coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)*0.1 + coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6 + (coalesce((ags.raw_stats->>'passing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'rushing_2pt_conversions')::numeric,0)+coalesce((ags.raw_stats->>'receiving_2pt_conversions')::numeric,0))*2 - (coalesce((ags.raw_stats->>'sack_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'rushing_fumbles_lost')::numeric,0)+coalesce((ags.raw_stats->>'receiving_fumbles_lost')::numeric,0))*2 + (coalesce((ags.raw_stats->>'fg_made_0_19')::numeric,0)+coalesce((ags.raw_stats->>'fg_made_20_29')::numeric,0)+coalesce((ags.raw_stats->>'fg_made_30_39')::numeric,0))*3 + coalesce((ags.raw_stats->>'fg_made_40_49')::numeric,0)*4 + (coalesce((ags.raw_stats->>'fg_made_50_59')::numeric,0)+coalesce((ags.raw_stats->>'fg_made_60_')::numeric,0))*5 + coalesce((ags.raw_stats->>'pat_made')::numeric,0)
     ) - (((ags.raw_stats->>'fantasy_points')::numeric + (ags.raw_stats->>'fantasy_points_ppr')::numeric)/2),2) end,
   jsonb_build_object('pass_yd',coalesce((ags.raw_stats->>'passing_yards')::numeric,0)*0.04,'pass_td',coalesce((ags.raw_stats->>'passing_tds')::numeric,0)*4,'pass_int',-coalesce((ags.raw_stats->>'passing_interceptions')::numeric,0)*2,'rush_yd',coalesce((ags.raw_stats->>'rushing_yards')::numeric,0)*0.1,'rush_td',coalesce((ags.raw_stats->>'rushing_tds')::numeric,0)*6,'receptions',coalesce((ags.raw_stats->>'receptions')::numeric,0)*0.5,'rec_yd',coalesce((ags.raw_stats->>'receiving_yards')::numeric,0)*0.1,'rec_td',coalesce((ags.raw_stats->>'receiving_tds')::numeric,0)*6)
 from public.athlete_game_stats ags where ags.source_provider='nflverse'
 on conflict (athlete_id,game_id,scoring_profile_id) do update set calculated_points=excluded.calculated_points, provider_standard_points=excluded.provider_standard_points, provider_ppr_points=excluded.provider_ppr_points, expected_half_ppr_points=excluded.expected_half_ppr_points, delta=excluded.delta, breakdown=excluded.breakdown, validated_at=now();
end $$;
