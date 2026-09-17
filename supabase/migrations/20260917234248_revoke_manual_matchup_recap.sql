-- Recaps are produced by the automatic week-finalization path only.
revoke execute on function public.build_matchup_recap(uuid) from public, anon, authenticated;
