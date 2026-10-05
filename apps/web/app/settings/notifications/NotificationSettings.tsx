'use client';

import React, { useActionState, useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from '../../components/LocaleProvider';
import { SHOW_INSTALL_PROMPT_EVENT } from '../../components/PwaInstallPrompt';
import { announceToScreenReader } from '../../components/ScreenReaderAnnouncer';
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPreferences } from '../../../lib/notifications/preferences';
import type { PreferencesFormState } from './actions';
import { N } from './strings';
import styles from './notifications.module.css';


export type PushDevice = { id: string; userAgent: string | null; createdAt: string; lastSuccessAt: string | null };

type SaveAction = (previous: PreferencesFormState, formData: FormData) => Promise<PreferencesFormState>;

export type NotificationSettingsProps = {
  preferences: NotificationPreferences;
  devices: PushDevice[];
  // Null when push is not configured on the server.
  vapidPublicKey: string | null;
  saveAction: SaveAction;
};

// Categories that something actually sends today. The rest are stored for later.
const LIVE_CATEGORIES: ReadonlySet<NotificationCategory> = new Set(['league_announcements']);

type DeviceState = 'checking' | 'unsupported' | 'not_configured' | 'needs_install' | 'blocked' | 'off' | 'on';

export function urlBase64ToUint8Array(value: string) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export function describeUserAgent(userAgent: string | null, fallback: string) {
  if (!userAgent) return fallback;
  const device = /iphone/i.test(userAgent) ? 'iPhone' : /ipad/i.test(userAgent) ? 'iPad' : /android/i.test(userAgent) ? 'Android' : /windows/i.test(userAgent) ? 'Windows' : /mac os x|macintosh/i.test(userAgent) ? 'Mac' : /linux/i.test(userAgent) ? 'Linux' : '';
  const browser = /edg\//i.test(userAgent) ? 'Edge' : /firefox|fxios/i.test(userAgent) ? 'Firefox' : /chrome|crios/i.test(userAgent) ? 'Chrome' : /safari/i.test(userAgent) ? 'Safari' : fallback;
  return device ? `${browser} · ${device}` : browser;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

async function serviceWorkerRegistration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js');
}

const DEVICE_STATUS: Record<DeviceState, string> = {
  checking: N.deviceChecking,
  unsupported: N.deviceUnsupported,
  not_configured: N.deviceNotConfigured,
  needs_install: N.iosNeedsInstall,
  blocked: N.deviceBlocked,
  off: N.deviceOff,
  on: N.deviceOn
};

