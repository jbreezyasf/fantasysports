# Announcement draft: Chaos Week 2026 (the Chaos Clause and the Week 13 rule cards)

**Status 2026-10-04: DRAFT. NOT SENT.** Nothing in the repository sends this message. It exists as a seed (`apps/web/lib/notifications/seeds/chaosWeek2026.ts`) that a platform operator can load as a draft from `/ops/announcements` once notifications are switched on (`docs/NOTIFICATIONS.md`). A unit test keeps this document and the seed identical.

| | |
|---|---|
| Audience | The members of **Stress Test 2026** (league season `257699ec-ef0d-466f-95cb-ec10a5b34d69`; 10 members in production on 2026-10-04, PROVEN by a read-only query) |
| Channels | Email to members with league email on; push to members who turned push on. On 2026-10-04 no member can have push on, because the tables do not exist yet. |
| Category | League announcements (a transactional league-operations notice, not marketing) |
| Link | `/dashboard` (opens the manager's league) |
| Languages | English, and Spanish (es-419) for members who chose Spanish in notification settings |

## Where every rule comes from

Read on 2026-10-04. Nothing here was invented, and no rule was taken from anywhere else.

- **The Chaos Clause** (tied playoff games; the three steps): `docs/product/PRD_02_TRANSACTIONS_AND_SEASON.md` on branch `feat/chaos-clause-tiebreak`, "Postseason tiebreak: the Chaos Clause (LOCKED)".
- **"before any rule card is applied"**: `docs/product/CHAOS_WEEK_RULE_CARDS.md` on branch `feat/chaos-week-rule-cards`, decision table ("The Chaos Clause compares the base lineup total, before the card is applied. Confirmed.").
- **The cards, the automatic picks, the locks, the raid deadline, full stakes**: the same document, section 1.
- **The raid deadline time**: that document, section 5 (first Week 13 kickoff 2026-12-04 01:15 UTC), and the same value read from production `real_games` on 2026-10-04. 01:15 UTC on 4 December is **Thursday, December 3, 2026, 8:15 PM Eastern Time (7:15 PM Central)**.

## Left out on purpose

The rule-card document lists these as still open ("Decisions needed"), so the announcement does not state them:

- how long a Bounty's waiver boost lasts (open item 2). The announcement says only that the winner moves up the waiver order;
- what happens to a Wild Slot pick or a raided player who is later dropped or traded (open item 3);
- the narrow automatic-captain case in open item 1.

Also left out, for length: the ranking tie-breaks of the automatic captain, the postponed-game cases, how the deal is made and audited.

## Check before sending

1. **The twist cards are announced as built, but their list and multipliers are still an open item** in the rule-card document (open item 4: "The twist list and its multipliers ... including that Air Show doubles interception losses and Golden Boot is triple, not double"). The task for this draft asked for every card with its one-line rule, so all ten are here. **Confirm item 4 before sending**, or remove the six twist lines.
2. **Neither rule is live.** Both migrations (`20261004010000_chaos_clause_tiebreak.sql`, `20261004020000_chaos_week_rule_cards.sql`) were unapplied and `CHAOS_CARDS_ENABLED` was off on 2026-10-04, and neither branch was merged. The announcement says "You see your card right away on your matchup page and your lineup page", which is only true once those ship.
3. **The kickoff time** comes from the provider schedule and can move. Re-read `real_games` for Week 13 on the day you send.
4. **Timing.** The PRD requires the Chaos Clause to be announced before Week 13 lineups lock. The rule-card document says to tell managers before Week 13 and no later than the day cards are dealt.
5. **Postal address.** This is a league-operations notice, not a commercial message. The footer still carries the sender name and an unsubscribe link. A physical postal address is required by CAN-SPAM in any commercial email; **there is no postal address anywhere in this repository**. Set `EMAIL_POSTAL_ADDRESS` and the footer prints it.

No gambling language is used (`docs/EMAIL_SYSTEM.md`, template rule 7); the draft validator rejects it.

## English

**Email subject and heading:** Chaos Week rules: rule cards and the Chaos Clause

**Push title (21 characters):** Chaos Week: new rules

**Push text (106 characters):** Week 13 deals a rule card to every matchup, and tied playoff games go to the Chaos Clause. Read the rules.

**Body:**

~~~text
Two rules to know before Week 13.

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
Chaos Week counts in full. The score after the card is applied is the score of the game, and it goes into the standings.
~~~

## Spanish (es-419)

Card names match the Spanish names in the rule-card catalog on `feat/chaos-week-rule-cards`. This translation has not been reviewed by a native speaker.

**Email subject and heading:** Reglas de la Semana del Caos: cartas de reglas y la Cláusula del Caos

**Push title (30 characters):** Semana del Caos: nuevas reglas

**Push text (106 characters):** La Semana 13 reparte una carta de reglas por partido y los empates de playoffs van a la Cláusula del Caos.

**Body:**

~~~text
Dos reglas que debes conocer antes de la Semana 13.

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
La Semana del Caos cuenta por completo. La puntuación después de aplicar la carta es la puntuación del partido y entra en la tabla de posiciones.
~~~

## How it renders

- Email: a heading for each "##" line, a list for each "- " line, bold card names, a button "Open your league in Big Exec", then the footer: why the member received it, "Sent by Big Exec Fantasy Sports.", the unsubscribe link and the notification-settings link.
- Rendered images: `qa-artifacts/2026-10-04-notifications/email-en-390.png`, `email-es-390.png`, `email-en-images-off-390.png` (and `-640`).
- Exact HTML and plain text: the snapshot `apps/web/lib/notifications/__snapshots__/emailTemplate.test.ts.snap`.
