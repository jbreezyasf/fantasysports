import { notFound, redirect } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/server';
import { StadiumLegacyExperience, type LeagueAward, type StadiumAchievement, type StadiumFeature } from './StadiumLegacyExperience';

type FranchiseRef = { id: string; name?: string | null; abbreviation?: string | null };
type AchievementRef = { code?: string | null; display_name?: string | null; description?: string | null };
type EarnedRow = { id: string; earned_at?: string | null; week?: number | null; achievements?: AchievementRef | AchievementRef[] | null };
type FeatureRef = { code?: string | null; display_name?: string | null; zone?: string | null; asset_key?: string | null; achievement_code?: string | null };
type UnlockedFeatureRow = { unlocked_at?: string | null; stadium_features?: FeatureRef | FeatureRef[] | null };
type LeagueSeasonRef = { id: string; competition_season_id?: string | null; competition_seasons?: { season_year?: number | null } | { season_year?: number | null }[] | null };
type ChampionshipRow = { id: string; league_season_id: string; bracket?: string | null; winner_season_franchise_id?: string | null; runner_up_season_franchise_id?: string | null; awarded_at?: string | null };
type WeeklyAwardRow = { id: string; league_season_id: string; week?: number | null; code?: string | null; title?: string | null; winner_season_franchise_id?: string | null; created_at?: string | null };
type SeasonFranchiseRow = { id: string; league_season_id: string; franchise_id: string; franchises?: FranchiseRef | FranchiseRef[] | null };

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function featureName(feature: FeatureRef | null) {
  return feature?.display_name ?? 'Stadium Feature';
}

function trophyName(bracket?: string | null) {
  const normalized = (bracket ?? '').toLowerCase();
  if (normalized.includes('redemption') || normalized.includes('consolation') || normalized.includes('be')) return 'BE Trophy';
  return 'Big Exec Trophy';
}

function awardDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function StadiumPage({ params }: { params: Promise<{ franchiseId: string }> }) {
  const { franchiseId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: franchise, error: franchiseError } = await supabase
    .from('franchises')
    .select('id,name,abbreviation,league_id,primary_color,secondary_color,established_year')
    .eq('id', franchiseId)
    .maybeSingle();

  if (franchiseError) {
    return <main><p className="errorNotice" role="alert">We could not load this franchise: {franchiseError.message}</p><a className="secondary" href="/dashboard">Return Home</a></main>;
  }
  if (!franchise) notFound();

  const { data: stadium, error: stadiumError } = await supabase
    .from('stadiums')
    .select('id,environment_key')
    .eq('franchise_id', franchiseId)
    .maybeSingle();

  if (stadiumError) {
    return <main><p className="errorNotice" role="alert">We could not load your stadium: {stadiumError.message}</p><a className="secondary" href={`/franchises/${franchiseId}/team`}>Return to Team</a></main>;
  }
  if (!stadium) {
    return <main><p className="errorNotice" role="alert">Your franchise exists, but its starter stadium has not been provisioned yet.</p><a className="secondary" href={`/franchises/${franchiseId}/team`}>Return to Team</a></main>;
  }

  const [{ data: earned }, { data: unlocked }, { data: allFeatures }, { data: leagueSeasons }] = await Promise.all([
    supabase.from('franchise_achievements').select('id,earned_at,week,achievements(code,display_name,description)').eq('franchise_id', franchiseId).order('earned_at', { ascending: false }),
    supabase.from('franchise_stadium_features').select('unlocked_at,stadium_features(code,display_name,zone,asset_key,achievement_code)').eq('stadium_id', stadium.id).order('unlocked_at'),
    supabase.from('stadium_features').select('code,display_name,zone,achievement_code').eq('active', true).order('zone').order('display_name'),
    supabase.from('league_seasons').select('id,competition_season_id,competition_seasons(season_year)').eq('league_id', franchise.league_id)
  ]);

  const seasons = ((leagueSeasons ?? []) as LeagueSeasonRef[])
    .map((season) => ({ id: season.id, seasonYear: first(season.competition_seasons)?.season_year ?? null }))
    .sort((a, b) => (b.seasonYear ?? 0) - (a.seasonYear ?? 0))
    .slice(0, 5);
  const seasonIds = seasons.map((season) => season.id);
  const seasonYearById = new Map(seasons.map((season) => [season.id, season.seasonYear]));

  const [{ data: championships }, { data: weeklyAwards }, { data: seasonFranchises }] = seasonIds.length ? await Promise.all([
    supabase.from('championships').select('id,league_season_id,bracket,winner_season_franchise_id,runner_up_season_franchise_id,awarded_at').in('league_season_id', seasonIds).order('awarded_at', { ascending: false }),
    supabase.from('weekly_awards').select('id,league_season_id,week,code,title,winner_season_franchise_id,created_at').in('league_season_id', seasonIds).order('created_at', { ascending: false }).limit(40),
    supabase.from('season_franchises').select('id,league_season_id,franchise_id,franchises(id,name,abbreviation)').in('league_season_id', seasonIds)
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

  const franchiseBySeasonFranchise = new Map(
    ((seasonFranchises ?? []) as SeasonFranchiseRow[]).map((row) => [row.id, first(row.franchises)])
  );

  const leagueAwards: LeagueAward[] = [
    ...((championships ?? []) as ChampionshipRow[]).map((championship) => {
      const winner = championship.winner_season_franchise_id ? franchiseBySeasonFranchise.get(championship.winner_season_franchise_id) : null;
      const runnerUp = championship.runner_up_season_franchise_id ? franchiseBySeasonFranchise.get(championship.runner_up_season_franchise_id) : null;
      return {
        id: championship.id,
        kind: 'championship' as const,
        seasonYear: seasonYearById.get(championship.league_season_id) ?? null,
        awardName: trophyName(championship.bracket),
        bracket: championship.bracket ?? 'championship',
        winnerName: winner?.name ?? 'Unassigned',
        winnerAbbreviation: winner?.abbreviation ?? null,
        runnerUpName: runnerUp?.name ?? null,
        awardedAt: awardDate(championship.awarded_at)
      };
    }),
    ...((weeklyAwards ?? []) as WeeklyAwardRow[]).map((award) => {
      const winner = award.winner_season_franchise_id ? franchiseBySeasonFranchise.get(award.winner_season_franchise_id) : null;
      return {
        id: award.id,
        kind: 'weekly' as const,
        seasonYear: seasonYearById.get(award.league_season_id) ?? null,
        awardName: award.title ?? award.code?.replaceAll('_', ' ') ?? 'Weekly Award',
        bracket: award.week ? `Week ${award.week}` : 'Weekly Award',
        winnerName: winner?.name ?? 'Unassigned',
        winnerAbbreviation: winner?.abbreviation ?? null,
        runnerUpName: null,
        awardedAt: awardDate(award.created_at)
      };
    })
  ].sort((a, b) => (b.seasonYear ?? 0) - (a.seasonYear ?? 0));

  const unlockedFeatures = ((unlocked ?? []) as UnlockedFeatureRow[])
    .map((row) => ({ ...first(row.stadium_features), unlockedAt: row.unlocked_at } as StadiumFeature))
    .filter((feature) => Boolean(feature.code));
  const unlockedCodes = new Set(unlockedFeatures.map((feature) => feature.code));
  const lockedFeatures = ((allFeatures ?? []) as FeatureRef[])
    .filter((feature) => !unlockedCodes.has(feature.code))
    .map((feature) => ({ ...feature, unlockedAt: null } as StadiumFeature));
  const next = ((allFeatures ?? []) as FeatureRef[]).find((feature) => !unlockedCodes.has(feature.code));
  const achievements: StadiumAchievement[] = ((earned ?? []) as EarnedRow[]).map((row) => {
    const achievement = first(row.achievements);
    return {
      id: row.id,
      code: achievement?.code ?? 'ACHIEVEMENT',
      displayName: achievement?.display_name ?? 'Achievement',
      description: achievement?.description ?? 'Recorded franchise achievement.',
      earnedAt: awardDate(row.earned_at),
      week: row.week ?? null
    };
  });
  const titleCount = achievements.filter((achievement) => achievement.code === 'LEAGUE_CHAMPION').length;
  const rivalryCount = achievements.filter((achievement) => achievement.code === 'RIVALRY_WIN').length;
  const primary = franchise.primary_color ?? '#d9b43b';
  const secondary = franchise.secondary_color ?? '#f5f1e8';
  const abbr = (franchise.abbreviation ?? franchise.name.slice(0, 3)).toUpperCase();

  return <main className="stadiumPage">
    <nav className="franchiseNav" aria-label="Franchise navigation">
      <a href="/dashboard">Home</a>
      <a href={`/leagues/${franchise.league_id}`}>League HQ</a>
      <a href={`/franchises/${franchiseId}/team`}>Team</a>
      <a aria-current="page" href={`/franchises/${franchiseId}/stadium`}>My Stadium</a>
    </nav>
    <section className="leagueHero stadiumLegacyHero" style={{ '--stadium-primary': primary, '--stadium-secondary': secondary } as React.CSSProperties}>
      <div className="leagueHeroGlow" />
      <div className="leagueTopline">
        <a className="backLink" href={`/franchises/${franchiseId}/team`}>← TEAM HQ</a>
        <span className="leagueRole">MY STADIUM</span>
      </div>
      <div className="leagueHeroContent">
        <p className="eyebrow">BIG EXEC • FRANCHISE LEGACY</p>
        <h1>{franchise.name}</h1>
        <p className="leagueTagline">{titleCount} Title{titleCount === 1 ? '' : 's'} • {rivalryCount} Rivalry Win{rivalryCount === 1 ? '' : 's'} • Est. {franchise.established_year}</p>
        <div className="leagueMetaRow">
          <span>{stadium.environment_key.replaceAll('_', ' ').toUpperCase()}</span>
          <span>{unlockedFeatures.length} FEATURES UNLOCKED</span>
          <span>{leagueAwards.filter((award) => award.kind === 'championship').length} TROPHIES STORED</span>
        </div>
      </div>
    </section>

    <StadiumLegacyExperience
      franchise={{ id: franchise.id, name: franchise.name, abbreviation: abbr, primary, secondary, establishedYear: franchise.established_year }}
      stadiumName={`${abbr} Neon Dome`}
      achievements={achievements}
      unlockedFeatures={unlockedFeatures}
      lockedFeatures={lockedFeatures}
      leagueAwards={leagueAwards}
      nextUnlock={next ? featureName(next) : null}
    />
  </main>;
}
