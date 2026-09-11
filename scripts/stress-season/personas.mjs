const base = { sport: 'pro_football', competence: 'capable_not_omniscient', allowMissedChecks: true, prohibitedTargets: ['human_account_control', 'commissioner_actions', 'direct_database_writes'] };

export const FOOTBALL_PERSONAS = [
  ['Manager01', 'The Waiver Hawk', 'aggressive', 'balanced', 'quick, smug, never personal'],
  ['Manager02', 'The Film Grinder', 'medium', 'matchup', 'specific player jokes'],
  ['Manager03', 'The Deal Maker', 'medium', 'sell_high', 'always pitching a deal'],
  ['Manager04', 'The Rookie Believer', 'medium', 'youth_upside', 'bold future-tense claims'],
  ['Manager05', 'The Old Head', 'low', 'veteran_floor', 'favorite-uncle sarcasm'],
  ['Manager06', 'The Chaos Agent', 'high', 'volatile_upside', 'loud after upsets'],
  ['Manager07', 'The Quiet Accountant', 'low', 'value', 'rare and dry'],
  ['Manager08', 'The Sunday Scrambler', 'medium', 'weekly_matchup', 'late but confident'],
  ['Manager09', 'The Rival', 'high', 'exploit_opponent_need', 'competitive and playful'],
].map(([label, name, risk, strategy, trashTalk]) => ({ ...base, label, name, risk, strategy, trashTalk }));

export function personaFor(label) {
  const persona = FOOTBALL_PERSONAS.find(item => item.label === label);
  if (!persona) throw new Error(`Unknown football stress persona: ${label}`);
  return persona;
}
