import type { Metadata } from 'next';
import { unsubscribeSecret, verifyUnsubscribeToken } from '../../lib/notifications/unsubscribeToken';
import styles from '../settings/notifications/notifications.module.css';

export const metadata: Metadata = { title: 'Unsubscribe from league emails', robots: { index: false } };

// The page behind the unsubscribe link in every league email. No login: the signed token names
// the account. Opening the page changes nothing; pressing the one button does.

const COPY = {
  en: {
    eyebrow: 'EMAIL PREFERENCES',
    confirmTitle: 'Stop league emails?',
    confirmBody: 'Press the button to stop league emails from Big Exec Fantasy Sports to this address. Password-reset and other account security emails will still be sent.',
    button: 'Unsubscribe from league emails',
    doneTitle: 'You are unsubscribed.',
    doneBody: 'Big Exec will not send league emails to this address. Password-reset and other account security emails are not affected. You can turn league emails back on at any time in your notification settings.',
    invalidTitle: 'This unsubscribe link is not valid.',
    invalidBody: 'The link may be incomplete. Sign in and use your notification settings to change what you receive.',
    unavailableTitle: 'We could not update your preferences.',
    unavailableBody: 'Nothing was changed. Please try the link again in a few minutes, or sign in and use your notification settings.',
    settings: 'Open notification settings'
  },
  es: {
    eyebrow: 'PREFERENCIAS DE CORREO',
    confirmTitle: '¿Dejar de recibir correos de la liga?',
    confirmBody: 'Presiona el botón para dejar de recibir en esta dirección los correos de la liga de Big Exec Fantasy Sports. Los correos de restablecimiento de contraseña y de seguridad de la cuenta se seguirán enviando.',
    button: 'Cancelar la suscripción a los correos de la liga',
    doneTitle: 'Cancelaste tu suscripción.',
    doneBody: 'Big Exec no enviará correos de la liga a esta dirección. Los correos de restablecimiento de contraseña y de seguridad de la cuenta no cambian. Puedes volver a activar los correos de la liga cuando quieras en tu configuración de notificaciones.',
    invalidTitle: 'Este enlace para cancelar la suscripción no es válido.',
    invalidBody: 'Es posible que el enlace esté incompleto. Inicia sesión y usa tu configuración de notificaciones para cambiar lo que recibes.',
    unavailableTitle: 'No pudimos actualizar tus preferencias.',
    unavailableBody: 'No se cambió nada. Intenta abrir el enlace de nuevo en unos minutos, o inicia sesión y usa tu configuración de notificaciones.',
    settings: 'Abrir configuración de notificaciones'
  }
} as const;

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; state?: string; lang?: string }> }) {
  const query = await searchParams;
  const spanish = query.lang === 'es';
  const copy = spanish ? COPY.es : COPY.en;
  const secret = unsubscribeSecret();
  const state = query.state === 'done' || query.state === 'invalid' || query.state === 'unavailable'
    ? query.state
    : !secret ? 'unavailable' : verifyUnsubscribeToken(query.token, secret) ? 'confirm' : 'invalid';

  const title = state === 'confirm' ? copy.confirmTitle : state === 'done' ? copy.doneTitle : state === 'invalid' ? copy.invalidTitle : copy.unavailableTitle;
  const body = state === 'confirm' ? copy.confirmBody : state === 'done' ? copy.doneBody : state === 'invalid' ? copy.invalidBody : copy.unavailableBody;

  return (
    <main className={styles.standalone} lang={spanish ? 'es-419' : 'en'} data-no-translate>
      <section className={styles.card} aria-labelledby="unsubscribe-title">
        <p className={styles.eyebrow}>{copy.eyebrow}</p>
        <h1 id="unsubscribe-title" className={styles.title}>{title}</h1>
        <p className={styles.lede} role={state === 'confirm' ? undefined : 'status'}>{body}</p>
        {state === 'confirm' && (
          <form method="post" action={`/api/notifications/unsubscribe?token=${encodeURIComponent(query.token ?? '')}`}>
            <input type="hidden" name="source" value="page" />
            {spanish && <input type="hidden" name="lang" value="es" />}
            <button className={styles.primaryButton} type="submit">{copy.button}</button>
          </form>
        )}
        {state !== 'confirm' && <p><a className={styles.textLink} href="/settings/notifications">{copy.settings}</a></p>}
      </section>
    </main>
  );
}
