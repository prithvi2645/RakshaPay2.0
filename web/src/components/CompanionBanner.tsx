import Link from 'next/link';

import { CheckIcon, PhoneIcon, QrIcon } from './icons';

/**
 * The website is the app's second door, not a second product.
 *
 * Without saying so plainly, a visitor reasonably concludes the site replaces
 * the app — the manual check looks like the whole thing. It does not: the app
 * protects you without being asked, and the site is the fallback for a phone
 * that does not have it and the only possible entry for a flagged merchant, a
 * bank, or an analyst.
 *
 * The claim that they are one system is deliberately checkable rather than
 * asserted: same trained files, same community database, same verdict.
 */

const ONLY_THE_APP = [
  'Reads the QR at your camera, before you ever open a payment app',
  'Checks a payment SMS the moment it arrives, without you doing anything',
  'Speaks the warning aloud, slowly, in English, Hindi, Kannada or Marathi',
  'Keeps working with no signal at all',
];

export function CompanionBanner() {
  return (
    <section className="border-y border-line/10 bg-surface/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-navy/8 px-3.5 py-1.5 text-xs font-semibold text-navy">
              <PhoneIcon className="h-3.5 w-3.5" />
              One engine, four doors
            </p>

            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
              This page is the app&apos;s second door
            </h2>

            <p className="mt-3 text-base leading-relaxed text-muted">
              What you just used is the same RakshaPay that runs on the phone — not a
              lighter version of it, and not a different product. The verdict you get here
              and the verdict the app gives are produced by the same files and cannot
              disagree.
            </p>

            <p className="mt-3 text-base leading-relaxed text-muted">
              The difference is when it happens. Here, you have to think to check something.
              On the phone, it checks for you.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/check" className="btn-primary">
                Check something now
              </Link>
              <Link href="/dashboard" className="btn-ghost">
                See what people are reporting
              </Link>
            </div>
          </div>

          <div className="card">
            <h3 className="flex items-center gap-2 font-display text-lg font-bold">
              <QrIcon className="h-5 w-5 text-navy/60" />
              What only the phone can do
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A browser tab cannot reach your camera at the moment you scan, or your messages
              as they arrive. That is the whole reason the app exists.
            </p>

            <ul className="mt-4 space-y-2.5">
              {ONLY_THE_APP.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-safe" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-5 rounded-xl bg-canvas px-4 py-3 text-xs leading-relaxed text-muted">
              Android only. Reading a payment SMS and intercepting a scan need permissions
              iOS does not grant to any app — so on iPhone and on a desktop, this page is the
              whole of RakshaPay, and it is why it exists.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
