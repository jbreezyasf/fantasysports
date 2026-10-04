import {describe,expect,it} from 'vitest';
import {isConversationEvent,presentLockerEvent} from './lockerRoomPresentation';
const lookups={athletes:new Map([['a1','Mike Evans']]),teams:new Map([['t1','Houston D/ST']]),franchises:new Map([['sf1','High Volts']])};
describe('locker-room presentation',()=>{
  it('turns a generic autopick row into a named league moment',()=>expect(presentLockerEvent({event_type:'draft_auto_pick',body:'Draft clock expired; autopick made',payload:{athlete_id:'a1',season_franchise_id:'sf1',pick_number:19}},lookups)).toBe('High Volts landed Mike Evans at pick 19 when the clock ran out.'));
  it('explains a postseason result decided by the Chaos Clause',()=>{
    const payload={matchup_id:'m1',home_points:100,away_points:100,winner_season_franchise_id:'sf1',chaos_clause:{rule:'chaos_clause',version:1,decided_by:'chaos_week',winner_season_franchise_id:'sf1',steps:[{step:'chaos_week',week:13,home:118.25,away:131.4,outcome:'away'}]}};
    expect(presentLockerEvent({event_type:'matchup_final',body:'Matchup final',payload},lookups)).toBe('Matchup final, level on points. High Volts wins. Decided by the Chaos Clause: 131.40 to 118.25 in Chaos Week.');
    expect(presentLockerEvent({event_type:'matchup_final',body:'Matchup final',payload:{matchup_id:'m1',winner_season_franchise_id:'sf1'}},lookups)).toBe('Matchup final');
  });
  it('keeps manager speech in the conversation',()=>{const event={event_type:'locker_room_message',body:'That matchup is mine.',payload:{}};expect(isConversationEvent(event)).toBe(true);expect(presentLockerEvent(event,lookups)).toBe('That matchup is mine.');});
});
