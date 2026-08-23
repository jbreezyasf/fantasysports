const steps = [
  ['01', 'Create your league', 'Set the franchise count, roster configuration and commissioner controls.'],
  ['02', 'Name your franchise', 'Your identity, colors and history persist across seasons.'],
  ['03', 'Draft your roster', 'Build your team in a fast, competitive snake draft.'],
  ['04', 'Enter the circuit', 'Set lineups, follow scoring, build rivalries and chase the postseason.']
];

export default function PlayPage() {
  return (
    <main>
      <section className="panel">
        <p className="eyebrow">PRO FOOTBALL / SEASON ONE</p>
        <h1>Start the franchise.</h1>
        <p className="lede">The playable vertical slice is being wired to the live league backend. Authentication and league creation are the next runtime gate.</p>
      </section>
      <section className="panel">
        <div className="sportGrid">
          {steps.map(([number, title, copy]) => (
            <article className="sportCard" key={number}>
              <span>{number}</span>
              <div><strong>{title}</strong><p className="lede">{copy}</p></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
