# Assistant GM Tool Boundary

## Status

BE-GM-040 is implemented as a server-side read boundary. No LLM endpoint, voice surface, or write transaction path is exposed by this task.

## Files

- `apps/web/lib/assistant-gm/tools.ts`
- `apps/web/lib/assistant-gm/tools.test.ts`

## Contract

All Assistant GM tools accept a `leagueId`, authenticated `userId`, and a server Supabase client supplied by the caller. The LLM receives structured tool outputs only; it does not receive unrestricted database access.

Every current tool is read-only:

- `getLeague`
- `getRoster`
- `getLineup`
- `getMatchup`
- `getStandings`
- `searchPlayers`
- `getPlayerDetails`
- `comparePlayers`
- `getAvailablePlayers`
- `getWaiverState`
- `getWaiverRules`
- `getDraftState`
- `getDraftAvailablePlayers`
- `getDraftQueue`
- `getInjuryStatus`

## Authorization Rules

- League-wide reads require a `league_members` row for the authenticated user.
- Roster, lineup, waiver state, and draft queue reads require an active `franchise_owners` row for a franchise in the current league season.
- Matchup reads verify the matchup belongs to the requested league season before returning state.

## Canonical Logic

The boundary reads the same Supabase tables used by the current UI and reuses existing fantasy helpers:

- player pool: `apps/web/lib/fantasy/athletePool.ts`
- draft rankings: `apps/web/lib/fantasy/draftRankings.ts`
- authoritative rosters: `roster_entries`
- authoritative lineups: `lineups`
- authoritative scores/matchups: `matchups`, `fantasy_player_scores`, `fantasy_team_scores`
- authoritative standings: `standings`
- waiver state: `waiver_holds`, `waiver_claims`
- draft state: `drafts`, `draft_picks`, `draft_queues`

## Error Shape

Every tool returns either:

```ts
{ ok: true, tool, data }
```

or:

```ts
{ ok: false, tool, error: { code, message } }
```

The LLM layer must treat failed tools as unavailable state and must not invent missing facts.

## Known Limits

- This task does not implement Assistant GM natural-language intent parsing.
- This task does not implement write actions.
- Feature flags are still required before exposing Assistant GM or Voice GM user-facing capabilities.
