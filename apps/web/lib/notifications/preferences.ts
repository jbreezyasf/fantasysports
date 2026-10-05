// Notification preferences: the shape, the defaults and the one rule that decides whether a
// given user receives a given category on a given channel. Pure: no I/O, safe to import anywhere.

export const NOTIFICATION_CATEGORIES = [
  'league_announcements',
  'lineup_lock_reminder',
  'score_final',
  'trade_offer',
  'waiver_result',
  'weekly_recap'
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];

export const NOTIFICATION_CHANNELS = ['email', 'push'] as const;
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];

export const NOTIFICATION_LOCALES = ['en', 'es-419'] as const;
export type NotificationLocale = typeof NOTIFICATION_LOCALES[number];

export type NotificationPreferences = {
  emailEnabled: boolean;
  pushEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  locale: NotificationLocale;
};

// Defaults for a member with no stored row. League-operations email is on because the member
// joined a league and gave an email address. Push is off until they enable it in a browser.
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailEnabled: true,
  pushEnabled: false,
  categories: {
    league_announcements: true,
    lineup_lock_reminder: true,
    score_final: true,
    trade_offer: true,
    waiver_result: true,
    weekly_recap: true
  },
  locale: 'en'
};

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export function isNotificationLocale(value: unknown): value is NotificationLocale {
  return value === 'en' || value === 'es-419';
}

type PreferenceRow = Partial<Record<NotificationCategory | 'email_enabled' | 'push_enabled' | 'locale', unknown>> | null | undefined;

// Turns a database row (or nothing) into preferences. Anything that is not an explicit boolean
// falls back to the default, so a malformed row can never switch push on.
export function preferencesFromRow(row: PreferenceRow): NotificationPreferences {
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES;
  const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
  const categories = { ...defaults.categories };
  for (const category of NOTIFICATION_CATEGORIES) categories[category] = bool(row?.[category], defaults.categories[category]);
  const locale = row?.locale;
  return {
    emailEnabled: bool(row?.email_enabled, defaults.emailEnabled),
    pushEnabled: bool(row?.push_enabled, defaults.pushEnabled),
    categories,
    locale: isNotificationLocale(locale) ? locale : defaults.locale
  };
}

export type ChannelDecision = { deliver: true } | { deliver: false; reason: 'channel_off' | 'category_off' };

// The single preference rule. Security email (password reset, account confirmation) is sent by
// Supabase Auth and never passes through here, so no preference can block it.
export function resolveChannel(preferences: NotificationPreferences, category: NotificationCategory, channel: NotificationChannel): ChannelDecision {
  const channelOn = channel === 'email' ? preferences.emailEnabled : preferences.pushEnabled;
  if (!channelOn) return { deliver: false, reason: 'channel_off' };
  if (!preferences.categories[category]) return { deliver: false, reason: 'category_off' };
  return { deliver: true };
}
