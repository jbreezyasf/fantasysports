-- RECOVERED from supabase_migrations.schema_migrations.statements (production history).
-- version 20260820213900, name gate4_social_trade_engine. Retrieved 2026-10-04T04:56:57Z (UTC).
-- Already applied in production. Kept for the record only; do NOT re-apply.

create table if not exists public.feed_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.league_feed_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (char_length(reaction) between 1 and 16),
  created_at timestamptz not null default now(),
  unique(event_id,user_id,reaction)
);

create table if not exists public.weekly_awards (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  week integer not null check (week between 1 and 18),
  code text not null,
  title text not null,
  winner_season_franchise_id uuid references public.season_franchises(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(league_season_id,week,code)
);

create table if not exists public.story_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  league_season_id uuid references public.league_seasons(id) on delete cascade,
  source_type text not null,
  source_id uuid,
  event_type text not null,
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_messages (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  league_season_id uuid references public.league_seasons(id) on delete cascade,
  source_event_id uuid references public.story_events(id) on delete set null,
  requested_by uuid references auth.users(id) on delete set null,
  tone text not null check (tone in ('respect','playful','petty','savage','system')),
  body text not null check (char_length(body) between 1 and 1200),
  provider text not null default 'template',
  created_at timestamptz not null default now()
);

alter table public.feed_reactions enable row level security;
alter table public.weekly_awards enable row level security;
alter table public.story_events enable row level security;
alter table public.generated_messages enable row level security;

grant select,insert,delete on public.feed_reactions to authenticated;
grant select on public.weekly_awards,public.story_events,public.generated_messages to authenticated;
grant select,insert on public.league_feed_events to authenticated;
grant select on public.trades,public.trade_items,public.trade_messages to authenticated;
grant execute on function public.is_league_member(uuid) to authenticated;

drop policy if exists member_read_feed_reactions on public.feed_reactions;
create policy member_read_feed_reactions on public.feed_reactions for select to authenticated using (
 exists(select 1 from league_feed_events e where e.id=feed_reactions.event_id and is_league_member(e.league_id))
);
drop policy if exists own_manage_feed_reactions on public.feed_reactions;
create policy own_manage_feed_reactions on public.feed_reactions for all to authenticated using (user_id=auth.uid()) with check (
 user_id=auth.uid() and exists(select 1 from league_feed_events e where e.id=feed_reactions.event_id and is_league_member(e.league_id))
);

drop policy if exists member_read_weekly_awards on public.weekly_awards;
create policy member_read_weekly_awards on public.weekly_awards for select to authenticated using (
 exists(select 1 from league_seasons ls where ls.id=weekly_awards.league_season_id and is_league_member(ls.league_id))
);
drop policy if exists member_read_story_events on public.story_events;
create policy member_read_story_events on public.story_events for select to authenticated using (is_league_member(league_id));
drop policy if exists member_read_generated_messages on public.generated_messages;
create policy member_read_generated_messages on public.generated_messages for select to authenticated using (is_league_member(league_id));

-- Active trade proposals and their item details are private to the two franchise owners.
drop policy if exists member_read_trades on public.trades;
drop policy if exists trade_participant_read_trades on public.trades;
create policy trade_participant_read_trades on public.trades for select to authenticated using (
 exists(
  select 1 from season_franchises a join franchise_owners fa on fa.franchise_id=a.franchise_id
  where a.id=trades.proposed_by_franchise_id and fa.user_id=auth.uid() and fa.ends_on is null
 ) or exists(
  select 1 from season_franchises b join franchise_owners fb on fb.franchise_id=b.franchise_id
  where b.id=trades.proposed_to_franchise_id and fb.user_id=auth.uid() and fb.ends_on is null
 )
);
drop policy if exists member_read_trade_items on public.trade_items;
drop policy if exists trade_participant_read_items on public.trade_items;
create policy trade_participant_read_items on public.trade_items for select to authenticated using (
 exists(select 1 from trades t where t.id=trade_items.trade_id and (
   exists(select 1 from season_franchises a join franchise_owners fa on fa.franchise_id=a.franchise_id where a.id=t.proposed_by_franchise_id and fa.user_id=auth.uid() and fa.ends_on is null)
   or exists(select 1 from season_franchises b join franchise_owners fb on fb.franchise_id=b.franchise_id where b.id=t.proposed_to_franchise_id and fb.user_id=auth.uid() and fb.ends_on is null)
 ))
);
drop policy if exists trade_participant_insert_messages on public.trade_messages;
create policy trade_participant_insert_messages on public.trade_messages for insert to authenticated with check (
 user_id=auth.uid() and exists(select 1 from trades t where t.id=trade_messages.trade_id and t.status='proposed' and (
   exists(select 1 from season_franchises a join franchise_owners fa on fa.franchise_id=a.franchise_id where a.id=t.proposed_by_franchise_id and fa.user_id=auth.uid() and fa.ends_on is null)
   or exists(select 1 from season_franchises b join franchise_owners fb on fb.franchise_id=b.franchise_id where b.id=t.proposed_to_franchise_id and fb.user_id=auth.uid() and fb.ends_on is null)
 ))
);

create or replace function public.post_locker_room_message(p_league_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_event uuid; v_body text:=trim(p_body); v_ls uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if not is_league_member(p_league_id) then raise exception 'League access required'; end if;
 if v_body is null or char_length(v_body)<1 or char_length(v_body)>1000 then raise exception 'Message must be between 1 and 1000 characters'; end if;
 select id into v_ls from league_seasons where league_id=p_league_id order by id desc limit 1;
 insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload) values(p_league_id,v_ls,v_user,'human_message',v_body,'{}') returning id into v_event;
 return jsonb_build_object('status','posted','event_id',v_event);
end $$;

create or replace function public.toggle_feed_reaction(p_event_id uuid,p_reaction text)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_league uuid; v_reaction text:=trim(p_reaction); v_deleted int;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select league_id into v_league from league_feed_events where id=p_event_id;
 if v_league is null or not is_league_member(v_league) then raise exception 'League access required'; end if;
 if v_reaction not in ('🔥','😂','👀','👏','💀','🏆') then raise exception 'Unsupported reaction'; end if;
 delete from feed_reactions where event_id=p_event_id and user_id=v_user and reaction=v_reaction;
 get diagnostics v_deleted=row_count;
 if v_deleted>0 then return jsonb_build_object('status','removed','reaction',v_reaction); end if;
 insert into feed_reactions(event_id,user_id,reaction) values(p_event_id,v_user,v_reaction);
 return jsonb_build_object('status','added','reaction',v_reaction);
end $$;

create or replace function public.create_trade_proposal(
 p_league_season_id uuid,p_to_season_franchise_id uuid,
 p_offer_athlete_ids uuid[] default '{}',p_request_athlete_ids uuid[] default '{}',
 p_offer_team_ids uuid[] default '{}',p_request_team_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_from uuid; v_trade uuid; v_league uuid; x uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select sf.id into v_from from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.league_season_id=p_league_season_id and fo.user_id=v_user and fo.ends_on is null limit 1;
 if v_from is null then raise exception 'You do not own a franchise in this season'; end if;
 if p_to_season_franchise_id=v_from then raise exception 'Cannot trade with your own franchise'; end if;
 if not exists(select 1 from season_franchises where id=p_to_season_franchise_id and league_season_id=p_league_season_id) then raise exception 'Trade partner not in this league season'; end if;
 if coalesce(array_length(p_offer_athlete_ids,1),0)+coalesce(array_length(p_request_athlete_ids,1),0)+coalesce(array_length(p_offer_team_ids,1),0)+coalesce(array_length(p_request_team_ids,1),0)=0 then raise exception 'Trade must contain at least one asset'; end if;
 foreach x in array p_offer_athlete_ids loop if not exists(select 1 from roster_entries where season_franchise_id=v_from and athlete_id=x and dropped_at is null) then raise exception 'Offered athlete is no longer on your roster'; end if; end loop;
 foreach x in array p_request_athlete_ids loop if not exists(select 1 from roster_entries where season_franchise_id=p_to_season_franchise_id and athlete_id=x and dropped_at is null) then raise exception 'Requested athlete is no longer on partner roster'; end if; end loop;
 foreach x in array p_offer_team_ids loop if not exists(select 1 from roster_entries where season_franchise_id=v_from and real_team_id=x and dropped_at is null) then raise exception 'Offered D/ST is no longer on your roster'; end if; end loop;
 foreach x in array p_request_team_ids loop if not exists(select 1 from roster_entries where season_franchise_id=p_to_season_franchise_id and real_team_id=x and dropped_at is null) then raise exception 'Requested D/ST is no longer on partner roster'; end if; end loop;
 insert into trades(league_season_id,proposed_by_franchise_id,proposed_to_franchise_id,status) values(p_league_season_id,v_from,p_to_season_franchise_id,'proposed') returning id into v_trade;
 foreach x in array p_offer_athlete_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id) values(v_trade,v_from,p_to_season_franchise_id,x); end loop;
 foreach x in array p_request_athlete_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,athlete_id) values(v_trade,p_to_season_franchise_id,v_from,x); end loop;
 foreach x in array p_offer_team_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,real_team_id) values(v_trade,v_from,p_to_season_franchise_id,x); end loop;
 foreach x in array p_request_team_ids loop insert into trade_items(trade_id,from_season_franchise_id,to_season_franchise_id,real_team_id) values(v_trade,p_to_season_franchise_id,v_from,x); end loop;
 select league_id into v_league from league_seasons where id=p_league_season_id;
 insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts) values(v_league,p_league_season_id,'trade',v_trade,'trade_proposed',jsonb_build_object('from',v_from,'to',p_to_season_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=v_trade)));
 return jsonb_build_object('status','proposed','trade_id',v_trade);
