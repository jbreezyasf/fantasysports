import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rpc = vi.fn(async () => ({ error: null }));
vi.mock('../../../lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { expectNoAxeViolations } from '../../accessibility-automation/axeTestUtils';
import { ChaosCardPanel, type ChaosPanelSide } from './ChaosCardPanel';
import { ChaosCardControls } from '../../franchises/[franchiseId]/team/ChaosCardControls';
import { setChaosCardSelection } from '../../team/chaosCardActions';
import { CHAOS_CARD_CATALOG, chaosSelectionView, presentChaosScoreBuild, type ChaosAsset, type ChaosGame } from '../../../lib/matchups/chaosCards';

const games: ChaosGame[] = [
  { home_team_id: 't1', away_team_id: 't2', starts_at: '2026-12-04T01:15:00Z', state: 'scheduled' },
  { home_team_id: 't3', away_team_id: 't4', starts_at: '2026-12-06T18:00:00Z', state: 'scheduled' },
];
const BEFORE = Date.parse('2026-12-03T12:00:00Z');
const asset = (id: string, label: string, teamId: string, isStarter: boolean): ChaosAsset => ({ key: `athlete:${id}`, athleteId: id, realTeamId: null, teamId, label, isStarter });
const homeAssets = [asset('hq', 'Avery Stone • QB • AAA', 't1', true), asset('hte', 'Miles Okafor • TE • CCC', 't3', true), asset('hb1', 'Dre Halloran • WR • CCC', 't3', false)];
const awayAssets = [asset('aq', 'Sam Whitlock • QB • BBB', 't2', true), asset('ab1', 'Rio Castellan • WR • DDD', 't4', false)];
// What chaos_auto_captain returns for each side (the database ranks; the page only shows it).
const autoReply = { home: { athlete_id: 'hq', real_team_id: null, expected: 20, games: 3 }, away: { athlete_id: 'aq', real_team_id: null, expected: null, games: 0 } };
const LOCK = '2026-12-04T01:15:00+00:00';
// auto: false = no reply; true = preview; 'due' = the database reports the lock; 'recorded' = the automatic captain row exists.
const view = (kind: 'captain' | 'wild_slot' | 'raid', side: 'home' | 'away', selected: string | null, now = BEFORE, auto: boolean | 'due' | 'recorded' = false) =>
  chaosSelectionView({
    autoCaptain: auto === 'due' ? { ...autoReply[side], locked_at: LOCK } : auto ? autoReply[side] : null,
    kind,
    isLowerSeed: side === 'away',
    ownAssets: side === 'home' ? homeAssets : awayAssets,
    opponentAssets: side === 'home' ? awayAssets : homeAssets,
    selection: selected ? { season_franchise_id: side, card_code: kind.toUpperCase(), athlete_id: selected, real_team_id: null, ...(auto === 'recorded' ? { source: 'automatic', locked_at: LOCK, details: { expected: 20, games: 3 } } : {}) } : null,
    games,
    matchupFinal: false,
    now,
  });
const sides = (kind: 'captain' | 'wild_slot' | 'raid' | null, homePick: string | null = null, awayPick: string | null = null): { home: ChaosPanelSide; away: ChaosPanelSide } => ({
  home: { seasonFranchiseId: 'home', name: 'High Volts', isLowerSeed: false, selection: kind ? view(kind, 'home', homePick) : null },
  away: { seasonFranchiseId: 'away', name: 'Night Shift', isLowerSeed: true, selection: kind ? view(kind, 'away', awayPick) : null },
});
const names = Object.fromEntries([...homeAssets, ...awayAssets].map((item) => [item.athleteId ?? '', item.label]));
const captainBuild = presentChaosScoreBuild({
  card_code: 'CAPTAIN',
  home: { base: 56.5, adjustments: [{ effect: 'captain', athlete_id: 'hq', real_team_id: null, points: 20 }], total: 76.5 },
  away: { base: 42, adjustments: [], total: 42 },
});

afterEach(() => {
  vi.unstubAllEnvs();
  rpc.mockClear();
});

describe('Chaos Week card on the matchup page', () => {
  it('shows the card, its rules, both selection states, the deadline and the score build-up', async () => {
    const html = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.CAPTAIN} {...sides('captain', 'hq', null)} build={captainBuild} assetNames={names} isFinal={false} lineupHref="/franchises/f1/team?week=13" />);
    expect(html).toContain('CHAOS WEEK RULE CARD');
    expect(html).toContain('<h2 id="chaos-card-heading">Captain</h2>');
    expect(html).toContain(CHAOS_CARD_CATALOG.CAPTAIN.rules.replaceAll("'", '&#x27;'));
    expect(html).toContain('Avery Stone • QB • AAA');
    expect(html).toContain('No captain named yet.');
    expect(html).not.toContain('No bonus');
    expect(html).toContain('<time dateTime="2026-12-04T01:15:00Z"');
    expect(html).toContain('Lineup total');
    expect(html).toContain('56.50');
    expect(html).toContain('Captain bonus');
    expect(html).toContain('+20.00');
    expect(html).toContain('Chaos Week total');
    expect(html).toContain('76.50');
    expect(html).toContain('No card adjustments');
    expect(html).toContain('href="/franchises/f1/team?week=13"');
    await expectNoAxeViolations(html);
  });

  it('keeps names and numbers out of translatable text', () => {
    const html = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.CAPTAIN} {...sides('captain', 'hq', null)} build={captainBuild} assetNames={names} isFinal={false} lineupHref={null} />);
    expect(html).toContain('<strong data-no-translate="true">High Volts</strong>');
    expect(html).toContain('<td data-no-translate="true">76.50</td>');
  });

  it('explains the raid roles and the card that needs no selection', async () => {
    const raid = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.RAID} {...sides('raid', null, 'hb1')} build={null} assetNames={names} isFinal={false} lineupHref={null} />);
    expect(raid).toContain('Only the lower seed raids.');
    expect(raid).toContain('Dre Halloran • WR • CCC');
    expect(raid).toContain('Your raid is made and cannot be changed.');
    await expectNoAxeViolations(raid);
    const twist = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.TWIST_K_TRIPLE} {...sides(null)} build={null} assetNames={names} isFinal={false} lineupHref={null} />);
    expect(twist).toContain('Golden Boot');
    expect(twist).toContain('This card needs no selection.');
    await expectNoAxeViolations(twist);
  });

  it('shows an earned Bounty for either winner, with the franchise and the end of its window', async () => {
    const build = presentChaosScoreBuild({ card_code: 'BOUNTY', home: { base: 60, adjustments: [], total: 60 }, away: { base: 150, adjustments: [], total: 150 }, bounty: { season_franchise_id: 'away', grant: 'first', effective_until: '2026-12-15T01:15:00Z' } });
    const html = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.BOUNTY} {...sides(null)} build={build} assetNames={names} isFinal lineupHref={null} />);
    expect(html).toContain('<h2 id="chaos-card-heading">Bounty</h2>');
    expect(html).toContain('Bounty earned: first in the waiver order until');
    expect(html).toContain('<strong data-no-translate="true">Night Shift</strong>');
    expect(html).toContain('2026-12-15T01:15:00Z');
    expect(html).not.toContain('Upset');
    await expectNoAxeViolations(html);
    const favourite = presentChaosScoreBuild({ card_code: 'BOUNTY', home: { base: 150, adjustments: [], total: 150 }, away: { base: 60, adjustments: [], total: 60 }, bounty: { season_franchise_id: 'home', grant: 'up_three', effective_until: '2026-12-15T01:15:00Z' } });
    const up = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.BOUNTY} {...sides(null)} build={favourite} assetNames={names} isFinal lineupHref={null} />);
    expect(up).toContain('Bounty earned: up three places in the waiver order until');
    expect(up).toContain('<strong data-no-translate="true">High Volts</strong>');
    expect(up).not.toContain('first in the waiver order');
    await expectNoAxeViolations(up);
    const tied = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.BOUNTY} {...sides(null)} build={{ ...build!, bounty: null }} assetNames={names} isFinal lineupHref={null} />);
    expect(tied).toContain('The game was tied. No bounty was earned.');
    const open = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.BOUNTY} {...sides(null)} build={{ ...build!, bounty: null }} assetNames={names} isFinal={false} lineupHref={null} />);
    expect(open).toContain('Earned by whichever team wins.');
    await expectNoAxeViolations(open);
  });

  it('shows who the automatic captain would be for both sides, then "Automatic captain" on the score build-up', async () => {
    const pending = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.CAPTAIN} home={{ ...sides('captain').home, selection: view('captain', 'home', null, BEFORE, true) }} away={{ ...sides('captain').away, selection: view('captain', 'away', null, BEFORE, true) }} build={null} assetNames={names} isFinal={false} lineupHref={null} />);
    expect(pending).toMatch(/<div class="chaosAutoCaptain" data-auto-captain="pending"><p class="chaosSelectionNote"><span>If no captain is named, the captain will be<\/span> <strong data-no-translate="true">Avery Stone • QB • AAA<\/strong><\/p>/);
    expect(pending).toContain('<span>Average points per game</span> <strong data-no-translate="true">20.00</strong>');
    expect(pending).toContain('<span>Games counted</span> <strong data-no-translate="true">3</strong>');
    expect(pending).toContain('Sam Whitlock • QB • BBB');
    expect(pending).toContain('no starter has a score before Week 13');
    await expectNoAxeViolations(pending);

    const build = presentChaosScoreBuild({
      card_code: 'CAPTAIN',
      home: { base: 56.5, total: 76.5, adjustments: [{ effect: 'captain', athlete_id: 'hq', real_team_id: null, points: 20, automatic: true, expected: 20, games: 3 }] },
      away: { base: 42, total: 58, adjustments: [{ effect: 'captain', athlete_id: 'aq', real_team_id: null, points: 16 }] },
    });
    const AFTER = Date.parse('2026-12-04T02:00:00Z');
    const live = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.CAPTAIN} home={{ ...sides('captain').home, selection: view('captain', 'home', 'hq', AFTER, 'recorded') }} away={{ ...sides('captain').away, selection: view('captain', 'away', 'aq', AFTER, true) }} build={build} assetNames={names} isFinal={false} lineupHref={null} />);
    expect(live).toMatch(/data-auto-captain="locked"><p class="chaosSelectionNote"><span>Automatic captain:<\/span> <strong data-no-translate="true">Avery Stone • QB • AAA<\/strong> <span>\(locked at kickoff\)<\/span><\/p>/);
    expect(live).toContain('so the automatic captain is fixed for the week.');
    expect(live).not.toContain('the captain will be');
    expect(live.match(/chaosAutoCaptain"/g)).toHaveLength(1);
    expect(live).toMatch(/<th scope="row"><span>Automatic captain<\/span><small data-no-translate="true">Avery Stone • QB • AAA<\/small><\/th><td data-no-translate="true">\+20\.00<\/td>/);
    expect(live).toMatch(/<th scope="row"><span>Captain bonus<\/span><small data-no-translate="true">Sam Whitlock • QB • BBB<\/small><\/th><td data-no-translate="true">\+16\.00<\/td>/);
    await expectNoAxeViolations(live);
  });
});

