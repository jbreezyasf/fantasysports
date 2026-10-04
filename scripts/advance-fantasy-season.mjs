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
