import { createClient } from '@supabase/supabase-js';
import { QA_ACTORS } from '../qa-actors.mjs';
import { FOOTBALL_PERSONAS } from './personas.mjs';

const STRESS_LEAGUE_ID = 'e72ef311-1de9-4af4-a3b5-9fb1326a9c5f';
const QA_MANAGERS = QA_ACTORS.filter(actor => /^Manager0[1-8]$/.test(actor.label));
const TERMINAL = new Set(['final', 'canceled', 'postponed', 'abandoned']);
const RECENT_GAME_MS = 8 * 60 * 60 * 1000;
const MAX_POSTS_PER_MOMENT = 3;

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function resolveReactionWindow(games, now = new Date()) {
  const nowMs = now.getTime();
  const started = games.filter(game => Date.parse(game.starts_at) <= nowMs);
  const live = started.filter(game => !TERMINAL.has(String(game.state).toLowerCase()));
  if (live.length) return { phase: 'live', week: live[0].week };
  const recentFinal = started
    .filter(game => String(game.state).toLowerCase() === 'final' && nowMs - Date.parse(game.starts_at) <= RECENT_GAME_MS)
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at))[0];
  return recentFinal ? { phase: 'checkpoint', week: recentFinal.week } : null;
}

export function reactionBody({ persona, phase, week, playerName, pointsThreshold, leaderName }) {
  const moment = phase === 'live' ? `Week ${week} live check` : `Week ${week} game-night checkpoint`;
  const fact = playerName && pointsThreshold >= 10
    ? `${playerName} has crossed ${pointsThreshold} fantasy points.`
    : `${leaderName} has the early scoreboard edge.`;
  const voices = {
    Manager01: `${moment}: ${fact} The waiver wire remembers who prepared before kickoff.`,
    Manager02: `${moment}: ${fact} That production is on the film now; the matchup adjustment comes next.`,
    Manager03: `${moment}: ${fact} Somebody's trade value just changed while we were watching.`,
    Manager04: `${moment}: ${fact} Young legs, big stage. This is exactly why upside matters.`,
    Manager05: `${moment}: ${fact} Box score is talking louder than the projections now.`,
    Manager06: `${moment}: ${fact} Chaos Department recognizes beautiful disorder when it sees it.`,
    Manager07: `${moment}: ${fact} Numbers noted. Celebration remains under budget.`,
    Manager08: `${moment}: ${fact} I checked the lineup before kickoff, so naturally I am taking full credit.`
  };
  return voices[persona.label];
}

export function selectReactors(personas, week, phase, maximum = MAX_POSTS_PER_MOMENT) {
  const offset = (week + (phase === 'checkpoint' ? 3 : 0)) % personas.length;
  return Array.from({ length: Math.min(maximum, personas.length) }, (_, index) => personas[(offset + index * 3) % personas.length]);
}

async function postAsManager({ actor, body, password, url, key, leagueId }) {
  const supabase = client(url, key);
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: actor.email, password });
  if (authError || !auth.user) throw new Error(`${actor.label} sign-in failed: ${authError?.message ?? 'missing user'}`);
  const { data: existing, error: existingError } = await supabase.from('league_feed_events').select('id').eq('league_id', leagueId).eq('actor_user_id', auth.user.id).eq('event_type', 'locker_room_message').eq('body', body).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return { actor: actor.label, posted: false, reason: 'duplicate' };
  const { error } = await supabase.rpc('post_locker_room_message', { p_league_id: leagueId, p_body: body });
  if (error) throw new Error(`${actor.label} locker room: ${error.message}`);
  return { actor: actor.label, posted: true };
}

export async function runLiveQaReactions(env = process.env, now = new Date()) {
  const leagueId = env.STRESS_TEST_LEAGUE_ID || STRESS_LEAGUE_ID;
  if (leagueId !== STRESS_LEAGUE_ID) throw new Error('Live QA reactions are restricted to Stress Test 2026');
  const url = env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co';
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-ZgoAQmsSp2bNmrfhk11yw_BzLWKXBP';
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
  const admin = client(url, serviceKey);
  const { data: season, error: seasonError } = await admin.from('league_seasons').select('id,competition_season_id').eq('league_id', leagueId).eq('is_current', true).maybeSingle();
  if (seasonError || !season) throw new Error('Stress Test 2026 current season missing');
  const lowerBound = new Date(now.getTime() - RECENT_GAME_MS).toISOString();
  const { data: games, error: gamesError } = await admin.from('real_games').select('week,starts_at,state').eq('competition_season_id', season.competition_season_id).gte('starts_at', lowerBound).lte('starts_at', now.toISOString()).order('starts_at');
  if (gamesError) throw gamesError;
  const window = resolveReactionWindow(games ?? [], now);
  if (!window) return { leagueId, status: 'idle', posted: 0 };
  const password = env.QA_AUTH_PASSWORD;
  if (!password) throw new Error('QA_AUTH_PASSWORD is missing');
  const [{ data: topScores, error: scoreError }, { data: matchups, error: matchupError }] = await Promise.all([
    admin.from('fantasy_player_scores').select('points,athletes(display_name)').eq('league_season_id', season.id).eq('week', window.week).order('points', { ascending: false }).limit(1),
    admin.from('matchups').select('home_points,away_points,home:season_franchises!matchups_home_season_franchise_id_fkey(franchises(name)),away:season_franchises!matchups_away_season_franchise_id_fkey(franchises(name))').eq('league_season_id', season.id).eq('week', window.week).order('home_points', { ascending: false }).limit(10)
  ]);
  if (scoreError || matchupError) throw scoreError ?? matchupError;
  const top = topScores?.[0];
  const athlete = Array.isArray(top?.athletes) ? top.athletes[0] : top?.athletes;
  const bestMatchup = (matchups ?? []).sort((a, b) => Math.max(Number(b.home_points), Number(b.away_points)) - Math.max(Number(a.home_points), Number(a.away_points)))[0];
  const home = Array.isArray(bestMatchup?.home) ? bestMatchup.home[0] : bestMatchup?.home;
  const away = Array.isArray(bestMatchup?.away) ? bestMatchup.away[0] : bestMatchup?.away;
  const homeFranchise = Array.isArray(home?.franchises) ? home.franchises[0] : home?.franchises;
  const awayFranchise = Array.isArray(away?.franchises) ? away.franchises[0] : away?.franchises;
  const leaderName = Number(bestMatchup?.home_points ?? 0) >= Number(bestMatchup?.away_points ?? 0) ? homeFranchise?.name : awayFranchise?.name;
  const context = { phase: window.phase, week: window.week, playerName: athlete?.display_name, pointsThreshold: Math.floor(Number(top?.points ?? 0) / 5) * 5, leaderName: leaderName ?? 'The current leader' };
  const reactors = selectReactors(FOOTBALL_PERSONAS, window.week, window.phase);
  const results = await Promise.allSettled(reactors.map(persona => {
    const actor = QA_MANAGERS.find(item => item.label === persona.label);
    return postAsManager({ actor, body: reactionBody({ persona, ...context }), password, url, key: publishableKey, leagueId });
  }));
  const normalized = results.map((result, index) => result.status === 'fulfilled' ? result.value : { actor: reactors[index].label, posted: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  if (results.some(result => result.status === 'rejected')) throw new Error(`One or more live QA reactions failed: ${JSON.stringify(normalized)}`);
  return { leagueId, week: window.week, phase: window.phase, posted: normalized.filter(item => item.posted).length, managers: normalized };
}

