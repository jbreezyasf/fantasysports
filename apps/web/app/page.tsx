const sports = ['Pro Football', 'College Football', "Men's Basketball", "Women's Basketball", 'Baseball', 'Soccer'];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">FANTASY ALL-SPORTS</p>
        <h1>Build a franchise.<br />Own the season.</h1>
        <p className="lede">One persistent fantasy identity across the sports you follow. Draft real athletes, compete through story-driven events, and build history that survives the final whistle.</p>
        <div className="actions">
          <a className="primary" href="/play">Start with Pro Football</a>
          <a className="secondary" href="#sports">Explore the universe</a>
        </div>
      </section>

      <section id="sports" className="panel">
        <p className="eyebrow">THE UNIVERSE</p>
        <h2>Football launches first. The franchise lives beyond it.</h2>
        <div className="sportGrid">
          {sports.map((sport, index) => (
            <article key={sport} className="sportCard">
              <span>{index === 0 ? 'LIVE BUILD' : 'COMING LATER'}</span>
              <strong>{sport}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split">
        <div>
          <p className="eyebrow">NOT JUST A WEEKLY SCORE</p>
          <h2>Rivalries. Revenge. Chaos. Judgment.</h2>
        </div>
        <p>Weekly matchups become events with context, while the scoring underneath stays deterministic and grounded in real statistics. AI tells the story; it never decides the result.</p>
      </section>
    </main>
  );
}
