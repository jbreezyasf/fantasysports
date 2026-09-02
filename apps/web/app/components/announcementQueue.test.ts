import { describe, expect, it } from 'vitest';
import { AnnouncementQueue, DEFAULT_ANNOUNCEMENT_THROTTLE_MS } from './announcementQueue';

describe('AnnouncementQueue', () => {
  it('announces the first polite message immediately', () => {
    const queue = new AnnouncementQueue();

    expect(queue.enqueue({ message: 'Waiver claim submitted', key: 'waiver-submitted' }, 1000)).toEqual({
      message: 'Waiver claim submitted',
      priority: 'polite',
      key: 'waiver-submitted',
    });
  });

  it('throttles repeated polite updates and keeps the latest message', () => {
    const queue = new AnnouncementQueue();

    expect(queue.enqueue({ message: 'Draft clock 59 seconds', key: 'draft-clock', throttleMs: 10_000 }, 1000)).not.toBeNull();
    expect(queue.enqueue({ message: 'Draft clock 58 seconds', key: 'draft-clock', throttleMs: 10_000 }, 1500)).toBeNull();
    expect(queue.enqueue({ message: 'Draft clock 57 seconds', key: 'draft-clock', throttleMs: 10_000 }, 2000)).toBeNull();

    expect(queue.flushDue(10_999)).toEqual([]);
    expect(queue.flushDue(11_000)).toEqual([
      {
        message: 'Draft clock 57 seconds',
        priority: 'polite',
        key: 'draft-clock',
      },
    ]);
  });

  it('lets assertive critical feedback interrupt throttling', () => {
    const queue = new AnnouncementQueue();

    expect(queue.enqueue({ message: 'Lineup saved', key: 'lineup' }, 1000)).not.toBeNull();
    expect(queue.enqueue({ message: 'Lineup invalid', priority: 'assertive', key: 'lineup' }, 1100)).toEqual({
      message: 'Lineup invalid',
      priority: 'assertive',
      key: 'lineup',
    });
  });

  it('uses a default throttle window for repeated messages', () => {
    const queue = new AnnouncementQueue();

    queue.enqueue({ message: 'Trade received', key: 'trade' }, 1000);
    expect(queue.enqueue({ message: 'Trade received again', key: 'trade' }, 1000 + DEFAULT_ANNOUNCEMENT_THROTTLE_MS - 1)).toBeNull();
    expect(queue.flushDue(1000 + DEFAULT_ANNOUNCEMENT_THROTTLE_MS)).toEqual([
      {
        message: 'Trade received again',
        priority: 'polite',
        key: 'trade',
      },
    ]);
  });

  it('ignores empty announcement text', () => {
    const queue = new AnnouncementQueue();

    expect(queue.enqueue({ message: '   ', key: 'empty' }, 1000)).toBeNull();
  });

  it('holds live-scoring announcements while GM speech is active', () => {
    const queue = new AnnouncementQueue();

    queue.setGmSpeaking(true);
    expect(queue.enqueue({ message: 'Score changed', key: 'matchup-score-1', channel: 'live-scoring', throttleMs: 2000 }, 1000)).toBeNull();
    expect(queue.flushDue(2999)).toEqual([]);
    queue.setGmSpeaking(false);
    expect(queue.flushDue(3000)).toEqual([
      {
        message: 'Score changed',
        priority: 'polite',
        key: 'matchup-score-1',
      },
    ]);
  });

  it('does not hold assertive critical announcements while GM speech is active', () => {
    const queue = new AnnouncementQueue();

    queue.setGmSpeaking(true);
    expect(queue.enqueue({ message: 'Confirm waiver claim before submitting', priority: 'assertive', key: 'waiver-confirm', channel: 'transaction' }, 1000)).toEqual({
      message: 'Confirm waiver claim before submitting',
      priority: 'assertive',
      key: 'waiver-confirm',
    });
  });
});
