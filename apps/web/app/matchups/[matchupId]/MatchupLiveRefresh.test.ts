import {describe,expect,it} from 'vitest';
import {matchupFeedMessage} from './MatchupLiveRefresh';

describe('matchup feed status',()=>{
  it('does not report no games when schedule data is unavailable',()=>{
    expect(matchupFeedMessage({state:'unavailable',updatedAt:null,nextGameAt:null,now:0})).toContain('Live data delayed');
  });
  it('does not present an idle feed as stale live scoring',()=>{
    const message=matchupFeedMessage({state:'idle',updatedAt:'2026-09-14T03:00:00Z',nextGameAt:'2026-09-18T00:15:00Z',now:Date.parse('2026-09-17T12:00:00Z')});
    expect(message).toContain('No games in progress');
    expect(message).toContain('Live scoring resumes');
    expect(message).not.toContain('minutes ago');
  });
  it('shows freshness only while games are live',()=>{
    expect(matchupFeedMessage({state:'live',updatedAt:'2026-09-17T12:00:00Z',nextGameAt:null,now:Date.parse('2026-09-17T12:00:30Z')})).toContain('Updated 30s ago');
  });
});
