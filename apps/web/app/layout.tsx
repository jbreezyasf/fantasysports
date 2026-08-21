import type { Metadata } from 'next';
import './globals.css';
import './brand.css';
import './dashboard.css';
import './gate5.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://bigexecfs.com'),
  title: {
    default: 'Big Exec Fantasy Sports',
    template: '%s | Big Exec'
  },
  description: 'Run the franchise. Own the season. Multi-sport fantasy competition built around persistent franchises, rivalries, live scoring and league legacy.',
  applicationName: 'Big Exec Fantasy Sports',
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
      <body>{children}</body>
    </html>
  );
}
