export const DEFAULT_PUBLIC_SUPABASE_URL = 'https://njjiqdqhmcbxblwhfade.supabase.co';
export const DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-ZgoAQmsSp2bNmrfhk11yw_BzLWKXBP';

// These are browser-safe public Supabase identifiers, not service-role secrets.
// Explicit environment values still win when configured.
export function getPublicSupabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
