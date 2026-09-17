import { redirect } from 'next/navigation';
import { updatePassword } from '../../auth/actions';
import BigExecBrand from '../../components/BigExecBrand';
import PasswordField from '../../components/PasswordField';
import { createClient } from '../../../lib/supabase/server';

export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const query=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect('/login/forgot?message='+encodeURIComponent('Request a new password-reset link to continue.'));
  return <main className="accessShell"><section className="accessScene"><BigExecBrand/><div className="accessSceneCopy"><p className="brandKicker">SECURE YOUR OFFICE</p><h1>Choose a new password.</h1><p>Your reset link has been verified. Create a new password to regain access.</p></div></section><section className="accessPanel"><div className="accessPanelInner"><p className="accessStep">NEW PASSWORD</p><h2>Update your credentials.</h2>{query.error&&<p className="errorNotice" role="alert">{query.error}</p>}<form className="authForm accessForm" action={updatePassword}><PasswordField autoComplete="new-password" describedBy="password-help"/><label>Confirm password<input name="confirm_password" type="password" required autoComplete="new-password"/></label><div id="password-help" className="passwordHelp"><strong>Password requirements</strong><span>8+ characters, uppercase, lowercase, number, and symbol.</span></div><button className="brandButton gold" type="submit">Update Password</button></form></div></section></main>;
}
