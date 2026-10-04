// Second-half season automation: after a league's latest week is final,
// create the next week's matchups (or close the season after the finals).
//
// The season structure below is what the production functions implement
// (read 2026-10-03; see docs/qa/SECOND_HALF_RUNBOOK.md). Weeks 1-9 are created
// when the draft completes and are not handled here.
//
// The step itself runs in the database, in
// public.system_advance_fantasy_season
// (supabase/migrations/20261003060000_system_advance_fantasy_season.sql),
// because the production generators refuse any caller that is not the
// league's signed-in commissioner. That function picks the generator from the
// week; `fn` here is for reporting and is checked against the reply.
export const seasonSteps = Object.freeze({
  10: { fn: 'generate_rivalry_week', label: 'Rivalry Week' },
  11: { fn: 'generate_revenge_week', label: 'Revenge Week' },
  12: { fn: 'generate_position_week', label: 'Position Week' },
  13: { fn: 'generate_chaos_week', label: 'Chaos Week' },
  14: { fn: 'generate_judgment_week', label: 'Judgment Week' },
  15: { fn: 'initialize_postseason', label: 'Postseason seeding and Week 15' },
  16: { fn: 'generate_postseason_week16', label: 'Championship semifinals' },
  17: { fn: 'generate_postseason_week17', label: 'Championship and Redemption finals' },
  18: { fn: 'close_league_season', label: 'Season close' },
});

// OFF unless SECOND_HALF_AUTOMATION_ENABLED is exactly one of these.
export function secondHalfAutomationEnabled(env = process.env) {
  return ['1', 'true', 'on', 'yes'].includes(String(env.SECOND_HALF_AUTOMATION_ENABLED ?? '').trim().toLowerCase());
}

// The step a league season is ready for, from its matchup rows alone:
// the step after its latest scheduled week, once that whole week is final.
export function nextSeasonStep(matchups) {
  const rows = matchups ?? [];
  if (!rows.length) return { ready: false, reason: 'no matchups' };
  const latestWeek = Math.max(...rows.map(row => Number(row.week)));
  if (latestWeek < 9) return { ready: false, reason: `latest scheduled week is ${latestWeek}` };
  if (latestWeek > 17) return { ready: false, reason: `unexpected matchups in week ${latestWeek}` };
  if (rows.some(row => Number(row.week) === latestWeek && !row.is_final)) return { ready: false, reason: `week ${latestWeek} is not final` };
  return { ready: true, week: latestWeek + 1, ...seasonSteps[latestWeek + 1] };
}

const functionMissing = error => error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function|function .* does not exist/i.test(String(error?.message ?? ''));

// Advances every league season by at most one step.
//
// - Disabled (the default): touches nothing and makes no database calls.
// - Idempotent: a step is only requested when the next week has no matchups,
//   and the database functions return 'exists' if asked twice.
// - Each league season is isolated: a failure is recorded and the others are
//   still attempted. Nothing is thrown; the caller decides how to report
//   `failures`.
// - If the database function is not applied yet, nothing happens and
//   `available` is false.
export async function advanceFantasySeasons({ db, leagueSeasons, enabled = secondHalfAutomationEnabled(), log = console }) {
  if (!enabled) return { enabled: false, results: [], failures: [] };
  const results = []; const failures = []; let available = true;
  for (const leagueSeason of leagueSeasons ?? []) {
    if (!available) break;
    try {
      const { data: season, error: seasonError } = await db.from('league_seasons').select('id,status').eq('id', leagueSeason.id);
      if (seasonError) throw new Error(seasonError.message);
      if (season?.[0]?.status === 'complete') { results.push({ leagueSeasonId: leagueSeason.id, status: 'skipped', reason: 'season already complete' }); continue; }
      const { data: matchups, error: matchupsError } = await db.from('matchups').select('week,is_final').eq('league_season_id', leagueSeason.id).gte('week', 9);
      if (matchupsError) throw new Error(matchupsError.message);
      const step = nextSeasonStep(matchups);
      if (!step.ready) { results.push({ leagueSeasonId: leagueSeason.id, status: 'skipped', reason: step.reason }); continue; }
      const { data, error } = await db.rpc('system_advance_fantasy_season', { p_league_season_id: leagueSeason.id, p_week: step.week });
      if (error) {
        if (functionMissing(error)) {
          available = false;
          log.warn(JSON.stringify({ job: 'season-advance', warning: 'system-advance-function-not-applied', message: error.message, action: 'apply supabase/migrations/20261003060000_system_advance_fantasy_season.sql, or unset SECOND_HALF_AUTOMATION_ENABLED' }));
          continue;
        }
        throw new Error(error.message);
      }
      if (data?.step !== step.fn) throw new Error(`database ran ${data?.step} for week ${step.week}, expected ${step.fn}`);
      const result = { leagueSeasonId: leagueSeason.id, status: 'advanced', week: step.week, step: step.fn, label: step.label, result: data.result };
      log.log(JSON.stringify({ job: 'season-advance', ...result }));
      results.push(result);
    } catch (error) {
      const failure = { leagueSeasonId: leagueSeason.id, message: error instanceof Error ? error.message : String(error) };
      failures.push(failure);
      log.error(JSON.stringify({ job: 'season-advance', error: 'season-step-failed', ...failure }));
    }
  }
  return { enabled: true, available, results, failures };
}

