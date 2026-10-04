-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820214513, name gate4_generated_talk_flow. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

alter table public.generated_messages add column if not exists matchup_id uuid references public.matchups(id) on delete cascade;
create index if not exists generated_messages_matchup_idx on public.generated_messages(matchup_id,requested_by,tone,created_at desc);

grant insert on public.story_events, public.generated_messages to authenticated;

drop policy if exists member_insert_story_events on public.story_events;
create policy member_insert_story_events on public.story_events for insert to authenticated with check (is_league_member(league_id));
drop policy if exists requester_insert_generated_messages on public.generated_messages;
create policy requester_insert_generated_messages on public.generated_messages for insert to authenticated with check (requested_by=auth.uid() and is_league_member(league_id));

create or replace function public.record_generated_message(p_matchup_id uuid,p_tone text,p_body text,p_provider text default 'template')
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_league uuid; v_ls uuid; v_story uuid; v_message uuid; v_body text:=trim(p_body); v_tone text:=lower(trim(p_tone));
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if v_tone not in ('respect','playful','petty','savage') then raise exception 'Unsupported tone'; end if;
 if v_body is null or char_length(v_body)<1 or char_length(v_body)>1200 then raise exception 'Generated message must be between 1 and 1200 characters'; end if;
 select ls.league_id,m.league_season_id into v_league,v_ls from matchups m join league_seasons ls on ls.id=m.league_season_id where m.id=p_matchup_id and m.is_final;
 if v_league is null then raise exception 'Final matchup not found'; end if;
 if not is_league_member(v_league) then raise exception 'League access required'; end if;
 insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts)
 select v_league,v_ls,'matchup',m.id,'postgame_talk_requested',jsonb_build_object('week',m.week,'home_points',m.home_points,'away_points',m.away_points,'winner_season_franchise_id',m.winner_season_franchise_id,'home_season_franchise_id',m.home_season_franchise_id,'away_season_franchise_id',m.away_season_franchise_id)
 from matchups m where m.id=p_matchup_id returning id into v_story;
 insert into generated_messages(league_id,league_season_id,source_event_id,requested_by,tone,body,provider,matchup_id)
 values(v_league,v_ls,v_story,v_user,v_tone,v_body,left(coalesce(nullif(trim(p_provider),''),'template'),64),p_matchup_id) returning id into v_message;
 return jsonb_build_object('status','recorded','message_id',v_message);
end $$;

create or replace function public.post_generated_message(p_message_id uuid,p_body text default null)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); gm generated_messages%rowtype; v_event uuid; v_body text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select * into gm from generated_messages where id=p_message_id and requested_by=v_user;
 if gm.id is null then raise exception 'Generated message not found'; end if;
 if not is_league_member(gm.league_id) then raise exception 'League access required'; end if;
 v_body:=trim(coalesce(nullif(p_body,''),gm.body));
 if char_length(v_body)<1 or char_length(v_body)>1200 then raise exception 'Post must be between 1 and 1200 characters'; end if;
 insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
 values(gm.league_id,gm.league_season_id,v_user,'postgame_talk',v_body,jsonb_build_object('tone',gm.tone,'provider',gm.provider,'matchup_id',gm.matchup_id,'generated_message_id',gm.id)) returning id into v_event;
 return jsonb_build_object('status','posted','event_id',v_event,'league_id',gm.league_id);
end $$;

grant execute on function public.record_generated_message(uuid,text,text,text) to authenticated;
grant execute on function public.post_generated_message(uuid,text) to authenticated;
