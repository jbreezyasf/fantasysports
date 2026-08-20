import { signIn, signUp } from '../auth/actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string; mode?: string; role?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/dashboard';
  const isSignup = params.mode === 'signup';
  const isCommissioner = params.role === 'commissioner';

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">{isSignup ? 'BIG EXEC ACCESS' : 'FRANCHISE ACCESS'}</p>
        <h1>{isSignup ? 'Create your front office.' : 'Enter the league.'}</h1>
        <p className="lede">{isSignup && isCommissioner ? 'Create your manager account first. After email confirmation, you will enter the Commissioner setup and create your first league and franchise.' : isSignup ? 'Create your Big Exec manager account.' : 'Sign in to your Big Exec front office.'}</p>
        {params.error && <p className="errorNotice">{params.error}</p>}
        {params.message && <p className="successNotice">{params.message}</p>}
        <form className="authForm">
          <input type="hidden" name="next" value={next} />
          {isSignup && <label>Manager name<input name="display_name" required autoComplete="name" placeholder="How your league will know you" /></label>}
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password<input name="password" type="password" minLength={8} required autoComplete={isSignup ? 'new-password' : 'current-password'} /></label>
          <div className="actions">
            {isSignup ? (
              <>
                <button className="primary" formAction={signUp}>Create Commissioner Account</button>
                <a className="secondary" href="/login">I already have an account</a>
              </>
            ) : (
              <>
                <button className="primary" formAction={signIn}>Sign In</button>
                <a className="secondary" href="/login?mode=signup&role=commissioner">Create Commissioner Account</a>
              </>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
