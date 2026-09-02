# Assistant GM Sunday Briefing

## Status

BE-GM-047 is implemented as a deterministic team-health briefing composer over the existing Assistant GM read tools.

## Files

- `apps/web/lib/assistant-gm/sundayBriefing.ts`
- `apps/web/lib/assistant-gm/sundayBriefing.test.ts`

## Checks

- Empty lineup slots from `getLineup`
- Out/inactive/questionable/doubtful players from `getRoster`
- Bye-week players when verified `bye_week` data is present in `getRoster`
- Matchup projection from `getMatchup`, labelled as projection and not current score
- Bench replacement opportunity when ranking data is present in `getRoster`
- Waiver/free-agent opportunity from `getAvailablePlayers`

## Guardrails

- No autonomous transaction is performed.
- Recommendations are labelled as recommendations.
- Each item includes a `sourceTool`.
- Missing required matchup/roster/waiver state blocks the briefing rather than fabricating urgency.
- Unsupported checks are represented as unavailable state, not urgent warnings.

## Follow-Up

Future Assistant UI can let the user address one item by using each item's `check` value as a stable issue key.
