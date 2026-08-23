type SportIdentityProps = {
  code?: string | null;
  displayName?: string | null;
  compact?: boolean;
};

const SPORT_IDENTITIES: Record<string, { label: string; ball: string; tone: string }> = {
  pro_football: { label: 'Pro Football', ball: '🏈', tone: '#d9b43b' },
  football: { label: 'Football', ball: '🏈', tone: '#d9b43b' },
  womens_basketball: { label: "Women's Basketball", ball: '🏀', tone: '#9b5cff' },
  basketball: { label: 'Basketball', ball: '🏀', tone: '#9b5cff' },
  soccer: { label: 'Soccer', ball: '⚽', tone: '#20c987' },
  baseball: { label: 'Baseball', ball: '⚾', tone: '#1d7cff' },
};

export function SportIdentity({ code, displayName, compact = false }: SportIdentityProps) {
  const key = String(code ?? 'pro_football').toLowerCase();
  const identity = SPORT_IDENTITIES[key] ?? {
    label: displayName || 'Fantasy Sports',
    ball: '◆',
    tone: '#d9b43b',
  };

  return (
    <span
      className={`sportIdentity${compact ? ' compact' : ''}`}
      style={{ '--sport-tone': identity.tone } as React.CSSProperties}
      aria-label={displayName || identity.label}
    >
      <span className="sportIdentityBall" aria-hidden="true">{identity.ball}</span>
      <span>{displayName || identity.label}</span>
    </span>
  );
}
