-- The schedule is global, non-sensitive competition data. RLS already limits
-- reads to authenticated users, but PostgREST also requires the table grant.
grant select on table public.real_games to authenticated;
