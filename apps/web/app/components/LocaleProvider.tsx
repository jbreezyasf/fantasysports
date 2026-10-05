'use client';

import { notificationSpanish } from '../settings/notifications/strings';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AppLocale = 'en' | 'es-419';

const STORAGE_KEY = 'big-exec-locale';
const COOKIE_KEY = 'big_exec_locale';

const spanish: Record<string, string> = {
  'The Experience': 'La Experiencia',
  'Franchise Legacy': 'Legado de Franquicia',
  'Sign In': 'Iniciar Sesión',
  'THE FRONT OFFICE IS YOURS': 'LA OFICINA PRINCIPAL ES TUYA',
  'Don’t just play fantasy.': 'No solo juegues fantasy.',
  'Run the franchise.': 'Dirige la franquicia.',
  'Draft the roster. Command the room. Build a stadium that remembers every rivalry, every upset, and every championship.': 'Arma la plantilla. Lidera la liga. Construye un estadio que recuerde cada rivalidad, cada sorpresa y cada campeonato.',
  'Create Your Front Office': 'Crea Tu Oficina Principal',
  'Enter Big Exec': 'Entrar a Big Exec',
  'PRO FOOTBALL': 'FÚTBOL AMERICANO PROFESIONAL',
  'Launching first': 'Primer deporte disponible',
  'FRANCHISE LEGACY': 'LEGADO DE FRANQUICIA',
  'Built to persist': 'Diseñado para perdurar',
  'ARCADE RECAPS': 'RESÚMENES ARCADE',
  'Your season, cinematic': 'Tu temporada, como una película',
  EXPLORE: 'EXPLORAR',
  'EVERYBODY DRAFTS.': 'TODOS PARTICIPAN EN EL DRAFT.',
  'Big Execs build franchises.': 'Los Big Exec construyen franquicias.',
  BUILD: 'CONSTRUYE',
  COMMAND: 'LIDERA',
  'BECOME LEGENDARY': 'CONVIÉRTETE EN LEYENDA',
  'Create a franchise identity that survives beyond a single matchup.': 'Crea una identidad de franquicia que dure más que un solo enfrentamiento.',
  'Draft, trade, set the lineup, and control the room.': 'Participa en el draft, negocia cambios, prepara la alineación y lidera la liga.',
  'Turn rivalries, championships, and weekly moments into permanent history.': 'Convierte rivalidades, campeonatos y momentos semanales en historia permanente.',
  'YOUR HOUSE. YOUR COLORS. YOUR HISTORY.': 'TU CASA. TUS COLORES. TU HISTORIA.',
  'A stadium that earns its story.': 'Un estadio que se gana su historia.',
  'Every new franchise begins with a real home. Achievements unlock monuments, banners, and permanent upgrades in your colors—turning a fantasy team into a place worth returning to.': 'Cada franquicia comienza con un verdadero hogar. Los logros desbloquean monumentos, banderines y mejoras permanentes con tus colores, convirtiendo un equipo fantasy en un lugar al que siempre querrás volver.',
  'Start Building': 'Comienza a Construir',
  'STARTER STADIUM': 'ESTADIO INICIAL',
  'YOUR LEGACY': 'TU LEGADO',
  'STARTS HERE.': 'COMIENZA AQUÍ.',
  'Create account →': 'Crear cuenta →',
  'WELCOME BACK, EXEC': 'BIENVENIDO DE NUEVO, EXEC',
  'YOUR LEGACY STARTS HERE': 'TU LEGADO COMIENZA AQUÍ',
  'Take your seat in the front office.': 'Toma tu lugar en la oficina principal.',
  'Already have a seat?': '¿Ya tienes una cuenta?',
  'New to Big Exec?': '¿Eres nuevo en Big Exec?',
  'Create your account': 'Crea tu cuenta',
  'Password requirements': 'Requisitos de contraseña',
  '8+ characters, uppercase, lowercase, number, and symbol.': '8 o más caracteres, mayúscula, minúscula, número y símbolo.',
  'By continuing, you agree to our': 'Al continuar, aceptas nuestros',
  Terms: 'Términos',
  'Privacy Policy': 'Política de Privacidad',
  'Create the league.': 'Crea la liga.',
  'League name': 'Nombre de la liga',
  'Your franchise name': 'Nombre de tu franquicia',
  'Create league + franchise': 'Crear liga y franquicia',
  'MAKE YOUR MOVE': 'HAZ TU JUGADA',
  'What needs attention': 'Lo que necesita atención',
  'LEAGUE CONVERSATION': 'CONVERSACIÓN DE LA LIGA',
  'Talk with managers and follow league activity.': 'Habla con los mánagers y sigue la actividad de la liga.',
  'DEALS & NEGOTIATIONS': 'ACUERDOS Y NEGOCIACIONES',
  'Build offers and review proposals.': 'Crea ofertas y revisa propuestas.',
  'Add players and manage waiver claims.': 'Añade jugadores y administra reclamos de waivers.',
  'Standings, moves, and weekly headlines appear here.': 'Las posiciones, movimientos y noticias semanales aparecen aquí.',
  'No league headlines yet. Draft picks, trades, results, and awards will appear here.': 'Todavía no hay noticias. Las selecciones del draft, cambios, resultados y premios aparecerán aquí.',
  'No scoring stats yet': 'Todavía no hay estadísticas de puntuación',
  'Refresh Scores': 'Actualizar Puntuaciones',
  'Watch Arcade Recap': 'Ver Resumen Arcade',
  'Build Arcade Recap': 'Crear Resumen Arcade',
  'STARTING LINEUPS': 'ALINEACIONES TITULARES',
  'Head to head': 'Cara a cara',
  'No commissioner approval is required': 'No se requiere aprobación del comisionado',
  'The league never sleeps.': 'La liga nunca duerme.',
  'Results, roster moves, rivalries, awards, and the decisions shaping this season.': 'Resultados, movimientos de plantilla, rivalidades, premios y las decisiones que definen esta temporada.',
  'Around the league': 'Alrededor de la liga',
  'Top five': 'Primeros cinco',
  'Weekly awards': 'Premios semanales',
  'Trade pulse': 'Pulso de cambios',
  'Front Office': 'Oficina Principal',
  Matchup: 'Enfrentamiento',
  'Locker Room': 'Vestidor',
  League: 'Liga',
  Stadium: 'Estadio',
  'League HQ': 'Sede de la Liga',
  Schedule: 'Calendario',
  Trades: 'Cambios',
  Players: 'Jugadores',
  'Roster Integrity': 'Integridad de Plantilla',
  'Free Agency': 'Agencia Libre',
  'Draft Room': 'Sala del Draft',
  'Trade Room': 'Sala de Cambios',
  'League News': 'Noticias de la Liga',
  'Enter Draft Room': 'Entrar a la Sala del Draft',
  'Enter Trade Room': 'Entrar a la Sala de Cambios',
  'Open Free Agency': 'Abrir Agencia Libre',
  'View Matchup': 'Ver Enfrentamiento',
  'Manage Lineup': 'Administrar Alineación',
  'Your Lineup': 'Tu Alineación',
  Starters: 'Titulares',
  Bench: 'Banca',
  'Bench Points': 'Puntos en la Banca',
  'Score details': 'Detalles de puntuación',
  Available: 'Disponible',
  Waivers: 'Waivers',
  Rostered: 'En Plantilla',
  'Claim Pending': 'Reclamo Pendiente',
  'Submit Claim': 'Enviar Reclamo',
  'Withdraw Claim': 'Retirar Reclamo',
  Search: 'Buscar',
  'Available only': 'Solo disponibles',
  Position: 'Posición',
  Team: 'Equipo',
  Points: 'Puntos',
  Average: 'Promedio',
  'Last week': 'Semana pasada',
  'Last 3 weeks': 'Últimas 3 semanas',
  'Best week': 'Mejor semana',
  'Season average': 'Promedio de temporada',
  'Current matchup': 'Enfrentamiento actual',
  Final: 'Final',
  Live: 'En vivo',
  Upcoming: 'Próximo',
  'No games in progress': 'No hay partidos en curso',
  Standings: 'Posiciones',
  Record: 'Récord',
  Rank: 'Posición',
  Manager: 'Mánager',
  Commissioner: 'Comisionado',
  'League Settings': 'Configuración de la Liga',
  'Invite Managers': 'Invitar Mánagers',
  'Send Invitations': 'Enviar Invitaciones',
  'Share Link': 'Enlace para Compartir',
  'Create League': 'Crear Liga',
  'Join League': 'Unirse a una Liga',
  'Sign in': 'Iniciar sesión',
  'Create your account.': 'Crea tu cuenta.',
  'Manager name': 'Nombre del mánager',
  'Email address': 'Correo electrónico',
  Password: 'Contraseña',
  'Enter the Front Office': 'Entrar a la Oficina Principal',
  'Create My Big Exec Account': 'Crear Mi Cuenta Big Exec',
  'Forgot password?': '¿Olvidaste tu contraseña?',
  'Sign out': 'Cerrar sesión',
  'Front Office Advisor': 'Asesor de la Oficina Principal',
  'Ask Advisor': 'Preguntar al Asesor',
  'Type your question': 'Escribe tu pregunta',
  'Listen to response': 'Escuchar respuesta',
  'Try again': 'Intentar de nuevo',
  Loading: 'Cargando',
  Saving: 'Guardando',
  Saved: 'Guardado',
  Cancel: 'Cancelar',
  Continue: 'Continuar',
  Back: 'Atrás',
  Close: 'Cerrar',
  Open: 'Abrir',
  Change: 'Cambiar',
  Remove: 'Eliminar',
  Add: 'Añadir',
  Confirm: 'Confirmar',
  Error: 'Error',
  Success: 'Éxito',
  Pending: 'Pendiente',
  'Run the franchise. Own the season.': 'Dirige la franquicia. Domina la temporada.',
  'The front office is waiting.': 'La oficina principal te espera.',
  'Continue building your franchise.': 'Continúa construyendo tu franquicia.',
  'Build something legendary.': 'Construye algo legendario.',
  'Install Big Exec': 'Instala Big Exec',
  'Install app': 'Instalar app',
  'Not now': 'Ahora no',
  'Add Big Exec to your home screen for faster game-day access.': 'Añade Big Exec a tu pantalla de inicio para entrar más rápido el día del juego.',
  'Tap Share, then choose Add to Home Screen.': 'Toca Compartir y luego selecciona Añadir a pantalla de inicio.',
  'Decided by the Chaos Clause': 'Decidido por la Cláusula del Caos',
  'Chaos Clause winner': 'Ganador por la Cláusula del Caos',
  'Higher Chaos Week score': 'Mayor puntuación en la Semana del Caos',
  'Higher Rivalry Week score': 'Mayor puntuación en la Semana de Rivalidad',
  'Higher postseason seed': 'Mejor clasificación de postemporada',
  // Chaos Week rule cards (lib/matchups/chaosCards.ts). A unit test checks every card string has an entry here.
  "CHAOS WEEK RULE CARD": "CARTA DE REGLAS DE LA SEMANA DEL CAOS",
  "Dealt by Big Exec from a recorded seed. Both teams play under the same card.": "Repartida por Big Exec a partir de una semilla registrada. Ambos equipos juegan con la misma carta.",
  "How the score is built": "Cómo se construye la puntuación",
  "Lineup total": "Total de la alineación",
  "Chaos Week total": "Total de la Semana del Caos",
  "No card adjustments": "Sin ajustes por la carta",
  "Selections": "Selecciones",
  "Open for changes": "Abierto a cambios",
  "Deadline": "Fecha límite",
  "Locked": "Bloqueado",
  "Not made": "Sin elegir",
  "Lower seed": "Peor clasificado",
  "Higher seed": "Mejor clasificado",
  "Bounty earned: first in the waiver order until": "Recompensa ganada: primero en el orden de waivers hasta",
  "Bounty earned: up three places in the waiver order until": "Recompensa ganada: tres puestos arriba en el orden de waivers hasta",
  "Earned by whichever team wins. The lower seed goes to the front of the waiver order. The higher seed moves up three places.": "La gana el equipo que venza. El peor clasificado pasa al frente del orden de waivers. El mejor clasificado sube tres puestos.",
  "The game was tied. No bounty was earned.": "El partido terminó empatado. No se obtuvo recompensa.",
  "If you do not choose, your captain will be": "Si no eliges, tu capitán será",
  "If no captain is named, the captain will be": "Si no se nombra capitán, el capitán será",
  "Automatic captain": "Capitán automático",
  "Automatic captain:": "Capitán automático:",
  "(locked at kickoff)": "(fijado al inicio del partido)",
  "No captain was named before this player's game kicked off, so the automatic captain is fixed for the week.": "No se nombró capitán antes de que empezara el partido de este jugador, así que el capitán automático queda fijado para la semana.",
  "Chosen automatically: the starter with the highest average fantasy points per game over their last three scored weeks before Week 13.": "Elegido automáticamente: el titular con el mejor promedio de puntos fantasy por partido en sus últimas tres semanas con puntuación antes de la Semana 13.",
  "Chosen automatically: no starter has a score before Week 13, so the first starter in a fixed order is used.": "Elegido automáticamente: ningún titular tiene puntuación antes de la Semana 13, así que se usa el primer titular según un orden fijo.",
  "Average points per game": "Promedio de puntos por partido",
  "Games counted": "Partidos contados",
  "This card needs no selection. It applies to both lineups automatically.": "Esta carta no requiere selección. Se aplica automáticamente a ambas alineaciones.",
  "Your Chaos Week card": "Tu carta de la Semana del Caos",
  "Make your selection": "Haz tu selección",
  "View Chaos Week matchup": "Ver enfrentamiento de la Semana del Caos",
  "Clear selection": "Quitar selección",
  "No eligible players right now.": "No hay jugadores elegibles en este momento.",
  "Only the lower seed raids. The higher seed has nothing to choose.": "Solo asalta el equipo peor clasificado. El mejor clasificado no tiene nada que elegir.",
  "Your opponent raided this player. They stay on your roster but cannot start for you this week.": "Tu rival asaltó a este jugador. Sigue en tu plantilla, pero no puede ser titular contigo esta semana.",
  "Choose your captain": "Elige a tu capitán",
  "Name captain": "Nombrar capitán",
  "Captain": "Capitán",
  "No captain named yet.": "Aún no se ha nombrado capitán.",
  "Before your captain's game kicks off": "Antes de que empiece el partido de tu capitán",
  "Your captain's game has started. The captain can no longer be changed.": "El partido de tu capitán ya empezó. Ya no se puede cambiar de capitán.",
  "Captain saved.": "Capitán guardado.",
  "Captain cleared.": "Capitán quitado.",
  "Captain bonus": "Bonificación de capitán",
  "Choose your Wild Slot player": "Elige a tu jugador del Puesto Comodín",
  "Use Wild Slot": "Usar Puesto Comodín",
  "Wild Slot": "Puesto Comodín",
  "No Wild Slot player named yet.": "Aún no se ha nombrado jugador para el Puesto Comodín.",
  "Before that player's game kicks off": "Antes de que empiece el partido de ese jugador",
  "Your Wild Slot player's game has started. The pick can no longer be changed.": "El partido de tu jugador del Puesto Comodín ya empezó. Ya no se puede cambiar la elección.",
  "Wild Slot saved.": "Puesto Comodín guardado.",
  "Wild Slot cleared.": "Puesto Comodín quitado.",
  "Wild Slot player": "Jugador del Puesto Comodín",
  "Choose one player from your opponent's bench": "Elige a un jugador de la banca de tu rival",
  "Raid this player": "Asaltar a este jugador",
  "Raid": "Asalto",
  "No raid made yet.": "Aún no se ha hecho ningún asalto.",
  // Automatic Wild Slot, automatic raid, the raid penalty and void selections (owner decisions of 2026-10-04, third round).
  "If you do not choose, the system will pick": "Si no eliges, el sistema elegirá a",
  "If no Wild Slot player is named, the system will pick": "Si no se nombra jugador para el Puesto Comodín, el sistema elegirá a",
  "If no raid is made by the deadline, the system will raid": "Si no se hace ningún asalto antes del límite, el sistema asaltará a",
  "Automatic Wild Slot player:": "Jugador automático del Puesto Comodín:",
  "Automatic raid:": "Asalto automático:",
  "(made by the system)": "(hecho por el sistema)",
  "No Wild Slot player was named before this player's game kicked off, so the automatic pick is fixed for the week.": "No se nombró jugador para el Puesto Comodín antes de que empezara el partido de este jugador, así que la elección automática queda fijada para la semana.",
  "No raid by the lower seed was standing once the deadline had passed, so the system made the raid. It cannot be changed.": "Pasada la fecha límite no había ningún asalto vigente del equipo peor clasificado, así que el sistema hizo el asalto. No se puede cambiar.",
  "Chosen automatically: the player outside the starting lineup with the highest average fantasy points per game over their last three scored weeks before Week 13.": "Elegido automáticamente: el jugador fuera de la alineación titular con el mejor promedio de puntos fantasy por partido en sus últimas tres semanas con puntuación antes de la Semana 13.",
  "Chosen automatically: no eligible player outside the starting lineup has a score before Week 13, so the first one in a fixed order is used.": "Elegido automáticamente: ningún jugador elegible fuera de la alineación titular tiene puntuación antes de la Semana 13, así que se usa el primero según un orden fijo.",
  "Chosen automatically: the player on the higher seed's bench with the highest average fantasy points per game over their last three scored weeks before Week 13.": "Elegido automáticamente: el jugador de la banca del equipo mejor clasificado con el mejor promedio de puntos fantasy por partido en sus últimas tres semanas con puntuación antes de la Semana 13.",
  "Chosen automatically: no eligible player on the higher seed's bench has a score before Week 13, so the first one in a fixed order is used.": "Elegido automáticamente: ningún jugador elegible de la banca del equipo mejor clasificado tiene puntuación antes de la Semana 13, así que se usa el primero según un orden fijo.",
  "Chosen automatically: the higher seed's starter with the highest average fantasy points per game over their last three scored weeks before Week 13.": "Elegido automáticamente: el titular del equipo mejor clasificado con el mejor promedio de puntos fantasy por partido en sus últimas tres semanas con puntuación antes de la Semana 13.",
  "Chosen automatically: none of the higher seed's starters has a score before Week 13, so the first one in a fixed order is used.": "Elegido automáticamente: ningún titular del equipo mejor clasificado tiene puntuación antes de la Semana 13, así que se usa el primero según un orden fijo.",
  "No eligible player outside the starting lineup, so there is no automatic Wild Slot player and no extra points.": "No hay ningún jugador elegible fuera de la alineación titular, así que no hay jugador automático del Puesto Comodín ni puntos adicionales.",
  "Automatic Wild Slot player": "Jugador automático del Puesto Comodín",
  "Automatic raid": "Asalto automático",
  "Penalty raid": "Asalto con penalización",
  "Automatic penalty raid": "Asalto automático con penalización",
  "The higher seed has no eligible bench player, so the raid takes its best-ranked starter instead. The lower seed adds that starter's points. The higher seed keeps the starter in its lineup and still scores them.": "El equipo mejor clasificado no tiene ningún jugador elegible en la banca, así que el asalto se lleva a su titular mejor clasificado. El equipo peor clasificado suma los puntos de ese titular. El equipo mejor clasificado lo mantiene en su alineación y sigue sumando sus puntos.",
  "This is the only player you can raid.": "Este es el único jugador al que puedes asaltar.",
  "Raid your opponent's best-ranked starter": "Asalta al titular mejor clasificado de tu rival",
  "You had no eligible bench player, so the raid took this starter. They stay in your lineup and still score for you. Your opponent adds their points too.": "No tenías ningún jugador elegible en la banca, así que el asalto se llevó a este titular. Sigue en tu alineación y sigue sumando puntos para ti. Tu rival también suma sus puntos.",
  "No longer counts": "Ya no cuenta",
  "This Wild Slot player left the roster before their game kicked off, so the pick no longer counts.": "Este jugador del Puesto Comodín salió de la plantilla antes de que empezara su partido, así que la elección ya no cuenta.",
  "The raided player left the higher seed's roster before their game kicked off, so the raid no longer counts.": "El jugador asaltado salió de la plantilla del equipo mejor clasificado antes de que empezara su partido, así que el asalto ya no cuenta.",
  "Choose again. If you do not, the automatic pick applies.": "Elige de nuevo. Si no lo haces, se aplica la elección automática.",
  "Choose again before the deadline. If you do not, the system makes the raid at the deadline.": "Elige de nuevo antes de la fecha límite. Si no lo haces, el sistema hace el asalto en la fecha límite.",
  "Before the first Week 13 kickoff. A raid cannot be changed once made.": "Antes del primer partido de la Semana 13. Un asalto no se puede cambiar una vez hecho.",
  "Your raid is made and cannot be changed.": "Tu asalto está hecho y no se puede cambiar.",
  "Raid made.": "Asalto realizado.",
  "Raided player": "Jugador asaltado",
  "Card twist": "Giro de la carta",
  "The raid deadline has passed. No raid was made.": "La fecha límite del asalto ya pasó. No se hizo ningún asalto.",
  "Chaos Week is complete. Selections are closed.": "La Semana del Caos terminó. Las selecciones están cerradas.",
  "Bounty": "Recompensa",
  "Tight End Takeover": "Dominio del Ala Cerrada",
  "Golden Boot": "Bota de Oro",
  "Iron Curtain": "Cortina de Hierro",
  "Ground Control": "Control Terrestre",
  "Air Show": "Espectáculo Aéreo",
  "Slippery Hands": "Manos Resbalosas",
  "Each manager names one Week 13 starter as captain before that player's game kicks off. The captain's fantasy points count double in this matchup. If no captain is named, the starter with the highest recent scoring average becomes captain automatically and is locked in at that player's kickoff.": "Cada mánager nombra capitán a uno de sus titulares de la Semana 13 antes de que empiece el partido de ese jugador. Los puntos fantasy del capitán cuentan doble en este enfrentamiento. Si no se nombra capitán, el titular con el mejor promedio reciente de puntos pasa a ser capitán automáticamente y queda fijado cuando empieza el partido de ese jugador.",
  "Each manager may name one extra player from their active roster, at any position, who is not already starting. That player's Week 13 points are added to the team total. Choose before that player's game kicks off. If no player is named, the non-starting player with the highest recent scoring average is used automatically and is locked in at that player's kickoff.": "Cada mánager puede nombrar a un jugador adicional de su plantilla activa, de cualquier posición, que no sea ya titular. Los puntos de ese jugador en la Semana 13 se suman al total del equipo. Elige antes de que empiece el partido de ese jugador. Si no se nombra a nadie, se usa automáticamente al jugador no titular con el mejor promedio reciente de puntos, y queda fijado cuando empieza su partido.",
  "The lower seed picks one player from the higher seed's bench before the first Week 13 kickoff. That player's Week 13 points are added to the lower seed's total. The player stays on the higher seed's roster but cannot start for them in Week 13. If no raid is made by the deadline, the bench player with the highest recent scoring average is raided automatically. If the higher seed has no eligible bench player, the raid takes its best-ranked starter instead.": "El equipo con peor clasificación elige a un jugador de la banca del equipo mejor clasificado antes del primer partido de la Semana 13. Los puntos de ese jugador en la Semana 13 se suman al total del equipo con peor clasificación. El jugador sigue en la plantilla del rival, pero no puede ser titular con él en la Semana 13. Si no se hace ningún asalto antes del límite, se asalta automáticamente al jugador de la banca con el mejor promedio reciente de puntos. Si el equipo mejor clasificado no tiene ningún jugador elegible en la banca, el asalto se lleva a su titular mejor clasificado.",
  "Whoever wins this matchup moves up the waiver order for the following fantasy week. If the lower seed wins, it goes to the front. If the higher seed wins, it moves up three places. A tie changes nothing.": "Quien gane este enfrentamiento sube en el orden de waivers durante la siguiente semana fantasy. Si gana el equipo con peor clasificación, pasa al frente. Si gana el equipo mejor clasificado, sube tres puestos. Un empate no cambia nada.",
  "Every starting tight end scores double for both teams.": "Cada ala cerrada titular puntúa doble para ambos equipos.",
  "Every starting kicker scores triple for both teams.": "Cada pateador titular puntúa triple para ambos equipos.",
  "Each starting defense and special teams unit scores double for both teams. Negative scores are doubled too.": "Cada defensa y equipos especiales titular puntúa doble para ambos equipos. Las puntuaciones negativas también se duplican.",
  "All rushing points scored by starters count double for both teams.": "Todos los puntos por carrera de los titulares cuentan doble para ambos equipos.",
  "All passing points scored by starters count double for both teams. Interceptions are part of passing points, so they cost double too.": "Todos los puntos por pase de los titulares cuentan doble para ambos equipos. Las intercepciones forman parte de los puntos por pase, así que también cuestan el doble.",
  "Every fumble lost by a starter costs triple for both teams.": "Cada balón suelto perdido por un titular cuesta el triple para ambos equipos.",
  'Recent performance mode.': 'Modo de rendimiento reciente.',
  'Provider update delayed.': 'Actualización del proveedor retrasada.',
  'Waiver recommendations prioritize recent production, provider projections, and availability.': 'Las recomendaciones de waivers priorizan la producción reciente, las proyecciones del proveedor y la disponibilidad.',
  'Players are ranked by health and verified recent fantasy production while the next provider rankings update completes.': 'Los jugadores se clasifican por salud y producción fantasy reciente verificada mientras se completa la próxima actualización de rankings.',
  'One identity. Every league. A franchise history designed to outlive the week.':
    'Una identidad. Cada liga. Una historia de franquicia diseñada para durar mucho más que una semana.',  // Notification settings (app/settings/notifications/strings.ts).
  ...notificationSpanish,
};

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (message: string) => string;
};

