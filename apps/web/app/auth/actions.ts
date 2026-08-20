'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

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

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=' + encodeURIComponent(friendlyAuthError(error.message, 'signin')) + '&next=' + encodeURIComponent(next));
  redirect(next);
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '');
  const next = safeNext(formData.get('next'));
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(next)}`
    }
  });
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
