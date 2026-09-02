# Assistant GM Draft Read Intents

## Status

BE-GM-045 is implemented as deterministic draft answer rendering over structured Assistant GM tool results.

## Files

- `apps/web/lib/assistant-gm/draftIntents.ts`
- `apps/web/lib/assistant-gm/draftIntents.test.ts`

## Supported Intents

- `available_players`: answers “Who is available?”
- `best_position_available`: answers “Who is the best RB available?”
- `next_pick`: answers “When is my next pick?”
- `position_need`: answers “What position do I need?”
- `recent_picks`: answers “Who was just drafted?”
- `verify_player_available`: verifies a requested player is still available and refuses silent substitution.

## Freshness

Draft availability answers include the current pick. If the caller provides an expected current pick and the structured draft state has advanced, the answer is blocked:

```text
Draft state changed from pick 3 to pick 4. I need fresh draft data before answering.
```

## Grounding

All draft answers require successful `getDraftState`. Availability answers also require successful `getDraftAvailablePlayers`, which is populated through current draft picks and the canonical draft-ranking helper.
