# Assistant GM Grounding Rules

## Status

BE-GM-041 is implemented as a deterministic policy layer over the Assistant GM tool boundary.

## Files

- `apps/web/lib/assistant-gm/grounding.ts`
- `apps/web/lib/assistant-gm/grounding.test.ts`

## Rule

Assistant GM answers must be based on successful structured tool results. If a required tool is missing or fails, the assistant must say it cannot retrieve that state instead of inventing an answer.

## Required Tool Map

- Score: `getMatchup`
- Roster: `getRoster`, `getLineup`
- Waiver balance/rules: `getWaiverRules`, `getWaiverState`
- Availability: `searchPlayers`
- Standings: `getStandings`
- Draft status: `getDraftState`
- Injury state: `getInjuryStatus`
- League rules: `getLeague`, `getWaiverRules`

## Failure Message

Unavailable state returns a direct refusal to fabricate, for example:

```text
I cannot retrieve the required score state right now. Required tool failed or were missing: getMatchup.
```

## Known Limits

This task does not implement natural-language routing or answer prose for supported intents. It creates the guardrail future Assistant GM intent handlers must call before rendering factual answers.
