-- Chaos Week rule cards (owner decisions of 2026-10-04).
--
-- One rule card is dealt to each Week 13 Chaos Week matchup of a league
-- season. Both managers of that game play under it. Rules for managers:
-- docs/product/CHAOS_WEEK_RULE_CARDS.md.
--
-- INERT UNTIL DEALT. Nothing here changes any result unless
-- deal_chaos_week_cards() has been run for the league season. Only the system
-- path runs it, and only when the application flag CHAOS_CARDS_ENABLED is on
-- (scripts/advance-fantasy-season.mjs). With no row in chaos_card_draws:
--   * recompute_matchup returns, writes and finalizes exactly what
--     20261004010000 does (proved in supabase/tests/chaos_week_rule_cards.sql
--     by running a whole season through both versions and comparing);
--   * set_lineup_slot and process_due_waivers take the same decisions as
--     20261003030000 (their added checks read empty tables).
-- Owner decisions of 2026-10-04 (second round) built here: the AUTOMATIC
-- CAPTAIN (chaos_auto_captain) and the BOUNTY card paying whoever wins
-- (chaos_bounty_grants.grant_kind, chaos_bounty_waiver_order).
-- Owner decisions of 2026-10-04 (third round) built here:
--   * PER-LEAGUE-SEASON OPT-IN: league_seasons.chaos_cards_enabled (default
--     false; this migration opts NO league in). deal_chaos_week_cards refuses a
--     league season that is not opted in, whatever the application flag says.
--   * AUTOMATIC WILD SLOT and AUTOMATIC RAID (chaos_auto_pick), ranked by the
--     same chaos_captain_expected_points as the automatic captain and recorded
--     with source 'automatic' (chaos_lock_auto_selection).
--   * A WILD SLOT pick or a RAIDED player that leaves the roster it was chosen
--     from before its kickoff makes the selection VOID
--     (chaos_card_selections.voided_at); the manager may choose again and
--     otherwise the automatic rule applies.
--   * RAID PENALTY: a higher seed with no eligible bench player is raided for
--     its best-ranked STARTER (the raider adds his points; the higher seed
--     still scores him).
-- Two tables this migration does not create get triggers (section 5b):
-- roster_entries and lineups. They call chaos_sync_selections for the open
-- Chaos Week game of the franchise whose roster or lineup is about to change,
-- and do nothing unless that game holds a CAPTAIN, WILD SLOT or RAID card.
--
-- WHAT A CARD CHANGES. Card effects are applied to the MATCHUP total only.
-- fantasy_player_scores and fantasy_team_scores are never written here.
-- chaos_card_side_score() returns, for one side of a matchup, the base lineup
-- total (the same sum recompute_matchup has always used), one line per
-- adjustment, and the adjusted total. recompute_matchup uses it for
-- event_type 'chaos' matchups that have a revealed card, stores the adjusted
-- totals in matchups.home_points / away_points (so standings use them), and
-- stores the build-up in matchups.context->'chaos_cards':
--   {"version":1,"card_code":"CAPTAIN","kind":"captain",
--    "home":{"base":56.50,"adjustments":[{"effect":"captain","athlete_id":..,
--            "real_team_id":null,"points":20.00}],"total":76.50},
--    "away":{...}, "bounty":{...}}            -- "bounty" only when granted
-- An AUTOMATIC captain line (no captain named) carries, besides the keys above,
--   "automatic":true,"basis":"recent_average_v1","expected":18.33,"games":3,
--   "season_total":201.40,"kickoff":"...","locked_at":"..." (null until locked),
--   "compared":[one entry per eligible starter, in rank order]
-- An AUTOMATIC wild_slot or raid line carries the same keys; a raid line (named
-- or automatic) that took a starter also carries "penalty":true.
--
-- THE CHAOS CLAUSE (postseason tiebreak, 20261004010000) compares each
-- franchise's "Chaos Week score". From this migration on it uses the BASE
-- (unadjusted) lineup total when the Chaos Week matchup has a card, so the
-- tiebreak is not skewed by which card a game drew. Both numbers are recorded
-- in the step. Confirmed by the owner on 2026-10-04.
--
-- RELATION TO EARLIER MIGRATIONS (none of them applied to production on
-- 2026-10-04; production's last applied version is 20260918042128):
--   * 20261004010000_chaos_clause_tiebreak.sql: REQUIRED FIRST (this file
--     calls fantasy_week_close_status and chaos_clause_applies, which it does
--     not repeat) and SUPERSEDED for the two objects repeated here:
--     recompute_matchup(uuid, boolean) and
--     chaos_clause_decision(uuid, uuid, uuid). Both are that migration's text
--     with the marked additions. Do NOT re-apply 20261004010000 (or
--     20261003040000) after this file: each would put back a recompute_matchup
--     without rule cards.
--   * 20261003030000_lineup_week_integrity.sql: REQUIRED FIRST (this file
--     calls lineup_week_is_closed and roster_asset_week_game_has_started) and SUPERSEDED for
--     set_lineup_slot(uuid, integer, lineup_slot, integer, uuid, uuid) and
--     process_due_waivers(uuid), which are that migration's text with the
--     marked additions. Do NOT re-apply it after this file.
-- Not changed: generate_chaos_week, system_advance_fantasy_season, the other
-- generators, claim_free_agent, resolve_trade, award_matchup_achievements.

-- ---------------------------------------------------------------------------
-- 1. Tables. No direct writes for anon or authenticated on any of them.
-- ---------------------------------------------------------------------------
create table if not exists public.chaos_cards (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]+$'),
  kind text not null check (kind in ('captain', 'wild_slot', 'raid', 'bounty', 'twist')),
  name_en text not null check (length(btrim(name_en)) > 0),
  name_es text not null check (length(btrim(name_es)) > 0),
  rules_en text not null check (length(btrim(rules_en)) > 0),
  rules_es text not null check (length(btrim(rules_es)) > 0),
  params jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per league season and week: the seed, generated once.
create table if not exists public.chaos_card_deals (
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  week integer not null check (week between 1 and 18),
  seed text not null check (length(seed) >= 16),
  algorithm text not null,
  deck text[] not null check (cardinality(deck) > 0),
  dealt_at timestamptz not null default now(),
  primary key (league_season_id, week)
);

-- One row per matchup: the card it drew and everything needed to reproduce it.
create table if not exists public.chaos_card_draws (
  matchup_id uuid primary key references public.matchups(id) on delete cascade,
  league_season_id uuid not null,
  week integer not null,
  card_code text not null references public.chaos_cards(code),
  deal_position integer not null check (deal_position >= 1),
  seed text not null,
  algorithm text not null,
  inputs jsonb not null,
  drawn_at timestamptz not null default now(),
  revealed_at timestamptz,
  foreign key (league_season_id, week) references public.chaos_card_deals(league_season_id, week) on delete cascade,
  unique (league_season_id, week, deal_position)
);

-- One row per franchise per matchup, for CAPTAIN / WILD SLOT / RAID.
create table if not exists public.chaos_card_selections (
  id uuid primary key default gen_random_uuid(),
  matchup_id uuid not null references public.chaos_card_draws(matchup_id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id),
  card_code text not null references public.chaos_cards(code),
  athlete_id uuid,
  real_team_id uuid,
  -- The franchise whose roster the asset was on when it was chosen: the
  -- chooser itself for CAPTAIN and WILD SLOT, the opponent for RAID.
  source_season_franchise_id uuid not null references public.season_franchises(id),
  -- 'named': a manager chose it (selected_by is that user). 'automatic': the
  -- AUTOMATIC captain, Wild Slot player or raid, recorded by
  -- chaos_lock_auto_selection once it was due (that player's kickoff; for a
  -- raid, the first kickoff of the week); selected_by is null, locked_at is
  -- that time, and details holds the averages that were compared. details also
  -- carries "penalty": true for a raid that took a starter (named or
  -- automatic), and "replaced" when the row took the place of a void one.
  source text not null default 'named' check (source in ('named', 'automatic')),
  details jsonb,
  -- VOID: the Wild Slot pick or the raided player left the roster it was chosen
  -- from (dropped, traded, removed) before its game kicked off. A void row adds
  -- nothing and locks nothing; it stays until the manager chooses again or the
  -- automatic rule replaces it. voided_at is the time the player left.
  voided_at timestamptz,
  void_reason text check (void_reason in ('dropped')),
  selected_by uuid,
  selected_at timestamptz not null default now(),
  -- Set when the choice can no longer be changed: at once for RAID, and by
  -- recompute_matchup once the chosen player's game has kicked off. The RPCs
  -- decide locks from the schedule, not from this column; it is a record.
  locked_at timestamptz,
  check ((athlete_id is not null)::int + (real_team_id is not null)::int = 1),
  check ((source = 'named' and selected_by is not null) or (source = 'automatic' and selected_by is null and locked_at is not null)),
  check ((voided_at is null) = (void_reason is null)),
  unique (matchup_id, season_franchise_id)
);

-- One row per franchise per matchup: the time up to which the automatic rule
-- has been evaluated on the roster and lineup as they really stood. The
-- kickoff walk of chaos_auto_pick never looks at a kickoff at or before it, so
-- changing a lineup or roster AFTER a game has been played can never make an
-- automatic pick land on that game (no hindsight). Written only by
-- chaos_lock_auto_selection.
create table if not exists public.chaos_card_auto_marks (
  matchup_id uuid not null references public.chaos_card_draws(matchup_id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id),
  evaluated_through timestamptz not null,
  primary key (matchup_id, season_franchise_id)
);

-- PER-LEAGUE-SEASON OPT-IN (owner decision 2026-10-04). Rule cards are dealt
-- only to a league season whose flag is true. Default false, and nothing in
-- this migration sets it: an operator opts a league season in by hand
-- (docs/product/CHAOS_WEEK_RULE_CARDS.md, section 5). authenticated and anon
-- hold no INSERT or UPDATE privilege on league_seasons (production, read
-- 2026-10-04), so a manager cannot set it.
alter table public.league_seasons add column if not exists chaos_cards_enabled boolean not null default false;

create table if not exists public.chaos_bounty_grants (
  id uuid primary key default gen_random_uuid(),
  league_season_id uuid not null references public.league_seasons(id) on delete cascade,
  season_franchise_id uuid not null references public.season_franchises(id),
  matchup_id uuid not null unique references public.matchups(id) on delete cascade,
  source_week integer not null,
  -- 'first': the lower seed won; it goes to the front of the waiver order.
  -- 'up_three': the higher seed won; it moves up three places.
  grant_kind text not null check (grant_kind in ('first', 'up_three')),
  effective_from timestamptz not null,
  effective_until timestamptz not null,
  created_at timestamptz not null default now(),
  check (effective_until > effective_from)
);
create index if not exists chaos_bounty_grants_window_idx on public.chaos_bounty_grants (league_season_id, season_franchise_id, effective_until);
create index if not exists chaos_card_selections_source_idx on public.chaos_card_selections (source_season_franchise_id);

alter table public.chaos_cards enable row level security;
alter table public.chaos_card_deals enable row level security;
alter table public.chaos_card_draws enable row level security;
alter table public.chaos_card_selections enable row level security;
alter table public.chaos_bounty_grants enable row level security;
alter table public.chaos_card_auto_marks enable row level security;

revoke all on table public.chaos_cards, public.chaos_card_deals, public.chaos_card_draws, public.chaos_card_selections, public.chaos_bounty_grants, public.chaos_card_auto_marks from public, anon, authenticated;
grant select on table public.chaos_cards, public.chaos_card_deals, public.chaos_card_draws, public.chaos_card_selections, public.chaos_bounty_grants, public.chaos_card_auto_marks to authenticated;
grant select, insert, update, delete on table public.chaos_cards, public.chaos_card_deals, public.chaos_card_draws, public.chaos_card_selections, public.chaos_bounty_grants, public.chaos_card_auto_marks to service_role;

-- The catalog is reference data. Everything else is visible to members of
-- the league, and draws/selections only once the card is revealed.
drop policy if exists chaos_cards_authenticated_read on public.chaos_cards;
create policy chaos_cards_authenticated_read on public.chaos_cards for select to authenticated using (true);

drop policy if exists chaos_card_draws_member_read on public.chaos_card_draws;
create policy chaos_card_draws_member_read on public.chaos_card_draws for select to authenticated
  using (revealed_at is not null and revealed_at <= now() and exists (
    select 1 from public.league_seasons ls where ls.id = chaos_card_draws.league_season_id and public.is_league_member(ls.league_id)));

drop policy if exists chaos_card_deals_member_read on public.chaos_card_deals;
create policy chaos_card_deals_member_read on public.chaos_card_deals for select to authenticated
  using (exists (
    select 1 from public.chaos_card_draws d join public.league_seasons ls on ls.id = d.league_season_id
    where d.league_season_id = chaos_card_deals.league_season_id and d.week = chaos_card_deals.week
      and d.revealed_at is not null and d.revealed_at <= now() and public.is_league_member(ls.league_id)));

drop policy if exists chaos_card_selections_member_read on public.chaos_card_selections;
create policy chaos_card_selections_member_read on public.chaos_card_selections for select to authenticated
  using (exists (
    select 1 from public.chaos_card_draws d join public.league_seasons ls on ls.id = d.league_season_id
    where d.matchup_id = chaos_card_selections.matchup_id
      and d.revealed_at is not null and d.revealed_at <= now() and public.is_league_member(ls.league_id)));

drop policy if exists chaos_card_auto_marks_member_read on public.chaos_card_auto_marks;
create policy chaos_card_auto_marks_member_read on public.chaos_card_auto_marks for select to authenticated
  using (exists (
    select 1 from public.chaos_card_draws d join public.league_seasons ls on ls.id = d.league_season_id
    where d.matchup_id = chaos_card_auto_marks.matchup_id
      and d.revealed_at is not null and d.revealed_at <= now() and public.is_league_member(ls.league_id)));

drop policy if exists chaos_bounty_grants_member_read on public.chaos_bounty_grants;
create policy chaos_bounty_grants_member_read on public.chaos_bounty_grants for select to authenticated
  using (exists (
    select 1 from public.league_seasons ls where ls.id = chaos_bounty_grants.league_season_id and public.is_league_member(ls.league_id)));

-- ---------------------------------------------------------------------------
-- 2. The deck. Twists only use what fantasy_player_scores.breakdown and
--    fantasy_team_scores really record (production, read 2026-10-04):
--    player breakdown = point subtotals kicking, passing, rushing, receiving,
--    two_point, fumbles_lost, special_teams_td; D/ST has one points value.
-- ---------------------------------------------------------------------------
insert into public.chaos_cards (code, kind, name_en, name_es, rules_en, rules_es, params) values
  ('CAPTAIN', 'captain', 'Captain', 'Capitán',
   'Each manager names one Week 13 starter as captain before that player''s game kicks off. The captain''s fantasy points count double in this matchup. If no captain is named, the starter with the highest recent scoring average becomes captain automatically and is locked in at that player''s kickoff.',
   'Cada mánager nombra capitán a uno de sus titulares de la Semana 13 antes de que empiece el partido de ese jugador. Los puntos fantasy del capitán cuentan doble en este enfrentamiento. Si no se nombra capitán, el titular con el mejor promedio reciente de puntos pasa a ser capitán automáticamente y queda fijado cuando empieza el partido de ese jugador.',
   '{"multiplier":2}'),
  ('WILD_SLOT', 'wild_slot', 'Wild Slot', 'Puesto Comodín',
   'Each manager may name one extra player from their active roster, at any position, who is not already starting. That player''s Week 13 points are added to the team total. Choose before that player''s game kicks off. If no player is named, the non-starting player with the highest recent scoring average is used automatically and is locked in at that player''s kickoff.',
   'Cada mánager puede nombrar a un jugador adicional de su plantilla activa, de cualquier posición, que no sea ya titular. Los puntos de ese jugador en la Semana 13 se suman al total del equipo. Elige antes de que empiece el partido de ese jugador. Si no se nombra a nadie, se usa automáticamente al jugador no titular con el mejor promedio reciente de puntos, y queda fijado cuando empieza su partido.',
   '{}'),
  ('RAID', 'raid', 'Raid', 'Asalto',
   'The lower seed picks one player from the higher seed''s bench before the first Week 13 kickoff. That player''s Week 13 points are added to the lower seed''s total. The player stays on the higher seed''s roster but cannot start for them in Week 13. If no raid is made by the deadline, the bench player with the highest recent scoring average is raided automatically. If the higher seed has no eligible bench player, the raid takes its best-ranked starter instead.',
   'El equipo con peor clasificación elige a un jugador de la banca del equipo mejor clasificado antes del primer partido de la Semana 13. Los puntos de ese jugador en la Semana 13 se suman al total del equipo con peor clasificación. El jugador sigue en la plantilla del rival, pero no puede ser titular con él en la Semana 13. Si no se hace ningún asalto antes del límite, se asalta automáticamente al jugador de la banca con el mejor promedio reciente de puntos. Si el equipo mejor clasificado no tiene ningún jugador elegible en la banca, el asalto se lleva a su titular mejor clasificado.',
   '{}'),
  ('BOUNTY', 'bounty', 'Bounty', 'Recompensa',
   'Whoever wins this matchup moves up the waiver order for the following fantasy week. If the lower seed wins, it goes to the front. If the higher seed wins, it moves up three places. A tie changes nothing.',
   'Quien gane este enfrentamiento sube en el orden de waivers durante la siguiente semana fantasy. Si gana el equipo con peor clasificación, pasa al frente. Si gana el equipo mejor clasificado, sube tres puestos. Un empate no cambia nada.',
   '{}'),
  ('TWIST_TE_DOUBLE', 'twist', 'Tight End Takeover', 'Dominio del Ala Cerrada',
   'Every starting tight end scores double for both teams.',
   'Cada ala cerrada titular puntúa doble para ambos equipos.',
   '{"scope":"position","position":"TE","multiplier":2}'),
  ('TWIST_K_TRIPLE', 'twist', 'Golden Boot', 'Bota de Oro',
   'Every starting kicker scores triple for both teams.',
   'Cada pateador titular puntúa triple para ambos equipos.',
   '{"scope":"position","position":"K","multiplier":3}'),
  ('TWIST_DST_DOUBLE', 'twist', 'Iron Curtain', 'Cortina de Hierro',
   'Each starting defense and special teams unit scores double for both teams. Negative scores are doubled too.',
   'Cada defensa y equipos especiales titular puntúa doble para ambos equipos. Las puntuaciones negativas también se duplican.',
   '{"scope":"dst","multiplier":2}'),
  ('TWIST_RUSH_DOUBLE', 'twist', 'Ground Control', 'Control Terrestre',
   'All rushing points scored by starters count double for both teams.',
   'Todos los puntos por carrera de los titulares cuentan doble para ambos equipos.',
   '{"scope":"component","component":"rushing","multiplier":2}'),
  ('TWIST_PASS_DOUBLE', 'twist', 'Air Show', 'Espectáculo Aéreo',
   'All passing points scored by starters count double for both teams. Interceptions are part of passing points, so they cost double too.',
   'Todos los puntos por pase de los titulares cuentan doble para ambos equipos. Las intercepciones forman parte de los puntos por pase, así que también cuestan el doble.',
   '{"scope":"component","component":"passing","multiplier":2}'),
  ('TWIST_FUMBLE_TRIPLE', 'twist', 'Slippery Hands', 'Manos Resbalosas',
   'Every fumble lost by a starter costs triple for both teams.',
   'Cada balón suelto perdido por un titular cuesta el triple para ambos equipos.',
   '{"scope":"component","component":"fumbles_lost","multiplier":3}')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Helpers (read only).
-- ---------------------------------------------------------------------------
-- Has this asset's real game of the week kicked off? By asset rather than by
-- roster entry, because a raid target is on another roster and a selected
-- player may since have been dropped. Same rule as
-- roster_asset_week_game_has_started: canceled and postponed games never lock.
create or replace function public.chaos_asset_game_started(
  p_league_season_id uuid, p_week integer, p_athlete_id uuid, p_real_team_id uuid
) returns boolean
language sql stable set search_path = public
as $function$
  select coalesce(exists (
    select 1
    from public.league_seasons ls
    join public.real_games rg on rg.competition_season_id = ls.competition_season_id and rg.week = p_week
    where ls.id = p_league_season_id
      and rg.starts_at <= now()
      and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
      and coalesce(p_real_team_id, (select a.real_team_id from public.athletes a where a.id = p_athlete_id)) in (rg.home_team_id, rg.away_team_id)
  ), false);
$function$;

-- First kickoff of the week that is still going to be played.
create or replace function public.chaos_week_first_kickoff(p_league_season_id uuid, p_week integer)
returns timestamptz
language sql stable set search_path = public
as $function$
  select min(rg.starts_at)
  from public.league_seasons ls
  join public.real_games rg on rg.competition_season_id = ls.competition_season_id and rg.week = p_week
  where ls.id = p_league_season_id and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed');
$function$;

-- The lower seed of a Chaos Week matchup (the larger seed number recorded by
-- generate_chaos_week). Null when the seeds are missing or equal.
create or replace function public.chaos_lower_seed(p_matchup_id uuid)
returns uuid
language sql stable set search_path = public
as $function$
  select case
    when nullif(m.context->>'home_seed', '')::int > nullif(m.context->>'away_seed', '')::int then m.home_season_franchise_id
    when nullif(m.context->>'away_seed', '')::int > nullif(m.context->>'home_seed', '')::int then m.away_season_franchise_id
  end
  from public.matchups m where m.id = p_matchup_id;
$function$;

-- The deal order: the deck sorted by sha256(seed || ':' || code). Pure, so
-- anyone holding the stored seed and deck can reproduce it.
create or replace function public.chaos_card_deal_order(p_seed text, p_deck text[])
returns text[]
language sql immutable set search_path = public
as $function$
  select array_agg(code order by encode(sha256(convert_to(p_seed || ':' || code, 'UTF8')), 'hex'), code)
  from unnest(p_deck) as t(code);
$function$;

-- AUTOMATIC CAPTAIN, step 1: the number a starter is ranked by.
--
-- THIS IS THE ONE FUNCTION TO REPLACE when the product has real weekly
-- projections (on 2026-10-04 it has none: the only projection column in
-- production is the season-long fantasy_player_market_values.projected_points,
-- with no week and no rows). Keep the return shape: "expected" is the value
-- compared (higher is better, null ranks last), "season_total" the first
-- tie-break, "basis" names the method and is stored with every result.
--
-- recent_average_v1: the average fantasy points per played game in this league
-- season over the three most recent weeks BEFORE p_week in which the player
-- (or D/ST) has a score; fewer when fewer exist; null when there is none.
-- Nothing from p_week itself is read, so the result cannot use hindsight.
create or replace function public.chaos_captain_expected_points(
  p_league_season_id uuid, p_week integer, p_athlete_id uuid, p_real_team_id uuid
) returns jsonb
language sql stable set search_path = public
as $function$
  with weekly as (
    select fps.week, sum(fps.points) as points
    from public.fantasy_player_scores fps
    where p_athlete_id is not null and fps.league_season_id = p_league_season_id and fps.athlete_id = p_athlete_id and fps.week < p_week
    group by fps.week
    union all
    select fts.week, sum(fts.points) as points
    from public.fantasy_team_scores fts
    where p_athlete_id is null and p_real_team_id is not null and fts.league_season_id = p_league_season_id and fts.real_team_id = p_real_team_id and fts.week < p_week
    group by fts.week
  ), recent as (
    select week, points from weekly order by week desc limit 3
  )
  select jsonb_build_object(
    'basis', 'recent_average_v1',
    'expected', (select round(avg(points), 2) from recent),
    'games', (select count(*) from recent),
    'weeks', (select coalesce(jsonb_agg(week order by week), '[]'::jsonb) from recent),
    'season_total', (select coalesce(sum(points), 0) from weekly));
$function$;

-- AUTOMATIC CAPTAIN, step 2: the starter who is captain when none is named.
-- It reads the lineup, the schedule, earlier scores and the evaluation mark
-- (and, for the Wild Slot and the raid further down, the active roster); never
-- the selections table and never a Week 13 score.
--
-- ELIGIBLE: a starter of the franchise's lineup for the matchup's week whose
-- team has a game that week that is not postponed or canceled. Its KICKOFF is
-- the earliest such game. A starter with no playable game is skipped.
-- RANK: expected (highest first, none last), then season_total (highest
-- first), then the asset id as text (ascending). Kickers and D/ST are eligible.
--
-- LOCKED (locked_at is the kickoff): the captain locks at kickoff. Kickoffs
-- are taken in time order; at each one, the best-ranked eligible starter among
-- those who had not kicked off before it is the candidate, and if the
-- candidate is in that kickoff the captain is that starter, for the week. In
-- one sentence: the earliest-kicking-off eligible starter who has kicked off
-- and whom no eligible starter kicking off at the same time or later outranks.
-- This is evaluated on the lineup as it stands when the function runs; a
-- starter who has kicked off cannot leave the lineup, so every started starter
-- is still there.
-- PREVIEW (locked_at is null): when no lock is due yet, the best-ranked
-- eligible starter who has not kicked off. It follows every lineup change.
-- Returns null when there is nobody to choose, and for a caller who cannot
-- read the league (it runs with the caller's rights).
--
-- ONE FUNCTION FOR ALL THREE AUTOMATIC SELECTIONS (owner decision 2026-10-04:
-- the automatic Wild Slot and the automatic raid reuse the automatic captain's
-- pattern and its ranking function). p_kind decides WHO IS ELIGIBLE; the
-- ranking, the tie-breaks and the "game will be played" test are the same.
--
--   'captain'   the franchise's own STARTERS (as above).
--   'wild_slot' the franchise's own active-roster players who are NOT in its
--               starting lineup. Same kickoff-ordered lock as the captain. No
--               eligible non-starter: null, and there is no Wild Slot bonus.
--   'raid'      p_season_franchise_id is the raider and must be the lower seed
--               (null otherwise). Eligible: the HIGHER seed's active-roster
--               players who are not in its starting lineup (its bench).
--               PENALTY: when that bench holds no eligible player, the higher
--               seed's eligible STARTERS are ranked instead and the result
--               carries "penalty": true. There is no kickoff walk: the pick is
--               the best-ranked player of the bench (or starters) as it stands,
--               due ("locked_at" = "deadline") once the first kickoff of the
--               week has passed, a preview before it. A player who has already
--               kicked off is still eligible for an automatic raid: the ranking
--               reads nothing from the week itself, and excluding him would let
--               the higher seed dodge a raid by dropping the raided player late.
--
-- NO HINDSIGHT. The kickoff walk ('captain', 'wild_slot') ignores every
-- kickoff at or before chaos_card_auto_marks.evaluated_through. That mark is
-- moved to now() each time chaos_lock_auto_selection has evaluated the rule,
-- which happens before every lineup or roster change of the franchise (section
-- 5b). So a kickoff that passed with nothing to lock stays that way: benching,
-- dropping or clearing a player AFTER an earlier game has been played cannot
-- hand that earlier game's player the automatic pick.
create or replace function public.chaos_auto_pick(p_matchup_id uuid, p_season_franchise_id uuid, p_kind text)
returns jsonb
language sql stable set search_path = public
as $function$
  with m as (
    select mm.id, mm.league_season_id, mm.week, ls.competition_season_id,
      -- Whose roster and lineup are searched: the opponent's for a raid.
      case when p_kind = 'raid' then case when p_season_franchise_id = mm.home_season_franchise_id then mm.away_season_franchise_id else mm.home_season_franchise_id end else p_season_franchise_id end as pool_sf,
      (select k.evaluated_through from public.chaos_card_auto_marks k where k.matchup_id = mm.id and k.season_franchise_id = p_season_franchise_id) as since,
      (select min(rg.starts_at) from public.real_games rg
        where rg.competition_season_id = ls.competition_season_id and rg.week = mm.week and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')) as first_kickoff
    from public.matchups mm join public.league_seasons ls on ls.id = mm.league_season_id
    where mm.id = p_matchup_id and p_season_franchise_id in (mm.home_season_franchise_id, mm.away_season_franchise_id)
      and p_kind in ('captain', 'wild_slot', 'raid')
      -- Only the lower seed raids (the rule of chaos_lower_seed, repeated here because this function runs with the caller's rights).
      and (p_kind <> 'raid' or p_season_franchise_id = case
        when nullif(mm.context->>'home_seed', '')::int > nullif(mm.context->>'away_seed', '')::int then mm.home_season_franchise_id
        when nullif(mm.context->>'away_seed', '')::int > nullif(mm.context->>'home_seed', '')::int then mm.away_season_franchise_id end)
  ), pool as (
    -- Starters, read from the lineup exactly as recompute_matchup reads it.
    select l.athlete_id, l.real_team_id, true as starter
    from m join public.lineups l on l.season_franchise_id = m.pool_sf and l.week = m.week and l.slot <> 'BENCH'
    where l.athlete_id is not null or l.real_team_id is not null
    union all
    -- Everyone else on the active roster (never needed for a captain).
    select re.athlete_id, case when re.athlete_id is null then re.real_team_id end, false
    from m join public.roster_entries re on re.season_franchise_id = m.pool_sf and re.dropped_at is null
    where p_kind <> 'captain' and (re.athlete_id is not null or re.real_team_id is not null)
      and not exists (select 1 from public.lineups l where l.season_franchise_id = m.pool_sf and l.week = m.week and l.slot <> 'BENCH'
        and ((re.athlete_id is not null and l.athlete_id = re.athlete_id) or (re.athlete_id is null and l.real_team_id = re.real_team_id)))
  ), eligible as (
    select p.athlete_id, p.real_team_id, p.starter, g.kickoff, public.chaos_captain_expected_points(m.league_season_id, m.week, p.athlete_id, p.real_team_id) as e
    from m cross join pool p
    left join public.athletes a on a.id = p.athlete_id
    cross join lateral (select min(rg.starts_at) as kickoff from public.real_games rg
      where rg.competition_season_id = m.competition_season_id and rg.week = m.week
        and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
        and coalesce(p.real_team_id, a.real_team_id) in (rg.home_team_id, rg.away_team_id)) g
    where g.kickoff is not null
  ), scope as (
    select x.* from eligible x
    where case p_kind when 'captain' then x.starter when 'wild_slot' then not x.starter
      else x.starter = not exists (select 1 from eligible b where not b.starter) end
  ), ranked as (
    select x.*, row_number() over (order by (x.e->>'expected')::numeric desc nulls last, (x.e->>'season_total')::numeric desc, coalesce(x.athlete_id, x.real_team_id)::text asc) as rank
    from scope x
  ), alive as (
    select r.* from ranked r cross join m where p_kind = 'raid' or m.since is null or r.kickoff > m.since
  ), due as (
    select r.*, case when p_kind = 'raid' then m.first_kickoff else r.kickoff end as lock_time
    from alive r cross join m
    where case when p_kind = 'raid' then r.rank = 1 and m.first_kickoff <= now()
      else r.kickoff <= now() and not exists (select 1 from alive o where o.kickoff >= r.kickoff and o.rank < r.rank) end
    order by r.kickoff, r.rank limit 1
  ), preview as (
    select r.*, null::timestamptz as lock_time from alive r
    where not exists (select 1 from due) and case when p_kind = 'raid' then r.rank = 1 else r.kickoff > now() end
    order by r.rank limit 1
  ), pick as (
    select d.* from due d union all select p.* from preview p
  )
  select jsonb_build_object('athlete_id', k.athlete_id, 'real_team_id', k.real_team_id) || k.e
    || jsonb_build_object('kickoff', k.kickoff, 'locked_at', k.lock_time,
      'compared', (select jsonb_agg(jsonb_build_object('athlete_id', x.athlete_id, 'real_team_id', x.real_team_id, 'expected', x.e->'expected', 'games', x.e->'games', 'season_total', x.e->'season_total', 'kickoff', x.kickoff) order by x.rank) from ranked x))
    || case when p_kind = 'raid' then jsonb_build_object('penalty', k.starter, 'deadline', (select first_kickoff from m)) else '{}'::jsonb end
  from pick k;
$function$;

-- The automatic captain: chaos_auto_pick for the franchise's starters. Kept
-- under its own name because the pages and the tests call it.
create or replace function public.chaos_auto_captain(p_matchup_id uuid, p_season_franchise_id uuid)
returns jsonb
language sql stable set search_path = public
as $function$
  select public.chaos_auto_pick(p_matchup_id, p_season_franchise_id, 'captain');
$function$;

-- One side of a matchup: base lineup total, adjustment lines, adjusted total.
-- The base is the sum recompute_matchup has always used. With no revealed
-- card (or a matchup that is not a Chaos Week game) card_code is null, there
-- are no lines and total = base.
create or replace function public.chaos_card_side_score(p_matchup_id uuid, p_season_franchise_id uuid)
returns jsonb
language plpgsql stable set search_path = public
as $function$
declare
  v_m matchups%rowtype;
  v_base numeric := 0;
  v_code text; v_kind text; v_params jsonb;
  v_sel chaos_card_selections%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_points numeric;
  v_mult numeric;
  v_is_starter boolean;
  v_auto jsonb;
begin
  select * into v_m from matchups where id = p_matchup_id;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  if p_season_franchise_id not in (v_m.home_season_franchise_id, v_m.away_season_franchise_id) then raise exception 'Franchise is not in this matchup'; end if;

  select coalesce(sum(x.points),0) into v_base from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=p_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=p_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;

  if v_m.event_type = 'chaos' then
    select d.card_code, c.kind, c.params into v_code, v_kind, v_params
    from chaos_card_draws d join chaos_cards c on c.code = d.card_code
    where d.matchup_id = p_matchup_id and d.revealed_at is not null and d.revealed_at <= now();
  end if;
  if v_code is null then
    return jsonb_build_object('card_code', null, 'kind', null, 'base', v_base, 'adjustments', v_lines, 'total', v_base);
  end if;

  if v_kind in ('captain', 'wild_slot', 'raid') then
    select * into v_sel from chaos_card_selections s
    where s.matchup_id = p_matchup_id and s.season_franchise_id = p_season_franchise_id and s.card_code = v_code;
    if v_sel.id is not null then
      v_is_starter := exists (
        select 1 from lineups l where l.season_franchise_id = p_season_franchise_id and l.week = v_m.week and l.slot <> 'BENCH'
          and ((v_sel.athlete_id is not null and l.athlete_id = v_sel.athlete_id) or (v_sel.real_team_id is not null and l.real_team_id = v_sel.real_team_id)));
      if v_sel.athlete_id is not null then
        select coalesce(sum(fps.points),0) into v_points from fantasy_player_scores fps where fps.league_season_id=v_m.league_season_id and fps.athlete_id=v_sel.athlete_id and fps.week=v_m.week;
      else
        select coalesce(sum(fts.points),0) into v_points from fantasy_team_scores fts where fts.league_season_id=v_m.league_season_id and fts.real_team_id=v_sel.real_team_id and fts.week=v_m.week;
      end if;
      -- CAPTAIN: only while the captain is in the starting lineup. The others:
      -- only while the player is NOT one of this franchise's own starters
      -- (set_lineup_slot refuses that; this keeps a point from counting twice).
      if v_kind = 'captain' and v_is_starter then
        v_points := round(v_points * (coalesce((v_params->>'multiplier')::numeric, 2) - 1), 2);
        -- A recorded AUTOMATIC captain is read back from its row, never recomputed, so a later lineup change cannot move it.
        v_lines := v_lines || (jsonb_build_object('effect', 'captain', 'athlete_id', v_sel.athlete_id, 'real_team_id', v_sel.real_team_id, 'points', v_points)
          || case when v_sel.source = 'automatic' then jsonb_build_object('automatic', true, 'locked_at', v_sel.locked_at) || coalesce(v_sel.details, '{}'::jsonb) else '{}'::jsonb end);
      elsif v_kind in ('wild_slot', 'raid') and not v_is_starter and v_sel.voided_at is null then
        -- A VOID row (its player left the roster before kickoff) adds nothing. An AUTOMATIC row is read back from its record, like an automatic captain; a PENALTY raid (named or automatic) says so.
        v_lines := v_lines || (jsonb_build_object('effect', v_kind, 'athlete_id', v_sel.athlete_id, 'real_team_id', v_sel.real_team_id, 'points', round(v_points, 2))
          || case when v_sel.source = 'automatic' then jsonb_build_object('automatic', true, 'locked_at', v_sel.locked_at) || coalesce(v_sel.details, '{}'::jsonb)
                  when coalesce((v_sel.details->>'penalty')::boolean, false) then jsonb_build_object('penalty', true) else '{}'::jsonb end);
      end if;
    end if;
    -- AUTOMATIC SELECTION, not recorded yet. CAPTAIN: no captain row, or the
    -- recorded one is no longer a starter (that choice has stopped counting).
    -- WILD SLOT and RAID: no row, or a void one. This is the preview, or a pick
    -- that is due and that recompute_matchup records before it calls this
    -- function. A selection that counts always wins. A finished WILD SLOT or
    -- RAID game is read from its rows only: its roster can change afterwards.
    if (v_kind = 'captain' and not (v_sel.id is not null and coalesce(v_is_starter, false)))
       or (v_kind in ('wild_slot', 'raid') and not v_m.is_final and not (v_sel.id is not null and v_sel.voided_at is null)) then
      v_auto := chaos_auto_pick(p_matchup_id, p_season_franchise_id, v_kind);
      if v_auto is not null then
        if v_auto->>'athlete_id' is not null then
          select coalesce(sum(fps.points),0) into v_points from fantasy_player_scores fps where fps.league_season_id=v_m.league_season_id and fps.athlete_id=(v_auto->>'athlete_id')::uuid and fps.week=v_m.week;
        else
          select coalesce(sum(fts.points),0) into v_points from fantasy_team_scores fts where fts.league_season_id=v_m.league_season_id and fts.real_team_id=(v_auto->>'real_team_id')::uuid and fts.week=v_m.week;
        end if;
        if v_kind = 'captain' then v_points := v_points * (coalesce((v_params->>'multiplier')::numeric, 2) - 1); end if;
        v_points := round(v_points, 2);
        v_lines := v_lines || (jsonb_build_object('effect', v_kind, 'athlete_id', v_auto->'athlete_id', 'real_team_id', v_auto->'real_team_id', 'points', v_points, 'automatic', true) || (v_auto - 'athlete_id' - 'real_team_id' - 'weeks'));
      end if;
    end if;
  elsif v_kind = 'twist' then
    v_mult := coalesce((v_params->>'multiplier')::numeric, 1) - 1;
    if v_params->>'scope' = 'position' then
      select coalesce(jsonb_agg(jsonb_build_object('effect', 'twist', 'athlete_id', x.athlete_id, 'real_team_id', null, 'points', x.points) order by x.slot, x.slot_index, x.athlete_id), '[]'::jsonb) into v_lines
      from (
        select l.athlete_id, l.slot, l.slot_index, round(sum(fps.points) * v_mult, 2) as points
        from lineups l join athletes a on a.id = l.athlete_id
        join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week
        where l.season_franchise_id=p_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH' and a.position = v_params->>'position'
        group by l.athlete_id, l.slot, l.slot_index
      ) x where x.points <> 0;
    elsif v_params->>'scope' = 'dst' then
      select coalesce(jsonb_agg(jsonb_build_object('effect', 'twist', 'athlete_id', null, 'real_team_id', x.real_team_id, 'points', x.points) order by x.real_team_id), '[]'::jsonb) into v_lines
      from (
        select l.real_team_id, round(sum(fts.points) * v_mult, 2) as points
        from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week
        where l.season_franchise_id=p_season_franchise_id and l.week=v_m.week and l.slot='DST'
        group by l.real_team_id
      ) x where x.points <> 0;
    elsif v_params->>'scope' = 'component' then
      select coalesce(jsonb_agg(jsonb_build_object('effect', 'twist', 'athlete_id', x.athlete_id, 'real_team_id', null, 'points', x.points) order by x.slot, x.slot_index, x.athlete_id), '[]'::jsonb) into v_lines
      from (
        select l.athlete_id, l.slot, l.slot_index, round(sum(coalesce(nullif(fps.breakdown->>(v_params->>'component'), '')::numeric, 0)) * v_mult, 2) as points
        from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week
        where l.season_franchise_id=p_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
        group by l.athlete_id, l.slot, l.slot_index
      ) x where x.points <> 0;
    end if;
  end if;

  return jsonb_build_object('card_code', v_code, 'kind', v_kind, 'base', v_base, 'adjustments', v_lines,
    'total', v_base + coalesce((select sum((line->>'points')::numeric) from jsonb_array_elements(v_lines) line), 0));
end
$function$;

revoke execute on function public.chaos_asset_game_started(uuid, integer, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.chaos_week_first_kickoff(uuid, integer) from public, anon, authenticated;
revoke execute on function public.chaos_lower_seed(uuid) from public, anon, authenticated;
revoke execute on function public.chaos_card_deal_order(text, text[]) from public, anon, authenticated;
revoke execute on function public.chaos_card_side_score(uuid, uuid) from public, anon, authenticated;
-- The ranking functions (expected points, the automatic pick, and its captain
-- wrapper) run with the caller's rights and only read tables league members
-- can already read, so signed-in managers may call them (the lineup and
-- matchup pages show which captain, Wild Slot player or raid the system would
-- choose).
revoke execute on function public.chaos_captain_expected_points(uuid, integer, uuid, uuid) from public, anon;
revoke execute on function public.chaos_auto_captain(uuid, uuid) from public, anon;
revoke execute on function public.chaos_auto_pick(uuid, uuid, text) from public, anon;
grant execute on function public.chaos_captain_expected_points(uuid, integer, uuid, uuid) to authenticated, service_role;
grant execute on function public.chaos_auto_captain(uuid, uuid) to authenticated, service_role;
grant execute on function public.chaos_auto_pick(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.chaos_asset_game_started(uuid, integer, uuid, uuid) to service_role;
grant execute on function public.chaos_week_first_kickoff(uuid, integer) to service_role;
grant execute on function public.chaos_lower_seed(uuid) to service_role;
grant execute on function public.chaos_card_deal_order(text, text[]) to service_role;
grant execute on function public.chaos_card_side_score(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The deal. System use only (service role, no signed-in user). Idempotent.
--    Refused unless league_seasons.chaos_cards_enabled is true.
-- ---------------------------------------------------------------------------
create or replace function public.deal_chaos_week_cards(p_league_season_id uuid, p_week integer default 13)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_league uuid;
  v_opted_in boolean;
  v_deal chaos_card_deals%rowtype;
  v_deck text[];
  v_order text[];
  v_seed text;
  v_algorithm constant text := 'big-exec-chaos-deal-v1: deck = active card codes sorted; order = deck sorted by sha256(seed || '':'' || code) hex, then code; matchups sorted by home seed, then id; matchup n takes order[((n-1) mod deck size)+1]';
  v_matchups uuid[];
  v_kickoff timestamptz;
  v_cards jsonb;
  i integer;
begin
  if auth.uid() is not null then raise exception 'System use only'; end if;
  select league_id, chaos_cards_enabled into v_league, v_opted_in from league_seasons where id = p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;
  -- PER-LEAGUE-SEASON OPT-IN: required in addition to the application flag.
  if v_opted_in is not true then raise exception 'Rule cards are not enabled for this league season'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chaos-deal:' || p_league_season_id::text || ':' || p_week::text, 0));

  select * into v_deal from chaos_card_deals where league_season_id = p_league_season_id and week = p_week;
  if v_deal.league_season_id is null then
    select array_agg(m.id order by nullif(m.context->>'home_seed', '')::int, m.id) into v_matchups
    from matchups m where m.league_season_id = p_league_season_id and m.week = p_week and m.event_type = 'chaos';
    if coalesce(cardinality(v_matchups), 0) = 0 then raise exception 'No Chaos Week matchups in week %', p_week; end if;
    if exists (select 1 from matchups m where m.id = any(v_matchups) and (m.is_final or chaos_lower_seed(m.id) is null)) then
      raise exception 'Chaos Week matchups must be open and carry both seeds before cards are dealt';
    end if;
    v_kickoff := chaos_week_first_kickoff(p_league_season_id, p_week);
    if v_kickoff is not null and v_kickoff <= now() then raise exception 'Week % has already kicked off; rule cards can no longer be dealt', p_week; end if;

    select array_agg(code order by code) into v_deck from chaos_cards where active;
    if coalesce(cardinality(v_deck), 0) = 0 then raise exception 'The rule card deck is empty'; end if;
    v_seed := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    v_order := chaos_card_deal_order(v_seed, v_deck);

    insert into chaos_card_deals(league_season_id, week, seed, algorithm, deck) values (p_league_season_id, p_week, v_seed, v_algorithm, v_deck);
    for i in 1..cardinality(v_matchups) loop
      insert into chaos_card_draws(matchup_id, league_season_id, week, card_code, deal_position, seed, algorithm, inputs, revealed_at)
      values (v_matchups[i], p_league_season_id, p_week, v_order[((i - 1) % cardinality(v_order)) + 1], i, v_seed, v_algorithm,
        jsonb_build_object('seed', v_seed, 'deck', to_jsonb(v_deck), 'order', to_jsonb(v_order), 'matchups', to_jsonb(v_matchups), 'deal_position', i), now());
    end loop;

    select jsonb_agg(jsonb_build_object('matchup_id', d.matchup_id, 'deal_position', d.deal_position, 'card_code', d.card_code, 'name_en', c.name_en, 'name_es', c.name_es) order by d.deal_position) into v_cards
    from chaos_card_draws d join chaos_cards c on c.code = d.card_code where d.league_season_id = p_league_season_id and d.week = p_week;
    insert into league_feed_events(league_id, season_id, event_type, body, payload)
    values (v_league, p_league_season_id, 'chaos_cards_dealt', 'Chaos Week rule cards are dealt', jsonb_build_object('week', p_week, 'cards', v_cards));
    return jsonb_build_object('status', 'dealt', 'week', p_week, 'cards', v_cards);
  end if;

  select jsonb_agg(jsonb_build_object('matchup_id', d.matchup_id, 'deal_position', d.deal_position, 'card_code', d.card_code, 'name_en', c.name_en, 'name_es', c.name_es) order by d.deal_position) into v_cards
  from chaos_card_draws d join chaos_cards c on c.code = d.card_code where d.league_season_id = p_league_season_id and d.week = p_week;
  return jsonb_build_object('status', 'exists', 'week', p_week, 'cards', v_cards);
end
$function$;

-- Operator audit: recompute the deal from the stored seed and deck and compare
-- it with what is recorded. Reads only.
create or replace function public.audit_chaos_week_deal(p_league_season_id uuid, p_week integer default 13)
returns jsonb
language sql stable set search_path = public
as $function$
  with deal as (
    select d.*, public.chaos_card_deal_order(d.seed, d.deck) as ord from public.chaos_card_deals d where d.league_season_id = p_league_season_id and d.week = p_week
  ), expected as (
    select m.id as matchup_id, row_number() over (order by nullif(m.context->>'home_seed', '')::int, m.id) as pos
    from public.matchups m where m.league_season_id = p_league_season_id and m.week = p_week and m.event_type = 'chaos'
  ), compared as (
    select e.matchup_id, e.pos, deal.ord[((e.pos - 1) % cardinality(deal.ord)) + 1] as expected_code, dr.card_code as recorded_code, dr.seed = deal.seed as seed_matches
    from deal cross join expected e left join public.chaos_card_draws dr on dr.matchup_id = e.matchup_id
  )
  select case when not exists (select 1 from deal) then jsonb_build_object('dealt', false)
    else jsonb_build_object('dealt', true, 'seed', (select seed from deal), 'deck', (select to_jsonb(deck) from deal), 'order', (select to_jsonb(ord) from deal),
      'matches', (select coalesce(bool_and(expected_code = recorded_code and seed_matches), false) from compared),
      'repeats', (select count(*) - count(distinct recorded_code) from compared),
      'matchups', (select jsonb_agg(jsonb_build_object('matchup_id', matchup_id, 'deal_position', pos, 'expected', expected_code, 'recorded', recorded_code) order by pos) from compared)) end;
$function$;

revoke execute on function public.deal_chaos_week_cards(uuid, integer) from public, anon, authenticated;
revoke execute on function public.audit_chaos_week_deal(uuid, integer) from public, anon, authenticated;
grant execute on function public.deal_chaos_week_cards(uuid, integer) to service_role;
grant execute on function public.audit_chaos_week_deal(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Manager selections. The only way a manager writes to these tables.
-- ---------------------------------------------------------------------------
create or replace function public.set_chaos_card_selection(
  p_matchup_id uuid,
  p_season_franchise_id uuid,
  p_card_code text,
  p_athlete_id uuid default null,
  p_real_team_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_m matchups%rowtype;
  v_code text; v_kind text; v_name text;
  v_opponent uuid;
  v_sel chaos_card_selections%rowtype;
  v_source uuid;
  v_kickoff timestamptz;
  v_counts boolean;
  v_auto jsonb;
  v_details jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if (p_athlete_id is not null)::int + (p_real_team_id is not null)::int <> 1 then raise exception 'Choose exactly one player or defense'; end if;

  perform pg_advisory_xact_lock(hashtextextended('chaos-selection:' || p_matchup_id::text, 0));
  select * into v_m from matchups where id = p_matchup_id;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  if v_m.event_type <> 'chaos' then raise exception 'Not a Chaos Week matchup'; end if;
  if p_season_franchise_id is null or p_season_franchise_id not in (v_m.home_season_franchise_id, v_m.away_season_franchise_id) then raise exception 'Franchise is not in this matchup'; end if;
  if not exists (
    select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id = sf.franchise_id
    where sf.id = p_season_franchise_id and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'Not your franchise'; end if;

  select d.card_code, c.kind, c.name_en into v_code, v_kind, v_name
  from chaos_card_draws d join chaos_cards c on c.code = d.card_code
  where d.matchup_id = p_matchup_id and d.revealed_at is not null and d.revealed_at <= now();
  if v_code is null then raise exception 'No rule card has been dealt to this matchup'; end if;
  if v_code is distinct from p_card_code then raise exception 'This matchup was dealt %, not %', v_name, coalesce(p_card_code, 'no card'); end if;
  if v_kind not in ('captain', 'wild_slot', 'raid') then raise exception '% needs no selection', v_name; end if;
  if v_m.is_final or lineup_week_is_closed(v_m.league_season_id, v_m.week) then raise exception 'Chaos Week is complete; selections are closed'; end if;

  v_opponent := case when p_season_franchise_id = v_m.home_season_franchise_id then v_m.away_season_franchise_id else v_m.home_season_franchise_id end;
  -- First bring the record up to date from the roster and lineup as they
  -- stand: a selection whose player has left the roster is marked void, and an
  -- automatic pick that is already due is recorded. The checks below then read
  -- the row. (If this call is refused below, all of it is rolled back with it.)
  perform chaos_lock_auto_selection(p_matchup_id, p_season_franchise_id);
  select * into v_sel from chaos_card_selections where matchup_id = p_matchup_id and season_franchise_id = p_season_franchise_id;

  if v_kind = 'captain' then
    -- A named captain is fixed once their game has started. A captain who was
    -- moved out of the lineup before kickoff no longer counts and can be replaced.
    v_counts := v_sel.id is not null and exists (select 1 from lineups l where l.season_franchise_id = p_season_franchise_id and l.week = v_m.week and l.slot <> 'BENCH'
         and ((v_sel.athlete_id is not null and l.athlete_id = v_sel.athlete_id) or (v_sel.real_team_id is not null and l.real_team_id = v_sel.real_team_id)));
    if v_counts and chaos_asset_game_started(v_m.league_season_id, v_m.week, v_sel.athlete_id, v_sel.real_team_id) then
      if v_sel.source = 'automatic' then raise exception 'Captain locked: no captain was named before your automatic captain''s game kicked off, so the automatic captain is fixed for the week'; end if;
      raise exception 'Captain locked: your captain''s game has already started';
    end if;
    -- The captain locks at kickoff, named or automatic: with no captain that
    -- counts, a lock that is due (whether or not scoring has recorded it yet)
    -- closes the choice.
    if not v_counts and chaos_auto_captain(p_matchup_id, p_season_franchise_id)->>'locked_at' is not null then
      raise exception 'Captain locked: no captain was named before your automatic captain''s game kicked off, so the automatic captain is fixed for the week';
    end if;
    if not exists (select 1 from lineups l where l.season_franchise_id = p_season_franchise_id and l.week = v_m.week and l.slot <> 'BENCH'
      and ((p_athlete_id is not null and l.athlete_id = p_athlete_id) or (p_real_team_id is not null and l.real_team_id = p_real_team_id))) then
      raise exception 'Your captain must be one of your Week % starters', v_m.week;
    end if;
    v_source := p_season_franchise_id;
  elsif v_kind = 'wild_slot' then
    -- A VOID pick (its player left the roster before kickoff) locks nothing:
    -- the manager chooses again under the normal rules. The automatic Wild
    -- Slot locks at kickoff like the automatic captain; the call above has
    -- recorded it if it was due.
    if v_sel.id is not null and v_sel.voided_at is null then
      if v_sel.source = 'automatic' then
        raise exception 'Wild Slot locked: no player was named before your automatic Wild Slot player''s game kicked off, so the automatic pick is fixed for the week';
      end if;
      if chaos_asset_game_started(v_m.league_season_id, v_m.week, v_sel.athlete_id, v_sel.real_team_id) then
        raise exception 'Wild Slot locked: that player''s game has already started';
      end if;
    end if;
    if not exists (select 1 from roster_entries re where re.season_franchise_id = p_season_franchise_id and re.dropped_at is null
      and ((p_athlete_id is not null and re.athlete_id = p_athlete_id) or (p_real_team_id is not null and re.real_team_id = p_real_team_id))) then
      raise exception 'Your Wild Slot player must be on your active roster';
    end if;
    if exists (select 1 from lineups l where l.season_franchise_id = p_season_franchise_id and l.week = v_m.week and l.slot <> 'BENCH'
      and ((p_athlete_id is not null and l.athlete_id = p_athlete_id) or (p_real_team_id is not null and l.real_team_id = p_real_team_id))) then
      raise exception 'That player is already starting; the Wild Slot is for a player outside your starting lineup';
    end if;
    v_source := p_season_franchise_id;
  else
    if chaos_lower_seed(p_matchup_id) is distinct from p_season_franchise_id then raise exception 'Only the lower seed can raid'; end if;
    -- The deadline comes first: after it the automatic raid applies and nothing can be chosen.
    v_kickoff := chaos_week_first_kickoff(v_m.league_season_id, v_m.week);
    if v_kickoff is null or v_kickoff <= now() then raise exception 'The raid deadline has passed: raids close at the first Week % kickoff', v_m.week; end if;
    -- A raid is final once made. A VOID raid (the raided player left the higher
    -- seed's roster before his kickoff) is not a raid any more: until the
    -- deadline the raider chooses again from the bench as it now stands.
    if v_sel.id is not null and v_sel.voided_at is null then raise exception 'Your raid is already made and cannot be changed'; end if;
    v_auto := chaos_auto_pick(p_matchup_id, p_season_franchise_id, 'raid');
    if coalesce((v_auto->>'penalty')::boolean, false) then
      -- RAID PENALTY: the higher seed has no eligible bench player, so the raid
      -- takes its best-ranked starter, and only that starter.
      if p_athlete_id is distinct from (v_auto->>'athlete_id')::uuid or p_real_team_id is distinct from (v_auto->>'real_team_id')::uuid then
        raise exception 'Your opponent has no eligible bench player, so the raid takes their best-ranked starter. Only that starter can be raided';
      end if;
      v_details := v_auto - 'athlete_id' - 'real_team_id' - 'weeks' - 'locked_at';
    else
      if not exists (select 1 from roster_entries re where re.season_franchise_id = v_opponent and re.dropped_at is null
        and ((p_athlete_id is not null and re.athlete_id = p_athlete_id) or (p_real_team_id is not null and re.real_team_id = p_real_team_id))) then
        raise exception 'That player is not on your opponent''s roster';
      end if;
      if exists (select 1 from lineups l where l.season_franchise_id = v_opponent and l.week = v_m.week and l.slot <> 'BENCH'
        and ((p_athlete_id is not null and l.athlete_id = p_athlete_id) or (p_real_team_id is not null and l.real_team_id = p_real_team_id))) then
        raise exception 'You can only raid the bench: that player is in your opponent''s starting lineup';
      end if;
    end if;
    v_source := v_opponent;
  end if;

  if chaos_asset_game_started(v_m.league_season_id, v_m.week, p_athlete_id, p_real_team_id) then
    raise exception 'That player''s game has already started';
  end if;

  insert into chaos_card_selections(matchup_id, season_franchise_id, card_code, athlete_id, real_team_id, source_season_franchise_id, details, selected_by, locked_at)
  values (p_matchup_id, p_season_franchise_id, v_code, p_athlete_id, p_real_team_id, v_source, v_details, v_user, case when v_kind = 'raid' then now() end)
  on conflict (matchup_id, season_franchise_id) do update
    set card_code = excluded.card_code, athlete_id = excluded.athlete_id, real_team_id = excluded.real_team_id, source = 'named', details = excluded.details,
        source_season_franchise_id = excluded.source_season_franchise_id, selected_by = excluded.selected_by, selected_at = now(), locked_at = excluded.locked_at,
        voided_at = null, void_reason = null;

  if v_kind = 'raid' then
    insert into league_feed_events(league_id, season_id, actor_user_id, event_type, body, payload)
    select ls.league_id, v_m.league_season_id, v_user, 'chaos_raid', 'Chaos Week raid',
      jsonb_build_object('matchup_id', p_matchup_id, 'week', v_m.week, 'raider_season_franchise_id', p_season_franchise_id, 'raided_season_franchise_id', v_opponent, 'athlete_id', p_athlete_id, 'real_team_id', p_real_team_id,
        'automatic', false, 'penalty', v_details is not null)
    from league_seasons ls where ls.id = v_m.league_season_id;
  end if;

  return jsonb_build_object('status', 'set', 'card_code', v_code, 'matchup_id', p_matchup_id, 'season_franchise_id', p_season_franchise_id, 'athlete_id', p_athlete_id, 'real_team_id', p_real_team_id);
end
$function$;

create or replace function public.clear_chaos_card_selection(p_matchup_id uuid, p_season_franchise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_m matchups%rowtype;
  v_sel chaos_card_selections%rowtype;
  v_kind text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chaos-selection:' || p_matchup_id::text, 0));
  select * into v_m from matchups where id = p_matchup_id;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  if not exists (
    select 1 from season_franchises sf join franchise_owners fo on fo.franchise_id = sf.franchise_id
    where sf.id = p_season_franchise_id and fo.user_id = v_user and fo.ends_on is null
  ) then raise exception 'Not your franchise'; end if;
  -- Bring the record up to date first (void rows, automatic picks that are
  -- due), and move the evaluation mark to now: once a named selection is
  -- cleared, the automatic rule only looks at kickoffs still to come.
  perform chaos_lock_auto_selection(p_matchup_id, p_season_franchise_id);
  select * into v_sel from chaos_card_selections where matchup_id = p_matchup_id and season_franchise_id = p_season_franchise_id;
  if v_sel.id is null then return jsonb_build_object('status', 'unchanged'); end if;
  select kind into v_kind from chaos_cards where code = v_sel.card_code;
  if v_kind = 'raid' then raise exception 'Your raid is already made and cannot be changed'; end if;
  if v_m.is_final or lineup_week_is_closed(v_m.league_season_id, v_m.week) then raise exception 'Chaos Week is complete; selections are closed'; end if;
  if v_sel.voided_at is null and chaos_asset_game_started(v_m.league_season_id, v_m.week, v_sel.athlete_id, v_sel.real_team_id)
     and (v_kind <> 'captain' or exists (select 1 from lineups l where l.season_franchise_id = p_season_franchise_id and l.week = v_m.week and l.slot <> 'BENCH'
       and ((v_sel.athlete_id is not null and l.athlete_id = v_sel.athlete_id) or (v_sel.real_team_id is not null and l.real_team_id = v_sel.real_team_id)))) then
    raise exception 'Selection locked: that player''s game has already started';
  end if;
  delete from chaos_card_selections where id = v_sel.id;
  return jsonb_build_object('status', 'cleared', 'card_code', v_sel.card_code);
end
$function$;

revoke execute on function public.set_chaos_card_selection(uuid, uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.clear_chaos_card_selection(uuid, uuid) from public, anon;
grant execute on function public.set_chaos_card_selection(uuid, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.clear_chaos_card_selection(uuid, uuid) to authenticated;

-- Brings one franchise's selection record up to date for an OPEN Chaos Week
-- game that holds a CAPTAIN, WILD SLOT or RAID card. In order:
--
--   1. VOID. A WILD SLOT or RAID row whose player is no longer on the roster
--      he was chosen from, and who left before his own kickoff, is marked void
--      (voided_at = the time he left). The row stays, adds nothing and locks
--      nothing. (A player dropped after his game has been played keeps the
--      selection: his points were earned while he was on that roster.)
--   2. AUTOMATIC. With no selection that counts (none; a void one; a captain
--      who left the starting lineup), chaos_auto_pick is asked. If its pick is
--      DUE (the player's kickoff has passed; for a raid, the first kickoff of
--      the week) the pick is recorded with source 'automatic', no user, and
--      details holding everything compared. locked_at is the time it was due;
--      for a raid that replaces a row voided after the deadline, the time that
--      row became void. An automatic raid is announced in the feed like a
--      named one.
--   3. MARK. chaos_card_auto_marks.evaluated_through moves to now(): the rule
--      has been applied to the roster and lineup as they stood up to now.
--
-- Called by recompute_matchup before every rescore of an open game, by
-- set_chaos_card_selection and clear_chaos_card_selection before they read the
-- row, by set_lineup_slot before a lineup change, and by the triggers of
-- section 5b before every lineup or roster change and after every drop. So a
-- pick is always recorded from the roster and lineup as they stood BEFORE
-- anything moved after it became due, and a raid voided after the deadline is
-- replaced at once. Idempotent: with a selection that counts it only moves the
-- mark. Returns the pick it recorded, else null.
create or replace function public.chaos_lock_auto_selection(p_matchup_id uuid, p_season_franchise_id uuid)
returns jsonb
language plpgsql set search_path = public
as $function$
declare
  v_m matchups%rowtype;
  v_code text; v_kind text;
  v_sel chaos_card_selections%rowtype;
  v_auto jsonb;
  v_counts boolean;
  v_left timestamptz;
  v_kickoff timestamptz;
  v_lock timestamptz;
  v_recorded jsonb;
begin
  select * into v_m from matchups where id = p_matchup_id;
  if v_m.id is null or v_m.event_type <> 'chaos' or v_m.is_final or p_season_franchise_id not in (v_m.home_season_franchise_id, v_m.away_season_franchise_id) then return null; end if;
  select d.card_code, c.kind into v_code, v_kind from chaos_card_draws d join chaos_cards c on c.code = d.card_code
  where d.matchup_id = p_matchup_id and c.kind in ('captain', 'wild_slot', 'raid') and d.revealed_at is not null and d.revealed_at <= now();
  if v_code is null then return null; end if;
  -- Only the lower seed has a raid to make, to void or to automate.
  if v_kind = 'raid' and chaos_lower_seed(p_matchup_id) is distinct from p_season_franchise_id then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended('chaos-selection:' || p_matchup_id::text, 0));
  select * into v_sel from chaos_card_selections where matchup_id = p_matchup_id and season_franchise_id = p_season_franchise_id;

  -- 1. VOID.
  if v_sel.id is not null and v_kind in ('wild_slot', 'raid') and v_sel.voided_at is null
     and not exists (select 1 from roster_entries re where re.season_franchise_id = v_sel.source_season_franchise_id and re.dropped_at is null
       and ((v_sel.athlete_id is not null and re.athlete_id = v_sel.athlete_id) or (v_sel.athlete_id is null and re.real_team_id = v_sel.real_team_id))) then
    select max(re.dropped_at) into v_left from roster_entries re where re.season_franchise_id = v_sel.source_season_franchise_id
      and ((v_sel.athlete_id is not null and re.athlete_id = v_sel.athlete_id) or (v_sel.athlete_id is null and re.real_team_id = v_sel.real_team_id));
    select min(rg.starts_at) into v_kickoff from league_seasons ls join real_games rg on rg.competition_season_id = ls.competition_season_id and rg.week = v_m.week
    where ls.id = v_m.league_season_id and coalesce(rg.state::text, 'unknown') not in ('canceled', 'postponed')
      and coalesce(v_sel.real_team_id, (select a.real_team_id from athletes a where a.id = v_sel.athlete_id)) in (rg.home_team_id, rg.away_team_id);
    if v_left is null or v_kickoff is null or v_left < v_kickoff then
      update chaos_card_selections set voided_at = coalesce(v_left, now()), void_reason = 'dropped' where id = v_sel.id returning * into v_sel;
    end if;
  end if;

  -- 2. AUTOMATIC.
  v_counts := v_sel.id is not null and case when v_kind = 'captain'
    then exists (select 1 from lineups l where l.season_franchise_id = p_season_franchise_id and l.week = v_m.week and l.slot <> 'BENCH'
      and ((v_sel.athlete_id is not null and l.athlete_id = v_sel.athlete_id) or (v_sel.real_team_id is not null and l.real_team_id = v_sel.real_team_id)))
    else v_sel.voided_at is null end;
  if not v_counts then
    v_auto := chaos_auto_pick(p_matchup_id, p_season_franchise_id, v_kind);
    if v_auto is not null and v_auto->>'locked_at' is not null then
      v_lock := (v_auto->>'locked_at')::timestamptz;
      if v_kind = 'raid' and v_sel.voided_at is not null and v_sel.voided_at > v_lock then v_lock := v_sel.voided_at; end if;
      insert into chaos_card_selections(matchup_id, season_franchise_id, card_code, athlete_id, real_team_id, source_season_franchise_id, source, details, selected_by, locked_at)
      values (p_matchup_id, p_season_franchise_id, v_code, (v_auto->>'athlete_id')::uuid, (v_auto->>'real_team_id')::uuid,
        case when v_kind = 'raid' then case when p_season_franchise_id = v_m.home_season_franchise_id then v_m.away_season_franchise_id else v_m.home_season_franchise_id end else p_season_franchise_id end,
        'automatic',
        (v_auto - 'athlete_id' - 'real_team_id' - 'weeks' - 'locked_at')
          || case when v_sel.voided_at is not null then jsonb_build_object('replaced', jsonb_build_object('athlete_id', v_sel.athlete_id, 'real_team_id', v_sel.real_team_id, 'source', v_sel.source, 'reason', v_sel.void_reason, 'voided_at', v_sel.voided_at)) else '{}'::jsonb end,
        null, v_lock)
      on conflict (matchup_id, season_franchise_id) do update
        set card_code = excluded.card_code, athlete_id = excluded.athlete_id, real_team_id = excluded.real_team_id, source_season_franchise_id = excluded.source_season_franchise_id,
            source = 'automatic', details = excluded.details, selected_by = null, selected_at = now(), locked_at = excluded.locked_at, voided_at = null, void_reason = null;
      if v_kind = 'raid' then
        insert into league_feed_events(league_id, season_id, event_type, body, payload)
        select ls.league_id, v_m.league_season_id, 'chaos_raid', 'Chaos Week raid',
          jsonb_build_object('matchup_id', p_matchup_id, 'week', v_m.week, 'raider_season_franchise_id', p_season_franchise_id,
            'raided_season_franchise_id', case when p_season_franchise_id = v_m.home_season_franchise_id then v_m.away_season_franchise_id else v_m.home_season_franchise_id end,
            'athlete_id', v_auto->'athlete_id', 'real_team_id', v_auto->'real_team_id', 'automatic', true, 'penalty', coalesce((v_auto->>'penalty')::boolean, false))
        from league_seasons ls where ls.id = v_m.league_season_id;
      end if;
      v_recorded := v_auto;
    end if;
  end if;

  -- 3. MARK.
  insert into chaos_card_auto_marks(matchup_id, season_franchise_id, evaluated_through) values (p_matchup_id, p_season_franchise_id, now())
  on conflict (matchup_id, season_franchise_id) do update set evaluated_through = greatest(chaos_card_auto_marks.evaluated_through, excluded.evaluated_through);
  return v_recorded;
end
$function$;

-- The automatic captain's recorder, under the name it had before the automatic
-- Wild Slot and raid existed.
create or replace function public.chaos_lock_auto_captain(p_matchup_id uuid, p_season_franchise_id uuid)
returns jsonb
language sql set search_path = public
as $function$
  select public.chaos_lock_auto_selection(p_matchup_id, p_season_franchise_id);
$function$;

-- Both sides of one matchup.
create or replace function public.chaos_sync_selections(p_matchup_id uuid)
returns void
language plpgsql set search_path = public
as $function$
begin
  perform chaos_lock_auto_selection(p_matchup_id, m.home_season_franchise_id), chaos_lock_auto_selection(p_matchup_id, m.away_season_franchise_id)
  from matchups m where m.id = p_matchup_id and m.event_type = 'chaos' and not m.is_final;
end
$function$;

revoke execute on function public.chaos_lock_auto_selection(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.chaos_lock_auto_captain(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.chaos_sync_selections(uuid) from public, anon, authenticated;
grant execute on function public.chaos_lock_auto_selection(uuid, uuid) to service_role;
grant execute on function public.chaos_lock_auto_captain(uuid, uuid) to service_role;
grant execute on function public.chaos_sync_selections(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5b. Triggers on roster_entries and lineups (tables of earlier migrations).
--
--     The automatic rule is "decided at kickoff" but recorded later (the weekly
--     job does not run at every kickoff). For the record to be the one the
--     roster and lineup gave AT the kickoff, it has to be written before
--     anything moves afterwards. These triggers do that for every path that
--     changes a lineup or a roster (set_lineup_slot, claim_free_agent,
--     process_due_waivers, resolve_trade, operator changes), without replacing
--     those functions:
--       * BEFORE a lineup row or a roster row changes: chaos_sync_selections;
--       * AFTER a roster row is dropped: chaos_sync_selections again, which
--         marks a selection of that player void and, for a raid past its
--         deadline, records the automatic raid at once.
--     NOTHING HAPPENS unless the franchise is playing an open Chaos Week game
--     that holds a revealed CAPTAIN, WILD SLOT or RAID card: the loop below
--     finds no row. In a league season with no cards (every league season until
--     an operator opts one in and cards are dealt) the cost is one indexed
--     lookup in an empty table.
-- ---------------------------------------------------------------------------
create or replace function public.chaos_cards_sync_on_change()
returns trigger
language plpgsql security definer set search_path = public
as $function$
declare
  v_sf uuid;
  v_week integer;
  v_matchup uuid;
begin
  if tg_op = 'DELETE' then v_sf := old.season_franchise_id; else v_sf := new.season_franchise_id; end if;
  if tg_table_name = 'lineups' then
    if tg_op = 'DELETE' then v_week := old.week; else v_week := new.week; end if;
  end if;
  for v_matchup in
    select m.id
    from chaos_card_draws d
    join chaos_cards c on c.code = d.card_code and c.kind in ('captain', 'wild_slot', 'raid')
    join matchups m on m.id = d.matchup_id
    where m.event_type = 'chaos' and not m.is_final
      and v_sf in (m.home_season_franchise_id, m.away_season_franchise_id)
      and (v_week is null or m.week = v_week)
  loop
    -- FAIL OPEN. These triggers sit on tables every league uses. If the card
    -- bookkeeping ever raises, the roster or lineup change it was following
    -- still goes through; the failure is written to the database log as a
    -- WARNING and the next scoring run (recompute_matchup, which is not
    -- guarded) evaluates the rule again.
    begin
      perform chaos_sync_selections(v_matchup);
    exception when others then
      raise warning 'chaos_cards_sync_on_change: % on % for matchup % was not applied: %', tg_op, tg_table_name, v_matchup, sqlerrm;
    end;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke execute on function public.chaos_cards_sync_on_change() from public, anon, authenticated;

drop trigger if exists chaos_cards_before_roster_change on public.roster_entries;
create trigger chaos_cards_before_roster_change before insert or update of dropped_at on public.roster_entries
  for each row execute function public.chaos_cards_sync_on_change();
drop trigger if exists chaos_cards_after_roster_drop on public.roster_entries;
create trigger chaos_cards_after_roster_drop after update of dropped_at on public.roster_entries
  for each row when (old.dropped_at is null and new.dropped_at is not null) execute function public.chaos_cards_sync_on_change();
drop trigger if exists chaos_cards_before_lineup_change on public.lineups;
create trigger chaos_cards_before_lineup_change before insert or delete or update of season_franchise_id, week, athlete_id, real_team_id, slot on public.lineups
  for each row execute function public.chaos_cards_sync_on_change();

-- ---------------------------------------------------------------------------
-- 6. chaos_clause_decision: the text of 20261004010000. Changes: for a Chaos
--    Week game that had a rule card the BASE lineup total is compared, and the
--    step also records basis and both adjusted totals. Without a card the
--    step is byte-for-byte what it was.
-- ---------------------------------------------------------------------------
create or replace function public.chaos_clause_decision(
  p_league_season_id uuid,
  p_home_season_franchise_id uuid,
  p_away_season_franchise_id uuid
) returns jsonb
language plpgsql
stable
set search_path = public
as $function$
declare
  v_steps jsonb := '[]'::jsonb;
  v_step record;
  v_home numeric;
  v_away numeric;
  v_home_adjusted numeric;   -- rule cards: the total after card adjustments
  v_away_adjusted numeric;
  v_carded boolean;
  v_home_seed integer;
  v_away_seed integer;
  v_outcome text;
  v_decided text := 'unresolved';
  v_winner uuid;
begin
  for v_step in select * from (values (1, 'chaos_week', 13, 'chaos'), (2, 'rivalry_week', 10, 'rivalry')) s(ord, step, week, event_type) order by ord loop
    v_home := null; v_away := null; v_home_adjusted := null; v_away_adjusted := null; v_carded := false;
    -- Rule cards: compare the BASE lineup total when the game had a card; the adjusted total is recorded beside it.
    select case when m.home_season_franchise_id = p_home_season_franchise_id then coalesce((m.context->'chaos_cards'->'home'->>'base')::numeric, m.home_points) else coalesce((m.context->'chaos_cards'->'away'->>'base')::numeric, m.away_points) end,
           case when m.home_season_franchise_id = p_home_season_franchise_id then m.home_points else m.away_points end,
           v_carded or (m.context ? 'chaos_cards')
      into v_home, v_home_adjusted, v_carded
    from matchups m
    where m.league_season_id = p_league_season_id and m.week = v_step.week and m.event_type = v_step.event_type and m.is_final
      and p_home_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id)
    order by m.id limit 1;
    -- Rule cards: compare the BASE lineup total when the game had a card; the adjusted total is recorded beside it.
    select case when m.home_season_franchise_id = p_away_season_franchise_id then coalesce((m.context->'chaos_cards'->'home'->>'base')::numeric, m.home_points) else coalesce((m.context->'chaos_cards'->'away'->>'base')::numeric, m.away_points) end,
           case when m.home_season_franchise_id = p_away_season_franchise_id then m.home_points else m.away_points end,
           v_carded or (m.context ? 'chaos_cards')
      into v_away, v_away_adjusted, v_carded
    from matchups m
    where m.league_season_id = p_league_season_id and m.week = v_step.week and m.event_type = v_step.event_type and m.is_final
      and p_away_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id)
    order by m.id limit 1;

    v_outcome := case when v_home is null or v_away is null then 'unavailable'
                      when v_home > v_away then 'home' when v_away > v_home then 'away' else 'level' end;
    v_steps := v_steps || (jsonb_build_object('step', v_step.step, 'week', v_step.week, 'home', v_home, 'away', v_away, 'outcome', v_outcome)
      || case when v_carded then jsonb_build_object('basis', 'base_lineup_total', 'home_adjusted', v_home_adjusted, 'away_adjusted', v_away_adjusted) else '{}'::jsonb end);
    if v_outcome in ('home', 'away') then v_decided := v_step.step; exit; end if;
  end loop;

  if v_decided = 'unresolved' then
    select seed into v_home_seed from postseason_seeds where league_season_id = p_league_season_id and season_franchise_id = p_home_season_franchise_id;
    select seed into v_away_seed from postseason_seeds where league_season_id = p_league_season_id and season_franchise_id = p_away_season_franchise_id;
    v_outcome := case when v_home_seed is null or v_away_seed is null then 'unavailable'
                      when v_home_seed < v_away_seed then 'home' when v_away_seed < v_home_seed then 'away' else 'level' end;
    v_steps := v_steps || jsonb_build_object('step', 'postseason_seed', 'home', v_home_seed, 'away', v_away_seed, 'outcome', v_outcome);
    if v_outcome in ('home', 'away') then v_decided := 'postseason_seed'; end if;
  end if;

  if v_decided <> 'unresolved' then
    v_winner := case when v_outcome = 'home' then p_home_season_franchise_id else p_away_season_franchise_id end;
  end if;
  return jsonb_build_object('rule', 'chaos_clause', 'version', 1, 'decided_by', v_decided, 'winner_season_franchise_id', v_winner, 'steps', v_steps);
end
$function$;

revoke execute on function public.chaos_clause_decision(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.chaos_clause_decision(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. recompute_matchup: the text of 20261004010000. Changes are the lines that
--    mention v_cards, v_side_home, v_side_away, v_until or v_grant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_matchup(p_matchup_id uuid, p_finalize boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_m matchups%rowtype; v_home numeric:=0; v_away numeric:=0; v_close jsonb; v_winner uuid; v_loser uuid; v_league uuid; v_clause jsonb;
  v_cards jsonb; v_side_home jsonb; v_side_away jsonb; v_until timestamptz; v_grant text;   -- rule cards
begin
  select * into v_m from matchups where id=p_matchup_id for update;
  if v_m.id is null then raise exception 'Matchup not found'; end if;
  select league_id into v_league from league_seasons where id=v_m.league_season_id;
  if auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid()) then raise exception 'League access required'; end if;
  if p_finalize and auth.uid() is not null and not exists(select 1 from league_members where league_id=v_league and user_id=auth.uid() and role='commissioner') then raise exception 'Commissioner access required to finalize matchup'; end if;

  select coalesce(sum(x.points),0) into v_home from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.home_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  select coalesce(sum(x.points),0) into v_away from (
    select fps.points from lineups l join fantasy_player_scores fps on fps.league_season_id=v_m.league_season_id and fps.athlete_id=l.athlete_id and fps.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot<>'BENCH'
    union all
    select fts.points from lineups l join fantasy_team_scores fts on fts.league_season_id=v_m.league_season_id and fts.real_team_id=l.real_team_id and fts.week=v_m.week where l.season_franchise_id=v_m.away_season_franchise_id and l.week=v_m.week and l.slot='DST'
  ) x;
  -- Chaos Week rule cards. Only a 'chaos' matchup with a revealed card is touched; for every other
  -- matchup v_cards stays null and nothing below differs from 20261004010000. v_home / v_away become the
  -- adjusted totals; the base totals and each adjustment line go to context->'chaos_cards'.
  if v_m.event_type='chaos' then
    -- Selections lock at kickoff: mark void selections and record every AUTOMATIC selection that is due (captain, Wild Slot, raid) before scoring, so the score below reads the recorded rows. Does nothing unless a CAPTAIN, WILD SLOT or RAID card was dealt.
    if not v_m.is_final then perform chaos_sync_selections(v_m.id); end if;
    v_side_home:=chaos_card_side_score(v_m.id,v_m.home_season_franchise_id);
    if v_side_home->>'card_code' is not null then
      v_side_away:=chaos_card_side_score(v_m.id,v_m.away_season_franchise_id);
      v_home:=(v_side_home->>'total')::numeric; v_away:=(v_side_away->>'total')::numeric;
      v_cards:=jsonb_build_object('version',1,'card_code',v_side_home->>'card_code','kind',v_side_home->>'kind','home',v_side_home-'card_code'-'kind','away',v_side_away-'card_code'-'kind');
      if v_m.context->'chaos_cards' ? 'bounty' then v_cards:=v_cards||jsonb_build_object('bounty',v_m.context->'chaos_cards'->'bounty'); end if;
      if not v_m.is_final then update chaos_card_selections s set locked_at=now() where s.matchup_id=v_m.id and s.locked_at is null and s.voided_at is null and chaos_asset_game_started(v_m.league_season_id,v_m.week,s.athlete_id,s.real_team_id); end if;
    elsif v_m.context ? 'chaos_cards' and not v_m.is_final then
      -- A deal that was withdrawn (or hidden) before the game finished: drop the stale build-up.
      update matchups set context=context-'chaos_cards' where id=v_m.id;
    end if;
  end if;
  update matchups set home_points=v_home,away_points=v_away where id=v_m.id;
  if v_cards is not null then update matchups set context=coalesce(context,'{}'::jsonb)||jsonb_build_object('chaos_cards',v_cards) where id=v_m.id; end if;

  if p_finalize and not v_m.is_final then
    v_close:=fantasy_week_close_status((select competition_season_id from league_seasons where id=v_m.league_season_id),v_m.week);
    if not (v_close->>'complete')::boolean then raise exception 'Cannot finalize while real games are unfinished' using detail=v_close::text; end if;
    if (v_close->>'override_applied')::boolean then raise warning 'Finalizing matchup % (week %) under a postponed-game operator override: %',v_m.id,v_m.week,v_close::text; end if;
    if v_home>v_away then v_winner:=v_m.home_season_franchise_id; v_loser:=v_m.away_season_franchise_id;
    elsif v_away>v_home then v_winner:=v_m.away_season_franchise_id; v_loser:=v_m.home_season_franchise_id;
    else
      v_winner:=null;
      -- The Chaos Clause: a level POSTSEASON game still gets a winner. Regular-season ties stay ties.
      if chaos_clause_applies(v_m.event_type) then
        v_clause:=chaos_clause_decision(v_m.league_season_id,v_m.home_season_franchise_id,v_m.away_season_franchise_id);
        v_winner:=(v_clause->>'winner_season_franchise_id')::uuid;
        if v_winner is not null then v_loser:=case when v_winner=v_m.home_season_franchise_id then v_m.away_season_franchise_id else v_m.home_season_franchise_id end; end if;
      end if;
    end if;
    update matchups set home_points=v_home,away_points=v_away,winner_season_franchise_id=v_winner,is_final=true,context=case when v_clause is null then context else coalesce(context,'{}'::jsonb)||jsonb_build_object('chaos_clause',v_clause) end where id=v_m.id;
    if v_winner is null then
      update standings set ties=ties+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=0 where league_season_id=v_m.league_season_id and season_franchise_id in (v_m.home_season_franchise_id,v_m.away_season_franchise_id);
    else
      update standings set wins=wins+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak>=0 then streak+1 else 1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_winner;
      update standings set losses=losses+1,points_for=points_for+case when season_franchise_id=v_m.home_season_franchise_id then v_home else v_away end,points_against=points_against+case when season_franchise_id=v_m.home_season_franchise_id then v_away else v_home end,streak=case when streak<=0 then streak-1 else -1 end where league_season_id=v_m.league_season_id and season_franchise_id=v_loser;
    end if;
    -- BOUNTY: whoever won a game played under that card moves up the waiver order. The lower seed goes to the front ('first'); the higher seed moves up three places ('up_three'). A level game has no winner here and earns nothing. Recorded once; process_due_waivers honours it until effective_until.
    if v_cards->>'kind'='bounty' and v_winner is not null and chaos_lower_seed(v_m.id) is not null then
      v_grant:=case when v_winner=chaos_lower_seed(v_m.id) then 'first' else 'up_three' end;
      select max(rg.starts_at) into v_until from real_games rg where rg.competition_season_id=(select competition_season_id from league_seasons where id=v_m.league_season_id) and rg.week=v_m.week+1 and coalesce(rg.state::text,'unknown') not in ('canceled','postponed');
      if v_until is null or v_until<=now() then v_until:=now()+interval '7 days'; end if;
      insert into chaos_bounty_grants(league_season_id,season_franchise_id,matchup_id,source_week,grant_kind,effective_from,effective_until) values(v_m.league_season_id,v_winner,v_m.id,v_m.week,v_grant,now(),v_until) on conflict (matchup_id) do nothing;
      v_cards:=v_cards||jsonb_build_object('bounty',jsonb_build_object('season_franchise_id',v_winner,'grant',v_grant,'effective_until',v_until));
      update matchups set context=context||jsonb_build_object('chaos_cards',v_cards) where id=v_m.id;
      insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'chaos_bounty_granted','Bounty earned',jsonb_build_object('matchup_id',v_m.id,'week',v_m.week,'season_franchise_id',v_winner,'grant',v_grant,'effective_until',v_until));
    end if;
    perform award_matchup_achievements(v_m.id);
    insert into league_feed_events(league_id,season_id,event_type,body,payload) values(v_league,v_m.league_season_id,'matchup_final','Matchup final',jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'winner_season_franchise_id',v_winner)||case when (v_close->>'override_applied')::boolean then jsonb_build_object('postponed_game_override',true) else '{}'::jsonb end||case when v_clause is not null then jsonb_build_object('chaos_clause',v_clause) else '{}'::jsonb end||case when v_cards is not null then jsonb_build_object('chaos_cards',v_cards) else '{}'::jsonb end);
  elsif v_m.is_final then v_winner:=v_m.winner_season_franchise_id; v_clause:=v_m.context->'chaos_clause'; end if;
  return jsonb_build_object('matchup_id',v_m.id,'home_points',v_home,'away_points',v_away,'is_final',p_finalize or v_m.is_final,'winner_season_franchise_id',coalesce(v_winner,v_m.winner_season_franchise_id))||case when v_clause is not null then jsonb_build_object('chaos_clause',v_clause) else '{}'::jsonb end||case when v_cards is not null then jsonb_build_object('chaos_cards',v_cards) else '{}'::jsonb end;
end $function$;

-- ---------------------------------------------------------------------------
-- 8. set_lineup_slot: the text of 20261003030000 plus the two rule-card checks.
-- ---------------------------------------------------------------------------
create or replace function public.set_lineup_slot(
  p_season_franchise_id uuid,
  p_week integer,
  p_slot public.lineup_slot,
  p_slot_index integer default 1,
  p_athlete_id uuid default null,
  p_real_team_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_franchise uuid;
  v_league_season uuid;
  v_pos text;
  v_previous_athlete uuid;
  v_previous_real_team uuid;
  v_previous_roster_entry uuid;
  v_incoming_roster_entry uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_week < 1 or p_week > 18 then raise exception 'Invalid week'; end if;
  if p_slot_index < 1 or p_slot_index > 2 then raise exception 'Invalid slot index'; end if;
  if p_slot not in ('RB', 'WR') and p_slot_index <> 1 then
    raise exception 'Only RB and WR use a second indexed slot';
  end if;
  if p_athlete_id is not null and p_real_team_id is not null then
    raise exception 'Choose only one athlete or D/ST';
  end if;

  select sf.franchise_id, sf.league_season_id
    into v_franchise, v_league_season
  from public.season_franchises sf
  where sf.id = p_season_franchise_id;

  if v_franchise is null then raise exception 'Franchise season not found'; end if;
  if not exists (
    select 1
    from public.franchise_owners fo
    where fo.franchise_id = v_franchise
      and fo.user_id = v_user
      and fo.ends_on is null
  ) then raise exception 'Not your franchise'; end if;

  -- A completed week is history. Without this, every lock released once the
  -- week's real games went final and past lineups became editable again.
  if public.lineup_week_is_closed(v_league_season, p_week) then
    raise exception 'Lineup locked: Week % is complete and can no longer be changed', p_week;
  end if;

  -- Advisory locking also serializes the initially-empty lineup case.
  perform pg_advisory_xact_lock(
    hashtextextended('lineup:' || p_season_franchise_id::text || ':' || p_week::text, 0)
  );
  perform 1
  from public.lineups
  where season_franchise_id = p_season_franchise_id and week = p_week
  for update;

  -- Chaos Week CAPTAIN, WILD SLOT and RAID cards: if an automatic selection is
  -- due (its kickoff, or the raid deadline, has passed) but scoring has not
  -- recorded it yet, record it now, from the lineup as it is BEFORE this
  -- change. Both sides of the game, because the higher seed's lineup decides
  -- what the lower seed's automatic raid takes. No rows unless such a card was
  -- dealt. (The lineups trigger of section 5b would do the same at the first
  -- row this function changes; it is done here explicitly, before anything is read.)
  perform public.chaos_sync_selections(m.id)
  from public.matchups m
  join public.chaos_card_draws d on d.matchup_id = m.id
  join public.chaos_cards c on c.code = d.card_code and c.kind in ('captain', 'wild_slot', 'raid')
  where m.league_season_id = v_league_season and m.week = p_week and m.event_type = 'chaos' and not m.is_final
    and p_season_franchise_id in (m.home_season_franchise_id, m.away_season_franchise_id);

  select l.athlete_id, l.real_team_id
    into v_previous_athlete, v_previous_real_team
  from public.lineups l
  where l.season_franchise_id = p_season_franchise_id
    and l.week = p_week
    and l.slot = p_slot
    and l.slot_index = p_slot_index;

  if v_previous_athlete is not distinct from p_athlete_id
     and v_previous_real_team is not distinct from p_real_team_id then
    return jsonb_build_object(
      'status', 'unchanged', 'slot', p_slot,
      'slot_index', p_slot_index, 'week', p_week
    );
  end if;

  if v_previous_athlete is not null or v_previous_real_team is not null then
    select re.id into v_previous_roster_entry
    from public.roster_entries re
    where re.season_franchise_id = p_season_franchise_id
      and re.dropped_at is null
      and (
        (v_previous_athlete is not null and re.athlete_id = v_previous_athlete)
        or (v_previous_real_team is not null and re.real_team_id = v_previous_real_team)
      )
    limit 1;

    if v_previous_roster_entry is not null
       and public.roster_asset_week_game_has_started(v_previous_roster_entry, p_week) then
      raise exception 'Lineup locked: the player or team currently in this slot has already started';
    end if;
  end if;

  if p_real_team_id is not null then
    if p_slot <> 'DST' then raise exception 'Team defense can only be placed in D/ST'; end if;
    select re.id into v_incoming_roster_entry
    from public.roster_entries re
    where re.season_franchise_id = p_season_franchise_id
      and re.real_team_id = p_real_team_id
      and re.dropped_at is null;
    if v_incoming_roster_entry is null then raise exception 'D/ST is not on roster'; end if;
  elsif p_athlete_id is not null then
    select a.position, re.id into v_pos, v_incoming_roster_entry
    from public.athletes a
    left join public.roster_entries re
      on re.athlete_id = a.id
     and re.season_franchise_id = p_season_franchise_id
     and re.dropped_at is null
    where a.id = p_athlete_id;

    if v_pos is null then raise exception 'Athlete not found'; end if;
    if v_incoming_roster_entry is null then raise exception 'Athlete is not on roster'; end if;
    if p_slot = 'QB' and v_pos <> 'QB' then raise exception 'QB slot requires QB'; end if;
    if p_slot = 'RB' and v_pos <> 'RB' then raise exception 'RB slot requires RB'; end if;
    if p_slot = 'WR' and v_pos <> 'WR' then raise exception 'WR slot requires WR'; end if;
    if p_slot = 'TE' and v_pos <> 'TE' then raise exception 'TE slot requires TE'; end if;
    if p_slot = 'K' and v_pos <> 'K' then raise exception 'K slot requires kicker'; end if;
    if p_slot = 'FLEX' and v_pos not in ('RB', 'WR', 'TE') then
      raise exception 'FLEX requires RB, WR, or TE';
    end if;
    if p_slot = 'DST' then raise exception 'D/ST requires team defense'; end if;
  end if;

  if v_incoming_roster_entry is not null
     and public.roster_asset_week_game_has_started(v_incoming_roster_entry, p_week) then
    raise exception 'Lineup locked: that player or team has already started';
  end if;

  -- Chaos Week rule cards. Both checks read chaos_card_selections, which is
  -- empty unless cards were dealt, so nothing changes for other weeks or leagues.
  if p_athlete_id is not null or p_real_team_id is not null then
    -- RAID: the raided player stays on this roster but cannot start that week.
    -- Not for a void raid, and not for a PENALTY raid: there the raided player
    -- is one of this franchise's starters, and it keeps starting and scoring him.
    if exists (
      select 1
      from public.chaos_card_selections s
      join public.chaos_cards c on c.code = s.card_code and c.kind = 'raid'
      join public.matchups m on m.id = s.matchup_id
      where m.league_season_id = v_league_season and m.week = p_week
        and s.voided_at is null and coalesce((s.details->>'penalty')::boolean, false) is not true
        and s.source_season_franchise_id = p_season_franchise_id
        and ((p_athlete_id is not null and s.athlete_id = p_athlete_id)
          or (p_real_team_id is not null and s.real_team_id = p_real_team_id))
    ) then
      raise exception 'Lineup locked: your Chaos Week opponent raided this player, so they cannot start for you in Week %', p_week;
    end if;
    -- WILD SLOT: a player cannot count as a starter and as the extra player.
    if exists (
      select 1
      from public.chaos_card_selections s
      join public.chaos_cards c on c.code = s.card_code and c.kind = 'wild_slot'
      join public.matchups m on m.id = s.matchup_id
      where m.league_season_id = v_league_season and m.week = p_week
        and s.voided_at is null
        and s.season_franchise_id = p_season_franchise_id
        and ((p_athlete_id is not null and s.athlete_id = p_athlete_id)
          or (p_real_team_id is not null and s.real_team_id = p_real_team_id))
    ) then
      raise exception 'That player is your Wild Slot pick. Clear the Wild Slot before moving them into the starting lineup';
    end if;
  end if;

  delete from public.lineups
  where season_franchise_id = p_season_franchise_id
    and week = p_week
    and slot = p_slot
    and slot_index = p_slot_index;

  if p_athlete_id is not null or p_real_team_id is not null then
    delete from public.lineups
    where season_franchise_id = p_season_franchise_id
      and week = p_week
      and (
        (p_athlete_id is not null and athlete_id = p_athlete_id)
        or (p_real_team_id is not null and real_team_id = p_real_team_id)
      );

    insert into public.lineups(
      season_franchise_id, week, athlete_id, real_team_id, slot, slot_index
    ) values (
      p_season_franchise_id, p_week, p_athlete_id, p_real_team_id, p_slot, p_slot_index
    );
  end if;

  insert into public.lineup_move_audit(
    league_season_id, season_franchise_id, actor_user_id, week, slot, slot_index,
    previous_athlete_id, previous_real_team_id, new_athlete_id, new_real_team_id
  ) values (
    v_league_season, p_season_franchise_id, v_user, p_week, p_slot, p_slot_index,
    v_previous_athlete, v_previous_real_team, p_athlete_id, p_real_team_id
  );

  return jsonb_build_object(
    'status', case when p_athlete_id is null and p_real_team_id is null then 'cleared' else 'set' end,
    'slot', p_slot, 'slot_index', p_slot_index, 'week', p_week
  );
end
$function$;

revoke execute on function public.set_lineup_slot(
  uuid, integer, public.lineup_slot, integer, uuid, uuid
) from public, anon;
grant execute on function public.set_lineup_slot(
  uuid, integer, public.lineup_slot, integer, uuid, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The BOUNTY waiver order, and process_due_waivers: the text of
--    20261003030000 plus one sort key that is null unless a grant is in force.
-- ---------------------------------------------------------------------------
-- The league's whole waiver order while at least one bounty grant is in force
-- at p_at. Returns NO ROWS when none is, and then nothing changes anywhere.
--
--   1. NORMAL order: every franchise of the league season by the rule
--      process_due_waivers has always used (no games played first, by draft
--      position descending; then winning percentage ascending; then points for
--      ascending), with the franchise id as the last tie-break, because here a
--      franchise has to be placed whether or not it has a claim.
--   2. Franchises holding a 'first' grant (lower seeds that won a Bounty game)
--      come first, in normal order among themselves.
--   3. Everyone else follows in normal order. Then each franchise holding an
--      'up_three' grant (higher seeds that won a Bounty game), taken in normal
--      order, moves up three places within this second group, or to the top of
--      it when fewer than three are ahead. It never passes a 'first' holder.
create or replace function public.chaos_bounty_waiver_order(p_league_season_id uuid, p_at timestamptz default now())
returns table(season_franchise_id uuid, normal_position integer, waiver_position integer, grant_kind text)
language plpgsql stable set search_path = public
as $function$
declare
  v_normal uuid[];
  v_first uuid[];
  v_up uuid[];
  v_rest uuid[];
  v_id uuid;
  v_at integer;
  v_to integer;
begin
  select array_agg(g.season_franchise_id) filter (where g.grant_kind = 'first'), array_agg(g.season_franchise_id) filter (where g.grant_kind = 'up_three')
    into v_first, v_up
  from chaos_bounty_grants g
  where g.league_season_id = p_league_season_id and g.effective_from <= p_at and p_at < g.effective_until;
  if v_first is null and v_up is null then return; end if;
  v_first := coalesce(v_first, '{}'); v_up := coalesce(v_up, '{}');

  select array_agg(sf.id order by
      case when (s.wins+s.losses+s.ties)=0 then 0 else 1 end asc,
      case when (s.wins+s.losses+s.ties)=0 then sf.draft_position end desc nulls last,
      case when (s.wins+s.losses+s.ties)>0 then (s.wins + 0.5*s.ties)::numeric/(s.wins+s.losses+s.ties) end asc nulls last,
      case when (s.wins+s.losses+s.ties)>0 then s.points_for end asc nulls last,
      sf.id asc)
    into v_normal
  from season_franchises sf
  join standings s on s.league_season_id = p_league_season_id and s.season_franchise_id = sf.id
  where sf.league_season_id = p_league_season_id;
  if v_normal is null then return; end if;

  v_first := coalesce((select array_agg(t.x order by t.ord) from unnest(v_normal) with ordinality t(x, ord) where t.x = any(v_first)), '{}');
  v_rest := coalesce((select array_agg(t.x order by t.ord) from unnest(v_normal) with ordinality t(x, ord) where t.x <> all(v_first)), '{}');
  -- A franchise plays one Chaos Week game, so it cannot hold both kinds; 'first' would win if it ever did.
  for v_id in select t.x from unnest(v_normal) with ordinality t(x, ord) where t.x = any(v_up) and t.x <> all(v_first) order by t.ord loop
    v_at := array_position(v_rest, v_id);
    v_to := greatest(1, v_at - 3);
    if v_to < v_at then
      v_rest := v_rest[1:v_to-1] || v_id || v_rest[v_to:v_at-1] || v_rest[v_at+1:];
    end if;
  end loop;

  return query
    select t.x, array_position(v_normal, t.x), t.ord::integer,
      case when t.x = any(v_first) then 'first' when t.x = any(v_up) then 'up_three' end
    from unnest(v_first || v_rest) with ordinality t(x, ord)
    order by t.ord;
end
$function$;

revoke execute on function public.chaos_bounty_waiver_order(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.chaos_bounty_waiver_order(uuid, timestamptz) to service_role;

create or replace function public.process_due_waivers(p_league_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_hold public.waiver_holds%rowtype;
  v_claim record;
  v_roster_config jsonb;
  v_roster_limit integer;
  v_active_count integer;
  v_drop_athlete uuid;
  v_drop_team uuid;
  v_period integer;
  v_league uuid;
  v_winner uuid;
  v_processed integer := 0;
  v_claimed integer := 0;
  v_integrity jsonb;
  v_override uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('waivers:' || p_league_season_id::text, 0));
  select roster_config, waiver_period_hours, league_id
    into v_roster_config, v_period, v_league
  from public.league_seasons
  where id = p_league_season_id;
  if v_league is null then raise exception 'League season not found'; end if;

  select coalesce(sum(value::int), 0) + coalesce((v_roster_config->>'bench')::int, 0)
    into v_roster_limit
  from jsonb_each_text(coalesce(v_roster_config->'starters', '{}'::jsonb));

  for v_hold in
    select *
    from public.waiver_holds
    where league_season_id = p_league_season_id
      and status = 'open'
      and clears_at <= now()
    order by clears_at, id
    for update skip locked
  loop
    v_processed := v_processed + 1;
    v_winner := null;

    if exists (
      select 1
      from public.roster_entries re
      join public.season_franchises sf on sf.id = re.season_franchise_id
      where sf.league_season_id = p_league_season_id
        and re.dropped_at is null
        and ((v_hold.athlete_id is not null and re.athlete_id = v_hold.athlete_id)
          or (v_hold.real_team_id is not null and re.real_team_id = v_hold.real_team_id))
    ) then
      update public.waiver_claims
      set status = 'failed', resolved_at = now(), failure_reason = 'Asset is no longer available'
      where waiver_hold_id = v_hold.id and status = 'pending';
      update public.waiver_holds set status = 'expired', resolved_at = now() where id = v_hold.id;
      continue;
    end if;

    for v_claim in
      with ranked as (
        select wc.*, row_number() over (order by
          -- Chaos Week BOUNTY: while a grant is in force the league's bounty order
          -- decides (chaos_bounty_waiver_order). With no grant in force that
          -- function returns no rows, this key is null for every claim, and the
          -- keys below decide exactly as before.
          bo.waiver_position asc nulls last,
          case when (s.wins+s.losses+s.ties)=0 then 0 else 1 end asc,
          case when (s.wins+s.losses+s.ties)=0 then sf.draft_position end desc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then (s.wins + 0.5*s.ties)::numeric/(s.wins+s.losses+s.ties) end asc nulls last,
          case when (s.wins+s.losses+s.ties)>0 then s.points_for end asc nulls last,
          wc.created_at asc, wc.id asc
        ) as calculated_priority
        from public.waiver_claims wc
        join public.season_franchises sf on sf.id = wc.season_franchise_id
        join public.standings s
          on s.league_season_id = p_league_season_id
         and s.season_franchise_id = wc.season_franchise_id
        left join public.chaos_bounty_waiver_order(p_league_season_id) bo
          on bo.season_franchise_id = wc.season_franchise_id
        where wc.waiver_hold_id = v_hold.id and wc.status = 'pending'
      )
      select * from ranked order by calculated_priority
    loop
      update public.waiver_claims
      set priority_rank = v_claim.calculated_priority
      where id = v_claim.id;

      select count(*) into v_active_count
      from public.roster_entries
      where season_franchise_id = v_claim.season_franchise_id and dropped_at is null;

      if v_active_count >= v_roster_limit and v_claim.drop_roster_entry_id is null then
        update public.waiver_claims
        set status = 'failed', resolved_at = now(), failure_reason = 'Roster is full and no drop was selected'
        where id = v_claim.id;
        continue;
      end if;

      v_drop_athlete := null;
      v_drop_team := null;
      if v_claim.drop_roster_entry_id is not null then
        select athlete_id, real_team_id into v_drop_athlete, v_drop_team
        from public.roster_entries
        where id = v_claim.drop_roster_entry_id
          and season_franchise_id = v_claim.season_franchise_id
          and dropped_at is null
        for update;

        if not found then
          update public.waiver_claims
          set status = 'failed', resolved_at = now(), failure_reason = 'Selected drop is no longer on roster'
          where id = v_claim.id;
          continue;
        end if;

        if public.roster_asset_game_has_started(v_claim.drop_roster_entry_id) then
          update public.waiver_claims
          set status = 'failed', resolved_at = now(),
              failure_reason = 'Selected drop is locked because their game has started'
          where id = v_claim.id;
          continue;
        end if;

        v_integrity := public.evaluate_roster_integrity_drop(v_claim.drop_roster_entry_id, 'waiver_award');
        if not coalesce((v_integrity->>'allowed')::boolean, false) then
          update public.waiver_claims
          set status = 'failed', resolved_at = now(),
              failure_reason = coalesce(v_integrity->>'message', 'Roster Integrity blocked the selected drop')
          where id = v_claim.id;
          continue;
        end if;
        if v_integrity->>'override_id' is not null then
          v_override := public.consume_roster_integrity_override(v_claim.drop_roster_entry_id);
        end if;

        delete from public.lineups l
        where l.season_franchise_id = v_claim.season_franchise_id
          and l.locked_at is null
          and not public.lineup_week_is_closed(p_league_season_id, l.week)
          and ((v_drop_athlete is not null and l.athlete_id = v_drop_athlete)
            or (v_drop_team is not null and l.real_team_id = v_drop_team));
        perform set_config('big_exec.roster_drop_context', 'waiver_award_prechecked', true);
        update public.roster_entries
        set dropped_at = now()
        where id = v_claim.drop_roster_entry_id and dropped_at is null;
        perform set_config('big_exec.roster_drop_context', '', true);
        insert into public.waiver_holds(
          league_season_id, athlete_id, real_team_id, source_roster_entry_id,
          source_season_franchise_id, clears_at
        ) values (
          p_league_season_id, v_drop_athlete, v_drop_team, v_claim.drop_roster_entry_id,
          v_claim.season_franchise_id, now() + make_interval(hours => v_period)
        );
      end if;

      insert into public.roster_entries(season_franchise_id, athlete_id, real_team_id, acquired_via)
      values (v_claim.season_franchise_id, v_hold.athlete_id, v_hold.real_team_id, 'waiver');
      v_winner := v_claim.season_franchise_id;
      update public.waiver_claims set status = 'won', resolved_at = now(), failure_reason = null where id = v_claim.id;
      update public.waiver_claims set status = 'lost', resolved_at = now() where waiver_hold_id = v_hold.id and status = 'pending' and id <> v_claim.id;
      update public.waiver_holds set status = 'claimed', claimed_by_season_franchise_id = v_winner, resolved_at = now() where id = v_hold.id;
      insert into public.league_feed_events(league_id, season_id, event_type, body, payload)
      values (v_league, p_league_season_id, 'waiver_claimed', 'Waiver claim awarded',
        jsonb_build_object('waiver_hold_id', v_hold.id, 'winner_season_franchise_id', v_winner,
          'athlete_id', v_hold.athlete_id, 'real_team_id', v_hold.real_team_id));
      v_claimed := v_claimed + 1;
      exit;
    end loop;

    if v_winner is null then
      update public.waiver_holds set status = 'expired', resolved_at = now()
      where id = v_hold.id and status = 'open';
    end if;
  end loop;

  return jsonb_build_object('status', 'ok', 'processed', v_processed, 'claimed', v_claimed);
end
$function$;

revoke execute on function public.process_due_waivers(uuid)
  from public, anon, authenticated;
grant execute on function public.process_due_waivers(uuid) to service_role;
