export type LockerRoomMessage = {
  sender: string;
  body: string;
  timestamp: string;
  eventType?: string | null;
  reactions?: string[];
};

export function lockerRoomMessageLabel(message: LockerRoomMessage) {
  const event = message.eventType && message.eventType !== 'locker_room_message' ? ` Event ${message.eventType.replaceAll('_', ' ')}.` : '';
  const reactions = message.reactions?.length ? ` Reactions: ${message.reactions.join(', ')}.` : ' No reactions.';
  return `Sender ${message.sender}. Time ${message.timestamp}.${event} Message ${message.body}.${reactions} Reply action available.`;
}

export function lockerRoomNotification(message: LockerRoomMessage) {
  const event = message.eventType && message.eventType !== 'locker_room_message' ? message.eventType.replaceAll('_', ' ') : 'locker room message';
  return `${event} from ${message.sender}: ${message.body}`;
}
