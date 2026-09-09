import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { submitBetaFeedback } from './actions';
import styles from './styles.module.css';

const TASKS = [
  ['create_join_league','Create or join a league'],['invite_people','Invite people'],['draft','Draft'],
  ['lineup','Set my lineup'],['matchup_score','Check matchup or score'],['waivers','Add or drop players'],
  ['trade','Trade'],['assistant_gm','Use Front Office Advisor'],['standings','View standings'],
  ['locker_room','Locker Room or league chat'],['accessibility','Accessibility or voice'],['other','Something else'],
] as const;

export default async function BetaFeedbackPage({ searchParams }: { searchParams: Promise<Record<string,string|undefined>> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/beta-feedback');
  const { count } = await supabase.from('league_members').select('id',{count:'exact',head:true}).eq('user_id',user.id);
  if (!count) redirect('/dashboard');

  if (query.submitted === '1') return <main className={styles.shell}><section className={styles.card} aria-labelledby="thanks-title"><p className={styles.eyebrow}>BIG EXEC FOOTBALL • BETA</p><h1 id="thanks-title">Thank you. Your feedback is in.</h1><p>We saved your words exactly as you sent them. The Big Exec team will review the problem, look for similar reports, and decide what should change.</p><a className={styles.primaryLink} href="/dashboard">Back to Big Exec</a></section></main>;

  return <main className={styles.shell}><section className={styles.card} aria-labelledby="feedback-title"><p className={styles.eyebrow}>BIG EXEC FOOTBALL • BETA FEEDBACK</p><h1 id="feedback-title">Help us make Big Exec better.</h1><p className={styles.lede}>Tell us what worked, what got in your way, and what you expected. You do not need to know if something is a bug or a feature request. We will sort that out.</p>
    <form action={submitBetaFeedback} className={styles.form}>
      <label>What were you trying to do?<select name="task_area" required defaultValue=""><option value="" disabled>Choose one</option>{TASKS.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
      <fieldset><legend>Did it work?</legend><div className={styles.choices}>{[['easy_success','Yes, easily'],['confusing_success','Yes, but it was confusing'],['partial','Partly'],['failed','No']].map(([value,label])=><label className={styles.choice} key={value}><input type="radio" name="outcome" value={value} required /> {label}</label>)}</div></fieldset>
      <fieldset><legend>How easy was it?</legend><p className={styles.hint}>1 means very hard. 5 means very easy.</p><div className={styles.rating}>{[1,2,3,4,5].map(n=><label key={n}><input type="radio" name="ease_rating" value={n} required /> {n}</label>)}</div></fieldset>
      <label>What happened?<textarea name="happened" required maxLength={4000} rows={4} /></label>
      <label>What did you expect to happen?<textarea name="expected" required maxLength={4000} rows={4} /></label>
      <label>What frustrated or confused you?<textarea name="frustration" maxLength={4000} rows={3} /></label>
      <label>What did you like?<textarea name="liked" maxLength={4000} rows={3} /></label>
      <label>What would make this better?<textarea name="improvement" maxLength={4000} rows={3} /></label>
      <label>Was there something you expected Big Exec to do that you could not find?<textarea name="missing_capability" maxLength={4000} rows={3} /></label>
      <fieldset><legend>Would this problem make you stop playing?</legend><div className={styles.choices}>{[['definitely','Definitely'],['maybe','Maybe'],['probably_not','Probably not'],['no','No']].map(([value,label])=><label className={styles.choice} key={value}><input type="radio" name="churn_risk" value={value} required /> {label}</label>)}</div></fieldset>
      <fieldset><legend>How disappointed would you be if you could not use Big Exec anymore?</legend><div className={styles.choices}>{[['very','Very disappointed'],['somewhat','Somewhat disappointed'],['not','Not disappointed']].map(([value,label])=><label className={styles.choice} key={value}><input type="radio" name="disappointment" value={value} required /> {label}</label>)}</div></fieldset>
      <fieldset><legend>How likely are you to recommend Big Exec Football to a friend?</legend><p className={styles.hint}>0 means not likely. 10 means very likely.</p><div className={styles.nps}>{Array.from({length:11},(_,n)=><label key={n}><input type="radio" name="nps_score" value={n} required /> {n}</label>)}</div></fieldset>
      <label>Where in Big Exec were you when this happened? <span className={styles.optional}>(optional)</span><input name="page_path" type="text" maxLength={500} placeholder="Example: Draft Room or /drafts/..." /></label>
      <p className={styles.privacy}>Your feedback is used to improve Big Exec. We keep your original feedback separate from our analysis so your meaning is not replaced by an AI summary.</p>
      <button className={styles.submit} type="submit">Send my feedback</button>
    </form>
  </section></main>;
}
