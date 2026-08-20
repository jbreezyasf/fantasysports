import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://njjiqdqhmcbxblwhfade.supabase.co';
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-ZgoAQmsSp2bNmrfhk11yw_BzLWKXBP';

export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}