// ---------------------------------------------------------------------------
// Chaos Week rule cards (docs/product/CHAOS_WEEK_RULE_CARDS.md).
// ---------------------------------------------------------------------------
export const CHAOS_WEEK = 13;
const CHAOS_MIGRATION_HINT = 'apply supabase/migrations/20261004020000_chaos_week_rule_cards.sql, or unset CHAOS_CARDS_ENABLED';

// OFF unless CHAOS_CARDS_ENABLED is exactly one of these.
export function chaosCardsEnabled(env = process.env) {
  return ['1', 'true', 'on', 'yes'].includes(String(env.CHAOS_CARDS_ENABLED ?? '').trim().toLowerCase());
}

const tableMissing = error => error?.code === '42P01' || error?.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(String(error?.message ?? ''));

const NOT_PLAYED = new Set(['canceled', 'postponed']);
const NEW_YORK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const newYorkParts = ms => Object.fromEntries(NEW_YORK.formatToParts(new Date(ms)).map(part => [part.type, part.value]));

// The deal deadline: 12:00 America/New_York on the last Tuesday before the
// first Week 13 kickoff (for a Thursday-night opener, the Tuesday of that
// week). Returns epoch milliseconds, or null for an unusable kickoff.
export function chaosDealDeadline(firstKickoff) {
  const kickoff = typeof firstKickoff === 'number' ? firstKickoff : Date.parse(firstKickoff);
  if (!Number.isFinite(kickoff)) return null;
  const local = newYorkParts(kickoff);
  // Walk back over New York calendar days from the kickoff's own day.
  for (let back = 0; back <= 7; back += 1) {
    const day = new Date(Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day) - back));
    if (day.getUTCDay() !== 2) continue;
    // Noon in New York is 16:00 or 17:00 UTC depending on daylight saving time.
    for (const utcHour of [16, 17]) {
      const candidate = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), utcHour);
      const check = newYorkParts(candidate);
      if (check.weekday === 'Tue' && check.hour === '12' && check.minute === '00' && candidate < kickoff) return candidate;
    }
  }
  return null;
}

// First kickoff of Chaos Week that is still going to be played, as the database's chaos_week_first_kickoff.
async function chaosFirstKickoff(db, leagueSeasonId) {
  const { data: season, error: seasonError } = await db.from('league_seasons').select('competition_season_id').eq('id', leagueSeasonId);
  if (seasonError) throw new Error(seasonError.message);
  const competitionSeasonId = season?.[0]?.competition_season_id;
  if (!competitionSeasonId) return null;
  const { data: games, error: gamesError } = await db.from('real_games').select('starts_at,state').eq('competition_season_id', competitionSeasonId).eq('week', CHAOS_WEEK);
  if (gamesError) throw new Error(gamesError.message);
  const starts = (games ?? []).filter(game => !NOT_PLAYED.has(String(game.state ?? '').toLowerCase())).map(game => Date.parse(game.starts_at)).filter(Number.isFinite);
  return starts.length ? Math.min(...starts) : null;
}

// Safeguard: a league season that has open Chaos Week matchups, has no deal,
// and is past the deal deadline. Returns the alert, or null. Reads only.
async function chaosDealAlert({ db, leagueSeasonId, now, reason }) {
  const kickoff = await chaosFirstKickoff(db, leagueSeasonId);
  const deadline = kickoff === null ? null : chaosDealDeadline(kickoff);
  if (deadline === null || now <= deadline) return null;
  return {
    leagueSeasonId,
    hoursUntilFirstKickoff: Math.round(((kickoff - now) / 3600e3) * 10) / 10,
    firstKickoff: new Date(kickoff).toISOString(),
    deadline: new Date(deadline).toISOString(),
    reason,
    action: kickoff > now
      ? "deal by hand as the service role: select public.deal_chaos_week_cards('<league_season_id>', 13); see docs/product/CHAOS_WEEK_RULE_CARDS.md, section 5"
      : 'Week 13 has kicked off; the database refuses to deal now, and Chaos Week is played without rule cards',
  };
}

