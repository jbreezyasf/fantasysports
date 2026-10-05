// Every string on the notification settings page, in English and Spanish (es-419).
// `N` is what components use (English source text, passed through t()); `notificationSpanish`
// is merged into the locale catalog in app/components/LocaleProvider.tsx.

const PAIRS = {
  navLabel: ['Notifications', 'Notificaciones'],
  eyebrow: ['MANAGER SETTINGS', 'CONFIGURACIÓN DEL MÁNAGER'],
  title: ['Notifications', 'Notificaciones'],
  lede: ['Choose how Big Exec reaches you and what it tells you about.', 'Elige cómo te contacta Big Exec y sobre qué te avisa.'],
  backToLeague: ['Back to your league', 'Volver a tu liga'],
  backToDashboard: ['Back to the Front Office', 'Volver a la Oficina Principal'],
  unavailable: ['Notification settings are not available yet. Nothing is being sent to you from this page.', 'La configuración de notificaciones todavía no está disponible. Desde esta página no se te envía nada.'],
  loadError: ['Your notification settings could not be loaded. Please try again in a moment.', 'No se pudo cargar tu configuración de notificaciones. Inténtalo de nuevo en un momento.'],

  preferencesTitle: ['Your preferences', 'Tus preferencias'],
  channelsLegend: ['How we reach you', 'Cómo te contactamos'],
  emailLabel: ['League email', 'Correo de la liga'],
  emailHint: ['Sent to the email on your account. Password-reset and other account security emails are always sent, whatever you choose here.', 'Se envía al correo de tu cuenta. Los correos de restablecimiento de contraseña y de seguridad de la cuenta siempre se envían, sin importar lo que elijas aquí.'],
  pushLabel: ['Push notifications', 'Notificaciones push'],
  pushHint: ['Sent to every device where you have turned push on below. Turning this off pauses push on all of them.', 'Se envían a cada dispositivo donde hayas activado push más abajo. Si lo desactivas, se pausa en todos.'],

  categoriesLegend: ['What you hear about', 'Sobre qué te avisamos'],
  categoriesHint: ['These switches apply to both email and push.', 'Estos interruptores se aplican al correo y a push.'],
  notSendingYet: ['Not sending yet. Your choice is saved for when it starts.', 'Todavía no se envía. Tu elección queda guardada para cuando empiece.'],
  cat_league_announcements: ['League announcements', 'Anuncios de la liga'],
  cat_league_announcements_hint: ['Rule changes and important notices for your league.', 'Cambios de reglas y avisos importantes de tu liga.'],
  cat_lineup_lock_reminder: ['Lineup lock reminder', 'Recordatorio de cierre de alineación'],
  cat_score_final: ['Final scores', 'Resultados finales'],
  cat_trade_offer: ['Trade offers', 'Ofertas de cambio'],
  cat_waiver_result: ['Waiver results', 'Resultados de waivers'],
  cat_weekly_recap: ['Weekly recap', 'Resumen semanal'],

  languageLabel: ['Language for email and push', 'Idioma del correo y de push'],
  languageEnglish: ['English', 'Inglés'],
  languageSpanish: ['Spanish', 'Español'],
  save: ['Save preferences', 'Guardar preferencias'],
  saving: ['Saving…', 'Guardando…'],
  saved: ['Notification preferences saved.', 'Preferencias de notificaciones guardadas.'],
  saveError: ['Your preferences were not saved. Please try again.', 'No se guardaron tus preferencias. Inténtalo de nuevo.'],
  signInAgain: ['Your session has ended. Sign in again to change notification preferences.', 'Tu sesión terminó. Inicia sesión de nuevo para cambiar tus preferencias de notificaciones.'],

  deviceTitle: ['Push on this device', 'Push en este dispositivo'],
  deviceIntro: ['Your browser asks for permission only when you press the button. Big Exec never asks on its own.', 'Tu navegador pide permiso solo cuando presionas el botón. Big Exec nunca lo pide por su cuenta.'],
  deviceChecking: ['Checking this device…', 'Revisando este dispositivo…'],
  deviceOn: ['Push is on for this device.', 'Push está activado en este dispositivo.'],
  deviceOff: ['Push is off for this device.', 'Push está desactivado en este dispositivo.'],
  deviceUnsupported: ['This browser does not support push notifications.', 'Este navegador no admite notificaciones push.'],
  deviceNotConfigured: ['Push notifications are not available yet.', 'Las notificaciones push todavía no están disponibles.'],
  deviceBlocked: ['Notifications are blocked for Big Exec in this browser. Allow them in your browser or device settings, then come back to this page.', 'Las notificaciones de Big Exec están bloqueadas en este navegador. Permítelas en la configuración de tu navegador o dispositivo y vuelve a esta página.'],
  turnOn: ['Turn on push on this device', 'Activar push en este dispositivo'],
  turnOff: ['Turn off push on this device', 'Desactivar push en este dispositivo'],
  working: ['Working…', 'Procesando…'],
  turnedOn: ['Push is now on for this device.', 'Push quedó activado en este dispositivo.'],
  turnedOff: ['Push is now off for this device.', 'Push quedó desactivado en este dispositivo.'],
  permissionDenied: ['Permission was not given, so push stays off for this device.', 'No se dio permiso, así que push sigue desactivado en este dispositivo.'],
  pushError: ['Push could not be changed on this device. Please try again.', 'No se pudo cambiar push en este dispositivo. Inténtalo de nuevo.'],
  rateLimited: ['Too many attempts. Please wait a few minutes and try again.', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],

  iosTitle: ['iPhone and iPad', 'iPhone y iPad'],
  iosBody: ['On iPhone and iPad, push works only after you add Big Exec to your Home Screen and open it from there. In Safari, tap Share, then Add to Home Screen. Then open Big Exec from the Home Screen and come back to this page.', 'En iPhone y iPad, push funciona solo después de añadir Big Exec a tu pantalla de inicio y abrirlo desde ahí. En Safari, toca Compartir y luego Añadir a pantalla de inicio. Después abre Big Exec desde la pantalla de inicio y vuelve a esta página.'],
  iosNeedsInstall: ['To turn on push on this iPhone or iPad, first add Big Exec to your Home Screen and open it from there.', 'Para activar push en este iPhone o iPad, primero añade Big Exec a tu pantalla de inicio y ábrelo desde ahí.'],
  showInstall: ['Show install steps', 'Mostrar pasos de instalación'],
  installShown: ['Install steps are shown at the bottom of the page.', 'Los pasos de instalación se muestran al final de la página.'],

  devicesTitle: ['Devices with push turned on', 'Dispositivos con push activado'],
  devicesNone: ['No device has push turned on.', 'Ningún dispositivo tiene push activado.'],
  deviceAdded: ['Added', 'Añadido'],
  deviceLastDelivered: ['Last delivered', 'Última entrega'],
  deviceNeverDelivered: ['Nothing delivered yet', 'Todavía no se entregó nada'],
  deviceUnknown: ['Browser', 'Navegador']
} as const satisfies Record<string, readonly [string, string]>;

type Key = keyof typeof PAIRS;

export const N = Object.fromEntries(Object.entries(PAIRS).map(([key, pair]) => [key, pair[0]])) as { [K in Key]: string };

export const notificationSpanish: Record<string, string> = Object.fromEntries(Object.values(PAIRS).map(pair => [pair[0], pair[1]]));

export const NOTIFICATION_STRING_PAIRS: ReadonlyArray<readonly [string, string]> = Object.values(PAIRS);
