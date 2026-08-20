# Architecture

## Source of truth
Supabase stores authoritative league, roster, schedule, raw-stat and calculated-score state. Application packages consume normalized records and do not treat AI output as authoritative.

## Boundaries

### Sports data
`@fantasy-all-sports/sports-data` defines a provider-neutral contract. Provider payloads must be normalized before they enter the core database. Provider IDs live separately from canonical athlete/team IDs so vendors can be swapped without rewriting fantasy history.

### Fantasy core
`@fantasy-all-sports/fantasy-core` owns deterministic scoring and roster rules. The first supported scoring profile is Pro Football Half-PPR plus standard D/ST scoring.

### Competition engine
`@fantasy-all-sports/competition-engine` owns weekly event semantics: Circuit, Rivalry, Revenge, Position, Chaos, Judgment, and postseason. Matchup resolution is deterministic.

### Story engine
`@fantasy-all-sports/story-engine` may turn authoritative facts into presentation copy. It may never invent or decide scores, winners, injuries, transactions or statistics.

## Security
- RLS enabled on all public-schema tables.
- Public sports reference data is read-only to clients.
- League-specific data is visible only to league members.
- Commissioner-only settings and sensitive writes are server controlled.
- Service-role and sports-provider credentials are server secrets only.

## Product rollout
1. Pro Football vertical slice.
2. Historical scoring/data validation.
3. League creation, franchise identity, draft, roster, lineup and matchup loop.
4. Persistent standings/history/rivalries/progression.
5. Basketball, baseball and soccer adapters after football is stable.