// Deals one rule card to each open Chaos Week matchup of every league season
// that has them and has not been dealt yet. The weekly job calls this right
// after the season step, so cards are dealt in the run that generates Chaos
// Week (and also when a commissioner generated the week by hand).
//
// - Disabled (the default): touches nothing and makes no database calls.
// - The deal itself is made in the database by public.deal_chaos_week_cards
//   (supabase/migrations/20261004020000_chaos_week_rule_cards.sql): it creates
//   the seed, records every input and writes the feed event. This code only
//   decides WHEN to ask; it never picks a card.
// - Idempotent: a dealt league season is skipped, and the database function
//   returns 'exists' if asked twice.
// - Never deals after the week has kicked off (the database refuses; that is
//   reported as skipped, not as a failure).
// - Each league season is isolated; nothing is thrown.
// - DEAL DEADLINE ALERT: when a league season still has open Chaos Week
//   matchups and no deal after this run's attempt, and it is past Tuesday
//   12:00 America/New_York before the first Week 13 kickoff, one structured
//   error line is logged for it ({ job: 'chaos-cards', error:
//   'deal-deadline-missed', leagueSeasonId, hoursUntilFirstKickoff, ... }) and
//   the same object is returned in `alerts`. One line per league season per
//   run. An alert is not a failure: it never throws and never blocks scoring.
export async function dealChaosWeekCards({ db, leagueSeasons, enabled = chaosCardsEnabled(), log = console, now = Date.now() }) {
  if (!enabled) return { enabled: false, results: [], failures: [] };
  const results = []; const failures = []; const alerts = []; let available = true;
  const notApplied = error => { if (available) log.warn(JSON.stringify({ job: 'chaos-cards', warning: 'chaos-cards-migration-not-applied', message: error.message, action: CHAOS_MIGRATION_HINT })); available = false; };
  for (const leagueSeason of leagueSeasons ?? []) {
    // Set when this league season has open Chaos Week matchups and still no deal.
    let undealt = null;
    try {
      const { data: matchups, error: matchupsError } = await db.from('matchups').select('id,is_final,event_type').eq('league_season_id', leagueSeason.id).eq('week', CHAOS_WEEK);
      if (matchupsError) throw new Error(matchupsError.message);
      const chaos = (matchups ?? []).filter(row => row.event_type === 'chaos');
      if (!chaos.length) { if (available) results.push({ leagueSeasonId: leagueSeason.id, status: 'skipped', reason: 'no Chaos Week matchups' }); continue; }
      if (chaos.some(row => row.is_final)) { if (available) results.push({ leagueSeasonId: leagueSeason.id, status: 'skipped', reason: 'Chaos Week is already final' }); continue; }
      if (!available) undealt = 'the rule cards migration is not applied';
      else {
        const { data: deals, error: dealsError } = await db.from('chaos_card_deals').select('week').eq('league_season_id', leagueSeason.id).eq('week', CHAOS_WEEK);
        if (dealsError) {
          if (!tableMissing(dealsError)) { undealt = 'the deal could not be checked'; throw new Error(dealsError.message); }
          notApplied(dealsError); undealt = 'the rule cards migration is not applied';
        } else if (deals?.length) results.push({ leagueSeasonId: leagueSeason.id, status: 'skipped', reason: 'already dealt' });
        else {
          const { data, error } = await db.rpc('deal_chaos_week_cards', { p_league_season_id: leagueSeason.id, p_week: CHAOS_WEEK });
          if (error && functionMissing(error)) { notApplied(error); undealt = 'the rule cards migration is not applied'; }
          else if (error && /already kicked off/i.test(String(error.message ?? ''))) { results.push({ leagueSeasonId: leagueSeason.id, status: 'skipped', reason: 'Chaos Week has kicked off; no cards are dealt' }); undealt = 'Chaos Week kicked off before any cards were dealt'; }
          else if (error) { undealt = 'the deal failed'; throw new Error(error.message); }
          else {
            const cards = (data?.cards ?? []).map(card => ({ matchupId: card.matchup_id, cardCode: card.card_code }));
            const result = data?.status === 'dealt' ? { leagueSeasonId: leagueSeason.id, status: 'dealt', cards } : { leagueSeasonId: leagueSeason.id, status: 'skipped', reason: 'already dealt' };
            log.log(JSON.stringify({ job: 'chaos-cards', ...result }));
            results.push(result);
          }
        }
      }
    } catch (error) {
      const failure = { leagueSeasonId: leagueSeason.id, message: error instanceof Error ? error.message : String(error) };
      failures.push(failure);
      log.error(JSON.stringify({ job: 'chaos-cards', error: 'deal-failed', ...failure }));
    }
    if (!undealt) continue;
    try {
      const alert = await chaosDealAlert({ db, leagueSeasonId: leagueSeason.id, now, reason: undealt });
      if (alert) { alerts.push(alert); log.error(JSON.stringify({ job: 'chaos-cards', error: 'deal-deadline-missed', ...alert })); }
    } catch (error) {
      // The safeguard itself must never stop the job.
      log.warn(JSON.stringify({ job: 'chaos-cards', warning: 'deal-deadline-check-failed', leagueSeasonId: leagueSeason.id, message: error instanceof Error ? error.message : String(error) }));
    }
  }
  return { enabled: true, available, results, failures, alerts };
}
