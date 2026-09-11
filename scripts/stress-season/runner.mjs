import { QA_ACTORS } from '../qa-actors.mjs';
import { loadLocalEnv, signInQaActor } from '../qa-fixture.mjs';
import { assertActionScope, readStressConfig, validateStressConfig } from './config.mjs';
import { FOOTBALL_PERSONAS } from './personas.mjs';
import { participationFor } from './schedule.mjs';
import { writeAudit } from './audit.mjs';

function arg(name, fallback = null) {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function preflight(config, validation) {
  const results = [{ check: 'static-config', ok: validation.ok, detail: validation.errors.join('; ') || validation.mode }];
  if (!validation.ok) return results;
  let expectedDraftId = null;
  for (const persona of FOOTBALL_PERSONAS) {
    try {
      const client = await signInQaActor(persona.label);
      const { data: membership, error: membershipError } = await client.from('league_members').select('league_id').eq('league_id', config.leagueId).maybeSingle();
      const { data: seasonFranchise, error: franchiseError } = await client.from('season_franchises').select('id,franchise_id,draft_position').eq('league_season_id', config.leagueSeasonId).maybeSingle();
      const { data: draft, error: draftError } = await client.from('drafts').select('id,scheduled_at,status').eq('league_season_id', config.leagueSeasonId).maybeSingle();
      expectedDraftId ??= draft?.id ?? null;
      const draftMatches = Boolean(draft) && draft.id === expectedDraftId && new Date(draft.scheduled_at).valueOf() === new Date(config.draft.startsAt).valueOf();
      const ok = !membershipError && !franchiseError && !draftError && Boolean(membership) && Boolean(seasonFranchise) && draftMatches;
      results.push({ check: `actor:${persona.label}`, ok, detail: ok ? `seat ${seasonFranchise.draft_position}; draft ${draft.status}` : membershipError?.message || franchiseError?.message || draftError?.message || 'missing seat or draft-time mismatch' });
    } catch (error) {
      results.push({ check: `actor:${persona.label}`, ok: false, detail: error.message });
    }
  }
  results.push({ check: 'human-seat', ok: false, detail: 'Must be verified through Juanita authenticated browser session before execution; harness never receives her credentials' });
  return results;
}

async function makeDraftPick(config, label, assetType, assetId) {
  const actor = QA_ACTORS.find(item => item.label === label);
  if (!actor) throw new Error(`Unknown QA actor: ${label}`);
  assertActionScope({ config, actorEmail: actor.email, leagueId: config.leagueId });
  const client = await signInQaActor(label);
  const { data: draft, error: draftError } = await client.from('drafts').select('id').eq('league_season_id', config.leagueSeasonId).single();
  if (draftError) throw draftError;
  const { data, error } = await client.rpc('make_draft_pick', { p_draft_id: draft.id, p_asset_type: assetType, p_asset_id: assetId });
  if (error) throw error;
  return data;
}

export async function main() {
  loadLocalEnv();
  const config = readStressConfig(arg('config', 'config/stress-season-2026.local.json'));
  const command = process.argv[2] || 'preflight';
  const validation = validateStressConfig(config);
  if (command === 'preflight') {
    const results = await preflight(config, validation);
    console.log(JSON.stringify({ testId: config.testId, mode: validation.mode, results }, null, 2));
    if (results.some(result => !result.ok)) process.exitCode = 1;
    return;
  }
  if (command === 'draft-plan') {
    const plan = FOOTBALL_PERSONAS.map(persona => ({ actor: persona.label, persona: persona.name, participation: participationFor({ testId: config.testId, actorLabel: persona.label, overallPick: Number(arg('pick', '1')) }) }));
    console.log(JSON.stringify({ mode: validation.mode, plan }, null, 2));
    return;
  }
  if (command === 'draft-pick') {
    const label = arg('actor');
    const assetType = arg('asset-type');
    const assetId = arg('asset-id');
    const auditPath = arg('audit', 'qa-artifacts/stress-season-2026/actions.jsonl');
    try {
      const result = await makeDraftPick(config, label, assetType, assetId);
      await writeAudit(auditPath, { testId: config.testId, leagueId: config.leagueId, actor: label, action: 'draft-pick', assetType, assetId, outcome: 'committed' });
      console.log(JSON.stringify({ ok: true, result }, null, 2));
    } catch (error) {
      await writeAudit(auditPath, { testId: config.testId, leagueId: config.leagueId, actor: label, action: 'draft-pick', assetType, assetId, outcome: 'blocked-or-failed', error: error.message });
      throw error;
    }
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}
