# Assistant GM Matchup And Standings Read Intents

## Status

BE-GM-043 is implemented as deterministic read-intent rendering over structured Assistant GM tool results.

## Files

- `apps/web/lib/assistant-gm/matchupStandingsIntents.ts`
- `apps/web/lib/assistant-gm/matchupStandingsIntents.test.ts`

## Supported Intents

- `score`: answers “What’s the score?”
- `am_i_winning`: answers “Am I winning?”
- `left_to_play`: answers “Who is left to play?” only when verified game-status data exists.
- `projection`: answers “What is my projection?” only when verified projection data exists and labels it as projection, not current score.
- `my_standing`: answers “Where am I in the standings?”
- `first_place`: answers “Who is in first?”

## Grounding

- Score, winning/trailing, remaining-player, and projection answers require successful `getMatchup`.
- Standings answers require successful `getStandings`.
- Missing tools or failed tools return the shared unavailable-state message from `apps/web/lib/assistant-gm/grounding.ts`.

## Known Limits

The current verified matchup route does not expose projection or player game-status data. Those intents therefore return explicit unavailable-state messages unless future canonical score/projection/game-status fields are added to the structured tool response.
