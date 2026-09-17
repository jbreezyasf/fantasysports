import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { generatePostgameTalk, postGeneratedTalk, refreshMatchup } from '../actions';
import { FranchiseCrest } from '../../components/FranchiseCrest';
import MatchupScoreAnnouncer from './MatchupScoreAnnouncer';
import MatchupLiveRefresh from './MatchupLiveRefresh';
import { matchupRowLabel, matchupStatus } from './matchupAccessibility';
import { defenseScoreDetails, playerScoreDetails, type RawFootballStats, type ScoreBreakdown, type ScoreDetail } from './scoreDetails';

type FranchiseCard = {
  name?: string;
  abbreviation?: string;
  primary_color?: string;
  secondary_color?: string;
  avatar_key?: string | null;
};
type TeamRef = { abbreviation?: string };
type AthleteRef = {
  display_name?: string;
  position?: string;
  real_teams?: TeamRef | TeamRef[] | null;
};
function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function MatchupPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchupId: string }>;
  searchParams: Promise<{
    error?: string;
    finalized?: string;
    score_status?: string;
    talk?: string;
  }>;
}) {
  const { matchupId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: matchup } = await supabase.from('matchups').select('id,league_season_id,week,event_type,home_season_franchise_id,away_season_franchise_id,home_points,away_points,is_final,winner_season_franchise_id').eq('id', matchupId).maybeSingle();
  if (!matchup) notFound();
  const { data: sf } = await supabase.from('season_franchises').select('id,franchise_id,franchises(name,abbreviation,primary_color,secondary_color,avatar_key)').eq('league_season_id', matchup.league_season_id);
  const home = sf?.find((x) => x.id === matchup.home_season_franchise_id),
    away = sf?.find((x) => x.id === matchup.away_season_franchise_id);
  const homeFranchise = firstRelation(home?.franchises as FranchiseCard | FranchiseCard[] | null | undefined),
    awayFranchise = firstRelation(away?.franchises as FranchiseCard | FranchiseCard[] | null | undefined);
  const { data: member } = await supabase.from('league_seasons').select('league_id,competition_season_id').eq('id', matchup.league_season_id).maybeSingle();
  const { data: ownerships } = await supabase.from('franchise_owners').select('franchise_id').eq('user_id', user.id).is('ends_on', null);
  const ownedIds = new Set((ownerships ?? []).map((o) => o.franchise_id));
  const isParticipant = (sf ?? []).some((x) => ownedIds.has(x.franchise_id));
  const [{ data: lineups }, { data: playerScores }, { data: teamScores }, { data: generated }, { data: recap }, { data: standings }] = await Promise.all([
    supabase.from('lineups').select('season_franchise_id,slot,slot_index,athlete_id,real_team_id,athletes(display_name,position,real_teams(abbreviation)),real_teams(abbreviation)').eq('week', matchup.week).in('season_franchise_id', [matchup.home_season_franchise_id, matchup.away_season_franchise_id]),
    supabase.from('fantasy_player_scores').select('athlete_id,game_id,points,breakdown,calculated_at').eq('league_season_id', matchup.league_season_id).eq('week', matchup.week),
    supabase.from('fantasy_team_scores').select('real_team_id,game_id,points,breakdown,calculated_at').eq('league_season_id', matchup.league_season_id).eq('week', matchup.week),
    query.talk ? supabase.from('generated_messages').select('id,tone,body,provider,created_at').eq('matchup_id', matchupId).eq('requested_by', user.id).eq('tone', query.talk).order('created_at', { ascending: false }).limit(3) : Promise.resolve({ data: [] }),
    matchup.is_final ? supabase.from('recap_scripts').select('id,title').eq('league_season_id', matchup.league_season_id).eq('week', matchup.week).eq('recap_kind', 'league_week').maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('standings').select('season_franchise_id,wins,losses,ties,points_for,points_against').eq('league_season_id',matchup.league_season_id).order('wins',{ascending:false}).order('points_for',{ascending:false}),
  ]);
  const {data:weekGames}=member?.competition_season_id?await supabase.from('real_games').select('starts_at,state').eq('competition_season_id',member.competition_season_id).eq('week',matchup.week).order('starts_at',{ascending:true}):{data:[] as Array<{starts_at:string;state:string}>};
  const now=Date.now();
  const liveGame=(weekGames??[]).some(game=>['in_progress','live','halftime'].includes(String(game.state).toLowerCase()));
  const nextGame=(weekGames??[]).find(game=>Date.parse(game.starts_at)>now&&!['final','canceled'].includes(String(game.state).toLowerCase()));
  const feedState=matchup.is_final?'final':liveGame?'live':nextGame?'upcoming':'idle';
  const scoredGameIds = [...new Set([...(playerScores ?? []).map((score) => score.game_id), ...(teamScores ?? []).map((score) => score.game_id)].filter((id): id is string => Boolean(id)))];
  const [{ data: rawPlayerStats }, { data: rawTeamStats }] = scoredGameIds.length ? await Promise.all([supabase.from('athlete_game_stats').select('athlete_id,game_id,raw_stats,ingested_at').in('game_id', scoredGameIds).order('ingested_at', { ascending: false }), supabase.from('real_team_game_stats').select('real_team_id,game_id,raw_stats,ingested_at').in('game_id', scoredGameIds).order('ingested_at', { ascending: false })]) : [{ data: [] }, { data: [] }];
  const rawStatsByAssetGame = new Map<string, RawFootballStats>();
  for (const row of rawPlayerStats ?? []) {
    const key = `${row.athlete_id}:${row.game_id}`;
    if (!rawStatsByAssetGame.has(key)) rawStatsByAssetGame.set(key, row.raw_stats as RawFootballStats);
  }
  const rawStatsByTeamGame = new Map<string, RawFootballStats>();
  for (const row of rawTeamStats ?? []) {
    const key = `${row.real_team_id}:${row.game_id}`;
    if (!rawStatsByTeamGame.has(key)) rawStatsByTeamGame.set(key, row.raw_stats as RawFootballStats);
  }
  const playerMap = new Map(
      (playerScores ?? []).map((x) => [
        x.athlete_id,
        {
          points: Number(x.points),
          details: playerScoreDetails(rawStatsByAssetGame.get(`${x.athlete_id}:${x.game_id}`), x.breakdown as ScoreBreakdown | null),
        },
      ]),
    ),
    teamMap = new Map(
      (teamScores ?? []).map((x) => [
        x.real_team_id,
        {
          points: Number(x.points),
          details: defenseScoreDetails(rawStatsByTeamGame.get(`${x.real_team_id}:${x.game_id}`), x.breakdown as ScoreBreakdown | null),
        },
      ]),
    );
  const slotOrder = ['QB:1', 'RB:1', 'RB:2', 'WR:1', 'WR:2', 'TE:1', 'FLEX:1', 'K:1', 'DST:1'];
  function assetRow(seasonFranchiseId: string, key: string) {
    const [slot, index] = key.split(':');
    const item = lineups?.find((l) => l.season_franchise_id === seasonFranchiseId && l.slot === slot && l.slot_index === Number(index));
    if (!item)
      return {
        name: 'EMPTY',
        meta: slot === 'DST' ? 'D/ST' : slot,
        points: 0,
        details: [] as ScoreDetail[],
      };
    if (item.athlete_id) {
      const athlete = firstRelation(item.athletes as AthleteRef | AthleteRef[] | null | undefined),
        team = firstRelation(athlete?.real_teams),
        score = playerMap.get(item.athlete_id);
      return {
        name: athlete?.display_name ?? 'Athlete',
        meta: `${slot === 'FLEX' ? athlete?.position : slot} • ${team?.abbreviation ?? 'FA'}`,
        points: score?.points ?? 0,
        details: score?.details ?? [],
      };
    }
    const team = firstRelation(item.real_teams as TeamRef | TeamRef[] | null | undefined),
      score = teamMap.get(item.real_team_id!);
    return {
      name: `${team?.abbreviation ?? 'Team'} D/ST`,
      meta: 'D/ST',
      points: score?.points ?? 0,
      details: score?.details ?? [],
    };
  }
  const homeColor = homeFranchise?.primary_color ?? '#7c4dff',
    awayColor = awayFranchise?.primary_color ?? '#d9b43b';
  const homeName = homeFranchise?.name ?? 'Home franchise',
    awayName = awayFranchise?.name ?? 'Away franchise';
  const homeScore = Number(matchup.home_points),
    awayScore = Number(matchup.away_points);
  const latestCalculatedAt =
    [...(playerScores ?? []), ...(teamScores ?? [])]
      .map((score) => score.calculated_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const userIsHome = ownedIds.has(home?.franchise_id ?? ''),
    userIsAway = ownedIds.has(away?.franchise_id ?? '');
  const userFranchiseId = userIsHome ? home?.franchise_id : userIsAway ? away?.franchise_id : null;
  const summary = matchupStatus({
    userTeam: userIsHome ? homeName : userIsAway ? awayName : null,
    opponentTeam: userIsHome ? awayName : userIsAway ? homeName : null,
    userScore: userIsHome ? homeScore : userIsAway ? awayScore : null,
    opponentScore: userIsHome ? awayScore : userIsAway ? homeScore : null,
    homeTeam: homeName,
    awayTeam: awayName,
    homeScore,
    awayScore,
    isFinal: matchup.is_final,
    eventType: matchup.event_type,
  });
  return (
    <main>
      <MatchupScoreAnnouncer matchupId={matchupId} summary={summary} />
      <MatchupLiveRefresh isFinal={matchup.is_final} updatedAt={latestCalculatedAt} feedState={feedState} nextGameAt={nextGame?.starts_at??null} />
      <section
        className="panel matchupHero arenaMatchupHero"
        style={
          {
            '--home-color': homeColor,
            '--away-color': awayColor,
          } as React.CSSProperties
        }
      >
        <div className="stadiumColorWash" aria-hidden="true" />
        <p className="eyebrow">
          WEEK {matchup.week} • {matchup.is_final ? 'FINAL' : `${matchup.event_type.toUpperCase()} • ${liveGame?'IN PROGRESS':nextGame?'UPCOMING':'AWAITING FINALIZATION'}`}
        </p>
        <p className="srOnly" role="status">
          {summary}
        </p>
        <div className="scoreboard" aria-label={summary}>
          <div>
            <FranchiseCrest className="scoreCrest" name={homeName} abbreviation={homeFranchise?.abbreviation} primary={homeFranchise?.primary_color} secondary={homeFranchise?.secondary_color} avatarKey={homeFranchise?.avatar_key} />
            <strong>{homeScore.toFixed(2)}</strong>
            <p>{homeName}</p>
          </div>
          <b>VS</b>
          <div>
            <FranchiseCrest className="scoreCrest" name={awayName} abbreviation={awayFranchise?.abbreviation} primary={awayFranchise?.primary_color} secondary={awayFranchise?.secondary_color} avatarKey={awayFranchise?.avatar_key} />
            <strong>{awayScore.toFixed(2)}</strong>
            <p>{awayName}</p>
          </div>
        </div>
        {query.error && (
          <p className="errorNotice" role="alert">
            {query.error}
          </p>
        )}
        {query.score_status === 'refreshed' && (
          <p className="successNotice" role="status">
            Scores refreshed. {summary}
          </p>
        )}
        <div className="actions">
          <form action={refreshMatchup}>
            <input type="hidden" name="matchup_id" value={matchupId} />
            <button className="secondary">Refresh Scores</button>
          </form>
          {matchup.is_final && recap && (
              <a className="primary" href={`/recaps/${recap.id}`}>
                Watch Week Recap
              </a>
            )}
          {member?.league_id && (
            <a className="secondary" href={`/leagues/${member.league_id}/locker-room`}>
              Locker Room
            </a>
          )}
          {userFranchiseId && <a className="primary" href={`/franchises/${userFranchiseId}/team`}>Set Lineup</a>}
        </div>
      </section>
      <section className="panel matchupStandingsPanel" aria-labelledby="matchup-standings-heading">
        <div className="lineupSectionHeading">
          <div><p className="eyebrow">LEAGUE STANDINGS</p><h2 id="matchup-standings-heading">Where this matchup stands</h2></div>
          {member?.league_id&&<a className="secondary" href={`/leagues/${member.league_id}/schedule`}>Full League</a>}
        </div>
        <div className="standingsList">
          {(standings??[]).map((standing,index)=>{
            const team=sf?.find(row=>row.id===standing.season_franchise_id);
            const franchise=firstRelation(team?.franchises as FranchiseCard | FranchiseCard[] | null | undefined);
            const inMatchup=[matchup.home_season_franchise_id,matchup.away_season_franchise_id].includes(standing.season_franchise_id);
            const record=`${standing.wins}-${standing.losses}${standing.ties?`-${standing.ties}`:''}`;
            return <div className={`standingRow${inMatchup?' isMatchupTeam':''}`} key={standing.season_franchise_id} aria-label={`Rank ${index+1}. ${franchise?.name??'Franchise'}. Record ${record}. Points for ${Number(standing.points_for).toFixed(2)}.`}>
              <b>{index+1}</b><span>{franchise?.name??'Franchise'}</span><small>{record}</small><small>{Number(standing.points_for).toFixed(2)} PF</small>
            </div>;
          })}
          {!standings?.length&&<p className="lede matchupStandingsEmpty">Standings will appear after the first completed matchup.</p>}
        </div>
      </section>
      {matchup.is_final && isParticipant && (
        <section className="panel">
          <p className="eyebrow">POSTGAME MIC</p>
          <h2>Choose your energy.</h2>
          <p className="lede">Big Exec uses only public matchup facts here. Pick a tone, choose one of three editable lines, then send it to the Locker Room.</p>
          <div className="actions">
            {(['respect', 'playful', 'petty', 'savage'] as const).map((tone) => (
              <form action={generatePostgameTalk} key={tone}>
                <input type="hidden" name="matchup_id" value={matchupId} />
                <input type="hidden" name="tone" value={tone} />
                <button className={query.talk === tone ? 'primary' : 'secondary'}>{tone}</button>
              </form>
            ))}
          </div>
          {!!generated?.length && (
            <div className="weekStack" style={{ marginTop: 24 }}>
              {generated.map((option) => (
                <article className="weekCard" key={option.id}>
                  <div className="weekHeader">
                    <div>
                      <span>{option.tone.toUpperCase()}</span>
                      <strong>{option.provider.startsWith('openai') ? 'AI OPTION' : 'BIG EXEC OPTION'}</strong>
                    </div>
                  </div>
                  <form className="authForm" action={postGeneratedTalk}>
                    <input type="hidden" name="matchup_id" value={matchupId} />
                    <input type="hidden" name="message_id" value={option.id} />
                    <label>
                      Edit before posting
                      <textarea name="body" defaultValue={option.body} maxLength={1200} rows={3} />
                    </label>
                    <button className="primary">Post to Locker Room</button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="panel matchupLineupPanel">
        <div className="lineupSectionHeading">
          <div>
            <p className="eyebrow">STARTING LINEUPS</p>
            <h2>Head to head</h2>
          </div>
          <span>Week {matchup.week}</span>
        </div>
        <div className="matchupColumnHead" aria-hidden="true">
          <strong>{homeName}</strong>
          <span>POS</span>
          <strong>{awayName}</strong>
        </div>
        <div className="battleList">
          {slotOrder.map((key) => {
            const h = assetRow(matchup.home_season_franchise_id, key),
              a = assetRow(matchup.away_season_franchise_id, key);
            const slotLabel = key.split(':')[0] === 'DST' ? 'D/ST' : key.split(':')[0];
            const breakdown = (side: typeof h) => (
              <details className="scoreBreakdown">
                <summary aria-label={`${side.name}: how ${side.points.toFixed(2)} points were scored`}>Score details</summary>
                <div className="scoreBreakdownGrid">
                  {side.details.length ? (
                    side.details.map((item) => (
                      <div className="scoreBreakdownRow" key={`${item.label}-${item.stat}`}>
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.stat}</small>
                        </span>
                        <b>
                          {item.points > 0 ? '+' : ''}
                          {item.points.toFixed(2)}
                        </b>
                      </div>
                    ))
                  ) : (
                    <p>No scoring stats yet</p>
                  )}
                </div>
              </details>
            );
            return (
              <div className="battleRow" aria-label={matchupRowLabel(slotLabel, h.name, h.points, a.name, a.points)} key={key}>
                <div>
                  <span>{h.meta}</span>
                  <strong>{h.name}</strong>
                  <b>{h.points.toFixed(2)}</b>
                  {h.name !== 'EMPTY' && breakdown(h)}
                </div>
                <em>{slotLabel}</em>
                <div>
                  <span>{a.meta}</span>
                  <strong>{a.name}</strong>
                  <b>{a.points.toFixed(2)}</b>
                  {a.name !== 'EMPTY' && breakdown(a)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
