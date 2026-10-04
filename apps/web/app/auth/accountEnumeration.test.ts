import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  signUpResult: { data: { user: null as unknown }, error: null as null | { message: string; code?: string } },
  signUpCalls: [] as Array<{ email: string }>,
  resetCalls: [] as string[],
  resetResult: { error: null as null | { message: string } }
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); }
}));

vi.mock('../../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signUp: async (input: { email: string }) => { state.signUpCalls.push(input); return state.signUpResult; },
      resetPasswordForEmail: async (email: string) => { state.resetCalls.push(email); return state.resetResult; }
    }
  })
}));

import { requestPasswordReset, signUp } from './actions';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirectOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith('REDIRECT:')) return message.slice('REDIRECT:'.length);
    throw error;
  }
  throw new Error('expected a redirect');
}

const signUpForm = () => form({ email: 'Manager@Example.com ', password: 'Str0ng!Passw0rd', display_name: 'Manager', next: '/dashboard' });

describe('sign-up does not reveal whether an email is registered', () => {
  beforeEach(() => {
    state.signUpCalls = [];
    state.resetCalls = [];
    state.resetResult = { error: null };
  });

  it('gives the same response for a new account, an obfuscated existing account and an explicit already-registered error', async () => {
    state.signUpResult = { data: { user: { id: 'new', identities: [{ id: 'identity' }] } }, error: null };
    const fresh = await redirectOf(() => signUp(signUpForm()));

    state.signUpResult = { data: { user: { id: 'obfuscated', identities: [] } }, error: null };
    const existingObfuscated = await redirectOf(() => signUp(signUpForm()));

    state.signUpResult = { data: { user: null }, error: { message: 'User already registered', code: 'user_already_exists' } };
    const existingError = await redirectOf(() => signUp(signUpForm()));

    expect(existingObfuscated).toBe(fresh);
    expect(existingError).toBe(fresh);
    expect(fresh.startsWith('/login?message=')).toBe(true);
    expect(decodeURIComponent(fresh)).not.toMatch(/already exists/i);
    expect(state.signUpCalls.map(call => call.email)).toEqual(['manager@example.com', 'manager@example.com', 'manager@example.com']);
  });

  it('still reports a weak password', async () => {
    state.signUpResult = { data: { user: null }, error: { message: 'Password should be at least 8 characters.', code: 'weak_password' } };
    const url = decodeURIComponent(await redirectOf(() => signUp(signUpForm())));
    expect(url).toContain('mode=signup');
    expect(url).toContain('Your password does not meet the security requirements');
  });

  it('rejects a badly formatted email before calling the auth provider', async () => {
    const url = decodeURIComponent(await redirectOf(() => signUp(form({ email: 'not-an-email', password: 'Str0ng!Passw0rd' }))));
    expect(url).toContain('Enter a valid email address.');
    expect(state.signUpCalls).toEqual([]);
  });

  it('gives a generic error, not an existence hint, for other provider failures', async () => {
    state.signUpResult = { data: { user: null }, error: { message: 'email rate limit exceeded' } };
    const url = decodeURIComponent(await redirectOf(() => signUp(signUpForm())));
    expect(url).toContain('We could not create your account.');
  });
});

describe('password reset does not reveal whether an email is registered', () => {
  it('gives the same response whether or not the provider reports an error', async () => {
    state.resetResult = { error: null };
    const known = await redirectOf(() => requestPasswordReset(form({ email: 'known@example.com' })));
    state.resetResult = { error: { message: 'User not found' } };
    const unknown = await redirectOf(() => requestPasswordReset(form({ email: 'unknown@example.com' })));
    const empty = await redirectOf(() => requestPasswordReset(form({ email: '' })));
    expect(unknown).toBe(known);
    expect(empty).toBe(known);
  });
});
