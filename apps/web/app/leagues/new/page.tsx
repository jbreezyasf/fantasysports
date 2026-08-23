import { createLeague } from '../actions';
import { FranchiseIdentityFields } from '../../components/FranchiseIdentityFields';

export default async function NewLeaguePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">COMMISSIONER SETUP</p>
        <h1>Create the league.</h1>
        <p className="lede">Creating a league makes you the commissioner of this league only. Your Big Exec account can still join or manage other leagues separately.</p>
        {params.error && <p className="errorNotice"><strong>League creation failed:</strong> {params.error}</p>}
        <form className="authForm" action={createLeague}>
          <label>League name<input name="league_name" required placeholder="Sunday Misfits" /></label>
          <FranchiseIdentityFields nameLabel="Your franchise name" />
          <button className="primary" type="submit">Create league + franchise</button>
        </form>
      </section>
    </main>
  );
}
