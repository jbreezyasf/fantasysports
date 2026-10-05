'use server';

import { revalidatePath } from 'next/cache';
import { NOTIFICATION_CATEGORIES, isNotificationLocale } from '../../../lib/notifications/preferences';
import { createClient } from '../../../lib/supabase/server';
import { N } from './strings';

export type PreferencesFormState = { status: 'idle' | 'saved' | 'error'; message: string; stamp: number };

// Saves the signed-in user's own preferences through set_notification_preferences, which
// checks auth.uid() in the database. Messages are English source strings; the page translates.
export async function saveNotificationPreferences(_previous: PreferencesFormState, formData: FormData): Promise<PreferencesFormState> {
  const stamp = Date.now();
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { status: 'error', message: N.signInAgain, stamp };

    const locale = formData.get('locale');
    const categories = Object.fromEntries(NOTIFICATION_CATEGORIES.map(category => [category, formData.get(`category_${category}`) === 'on']));
    const { error } = await supabase.rpc('set_notification_preferences', {
      p_email_enabled: formData.get('email_enabled') === 'on',
      p_push_enabled: formData.get('push_enabled') === 'on',
      p_categories: categories,
      p_locale: isNotificationLocale(locale) ? locale : 'en'
    });
    if (error) {
      console.error('[notifications] set_notification_preferences failed', error.code, error.message);
      return { status: 'error', message: N.saveError, stamp };
    }
    revalidatePath('/settings/notifications');
    return { status: 'saved', message: N.saved, stamp };
  } catch (error) {
    console.error('[notifications] saving preferences failed', error instanceof Error ? error.message : error);
    return { status: 'error', message: N.saveError, stamp };
  }
}
