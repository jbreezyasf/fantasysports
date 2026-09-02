import { checkGrounding, unavailableStateMessage } from './grounding';
import type { AssistantGmToolName, AssistantGmToolResponse } from './tools';

type Relation<T> = T | T[] | null | undefined;
type Athlete = { display_name?: string; position?: string; injury_status?: string | null; bye_week?: number | null; real_teams?: Relation<{ abbreviation?: string | null }> };
type RosterAsset = { id: string; athlete_id?: string | null; real_team_id?: string | null; athletes?: Relation<Athlete>; overallRank?: number };
type LineupAsset = { slot: string; slot_index: number; athlete_id?: string | null; real_team_id?: string | null };
type RosterData = { roster?: RosterAsset[] };
type LineupData = { week?: number; lineup?: LineupAsset[] };
type MatchupData = { projection?: { requester?: number | null; opponent?: number | null } | null };
type AvailableData = { players?: Array<{ display_name?: string; displayName?: string; position?: string; team?: string; availability?: string; overallRank?: number }>; source?: string };

export type SundayBriefingItem = {
  check: 'empty_lineup' | 'injury' | 'bye_week' | 'projection' | 'bench_replacement' | 'waiver_opportunity';
  message: string;
  sourceTool: AssistantGmToolName;
  recommendation?: boolean;
};

export type SundayBriefing = {
  ok: true;
  summary: string;
  items: SundayBriefingItem[];
} | {
  ok: false;
  summary: string;
  items: SundayBriefingItem[];
};

const expectedSlots = ['QB1', 'RB1', 'RB2', 'WR1', 'WR2', 'TE1', 'FLEX1', 'K1', 'D/ST1'];

function first<T>(value: Relation<T>): T | null {
  return !value ? null : Array.isArray(value) ? value[0] ?? null : value;
}

function successfulData<T>(responses: AssistantGmToolResponse[], tool: AssistantGmToolName) {
  const response = responses.find((item) => item.tool === tool);
  return response?.ok ? response.data as T : null;
}

function assetKey(asset: { athlete_id?: string | null; real_team_id?: string | null }) {
  return asset.athlete_id ? `athlete:${asset.athlete_id}` : asset.real_team_id ? `team:${asset.real_team_id}` : null;
}

function slotName(asset: LineupAsset) {
  return `${asset.slot === 'DST' ? 'D/ST' : asset.slot}${asset.slot_index}`;
}

function athleteLabel(asset: RosterAsset) {
  const athlete = first(asset.athletes);
  const team = first(athlete?.real_teams);
  return `${athlete?.display_name ?? 'Player'}${athlete?.position ? `, ${athlete.position}` : ''}${team?.abbreviation ? `, ${team.abbreviation}` : ''}`;
}

function playerLabel(player: NonNullable<AvailableData['players']>[number]) {
  return `${player.display_name ?? player.displayName ?? 'Player'}${player.position ? `, ${player.position}` : ''}${player.team ? `, ${player.team}` : ''}`;
}

export function buildSundayBriefing(toolResponses: AssistantGmToolResponse[]): SundayBriefing {
  const grounding = checkGrounding(['roster', 'score', 'waiver_balance'], toolResponses);
  const unavailable = unavailableStateMessage(grounding);
  if (unavailable) return { ok: false, summary: unavailable, items: [] };

  const roster = successfulData<RosterData>(toolResponses, 'getRoster')?.roster ?? [];
  const lineupData = successfulData<LineupData>(toolResponses, 'getLineup');
  const lineup = lineupData?.lineup ?? [];
  const week = lineupData?.week ?? 1;
  const matchup = successfulData<MatchupData>(toolResponses, 'getMatchup');
  const available = successfulData<AvailableData>(toolResponses, 'getAvailablePlayers');
  const lineupKeys = new Set(lineup.map(assetKey).filter(Boolean));
  const items: SundayBriefingItem[] = [];

  const empty = expectedSlots.filter((slot) => !new Set(lineup.map(slotName)).has(slot));
  if (empty.length) {
    items.push({ check: 'empty_lineup', sourceTool: 'getLineup', message: `Empty starter spots for week ${week}: ${empty.join(', ')}.` });
  }

  const injured = roster.filter((asset) => {
    const status = first(asset.athletes)?.injury_status?.trim().toLowerCase();
    return status && ['out', 'inactive', 'questionable', 'doubtful'].includes(status);
  });
  for (const asset of injured) {
    items.push({ check: 'injury', sourceTool: 'getRoster', message: `${athleteLabel(asset)} is ${first(asset.athletes)?.injury_status}.` });
  }

  const byePlayers = roster.filter((asset) => first(asset.athletes)?.bye_week === week);
  for (const asset of byePlayers) {
    items.push({ check: 'bye_week', sourceTool: 'getRoster', message: `${athleteLabel(asset)} is listed with a verified Week ${week} bye.` });
  }
  if (!roster.some((asset) => first(asset.athletes)?.bye_week !== undefined)) {
    items.push({ check: 'bye_week', sourceTool: 'getRoster', message: 'Bye-week player state is not present in the verified roster data.' });
  }

  if (matchup?.projection?.requester != null && matchup.projection.opponent != null) {
    items.push({ check: 'projection', sourceTool: 'getMatchup', message: `Projection, not current score: you ${matchup.projection.requester.toFixed(2)}, opponent ${matchup.projection.opponent.toFixed(2)}.` });
  } else {
    items.push({ check: 'projection', sourceTool: 'getMatchup', message: 'Verified matchup projection is not available.' });
  }

  const bench = roster.filter((asset) => {
    const key = assetKey(asset);
    return key && !lineupKeys.has(key);
  }).sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER));
  if (bench[0]?.overallRank !== undefined) {
    items.push({ check: 'bench_replacement', sourceTool: 'getRoster', recommendation: true, message: `Recommendation: highest-ranked verified bench option is ${athleteLabel(bench[0])}.` });
  } else {
    items.push({ check: 'bench_replacement', sourceTool: 'getRoster', message: 'High-value bench replacement ranking is not present in verified roster data.' });
  }

  const waiverCandidate = (available?.players ?? [])
    .filter((player) => (player.availability ?? '').toLowerCase() === 'available')
    .sort((a, b) => (a.overallRank ?? Number.MAX_SAFE_INTEGER) - (b.overallRank ?? Number.MAX_SAFE_INTEGER))[0];
  if (waiverCandidate) {
    items.push({ check: 'waiver_opportunity', sourceTool: 'getAvailablePlayers', recommendation: true, message: `Recommendation: waiver/free-agent option to inspect is ${playerLabel(waiverCandidate)}. Source: ${available?.source ?? 'current player pool'}. No transaction has been made.` });
  } else {
    items.push({ check: 'waiver_opportunity', sourceTool: 'getAvailablePlayers', message: 'No verified waiver/free-agent opportunity is available from the current tool data.' });
  }

  const actionable = items.filter((item) => item.recommendation || !item.message.includes('not available') && !item.message.includes('not present'));
  return {
    ok: true,
    summary: actionable.length ? `Sunday briefing: ${actionable.length} item${actionable.length === 1 ? '' : 's'} to review. Ask to address one item by name.` : 'Sunday briefing: no verified urgent lineup issues found.',
    items
  };
}

export function renderSundayBriefing(briefing: SundayBriefing) {
  if (!briefing.ok) return briefing.summary;
  return `${briefing.summary} ${briefing.items.map((item) => `[${item.sourceTool}] ${item.message}`).join(' ')}`;
}
