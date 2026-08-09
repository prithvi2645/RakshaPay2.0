import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';

import { CursorGlow } from '@/components/CursorGlow';
import { ParticleField } from '@/components/ParticleField';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'RakshaPay — check a UPI payment before you pay',
    template: '%s · RakshaPay',
  },
  description:
    'Paste a UPI ID, a payment QR or a suspicious SMS and get a risk verdict in your browser. The models run on your device — nothing you check is uploaded.',
  openGraph: {
    title: 'RakshaPay — check a UPI payment before you pay',
    description:
      'On-device UPI fraud checks, a community scam database with a reporting threshold, and an open threat-intel API.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Runs before first paint so dark-mode users never see a light flash.
          It has to be inline and blocking — doing this in a component would
          run after hydration, which is exactly one frame too late.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('rakshapay-theme');var d=s?s==='dark':matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col font-sans">
        {/*
          One background for the entire site, not just the landing page. It is
          fixed, so it stays put while content scrolls over it, and every page's
          surfaces are translucent enough to let it through. Sits behind
          everything at z-0; the header, content and footer are all above it.
        */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <ParticleField />
        </div>
        <CursorGlow />

        <SiteHeader />
        <main className="relative z-10 flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