const LocaleContext = createContext<LocaleContextValue>({ locale: 'en', setLocale: () => undefined, t: message => message });

export function translateMessage(value:string){return spanish[value]??value}

function translateText(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return value;
  return `${leading}${translateMessage(core)}${trailing}`;
}

function translateTree(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA'].includes(parent.tagName) && !parent.closest('[data-no-translate]')) {
      const translated = translateText(node.nodeValue ?? '');
      if (translated !== node.nodeValue) node.nodeValue = translated;
    }
    node = walker.nextNode();
  }

  root.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]').forEach(element => {
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(attribute);
      if (value && spanish[value]) element.setAttribute(attribute, spanish[value]);
    }
  });
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>('en');

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const cookie = document.cookie.split('; ').find(item => item.startsWith(`${COOKIE_KEY}=`))?.split('=')[1];
    const preferred = stored === 'es-419' || cookie === 'es-419' ? 'es-419' : 'en';
    setLocaleState(preferred);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'es-419' ? 'es-419' : 'en';
    if (locale !== 'es-419') {
      // Server navigation restores the English source. Reload once when switching back
      // so translated text nodes are never reverse-guessed.
      return;
    }
    translateTree(document.body);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) translateTree(node as Element);
          if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            const translated = translateText(node.nodeValue ?? '');
            if (translated !== node.nodeValue) node.nodeValue = translated;
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale, t: message => (locale === 'es-419' ? translateMessage(message) : message) }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const select = (next: AppLocale) => {
    if (next === locale) return;
    setLocale(next);
    if (next === 'en') window.location.reload();
  };
  return (
    <div className="languageToggle" role="group" aria-label={locale === 'es-419' ? 'Idioma' : 'Language'} data-no-translate>
      <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => select('en')}>EN</button>
      <button type="button" lang="es-419" aria-pressed={locale === 'es-419'} onClick={() => select('es-419')}>ES</button>
    </div>
  );
}
