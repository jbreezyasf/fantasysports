import { describe, expect, it } from 'vitest';
import { defenseScoreDetails, playerScoreDetails } from './scoreDetails';

describe('playerScoreDetails', () => {
  it('shows raw football production and the points earned by each stat', () => {
    const details = playerScoreDetails({
      passing_yards: 216, passing_tds: 1, passing_interceptions: 1,
      rushing_yards: 30, rushing_tds: 1, receptions: 2, receiving_yards: 15
    }, null);

    expect(details).toEqual(expect.arrayContaining([
      { label: 'Passing yards', stat: '216 yards', points: 8.64 },
      { label: 'Passing touchdowns', stat: '1 TD', points: 6 },
      { label: 'Interceptions thrown', stat: '1', points: -2 },
      { label: 'Rushing yards', stat: '30 yards', points: 3 },
      { label: 'Rushing touchdowns', stat: '1 TD', points: 6 },
      { label: 'Receptions', stat: '2 catches', points: 1 },
      { label: 'Receiving yards', stat: '15 yards', points: 1.5 }
    ]));
  });

  it('falls back to stored category totals when raw provider stats are unavailable', () => {
    expect(playerScoreDetails(null, { passing: 14.64 })).toEqual([
      { label: 'Passing', stat: 'Provider category total', points: 14.64 }
    ]);
  });

  it('explains defense scoring from the underlying team stat line', () => {
    expect(defenseScoreDetails(null,{sacks:3,interceptions:1,fumble_recoveries:2,points_allowed:20})).toEqual([
      {label:'Sacks',stat:'3',points:3},
      {label:'Interceptions',stat:'1',points:2},
      {label:'Fumble recoveries',stat:'2',points:4},
      {label:'Points allowed',stat:'20 points',points:1}
    ]);
  });
});
