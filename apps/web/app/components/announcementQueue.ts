export type AnnouncementPriority = 'polite' | 'assertive';

export type Announcement = {
  message: string;
  priority?: AnnouncementPriority;
  key?: string;
  throttleMs?: number;
  channel?: 'default' | 'live-scoring' | 'transaction' | 'gm';
};

export type QueuedAnnouncement = Required<Pick<Announcement, 'message' | 'priority'>> & {
  key: string;
};

export const DEFAULT_ANNOUNCEMENT_THROTTLE_MS = 1500;

function normalizeAnnouncement(announcement: Announcement): QueuedAnnouncement & { throttleMs: number } {
  const message = announcement.message.trim();
  return {
    message,
    priority: announcement.priority ?? 'polite',
    key: announcement.key ?? message,
    throttleMs: announcement.throttleMs ?? DEFAULT_ANNOUNCEMENT_THROTTLE_MS,
  };
}

export class AnnouncementQueue {
  private readonly lastAnnouncedAt = new Map<string, number>();
  private readonly queuedByKey = new Map<string, QueuedAnnouncement & { readyAt: number }>();
  private gmSpeaking = false;

  setGmSpeaking(value: boolean) {
    this.gmSpeaking = value;
  }

  enqueue(announcement: Announcement, now = Date.now()) {
    const normalized = normalizeAnnouncement(announcement);
    if (!normalized.message) return null;

    const lastAt = this.lastAnnouncedAt.get(normalized.key);
    const canAnnounceNow = lastAt === undefined || now - lastAt >= normalized.throttleMs;
    const shouldHoldForGmSpeech = this.gmSpeaking && announcement.channel === 'live-scoring' && normalized.priority !== 'assertive';

    if (shouldHoldForGmSpeech) {
      this.queuedByKey.set(normalized.key, {
        message: normalized.message,
        priority: normalized.priority,
        key: normalized.key,
        readyAt: now + normalized.throttleMs,
      });
      return null;
    }

    if (normalized.priority === 'assertive' || canAnnounceNow) {
      this.lastAnnouncedAt.set(normalized.key, now);
      this.queuedByKey.delete(normalized.key);
      return {
        message: normalized.message,
        priority: normalized.priority,
        key: normalized.key,
      };
    }

    this.queuedByKey.set(normalized.key, {
      message: normalized.message,
      priority: normalized.priority,
      key: normalized.key,
      readyAt: lastAt + normalized.throttleMs,
    });
    return null;
  }

  flushDue(now = Date.now()) {
    const due = Array.from(this.queuedByKey.values())
      .filter(item => item.readyAt <= now)
      .sort((a, b) => a.readyAt - b.readyAt);

    for (const item of due) {
      this.queuedByKey.delete(item.key);
      this.lastAnnouncedAt.set(item.key, now);
    }

    return due.map(({ message, priority, key }) => ({ message, priority, key }));
  }

  clear() {
    this.queuedByKey.clear();
  }
}
