import type { AnnouncementInput } from '../announcements';

// DRAFT, NOT SENT. The first league announcement: the Chaos Clause and the Week 13 rule cards,
// for Stress Test 2026. Reviewable copy of this text: docs/product/ANNOUNCEMENT_CHAOS_WEEK_2026.md.
//
// Every rule comes from two product documents, read on 2026-10-04:
//   - docs/product/CHAOS_WEEK_RULE_CARDS.md (branch feat/chaos-week-rule-cards), section 1
//   - docs/product/PRD_02_TRANSACTIONS_AND_SEASON.md (branch feat/chaos-clause-tiebreak),
//     "Postseason tiebreak: the Chaos Clause"
// Items those documents list as still open are left out (how long a Bounty lasts, and what
// happens to a selected player who is later dropped or traded).
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
  body: `Two rules to know before Week 13.

## Tied playoff games: the Chaos Clause
A playoff game cannot end in a tie. If yours does, the winner is decided in this order:
- The higher Week 13 Chaos Week lineup total, before any rule card is applied.
- Then the higher Week 10 Rivalry Week total.
- Then the higher seed.

## Week 13: one rule card per matchup
Chaos Week is 1 v 10, 2 v 9, 3 v 8, 4 v 7 and 5 v 6. After Week 12 is final, each game is dealt one rule card. Both teams play under it. The five games get five different cards. You see your card right away on your matchup page and your lineup page.

- **Captain**: your captain's points count double. Name one of your starters.
- **Wild Slot**: one extra player's points are added to your total. Name one active-roster player who is not starting.
- **Raid**: the lower seed adds the points of one player from the higher seed's bench.
- **Bounty**: whoever wins moves up the waiver order. A lower seed that wins goes to the front. A higher seed that wins moves up three places. A tie changes nothing.
- **Tight End Takeover**: every starting tight end scores double.
- **Golden Boot**: every starting kicker scores triple.
- **Iron Curtain**: every starting D/ST scores double, negative scores too.
- **Ground Control**: starters' rushing points count double.
- **Air Show**: starters' passing points count double, interceptions too.
- **Slippery Hands**: every fumble lost by a starter costs triple.

## If you do not choose
- **Captain**: one is chosen for you. It is your starter with the highest average over their three most recent scored weeks.
- **Wild Slot**: no extra points.
- **Raid**: no raid.

## Locks and deadlines
- **Captain and Wild Slot** lock when that player's game kicks off. You can change your choice until then. An automatic captain locks at kickoff too.
- **Raid** must be made before the first Week 13 kickoff: Thursday, December 3, 2026 at 8:15 PM Eastern Time (7:15 PM Central). A raid cannot be changed once made.

## It counts
Chaos Week counts in full. The score after the card is applied is the score of the game, and it goes into the standings.`
};

const es = {
  title: 'Reglas de la Semana del Caos: cartas de reglas y la Cláusula del Caos',
  pushTitle: 'Semana del Caos: nuevas reglas',
  pushBody: 'La Semana 13 reparte una carta de reglas por partido y los empates de playoffs van a la Cláusula del Caos.',
  body: `Dos reglas que debes conocer antes de la Semana 13.

## Empates en playoffs: la Cláusula del Caos
Un partido de playoffs no puede terminar empatado. Si el tuyo termina así, el ganador se decide en este orden:
- El mayor total de alineación en la Semana del Caos (Semana 13), antes de aplicar cualquier carta de reglas.
- Después, el mayor total en la Semana de Rivalidad (Semana 10).
- Después, el equipo mejor clasificado.

## Semana 13: una carta de reglas por enfrentamiento
La Semana del Caos es 1 contra 10, 2 contra 9, 3 contra 8, 4 contra 7 y 5 contra 6. Cuando la Semana 12 sea final, cada partido recibe una carta de reglas. Los dos equipos juegan con ella. Los cinco partidos reciben cinco cartas distintas. Verás tu carta de inmediato en tu página de enfrentamiento y en tu página de alineación.

- **Capitán**: los puntos de tu capitán cuentan doble. Nombra a uno de tus titulares.
- **Puesto Comodín**: se suman a tu total los puntos de un jugador adicional. Nombra a un jugador de tu plantilla activa que no sea titular.
- **Asalto**: el equipo con peor clasificación suma los puntos de un jugador de la banca del equipo mejor clasificado.
- **Recompensa**: quien gane sube en el orden de waivers. Si gana el equipo con peor clasificación, pasa al primer lugar. Si gana el mejor clasificado, sube tres lugares. Un empate no cambia nada.
- **Dominio del Ala Cerrada**: cada ala cerrada titular puntúa doble.
- **Bota de Oro**: cada pateador titular puntúa triple.
- **Cortina de Hierro**: cada D/ST titular puntúa doble, también si su puntuación es negativa.
- **Control Terrestre**: los puntos por carrera de los titulares cuentan doble.
- **Espectáculo Aéreo**: los puntos por pase de los titulares cuentan doble, incluidas las intercepciones.
- **Manos Resbalosas**: cada balón suelto perdido por un titular cuesta el triple.

## Si no eliges
- **Capitán**: se elige uno por ti. Es tu titular con el mejor promedio en sus tres semanas puntuadas más recientes.
- **Puesto Comodín**: no hay puntos adicionales.
- **Asalto**: no hay asalto.

## Bloqueos y fechas límite
- **Capitán y Puesto Comodín** se bloquean cuando empieza el partido de ese jugador. Puedes cambiar tu elección hasta entonces. El capitán automático también se bloquea al empezar su partido.
- **Asalto**: debe hacerse antes del primer partido de la Semana 13: jueves 3 de diciembre de 2026 a las 8:15 p. m., hora del Este de EE. UU. (7:15 p. m., hora del Centro). Un asalto no se puede cambiar una vez hecho.

## Cuenta para todo
La Semana del Caos cuenta por completo. La puntuación después de aplicar la carta es la puntuación del partido y entra en la tabla de posiciones.`
};

export const chaosWeek2026Announcement: AnnouncementInput = {
  leagueSeasonId: CHAOS_WEEK_2026_LEAGUE_SEASON_ID,
  category: 'league_announcements',
  link: '/dashboard',
  en,
  es
};
