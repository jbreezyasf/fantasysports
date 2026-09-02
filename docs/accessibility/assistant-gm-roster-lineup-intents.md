# Assistant GM Roster And Lineup Read Intents

## Status

BE-GM-042 is implemented as deterministic read-intent rendering over the structured Assistant GM tool boundary.

## Files

- `apps/web/lib/assistant-gm/rosterLineupIntents.ts`
- `apps/web/lib/assistant-gm/rosterLineupIntents.test.ts`

## Supported Intents

- `read_lineup`: answers “Read my lineup.”
- `read_bench`: answers “Who is on my bench?”
- `injured_players`: answers “Do I have any injured players?”
- `empty_lineup_spots`: answers “Do I have empty lineup spots?”
- `plays_tonight`: refuses to invent game-time state unless verified `game_starts_at` data is present in the structured lineup data.

## Grounding

All answers require successful `getRoster` and `getLineup` tool responses through `apps/web/lib/assistant-gm/grounding.ts`. If either tool is missing or fails, the answer is an explicit unavailable-state message.

## Known Limits

The current verified lineup route does not load real-game kickoff times. `plays_tonight` therefore returns an unavailable-state message unless a future canonical schedule/game-time source is added to the tool data.
