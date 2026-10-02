import { notFound } from 'next/navigation';
import { StadiumWorld } from '../../franchises/[franchiseId]/stadium/StadiumWorld';

type SearchParams = Record<string, string | string[] | undefined>;

function count(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 20 ? parsed : fallback;
}

const SAMPLE_FEATURES = ['Founders Plaza', 'Rivalry Monument', 'Chaos Fountain', 'Giant Killer Statue', 'Redemption Arch', 'Gold Seat Section', 'Victory Lights'];

// Preview-only harness with explicitly synthetic data. Not reachable in production.
// ?titles=0&rivalries=0&unlocks=0 shows a brand-new franchise; ?zone=owners-suite deep links; ?mode=2d forces the standard view.
export default async function StadiumWorldVisualHarness({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = await searchParams;
  const titleCount = count(params.titles, 2);
  const rivalryCount = count(params.rivalries, 5);
  const unlockCount = Math.min(count(params.unlocks, 4), SAMPLE_FEATURES.length);
  const titleYears = Array.from({ length: titleCount }, (_, index) => 2026 + index * 2);
  const unlockedFeatures = SAMPLE_FEATURES.slice(0, unlockCount).map((name) => ({ name }));

  return <main className="stadiumPage stadiumWorldHarness" style={{ '--team-primary': '#d9b43b', '--team-secondary': '#f5f1e8' } as React.CSSProperties}>
    <p className="stadiumWorldNotice">Preview harness · synthetic High Volts data ({titleCount} titles, {rivalryCount} rivalry wins, {unlockCount} unlocks). Not live league data.</p>
    <StadiumWorld
      franchiseName="High Volts"
      abbreviation="HV"
      primary="#d9b43b"
      secondary="#f5f1e8"
      establishedYear={2026}
      titleYears={titleYears}
      rivalryCount={rivalryCount}
      unlockedFeatures={unlockedFeatures}
      nextUnlock={SAMPLE_FEATURES[unlockCount] ?? null}
      qaCapture
      force2d={params.mode === '2d'}
      fallback={<div className="stadiumWorldFallback">Standard (2D) stadium view. In the app this is the existing Stadium exhibit scene with the same franchise data.</div>}
    />
  </main>;
}
