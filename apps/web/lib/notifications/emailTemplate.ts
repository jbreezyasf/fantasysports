import { bodyToHtml, bodyToText, escapeHtml } from './format';
import type { AnnouncementContent } from './announcements';
import type { NotificationLocale } from './preferences';

// League-notice email: an HTML part and a plain-text part with the same content.
//
// Accessibility: `lang` on <html>, one <h1>, real <h2>/<ul> from the body, layout tables marked
// role="presentation", descriptive link text, text sizes of 14px and up, and colour pairs that
// all exceed 4.5:1 (checked in emailTemplate.test.ts). The only image is the Big Exec wordmark,
// with alt text, so the message reads the same with images off. No team or league logos.

const COPY = {
  en: {
    eyebrow: 'LEAGUE NOTICE',
    open: 'Open your league in Big Exec',
    fallback: 'If the button does not work, copy this link into your browser:',
    reason: (league: string) => `You are receiving this league notice because you are a member of ${league} on Big Exec Fantasy Sports.`,
    sender: 'Sent by Big Exec Fantasy Sports.',
    unsubscribe: 'Unsubscribe from league emails',
    unsubscribeNote: 'Unsubscribing stops league notices. Password-reset and other account security emails are not affected.',
    settings: 'Choose which notifications you get',
    tagline: 'RUN THE FRANCHISE. OWN THE SEASON.'
  },
  'es-419': {
    eyebrow: 'AVISO DE LA LIGA',
    open: 'Abre tu liga en Big Exec',
    fallback: 'Si el botón no funciona, copia este enlace en tu navegador:',
    reason: (league: string) => `Recibes este aviso porque eres integrante de ${league} en Big Exec Fantasy Sports.`,
    sender: 'Enviado por Big Exec Fantasy Sports.',
    unsubscribe: 'Cancelar la suscripción a los correos de la liga',
    unsubscribeNote: 'Al cancelar dejas de recibir avisos de la liga. Los correos de restablecimiento de contraseña y de seguridad de la cuenta no cambian.',
    settings: 'Elige qué notificaciones recibes',
    tagline: 'DIRIGE LA FRANQUICIA. DOMINA LA TEMPORADA.'
  }
} as const;

export const EMAIL_COLORS = {
  page: '#030405',
  card: '#0a0c10',
  footer: '#060709',
  heading: '#f7f4ed',
  body: '#d6d2c8',
  muted: '#b5b2a9',
  gold: '#f0c24b',
  buttonBackground: '#e0aa2e',
  buttonText: '#070707'
} as const;

const C = EMAIL_COLORS;
const FONT = 'Arial,Helvetica,sans-serif';

export type AnnouncementEmailInput = {
  content: AnnouncementContent;
  locale: NotificationLocale;
  leagueName: string;
  appUrl: string;
  // Absolute URL the main button opens, or null for no button.
  linkUrl: string | null;
  unsubscribeUrl: string;
  postalAddress?: string | null;
  // Marks an operator's test send in the subject and at the top of the message.
  test?: boolean;
};