end $$;

create or replace function public.post_trade_message(p_trade_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_body text:=trim(p_body); v_id uuid;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if v_body is null or char_length(v_body)<1 or char_length(v_body)>1000 then raise exception 'Message must be between 1 and 1000 characters'; end if;
 if not exists(select 1 from trades t where t.id=p_trade_id and t.status='proposed' and (
   exists(select 1 from season_franchises a join franchise_owners fa on fa.franchise_id=a.franchise_id where a.id=t.proposed_by_franchise_id and fa.user_id=v_user and fa.ends_on is null)
   or exists(select 1 from season_franchises b join franchise_owners fb on fb.franchise_id=b.franchise_id where b.id=t.proposed_to_franchise_id and fb.user_id=v_user and fb.ends_on is null))) then raise exception 'Trade room access required'; end if;
 insert into trade_messages(trade_id,user_id,body) values(p_trade_id,v_user,v_body) returning id into v_id;
 return jsonb_build_object('status','posted','message_id',v_id);
end $$;

create or replace function public.resolve_trade(p_trade_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); t trades%rowtype; v_league uuid; v_last_final int:=0; item record; v_owner_from boolean; v_owner_to boolean;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select * into t from trades where id=p_trade_id for update;
 if t.id is null then raise exception 'Trade not found'; end if;
 if t.status<>'proposed' then return jsonb_build_object('status',t.status,'already_resolved',true); end if;
 select exists(select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=t.proposed_by_franchise_id and fo.user_id=v_user and fo.ends_on is null) into v_owner_from;
 select exists(select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id=sf.franchise_id where sf.id=t.proposed_to_franchise_id and fo.user_id=v_user and fo.ends_on is null) into v_owner_to;
 if p_action='cancel' then if not v_owner_from then raise exception 'Only proposer can cancel'; end if; update trades set status='cancelled',resolved_at=now() where id=t.id; return jsonb_build_object('status','cancelled'); end if;
 if p_action='reject' then if not v_owner_to then raise exception 'Only recipient can reject'; end if; update trades set status='rejected',resolved_at=now() where id=t.id; return jsonb_build_object('status','rejected'); end if;
 if p_action<>'accept' then raise exception 'Unsupported trade action'; end if;
 if not v_owner_to then raise exception 'Only recipient can accept'; end if;
 for item in select * from trade_items where trade_id=t.id loop
   if item.athlete_id is not null and not exists(select 1 from roster_entries where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and dropped_at is null) then raise exception 'Trade asset changed before acceptance'; end if;
   if item.real_team_id is not null and not exists(select 1 from roster_entries where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and dropped_at is null) then raise exception 'Trade asset changed before acceptance'; end if;
 end loop;
 select coalesce(max(week),0) into v_last_final from matchups where league_season_id=t.league_season_id and is_final;
 for item in select * from trade_items where trade_id=t.id loop
   if item.athlete_id is not null then
     update roster_entries set dropped_at=now() where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and dropped_at is null;
     insert into roster_entries(season_franchise_id,athlete_id,acquired_via) values(item.to_season_franchise_id,item.athlete_id,'trade');
     delete from lineups where season_franchise_id=item.from_season_franchise_id and athlete_id=item.athlete_id and week>v_last_final;
   else
     update roster_entries set dropped_at=now() where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and dropped_at is null;
     insert into roster_entries(season_franchise_id,real_team_id,acquired_via) values(item.to_season_franchise_id,item.real_team_id,'trade');
     delete from lineups where season_franchise_id=item.from_season_franchise_id and real_team_id=item.real_team_id and week>v_last_final;
   end if;
 end loop;
 update trades set status='accepted',resolved_at=now() where id=t.id;
 select league_id into v_league from league_seasons where id=t.league_season_id;
 insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
 values(v_league,t.league_season_id,v_user,'trade_accepted','Trade accepted',jsonb_build_object('trade_id',t.id,'from',t.proposed_by_franchise_id,'to',t.proposed_to_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=t.id)));
 insert into story_events(league_id,league_season_id,source_type,source_id,event_type,facts)
 values(v_league,t.league_season_id,'trade',t.id,'trade_accepted',jsonb_build_object('from',t.proposed_by_franchise_id,'to',t.proposed_to_franchise_id,'asset_count',(select count(*) from trade_items where trade_id=t.id)));
 return jsonb_build_object('status','accepted','trade_id',t.id);
