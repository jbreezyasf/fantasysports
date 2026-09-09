revoke execute on function public.create_league_share_invite(uuid) from public, anon;
revoke execute on function public.claim_share_league_invite(uuid) from public, anon;
revoke execute on function public.commissioner_remove_pre_draft_franchise(uuid, uuid) from public, anon;

grant execute on function public.create_league_share_invite(uuid) to authenticated;
grant execute on function public.claim_share_league_invite(uuid) to authenticated;
grant execute on function public.commissioner_remove_pre_draft_franchise(uuid, uuid) to authenticated;