describe('Chaos Week selection controls on the lineup page', () => {
  const controls = (card: keyof typeof CHAOS_CARD_CATALOG, selection: ReturnType<typeof view> | null, raided: ChaosAsset[] = []) =>
    renderToStaticMarkup(<ChaosCardControls card={CHAOS_CARD_CATALOG[card]} matchupId="m1" seasonFranchiseId="sf1" franchiseId="f1" view={selection} raided={raided} />);

  it('renders the captain choice as a labelled radio group with a submit button and a clear button', async () => {
    const html = controls('CAPTAIN', view('captain', 'home', 'hq'));
    expect(html).toContain('<legend>Choose your captain</legend>');
    expect(html).toMatch(/<fieldset aria-describedby="[^"]+-deadline">/);
    expect(html).toMatch(/<label class="chaosChoice"><input type="radio"[^>]*value="athlete:hte"[^>]*\/><span data-no-translate="true">Miles Okafor • TE • CCC<\/span><\/label>/);
    expect(html).toMatch(/<button class="primary" type="submit"[^>]*>Name captain<\/button>/);
    expect(html).toMatch(/<button class="secondary" type="submit"[^>]*formNoValidate=""[^>]*>Clear selection<\/button>/);
    expect(html).not.toContain('value="athlete:hq"');
    expect(html).toContain('name="card_code" value="CAPTAIN"');
    expect(html).not.toMatch(/draggable|ondrag/i);
    await expectNoAxeViolations(html);
  });

  it('tells a manager who has not chosen who the automatic captain will be, with the reason, tied to the radio group', async () => {
    const html = controls('CAPTAIN', view('captain', 'home', null, BEFORE, true));
    expect(html).toMatch(/<div class="chaosAutoCaptain" id="([^"]+)-auto" data-auto-captain="pending"><p class="chaosSelectionNote"><span>If you do not choose, your captain will be<\/span> <strong data-no-translate="true">Avery Stone • QB • AAA<\/strong><\/p>/);
    expect(html).toContain('<span>Chosen automatically: the starter with the highest average fantasy points per game over their last three scored weeks before Week 13.</span>');
    expect(html).toContain('<span>Average points per game</span> <strong data-no-translate="true">20.00</strong>');
    const autoId = /id="([^"]+-auto)"/.exec(html)?.[1];
    expect(html).toContain(`<fieldset aria-describedby="${autoId} ${autoId?.replace(/-auto$/, '-deadline')}">`);
    // The existing controls are unchanged: the same labelled radio group, submit button and legend.
    expect(html).toContain('<legend>Choose your captain</legend>');
    expect(html).toMatch(/<label class="chaosChoice"><input type="radio"[^>]*value="athlete:hq"[^>]*\/><span data-no-translate="true">Avery Stone • QB • AAA<\/span><\/label>/);
    expect(html).toMatch(/<button class="primary" type="submit"[^>]*>Name captain<\/button>/);
    await expectNoAxeViolations(html);

    const named = controls('CAPTAIN', view('captain', 'home', 'hte', BEFORE, true));
    expect(named).not.toContain('chaosAutoCaptain');
    expect(named).toMatch(/<fieldset aria-describedby="[^" ]+-deadline">/);

    // Locked at kickoff: the choose control is gone, whether or not scoring has recorded the row yet.
    for (const state of ['due', 'recorded'] as const) {
      const locked = controls('CAPTAIN', view('captain', 'home', state === 'recorded' ? 'hq' : null, Date.parse('2026-12-04T02:00:00Z'), state));
      expect(locked, state).toMatch(/data-auto-captain="locked"><p class="chaosSelectionNote"><span>Automatic captain:<\/span> <strong data-no-translate="true">Avery Stone • QB • AAA<\/strong> <span>\(locked at kickoff\)<\/span><\/p>/);
      expect(locked, state).toContain('<span class="statusBadge is-locked">Locked</span>');
      expect(locked, state).toContain('No captain was named before this player&#x27;s game kicked off, so the automatic captain is fixed for the week.');
      expect(locked, state).not.toMatch(/<form|<fieldset|type="radio"|Name captain|Clear selection|If you do not choose/);
      await expectNoAxeViolations(locked);
    }
  });

  it('renders the wild slot and the raid picker for the lower seed', async () => {
    const wild = controls('WILD_SLOT', view('wild_slot', 'home', null));
    expect(wild).toContain('Choose your Wild Slot player');
    expect(wild).toContain('value="athlete:hb1"');
    expect(wild).not.toContain('value="athlete:hq"');
    expect(wild).not.toContain('Clear selection');
    await expectNoAxeViolations(wild);
    const raid = controls('RAID', view('raid', 'away', null));
    expect(raid).toContain('Choose one player from your opponent&#x27;s bench');
    expect(raid).toContain('value="athlete:hb1"');
    expect(raid).not.toContain('value="athlete:hq"');
    expect(raid).toContain('Raid this player');
    await expectNoAxeViolations(raid);
  });

  it('shows no form when the choice is locked, when the side is not eligible, or when the card needs no selection', async () => {
    const locked = controls('CAPTAIN', view('captain', 'home', 'hq', Date.parse('2026-12-04T02:00:00Z')));
    expect(locked).not.toContain('<form');
    expect(locked).toContain('Locked');
    expect(locked).toContain('The captain can no longer be changed.');
    const higher = controls('RAID', view('raid', 'home', null), [homeAssets[2]]);
    expect(higher).not.toContain('<form');
    expect(higher).toContain('Only the lower seed raids.');
    expect(higher).toContain('Your opponent raided this player.');
    expect(higher).toContain('Dre Halloran • WR • CCC');
    await expectNoAxeViolations(higher);
    const twist = controls('TWIST_TE_DOUBLE', null);
    expect(twist).not.toContain('<form');
    expect(twist).toContain('This card needs no selection.');
    await expectNoAxeViolations(twist);
  });
});

