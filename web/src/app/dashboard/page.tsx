import type { Metadata } from 'next';

import { ThreatFeed } from '@/components/ThreatFeed';

export const metadata: Metadata = {
  title: 'Live threat feed',
  description:
    'Confirmed UPI scam patterns, what they were reported for, how fast they spread — and how often the system flagged the wrong payee.',
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Live threat feed
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Everything below is confirmed intelligence: a payee appears only after three separate
          devices have reported it independently. Nothing under that threshold is published
          anywhere, including here — otherwise anyone could watch what is being reported before the
          community has confirmed it, and the threshold would protect no one.
        </p>
      </div>

      <div className="mt-8">
        <ThreatFeed />
      </div>
    </div>
  );
}
