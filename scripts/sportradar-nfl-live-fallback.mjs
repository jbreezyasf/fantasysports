const number = value => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeAlias = value => ({ JAC: 'JAX', LA: 'LAR', WAS: 'WSH' }[String(value ?? '').toUpperCase()] ?? String(value ?? '').toUpperCase());
const normalizeName = value => String(value ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
const namePositionKey = (name, position) => `${normalizeName(name)}|${String(position ?? '').toUpperCase()}`;

export function canonicalSportradarPlayerStats(player) {
  const stats = player?.statistics ?? {};
  const passing = stats.passing ?? {};
  const rushing = stats.rushing ?? {};
  const receiving = stats.receiving ?? {};
  const fumbles = stats.fumbles ?? {};
  const returns = stats.kick_returns ?? stats.returns ?? {};
  const puntReturns = stats.punt_returns ?? {};
  const fieldGoals = stats.field_goals ?? {};
  const kicks = stats.extra_points?.kicks ?? stats.extra_points ?? {};
  const conversions = stats.conversions ?? {};
  return {
    ...stats,
    passing_yards: number(passing.yards),
    passing_tds: number(passing.touchdowns),
    passing_interceptions: number(passing.interceptions),
    rushing_yards: number(rushing.yards),
    rushing_tds: number(rushing.touchdowns),
    receptions: number(receiving.receptions),
    receiving_yards: number(receiving.yards),
    receiving_tds: number(receiving.touchdowns),
    passing_2pt_conversions: number(conversions.pass_successes),
    rushing_2pt_conversions: number(conversions.rush_successes),
    receiving_2pt_conversions: number(conversions.receive_successes),
    rushing_fumbles_lost: number(fumbles.lost_fumbles),
    receiving_fumbles_lost: 0,
    sack_fumbles_lost: 0,
    special_teams_tds: number(returns.touchdowns) + number(puntReturns.touchdowns),
    fg_made_0_19: number(fieldGoals.made_19),
    fg_made_20_29: number(fieldGoals.made_29),
    fg_made_30_39: number(fieldGoals.made_39),
    fg_made_40_49: number(fieldGoals.made_49),
    fg_made_50_59: number(fieldGoals.made_50),
    fg_made_60_: number(fieldGoals.made_60),
    pat_made: number(kicks.made),
    _fallback_provider: 'sportradar',
  };
}

export function sportradarGamePlayers(payload) {
  return ['home', 'away'].flatMap(side => {
    const team = payload?.statistics?.[side]?.team ?? payload?.[side] ?? {};
    return (payload?.statistics?.[side]?.players ?? []).map(player => ({
      ...player,
      team_alias: normalizeAlias(team.alias),
    }));
  });
}

export async function importSportradarFallback({ db, season, week, activeGames, gameByProvider, ingestedAt, timeoutMs = 15_000 }) {
  const apiKey = process.env.SPORTS_DATA_API_KEY || process.env.NFL_API || process.env.sportradar;
  if (!apiKey) return { enabled: false, games: 0, playerStats: 0, requests: 0, reason: 'credential unavailable' };
  const accessLevel = process.env.SPORTRADAR_ACCESS_LEVEL || 'trial';
  const configuredBase = process.env.SPORTS_DATA_BASE_URL?.includes('sportradar') ? process.env.SPORTS_DATA_BASE_URL : '';
  const baseUrl = (configuredBase || `https://api.sportradar.com/nfl/official/${accessLevel}/v7/en`).replace(/\/$/, '');
  let requests = 0;
  let lastRequestAt = 0;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function get(path) {
    const wait = 1_250 - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json', 'x-api-key': apiKey },
      signal: AbortSignal.timeout(timeoutMs),
    });
    requests += 1;
    if (!response.ok) throw new Error(`Sportradar ${response.status} for ${path}`);
    return response.json();
  }

  const schedule = await get(`/games/${season}/REG/${week}/schedule.json`);
  const radarGames = schedule.week?.games ?? schedule.games ?? [];
  const [{ data: links, error: linksError }, { data: athletes, error: athletesError }] = await Promise.all([
    db.from('athlete_provider_ids').select('athlete_id,provider_athlete_id').eq('provider', 'sportradar').range(0, 10000),
    db.from('athletes').select('id,display_name,position').eq('active', true).range(0, 10000),
  ]);
  if (linksError || athletesError) throw new Error(linksError?.message || athletesError?.message);
  const athleteByProvider = new Map((links ?? []).map(row => [String(row.provider_athlete_id), row.athlete_id]));
  const athleteByIdentity = new Map();
  const ambiguous = new Set();
  for (const athlete of athletes ?? []) {
    const key = namePositionKey(athlete.display_name, athlete.position);
    if (athleteByIdentity.has(key)) ambiguous.add(key);
    else athleteByIdentity.set(key, athlete.id);
  }
  for (const key of ambiguous) athleteByIdentity.delete(key);

  const values = [];
  let matchedGames = 0;
  for (const game of activeGames) {
    const home = normalizeAlias(game.home_team?.abbreviation);
    const away = normalizeAlias(game.visitor_team?.abbreviation);
    const radarGame = radarGames.find(candidate =>
      normalizeAlias(candidate.home?.alias) === home && normalizeAlias(candidate.away?.alias) === away);
    if (!radarGame?.id) continue;
    const payload = await get(`/games/${encodeURIComponent(radarGame.id)}/statistics.json`);
    matchedGames += 1;
    const gameId = gameByProvider.get(String(game.id));
    if (!gameId) continue;
    for (const player of sportradarGamePlayers(payload)) {
      const position = String(player.position ?? '').toUpperCase();
      if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) continue;
      const athleteId = athleteByProvider.get(String(player.id)) ?? athleteByIdentity.get(namePositionKey(player.name ?? player.full_name, position));
      if (!athleteId) continue;
      values.push({
        athlete_id: athleteId,
        game_id: gameId,
        raw_stats: canonicalSportradarPlayerStats(player),
        source_provider: 'balldontlie',
        source_updated_at: payload.updated_at ?? null,
        ingested_at: ingestedAt,
      });
    }
  }
  if (values.length) {
    const { error } = await db.from('athlete_game_stats').upsert(values, { onConflict: 'athlete_id,game_id,source_provider' });
    if (error) throw new Error(error.message);
  }
  return { enabled: true, games: matchedGames, playerStats: values.length, requests };
}
