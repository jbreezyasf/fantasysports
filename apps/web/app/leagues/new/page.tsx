import { createLeague } from '../actions';

export default async function NewLeaguePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">COMMISSIONER SETUP</p>
        <h1>Create the league.</h1>
        <p className="lede">Season One starts with Pro Football, Half-PPR, and a persistent franchise identity.</p>
        {params.error && <p className="lede">{params.error}</p>}
        <form className="authForm" action={createLeague}>
          <label>League name<input name="league_name" required placeholder="Sunday Misfits" /></label>
          <label>Your franchise name<input name="franchise_name" required placeholder="Milwaukee Voltage" /></label>
          <label>Abbreviation<input name="abbreviation" maxLength={5} placeholder="MIL" /></label>
          <div className="colorRow"><label>Primary color<input name="primary_color" type="color" defaultValue="#e9ff70" /></label><label>Secondary color<input name="secondary_color" type="color" defaultValue="#0b0c0f" /></label></div>
          <button className="primary" type="submit">Create league + franchise</button>
        </form>
      </section>
    </main>
  );
}
