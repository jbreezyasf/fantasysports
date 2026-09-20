import { describe, expect, it } from 'vitest';
import { defenseScoreDetails, playerScoreDetails } from './scoreDetails';

describe('playerScoreDetails', () => {
  it('shows raw football production and the points earned by each stat', () => {
    const details = playerScoreDetails({
      passing_yards: 216, passing_tds: 1, passing_interceptions: 1,
      rushing_yards: 30, rushing_tds: 1, receptions: 2, receiving_yards: 15
    }, null);

    expect(details).toEqual(expect.arrayContaining([
      { label: 'Passing yards', stat: '216 yards', points: 8.64, formula: '216 yards × 0.04 = 8.64' },
      expect.objectContaining({ label: 'Passing touchdowns', stat: '1 TD', points: 6 }),
      expect.objectContaining({ label: 'Interceptions thrown', stat: '1', points: -2 }),
      expect.objectContaining({ label: 'Rushing yards', stat: '30 yards', points: 3 }),
      expect.objectContaining({ label: 'Rushing touchdowns', stat: '1 TD', points: 6 }),
      expect.objectContaining({ label: 'Receptions', stat: '2 catches', points: 1 }),
      expect.objectContaining({ label: 'Receiving yards', stat: '15 yards', points: 1.5 })
    ]));
  });

  it('reconciles the live Henry and Pollard fixtures', () => {
    expect(playerScoreDetails({rushing_yards:8},null)).toEqual([expect.objectContaining({label:'Rushing yards',points:0.8,formula:'8 yards × 0.1 = 0.80'})]);
    const pollard=playerScoreDetails({rushing_yards:-2,receiving_yards:1,receptions:1},null);
    expect(pollard).toEqual(expect.arrayContaining([
      expect.objectContaining({label:'Rushing yards',points:-0.2}),
      expect.objectContaining({label:'Receiving yards',points:0.1}),
      expect.objectContaining({label:'Receptions',points:0.5})
    ]));
    expect(pollard.reduce((sum,row)=>sum+row.points,0)).toBeCloseTo(0.4);
  });

  it('falls back to stored category totals when raw provider stats are unavailable', () => {
    expect(playerScoreDetails(null, { passing: 14.64 })).toEqual([
      { label: 'Passing', stat: 'Raw stat breakdown unavailable', points: 14.64, formula: 'Provider category total' }
    ]);
  });

  it('explains defense scoring from the underlying team stat line', () => {
    expect(defenseScoreDetails(null,{sacks:3,interceptions:1,fumble_recoveries:2,points_allowed:20})).toEqual([
      expect.objectContaining({label:'Sacks',stat:'3',points:3}),
      expect.objectContaining({label:'Interceptions',stat:'1',points:2}),
      expect.objectContaining({label:'Fumble recoveries',stat:'2',points:4}),
      expect.objectContaining({label:'Points allowed',stat:'20 points',points:1})
    ]);
  });
});