export function renderAnnouncementEmail(input: AnnouncementEmailInput) {
  const copy = COPY[input.locale];
  const base = input.appUrl.replace(/\/+$/, '');
  const settingsUrl = `${base}/settings/notifications`;
  const subject = `${input.test ? '[TEST] ' : ''}${input.content.title}`;
  const postal = input.postalAddress?.trim() || null;
  const link = `color:${C.gold};text-decoration:underline`;

  const bodyHtml = bodyToHtml(input.content.body, {
    heading: `font-family:${FONT};font-size:20px;line-height:1.3;margin:28px 0 10px;color:${C.heading}`,
    paragraph: `font-family:${FONT};font-size:16px;line-height:1.6;margin:0 0 14px;color:${C.body}`,
    list: `font-family:${FONT};font-size:16px;line-height:1.6;margin:0 0 14px;padding:0 0 0 22px;color:${C.body}`,
    item: 'margin:0 0 8px',
    strong: `color:${C.heading}`
  });

  const button = input.linkUrl
    ? `<p style="margin:30px 0 8px"><a href="${escapeHtml(input.linkUrl)}" style="display:inline-block;background:${C.buttonBackground};color:${C.buttonText};font-family:${FONT};font-size:15px;font-weight:bold;text-decoration:none;padding:15px 22px;border:1px solid #ffdb71">${escapeHtml(copy.open)}</a></p>`
      + `<p style="font-family:${FONT};font-size:14px;line-height:1.6;margin:14px 0 0;color:${C.muted}">${escapeHtml(copy.fallback)}<br><span style="word-break:break-all">${escapeHtml(input.linkUrl)}</span></p>`
    : '';

  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHtml(subject)}</title></head>`
    + `<body style="margin:0;background:${C.page};color:${C.body};font-family:${FONT}">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border:1px solid #5a451b;background:${C.card}">`
    + `<tr><td style="height:6px;background:#d8a62c;font-size:0;line-height:0">&nbsp;</td></tr>`
    + `<tr><td align="center" style="padding:24px 24px 20px;border-bottom:1px solid #332b1c"><img src="${escapeHtml(base)}/brand/big-exec-approved-wordmark-v1.png" width="300" alt="Big Exec Fantasy Sports" style="display:block;width:100%;max-width:300px;height:auto;color:${C.heading};font-family:${FONT};font-size:20px;font-weight:bold"></td></tr>`
    + `<tr><td style="padding:32px 24px 30px">`
    + `<p style="font-family:${FONT};font-size:14px;font-weight:bold;letter-spacing:1.5px;margin:0 0 14px;color:${C.gold}">${input.test ? 'TEST · ' : ''}${escapeHtml(copy.eyebrow)} · ${escapeHtml(input.leagueName)}</p>`
    + `<h1 style="font-family:${FONT};font-size:28px;line-height:1.15;margin:0 0 20px;color:${C.heading}">${escapeHtml(input.content.title)}</h1>`
    + bodyHtml + button
    + `</td></tr>`
    + `<tr><td style="padding:22px 24px;border-top:1px solid #332b1c;background:${C.footer};font-family:${FONT};font-size:14px;line-height:1.6;color:${C.muted}">`
    + `<p style="margin:0 0 12px;font-weight:bold;letter-spacing:1px;color:${C.gold}">${escapeHtml(copy.tagline)}</p>`
    + `<p style="margin:0 0 12px">${escapeHtml(copy.reason(input.leagueName))}</p>`
    + `<p style="margin:0 0 12px">${escapeHtml(copy.sender)}${postal ? `<br>${escapeHtml(postal)}` : ''}</p>`
    + `<p style="margin:0 0 12px"><a href="${escapeHtml(input.unsubscribeUrl)}" style="${link}">${escapeHtml(copy.unsubscribe)}</a> &nbsp;|&nbsp; <a href="${escapeHtml(settingsUrl)}" style="${link}">${escapeHtml(copy.settings)}</a></p>`
    + `<p style="margin:0">${escapeHtml(copy.unsubscribeNote)}</p>`
    + `</td></tr></table></td></tr></table></body></html>`;

  const text = [
    'BIG EXEC FANTASY SPORTS',
    `${input.test ? 'TEST - ' : ''}${copy.eyebrow} - ${input.leagueName}`,
    input.content.title.toUpperCase(),
    bodyToText(input.content.body),
    ...(input.linkUrl ? [`${copy.open}: ${input.linkUrl}`] : []),
    '--',
    copy.reason(input.leagueName),
    postal ? `${copy.sender}\n${postal}` : copy.sender,
    `${copy.unsubscribe}: ${input.unsubscribeUrl}`,
    `${copy.settings}: ${settingsUrl}`,
    copy.unsubscribeNote
  ].join('\n\n');

  return { subject, html, text };
}
