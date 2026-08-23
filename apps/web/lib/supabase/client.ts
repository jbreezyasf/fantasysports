import { createBrowserClient } from '@supabase/ssr';

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL'|'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabasePublishableKey = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
