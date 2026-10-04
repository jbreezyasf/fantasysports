'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkRateLimits, clientIpFromHeaders, RATE_LIMITED_MESSAGE } from '../../lib/security/rateLimit';
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
  return mode === 'signup' ? 'We could not create your account. Please check the information and try again.' : 'We could not sign you in. Please check your information and try again.';
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// Shown for every sign-up that passes input validation, whether or not the email already has
// an account, so the response cannot be used to discover who is registered.
const SIGNUP_NEUTRAL_MESSAGE = 'Check your email to confirm your account, then sign in to continue. If you already have a Big Exec account, sign in or reset your password instead.';

function isValidEmailFormat(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAlreadyRegisteredError(error: { message?: string; code?: string }) {
  const lower = (error.message ?? '').toLowerCase();
  return error.code === 'user_already_exists' || error.code === 'email_exists' || lower.includes('already registered') || lower.includes('already been registered');
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const limit = await checkRateLimits([['authSignInByIp', clientIpFromHeaders(await headers())], ['authSignInByEmail', email]]);
  if (!limit.allowed) redirect('/login?error=' + encodeURIComponent(RATE_LIMITED_MESSAGE) + '&next=' + encodeURIComponent(next));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=' + encodeURIComponent(friendlyAuthError(error.message, 'signin')) + '&next=' + encodeURIComponent(next));
  redirect(next);
}

export async function signUp(formData: FormData) {
  const signUpLimit = await checkRateLimits([['authSignUpByIp', clientIpFromHeaders(await headers())]]);
  if (!signUpLimit.allowed) redirect('/login?mode=signup&error=' + encodeURIComponent(RATE_LIMITED_MESSAGE) + '&next=' + encodeURIComponent(safeNext(formData.get('next'))));
  const supabase = await createClient();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('display_name') ?? '');
  const next = safeNext(formData.get('next'));
  if (!isValidEmailFormat(email)) {
    redirect('/login?mode=signup&error=' + encodeURIComponent('Enter a valid email address.') + '&next=' + encodeURIComponent(next));
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(next)}`
    }
  });
  // An existing account must look exactly like a new one. Only input problems (weak password,
  // provider-side validation) surface as errors.
  if (error && !isAlreadyRegisteredError(error)) {
    redirect('/login?mode=signup&error=' + encodeURIComponent(friendlyAuthError(error.message, 'signup')) + '&next=' + encodeURIComponent(next));
  }
  redirect('/login?message=' + encodeURIComponent(SIGNUP_NEUTRAL_MESSAGE) + '&next=' + encodeURIComponent(next));
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

export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  // Same response for every email, so this limit does not reveal whether an account exists.
  const limit = await checkRateLimits([['authResetByIp', clientIpFromHeaders(await headers())], ['authResetByEmail', email]]);
  if (!limit.allowed) redirect('/login/forgot?message=' +encodeURIComponent(RATE_LIMITED_MESSAGE));
  if (email) {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent('/login/reset')}`
    });
  }
  redirect('/login/forgot?message=' + encodeURIComponent('If that email belongs to a Big Exec account, a secure reset link is on the way.'));
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');
  if (password !== confirmPassword) redirect('/login/reset?error=' + encodeURIComponent('The passwords do not match.'));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect('/login/reset?error=' + encodeURIComponent(friendlyAuthError(error.message, 'signup')));
  await supabase.auth.signOut();
  redirect('/login?message=' + encodeURIComponent('Your password was updated. Sign in with your new password.'));
}
