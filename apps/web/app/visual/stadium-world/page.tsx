import { notFound } from 'next/navigation';
import { StadiumWorldPrototype } from '../../franchises/[franchiseId]/stadium/StadiumWorldPrototype';

export default function StadiumWorldVisualHarness() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return <main className="stadiumPage" style={{ '--team-primary': '#d9b43b', '--team-secondary': '#f5f1e8', padding: '24px' } as React.CSSProperties}>
    <StadiumWorldPrototype
      franchiseName="High Volts"
      abbreviation="HV"
      primary="#d9b43b"
      secondary="#f5f1e8"
      titleCount={2}
      rivalryCount={5}
      unlockedFeatureCount={4}
    />
  </main>;
}
