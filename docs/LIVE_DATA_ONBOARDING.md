# Live data onboarding

Big Exec keeps vendor payloads outside fantasy logic. Each provider adapter must normalize teams, athletes, games, and raw athlete-game statistics through `@fantasy-all-sports/sports-data` before data reaches Supabase.

## Credentials to collect

- Provider/account name
- Server API key
- Base URL, when the provider offers multiple environments
- Webhook signing secret, when webhooks are supported
- Plan limits and permitted refresh frequency
- Supported football feeds: teams, players, schedule/game state, injuries, box scores, play-by-play, and team defense

Store these only in Vercel or the private worker environment:

```env
SPORTS_DATA_PROVIDER=
SPORTS_DATA_API_KEY=
SPORTS_DATA_BASE_URL=
SPORTS_DATA_WEBHOOK_SECRET=
SPORTS_DATA_TIMEOUT_MS=15000
```

Never prefix provider secrets with `NEXT_PUBLIC_`, paste them into chat, or commit them to GitHub.

## Adapter acceptance sequence

1. Confirm the provider's IDs and licensing terms, including whether derived fantasy scores may be displayed.
2. Implement mapping into the normalized provider contract without changing Big Exec scoring or D/ST rules.
3. Import teams and athletes into a staging path and record provider IDs separately from canonical IDs.
4. Import one historical week and compare all offensive, kicker, and whole-team D/ST calculations with Gate 1 validation.
5. Prove scheduled → in-progress → final game-state transitions and correction handling.
6. Add rate-limit backoff, bounded retries, idempotent upserts, source timestamps, and structured sync results.
7. Enable production schedules only after staging reconciliation reports zero unexplained scoring differences.

## Supabase readiness constraints

- Supabase remains the authoritative application store; provider responses are never queried directly from a browser.
- New public-schema tables must be deliberately exposed to the Data API and protected with RLS. Current Supabase behavior no longer guarantees automatic Data API exposure.
- Realtime is not promised until the appropriate tables are added to `supabase_realtime`, client subscriptions and reconnect behavior are tested, and timer/autopick transitions are proven.
- Pull and reconcile production migration history before making the next schema change; do not manufacture a baseline migration.

## Human handoff

Once the provider account is active, enter the credentials directly in Vercel. The next engineering step is a provider-specific adapter and a historical-week reconciliation run. No UI rewrite should be required.
