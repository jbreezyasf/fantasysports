import { LIMITS, type AnnouncementInput } from '../../../lib/notifications/announcements';
import type { LeagueSeasonOption } from '../../../lib/notifications/store';
import styles from '../../settings/notifications/notifications.module.css';

// The draft form fields, shared by "new draft" and "edit draft".
export default function AnnouncementFields({ idPrefix, value, leagueSeasons, readOnly = false }: { idPrefix: string; value: AnnouncementInput | null; leagueSeasons: LeagueSeasonOption[]; readOnly?: boolean }) {
  const language = (key: 'en' | 'es', label: string, lang: string, required: boolean) => {
    const content = value?.[key];
    const id = (name: string) => `${idPrefix}-${key}-${name}`;
    return (
      <fieldset className={styles.group}>
        <legend>{label}</legend>
        <div className={styles.field}>
          <label htmlFor={id('title')}>Title (email subject and heading)</label>
          <input id={id('title')} name={`${key}_title`} type="text" lang={lang} maxLength={LIMITS.title} defaultValue={content?.title ?? ''} required={required} readOnly={readOnly} />
        </div>
        <div className={styles.field}>
          <label htmlFor={id('body')}>Body</label>
          <textarea id={id('body')} name={`${key}_body`} lang={lang} maxLength={LIMITS.body} defaultValue={content?.body ?? ''} required={required} readOnly={readOnly} aria-describedby={`${idPrefix}-format-hint`} />
        </div>
        <div className={styles.field}>
          <label htmlFor={id('push-title')}>Push title (up to {LIMITS.pushTitle} characters)</label>
          <input id={id('push-title')} name={`${key}_push_title`} type="text" lang={lang} maxLength={LIMITS.pushTitle} defaultValue={content?.pushTitle ?? ''} required={required} readOnly={readOnly} />
        </div>
        <div className={styles.field}>
          <label htmlFor={id('push-body')}>Push text (up to {LIMITS.pushBody} characters)</label>
          <input id={id('push-body')} name={`${key}_push_body`} type="text" lang={lang} maxLength={LIMITS.pushBody} defaultValue={content?.pushBody ?? ''} required={required} readOnly={readOnly} />
        </div>
      </fieldset>
    );
  };

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-season`}>Audience: members of this league (current season)</label>
        <select id={`${idPrefix}-season`} name="league_season_id" defaultValue={value?.leagueSeasonId ?? ''} required disabled={readOnly}>
          <option value="" disabled>Choose a league</option>
          {leagueSeasons.map(option => <option key={option.leagueSeasonId} value={option.leagueSeasonId}>{option.leagueName}</option>)}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor={`${idPrefix}-link`}>Link inside Big Exec (optional, starts with /)</label>
        <input id={`${idPrefix}-link`} name="link" type="text" maxLength={LIMITS.link} defaultValue={value?.link ?? ''} placeholder="/dashboard" readOnly={readOnly} />
      </div>
      <p id={`${idPrefix}-format-hint`} className={styles.hint}>Body formatting: a blank line starts a paragraph, a line starting with &quot;## &quot; is a heading, a line starting with &quot;- &quot; is a list item, and **text** is bold. Nothing else is formatted; HTML is shown as plain text.</p>
      {language('en', 'English', 'en', true)}
      {language('es', 'Spanish (optional; members who chose Spanish get English if this is empty)', 'es-419', false)}
    </>
  );
}
