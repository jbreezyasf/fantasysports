import { requestPasswordReset } from '../../auth/actions';
import BigExecBrand from '../../components/BigExecBrand';

export default async function ForgotPasswordPage({searchParams}:{searchParams:Promise<{message?:string}>}) {
  const query=await searchParams;
  return <main className="accessShell"><section className="accessScene"><a className="accessBack" href="/login">← Back to sign in</a><BigExecBrand/><div className="accessSceneCopy"><p className="brandKicker">ACCOUNT RECOVERY</p><h1>Get back in the game.</h1><p>We will send a secure password-reset link to the email on your Big Exec account.</p></div></section><section className="accessPanel"><div className="accessPanelInner"><p className="accessStep">RESET PASSWORD</p><h2>Find your account.</h2>{query.message&&<p className="successNotice" role="status">{query.message}</p>}<form className="authForm accessForm" action={requestPasswordReset}><label>Email address<input name="email" type="email" required autoComplete="email"/></label><button className="brandButton gold" type="submit">Send Reset Link</button></form><p className="accessSwitch"><a href="/login">Return to sign in</a></p></div></section></main>;
}
