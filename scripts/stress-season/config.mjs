import { readFileSync } from 'node:fs';

const EXECUTION_PHRASE = 'BIG_EXEC_INTERNAL_STRESS_TEST_2026';
const FOOTBALL = 'pro_football';

export function readStressConfig(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateStressConfig(config, env = process.env, now = new Date()) {
  const errors = [];
  if (config.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (config.testId !== 'BIG_EXEC_STRESS_SEASON_2026') errors.push('testId must be BIG_EXEC_STRESS_SEASON_2026');
  if (config.sport !== FOOTBALL) errors.push('Only pro_football is implemented');
  if (config.seasonYear !== 2026) errors.push('seasonYear must be 2026');
  if (!/^[0-9a-f-]{36}$/i.test(config.leagueId || '')) errors.push('leagueId must be an explicit UUID');
  if (!/^[0-9a-f-]{36}$/i.test(config.leagueSeasonId || '')) errors.push('leagueSeasonId must be an explicit UUID');
  const humanEmails = config.humanManagerEmails ?? [config.humanManagerEmail].filter(Boolean);
  if (humanEmails.length !== 2 || !humanEmails.map(email=>email.toLowerCase()).includes('juanita.brazziel@gmail.com') || !humanEmails.map(email=>email.toLowerCase()).includes('j_brazziel@yahoo.com')) errors.push('The two human managers must be the approved Stress Test 2026 accounts');
  if (!Array.isArray(config.syntheticManagers) || config.syntheticManagers.length !== 8) errors.push('Exactly eight synthetic managers are required');
  const emails = new Set((config.syntheticManagers || []).map(manager => manager.email?.toLowerCase()));
  if (emails.size !== 8 || [...emails].some(email => !/^juanita\.brazziel\+qa-manager-0[1-8]@gmail\.com$/.test(email || ''))) errors.push('Synthetic managers must be the eight controlled QA manager accounts');
  if (Number.isNaN(new Date(config.draft?.startsAt || 'invalid').valueOf())) errors.push('draft.startsAt must be an ISO timestamp');
  if (config.draft?.timezone !== 'America/Chicago') errors.push('draft.timezone must be America/Chicago');
  const disabledAt = new Date(config.disabledAt || 'invalid');
  if (Number.isNaN(disabledAt.valueOf())) errors.push('disabledAt must be an ISO timestamp');
  if (!Number.isNaN(disabledAt.valueOf()) && now >= disabledAt) errors.push('This stress season is disabled');
  const execute = env.BIG_EXEC_STRESS_EXECUTE === EXECUTION_PHRASE;
  return { ok: errors.length === 0, errors, mode: execute ? 'execute' : 'dry-run' };
}

export function assertActionScope({ config, actorEmail, leagueId, env = process.env, now = new Date() }) {
  const validation = validateStressConfig(config, env, now);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (validation.mode !== 'execute') throw new Error(`Dry-run mode: set BIG_EXEC_STRESS_EXECUTE=${EXECUTION_PHRASE} to permit a scoped action`);
  if (leagueId !== config.leagueId) throw new Error('Action blocked outside the configured stress-test league');
  const allowed = new Set(config.syntheticManagers.map(manager => manager.email.toLowerCase()));
  if (!allowed.has(actorEmail.toLowerCase())) throw new Error('Action blocked for a non-synthetic account');
  const humans = new Set((config.humanManagerEmails ?? [config.humanManagerEmail]).filter(Boolean).map(email=>email.toLowerCase()));
  if (humans.has(actorEmail.toLowerCase())) throw new Error('Action blocked for a human manager');
}

export const stressConstants = { EXECUTION_PHRASE, FOOTBALL };
