-- Recap V2: automatically capture every final matchup, select the strongest
-- league-wide moments, queue one free weekly recap, and publish one editorial
-- League News story. This is intentionally service-only and idempotent.

alter table public.recap_scripts
  alter column matchup_id drop not null,
  add column if not exists recap_kind text not null default 'matchup'
    check (recap_kind in ('matchup', 'league_week')),
  add column if not exists week integer,
  add column if not exists story_score numeric,
  add column if not exists selection_reason text;

create unique index if not exists recap_scripts_one_league_week
  on public.recap_scripts (league_season_id, week)
  where recap_kind = 'league_week';

create table if not exists public.recap_matchup_moments (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  matchup_id uuid not null unique references public.matchups(id) on delete cascade,
  week integer not null,
  story_score numeric not null,
  selection_reason text not null,
  title text not null,
  facts jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recap_matchup_moments_week_score
  on public.recap_matchup_moments (league_season_id, week, story_score desc);

alter table public.recap_matchup_moments enable row level security;
create policy "league members read recap moments"
  on public.recap_matchup_moments for select to authenticated
  using (exists (
    select 1 from public.league_seasons ls
    where ls.id = recap_matchup_moments.league_season_id
      and public.is_league_member(ls.league_id)
  ));

create table if not exists public.league_news_stories (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  league_season_id uuid references public.league_seasons(id) on delete cascade,
  week integer,
  source_type text not null,
  source_key text not null,
  prominence text not null default 'brief' check (prominence in ('headline', 'brief')),
  headline text not null,
  dek text not null,
  href text,
  facts jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  unique (league_id, source_type, source_key)
);

create index if not exists league_news_stories_league_published
  on public.league_news_stories (league_id, published_at desc);

alter table public.league_news_stories enable row level security;
create policy "league members read editorial news"
  on public.league_news_stories for select to authenticated
  using (public.is_league_member(league_id));

grant select on public.recap_matchup_moments, public.league_news_stories to authenticated;
revoke insert, update, delete on public.recap_matchup_moments, public.league_news_stories from public, anon, authenticated;

create or replace function public.publish_finalized_league_week(
  p_league_season_id uuid,
  p_week integer
) returns uuid
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_league_id uuid;
  v_matchup_count integer;
  v_open_count integer;
  v_script_id uuid;
  v_top recap_matchup_moments%rowtype;
  v_moments jsonb;
begin
  select league_id into v_league_id
  from league_seasons where id = p_league_season_id;
  if v_league_id is null then raise exception 'League season not found'; end if;

  select count(*), count(*) filter (where not is_final)
    into v_matchup_count, v_open_count
  from matchups
  where league_season_id = p_league_season_id and week = p_week;
  if v_matchup_count = 0 or v_open_count > 0 then return null; end if;

  insert into recap_matchup_moments(
    league_season_id, matchup_id, week, story_score, selection_reason, title, facts, updated_at
  )
  select
    m.league_season_id,
    m.id,
    m.week,
    greatest(0, 50 - abs(m.home_points - m.away_points))
      + greatest(m.home_points, m.away_points) / 10,
    case
      when abs(m.home_points - m.away_points) <= 3 then 'closest_finish'
      when greatest(m.home_points, m.away_points) >= 150 then 'elite_team_score'
      when abs(m.home_points - m.away_points) >= 40 then 'decisive_result'
      else 'week_result'
    end,
    case
      when m.winner_season_franchise_id is null then hf.name || ' and ' || af.name || ' finish level'
      when m.winner_season_franchise_id = m.home_season_franchise_id then hf.name || ' defeats ' || af.name
      else af.name || ' defeats ' || hf.name
    end,
    jsonb_build_object(
      'home_name', hf.name, 'away_name', af.name,
      'home_points', m.home_points, 'away_points', m.away_points,
      'winner_season_franchise_id', m.winner_season_franchise_id,
      'margin', abs(m.home_points - m.away_points),
      'event_type', m.event_type
    ),
    now()
  from matchups m
  join season_franchises hsf on hsf.id = m.home_season_franchise_id
  join franchises hf on hf.id = hsf.franchise_id
  join season_franchises asf on asf.id = m.away_season_franchise_id
  join franchises af on af.id = asf.franchise_id
  where m.league_season_id = p_league_season_id and m.week = p_week and m.is_final
  on conflict (matchup_id) do update set
    story_score = excluded.story_score,
    selection_reason = excluded.selection_reason,
    title = excluded.title,
    facts = excluded.facts,
    updated_at = now();

  select * into v_top
  from recap_matchup_moments
  where league_season_id = p_league_season_id and week = p_week
  order by story_score desc, matchup_id
  limit 1;

  select jsonb_agg(jsonb_build_object(
    'matchup_id', ranked.matchup_id,
    'story_score', ranked.story_score,
    'selection_reason', ranked.selection_reason,
    'title', ranked.title,
    'facts', ranked.facts
  ) order by ranked.story_score desc, ranked.matchup_id)
  into v_moments
  from (
    select * from recap_matchup_moments
    where league_season_id = p_league_season_id and week = p_week
    order by story_score desc, matchup_id
    limit 5
  ) ranked;

  insert into recap_scripts(
    matchup_id, league_season_id, title, summary, format_version,
    recap_kind, week, story_score, selection_reason, updated_at
  ) values (
    null, p_league_season_id, 'Week ' || p_week || ': League in Review',
    v_top.title || ' led the week at ' || (v_top.facts->>'home_points') || '–' || (v_top.facts->>'away_points') || '.',
    2, 'league_week', p_week, v_top.story_score, v_top.selection_reason, now()
  )
  on conflict (league_season_id, week) where recap_kind = 'league_week'
  do update set title = excluded.title, summary = excluded.summary,
    story_score = excluded.story_score, selection_reason = excluded.selection_reason, updated_at = now()
  returning id into v_script_id;

  delete from recap_scenes where recap_script_id = v_script_id;
  insert into recap_scenes(recap_script_id, scene_index, scene_kind, duration_ms, payload) values
    (v_script_id, 1, 'stadium_open', 4000, jsonb_build_object('week', p_week, 'home', 'BIG EXEC', 'away', 'WEEK ' || p_week, 'event_type', 'league_week')),
    (v_script_id, 2, 'score_reveal', 5000, jsonb_build_object('home', v_top.facts->>'home_name', 'away', v_top.facts->>'away_name', 'home_points', v_top.facts->>'home_points', 'away_points', v_top.facts->>'away_points', 'moments', v_moments)),
    (v_script_id, 3, 'winner_moment', 6500, jsonb_build_object('winner', v_top.title, 'loser', '', 'margin', v_top.facts->>'margin', 'effect', 'exec_celebration')),
    (v_script_id, 4, 'final_card', 4500, jsonb_build_object('title', 'WEEK ' || p_week || ' FINAL', 'matchups', v_matchup_count));

  insert into recap_renders(recap_script_id, aspect_ratio, status)
  values (v_script_id, '16:9', 'pending'), (v_script_id, '9:16', 'pending')
  on conflict(recap_script_id, aspect_ratio) do nothing;

  insert into league_news_stories(
    league_id, league_season_id, week, source_type, source_key,
    prominence, headline, dek, href, facts
  ) values (
    v_league_id, p_league_season_id, p_week, 'weekly_recap',
    p_league_season_id::text || ':' || p_week::text, 'headline',
    'Week ' || p_week || ' is final',
    v_top.title || '. The league-wide recap is being prepared from the strongest verified moments across every matchup.',
    '/recaps/' || v_script_id::text,
    jsonb_build_object('recap_script_id', v_script_id, 'moments', v_moments)
  )
  on conflict (league_id, source_type, source_key) do update set
    headline = excluded.headline, dek = excluded.dek, href = excluded.href,
    facts = excluded.facts, published_at = now();

  return v_script_id;
end
$function$;

revoke execute on function public.publish_finalized_league_week(uuid, integer) from public, anon, authenticated;
grant execute on function public.publish_finalized_league_week(uuid, integer) to service_role;
