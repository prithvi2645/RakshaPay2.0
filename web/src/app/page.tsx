import Link from 'next/link';

import { AlarmFatigue } from '@/components/AlarmFatigue';
import { CompanionBanner } from '@/components/CompanionBanner';
import { CorrectionDemo } from '@/components/CorrectionDemo';
import { LiveStatsStrip } from '@/components/LiveStatsStrip';
import { ParticleField } from '@/components/ParticleField';
import { PaymentStream } from '@/components/PaymentStream';
import { ScamAnatomy } from '@/components/ScamAnatomy';
import { ScanInterceptScene } from '@/components/ScanInterceptScene';
import { ChartIcon, CodeIcon, LinkIcon, LockIcon, PhoneIcon, QrIcon, ScaleIcon } from '@/components/icons';

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 opacity-30" aria-hidden>
          <PaymentStream />
        </div>
        {/* Keeps the headline readable over whatever the canvases are doing. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/55"
        />
        {/* Above the scrim on purpose: the particle links are the layer the
            cursor interacts with, so dimming them would defeat the effect. */}
        <div className="absolute inset-0" aria-hidden>
          <ParticleField />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:pb-24 lg:pt-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85 backdrop-blur">
              <LockIcon className="h-3.5 w-3.5" />
              The models run on your device, not on our servers
            </p>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-6xl">
              <span className="fade-up">UPI fraud is decided in the ten seconds</span>{' '}
              <span className="fade-up fade-up-1 text-[#FF8A8A]">before</span>{' '}
              <span className="fade-up fade-up-2">you tap pay.</span>
            </h1>

            <p className="fade-up fade-up-2 mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              RakshaPay puts a check into those ten seconds. On Android it does it for you — at the
              scanner, and on every payment message that arrives. Here, on any phone or laptop with
              nothing installed, you can check the same things by hand and get the same verdict.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/check"
                // The hero is dark in both themes, so this button stays literally
                // white with literally dark text rather than following the palette.
                className="btn rounded-xl bg-white px-5 py-3 text-ink shadow-lift hover:bg-white/90"
              >
                Check a payment
              </Link>
              <Link
                href="/how-it-works"
                className="btn rounded-xl border border-white/25 px-5 py-3 text-white hover:border-white/50"
              >
                See how it decides
              </Link>
            </div>

            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/45">
              <span>
                <span className="text-white/80">Green</span> passes the checkpoint
              </span>
              <span>
                <span className="text-[#FF8A8A]">Red</span> is stopped at it
              </span>
            </p>
          </div>

          <div className="hidden lg:flex lg:justify-center">
            <ScanInterceptScene />
          </div>
        </div>

        <div className="relative border-t border-white/10 bg-ink/60 backdrop-blur">
          <div className="mx-auto max-w-6xl px-5 py-8">
            <LiveStatsStrip dark />
          </div>
        </div>
      </section>

      <CompanionBanner />

      <section className="bg-ink px-5 pb-12 lg:hidden">
        <div className="mx-auto flex max-w-md justify-center">
          <ScanInterceptScene />
        </div>
      </section>

      <section className="border-y border-line/10 bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            One scam, four places to stop it
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            This is a real sequence, not a diagram. Each step is caught by a different layer,
            which is why removing any one of them leaves the chain intact.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
            <ScamAnatomy />

            <div className="lg:sticky lg:top-24">
              <h3 className="font-display text-lg font-bold">
                Watch the correction layer decide
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                The same words, two different senders. This is RakshaPay actually running in your
                browser, not a mock-up.
              </p>
              <div className="mt-4">
                <CorrectionDemo />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="max-w-3xl">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            One fraud problem, six people in it
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
            A scam QR does not only touch the person who scans it. Building for just that person is
            what leaves the rest of the problem unsolved, so each party below has a surface here.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Party
              Icon={QrIcon}
              who="The person mid-payment"
              gets="A verdict in about a second, with the reasons in plain language — on the web with nothing installed, or in the app, which can read the QR and the SMS for you."
              href="/check"
              cta="Check a payment"
            />
            <Party
              Icon={ScaleIcon}
              who="The merchant flagged wrongly"
              gets="A public appeal path with a reference code and a reviewed outcome. An upheld appeal clears the flag in the database and blocks it from re-activating."
              href="/merchant"
              cta="Appeal a flag"
            />
            <Party
              Icon={ChartIcon}
              who="The fraud analyst"
              gets="A live feed of active patterns, what they were reported for, and how fast they spread — plus the appeal numbers, so the error rate is visible too."
              href="/dashboard"
              cta="Open the feed"
            />
            <Party
              Icon={CodeIcon}
              who="A bank or UPI app"
              gets="A documented, CORS-open JSON API over the same confirmed patterns, so the intelligence can sit inside the payment flow that already exists."
              href="/developers"
              cta="Read the API"
            />
            <Party
              Icon={PhoneIcon}
              who="The family member watching over someone"
              gets="The Android app checks incoming payment messages on the phone itself and reads the warning aloud, slowly, in English, Hindi, Kannada or Marathi."
              href="/check"
              cta="Try a message check"
            />
            <Party
              Icon={LockIcon}
              who="Whoever has to trust all of this"
              gets="Three separate people must report a payee before anyone is warned about it, reports can never be read back, and only totals are ever published. Those limits are enforced by the database itself."
              href="/developers"
              cta="What that means for you"
            />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              A false alarm is a safety failure
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              A fraud tool that shouts at every bank alert trains people to swipe warnings away, and
              the one warning that mattered goes with them. So RakshaPay is built to stay quiet
              unless something is genuinely wrong.
            </p>

            <dl className="mt-6 space-y-4">
              <Rule term="A message that asks you for nothing is not an alarm">
                Promotions, delivery updates and ordinary bank alerts read a lot like scams. If
                nothing is being asked of you, RakshaPay will not tell you to panic about it.
              </Rule>
              <Rule term="Who sent it counts as much as what it says">
                A message from a registered business sender and the same words from a stranger&apos;s
                mobile number are not the same message, and RakshaPay does not treat them alike.
              </Rule>
              <Rule term="A calmly written scam is still a scam">
                Fraud does not always shout. If a message asks for a PIN, an OTP, a payment or
                access to your phone, polite wording will not get it past us.
              </Rule>
            </dl>

            <div className="mt-6">
              <AlarmFatigue />
            </div>
          </div>

          <div className="card">
            <h3 className="font-display text-lg font-bold">What a verdict is, and is not</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              RakshaPay gives you a read on a payee, a message or a link in about a second, together
              with the plain-language reasons behind it. You stay the one who decides.
            </p>
            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-muted">
              <li>
                <strong className="text-navy">It is guidance, not a guarantee.</strong> A clean
                result means nothing suspicious was found — not that a payment is certain to be
                safe.
              </li>
              <li>
                <strong className="text-navy">It never sees your accounts.</strong> RakshaPay does
                not connect to a bank, hold funds, or move money, and it cannot reverse a payment
                you have already made.
              </li>
              <li>
                <strong className="text-navy">It works without sending anything anywhere.</strong>{' '}
                What you check is examined on your own device, so it never becomes data we hold.
              </li>
            </ul>
            <p className="mt-4 rounded-xl border border-caution/25 bg-caution-bg px-4 py-3 text-sm leading-relaxed text-caution">
              <strong className="font-semibold">If you have already paid,</strong> speed matters
              more than anything else here — call <strong>1930</strong> and file at
              cybercrime.gov.in straight away.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * One card per party the problem touches.
 *
 * The whole card is the link when there is somewhere to go — a 40px text link
 * at the bottom of a card is a needlessly small target, and people click cards.
 * Where there is no destination the card renders as a plain div rather than a
 * dead link, so nothing looks clickable that is not.
 */
