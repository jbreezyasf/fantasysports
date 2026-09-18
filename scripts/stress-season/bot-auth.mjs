import { createClient } from '@supabase/supabase-js';

const QA_EMAIL = /^juanita\.brazziel\+qa-manager-0[1-8]@gmail\.com$/i;

export function qaClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticateQaActor({ admin, actor, url, publishableKey }) {
  if (!QA_EMAIL.test(actor.email)) throw new Error(`Authentication blocked for non-QA actor ${actor.label}`);
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: actor.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) throw new Error(`${actor.label} one-time session failed: ${linkError?.message ?? 'missing token hash'}`);
  const supabase = qaClient(url, publishableKey);
  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (verifyError || verified.user?.email?.toLowerCase() !== actor.email.toLowerCase()) throw new Error(`${actor.label} session verification failed: ${verifyError?.message ?? 'identity mismatch'}`);
  return supabase;
}

