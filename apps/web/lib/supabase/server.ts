import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL'|'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabasePublishableKey = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot always write cookies; a later middleware can refresh sessions.
          }
        }
      }
    }
  );
}
