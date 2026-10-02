import { notFound } from 'next/navigation';
import { StadiumWorld } from '../../franchises/[franchiseId]/stadium/StadiumWorld';

type SearchParams = Record<string, string | string[] | undefined>;

function count(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 20 ? parsed : fallback;
}

// Preview-only harness with explicitly synthetic data. Not reachable in production.
// ?titles=0&rivalries=0&unlocks=0 shows a brand-new franchise; ?mode=2d forces the standard view.
export default async function StadiumWorldVisualHarness({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = await searchParams;
  const titleCount = count(params.titles, 2);
  const rivalryCount = count(params.rivalries, 5);
  const unlockedFeatureCount = count(params.unlocks, 4);

  return <main className="stadiumPage" style={{ '--team-primary': '#d9b43b', '--team-secondary': '#f5f1e8', padding: '24px' } as React.CSSProperties}>
    <p className="stadiumWorldNotice">Preview harness: synthetic High Volts data ({titleCount} titles, {rivalryCount} rivalry wins, {unlockedFeatureCount} unlocks). Not live league data.</p>
    <StadiumWorld
      franchiseName="High Volts"
      abbreviation="HV"
      primary="#d9b43b"
      secondary="#f5f1e8"
      titleCount={titleCount}
      rivalryCount={rivalryCount}
      unlockedFeatureCount={unlockedFeatureCount}
      qaCapture
      force2d={params.mode === '2d'}
      fallback={<div className="stadiumWorldFallback">Standard (2D) stadium view. In the app this is the existing Stadium exhibit scene with the same franchise data.</div>}
    />
  </main>;
}
