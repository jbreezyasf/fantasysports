import { signIn, signUp } from '../auth/actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string; mode?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/dashboard';
  const isSignup = params.mode === 'signup';
  const encodedNext = encodeURIComponent(next);

  return (
    <main>
      <section className="panel">
        <p className="eyebrow">{isSignup ? 'BIG EXEC ACCESS' : 'FRANCHISE ACCESS'}</p>
        <h1>{isSignup ? 'Create your front office.' : 'Enter the league.'}</h1>
        <p className="lede">{isSignup ? 'Create one Big Exec account. You can create leagues, join leagues, and hold different roles in different leagues.' : 'Sign in to your Big Exec front office.'}</p>
        {params.error && <p className="errorNotice" role="alert">{params.error}</p>}
        {params.message && <p className="successNotice" role="status">{params.message}</p>}
        <form className="authForm">
          <input type="hidden" name="next" value={next} />
          {isSignup && <label>Manager name<input name="display_name" required autoComplete="name" placeholder="How your league will know you" /></label>}
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>
            Password
            <input name="password" type="password" minLength={8} required autoComplete={isSignup ? 'new-password' : 'current-password'} aria-describedby={isSignup ? 'password-help' : undefined} />
          </label>
          {isSignup && (
            <div id="password-help" className="passwordHelp">
              <strong>Password requirements</strong>
              <span>Use at least 8 characters with:</span>
              <ul>
                <li>1 uppercase letter</li>
                <li>1 lowercase letter</li>
                <li>1 number</li>
                <li>1 symbol, such as ! @ # $ %</li>
              </ul>
            </div>
          )}
          <div className="actions">
            {isSignup ? (
              <>
                <button className="primary" formAction={signUp}>Create Big Exec Account</button>
                <a className="secondary" href={`/login?next=${encodedNext}`}>I already have an account</a>
              </>
            ) : (
              <>
                <button className="primary" formAction={signIn}>Sign In</button>
                <a className="secondary" href={`/login?mode=signup&next=${encodedNext}`}>Create Big Exec Account</a>
              </>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
