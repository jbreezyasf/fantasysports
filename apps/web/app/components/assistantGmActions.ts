'use server';

import { createClient } from '../../lib/supabase/server';
import { createAssistantGmGateway, type AssistantGmGatewayResponse } from '../../lib/assistant-gm/gateway';
import type { AssistantGmToolContext, AssistantGmToolRequest, AssistantGmToolResponse } from '../../lib/assistant-gm/tools';
import type { BigExecCapabilityId, CapabilityAudience } from '../../lib/executive/capabilities';
import type { EntitlementSupabase } from '../../lib/executive/entitlements';
import { resolveExecutiveFeatureFlags } from '../../lib/executive/featureFlags';
import { isVoiceFeatureEnabled } from '../../lib/feature-flags/voiceFlags';

export type HeaderAssistantGmAnswer =
  | { ok: true; text: string; detail?: string }
  | { ok: false; message: string };

type AskPlan = {
  capabilityId: BigExecCapabilityId;
  tools: AssistantGmToolRequest[];
};

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): RecordLike[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function first(value: unknown): RecordLike | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null;
  return isRecord(value) ? value : null;
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberText(value: unknown, fallback = '0') {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed.toFixed(2).replace(/\.00$/, '') : fallback;
}

function assetName(row: RecordLike) {
  const athlete = first(row.athletes);
  if (athlete) {
    const team = first(athlete.real_teams);
    const suffix = text(team?.abbreviation) ? `, ${text(team?.abbreviation)}` : '';
    return `${text(athlete.display_name, 'Player')} (${text(athlete.position, 'FLEX')}${suffix})`;
  }
  const defense = first(row.real_teams);
  if (defense) return `${text(defense.display_name, text(defense.abbreviation, 'Defense'))} D/ST`;
  return 'Roster asset';
}

function rankedName(row: RecordLike) {
  const team = text(row.team) ? `, ${text(row.team)}` : '';
  const rank = typeof row.overallRank === 'number' ? `#${row.overallRank} ` : '';
  return `${rank}${text(row.displayName, text(row.display_name, 'Player'))} (${text(row.position, 'D/ST')}${team})`;
}

function currentWeek(question: string) {
  const match = question.match(/\bweek\s+(\d{1,2})\b/i);
  if (!match) return 1;
  const week = Number(match[1]);
  return Number.isInteger(week) && week >= 1 && week <= 18 ? week : 1;
}

function planQuestion(question: string, leagueId: string, draftId: string | null): AskPlan {
  const normalized = question.toLowerCase();
  const week = currentWeek(question);

  if (/\b(draft|pick|queue|clock|timer|available)\b/.test(normalized) && /\b(draft|pick|queue|clock|timer)\b/.test(normalized)) {
    const tools: AssistantGmToolRequest[] = [{ tool: 'getDraftState', leagueId }];
    if (draftId) tools.push({ tool: 'getDraftAvailablePlayers', leagueId, draftId });
    if (draftId) tools.push({ tool: 'getDraftQueue', leagueId, draftId });
    return { capabilityId: 'draft.read', tools };
  }

  if (/\b(waiver|claim|pickup|pick up|free agent|available|add)\b/.test(normalized)) {
    return {
      capabilityId: 'waivers.read',
      tools: [
        { tool: 'getWaiverRules', leagueId },
        { tool: 'getWaiverState', leagueId },
        { tool: 'getAvailablePlayers', leagueId }
      ]
    };
  }

  if (/\b(lineup|start|starter|bench|slot|empty)\b/.test(normalized)) {
    return {
      capabilityId: 'lineup.read',
      tools: [
        { tool: 'getRoster', leagueId },
        { tool: 'getLineup', leagueId, week }
      ]
    };
  }

  if (/\b(standing|rank|record|first place|leaderboard)\b/.test(normalized)) {
    return { capabilityId: 'standings.read', tools: [{ tool: 'getStandings', leagueId }] };
  }

  if (/\b(trade|offer|counter|deadline)\b/.test(normalized)) {
    return { capabilityId: 'players.search.read', tools: [{ tool: 'getTradeContext', leagueId }] };
  }

  if (/\b(history|legacy|champion|trophy|award|rivalry|recap)\b/.test(normalized)) {
    return { capabilityId: 'standings.read', tools: [{ tool: 'getHistory', leagueId }] };
  }

  return {
    capabilityId: 'roster.read',
    tools: [
      { tool: 'getLeague', leagueId },
      { tool: 'getRoster', leagueId },
      { tool: 'getLineup', leagueId, week },
      { tool: 'getStandings', leagueId }
    ]
  };
}

function successful(response: AssistantGmGatewayResponse, tool: string) {
  if (!response.ok) return null;
  return response.toolResponses.find(item => item.ok && item.tool === tool) ?? null;
}

function data(response: AssistantGmGatewayResponse, tool: string) {
  const item = successful(response, tool) as AssistantGmToolResponse | null;
  return item?.ok ? item.data : null;
}

function composeAnswer(question: string, response: AssistantGmGatewayResponse): HeaderAssistantGmAnswer {
  if (!response.ok) return { ok: false, message: response.message };

  const roster = asArray((data(response, 'getRoster') as RecordLike | null)?.roster);
  const lineup = asArray((data(response, 'getLineup') as RecordLike | null)?.lineup);
  const standings = asArray((data(response, 'getStandings') as RecordLike | null)?.standings);
  const draftState = data(response, 'getDraftState') as RecordLike | null;
  const draftAvailable = data(response, 'getDraftAvailablePlayers') as RecordLike | null;
  const waiverState = data(response, 'getWaiverState') as RecordLike | null;
  const available = asArray((data(response, 'getAvailablePlayers') as RecordLike | null)?.players);
  const trades = asArray((data(response, 'getTradeContext') as RecordLike | null)?.trades);
  const history = data(response, 'getHistory') as RecordLike | null;
  const league = (data(response, 'getLeague') as RecordLike | null)?.league as RecordLike | undefined;

  if (draftState) {
    const draft = isRecord(draftState.draft) ? draftState.draft : {};
    const picks = asArray(draftState.picks);
    const rankings = isRecord(draftAvailable?.rankings) ? draftAvailable.rankings : null;
    const topAthletes = asArray(rankings?.athletes).slice(0, 5).map(rankedName);
    return {
      ok: true,
      text: `Draft room: status is ${text(draft.status, 'unknown')}, current pick is ${String(draft.current_pick ?? 'not set')}, and ${picks.length} picks are recorded. ${topAthletes.length ? `Top available: ${topAthletes.join('; ')}.` : 'Available-player rankings are not loaded yet.'}`,
      detail: 'Draft answers are read-only here. Queue changes, picks, pause/resume, and correction controls still run through the draft room controls and confirmed server actions.'
    };
  }

  if (waiverState || available.length) {
    const holds = asArray(waiverState?.holds);
    const claims = asArray(waiverState?.requesterClaims);
    return {
      ok: true,
      text: `Waiver desk: ${holds.length} open waiver holds, ${claims.length} of your claims on those holds, and ${available.length} currently available players in the pool. First names I can see: ${available.slice(0, 5).map(row => `${text(row.display_name, 'Player')} (${text(row.position, 'FLEX')})`).join('; ') || 'none'}.`,
      detail: 'This is availability help, not a transaction. Claims and add/drop moves still require the existing waiver or free-agent forms.'
    };
  }

  if (lineup.length || /\b(lineup|start|starter|bench|slot|empty)\b/i.test(question)) {
    const empty = lineup.filter(row => !row.athlete_id && !row.real_team_id);
    return {
      ok: true,
      text: `Lineup check: ${lineup.length} lineup slots found, ${empty.length} empty. Roster has ${roster.length} active assets. ${empty.length ? `Open slots: ${empty.map(row => `${text(row.slot, 'slot')}${String(row.slot_index ?? '')}`).join(', ')}.` : 'No empty slots are visible for that week.'}`,
      detail: roster.length ? `Roster sample: ${roster.slice(0, 8).map(assetName).join('; ')}.` : 'No active roster assets were returned for this franchise.'
    };
  }

  if (standings.length && /\b(standing|rank|record|first place|leaderboard)\b/i.test(question)) {
    return {
      ok: true,
      text: `Standings: ${standings.slice(0, 5).map(row => {
        const franchise = first(row.franchise);
        return `${String(row.rank ?? '?')}. ${text(franchise?.name, 'Franchise')} ${String(row.wins ?? 0)}-${String(row.losses ?? 0)}-${String(row.ties ?? 0)}, ${numberText(row.points_for)} points for`;
      }).join('; ')}.`,
      detail: 'Standings are read from the current Big Exec standings table. Tie-breaker and playoff-picture explanations should stay tied to the official standings rows.'
    };
  }

  if (trades.length || /\b(trade|offer|counter|deadline)\b/i.test(question)) {
    return {
      ok: true,
      text: `Trade room: ${trades.length} recent trade records are visible for this season. ${trades.slice(0, 3).map(row => `${text(row.status, 'unknown')} trade from ${String(row.proposed_by_franchise_id ?? 'one franchise')} to ${String(row.proposed_to_franchise_id ?? 'another franchise')}`).join('; ') || 'No recent trade activity is visible.'}`,
      detail: 'Assistant GM does not accept, reject, propose, or alter trades from this header control.'
    };
  }

  if (history) {
    const championships = asArray(history.championships);
    const awards = asArray(history.weeklyAwards);
    const stories = asArray(history.storyEvents);
    return {
      ok: true,
      text: `Legacy room: ${championships.length} championships, ${awards.length} weekly awards, and ${stories.length} story events are visible for this scope.`,
      detail: 'Historical answers are limited to stored Big Exec facts. I will not invent trophies, rivalries, outcomes, or recap moments.'
    };
  }

  return {
    ok: true,
    text: `${text(league?.name, 'This league')} brief: your roster has ${roster.length} active assets, the selected lineup has ${lineup.length} slots, and the standings table has ${standings.length} franchises.`,
    detail: 'Ask about roster, lineup, standings, draft, waivers, trades, or legacy for a more specific read-only answer.'
  };
}

export async function askHeaderAssistantGm(leagueId: string, question: string): Promise<HeaderAssistantGmAnswer> {
  const trimmed = question.trim();
  if (!trimmed) return { ok: false, message: 'Type or say a question for Assistant GM.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sign in before using Assistant GM.' };

  const [{ data: member }, { data: season }] = await Promise.all([
    supabase.from('league_members').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle(),
    supabase.from('league_seasons').select('id').eq('league_id', leagueId).eq('is_current', true).maybeSingle()
  ]);
  if (!member) return { ok: false, message: 'Assistant GM can only read leagues you belong to.' };
  if (!season) return { ok: false, message: 'Assistant GM could not find the current league season.' };

  const { data: draft } = await supabase.from('drafts').select('id').eq('league_season_id', season.id).maybeSingle();
  const plan = planQuestion(trimmed, leagueId, draft?.id ?? null);
  const legacyVoiceEnabled = isVoiceFeatureEnabled('voice_gm');
  const flags = resolveExecutiveFeatureFlags();
  const gateway = createAssistantGmGateway({
    supabase: supabase as unknown as EntitlementSupabase & AssistantGmToolContext['supabase'],
    flags: {
      ...flags,
      assistant_gm: true,
      assistant_gm_voice_input: legacyVoiceEnabled || flags.assistant_gm_voice_input
    }
  });
  const response = await gateway.handle({
    userId: user.id,
    leagueId,
    leagueSeasonId: season.id,
    audience: (member.role === 'commissioner' ? 'commissioner' : 'manager') as CapabilityAudience,
    capabilityId: plan.capabilityId,
    toolRequests: plan.tools
  });

  return composeAnswer(trimmed, response);
}
