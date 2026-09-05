import type { BalldontlieNflPlayer } from './balldontlie';

const statAliases: Record<string, string[]> = {
  passingYards: ['passing_yards', 'pass_yards', 'yards_passing'],
  passingTouchdowns: ['passing_touchdowns', 'passing_tds', 'pass_touchdowns', 'pass_tds'],
  interceptions: ['interceptions', 'passing_interceptions', 'interceptions_thrown'],
  rushingYards: ['rushing_yards', 'rush_yards', 'yards_rushing'],
  rushingTouchdowns: ['rushing_touchdowns', 'rushing_tds', 'rush_touchdowns', 'rush_tds'],
  receptions: ['receptions', 'receiving_receptions'],
  receivingYards: ['receiving_yards', 'rec_yards', 'yards_receiving'],
  receivingTouchdowns: ['receiving_touchdowns', 'receiving_tds', 'rec_touchdowns', 'rec_tds'],
  twoPointConversions: ['two_point_conversions', 'two_pt_conversions', 'two_point_conversion_successes'],
  fumblesLost: ['fumbles_lost', 'lost_fumbles'],
  fieldGoals19: ['field_goals_made_1_19', 'field_goals_made_19'],
  fieldGoals29: ['field_goals_made_20_29', 'field_goals_made_29'],
  fieldGoals39: ['field_goals_made_30_39', 'field_goals_made_39'],
  fieldGoals49: ['field_goals_made_40_49', 'field_goals_made_49'],
  fieldGoals50: ['field_goals_made_50', 'field_goals_made_50_plus'],
  extraPoints: ['extra_points_made', 'pat_made'],
  sacks: ['sacks'],
  safeties: ['safeties'],
  defensiveTouchdowns: ['defensive_touchdowns', 'defense_touchdowns'],
  specialTeamsTouchdowns: ['special_teams_touchdowns', 'return_touchdowns'],
  fumblesRecovered: ['fumbles_recovered', 'defensive_fumbles_recovered'],
  pointsAllowed: ['points_allowed'],
};

export function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function readStat(row: Record<string, unknown>, key: keyof typeof statAliases) {
  for (const alias of statAliases[key]) {
    if (row[alias] !== undefined && row[alias] !== null) return numberValue(row[alias]);
  }
  return 0;
}

export function normalizeNflPosition(value?: string | null) {
  const position = value?.trim().toUpperCase();
  if (position === 'DST' || position === 'DEF') return 'D/ST';
  if (position === 'PK') return 'K';
  return position ?? '';
}

export function normalizeNflTeamAlias(value?: string | null) {
  const alias = value?.trim().toUpperCase();
  if (alias === 'JAC') return 'JAX';
  if (alias === 'WSH') return 'WAS';
  if (alias === 'LAR') return 'LA';
  return alias ?? '';
}

export function balldontliePlayerName(player?: BalldontlieNflPlayer | null) {
  return [player?.first_name, player?.last_name].filter(Boolean).join(' ').trim();
}

export function balldontliePlayerFantasyPoints(row: Record<string, unknown>) {
  return Math.round((
    readStat(row, 'passingYards') / 25
    + readStat(row, 'passingTouchdowns') * 6
    - readStat(row, 'interceptions') * 2
    + readStat(row, 'rushingYards') / 10
    + readStat(row, 'rushingTouchdowns') * 6
    + readStat(row, 'receptions') * 0.5
    + readStat(row, 'receivingYards') / 10
    + readStat(row, 'receivingTouchdowns') * 6
    + readStat(row, 'twoPointConversions') * 2
    - readStat(row, 'fumblesLost') * 2
    + readStat(row, 'fieldGoals19') * 3
    + readStat(row, 'fieldGoals29') * 3
    + readStat(row, 'fieldGoals39') * 3
    + readStat(row, 'fieldGoals49') * 4
    + readStat(row, 'fieldGoals50') * 5
    + readStat(row, 'extraPoints')
  ) * 100) / 100;
}

export function balldontlieDefenseFantasyPoints(row: Record<string, unknown>) {
  const pointsAllowed = readStat(row, 'pointsAllowed');
  const pointsAllowedScore =
    pointsAllowed <= 0 ? 10 :
    pointsAllowed <= 6 ? 7 :
    pointsAllowed <= 13 ? 4 :
    pointsAllowed <= 20 ? 1 :
    pointsAllowed <= 27 ? 0 :
    pointsAllowed <= 34 ? -1 : -4;
  return Math.round((
    readStat(row, 'sacks')
    + readStat(row, 'interceptions') * 2
    + readStat(row, 'fumblesRecovered') * 2
    + readStat(row, 'safeties') * 2
    + readStat(row, 'defensiveTouchdowns') * 6
    + readStat(row, 'specialTeamsTouchdowns') * 6
    + pointsAllowedScore
  ) * 100) / 100;
}