function Party({
  Icon,
  who,
  gets,
  href,
  cta,
}: {
  Icon: typeof QrIcon;
  who: string;
  gets: string;
  href?: string;
  cta?: string;
}) {
  const interactive = Boolean(href && cta);

  const body = (
    <>
      {/* Sheen sweeps across on hover. Pointer-events off so it never eats a click. */}
      {interactive && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-navy/[0.06] to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden"
        />
      )}

      <span
        className={`relative grid h-10 w-10 place-items-center rounded-xl bg-navy/8 text-navy transition-transform duration-300 ${
          interactive ? 'group-hover:-translate-y-0.5 group-hover:scale-105' : ''
        } motion-reduce:transform-none`}
      >
        <Icon className="h-5 w-5" />
      </span>

      <h3 className="relative mt-3.5 font-display text-base font-bold">{who}</h3>
      <p className="relative mt-2 flex-1 text-sm leading-relaxed text-muted">{gets}</p>

      {interactive && (
        <span className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-navy">
          {cta}
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none"
          >
            →
          </span>
        </span>
      )}
    </>
  );

  const shared =
    'card group relative flex flex-col overflow-hidden transition duration-300 motion-reduce:transition-none';

  if (!interactive) {
    return <div className={shared}>{body}</div>;
  }

  return (
    <Link
      href={href!}
      className={`${shared} hover:-translate-y-1 hover:border-navy/25 hover:shadow-lift focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-navy/15`}
    >
      {body}
    </Link>
  );
}

function Rule({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-navy/10 bg-surface px-4 py-3.5">
      <dt className="font-display text-sm font-bold">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-muted">{children}</dd>
    </div>
  );
}

function Metric({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="rounded-xl bg-canvas px-4 py-3.5">
      <p className="font-display text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1.5 text-xs font-semibold">{label}</p>
      <p className="mt-0.5 text-xs leading-snug text-muted">{note}</p>
    </div>
  );
}
