update public.league_feed_events set event_type='locker_room_message' where event_type='human_message';
create or replace function public.post_locker_room_message(p_league_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='public' as $function$
declare v_user uuid:=auth.uid(); v_event uuid; v_body text:=trim(p_body); v_ls uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if not public.is_league_member(p_league_id) then raise exception 'League access required'; end if;
  if v_body is null or char_length(v_body)<1 or char_length(v_body)>1000 then raise exception 'Message must be between 1 and 1000 characters'; end if;
  v_ls:=public.current_league_season_id(p_league_id); if v_ls is null then raise exception 'Current league season not found'; end if;
  insert into public.league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
  values(p_league_id,v_ls,v_user,'locker_room_message',v_body,'{}') returning id into v_event;
  return jsonb_build_object('status','posted','event_id',v_event);
end $function$;
