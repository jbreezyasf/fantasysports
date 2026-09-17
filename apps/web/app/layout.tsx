import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
import './brand-polish.css';
import './dashboard.css';
import './gate5.css';
import './mobile-nav.css';
import './forms-gate5.css';
import './stadium-gate5.css';
import './ops.css';
import './product-shell.css';
import ScreenReaderAnnouncer from './components/ScreenReaderAnnouncer';
import PwaInstallPrompt from './components/PwaInstallPrompt';
import { LanguageToggle, LocaleProvider } from './components/LocaleProvider';

export const metadata: Metadata = {
  metadataBase: new URL('https://bigexecfs.com'),
  title: {
    default: 'Big Exec Fantasy Sports',
    template: '%s | Big Exec'
  },
  description: 'Run the franchise. Own the season. Multi-sport fantasy competition built around persistent franchises, rivalries, live scoring and league legacy.',
  applicationName: 'Big Exec Fantasy Sports',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Big Exec',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Big Exec Fantasy Sports',
    description: 'Run the franchise. Own the season.',
    siteName: 'Big Exec Fantasy Sports',
    type: 'website'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          <ScreenReaderAnnouncer />
          {children}
          <PwaInstallPrompt />
          <LanguageToggle />
        </LocaleProvider>
      </body>
    </html>
  );
}
