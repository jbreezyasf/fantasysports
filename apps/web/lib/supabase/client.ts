import { createBrowserClient } from '@supabase/ssr';
import { getPublicSupabaseConfig } from './publicConfig';

export function createClient() {
  const { url, publishableKey } = getPublicSupabaseConfig();
  return createBrowserClient(url, publishableKey);
}
