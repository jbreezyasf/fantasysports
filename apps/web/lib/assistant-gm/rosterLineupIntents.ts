import { groundedAssistantAnswer } from './grounding';
import type { AssistantGmToolResponse } from './tools';

type Relation<T> = T | T[] | null | undefined;
type Athlete = { display_name?: string; position?: string; injury_status?: string | null; real_teams?: Relation<{ abbreviation?: string | null }> };
type RealTeam = { display_name?: string | null; abbreviation?: string | null };
type RosterAsset = { id: string; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; real_teams?: Relation<RealTeam> };
type LineupAsset = { slot: string; slot_index: number; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; real_teams?: Relation<RealTeam>; game_starts_at?: string | null };
type RosterToolData = { roster?: RosterAsset[] };
type LineupToolData = { week?: number; lineup?: LineupAsset[] };

const expectedSlots = ['QB1', 'RB1', 'RB2', 'WR1', 'WR2', 'TE1', 'FLEX1', 'K1', 'D/ST1'];

export type RosterLineupIntent = 'read_lineup' | 'read_bench' | 'injured_players' | 'plays_tonight' | 'empty_lineup_spots';

function first<T>(value: Relation<T>): T | null {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function assetKey(asset: { athlete_id?: string | null; real_team_id?: string | null }) {
  return asset.athlete_id ? `athlete:${asset.athlete_id}` : asset.real_team_id ? `team:${asset.real_team_id}` : null;
}

function slotName(asset: LineupAsset) {
  return `${asset.slot === 'DST' ? 'D/ST' : asset.slot}${asset.slot_index}`;
}

function assetLabel(asset: RosterAsset | LineupAsset) {
  const athlete = first(asset.athletes);
  if (athlete) {
    const team = first(athlete.real_teams);
    return `${athlete.display_name ?? 'Player'}${athlete.position ? `, ${athlete.position}` : ''}${team?.abbreviation ? `, ${team.abbreviation}` : ''}`;
  }
  const team = first(asset.real_teams);
  return `${team?.abbreviation ?? team?.display_name ?? 'Team'} D/ST`;
}

function successfulData<T>(responses: AssistantGmToolResponse[], tool: AssistantGmToolResponse['tool']) {
  const response = responses.find((item) => item.tool === tool);
  return response?.ok ? response.data as T : null;
}

export function answerRosterLineupIntent(intent: RosterLineupIntent, toolResponses: AssistantGmToolResponse[]) {
  return groundedAssistantAnswer({
    categories: ['roster'],
    toolResponses,
    render: () => {
      const rosterData = successfulData<RosterToolData>(toolResponses, 'getRoster');
      const lineupData = successfulData<LineupToolData>(toolResponses, 'getLineup');
      const roster = rosterData?.roster ?? [];
      const lineup = lineupData?.lineup ?? [];
      const week = lineupData?.week ?? 1;
      const lineupKeys = new Set(lineup.map(assetKey).filter(Boolean));

      if (intent === 'read_lineup') {
        if (!lineup.length) return `I found no submitted starters for week ${week}.`;
        return `Week ${week} lineup: ${lineup.map((asset) => `${slotName(asset)} ${assetLabel(asset)}`).join('; ')}.`;
      }

      if (intent === 'read_bench') {
        const bench = roster.filter((asset) => {
          const key = assetKey(asset);
          return key && !lineupKeys.has(key);
        });
        if (!bench.length) return 'I found no bench players outside your current lineup.';
        return `Bench: ${bench.map(assetLabel).join('; ')}.`;
      }

      if (intent === 'injured_players') {
        const injured = roster.filter((asset) => {
          const status = first(asset.athletes)?.injury_status?.trim().toLowerCase();
          return status && !['healthy', 'active', 'none'].includes(status);
        });
        if (!injured.length) return 'No verified injured players are listed on your roster.';
        return `Verified injury statuses: ${injured.map((asset) => `${assetLabel(asset)} is ${first(asset.athletes)?.injury_status}`).join('; ')}.`;
      }

      if (intent === 'empty_lineup_spots') {
        const filledSlots = new Set(lineup.map(slotName));
        const empty = expectedSlots.filter((slot) => !filledSlots.has(slot));
        if (!empty.length) return `No empty starter spots found for week ${week}.`;
        return `Empty starter spots for week ${week}: ${empty.join(', ')}.`;
      }

      const gameTimes = lineup.filter((asset) => asset.game_starts_at);
      if (!gameTimes.length) return 'I cannot retrieve verified game-time state for your lineup right now.';
      return `Verified lineup game times: ${gameTimes.map((asset) => `${assetLabel(asset)} starts at ${asset.game_starts_at}`).join('; ')}.`;
    }
  });
}
