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
const view = (kind: 'captain' | 'wild_slot' | 'raid', side: 'home' | 'away', selected: string | null, now = BEFORE) =>
  chaosSelectionView({
    kind,
    isLowerSeed: side === 'away',
    ownAssets: side === 'home' ? homeAssets : awayAssets,
    opponentAssets: side === 'home' ? awayAssets : homeAssets,
    selection: selected ? { season_franchise_id: side, card_code: kind.toUpperCase(), athlete_id: selected, real_team_id: null } : null,
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
    expect(html).toContain('No captain named. No bonus.');
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

  it('shows an earned Upset Bounty with the franchise and the end of its window', async () => {
    const build = presentChaosScoreBuild({ card_code: 'UPSET_BOUNTY', home: { base: 60, adjustments: [], total: 60 }, away: { base: 150, adjustments: [], total: 150 }, bounty: { season_franchise_id: 'away', effective_until: '2026-12-15T01:15:00Z' } });
    const html = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.UPSET_BOUNTY} {...sides(null)} build={build} assetNames={names} isFinal lineupHref={null} />);
    expect(html).toContain('Upset Bounty earned: first in the waiver order until');
    expect(html).toContain('Night Shift');
    expect(html).toContain('2026-12-15T01:15:00Z');
    await expectNoAxeViolations(html);
    const none = renderToStaticMarkup(<ChaosCardPanel card={CHAOS_CARD_CATALOG.UPSET_BOUNTY} {...sides(null)} build={{ ...build!, bounty: null }} assetNames={names} isFinal lineupHref={null} />);
    expect(none).toContain('The lower seed did not win. No bounty was earned.');
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
