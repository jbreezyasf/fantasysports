import 'server-only';
import { createClient } from '@supabase/supabase-js';

// This privileged client must only be imported by server actions and server components.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured for this deployment.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
