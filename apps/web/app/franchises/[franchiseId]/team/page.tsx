import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { FranchiseCrest } from '../../../components/FranchiseCrest';
import { requestRosterIntegrityReview } from './actions';
import { describeLineupSlot, describeRosterAsset, lineupMoveButtonLabel, lineupMoveConfirmation } from './lineupAccessibility';
import { LineupMoveForm } from './LineupMoveForm';
import { defenseScoreDetails, playerScoreDetails, type RawFootballStats, type ScoreBreakdown } from '../../../matchups/[matchupId]/scoreDetails';
import { gameHasLocked, lineupGameByTeam, lineupLockExplanation } from './lineupLocks';

const slots = [
  ['QB', 1, 'QB'],
  ['RB', 1, 'RB1'],
  ['RB', 2, 'RB2'],
  ['WR', 1, 'WR1'],
  ['WR', 2, 'WR2'],
  ['TE', 1, 'TE'],
  ['FLEX', 1, 'FLEX'],
  ['K', 1, 'K'],
  ['DST', 1, 'D/ST'],
] as const;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ franchiseId: string }>;
  searchParams: Promise<{
    week?: string;
    error?: string;
    lineup_status?: string;
    lineup_slot?: string;
    lineup_asset?: string;
    integrity_status?: string;
    integrity_error?: string;
  }>;
}) {
  const { franchiseId } = await params;
  const query = await searchParams;
  const week = Math.max(1, Math.min(18, Number(query.week ?? 1)));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: franchise } = await supabase.from('franchises').select('id,name,abbreviation,league_id,primary_color,secondary_color,avatar_key').eq('id', franchiseId).maybeSingle();
  if (!franchise) notFound();
  const { data: currentLeagueSeason } = await supabase.from('league_seasons').select('id,competition_season_id,trade_deadline_at,roster_integrity_mode,roster_integrity_bulk_drop_limit,roster_integrity_bulk_window_hours').eq('league_id', franchise.league_id).eq('is_current', true).maybeSingle();
  if (!currentLeagueSeason) notFound();
  const { data: seasonFranchise } = await supabase.from('season_franchises').select('id,league_season_id,roster_locked_at,roster_lock_reason').eq('franchise_id', franchiseId).eq('league_season_id', currentLeagueSeason.id).maybeSingle();
  if (!seasonFranchise) notFound();
  const { data: ownership } = await supabase.from('franchise_owners').select('user_id').eq('franchise_id', franchiseId).eq('user_id', user.id).is('ends_on', null).maybeSingle();
  if (!ownership) redirect(`/leagues/${franchise.league_id}`);
  const [{ data: roster }, { data: lineup }, { data: stadium }, { data: pendingReviews }, { data: playerScores }, { data: teamScores }, { data: weekGames }] = await Promise.all([
    supabase.from('roster_entries').select('id,athlete_id,real_team_id,athletes(display_name,position,real_team_id,real_teams(abbreviation)),real_teams(display_name,abbreviation)').eq('season_franchise_id', seasonFranchise.id).is('dropped_at', null).order('added_at'),
    supabase.from('lineups').select('slot,slot_index,athlete_id,real_team_id').eq('season_franchise_id', seasonFranchise.id).eq('week', week),
    supabase.from('stadiums').select('id,environment_key').eq('franchise_id', franchiseId).maybeSingle(),
    supabase.from('roster_integrity_reviews').select('id,roster_entry_id,status,reason_code,reason_detail,requested_at').eq('season_franchise_id', seasonFranchise.id).eq('status', 'pending'),
    supabase.from('fantasy_player_scores').select('athlete_id,game_id,points,breakdown').eq('league_season_id', currentLeagueSeason.id).eq('week', week),
    supabase.from('fantasy_team_scores').select('real_team_id,game_id,points,breakdown').eq('league_season_id', currentLeagueSeason.id).eq('week', week),
    supabase.from('real_games').select('home_team_id,away_team_id,starts_at,state').eq('competition_season_id', currentLeagueSeason.competition_season_id).eq('week', week),
  ]);
  const scoredGameIds = [...new Set([...(playerScores ?? []).map((score) => score.game_id), ...(teamScores ?? []).map((score) => score.game_id)].filter((id): id is string => Boolean(id)))];
  const [{ data: rawPlayerStats }, { data: rawTeamStats }] = scoredGameIds.length ? await Promise.all([supabase.from('athlete_game_stats').select('athlete_id,game_id,raw_stats,ingested_at').in('game_id', scoredGameIds).order('ingested_at', { ascending: false }), supabase.from('real_team_game_stats').select('real_team_id,game_id,raw_stats,ingested_at').in('game_id', scoredGameIds).order('ingested_at', { ascending: false })]) : [{ data: [] }, { data: [] }];
  const rawPlayerByGame = new Map<string, RawFootballStats>();
  for (const row of rawPlayerStats ?? []) {
    const key = `${row.athlete_id}:${row.game_id}`;
    if (!rawPlayerByGame.has(key)) rawPlayerByGame.set(key, row.raw_stats as RawFootballStats);
  }
  const rawTeamByGame = new Map<string, RawFootballStats>();
  for (const row of rawTeamStats ?? []) {
    const key = `${row.real_team_id}:${row.game_id}`;
    if (!rawTeamByGame.has(key)) rawTeamByGame.set(key, row.raw_stats as RawFootballStats);
  }
  const lineupMap = new Map((lineup ?? []).map((item) => [`${item.slot}:${item.slot_index}`, item]));
  const starterAssetIds = new Set((lineup ?? []).flatMap((item) => [item.athlete_id, item.real_team_id]).filter(Boolean));
  const pendingReviewEntryIds = new Set((pendingReviews ?? []).map((item) => item.roster_entry_id));
  const primary = franchise.primary_color ?? '#d9b43b';
  const secondary = franchise.secondary_color ?? '#f5f1e8';
  const deadlinePassed = currentLeagueSeason.trade_deadline_at ? Date.now() >= new Date(currentLeagueSeason.trade_deadline_at).getTime() : false;
  const integrityActive = deadlinePassed && currentLeagueSeason.roster_integrity_mode !== 'open';
  const playerPoints = new Map((playerScores ?? []).map((score) => [score.athlete_id, Number(score.points)]));
  const teamPoints = new Map((teamScores ?? []).map((score) => [score.real_team_id, Number(score.points)]));
  const pointsForAsset = (asset: NonNullable<typeof roster>[number] | undefined) => (asset?.athlete_id ? (playerPoints.get(asset.athlete_id) ?? 0) : asset?.real_team_id ? (teamPoints.get(asset.real_team_id) ?? 0) : 0);
  const statLineForAsset = (asset: NonNullable<typeof roster>[number] | undefined) => {
    if (!asset) return 'No player selected';
    if (asset.athlete_id) {
      const score = (playerScores ?? []).find((row) => row.athlete_id === asset.athlete_id);
      return (
        playerScoreDetails(score ? rawPlayerByGame.get(`${asset.athlete_id}:${score.game_id}`) : null, score?.breakdown as ScoreBreakdown | null)
          .map((item) => item.stat)
          .join(' • ') || 'No scoring stats yet'
      );
    }
    const score = (teamScores ?? []).find((row) => row.real_team_id === asset.real_team_id);
    return (
      defenseScoreDetails(score ? rawTeamByGame.get(`${asset.real_team_id}:${score.game_id}`) : null, score?.breakdown as ScoreBreakdown | null)
        .map((item) => `${item.label} ${item.stat}`)
        .join(' • ') || 'No scoring stats yet'
    );
  };
  const starterPoints = (lineup ?? []).reduce((total, item) => total + (item.athlete_id ? (playerPoints.get(item.athlete_id) ?? 0) : item.real_team_id ? (teamPoints.get(item.real_team_id) ?? 0) : 0), 0);
  const benchAssets = (roster ?? []).filter((asset) => !starterAssetIds.has(asset.athlete_id ?? asset.real_team_id));
  const benchPoints = benchAssets.reduce((total, asset) => total + pointsForAsset(asset), 0);
  const gamesByTeam = lineupGameByTeam(weekGames ?? []);

  function teamIdForAsset(asset: NonNullable<typeof roster>[number] | undefined) {
    if (!asset) return null;
    if (asset.real_team_id) return asset.real_team_id;
    const athlete = Array.isArray(asset.athletes) ? asset.athletes[0] : asset.athletes;
    return athlete?.real_team_id ?? null;
  }

  function lockForAsset(asset: NonNullable<typeof roster>[number] | undefined) {
    const teamId = teamIdForAsset(asset);
    const game = teamId ? gamesByTeam.get(teamId) : undefined;
    return { locked: gameHasLocked(game), game };
  }

  function labelForAsset(asset: NonNullable<typeof roster>[number]) {
    if (asset.athlete_id && asset.athletes) {
      const athlete = Array.isArray(asset.athletes)
        ? asset.athletes[0]
        : (asset.athletes as {
            display_name?: string;
            position?: string;
            real_teams?: { abbreviation?: string } | { abbreviation?: string }[] | null;
          });
      const team = Array.isArray(athlete?.real_teams) ? athlete?.real_teams[0] : athlete?.real_teams;
      return `${athlete?.display_name ?? 'Athlete'} • ${athlete?.position ?? ''} • ${team?.abbreviation ?? 'FA'}`;
    }
    const team = Array.isArray(asset.real_teams)
      ? asset.real_teams[0]
      : (asset.real_teams as {
          display_name?: string;
          abbreviation?: string;
        } | null);
    return `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`;
  }

  function describeAssetForScreenReader(asset: NonNullable<typeof roster>[number], starterState: 'starter' | 'bench', slotLabel?: string) {
    if (asset.athlete_id && asset.athletes) {
      const athlete = Array.isArray(asset.athletes)
        ? asset.athletes[0]
        : (asset.athletes as {
            display_name?: string;
            position?: string;
            real_teams?: { abbreviation?: string } | { abbreviation?: string }[] | null;
          });
      const team = Array.isArray(athlete?.real_teams) ? athlete?.real_teams[0] : athlete?.real_teams;
      return describeRosterAsset({
        name: athlete?.display_name ?? 'Athlete',
        position: athlete?.position ?? '',
        team: team?.abbreviation ?? 'FA',
        starterState,
        slotLabel,
      });
    }
    const team = Array.isArray(asset.real_teams)
      ? asset.real_teams[0]
      : (asset.real_teams as {
          display_name?: string;
          abbreviation?: string;
        } | null);
    return describeRosterAsset({
      name: `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`,
      position: 'D/ST',
      team: team?.abbreviation ?? team?.display_name ?? 'Defense',
      starterState,
      slotLabel,
    });
  }

  return (
    <main>
      <nav className="franchiseNav" aria-label="Franchise navigation">
        <a href="/dashboard">Home</a>
        <a href={`/leagues/${franchise.league_id}`}>League HQ</a>
        <a aria-current="page" href={`/franchises/${franchiseId}/team?week=${week}`}>
          Team
        </a>
        <a href={`/franchises/${franchiseId}/stadium`}>My Stadium</a>
      </nav>
      <section
        className="leagueHero franchiseStadiumHero"
        style={
          {
            '--stadium-primary': primary,
            '--stadium-secondary': secondary,
          } as React.CSSProperties
        }
      >
        <div className="stadiumColorWash" aria-hidden="true" />
        <div className="leagueTopline">
          <span className="backLink">WEEK {week} • TEAM HQ</span>
          <span className="leagueRole">{stadium?.environment_key?.replaceAll('_', ' ').toUpperCase() ?? 'HOME STADIUM'}</span>
        </div>
        <div className="leagueHeroContent franchiseIdentity">
          <FranchiseCrest className="franchiseCrest" name={franchise.name} abbreviation={franchise.abbreviation} primary={primary} secondary={secondary} avatarKey={franchise.avatar_key} />
          <div>
            <p className="eyebrow">BIG EXEC • FRONT OFFICE</p>
            <h1>{franchise.name}</h1>
            <p className="leagueTagline">Set the starting nine inside your franchise home.</p>
            <div className="leagueMetaRow">
              <span>{franchise.abbreviation ?? 'BEX'}</span>
              <span>WEEK {week}</span>
              <span>STARTER STADIUM</span>
            </div>
          </div>
        </div>
        <a className="stadiumHeroAction" href={`/franchises/${franchiseId}/stadium`}>
          View stadium <span aria-hidden="true">→</span>
        </a>
      </section>
      <section className="panel lineupControlPanel">
        <p className="eyebrow">LINEUP CONTROL</p>
        <h2>Set your starters.</h2>
        <p className="lede">Open a position only when you want to make a change. Players lock when their game begins.</p>
        {query.error && (
          <p className="errorNotice" role="alert">
            {query.error}
          </p>
        )}
        {query.lineup_status === 'set' && (
          <p className="successNotice" role="status">
            {lineupMoveConfirmation(query.lineup_asset ?? 'Selected player', query.lineup_slot ?? 'lineup slot', week)}
          </p>
        )}
        <div className="actions">
          {week > 1 && (
            <a className="secondary" href={`/franchises/${franchiseId}/team?week=${week - 1}`}>
              ← Week {week - 1}
            </a>
          )}
          {week < 18 && (
            <a className="secondary" href={`/franchises/${franchiseId}/team?week=${week + 1}`}>
              Week {week + 1} →
            </a>
          )}
          <a className="secondary" href={`/franchises/${franchiseId}/stadium`}>
            View My Stadium
          </a>
        </div>
      </section>
      <section className="panel lineupTablePanel" aria-labelledby="starters-heading">
        <div className="lineupSectionHeading">
          <div>
            <p className="eyebrow">STARTERS</p>
            <h2 id="starters-heading">Week {week} lineup</h2>
          </div>
          <div className="lineupWeekTotal">
            <strong>{starterPoints.toFixed(2)}</strong>
            <small>WEEK {week} POINTS</small>
            <span>{starterAssetIds.size}/9 SET</span>
          </div>
        </div>
        <div className="lineupGrid">
          {slots.map(([slot, slotIndex, label]) => {
            const current = lineupMap.get(`${slot}:${slotIndex}`);
            const currentRoster = roster?.find((r) => (current?.athlete_id && r.athlete_id === current.athlete_id) || (current?.real_team_id && r.real_team_id === current.real_team_id));
            const currentLabel = currentRoster ? labelForAsset(currentRoster) : undefined;
            const currentLock = lockForAsset(currentRoster);
            const eligible = (roster ?? []).filter((r) => {
              if (lockForAsset(r).locked) return false;
              if (r.real_team_id) return slot === 'DST';
              const athlete = Array.isArray(r.athletes) ? r.athletes[0] : (r.athletes as { position?: string } | null);
              const pos = athlete?.position;
              if (slot === 'FLEX') return ['RB', 'WR', 'TE'].includes(pos ?? '');
              return pos === slot;
            });
            return (
              <article className="lineupSlot" aria-label={describeLineupSlot(label, currentLabel)} key={`${slot}-${slotIndex}`}>
                <span>{label}</span>
                <strong>{currentRoster ? labelForAsset(currentRoster) : 'Empty slot'}</strong>
                <b className="lineupAssetPoints">
                  {pointsForAsset(currentRoster).toFixed(2)} <small>PTS</small>
                </b>
                {currentRoster && <small className="playerStatLine">{statLineForAsset(currentRoster)}</small>}
                {currentRoster && <small className="srOnly">{describeAssetForScreenReader(currentRoster, 'starter', label)}</small>}
                {currentLock.locked ? (
                  <p className="lineupLockState" role="status" aria-label={`${currentLabel ?? label} is locked. ${lineupLockExplanation(currentLock.game)}`}>
                    <span className="statusBadge is-locked">Locked</span>
                    <small>{lineupLockExplanation(currentLock.game)}. This starter cannot be removed.</small>
                  </p>
                ) : (currentRoster || !!eligible.length) && (
                  <details className="lineupChange">
                    <summary>Change</summary>
                    <div className="slotChoices" aria-label={`Move eligible players to ${label}`}>
                      {currentRoster && (
                        <LineupMoveForm
                          seasonFranchiseId={seasonFranchise.id}
                          franchiseId={franchiseId}
                          week={week}
                          slot={slot}
                          slotIndex={slotIndex}
                          slotLabel={label}
                          assetLabel={currentLabel ?? 'Current starter'}
                          buttonLabel={`Move ${currentLabel ?? 'current starter'} to the bench for week ${week}`}
                          displayLabel="MOVE TO BENCH"
                        />
                      )}
                      {eligible.slice(0, 12).map((asset) => {
                        const assetLabel = labelForAsset(asset);
                        return <LineupMoveForm key={asset.id} seasonFranchiseId={seasonFranchise.id} franchiseId={franchiseId} week={week} slot={slot} slotIndex={slotIndex} slotLabel={label} assetLabel={assetLabel} athleteId={asset.athlete_id} realTeamId={asset.real_team_id} buttonLabel={lineupMoveButtonLabel(assetLabel, label, week)} />;
                      })}
                    </div>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {deadlinePassed && (
        <section className="panel">
          <p className="eyebrow">ROSTER INTEGRITY</p>
          <h2>{integrityActive ? 'Post-deadline protection is active.' : 'Open-roster mode is active.'}</h2>
          <p className="lede">A bad record never locks your roster. You can still use Free Agency and Waivers while competing. Big Exec only protects against standalone releases, protected/core-player dumps, bulk-drop behavior, and explicit season-complete roster locks.</p>
          {seasonFranchise.roster_locked_at && <p className="errorNotice">This franchise is roster-locked: {seasonFranchise.roster_lock_reason ?? 'season competition complete'}.</p>}
          {query.integrity_status === 'requested' && <p className="successNotice">Commissioner review requested. If approved, you will receive a one-time 24-hour override for that roster asset.</p>}
          {query.integrity_error && (
            <p className="errorNotice" role="alert">
              {query.integrity_error}
            </p>
          )}
          {integrityActive && (
            <div className="playerList">
              {(roster ?? []).map((asset) => {
                const pending = pendingReviewEntryIds.has(asset.id);
                return (
                  <article className="playerRow" key={`integrity-${asset.id}`}>
                    <div>
                      <span>{pending ? 'REVIEW PENDING' : 'ONE-TIME EXCEPTION'}</span>
                      <strong>{labelForAsset(asset)}</strong>
                      <small>Request this only when a legitimate post-deadline move is blocked by Roster Integrity.</small>
                    </div>
                    {pending ? (
                      <span className="commandBadge">PENDING</span>
                    ) : (
                      <form className="inlineForm" action={requestRosterIntegrityReview}>
                        <input type="hidden" name="franchise_id" value={franchiseId} />
                        <input type="hidden" name="roster_entry_id" value={asset.id} />
                        <input type="hidden" name="week" value={week} />
                        <input name="manager_note" placeholder="Why is this drop legitimate?" aria-label={`Reason to release ${labelForAsset(asset)}`} />
                        <button className="secondary" type="submit">
                          Request Commissioner Review
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      <section className="panel benchPanel" aria-labelledby="bench-heading">
        <div className="lineupSectionHeading">
          <div>
            <p className="eyebrow">BENCH</p>
            <h2 id="bench-heading">Roster reserves</h2>
          </div>
          <div className="lineupWeekTotal">
            <strong>{benchPoints.toFixed(2)}</strong>
            <small>POINTS LEFT ON BENCH</small>
            <span>{benchAssets.length} PLAYERS</span>
          </div>
        </div>
        <div className="playerList">
          {benchAssets.map((asset) => (
            <div className="playerRow benchScoreRow" aria-label={`${describeAssetForScreenReader(asset, 'bench')} ${pointsForAsset(asset).toFixed(2)} points in week ${week}.${lockForAsset(asset).locked ? ` ${lineupLockExplanation(lockForAsset(asset).game)}.` : ''}`} key={asset.id}>
              <div>
                <span>{lockForAsset(asset).locked ? 'BENCH • LOCKED' : 'BENCH'}</span>
                <strong>{labelForAsset(asset)}</strong>
                <small>
                  Week {week} • {statLineForAsset(asset)}
                </small>
              </div>
              <b className="lineupAssetPoints">
                {pointsForAsset(asset).toFixed(2)} <small>PTS</small>
              </b>
            </div>
          ))}
          {!roster?.length && <p className="errorNotice">No roster yet. Players appear here as soon as the draft is completed.</p>}
        </div>
      </section>
    </main>
  );
}
