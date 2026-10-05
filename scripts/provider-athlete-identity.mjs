// Resolves a provider stat row to exactly one Big Exec athlete.
//
// Production, 2026-10-05: 21 rostered Stress Test 2026 players (three starting
// kickers among them) had no balldontlie id. The weekly reconciliation skipped
// every row without one, so those players never received weekly stats, and
// kickers, whose live field goals depend on play-by-play, showed no points at
// all after Week 1.
//
// Order: the stored provider id; then name + position + team; then name +
// position when that identifies exactly one active athlete; then name + team
// when that identifies exactly one. An ambiguous match resolves to nothing.
//
// The provider labels kickers 'PK'; Big Exec stores 'K'. The first version of
// this file compared the labels as given, so on 2026-10-05 it linked 323
// players and not one kicker. Positions are normalized before comparing, and
// the name + team step covers any other label the two sources disagree on. A match found by name is reported so the caller can
// store the provider id and never need the fallback for that player again.
const alias = value => ({ JAX: 'JAC', WAS: 'WSH', LA: 'LAR' }[String(value ?? '')] ?? String(value ?? ''));
export const cleanName = value => String(value ?? '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/[^a-z0-9]/g, '');
export const providerPlayerName = row => String(row?.player?.display_name ?? row?.player?.full_name ?? `${row?.player?.first_name ?? ''} ${row?.player?.last_name ?? ''}`).trim();
export const normalizePosition = value => { const position = String(value ?? '').trim().toUpperCase(); return ({ PK: 'K', HB: 'RB' }[position] ?? position); };
export const providerPlayerPosition = row => normalizePosition(row?.player?.position_abbreviation ?? row?.player?.position);
export const providerPlayerTeam = row => alias(row?.team?.abbreviation ?? row?.player?.team?.abbreviation ?? '');

const teamOf = athlete => { const team = Array.isArray(athlete.real_teams) ? athlete.real_teams[0] : athlete.real_teams; return alias(team?.abbreviation); };

export function buildAthleteResolver({ links = [], athletes = [] }) {
  const byProvider = new Map(links.map(row => [String(row.provider_athlete_id), row.athlete_id]));
  const alreadyLinked = new Set(links.map(row => row.athlete_id));
  const byIdentity = new Map(); const byNamePosition = new Map(); const byNameTeam = new Map();
  const push = (map, key, id) => map.set(key, [...(map.get(key) ?? []), id]);
  for (const athlete of athletes) {
    const name = cleanName(athlete.display_name); const position = normalizePosition(athlete.position);
    if (!name || !position) continue;
    push(byIdentity, `${name}|${position}|${teamOf(athlete)}`, athlete.id);
    push(byNamePosition, `${name}|${position}`, athlete.id);
    if (teamOf(athlete)) push(byNameTeam, `${name}|${teamOf(athlete)}`, athlete.id);
  }
  return function resolve(row) {
    const providerId = row?.player?.id == null ? '' : String(row.player.id);
    const mapped = providerId ? byProvider.get(providerId) : undefined;
    if (mapped) return { athleteId: mapped, via: 'provider_id' };
    const name = cleanName(providerPlayerName(row)); const position = providerPlayerPosition(row);
    if (!providerId || !name || !position) return { athleteId: null, via: null };
    const exact = byIdentity.get(`${name}|${position}|${providerPlayerTeam(row)}`) ?? [];
    const loose = byNamePosition.get(`${name}|${position}`) ?? [];
    const sameTeam = providerPlayerTeam(row) ? byNameTeam.get(`${name}|${providerPlayerTeam(row)}`) ?? [] : [];
    const match = exact.length === 1 ? { athleteId: exact[0], via: 'name_position_team' } : loose.length === 1 ? { athleteId: loose[0], via: 'name_position' }
      : sameTeam.length === 1 ? { athleteId: sameTeam[0], via: 'name_team' } : null;
    // An athlete that already carries a different provider id is not this player.
    if (!match || alreadyLinked.has(match.athleteId)) return { athleteId: null, via: null };
    // One provider id per athlete: a second, different id for the same athlete in
    // this run is ambiguous, so it is not used.
    alreadyLinked.add(match.athleteId); byProvider.set(providerId, match.athleteId);
    return { ...match, link: { athlete_id: match.athleteId, provider: 'balldontlie', provider_athlete_id: providerId } };
  };
}
