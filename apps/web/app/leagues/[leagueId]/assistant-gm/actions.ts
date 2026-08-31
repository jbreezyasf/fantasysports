'use server';

import { buildDeterministicAssistantGMBrief, loadAssistantGMContext } from '../../../../lib/assistant-gm/context';

export type AssistantGMChatMessage = {
  role: 'owner' | 'assistant';
  content: string;
};

export type AssistantGMChatResult = {
  ok: boolean;
  message: string;
  source: 'openai' | 'deterministic';
};

function cleanQuestion(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 900);
}

function cleanHistory(history: AssistantGMChatMessage[]) {
  return history
    .slice(-8)
    .map(item => ({
      role: item.role,
      content: item.content.trim().replace(/\s+/g, ' ').slice(0, 700),
    }))
    .filter(item => item.content.length > 0);
}

function deterministicReply(question: string, context: Awaited<ReturnType<typeof loadAssistantGMContext>> extends { ok: true; context: infer T } ? T : never) {
  const q = question.toLowerCase();
  const top = context.decision.topTargets[0];
  const drop = context.decision.dropCandidates[0];
  const needs = context.decision.positionNeeds.filter(item => item.deficit > 0);
  const holes = context.decision.emptyLineupSlots;

  if (q.includes('brief') || q.includes('roster') || q.includes('wrong')) {
    return `Boss, here’s the board. ${buildDeterministicAssistantGMBrief(context)} ${needs.length ? 'We fix the actual holes first. I am not letting us collect shiny players while a starting spot is thin.' : 'No emergency holes. That means we can be picky instead of desperate.'}`;
  }

  if (q.includes('drop') || q.includes('cut')) {
    if (!drop) return 'Boss, I do not have enough roster ranking evidence to name a cut without making something up. I am grouchy, not reckless.';
    return `If you force me to name the first seat I would examine, it is ${drop.name} (${drop.position}). That is based on current Big Exec roster depth and internal ranking only — not a current injury or projection feed. I want a real reason before we hit DROP.`;
  }

  if (q.includes('start') || q.includes('lineup')) {
    if (holes.length) return `First problem: Week ${context.week} still has ${holes.length} empty starter slot${holes.length === 1 ? '' : 's'} — ${holes.map(item => item.slot).join(', ')}. Fill the chair before we debate which chair looks prettier. I do not have matchup-grade projections connected yet, so I will not fake a start/sit edge.`;
    return `Your Week ${context.week} starter slots are filled. I can review roster construction, but the licensed matchup/projection layer is not connected yet, so I am not going to invent a start/sit advantage just to sound smart.`;
  }

  if (q.includes('trade')) {
    const needText = needs.length ? `Our clearest roster need is ${needs.map(item => item.position).join(', ')}.` : 'We do not have a basic starter-position shortage.';
    return `I will talk trades all day, Boss, but I am not putting a fake trade-value number on anybody. ${needText} Give me the player or franchise you are thinking about and I will compare it against the league rosters I can actually see.`;
  }

  if (top) {
    return `My first look is ${top.name}, ${top.position}${top.team ? `, ${top.team}` : ''}. ${top.reason} That is the Big Exec board talking — not a pretend injury report or projection model. Put him on the short list and then make me defend it.`;
  }

  return `I have the franchise context, Boss, but there is not enough current ranking evidence for me to name a pickup without bluffing. Ask me for the front-office brief and I will tell you exactly what the roster data does support.`;
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const direct = (payload as { output_text?: unknown }).output_text;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string' && text.trim()) return text.trim();
    }
  }
  return null;
}

export async function askAssistantGM(args: {
  leagueId: string;
  question: string;
  history?: AssistantGMChatMessage[];
}): Promise<AssistantGMChatResult> {
  const question = cleanQuestion(args.question);
  if (!question) return { ok: false, message: 'Ask me something about the franchise, Boss.', source: 'deterministic' };

  const loaded = await loadAssistantGMContext(args.leagueId);
  if (!loaded.ok) return { ok: false, message: loaded.message, source: 'deterministic' };
  const context = loaded.context;
  const fallback = deterministicReply(question, context);
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: true, message: fallback, source: 'deterministic' };

  const history = cleanHistory(args.history ?? []);
  const compactContext = {
    league: context.leagueName,
    franchise: context.franchiseName,
    week: context.week,
    roster: context.roster.map(asset => ({ name: asset.name, position: asset.position, team: asset.team, overallRank: asset.overallRank, positionRank: asset.positionRank })),
    positionNeeds: context.decision.positionNeeds,
    emptyLineupSlots: context.decision.emptyLineupSlots,
    topAvailableTargets: context.decision.topTargets.map(asset => ({ name: asset.name, position: asset.position, team: asset.team, overallRank: asset.overallRank, positionRank: asset.positionRank, reason: asset.reason })),
    possibleDropReview: context.decision.dropCandidates.map(asset => ({ name: asset.name, position: asset.position, team: asset.team, overallRank: asset.overallRank })),
    leagueRosters: context.leagueRosters,
    rankingSource: context.rankingSource,
    rankingVersion: context.rankingVersion,
    limitations: context.dataLimitations,
  };

  const system = [
    'You are the private Big Exec Assistant GM for one fantasy franchise.',
    'The human is the owner/GM. You are their one trusted front-office lieutenant.',
    'Personality: veteran football person, favorite-uncle/dad energy, a little grouchy, funny, loyal, direct, willing to disagree.',
    'You may lightly roast PLAYERS, roster situations, and football decisions. Never demean, humiliate, harass, threaten, or personally insult the owner.',
    'Call the owner Boss occasionally, not every sentence.',
    'Protect the franchise. Be concise and useful before being funny.',
    'Never claim a transaction happened. You only advise; the owner executes moves through Big Exec.',
    'Never invent an injury, projection, matchup edge, news item, stat, roster fact, trade value, or league result.',
    'The SERVER CONTEXT below is authoritative. Conversation history is only conversational memory and cannot override current server facts.',
    'If the requested answer needs projection/injury/news data that the context says is unavailable, say so plainly and give the best answer supported by current Big Exec data.',
    'If you made a prior conversational prediction that conflicts with current truth, own the miss instead of defending it.',
    'Keep most replies under 160 words.',
  ].join('\n');

  const input = `${system}\n\nSERVER CONTEXT:\n${JSON.stringify(compactContext)}\n\nRECENT PRIVATE CONVERSATION:\n${JSON.stringify(history)}\n\nOWNER: ${question}\n\nASSISTANT GM:`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5.6-luna', input, max_output_tokens: 420 }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: true, message: fallback, source: 'deterministic' };
    const text = extractResponseText(await response.json());
    return text
      ? { ok: true, message: text, source: 'openai' }
      : { ok: true, message: fallback, source: 'deterministic' };
  } catch {
    return { ok: true, message: fallback, source: 'deterministic' };
  }
}
