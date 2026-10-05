import type { AnnouncementInput } from '../announcements';

// DRAFT, NOT SENT. The first league announcement: the Chaos Clause and the Week 13 rule cards,
// for Stress Test 2026. Reviewable copy of this text: docs/product/ANNOUNCEMENT_CHAOS_WEEK_2026.md.
//
// Every rule comes from two product documents, read on 2026-10-04:
//   - docs/product/CHAOS_WEEK_RULE_CARDS.md (branch feat/chaos-week-rule-cards), section 1
//   - docs/product/PRD_02_TRANSACTIONS_AND_SEASON.md (branch feat/chaos-clause-tiebreak),
//     "Postseason tiebreak: the Chaos Clause"
// Re-read after the third round of owner decisions (automatic Wild Slot and raid, void
// selections, the raid penalty, Bounty in Week 14 only, twist sizes final, league opt-in).
// Items still under "Decisions needed" are left out: whether the higher seed still scores a
// starter taken by the penalty raid, and whether a late automatic raid can take a player who
// has already played.
//
// Stress Test 2026's league season (production, read 2026-10-04). An operator loads this seed
// from /ops/announcements; nothing in the code sends it.
export const CHAOS_WEEK_2026_LEAGUE_SEASON_ID = '257699ec-ef0d-466f-95cb-ec10a5b34d69';

// First Week 13 kickoff in production `real_games` on 2026-10-04: 2026-12-04T01:15:00Z,
// which is Thursday, December 3, 2026 at 8:15 PM Eastern Time (7:15 PM Central).
export const CHAOS_WEEK_2026_FIRST_KICKOFF_UTC = '2026-12-04T01:15:00Z';

const en = {
  title: 'Chaos Week rules: rule cards and the Chaos Clause',
  pushTitle: 'Chaos Week: new rules',
  pushBody: 'Week 13 deals a rule card to every matchup, and tied playoff games go to the Chaos Clause. Read the rules.',
  body: `## Tied playoff games: the Chaos Clause
A tied playoff game is decided in this order:
- Higher Week 13 Chaos Week lineup total, before any rule card is applied.
- Then higher Week 10 Rivalry Week total.
- Then the higher seed.

## Week 13: one rule card per matchup
Stress Test 2026 plays with rule cards this season. After Week 12 is final, each Chaos Week game is dealt one card. Both teams play under it.

- **Captain**: your captain's points count double. Name one starter.
- **Wild Slot**: one extra player's points are added. Name one non-starter on your active roster.
- **Raid**: the lower seed adds the points of one player from the higher seed's bench. With no eligible bench player, the raid takes the higher seed's best-ranked starter.
- **Bounty**: the winner moves up the Week 14 waiver order: a lower seed goes first, a higher seed moves up three places. A tie changes nothing.
- **Tight End Takeover**: starting tight ends score double.
- **Golden Boot**: starting kickers score triple.
- **Iron Curtain**: starting D/STs score double, negative scores too.
- **Ground Control**: starters' rushing points count double.
- **Air Show**: starters' passing points count double, interceptions too.
- **Slippery Hands**: a fumble lost by a starter costs triple.

## If you do not choose
The system picks for you under Captain, Wild Slot and Raid: the eligible player with the highest average over their three most recent scored weeks.

## Locks and deadlines
- **Captain and Wild Slot** lock at that player's kickoff, whether you chose or the system did. You can change your choice until then.
- **Raid** must be made before the first Week 13 kickoff: Thursday, December 3, 2026 at 8:15 PM Eastern Time (7:15 PM Central). It is final once made. With no raid by then, the system makes it.
- **Dropped players**: if your Wild Slot player, or the player you raided, leaves that roster before his kickoff, the pick is void. Choose again, or the system picks.

## It counts
The score after the card is applied is the score of the game, and it goes into the standings.`
};

const es = {
  title: 'Reglas de la Semana del Caos: cartas de reglas y la Cláusula del Caos',
  pushTitle: 'Semana del Caos: nuevas reglas',
  pushBody: 'La Semana 13 reparte una carta de reglas por partido y los empates de playoffs van a la Cláusula del Caos.',
  body: `## Empates en playoffs: la Cláusula del Caos
Un partido de playoffs empatado se decide en este orden:
- El mayor total de alineación en la Semana del Caos (Semana 13), antes de aplicar cualquier carta de reglas.
- Después, el mayor total en la Semana de Rivalidad (Semana 10).
- Después, el equipo mejor clasificado.

## Semana 13: una carta de reglas por enfrentamiento
Esta temporada Stress Test 2026 juega con cartas de reglas. Cuando la Semana 12 sea final, cada partido de la Semana del Caos recibe una carta. Los dos equipos juegan con ella.

- **Capitán**: los puntos de tu capitán cuentan doble. Nombra a un titular.
- **Puesto Comodín**: se suman los puntos de un jugador adicional. Nombra a un jugador de tu plantilla activa que no sea titular.
- **Asalto**: el equipo con peor clasificación suma los puntos de un jugador de la banca del equipo mejor clasificado. Si esa banca no tiene un jugador elegible, el asalto se lleva al titular mejor posicionado de ese equipo.
- **Recompensa**: el ganador sube en el orden de waivers de la Semana 14: el equipo con peor clasificación pasa al primer lugar, el mejor clasificado sube tres lugares. Un empate no cambia nada.
- **Dominio del Ala Cerrada**: las alas cerradas titulares puntúan doble.
- **Bota de Oro**: los pateadores titulares puntúan triple.
- **Cortina de Hierro**: las D/ST titulares puntúan doble, también si su puntuación es negativa.
- **Control Terrestre**: los puntos por carrera de los titulares cuentan doble.
- **Espectáculo Aéreo**: los puntos por pase de los titulares cuentan doble, incluidas las intercepciones.
- **Manos Resbalosas**: un balón suelto perdido por un titular cuesta el triple.

## Si no eliges
El sistema elige por ti con Capitán, Puesto Comodín y Asalto: el jugador elegible con el mejor promedio en sus tres semanas puntuadas más recientes.

## Bloqueos y fechas límite
- **Capitán y Puesto Comodín** se bloquean cuando empieza el partido de ese jugador, lo hayas elegido tú o el sistema. Puedes cambiar tu elección hasta entonces.
- **Asalto**: debe hacerse antes del primer partido de la Semana 13: jueves 3 de diciembre de 2026 a las 8:15 p. m., hora del Este de EE. UU. (7:15 p. m., hora del Centro). Es definitivo una vez hecho. Si no hay asalto para entonces, lo hace el sistema.
- **Jugadores dados de baja**: si tu jugador del Puesto Comodín, o el jugador que tomaste en un asalto, sale de esa plantilla antes de que empiece su partido, la elección queda anulada. Elige de nuevo, o elige el sistema.

## Cuenta para todo
La puntuación después de aplicar la carta es la puntuación del partido y entra en la tabla de posiciones.`
};

export const chaosWeek2026Announcement: AnnouncementInput = {
  leagueSeasonId: CHAOS_WEEK_2026_LEAGUE_SEASON_ID,
  category: 'league_announcements',
  link: '/dashboard',
  en,
  es
};
