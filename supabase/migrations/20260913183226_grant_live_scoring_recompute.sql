-- Live scoring is an authenticated server job. Grant only its required RPC.
grant execute on function public.recompute_matchup(uuid, boolean) to service_role;
