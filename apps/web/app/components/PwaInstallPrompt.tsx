'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useLocale } from './LocaleProvider';

const DISMISSED_KEY = 'big-exec-pwa-install-dismissed';
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

type InstallChoice = { outcome: 'accepted' | 'dismissed'; platform: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

export function isInstallPromptDismissed(value: string | null, now = Date.now()) {
  if (!value) return false;
  const dismissedAt = Number(value);
  return Number.isFinite(dismissedAt) && now - dismissedAt < DISMISS_FOR_MS;
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function PwaInstallPrompt() {
  const { t } = useLocale();
  const pathname = usePathname();
  const gameplayRoute = Boolean(pathname && (pathname.startsWith('/matchups/') || pathname.startsWith('/drafts/') || pathname.includes('/team')));
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(error => {
        console.error('[pwa] Service worker registration failed', error);
      });
    }

    if (isStandalone() || isInstallPromptDismissed(localStorage.getItem(DISMISSED_KEY))) return;

    if (isIosBrowser()) {
      setShowIosHelp(true);
      setVisible(true);
    }

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const installed = () => {
      localStorage.removeItem(DISMISSED_KEY);
      setVisible(false);
      setInstallEvent(null);
    };

    window.addEventListener('beforeinstallprompt', capturePrompt);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
    setInstallEvent(null);
  };

  if (!visible || gameplayRoute || (!installEvent && !showIosHelp)) return null;

  return (
    <aside className="pwaInstallPrompt" aria-labelledby="pwa-install-title" aria-live="polite">
      <Image src="/icons/icon-192.png" width={54} height={54} alt="" />
      <div className="pwaInstallCopy">
        <strong id="pwa-install-title">{t('Install Big Exec')}</strong>
        <p>{showIosHelp
          ? t('Tap Share, then choose Add to Home Screen.')
          : t('Add Big Exec to your home screen for faster game-day access.')}</p>
      </div>
      <div className="pwaInstallActions">
        {installEvent && <button className="primary" type="button" onClick={install}>{t('Install app')}</button>}
        <button className="secondary" type="button" onClick={dismiss} aria-label={t('Not now')}>{t('Not now')}</button>
      </div>
    </aside>
  );
}