end $$;

create or replace function public.generate_weekly_awards(p_league_id uuid,p_week integer)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare v_user uuid:=auth.uid(); v_ls uuid; rec record; v_count int:=0;
begin
 if not exists(select 1 from league_members where league_id=p_league_id and user_id=v_user and role='commissioner') then raise exception 'Commissioner access required'; end if;
 select id into v_ls from league_seasons where league_id=p_league_id order by id desc limit 1;
 if not exists(select 1 from matchups where league_season_id=v_ls and week=p_week) then raise exception 'No matchups for this week'; end if;
 if exists(select 1 from matchups where league_season_id=v_ls and week=p_week and not is_final) then raise exception 'All matchups must be final before awards'; end if;
 -- Highest Score
 select season_franchise_id,points into rec from (
   select home_season_franchise_id season_franchise_id,home_points points from matchups where league_season_id=v_ls and week=p_week
   union all select away_season_franchise_id,away_points from matchups where league_season_id=v_ls and week=p_week
 ) x order by points desc,season_franchise_id limit 1;
 insert into weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload) values(v_ls,p_week,'highest_score','Highest Score',rec.season_franchise_id,jsonb_build_object('points',rec.points)) on conflict do nothing;
 if found then v_count:=v_count+1; end if;
 -- Biggest Blowout
 select winner_season_franchise_id,abs(home_points-away_points) margin into rec from matchups where league_season_id=v_ls and week=p_week and winner_season_franchise_id is not null order by abs(home_points-away_points) desc,id limit 1;
 if rec.winner_season_franchise_id is not null then insert into weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload) values(v_ls,p_week,'biggest_blowout','Biggest Blowout',rec.winner_season_franchise_id,jsonb_build_object('margin',rec.margin)) on conflict do nothing; if found then v_count:=v_count+1; end if; end if;
 -- Closest Win
 select winner_season_franchise_id,abs(home_points-away_points) margin into rec from matchups where league_season_id=v_ls and week=p_week and winner_season_franchise_id is not null order by abs(home_points-away_points),id limit 1;
 if rec.winner_season_franchise_id is not null then insert into weekly_awards(league_season_id,week,code,title,winner_season_franchise_id,payload) values(v_ls,p_week,'closest_win','Closest Win',rec.winner_season_franchise_id,jsonb_build_object('margin',rec.margin)) on conflict do nothing; if found then v_count:=v_count+1; end if; end if;
 insert into league_feed_events(league_id,season_id,actor_user_id,event_type,body,payload)
 select p_league_id,v_ls,v_user,'weekly_awards','Week '||p_week||' awards are in',jsonb_build_object('week',p_week,'awards',jsonb_agg(jsonb_build_object('code',code,'title',title,'winner',winner_season_franchise_id,'payload',payload))) from weekly_awards where league_season_id=v_ls and week=p_week
 and not exists(select 1 from league_feed_events e where e.league_id=p_league_id and e.season_id=v_ls and e.event_type='weekly_awards' and (e.payload->>'week')::int=p_week)
 group by league_season_id;
 return jsonb_build_object('status','ok','week',p_week,'awards',(select count(*) from weekly_awards where league_season_id=v_ls and week=p_week));
end $$;

grant execute on function public.post_locker_room_message(uuid,text) to authenticated;
grant execute on function public.toggle_feed_reaction(uuid,text) to authenticated;
grant execute on function public.create_trade_proposal(uuid,uuid,uuid[],uuid[],uuid[],uuid[]) to authenticated;
grant execute on function public.post_trade_message(uuid,text) to authenticated;
grant execute on function public.resolve_trade(uuid,text) to authenticated;
grant execute on function public.generate_weekly_awards(uuid,integer) to authenticated;
