create or replace function public.post_draft_completion_letter()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_league_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  select league_id into v_league_id from public.league_seasons where id = new.league_season_id;
  insert into public.league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
  select v_league_id, new.league_season_id, null, 'draft_completed',
    E'Dear Franchise Managers,\n\nCongratulations. The draft is complete, your franchises are built, and a new Big Exec season is officially underway. Every pick is now part of your team’s story.\n\nThank you for showing up, making the calls, and competing together. Set your lineups, watch the waiver wire, talk your talk, and take care of business each week.\n\nLet’s have a great season—and get ready for some football.\n\n— Big Exec Fantasy Sports',
    jsonb_build_object('draft_id', new.id, 'letter', true)
  where v_league_id is not null and not exists (
    select 1 from public.league_feed_events event
    where event.event_type = 'draft_completed' and event.payload->>'draft_id' = new.id::text
  );
  return new;
end
$function$;

drop trigger if exists drafts_post_completion_letter on public.drafts;
create trigger drafts_post_completion_letter
after update of status on public.drafts
for each row
when (new.status = 'completed' and old.status is distinct from new.status)
execute function public.post_draft_completion_letter();

revoke all on function public.post_draft_completion_letter() from public, anon, authenticated;
