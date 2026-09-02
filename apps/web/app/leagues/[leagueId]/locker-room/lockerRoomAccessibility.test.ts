import { describe, expect, it } from 'vitest';
import { lockerRoomMessageLabel, lockerRoomNotification } from './lockerRoomAccessibility';

describe('locker room accessibility copy', () => {
  it('labels messages with sender, time, body, reactions, and reply availability', () => {
    expect(lockerRoomMessageLabel({
      sender: 'Manager One',
      timestamp: 'Sep 1, 8:00 PM',
      body: 'Good game.',
      eventType: 'locker_room_message',
      reactions: ['clap 2']
    })).toBe('Sender Manager One. Time Sep 1, 8:00 PM. Message Good game.. Reactions: clap 2. Reply action available.');
  });

  it('announces concrete events instead of generic alerts', () => {
    expect(lockerRoomNotification({
      sender: 'Big Exec',
      timestamp: 'Sep 1, 8:00 PM',
      body: 'Weekly awards posted.',
      eventType: 'weekly_awards'
    })).toBe('weekly awards from Big Exec: Weekly awards posted.');
  });
});
