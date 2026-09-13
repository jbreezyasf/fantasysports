#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

export async function runProviderRankingHealth() {
  const now = new Date();
  const season = Number(process.argv.find(value => value.startsWith('--season='))?.split('=')[1] ?? (now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [{ data: competition, error: competitionError }, { count: linked, error: linkError }] = await Promise.all([
  db.from('competitions').select('id').eq('code', 'pro_football').single(),
  db.from('athlete_provider_ids').select('*', { count: 'exact', head: true }).eq('provider', 'balldontlie'),
  ]);
  if (competitionError || linkError || !competition) throw new Error(competitionError?.message || linkError?.message || 'Competition not found.');
  const [{ count: eligible, error: eligibleError }, { data: values, error: valueError }] = await Promise.all([
  db.from('athletes').select('*', { count: 'exact', head: true }).eq('competition_id', competition.id).eq('active', true).in('position', ['QB', 'RB', 'WR', 'TE', 'K']),
  db.from('fantasy_player_market_values').select('athlete_id,overall_rank,projected_points,imported_at').eq('competition_id', competition.id).eq('season_year', season).eq('source', 'balldontlie').eq('scoring_format', 'half_ppr').limit(5000),
  ]);
  if (eligibleError || valueError) throw new Error(eligibleError?.message || valueError?.message);
  const latest = (values ?? []).map(row => row.imported_at).filter(Boolean).sort().at(-1) ?? null;
  const ageHours = latest ? (Date.now() - Date.parse(latest)) / 3_600_000 : Infinity;
  const ranked = (values ?? []).filter(row => row.overall_rank != null).length;
  const projected = (values ?? []).filter(row => row.projected_points != null).length;
  const coverage = eligible ? (values?.length ?? 0) / eligible : 0;
  const report = { season, eligible, linked, marketRows: values?.length ?? 0, ranked, projected, coverage: Number((coverage * 100).toFixed(1)), latest, ageHours: Number.isFinite(ageHours) ? Number(ageHours.toFixed(1)) : null };
  console.log(JSON.stringify(report, null, 2));
  if ((values?.length ?? 0) < 100 || ranked < 100 || projected < 100 || ageHours > 48) {
    throw new Error('PROVIDER RANKING HEALTH: FAIL — data is missing, sparse, or stale.');
  }
  console.log('PROVIDER RANKING HEALTH: PASS');
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runProviderRankingHealth().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
