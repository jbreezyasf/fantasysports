'use server';

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';

function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? '');
  return next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next'));
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/login?error=' + encodeURIComponent(error.message) + '&next=' + encodeURIComponent(next));
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
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://fantasysports-tawny.vercel.app'}/auth/confirm?next=${encodeURIComponent(next)}`
    }
  });
  if (error) redirect('/login?error=' + encodeURIComponent(error.message) + '&next=' + encodeURIComponent(next));
  redirect('/login?message=' + encodeURIComponent('Check your email to confirm your account, then sign in to continue.') + '&next=' + encodeURIComponent(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
