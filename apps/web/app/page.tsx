const sports = ['Pro Football', 'College Football', "Men's Basketball", "Women's Basketball", 'Baseball', "Men's Soccer", "Women's Soccer"];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">BIG EXEC FANTASY SPORTS</p>
        <h1>Run the franchise.<br />Own the season.</h1>
        <p className="lede">Big Exec is a multi-sport fantasy franchise platform built around real athletes, persistent teams, live competition, rivalry, legacy and the feeling that you are running your own front office.</p>
        <div className="actions">
          <a className="primary" href="/play">Enter Pro Football</a>
          <a className="secondary" href="#sports">Explore Big Exec</a>
        </div>
      </section>

      <section id="sports" className="panel">
        <p className="eyebrow">ONE BRAND. MULTIPLE SPORTS.</p>
        <h2>Football launches first. Your Big Exec identity goes further.</h2>
        <div className="sportGrid">
          {sports.map((sport, index) => (
            <article key={sport} className="sportCard">
              <span>{index === 0 ? 'FIRST SPORT' : 'COMING LATER'}</span>
              <strong>{sport}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split">
        <div>
          <p className="eyebrow">FANTASY SPORTS FOR THE FRONT OFFICE</p>
          <h2>Rivalries. Revenge. Championships. Legacy.</h2>
        </div>
        <p>Big Exec keeps the scoring underneath deterministic and grounded in real statistics while turning each league into a persistent franchise universe. AI tells the story; it never decides the result.</p>
      </section>
    </main>
  );
}
