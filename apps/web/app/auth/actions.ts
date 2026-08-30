'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? '');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

function appUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured || 'https://bigexecfs.com';
}

function friendlyAuthError(message: string, mode: 'signin' | 'signup') {
  const lower = message.toLowerCase();
  if (lower.includes('password should contain at least one character of each')) {
    return 'Your password needs at least one lowercase letter, one uppercase letter, one number, and one symbol.';
  }
  if (lower.includes('password') && lower.includes('least')) {
    return 'Your password does not meet the security requirements shown below.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'That email and password combination was not recognized.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }
  if (lower.includes('user already registered')) {
    return 'A Big Exec account already exists for this email. Sign in instead.';
  }
  return mode === 'signup' ? 'We could not create your account. Please check the information and try again.' : 'We could not sign you in. Please check your information and try again.';
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function existingAccountForEmail(email: string) {
  if (!email) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .schema('auth')
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.error('Existing account lookup failed', error.message);
      return false;
    }

    return (data?.length ?? 0) > 0;
  } catch (error) {
    console.error('Existing account lookup unavailable', error);
    return false;
  }
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=' + encodeURIComponent(friendlyAuthError(error.message, 'signin')) + '&next=' + encodeURIComponent(next));
  redirect(next);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '');
  const next = safeNext(formData.get('next'));
  if (await existingAccountForEmail(email)) {
    redirect('/login?error=' + encodeURIComponent('A Big Exec account already exists for this email. Please sign in.') + '&next=' + encodeURIComponent(next));
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(next)}`
    }
  });
  if (!error && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    redirect('/login?error=' + encodeURIComponent('A Big Exec account already exists for this email. Please sign in.') + '&next=' + encodeURIComponent(next));
  }
  if (error) redirect('/login?mode=signup&error=' + encodeURIComponent(friendlyAuthError(error.message, 'signup')) + '&next=' + encodeURIComponent(next));
  redirect('/login?message=' + encodeURIComponent('Check your email to confirm your account, then sign in to continue.') + '&next=' + encodeURIComponent(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export async function signOutTo(formData: FormData) {
  const supabase = await createClient();
  const next = safeNext(formData.get('next'));
  await supabase.auth.signOut();
  redirect('/login?message=' + encodeURIComponent('Sign in with the email address that received this invitation.') + '&next=' + encodeURIComponent(next));
}
