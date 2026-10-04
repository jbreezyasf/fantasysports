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
- **The cards, the automatic picks, the raid penalty, void picks, the locks, the raid deadline, Bounty in Week 14 only, league scope, full stakes**: the same document, section 1 and the three decision tables at its top (re-read after the third round of decisions).
- **The raid deadline time**: that document, section 5 (first Week 13 kickoff 2026-12-04 01:15 UTC), and the same value read from production `real_games` on 2026-10-04. 01:15 UTC on 4 December is **Thursday, December 3, 2026, 8:15 PM Eastern Time (7:15 PM Central)**.

## Left out on purpose

The rule-card document still lists these under "Decisions needed", so the announcement does not state them:

- whether the higher seed still scores a starter taken by the penalty raid (item 1). The announcement says only that the raid takes that starter;
- whether an automatic raid made after the deadline can take a player who has already played (item 2);
- the no-hindsight rule for automatic selections, which awaits the owner's confirmation (item 3).

Left out for length (all decided, all in section 1 of the rule-card document): the Chaos Week pairings, where the card is shown, the ranking tie-breaks, postponed and bye-week cases, that a manager with no eligible non-starter gets no Wild Slot bonus, that a second raid after a void one is only possible before the deadline, that a higher-seed Bounty winner cannot pass a lower-seed winner, and how the deal is made and audited. **There is no manager-facing rules page in the app** to link to for this detail; the announcement links to the manager's league.

## Check before sending

1. **Neither rule is live.** Both migrations (`20261004010000_chaos_clause_tiebreak.sql`, `20261004020000_chaos_week_rule_cards.sql`) were unapplied, `CHAOS_CARDS_ENABLED` was off and no league season was opted in on 2026-10-04, and neither branch was merged. The announcement says Stress Test 2026 plays with rule cards this season, which is only true once those ship and the league season is opted in.
2. **The kickoff time** comes from the provider schedule and can move. Re-read `real_games` for Week 13 on the day you send.
3. **Timing.** The PRD requires the Chaos Clause to be announced before Week 13 lineups lock. The rule-card document says to tell managers before Week 13 and no later than the day cards are dealt.
4. **Postal address.** This is a league-operations notice, not a commercial message. The footer still carries the sender name and an unsubscribe link. A physical postal address is required by CAN-SPAM in any commercial email; **there is no postal address anywhere in this repository**. Set `EMAIL_POSTAL_ADDRESS` and the footer prints it.

No gambling language is used (`docs/EMAIL_SYSTEM.md`, template rule 7); the draft validator rejects it.

## English

**Email subject and heading:** Chaos Week rules: rule cards and the Chaos Clause

**Push title (21 characters):** Chaos Week: new rules

**Push text (106 characters):** Week 13 deals a rule card to every matchup, and tied playoff games go to the Chaos Clause. Read the rules.

**Body:**

~~~text
## Tied playoff games: the Chaos Clause
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
The score after the card is applied is the score of the game, and it goes into the standings.
~~~

## Spanish (es-419)

Card names match the Spanish names in the rule-card catalog on `feat/chaos-week-rule-cards`. This translation has not been reviewed by a native speaker.

**Email subject and heading:** Reglas de la Semana del Caos: cartas de reglas y la Cláusula del Caos

**Push title (30 characters):** Semana del Caos: nuevas reglas

**Push text (106 characters):** La Semana 13 reparte una carta de reglas por partido y los empates de playoffs van a la Cláusula del Caos.

**Body:**

~~~text
## Empates en playoffs: la Cláusula del Caos
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
La puntuación después de aplicar la carta es la puntuación del partido y entra en la tabla de posiciones.
~~~

## How it renders

- Email: a heading for each "##" line, a list for each "- " line, bold card names, a button "Open your league in Big Exec", then the footer: why the member received it, "Sent by Big Exec Fantasy Sports.", the unsubscribe link and the notification-settings link.
- Rendered images: `qa-artifacts/2026-10-04-notifications/email-en-390.png`, `email-es-390.png`, `email-en-images-off-390.png` (and `-640`).
- Exact HTML and plain text: the snapshot `apps/web/lib/notifications/__snapshots__/emailTemplate.test.ts.snap`.
