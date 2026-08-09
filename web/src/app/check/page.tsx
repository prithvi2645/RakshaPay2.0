import type { Metadata } from 'next';

import { Checker } from '@/components/Checker';
import { LockIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Check a payment',
  description:
    'Paste a UPI ID, a payment QR or a suspicious message and get a risk verdict. Both models run in your browser — nothing you check is uploaded.',
};

export default function CheckPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          No app on this phone? Check it here
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Check it before you pay
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          No app, no account, no upload. Everything below happens inside this browser tab, so the
          thing you are worried about never becomes data we hold — and it is the same RakshaPay
          that runs on the phone, giving the same verdict.
        </p>
        <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-safe-bg px-3.5 py-1.5 text-xs font-semibold text-safe">
          <LockIcon className="h-3.5 w-3.5" />
          Checked on your device · nothing you paste is sent anywhere
        </p>
      </div>

      <div className="mt-8">
        <Checker />
      </div>
    </div>
  );
}
