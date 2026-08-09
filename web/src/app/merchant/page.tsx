import type { Metadata } from 'next';

import { MerchantConsole } from '@/components/MerchantConsole';

export const metadata: Metadata = {
  title: 'Flagged wrongly? Appeal it',
  description:
    'Check whether your UPI ID is on the confirmed-scam list, and file an appeal if it is there unfairly.',
};

export default function MerchantPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <div className="max-w-2xl">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          If we flagged you and we were wrong
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Any system that flags people will sometimes flag the wrong person, and for a small
          business a wrongly flagged UPI ID is lost income for as long as the flag stands. So the
          way out is built into the same database as the way in — not a support address that may or
          may not be read.
        </p>
      </div>

      <div className="mt-8">
        <MerchantConsole />
      </div>

      <section className="card mt-8">
        <h2 className="font-display text-lg font-bold">How a flag happens in the first place</h2>
        <ol className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
          <li>
            <strong className="font-semibold text-navy">Three separate people, three separate devices.</strong>{' '}
            One report does nothing. The database enforces one report per payee per device with a
            unique constraint, so the same person cannot report you three times — not even with a
            modified app.
          </li>
          <li>
            <strong className="font-semibold text-navy">Nothing below the threshold is published.</strong>{' '}
            Until three reports exist, your UPI ID is invisible to every client, the feed, and the
            API.
          </li>
          <li>
            <strong className="font-semibold text-navy">An upheld appeal is permanent.</strong> It
            clears the flag and marks the pattern overturned, so later reports cannot quietly
            re-activate it.
          </li>
        </ol>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          A structural warning is different from a flag. If the checker calls your UPI ID unusual
          without it being on this list, that is the model reacting to the shape of the ID — a long
          random-looking local part, an unrecognised handle — and no report exists against you.
        </p>
      </section>
    </div>
  );
}
