import {describe,expect,it} from 'vitest';
import {isConversationEvent,presentLockerEvent} from './lockerRoomPresentation';
const lookups={athletes:new Map([['a1','Mike Evans']]),teams:new Map([['t1','Houston D/ST']]),franchises:new Map([['sf1','High Volts']])};
describe('locker-room presentation',()=>{
  it('turns a generic autopick row into a named league moment',()=>expect(presentLockerEvent({event_type:'draft_auto_pick',body:'Draft clock expired; autopick made',payload:{athlete_id:'a1',season_franchise_id:'sf1',pick_number:19}},lookups)).toBe('High Volts landed Mike Evans at pick 19 when the clock ran out.'));
  it('keeps manager speech in the conversation',()=>{const event={event_type:'locker_room_message',body:'That matchup is mine.',payload:{}};expect(isConversationEvent(event)).toBe(true);expect(presentLockerEvent(event,lookups)).toBe('That matchup is mine.');});
});
