# Assistant GM Player Search And Comparison Intents

## Status

BE-GM-044 is implemented as deterministic player-search and comparison answer rendering over structured tool responses.

## Files

- `apps/web/lib/assistant-gm/playerSearchIntents.ts`
- `apps/web/lib/assistant-gm/playerSearchIntents.test.ts`

## Supported Intents

- `player_details`: answers “Tell me about PLAYER.”
- `compare_players`: answers “Compare PLAYER A and PLAYER B.”
- `best_available`: answers “Best available running backs.”
- `available_by_position`: answers “Who is available at receiver?”

## Guardrails

- Ambiguous player searches trigger a clarification prompt.
- Rostered players are not presented as available.
- Missing player records block comparison rather than silently substituting another player.
- Best-available and available-by-position answers include an internal source label, defaulting to current Big Exec player pool and roster ownership.

## Known Limits

This task does not implement natural-language player-name parsing. It renders answers from already-selected structured tool results.
