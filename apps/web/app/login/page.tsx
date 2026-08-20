import { signIn, signUp } from '../auth/actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const params = await searchParams;
  const next = params.next?.startsWith('/') && !params.next.startsWith('//') ? params.next : '/dashboard';
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">FRANCHISE ACCESS</p>
        <h1>Enter the league.</h1>
        {params.error && <p className="errorNotice">{params.error}</p>}
        {params.message && <p className="successNotice">{params.message}</p>}
        <form className="authForm">
          <input type="hidden" name="next" value={next} />
          <label>Manager name<input name="display_name" autoComplete="name" /></label>
          <label>Email<input name="email" type="email" required autoComplete="email" /></label>
          <label>Password<input name="password" type="password" minLength={8} required autoComplete="current-password" /></label>
          <div className="actions">
            <button className="primary" formAction={signIn}>Sign in</button>
            <button className="secondary" formAction={signUp}>Create account</button>
          </div>
        </form>
      </section>
    </main>
  );
}
