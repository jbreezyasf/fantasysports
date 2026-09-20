export type ScoreBreakdown = Record<string, number | string | null>;
export type RawFootballStats = Record<string, number | string | null>;

export type ScoreDetail = {
  label: string;
  stat: string;
  points: number;
  formula?: string;
};

const number = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const format = (value:number) => Number(value.toFixed(2));
const detail = (label: string, stat: string, points: number, formula?: string): ScoreDetail => ({ label, stat, points:format(points), ...(formula?{formula}:{}) });
const rateFormula=(quantity:number,unit:string,rate:number)=>`${quantity} ${unit} × ${rate} = ${format(quantity*rate).toFixed(2)}`;

export function playerScoreDetails(raw: RawFootballStats | null | undefined, summary: ScoreBreakdown | null | undefined) {
  if (!raw) {
    const labels: Record<string, string> = {
      passing: 'Passing', rushing: 'Rushing', receiving: 'Receiving', two_point: '2-point plays',
      fumbles_lost: 'Fumbles lost', special_teams_td: 'Special teams', kicking: 'Kicking'
    };
    return Object.entries(summary ?? {})
      .filter(([, value]) => number(value) !== 0)
      .map(([key, value]) => detail(labels[key] ?? key.replaceAll('_', ' '), 'Raw stat breakdown unavailable', number(value), 'Provider category total'));
  }

  const passingYards = number(raw.passing_yards);
  const passingTds = number(raw.passing_tds);
  const interceptions = number(raw.passing_interceptions);
  const rushingYards = number(raw.rushing_yards);
  const rushingTds = number(raw.rushing_tds);
  const receptions = number(raw.receptions);
  const receivingYards = number(raw.receiving_yards);
  const receivingTds = number(raw.receiving_tds);
  const twoPointConversions = number(raw.passing_2pt_conversions) + number(raw.rushing_2pt_conversions) + number(raw.receiving_2pt_conversions);
  const fumblesLost = number(raw.rushing_fumbles_lost) + number(raw.receiving_fumbles_lost) + number(raw.sack_fumbles_lost);
  const specialTeamsTds = number(raw.special_teams_tds);
  const fieldGoalsShort = number(raw.fg_made_0_19) + number(raw.fg_made_20_29) + number(raw.fg_made_30_39);
  const fieldGoals40 = number(raw.fg_made_40_49);
  const fieldGoals50 = number(raw.fg_made_50_59);
  const fieldGoals60 = number(raw.fg_made_60_);
  const extraPoints = number(raw.pat_made);

  return [
    detail('Passing yards', `${passingYards} yards`, passingYards / 25, rateFormula(passingYards,'yards',0.04)),
    detail('Passing touchdowns', `${passingTds} TD${passingTds === 1 ? '' : 's'}`, passingTds * 6, rateFormula(passingTds,'TD',6)),
    detail('Interceptions thrown', `${interceptions}`, interceptions * -2, rateFormula(interceptions,'interception',-2)),
    detail('Rushing yards', `${rushingYards} yards`, rushingYards / 10, rateFormula(rushingYards,'yards',0.1)),
    detail('Rushing touchdowns', `${rushingTds} TD${rushingTds === 1 ? '' : 's'}`, rushingTds * 6, rateFormula(rushingTds,'TD',6)),
    detail('Receptions', `${receptions} catch${receptions === 1 ? '' : 'es'}`, receptions * 0.5, rateFormula(receptions,'reception',0.5)),
    detail('Receiving yards', `${receivingYards} yards`, receivingYards / 10, rateFormula(receivingYards,'yards',0.1)),
    detail('Receiving touchdowns', `${receivingTds} TD${receivingTds === 1 ? '' : 's'}`, receivingTds * 6, rateFormula(receivingTds,'TD',6)),
    detail('2-point conversions', `${twoPointConversions}`, twoPointConversions * 2, rateFormula(twoPointConversions,'conversion',2)),
    detail('Fumbles lost', `${fumblesLost}`, fumblesLost * -2, rateFormula(fumblesLost,'fumble',-2)),
    detail('Special teams touchdowns', `${specialTeamsTds}`, specialTeamsTds * 6, rateFormula(specialTeamsTds,'TD',6)),
    detail('Field goals, 0-39 yards', `${fieldGoalsShort} made`, fieldGoalsShort * 3, rateFormula(fieldGoalsShort,'made',3)),
    detail('Field goals, 40-49 yards', `${fieldGoals40} made`, fieldGoals40 * 4, rateFormula(fieldGoals40,'made',4)),
    detail('Field goals, 50-59 yards', `${fieldGoals50} made`, fieldGoals50 * 5, rateFormula(fieldGoals50,'made',5)),
    detail('Field goals, 60+ yards', `${fieldGoals60} made`, fieldGoals60 * 6, rateFormula(fieldGoals60,'made',6)),
    detail('Extra points', `${extraPoints} made`, extraPoints, rateFormula(extraPoints,'made',1))
  ].filter(item => item.points !== 0 || !item.stat.startsWith('0'));
}

export function defenseScoreDetails(raw: RawFootballStats | null | undefined, breakdown: ScoreBreakdown | null | undefined) {
  if (breakdown || raw) {
    const sacks=number(breakdown?.sacks ?? raw?.def_sacks);
    const interceptions=number(breakdown?.interceptions ?? raw?.def_interceptions);
    const recoveries=number(breakdown?.fumble_recoveries ?? raw?.def_fumble_recoveries);
    const touchdowns=number(breakdown?.touchdowns ?? breakdown?.defensive_td ?? raw?.def_touchdowns ?? raw?.def_tds);
    const safeties=number(breakdown?.safeties ?? breakdown?.safety ?? raw?.def_safeties);
    const blockedKicks=number(breakdown?.blocked_kicks ?? breakdown?.blocked_kick) || (number(raw?.def_punt_blocks)+number(raw?.def_pat_blocks)+number(raw?.def_fg_blocks));
    const pointsAllowed=number(breakdown?.points_allowed ?? raw?.points_allowed);
    const pointsAllowedPoints=pointsAllowed===0?10:pointsAllowed<=6?7:pointsAllowed<=13?4:pointsAllowed<=20?1:pointsAllowed<=27?0:pointsAllowed<=34?-1:-4;
    return [
      detail('Sacks', `${sacks}`, sacks,rateFormula(sacks,'sack',1)),
      detail('Interceptions', `${interceptions}`, interceptions*2,rateFormula(interceptions,'interception',2)),
      detail('Fumble recoveries', `${recoveries}`, recoveries*2,rateFormula(recoveries,'recovery',2)),
      detail('Defensive touchdowns', `${touchdowns}`, touchdowns*6,rateFormula(touchdowns,'TD',6)),
      detail('Safeties', `${safeties}`, safeties*2,rateFormula(safeties,'safety',2)),
      detail('Blocked kicks', `${blockedKicks}`, blockedKicks*2,rateFormula(blockedKicks,'block',2)),
      detail('Points allowed', `${pointsAllowed} points`, pointsAllowedPoints,`${pointsAllowed} points allowed band = ${pointsAllowedPoints.toFixed(2)}`)
    ].filter(item=>item.label==='Points allowed'||item.points!==0);
  }
  return [];
}
