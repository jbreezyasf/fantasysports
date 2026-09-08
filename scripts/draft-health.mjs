#!/usr/bin/env node
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(process.cwd());

const args = new Map(process.argv.slice(2).map((arg) => {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  return match ? [match[1], match[2]] : [arg.replace(/^--/, ''), 'true'];
}));
const leagueId = args.get('league');
if (!leagueId) {
  console.error('Usage: npm run ops:draft:health -- --league=<league-id>');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: season } = await supabase.from('league_seasons').select('id,status,is_current').eq('league_id', leagueId).eq('is_current', true).maybeSingle();
const { data: draft } = season
  ? await supabase.from('drafts').select('id,status,current_pick,current_pick_deadline_at,paused_at,paused_remaining_seconds,pick_seconds,started_at,completed_at').eq('league_season_id', season.id).maybeSingle()
  : { data: null };

if (!season || !draft) {
  console.log(JSON.stringify({ leagueId, status: 'missing_current_season_or_draft' }, null, 2));
  process.exit(1);
}

const [{ data: picks }, { data: currentPick }, { data: corrections }, { data: seasonFranchises }] = await Promise.all([
  supabase.from('draft_picks').select('pick_number,season_franchise_id,athlete_id,real_team_id,picked_at,is_auto_pick').eq('draft_id', draft.id).order('pick_number'),
  supabase.from('draft_picks').select('pick_number,season_franchise_id').eq('draft_id', draft.id).eq('pick_number', draft.current_pick).maybeSingle(),
  supabase.from('draft_corrections').select('created_at,action,draft_pick_id').eq('draft_id', draft.id).order('created_at', { ascending: false }).limit(1),
  supabase.from('season_franchises').select('id,franchise_id,draft_position,franchises(name)').eq('league_season_id', season.id),
]);

const made = (picks ?? []).filter((pick) => pick.picked_at);
const lastPick = [...made].sort((a, b) => String(b.picked_at).localeCompare(String(a.picked_at)))[0] ?? null;
const lastAuto = [...made].filter((pick) => pick.is_auto_pick).sort((a, b) => String(b.picked_at).localeCompare(String(a.picked_at)))[0] ?? null;
const assetKeys = made.map((pick) => pick.athlete_id ? `athlete:${pick.athlete_id}` : `team:${pick.real_team_id}`);
const duplicateAssets = assetKeys.filter((key, index) => key && assetKeys.indexOf(key) !== index);
const sfIds = (seasonFranchises ?? []).map((sf) => sf.id);
const { data: rosterRows } = sfIds.length
  ? await supabase.from('roster_entries').select('season_franchise_id,athlete_id,real_team_id,dropped_at').in('season_franchise_id', sfIds).is('dropped_at', null)
  : { data: [] };
const rosterCounts = new Map();
for (const row of rosterRows ?? []) rosterCounts.set(row.season_franchise_id, (rosterCounts.get(row.season_franchise_id) ?? 0) + 1);
const rosterAnomalies = (seasonFranchises ?? [])
  .map((sf) => ({ seasonFranchiseId: sf.id, franchise: sf.franchises?.name ?? sf.franchise_id, activeRosterEntries: rosterCounts.get(sf.id) ?? 0 }))
  .filter((row) => row.activeRosterEntries !== 15 && draft.status === 'completed');

const currentManager = (seasonFranchises ?? []).find((sf) => sf.id === currentPick?.season_franchise_id) ?? null;
const deadlineAt = draft.current_pick_deadline_at ? new Date(draft.current_pick_deadline_at) : null;
const secondsPastDeadline = deadlineAt ? Math.max(0, Math.round((Date.now() - deadlineAt.getTime()) / 1000)) : null;
const deadlineExpiredWithoutAdvancement = draft.status === 'live' && !draft.paused_at && secondsPastDeadline !== null && secondsPastDeadline > Math.max(Number(draft.pick_seconds ?? 30) + 90, 120);

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  leagueId,
  leagueSeasonId: season.id,
  draftId: draft.id,
  draftStatus: draft.status,
  currentPickNumber: draft.current_pick,
  currentManager: currentManager ? { seasonFranchiseId: currentManager.id, draftPosition: currentManager.draft_position, franchise: currentManager.franchises?.name ?? null } : null,
  pickDeadlineAt: draft.current_pick_deadline_at,
  paused: Boolean(draft.paused_at),
  pausedAt: draft.paused_at,
  pausedRemainingSeconds: draft.paused_remaining_seconds,
  lastSuccessfulPickAt: lastPick?.picked_at ?? null,
  totalMadePicks: made.length,
  lastAutopick: lastAuto ? { pickNumber: lastAuto.pick_number, pickedAt: lastAuto.picked_at } : null,
  recentCorrectionOrUndo: corrections?.[0] ?? null,
  rosterCountAnomalies: rosterAnomalies,
  duplicateAthleteOrTeamAnomaly: duplicateAssets.length ? duplicateAssets : [],
  deadlineExpiredWithoutAdvancement,
  realtimeFreshness: 'observable through deployed Draft Room subscriptions; use qa:draft:realtime for measured proof',
}, null, 2));
