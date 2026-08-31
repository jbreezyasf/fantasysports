import { notFound, redirect } from 'next/navigation';
import { buildDeterministicAssistantGMBrief, loadAssistantGMContext } from '../../../../lib/assistant-gm/context';
import AssistantGMClient from './AssistantGMClient';

export default async function AssistantGMPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  const loaded = await loadAssistantGMContext(leagueId);

  if (!loaded.ok) {
    if (loaded.reason === 'unauthenticated') redirect('/login');
    if (loaded.reason === 'not_member') notFound();
    return (
      <main className="leagueShell">
        <section className="leagueHero">
          <div className="leagueHeroGlow" />
          <div className="leagueTopline"><a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a><span className="leagueRole">ASSISTANT GM</span></div>
          <div className="leagueHeroContent"><p className="eyebrow">BIG EXEC • PRIVATE FRONT OFFICE</p><h1>Assistant GM.</h1><p className="leagueTagline">Your franchise advisor needs a current franchise and season before he has a board to work from.</p></div>
        </section>
        <section className="panel"><p className="errorNotice" role="alert">{loaded.message}</p><a className="secondary" href={`/leagues/${leagueId}`}>Back to League HQ</a></section>
      </main>
    );
  }

  const { context } = loaded;
  return (
    <main className="leagueShell">
      <section className="leagueHero">
        <div className="leagueHeroGlow" />
        <div className="leagueTopline">
          <a className="backLink" href={`/leagues/${leagueId}`}>← LEAGUE HQ</a>
          <span className="leagueRole">PRIVATE • ASSISTANT GM</span>
        </div>
        <div className="leagueHeroContent">
          <p className="eyebrow">BIG EXEC • {context.leagueName}</p>
          <h1>{context.franchiseName} front office.</h1>
          <p className="leagueTagline">You own the franchise. I’m the one person in the room allowed to tell you when I think you’re about to get cute.</p>
          <div className="leagueMetaRow"><span>OWNER / GM: YOU</span><span>ASSISTANT GM: PRIVATE</span><span>ADVISORY ONLY</span></div>
        </div>
      </section>

      <AssistantGMClient
        leagueId={context.leagueId}
        userId={context.userId}
        franchiseName={context.franchiseName}
        week={context.week}
        initialBrief={buildDeterministicAssistantGMBrief(context)}
        topTargets={context.decision.topTargets}
        freeAgencyUrl={`/leagues/${context.leagueId}/players`}
        teamUrl={`/franchises/${context.franchiseId}/team?week=${context.week}`}
      />
    </main>
  );
}