export default function NotificationSettings({ preferences, devices, vapidPublicKey, saveAction }: NotificationSettingsProps) {
  const { t, locale } = useLocale();
  const [formState, formAction, pending] = useActionState<PreferencesFormState, FormData>(saveAction, { status: 'idle', message: '', stamp: 0 });
  const [pushEnabled, setPushEnabled] = useState(preferences.pushEnabled);
  const [deviceState, setDeviceState] = useState<DeviceState>('checking');
  const [deviceMessage, setDeviceMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const announcedStamp = useRef(0);

  // Announce the result of saving through the app's shared live region.
  useEffect(() => {
    if (!formState.stamp || announcedStamp.current === formState.stamp) return;
    announcedStamp.current = formState.stamp;
    announceToScreenReader({ message: t(formState.message), priority: formState.status === 'error' ? 'assertive' : 'polite', key: 'notification-preferences' });
  }, [formState, t]);

  // Reads the current state only. Nothing here can open a permission prompt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!vapidPublicKey) return 'not_configured' as const;
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) return isIos() && !isStandalone() ? 'needs_install' as const : 'unsupported' as const;
      if (isIos() && !isStandalone()) return 'needs_install' as const;
      if (Notification.permission === 'denied') return 'blocked' as const;
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      return subscription && Notification.permission === 'granted' ? 'on' as const : 'off' as const;
    })().then(state => { if (!cancelled) setDeviceState(state); }).catch(() => { if (!cancelled) setDeviceState('off'); });
    return () => { cancelled = true; };
  }, [vapidPublicKey]);

  const report = useCallback((text: string, error = false) => {
    setDeviceMessage({ text, error });
    announceToScreenReader({ message: t(text), priority: error ? 'assertive' : 'polite', key: 'push-device' });
  }, [t]);

  // Runs only from the button's click handler: the one place a permission prompt can start.
  const turnOn = async () => {
    if (!vapidPublicKey || busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setDeviceState(permission === 'denied' ? 'blocked' : 'off');
        report(N.permissionDenied, true);
        return;
      }
      const registration = await serviceWorkerRegistration();
      await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription())
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const response = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) {
        await subscription.unsubscribe().catch(() => undefined);
        report(response.status === 429 ? N.rateLimited : response.status === 503 ? N.deviceNotConfigured : N.pushError, true);
        return;
      }
      setDeviceState('on');
      setPushEnabled(true);
      report(N.turnedOn);
    } catch {
      report(N.pushError, true);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        const response = await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (response.status === 429) { report(N.rateLimited, true); return; }
        await subscription.unsubscribe();
      }
      setDeviceState('off');
      report(N.turnedOff);
    } catch {
      report(N.pushError, true);
    } finally {
      setBusy(false);
    }
  };

  const showInstall = () => {
    window.dispatchEvent(new CustomEvent(SHOW_INSTALL_PROMPT_EVENT));
    report(N.installShown);
  };

  const dateFormat = new Intl.DateTimeFormat(locale === 'es-419' ? 'es' : 'en', { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <div className={styles.stack}>
      <form action={formAction} className={styles.card} aria-labelledby="notification-preferences-title">
        <h2 id="notification-preferences-title" className={styles.cardTitle}>{t(N.preferencesTitle)}</h2>

        <fieldset className={styles.group}>
          <legend>{t(N.channelsLegend)}</legend>
          <div className={styles.option}>
            <input id="pref-email" name="email_enabled" type="checkbox" defaultChecked={preferences.emailEnabled} aria-describedby="pref-email-hint" />
            <div><label htmlFor="pref-email">{t(N.emailLabel)}</label><p id="pref-email-hint" className={styles.hint}>{t(N.emailHint)}</p></div>
          </div>
          <div className={styles.option}>
            <input id="pref-push" name="push_enabled" type="checkbox" checked={pushEnabled} onChange={event => setPushEnabled(event.target.checked)} aria-describedby="pref-push-hint" />
            <div><label htmlFor="pref-push">{t(N.pushLabel)}</label><p id="pref-push-hint" className={styles.hint}>{t(N.pushHint)}</p></div>
          </div>
        </fieldset>

        <fieldset className={styles.group} aria-describedby="pref-categories-hint">
          <legend>{t(N.categoriesLegend)}</legend>
          <p id="pref-categories-hint" className={styles.hint}>{t(N.categoriesHint)}</p>
          {NOTIFICATION_CATEGORIES.map(category => {
            const live = LIVE_CATEGORIES.has(category);
            const hint = live ? N.cat_league_announcements_hint : N.notSendingYet;
            return (
              <div className={styles.option} key={category}>
                <input id={`pref-${category}`} name={`category_${category}`} type="checkbox" defaultChecked={preferences.categories[category]} aria-describedby={`pref-${category}-hint`} />
                <div><label htmlFor={`pref-${category}`}>{t(N[`cat_${category}`])}</label><p id={`pref-${category}-hint`} className={styles.hint}>{t(hint)}</p></div>
              </div>
            );
          })}
        </fieldset>

        <div className={styles.field}>
          <label htmlFor="pref-locale">{t(N.languageLabel)}</label>
          <select id="pref-locale" name="locale" defaultValue={preferences.locale}>
            <option value="en">{t(N.languageEnglish)}</option>
            <option value="es-419">{t(N.languageSpanish)}</option>
          </select>
        </div>

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit" aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }}>{pending ? t(N.saving) : t(N.save)}</button>
          {formState.status !== 'idle' && !pending && <p className={formState.status === 'error' ? styles.error : styles.success}>{t(formState.message)}</p>}
        </div>
      </form>

      <section className={styles.card} aria-labelledby="push-device-title">
        <h2 id="push-device-title" className={styles.cardTitle}>{t(N.deviceTitle)}</h2>
        <p className={styles.hint}>{t(N.deviceIntro)}</p>
        <p className={styles.deviceStatus} data-state={deviceState}>{t(DEVICE_STATUS[deviceState])}</p>
        <div className={styles.actions}>
          {deviceState === 'off' && <button className={styles.primaryButton} type="button" onClick={turnOn} aria-disabled={busy}>{busy ? t(N.working) : t(N.turnOn)}</button>}
          {deviceState === 'on' && <button className={styles.secondaryButton} type="button" onClick={turnOff} aria-disabled={busy}>{busy ? t(N.working) : t(N.turnOff)}</button>}
          {deviceMessage && <p className={deviceMessage.error ? styles.error : styles.success}>{t(deviceMessage.text)}</p>}
        </div>

        <div className={styles.note}>
          <h3>{t(N.iosTitle)}</h3>
          <p>{t(N.iosBody)}</p>
          <button className={styles.secondaryButton} type="button" onClick={showInstall}>{t(N.showInstall)}</button>
        </div>

        <h3 className={styles.listTitle}>{t(N.devicesTitle)}</h3>
        {devices.length ? (
          <ul className={styles.devices}>
            {devices.map(device => (
              <li key={device.id}>
                <strong data-no-translate>{describeUserAgent(device.userAgent, t(N.deviceUnknown))}</strong>
                <span>{t(N.deviceAdded)} <time dateTime={device.createdAt}>{dateFormat.format(new Date(device.createdAt))}</time></span>
                <span>{device.lastSuccessAt ? <>{t(N.deviceLastDelivered)} <time dateTime={device.lastSuccessAt}>{dateFormat.format(new Date(device.lastSuccessAt))}</time></> : t(N.deviceNeverDelivered)}</span>
              </li>
            ))}
          </ul>
        ) : <p className={styles.hint}>{t(N.devicesNone)}</p>}
      </section>
    </div>
  );
}
