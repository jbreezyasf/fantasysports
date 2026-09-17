'use client';

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
  'One identity. Every league. A franchise history designed to outlive the week.':
    'Una identidad. Cada liga. Una historia de franquicia diseñada para durar mucho más que una semana.',
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
