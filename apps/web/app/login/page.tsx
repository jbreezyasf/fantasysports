import { signIn, signUp } from '../auth/actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams;
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">FRANCHISE ACCESS</p>
        <h1>Enter the league.</h1>
        {params.error && <p className="lede">{params.error}</p>}
        {params.message && <p className="lede">{params.message}</p>}
        <form className="authForm">
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
