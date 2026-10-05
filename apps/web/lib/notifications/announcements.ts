import { isNotificationCategory, type NotificationCategory, type NotificationLocale } from './preferences';

// The "league announcement" notification: what an operator drafts and what the sender fans out.
// Pure: validation, language selection and the push payload. No I/O.

export const ANNOUNCEMENT_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const;
export type AnnouncementStatus = typeof ANNOUNCEMENT_STATUSES[number];

export const LIMITS = { title: 120, body: 8000, pushTitle: 39, pushBody: 119, link: 500 } as const;

export type AnnouncementContent = { title: string; body: string; pushTitle: string; pushBody: string };

export type AnnouncementInput = {
  leagueSeasonId: string;
  category: NotificationCategory;
  link: string | null;
  en: AnnouncementContent;
  // Optional. A member whose language has no variant gets English.
  es: AnnouncementContent | null;
};

export type Announcement = AnnouncementInput & {
  id: string;
  kind: 'league_announcement';
  status: AnnouncementStatus;
  createdBy: string | null;
  createdAt: string | null;
  sentAt: string | null;
  result: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// docs/EMAIL_SYSTEM.md template rule 7: no betting, odds, sportsbook or gambling language.
const GAMBLING = /\b(bet|bets|betting|wager|wagers|wagering|odds|sportsbook|sportsbooks|gamble|gambling|parlay|parlays|apuesta|apuestas|apostar|momios)\b/i;

export function findGamblingLanguage(text: string): string | null {
  return text.match(GAMBLING)?.[0] ?? null;
}

function contentErrors(content: AnnouncementContent, label: string): string[] {
  const errors: string[] = [];
  const check = (name: string, value: string, max: number) => {
    const length = value.trim().length;
    if (!length) errors.push(`${label} ${name} is required.`);
    else if (length > max) errors.push(`${label} ${name} is ${length} characters; the limit is ${max}.`);
  };
  check('title', content.title, LIMITS.title);
  check('body', content.body, LIMITS.body);
  check('push title', content.pushTitle, LIMITS.pushTitle);
  check('push text', content.pushBody, LIMITS.pushBody);
  const word = findGamblingLanguage([content.title, content.body, content.pushTitle, content.pushBody].join('\n'));
  if (word) errors.push(`${label} text contains "${word}". Gambling language is not allowed in Big Exec messages.`);
  return errors;
}

export function isSafeInternalLink(link: string) {
  return link.startsWith('/') && !link.startsWith('//') && !link.includes('\\') && !/[\s<>"']/.test(link) && link.length <= LIMITS.link;
}

export function validateAnnouncementInput(input: AnnouncementInput): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!UUID.test(input.leagueSeasonId)) errors.push('Choose the league season that receives this announcement.');
  if (!isNotificationCategory(input.category)) errors.push('Unknown notification category.');
  if (input.link !== null && !isSafeInternalLink(input.link)) errors.push('The link must be a path inside Big Exec that starts with "/".');
  errors.push(...contentErrors(input.en, 'English'));
  if (input.es) errors.push(...contentErrors(input.es, 'Spanish'));
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function contentFor(announcement: Pick<AnnouncementInput, 'en' | 'es'>, locale: NotificationLocale): { content: AnnouncementContent; locale: NotificationLocale } {
  if (locale === 'es-419' && announcement.es) return { content: announcement.es, locale: 'es-419' };
  return { content: announcement.en, locale: 'en' };
}

export type PushPayload = { title: string; body: string; url: string; tag: string; lang: NotificationLocale };

// What the service worker receives. `url` is always a same-origin path.
export function buildPushPayload(announcement: Pick<Announcement, 'id' | 'link' | 'en' | 'es'>, locale: NotificationLocale): PushPayload {
  const picked = contentFor(announcement, locale);
  return {
    title: picked.content.pushTitle,
    body: picked.content.pushBody,
    url: announcement.link && isSafeInternalLink(announcement.link) ? announcement.link : '/dashboard',
    tag: `announcement-${announcement.id}`,
    lang: picked.locale
  };
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function variantContent(value: unknown): AnnouncementContent | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const content = { title: text(row.title), body: text(row.body), pushTitle: text(row.push_title), pushBody: text(row.push_body) };
  return content.title && content.body && content.pushTitle && content.pushBody ? content : null;
}

export function announcementFromRow(row: Record<string, unknown>): Announcement {
  const variants = (row.variants && typeof row.variants === 'object' ? row.variants : {}) as Record<string, unknown>;
  const status = ANNOUNCEMENT_STATUSES.find(item => item === row.status) ?? 'cancelled';
  return {
    id: text(row.id),
    kind: 'league_announcement',
    leagueSeasonId: text(row.league_season_id),
    category: isNotificationCategory(row.category) ? row.category : 'league_announcements',
    link: typeof row.link === 'string' && row.link ? row.link : null,
    en: { title: text(row.title), body: text(row.body), pushTitle: text(row.push_title), pushBody: text(row.push_body) },
    es: variantContent(variants['es-419']),
    status,
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    sentAt: typeof row.sent_at === 'string' ? row.sent_at : null,
    result: row.result ?? null
  };
}

export function rowFromInput(input: AnnouncementInput) {
  const trim = (content: AnnouncementContent) => ({ title: content.title.trim(), body: content.body.trim(), push_title: content.pushTitle.trim(), push_body: content.pushBody.trim() });
  return {
    kind: 'league_announcement',
    category: input.category,
    league_season_id: input.leagueSeasonId,
    link: input.link,
    ...trim(input.en),
    variants: input.es ? { 'es-419': trim(input.es) } : {}
  };
}