describe('flag gating', () => {
  it('the server action refuses and never reaches the database while the flag is off', async () => {
    vi.stubEnv('CHAOS_CARDS_ENABLED', '');
    const form = new FormData();
    form.set('matchup_id', 'm1');
    form.set('season_franchise_id', 'sf1');
    form.set('card_code', 'CAPTAIN');
    form.set('asset', 'athlete:hq');
    const result = await setChaosCardSelection({ status: 'idle', message: '', assetLabel: '' }, form);
    expect(result.status).toBe('error');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('with the flag on the action passes the dealt card and the chosen asset to the database RPC, which decides', async () => {
    vi.stubEnv('CHAOS_CARDS_ENABLED', 'true');
    const form = new FormData();
    form.set('matchup_id', 'm1');
    form.set('season_franchise_id', 'sf1');
    form.set('franchise_id', 'f1');
    form.set('card_code', 'CAPTAIN');
    form.set('asset', 'team:t1');
    form.set('label:team:t1', 'AAA D/ST');
    expect(await setChaosCardSelection({ status: 'idle', message: '', assetLabel: '' }, form)).toEqual({ status: 'success', message: '', assetLabel: 'AAA D/ST' });
    expect(rpc).toHaveBeenCalledWith('set_chaos_card_selection', { p_matchup_id: 'm1', p_season_franchise_id: 'sf1', p_card_code: 'CAPTAIN', p_athlete_id: null, p_real_team_id: 't1' });
    form.set('intent', 'clear');
    expect((await setChaosCardSelection({ status: 'idle', message: '', assetLabel: '' }, form)).status).toBe('cleared');
    expect(rpc).toHaveBeenLastCalledWith('clear_chaos_card_selection', { p_matchup_id: 'm1', p_season_franchise_id: 'sf1' });
    rpc.mockResolvedValueOnce({ error: { message: 'Captain locked: your captain\'s game has already started' } } as never);
    form.set('intent', 'set');
    expect(await setChaosCardSelection({ status: 'idle', message: '', assetLabel: '' }, form)).toMatchObject({ status: 'error', message: "Captain locked: your captain's game has already started" });
  });

  it('both pages query and render card surfaces only behind chaosCardsEnabled() and chaosCardSurface()', () => {
    for (const file of ['./page.tsx', '../../franchises/[franchiseId]/team/page.tsx']) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
      const gate = source.indexOf('if (chaosCardsEnabled()');
      expect(gate, file).toBeGreaterThan(-1);
      for (const table of ['chaos_card_draws', 'chaos_card_selections']) expect(source.indexOf(table), `${file} ${table}`).toBeGreaterThan(gate);
      expect(source.indexOf('chaosCardSurface('), file).toBeGreaterThan(gate);
      expect(source.match(/chaos_card_/g)?.length, file).toBe(2);
    }
  });
});
